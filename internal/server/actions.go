package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"letts/pkg/lettsclient"
)

// bulkChunkSize caps the number of ids sent to a single dugdale bulk request.
// Larger client-side batches are split into multiple upstream calls and their
// results concatenated.
const bulkChunkSize = 1000

// maxMutationBodyBytes caps the size of a decoded mutation request body
// (bulk {items:[...]} and kill {signal}) to bound memory on a hostile or
// runaway client. Bodies over the cap are rejected with 413.
const maxMutationBodyBytes = 4 << 20 // 4 MiB

// registerActionRoutes registers the CSRF-guarded control actions. The csrf
// middleware (applied in Handler) rejects any of these without a matching
// token, so the handlers themselves assume the request is authorized.
func (s *Server) registerActionRoutes(mux *http.ServeMux) {
	mux.HandleFunc("POST /api/missions/{host}/{id}/restart", s.handleRestart)
	mux.HandleFunc("POST /api/missions/{host}/{id}/kill", s.handleKill)
	mux.HandleFunc("DELETE /api/missions/{host}/{id}", s.handleDelete)
	mux.HandleFunc("POST /api/missions/bulk-restart", s.handleBulkRestart)
	mux.HandleFunc("POST /api/missions/bulk-delete", s.handleBulkDelete)
}

// clientForHost resolves the fan-out client for {host}, writing a 404 and
// returning ok=false when the host is unknown or unmanaged.
func (s *Server) clientForHost(w http.ResponseWriter, host string) (*lettsclient.Client, bool) {
	c, ok := s.agg.ClientFor(host)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"error":   "not_found",
			"message": "unknown or unmanaged host",
		})
		return nil, false
	}
	return c, true
}

// handleRestart restarts one mission. On success the dugdale returns the new
// mission id; we relay its 201 body and bust the read cache.
func (s *Server) handleRestart(w http.ResponseWriter, r *http.Request) {
	c, ok := s.clientForHost(w, r.PathValue("host"))
	if !ok {
		return
	}
	resp, err := lettsclient.RestartMission(c, r.PathValue("id"))
	if err != nil {
		writeAPIError(w, err)
		return
	}
	s.agg.InvalidateAll()
	writeJSON(w, http.StatusCreated, resp)
}

// killRequest is the optional kill body: {"signal":"TERM"}. Absent/empty signal
// defaults to TERM (handled by lettsclient).
type killRequest struct {
	Signal string `json:"signal"`
}

// handleKill sends a (advisory) signal to a running mission. Success is 204 No
// Content — the dugdale returns no body and there is nothing useful to relay.
func (s *Server) handleKill(w http.ResponseWriter, r *http.Request) {
	c, ok := s.clientForHost(w, r.PathValue("host"))
	if !ok {
		return
	}
	var req killRequest
	// Body is optional; an empty/absent or malformed non-empty body just falls
	// back to the default signal. An OVERSIZE body, however, is rejected (413)
	// rather than silently proceeding.
	if r.Body != nil {
		r.Body = http.MaxBytesReader(w, r.Body, maxMutationBodyBytes)
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			if errors.As(err, new(*http.MaxBytesError)) {
				writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{
					"error":   "payload_too_large",
					"message": "request body too large",
				})
				return
			}
			// malformed/empty body → keep req.Signal = "" (default TERM).
		}
	}
	if err := lettsclient.KillMission(c, r.PathValue("id"), req.Signal); err != nil {
		writeAPIError(w, err)
		return
	}
	s.agg.InvalidateAll()
	w.WriteHeader(http.StatusNoContent)
}

// handleDelete deletes one mission. ?force=true is required upstream to delete a
// running mission; we pass it through. Success is 202 (deletion is async on the
// dugdale: the row goes to status='deleting' until reaped).
func (s *Server) handleDelete(w http.ResponseWriter, r *http.Request) {
	c, ok := s.clientForHost(w, r.PathValue("host"))
	if !ok {
		return
	}
	force := r.URL.Query().Get("force") == "true"
	if err := lettsclient.DeleteMission(c, r.PathValue("id"), force); err != nil {
		writeAPIError(w, err)
		return
	}
	s.agg.InvalidateAll()
	writeJSON(w, http.StatusAccepted, map[string]any{"status": "deletion_pending"})
}

// bulkItem identifies one mission for a bulk action.
type bulkItem struct {
	Host string `json:"host"`
	ID   string `json:"id"`
}

