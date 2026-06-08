package server

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"net/http"
)

const csrfCookieName = "arby_csrf"

// referrerPolicy sets Referrer-Policy: same-origin on every response so
// mission_id/staging_id-bearing URLs never leak via Referer.
func referrerPolicy(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Referrer-Policy", "same-origin")
		next.ServeHTTP(w, r)
	})
}

// csrf enforces double-submit-cookie CSRF on unsafe methods: the X-CSRF-Token
// header must equal the arby_csrf cookie. Safe methods pass through. The cookie
// is minted by ensureCSRFCookie when the SPA entry is served.
func csrf(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		cookie, err := r.Cookie(csrfCookieName)
		header := r.Header.Get("X-CSRF-Token")
		if err != nil || cookie.Value == "" || header == "" ||
			subtle.ConstantTimeCompare([]byte(cookie.Value), []byte(header)) != 1 {
			http.Error(w, `{"error":"csrf","message":"missing or invalid CSRF token"}`, http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ensureCSRFCookie sets a fresh arby_csrf cookie if absent. Called when serving
// the SPA index so the browser always has a token to echo back. JS-readable
// (no HttpOnly) by design — double-submit needs the SPA to read it.
func ensureCSRFCookie(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(csrfCookieName); err == nil && c.Value != "" {
		return
	}
	buf := make([]byte, 32)
	_, _ = rand.Read(buf)
	http.SetCookie(w, &http.Cookie{
		Name:     csrfCookieName,
		Value:    hex.EncodeToString(buf),
		Path:     "/",
		SameSite: http.SameSiteStrictMode,
	})
}
