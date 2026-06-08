package server

import (
	"net/http"

	"letts/pkg/lettsclient"
)

// registerClusterRoutes wires the cluster endpoints (lanes, dugdales, hosts,
// config). Called from Handler() alongside the mission/action routes.
func (s *Server) registerClusterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/lanes", s.handleLanes)
	mux.HandleFunc("POST /api/lanes/{host}/{lane}/pause", s.handleLanePause)
	mux.HandleFunc("POST /api/lanes/{host}/{lane}/continue", s.handleLaneContinue)
	mux.HandleFunc("GET /api/dugdales", s.handleDugdales)
	mux.HandleFunc("GET /api/hosts", s.handleHosts)
	mux.HandleFunc("GET /api/config/{host}", s.handleConfig) // implemented in config.go
}

// hostInfo is one configured host as the filter UI needs it: identity only,
// no probing. Static per process (letts.yaml is read once at startup).
type hostInfo struct {
	ID      string   `json:"id"`
	Managed bool     `json:"managed"`
	Labels  []string `json:"labels,omitempty"`
}

// handleHosts returns every configured host from letts.yaml. Unlike
// /api/dugdales this does no fan-out — it's the cheap source for filter
// dropdowns, which need the full host set rather than whatever the current
// page happens to contain.
func (s *Server) handleHosts(w http.ResponseWriter, r *http.Request) {
	hosts := s.reg.Hosts()
	out := make([]hostInfo, 0, len(hosts))
	for _, h := range hosts {
		out = append(out, hostInfo{ID: h.ID, Managed: h.Managed, Labels: h.Labels})
	}
	writeJSON(w, http.StatusOK, map[string]any{"hosts": out})
}

func (s *Server) handleLanes(w http.ResponseWriter, r *http.Request) {
	res, err := s.agg.Lanes()
	if err != nil {
		writeAPIError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) handleLanePause(w http.ResponseWriter, r *http.Request) {
	s.laneAction(w, r, true)
}
func (s *Server) handleLaneContinue(w http.ResponseWriter, r *http.Request) {
	s.laneAction(w, r, false)
}

func (s *Server) laneAction(w http.ResponseWriter, r *http.Request, pause bool) {
	c, ok := s.clientForHost(w, r.PathValue("host"))
	if !ok {
		return
	}
	lane := r.PathValue("lane")
	var err error
	if pause {
		err = lettsclient.PauseLane(c, lane)
	} else {
		err = lettsclient.ContinueLane(c, lane)
	}
	if err != nil {
		writeAPIError(w, err)
		return
	}
	s.agg.InvalidateAll()
	w.WriteHeader(http.StatusNoContent)
}

// handleDugdales returns the per-host status. It reuses the cached dashboard
// fan-out (same data as the dashboard host strip).
func (s *Server) handleDugdales(w http.ResponseWriter, r *http.Request) {
	d, err := s.agg.Dashboard()
	if err != nil {
		writeAPIError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"hosts":               d.Hosts, // each HostStatus now carries Labels
		"unavailable_hosts":   d.Unavailable,
		"unavailable_reasons": d.UnavailableReasons,
	})
}
