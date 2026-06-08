package server

import (
	"bufio"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"letts/pkg/lettsclient"
)

func sseHeaders(w http.ResponseWriter) (http.Flusher, bool) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	fl, ok := w.(http.Flusher)
	return fl, ok
}

// handleMissionEvents relays /v1/missions/{id}/events as SSE. Each frame
// carries an `id: <seq>` and a `data: <event-json>` line. Browser EventSource
// auto-resumes via Last-Event-ID → we pass it upstream as ?from=<seq>. The
// registry stream client (Timeout=0) is used so fanout_timeout never kills a
// live tail.
func (s *Server) handleMissionEvents(w http.ResponseWriter, r *http.Request) {
	h := s.reg.ByID(r.PathValue("host"))
	if h == nil || !h.Managed {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}
	id := r.PathValue("id")
	fl, ok := sseHeaders(w)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	var from int64
	if lid := r.Header.Get("Last-Event-ID"); lid != "" {
		from, _ = strconv.ParseInt(lid, 10, 64)
	}
	_ = lettsclient.StreamEvents(r.Context(), h.Client, id,
		lettsclient.StreamOpts{Follow: true, From: from},
		func(ev lettsclient.Event) error {
			if _, err := fmt.Fprintf(w, "id: %d\ndata: %s\n\n", ev.Seq, ev.Raw); err != nil {
				return err
			}
			fl.Flush()
			return nil
		})
	// On non-terminal upstream end or client disconnect the handler returns;
	// EventSource reconnects with Last-Event-ID. Errors are not surfaced as a
	// body (the SSE stream has already started).
}

// handleMissionOutput relays /v1/missions/{id}/output?stream=combined as SSE.
// Output has no seq, so no id: line — on reconnect the SPA resets the pane and
// re-renders from the start. Uses the registry stream client
// (Timeout=0) so fanout_timeout never kills a live tail.
func (s *Server) handleMissionOutput(w http.ResponseWriter, r *http.Request) {
	h := s.reg.ByID(r.PathValue("host"))
	if h == nil || !h.Managed {
		http.Error(w, `{"error":"not_found"}`, http.StatusNotFound)
		return
	}
	id := r.PathValue("id")
	fl, ok := sseHeaders(w)
	if !ok {
		http.Error(w, "streaming unsupported", http.StatusInternalServerError)
		return
	}
	rc, err := lettsclient.OpenOutput(r.Context(), h.Client, id,
		lettsclient.OutputOpts{Stream: "combined", Follow: true})
	if err != nil {
		// stream not started yet → can still send a JSON error
		writeAPIError(w, err)
		return
	}
	defer func() { _ = rc.Close() }()
	sc := bufio.NewScanner(rc)
	sc.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		if _, werr := fmt.Fprintf(w, "data: %s\n\n", line); werr != nil {
			return
		}
		fl.Flush()
	}
	// A scan error (upstream read failure, oversized line) must not look like a
	// clean end of output: tell the client so it can show the stream as broken
	// instead of rendering a truncated log as the complete archive.
	if serr := sc.Err(); serr != nil && r.Context().Err() == nil {
		payload, _ := json.Marshal(map[string]string{"message": serr.Error()})
		_, _ = fmt.Fprintf(w, "event: stream_error\ndata: %s\n\n", payload)
		fl.Flush()
	}
}
