package server

import (
	"encoding/json"
	"errors"
	"io/fs"
	"net/http"

	"arby/internal/aggregator"
	"arby/internal/arbyconfig"
	"arby/internal/registry"
	"arby/internal/version"
	"letts/pkg/lettsclient"
)

// Server wires the registry (host lookup and SSE stream clients), the aggregator
// (fan-out reads), and the embedded SPA into an http.Handler.
type Server struct {
	cfg arbyconfig.Config
	reg *registry.Registry
	agg *aggregator.Aggregator
	spa fs.FS
}

// New constructs the Server. spa is the embedded SPA file system (web.FS()).
func New(cfg arbyconfig.Config, reg *registry.Registry, agg *aggregator.Aggregator, spa fs.FS) *Server {
	return &Server{cfg: cfg, reg: reg, agg: agg, spa: spa}
}

// Handler returns the root http.Handler (with middlewares applied).
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })

	// /api routes
	s.registerMissionRoutes(mux)
	s.registerActionRoutes(mux)
	s.registerClusterRoutes(mux) // lanes, dugdales, config
	s.registerExecRoutes(mux)    // exec list/detail/group, staging proxy

	// SPA: serve embedded files; fall back to index.html for client routes.
	mux.HandleFunc("/", s.serveSPA)

	// Middlewares: CSRF (mutations) and Referrer-Policy (all).
	return referrerPolicy(csrf(mux))
}

// serveSPA serves a static asset if it exists, else index.html (SPA fallback),
// minting the CSRF cookie on the entry document.
func (s *Server) serveSPA(w http.ResponseWriter, r *http.Request) {
	// Note: http.ServeFileFS canonicalizes a literal "/index.html" request to
	// "/" via a 301 — harmless; "/" itself serves the SPA with 200.
	p := r.URL.Path
	if p == "/" {
		p = "/index.html"
	}
	clean := p[1:] // strip leading slash for fs
	if f, err := s.spa.Open(clean); err == nil {
		_ = f.Close()
		if clean == "index.html" {
			ensureCSRFCookie(w, r)
			setThemeCookie(w, s.cfg.Theme)
			setVersionCookie(w)
		}
		http.ServeFileFS(w, r, s.spa, clean)
		return
	}
	// SPA client-side route → serve index.html
	ensureCSRFCookie(w, r)
	setThemeCookie(w, s.cfg.Theme)
	setVersionCookie(w)
	http.ServeFileFS(w, r, s.spa, "index.html")
}

// setThemeCookie publishes arby's configured default theme to the SPA as a
// JS-readable cookie. The SPA uses it only as the startup default — a user's
// localStorage choice and an explicit ?theme still win.
func setThemeCookie(w http.ResponseWriter, theme string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "arby_theme",
		Value:    theme,
		Path:     "/",
		SameSite: http.SameSiteStrictMode,
	})
}

// setVersionCookie publishes arby's build version to the SPA as a JS-readable
// cookie (mirrors setThemeCookie) so the sidebar footer can show it without an
// extra API round-trip. Static per build; the SPA only reads it.
func setVersionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "arby_version",
		Value:    version.Version,
		Path:     "/",
		SameSite: http.SameSiteStrictMode,
	})
}

// writeJSON is the shared JSON responder.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeAPIError maps an error (incl. lettsclient.HTTPError) to a JSON error
// response, preserving the upstream status where possible.
func writeAPIError(w http.ResponseWriter, err error) {
	status, code, msg := mapError(err)
	writeJSON(w, status, map[string]any{"error": code, "message": msg})
}

// mapError maps *lettsclient.HTTPError → its Status/Code/Message; every other
// error → 502 upstream_error.
func mapError(err error) (status int, code, msg string) {
	var he *lettsclient.HTTPError
	if errors.As(err, &he) {
		c := he.Code
		if c == "" {
			c = "upstream_error"
		}
		return he.Status, c, he.Message
	}
	return http.StatusBadGateway, "upstream_error", err.Error()
}
