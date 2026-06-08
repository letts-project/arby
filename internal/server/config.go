package server

import "net/http"

// handleConfig streams the host's applied config (opaque JSON) to the browser.
func (s *Server) handleConfig(w http.ResponseWriter, r *http.Request) {
	raw, err := s.agg.Config(r.PathValue("host"))
	if err != nil {
		writeAPIError(w, err)
		return
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(raw)
}