// bulkRequest is the body of bulk-restart/bulk-delete: a flat list of
// host-qualified mission ids, plus an optional force flag (delete only).
type bulkRequest struct {
	Items []bulkItem `json:"items"`
	Force bool       `json:"force"`
}

// bulkResult is one per-id outcome tagged with the host it ran on — mission ids
// are only unique per host, so the host is part of the result's identity.
type bulkResult struct {
	Host string `json:"host"`
	lettsclient.BulkResult
}

// bulkResponse is the merged result returned to the client.
type bulkResponse struct {
	Results []bulkResult `json:"results"`
}

// handleBulkRestart groups items by host, fans out BulkRestart per host (chunked
// to ≤1000 ids), and concatenates every per-id result into one response.
func (s *Server) handleBulkRestart(w http.ResponseWriter, r *http.Request) {
	s.handleBulk(w, r, func(c *lettsclient.Client, ids []string, _ bool) (*lettsclient.BulkResponse, error) {
		return lettsclient.BulkRestart(c, ids)
	})
}

// handleBulkDelete is handleBulkRestart's sibling: it threads the body's force
// flag through to BulkDelete.
func (s *Server) handleBulkDelete(w http.ResponseWriter, r *http.Request) {
	s.handleBulk(w, r, func(c *lettsclient.Client, ids []string, force bool) (*lettsclient.BulkResponse, error) {
		return lettsclient.BulkDelete(c, ids, force)
	})
}

// handleBulk is the shared bulk driver. It decodes the request, groups ids by
// host (preserving first-seen host order for deterministic output), and for each
// host calls the per-host bulk op in ≤1000-id chunks. A whole-host failure (e.g.
// the dugdale is down, or the host is unmanaged) is recorded as a per-id error
// for every id of that host rather than failing the entire request. The read
// cache is busted once at the end.
func (s *Server) handleBulk(w http.ResponseWriter, r *http.Request, op func(c *lettsclient.Client, ids []string, force bool) (*lettsclient.BulkResponse, error)) {
	r.Body = http.MaxBytesReader(w, r.Body, maxMutationBodyBytes)
	var req bulkRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		if errors.As(err, new(*http.MaxBytesError)) {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]any{
				"error":   "payload_too_large",
				"message": "request body too large",
			})
			return
		}
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error":   "invalid_request",
			"message": "malformed JSON body",
		})
		return
	}

	// Group ids by host, keeping host encounter order stable.
	var order []string
	byHost := map[string][]string{}
	for _, it := range req.Items {
		if _, seen := byHost[it.Host]; !seen {
			order = append(order, it.Host)
		}
		byHost[it.Host] = append(byHost[it.Host], it.ID)
	}

	merged := []bulkResult{} // non-nil: serialized as "results": [], never null
	for _, host := range order {
		ids := byHost[host]
		c, ok := s.agg.ClientFor(host)
		if !ok {
			merged = append(merged, hostErrorResults(host, ids, "unknown or unmanaged host")...)
			continue
		}
		for _, chunk := range chunkIDs(ids, bulkChunkSize) {
			resp, err := op(c, chunk, req.Force)
			if err != nil {
				merged = append(merged, hostErrorResults(host, chunk, err.Error())...)
				continue
			}
			for _, res := range resp.Results {
				merged = append(merged, bulkResult{Host: host, BulkResult: res})
			}
		}
	}

	s.agg.InvalidateAll()
	writeJSON(w, http.StatusOK, bulkResponse{Results: merged})
}

// hostErrorResults turns a whole-host (or whole-chunk) failure into one failed
// result per id, so callers always get a result row for every id they sent.
func hostErrorResults(host string, ids []string, msg string) []bulkResult {
	out := make([]bulkResult, 0, len(ids))
	for _, id := range ids {
		out = append(out, bulkResult{Host: host, BulkResult: lettsclient.BulkResult{ID: id, OK: false, Error: msg}})
	}
	return out
}

// chunkIDs splits ids into slices of at most size elements (size>0). Returns the
// input as a single chunk when it already fits.
func chunkIDs(ids []string, size int) [][]string {
	if len(ids) <= size {
		return [][]string{ids}
	}
	var chunks [][]string
	for len(ids) > size {
		chunks = append(chunks, ids[:size])
		ids = ids[size:]
	}
	if len(ids) > 0 {
		chunks = append(chunks, ids)
	}
	return chunks
}
