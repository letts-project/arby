package server

import (
	"net/http"
	"testing"

	"arby/internal/aggregator"
	"letts/pkg/lettsclient"
)

// TestLanesMergesAcrossHosts drives GET /api/lanes through the full handler and
// asserts both stubs' lanes appear, host-tagged.
func TestLanesMergesAcrossHosts(t *testing.T) {
	s1 := newStub(t, nil)
	s1.lanes = []lettsclient.LaneInfo{{Name: "normal", Concurrency: 4, Queued: 2, Running: 1}}
	s2 := newStub(t, nil)
	s2.lanes = []lettsclient.LaneInfo{{Name: "bulk", Concurrency: 2, Queued: 5, Paused: true}}
	ts := newTestServer(t, map[string]*stub{"s1": s1, "s2": s2})

	var res aggregator.LanesResult
	if code := getJSON(t, ts.URL+"/api/lanes", &res); code != http.StatusOK {
		t.Fatalf("GET /api/lanes status = %d, want 200", code)
	}
	byHostName := map[string]aggregator.LaneStatus{}
	for _, l := range res.Lanes {
		byHostName[l.Host+"/"+l.Name] = l
	}
	if l, ok := byHostName["s1/normal"]; !ok || l.Queued != 2 || l.Running != 1 || l.Concurrency != 4 {
		t.Fatalf("missing/wrong s1/normal: %+v (all=%+v)", l, res.Lanes)
	}
	if l, ok := byHostName["s2/bulk"]; !ok || l.Queued != 5 || !l.Paused {
		t.Fatalf("missing/wrong s2/bulk: %+v (all=%+v)", l, res.Lanes)
	}
}

// TestLanePauseWithCSRFReachesHost asserts a CSRF-valid pause returns 204 and
// the right host's stub recorded the lane name (and the other host's did not).
func TestLanePauseWithCSRFReachesHost(t *testing.T) {
	s1 := newStub(t, nil)
	s2 := newStub(t, nil)
	ts := newTestServer(t, map[string]*stub{"s1": s1, "s2": s2})

	if code := mutate(t, "POST", ts.URL+"/api/lanes/s1/normal/pause", "tok", nil, nil); code != http.StatusNoContent {
		t.Fatalf("pause status = %d, want 204", code)
	}
	if len(s1.pauseCalls) != 1 || s1.pauseCalls[0] != "normal" {
		t.Fatalf("s1.pauseCalls = %v, want [normal]", s1.pauseCalls)
	}
	if len(s2.pauseCalls) != 0 {
		t.Fatalf("s2.pauseCalls = %v, want none", s2.pauseCalls)
	}

	if code := mutate(t, "POST", ts.URL+"/api/lanes/s1/normal/continue", "tok", nil, nil); code != http.StatusNoContent {
		t.Fatalf("continue status = %d, want 204", code)
	}
	if len(s1.continueCalls) != 1 || s1.continueCalls[0] != "normal" {
		t.Fatalf("s1.continueCalls = %v, want [normal]", s1.continueCalls)
	}
}

// TestLanePauseWithoutCSRFRejected asserts the CSRF middleware blocks a
// tokenless pause with 403 and the stub never saw it.
func TestLanePauseWithoutCSRFRejected(t *testing.T) {
	s1 := newStub(t, nil)
	ts := newTestServer(t, map[string]*stub{"s1": s1})

	if code := mutate(t, "POST", ts.URL+"/api/lanes/s1/normal/pause", "", nil, nil); code != http.StatusForbidden {
		t.Fatalf("tokenless pause status = %d, want 403", code)
	}
	if len(s1.pauseCalls) != 0 {
		t.Fatalf("s1.pauseCalls = %v, want none (CSRF should block)", s1.pauseCalls)
	}
}

// TestLanePauseUnknownHost asserts an unknown host yields 404.
func TestLanePauseUnknownHost(t *testing.T) {
	s1 := newStub(t, nil)
	ts := newTestServer(t, map[string]*stub{"s1": s1})

	if code := mutate(t, "POST", ts.URL+"/api/lanes/nope/normal/pause", "tok", nil, nil); code != http.StatusNotFound {
		t.Fatalf("unknown-host pause status = %d, want 404", code)
	}
}

// TestDugdalesReturnsHosts asserts GET /api/dugdales returns a hosts array with
// one entry per managed host.
func TestDugdalesReturnsHosts(t *testing.T) {
	s1 := newStub(t, nil)
	s2 := newStub(t, nil)
	ts := newTestServer(t, map[string]*stub{"s1": s1, "s2": s2})

	var res struct {
		Hosts       []aggregator.HostStatus `json:"hosts"`
		Unavailable []string                `json:"unavailable_hosts"`
	}
	if code := getJSON(t, ts.URL+"/api/dugdales", &res); code != http.StatusOK {
		t.Fatalf("GET /api/dugdales status = %d, want 200", code)
	}
	ids := map[string]bool{}
	for _, h := range res.Hosts {
		ids[h.ID] = true
	}
	if !ids["s1"] || !ids["s2"] {
		t.Fatalf("hosts = %+v, want both s1 and s2", res.Hosts)
	}
}
