package server

import (
	"io"
	"net/http"
	"strings"
	"testing"
)

// TestConfigReturnsStateVerbatim asserts GET /api/config/{host} streams the
// host's /v1/admin/state body unchanged, as application/json.
func TestConfigReturnsStateVerbatim(t *testing.T) {
	s1 := newStub(t, nil)
	s1.stateJSON = `{"lanes":{"normal":{"concurrency":4}},"version":7}`
	ts := newTestServer(t, map[string]*stub{"s1": s1})

	resp, err := http.Get(ts.URL + "/api/config/s1")
	if err != nil {
		t.Fatalf("GET /api/config/s1: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	if ct := resp.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("Content-Type = %q, want application/json…", ct)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if string(body) != s1.stateJSON {
		t.Fatalf("body = %q, want %q", string(body), s1.stateJSON)
	}
}

// TestConfigUnknownHost asserts an unknown host yields 404.
func TestConfigUnknownHost(t *testing.T) {
	s1 := newStub(t, nil)
	ts := newTestServer(t, map[string]*stub{"s1": s1})

	if code := getJSON(t, ts.URL+"/api/config/nope", nil); code != http.StatusNotFound {
		t.Fatalf("unknown-host config status = %d, want 404", code)
	}
}
