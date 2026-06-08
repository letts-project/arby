package server

import (
	"net/http"
	"strconv"

	"arby/internal/aggregator"
)

// registerMissionRoutes wires the read /api routes onto mux, including the two
// SSE live-tail relays (/events, /output) which use the registry stream clients
// (Timeout=0) directly — never the aggregator's fan-out clients.
func (s *Server) registerMissionRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/dashboard", s.handleDashboard)
	mux.HandleFunc("GET /api/missions", s.handleMissions)
	mux.HandleFunc("GET /api/missions/{host}/{id}", s.handleMissionDetail)
	mux.HandleFunc("GET /api/missions/{host}/{id}/events", s.handleMissionEvents)
	mux.HandleFunc("GET /api/missions/{host}/{id}/output", s.handleMissionOutput)
}

// handleDashboard serves the cluster overview (per-host status, lanes, recent
// failures) from the aggregator's cache.
func (s *Server) handleDashboard(w http.ResponseWriter, r *http.Request) {
	result, err := s.agg.Dashboard()
	if err != nil {
		writeAPIError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, result)
}

// handleMissions serves the k-way-merged, cursor-paginated missions list across
// the cluster. Query params: status, outcome, lane, mission, host, order
// ("" | "created" | "finished"), cursor, limit. An invalid order or limit is a
// 400; the per-page cap is applied by the aggregator default.
func (s *Server) handleMissions(w http.ResponseWriter, r *http.Request) {
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
	page, err := s.agg.Missions(aggregator.MissionsQuery{
		Status:  q.Get("status"),
		Outcome: q.Get("outcome"),
		Lane:    q.Get("lane"),
		Mission: q.Get("mission"),
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

// handleMissionDetail serves one mission, routed to its host and tagged with it.
// An unknown/unmanaged host yields 404; a missing mission on a known host
// propagates the dugdale's 404/410 through writeAPIError.
func (s *Server) handleMissionDetail(w http.ResponseWriter, r *http.Request) {
	host := r.PathValue("host")
	id := r.PathValue("id")
	m, err := s.agg.Mission(host, id)
	if err != nil {
		writeAPIError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, m)
}
