package server

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func okHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(200) })
}

func TestReferrerPolicyAlwaysSet(t *testing.T) {
	h := referrerPolicy(okHandler())
	r := httptest.NewRequest("GET", "/api/x", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Header().Get("Referrer-Policy") != "same-origin" {
		t.Errorf("Referrer-Policy=%q", w.Header().Get("Referrer-Policy"))
	}
}

func TestCSRFAllowsSafeMethods(t *testing.T) {
	h := csrf(okHandler())
	r := httptest.NewRequest("GET", "/api/x", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Errorf("GET should pass, got %d", w.Code)
	}
}

func TestCSRFRejectsMutationWithoutMatchingToken(t *testing.T) {
	h := csrf(okHandler())
	// no cookie, no header → reject
	r := httptest.NewRequest("POST", "/api/x", nil)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 403 {
		t.Fatalf("POST without token should be 403, got %d", w.Code)
	}
	// cookie present but header missing/mismatched → reject
	r2 := httptest.NewRequest("POST", "/api/x", nil)
	r2.AddCookie(&http.Cookie{Name: "arby_csrf", Value: "tok123"})
	r2.Header.Set("X-CSRF-Token", "WRONG")
	w2 := httptest.NewRecorder()
	h.ServeHTTP(w2, r2)
	if w2.Code != 403 {
		t.Fatalf("mismatched token should be 403, got %d", w2.Code)
	}
}

func TestCSRFAllowsMatchingToken(t *testing.T) {
	h := csrf(okHandler())
	r := httptest.NewRequest("POST", "/api/x", nil)
	r.AddCookie(&http.Cookie{Name: "arby_csrf", Value: "tok123"})
	r.Header.Set("X-CSRF-Token", "tok123")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Code != 200 {
		t.Fatalf("matching token should pass, got %d", w.Code)
	}
}
