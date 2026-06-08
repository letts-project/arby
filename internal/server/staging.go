package server

import (
	"mime"
	"net/http"
	"net/http/httputil"
	"net/url"
)

// stagingTransport streams staging artifacts with no overall timeout — downloads
// are bounded by the artifact size, like the SSE relays.
var stagingTransport http.RoundTripper = http.DefaultTransport

// handleStagingDownload reverse-proxies GET /v1/staging/{id} to the host,
// injecting the admin token and forwarding the client Range. A reverse proxy (vs
// a buffered copy) preserves the upstream status — 206 Partial Content — and
// Content-Range, so a resumed/seeked download is not silently flattened into a
// truncated 200. Referrer-Policy comes from the global middleware.
func (s *Server) handleStagingDownload(w http.ResponseWriter, r *http.Request) {
	h := s.reg.ByID(r.PathValue("host"))
	if h == nil || !h.Managed {
		writeJSON(w, http.StatusNotFound, map[string]any{
			"error": "not_found", "message": "unknown or unmanaged host",
		})
		return
	}
	base, err := url.Parse(h.BaseURL)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]any{
			"error": "upstream_error", "message": "invalid host base URL",
		})
		return
	}
	id := r.PathValue("id")
	proxy := &httputil.ReverseProxy{
		Transport: stagingTransport,
		Director: func(req *http.Request) {
			req.URL.Scheme = base.Scheme
			req.URL.Host = base.Host
			// Path holds the decoded form; RawPath carries the escaping for the
			// wire (Path alone would be re-escaped and double-encode the id).
			req.URL.Path = "/v1/staging/" + id
			req.URL.RawPath = "/v1/staging/" + url.PathEscape(id)
			req.URL.RawQuery = ""
			req.Host = base.Host
			req.Header.Set("Authorization", "Bearer "+h.AdminToken)
			// Force identity so the dugdale returns raw bytes with exact
			// Content-Length/Content-Range (staging integrity relies on byte
			// offsets — gzip is forbidden on these endpoints).
			req.Header.Set("Accept-Encoding", "identity")
			// The client's Range header (if any) already rides through on req.
		},
		ModifyResponse: func(resp *http.Response) error {
			resp.Header.Set("Content-Type", "application/octet-stream")
			// FormatMediaType quotes/encodes the filename — the id is a path
			// param and must not be able to break out of the header value.
			cd := mime.FormatMediaType("attachment", map[string]string{"filename": id})
			if cd == "" {
				cd = "attachment"
			}
			resp.Header.Set("Content-Disposition", cd)
			if resp.Header.Get("Accept-Ranges") == "" {
				resp.Header.Set("Accept-Ranges", "bytes")
			}
			return nil
		},
	}
	proxy.ServeHTTP(w, r)
}
