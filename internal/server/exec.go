package server

import (
	"net/http"
	"strconv"

	"arby/internal/aggregator"
)

// registerExecRoutes wires the exec read routes plus the staging
// download proxy. The group route is registered BEFORE the detail route so a
// path like /api/exec/groups/g1 matches the group handler rather than detail
// with host="groups" — Go 1.22+ patterns disambiguate by specificity, but the
// ordering is kept explicit (and covered by a test) to be unambiguous.
func (s *Server) registerExecRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/exec", s.handleExec)
	mux.HandleFunc("GET /api/exec/groups/{group_id}", s.handleExecGroup)
	mux.HandleFunc("GET /api/exec/{host}/{id}", s.handleExecDetail)
	mux.HandleFunc("GET /api/staging/{host}/{id}", s.handleStagingDownload) // staging.go
}

// handleExec serves the k-way-merged, cursor-paginated exec list across the
// cluster. Query params: status, outcome, group_id, host, order
// ("" | "created" | "finished"), cursor, limit. An invalid order or limit is a
// 400, mirroring handleMissions.
func (s *Server) handleExec(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	order := q.Get("order")
	if order != "" && order != "created" && order != "finished" {
		writeJSON(w, http.StatusBadRequest, map[string]any{
			"error":   "bad_request",
			"message": "order must be 'created' or 'finished'",
		})
		return
	}
	limit := 0
	if v := q.Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]any{
				"error":   "bad_request",
				"message": "limit must be an integer",
			})
			return
		}
		limit = n
	}
	page, err := s.agg.Execs(aggregator.ExecsQuery{
		Status:  q.Get("status"),
		Outcome: q.Get("outcome"),
		GroupID: q.Get("group_id"),
		Host:    q.Get("host"),
		Order:   order,
		Cursor:  q.Get("cursor"),
		Limit:   limit,
	})
	if err != nil {
		writeAPIError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, page)
}

// handleExecDetail serves one exec mission (routed to its host, tagged) plus a
// best-effort script preview. Unknown host → 404; a missing
// mission propagates the dugdale's 404/410 through writeAPIError.
func (s *Server) handleExecDetail(w http.ResponseWriter, r *http.Request) {
	d, err := s.agg.ExecDetail(r.PathValue("host"), r.PathValue("id"))
	if err != nil {
		writeAPIError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

// handleExecGroup serves every exec mission sharing a group_id across the
// cluster, with a status/outcome summary.
func (s *Server) handleExecGroup(w http.ResponseWriter, r *http.Request) {
	g, err := s.agg.ExecGroup(r.PathValue("group_id"))
	if err != nil {
		writeAPIError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, g)
}
