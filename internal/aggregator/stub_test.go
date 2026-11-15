package aggregator

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"testing"

	"arby/internal/registry"
	"letts/pkg/lettsclient"
)

// stubDugdale is an httptest server emulating one dugdale's read /v1 surface:
// GET /v1/missions (single canned page), /v1/missions/{id}, /v1/dugdale,
// /v1/lanes, /v1/healthz. When offline is set, every route returns 502 so the
// fan-out marks the host unavailable. Cursor paging across hosts is exercised
// by the merge unit; this stub returns at most one page (honoring ?limit).
type stubDugdale struct {
	srv      *httptest.Server
	missions []lettsclient.Mission
	byID     map[string]lettsclient.Mission
	info     lettsclient.DugdaleInfo
	lanes    []lettsclient.LaneInfo
	offline  bool

	// --- cluster surface ------------------------------------------
	// stateJSON is returned verbatim by GET /v1/admin/state (opaque config).
	stateJSON string
	// pauseCalls / continueCalls record the lane names passed to the lane admin
	// routes so tests can assert an action reached the right host's stub.
	pauseCalls    []string
	continueCalls []string
}

func newStub(t *testing.T, missions []lettsclient.Mission) *stubDugdale {
	t.Helper()
	s := &stubDugdale{missions: missions, byID: map[string]lettsclient.Mission{}}
	for _, m := range missions {
		s.byID[m.MissionID] = m
	}
	mux := http.NewServeMux()

	mux.HandleFunc("GET /v1/missions", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		limit := 100
		if v := r.URL.Query().Get("limit"); v != "" {
			if n, err := strconv.Atoi(v); err == nil {
				limit = n
			}
		}
		ord := orderCreated
		if r.URL.Query().Get("order") == "finished" {
			ord = orderFinished
		}
		// Apply the dugdale's server-side filters (status/outcome/lane) so e.g.
		// outcome=failed returns only failures.
		fStatus := r.URL.Query().Get("status")
		fOutcome := r.URL.Query().Get("outcome")
		fLane := r.URL.Query().Get("lane")
		var filtered []lettsclient.Mission
		for _, m := range s.missions {
			if fStatus != "" && m.Status != fStatus {
				continue
			}
			if fOutcome != "" && m.Outcome != fOutcome {
				continue
			}
			if fLane != "" && m.Lane != fLane {
				continue
			}
			filtered = append(filtered, m)
		}
		// Sort the filtered set DESC by the requested key (mission_id tiebreaker),
		// mirroring the dugdale's ORDER BY, then serve strictly after ?cursor so
		// a real multi-host cursor walk paginates end-to-end through the merge.
		sorted := append([]lettsclient.Mission(nil), filtered...)
		sort.SliceStable(sorted, func(i, j int) bool {
			ki, kj := ord.keyOf(sorted[i]), ord.keyOf(sorted[j])
			if ki != kj {
				return ki > kj
			}
			return sorted[i].MissionID > sorted[j].MissionID
		})
		// Like the dugdale: fetch limit+1 and set next_cursor only when rows
		// remain after this page.
		page := fetchAfter(sorted, ord, r.URL.Query().Get("cursor"), limit+1)
		next := ""
		if len(page) > limit {
			page = page[:limit]
			last := page[len(page)-1]
			lc := lettsclient.ListCursor{MissionID: last.MissionID}
			if ord == orderFinished {
				lc.TimeFinishedMs = ord.keyOf(last)
			} else {
				lc.TimeCreatedMs = ord.keyOf(last)
			}
			next = lettsclient.EncodeListCursor(lc)
		}
		_ = json.NewEncoder(w).Encode(lettsclient.ListMissionsResponse{Missions: page, NextCursor: next})
	})

	mux.HandleFunc("GET /v1/missions/{id}", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		m, ok := s.byID[r.PathValue("id")]
		if !ok {
			writeJSONError(w, http.StatusNotFound, "not_found", "no such mission")
			return
		}
		_ = json.NewEncoder(w).Encode(m)
	})

	mux.HandleFunc("GET /v1/dugdale", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		_ = json.NewEncoder(w).Encode(s.info)
	})

	mux.HandleFunc("GET /v1/lanes", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		if s.lanes == nil {
			_ = json.NewEncoder(w).Encode([]lettsclient.LaneInfo{})
			return
		}
		_ = json.NewEncoder(w).Encode(s.lanes)
	})

	mux.HandleFunc("GET /v1/healthz", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		w.WriteHeader(http.StatusOK)
	})

	// GET /v1/version → token-free version info (what the unmanaged-host probe
	// reads; reuses info.Version).
	mux.HandleFunc("GET /v1/version", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]string{"version": s.info.Version})
	})

	// --- cluster surface ------------------------------------------

	// POST /v1/admin/lanes/{name}/pause → 204, recording the lane name.
	mux.HandleFunc("POST /v1/admin/lanes/{name}/pause", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		s.pauseCalls = append(s.pauseCalls, r.PathValue("name"))
		w.WriteHeader(http.StatusNoContent)
	})

	// POST /v1/admin/lanes/{name}/continue → 204, recording the lane name.
	mux.HandleFunc("POST /v1/admin/lanes/{name}/continue", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		s.continueCalls = append(s.continueCalls, r.PathValue("name"))
		w.WriteHeader(http.StatusNoContent)
	})

	// GET /v1/admin/state → the canned applied-state JSON (opaque to arby). A
	// stub with no stateJSON serves a minimal default so the route never 404s.
	mux.HandleFunc("GET /v1/admin/state", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		body := s.stateJSON
		if body == "" {
			body = `{"version":1}`
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = io.WriteString(w, body)
	})

	s.srv = httptest.NewServer(mux)
	t.Cleanup(s.srv.Close)
	return s
}

func writeJSONError(w http.ResponseWriter, status int, code, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"error": code, "message": msg})
}

func (s *stubDugdale) client(t *testing.T) *lettsclient.Client {
	t.Helper()
	c, err := lettsclient.New(lettsclient.Options{BaseURL: s.srv.URL})
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func mkMission(id string, createdMs, finishedMs int64, outcome string) lettsclient.Mission {
	m := lettsclient.Mission{MissionID: id, Status: "done", TimeCreatedMs: createdMs}
	if finishedMs > 0 {
		m.TimeFinishedMs = finishedMs
	}
	if outcome != "" {
		m.Outcome = outcome
	}
	return m
}

// clusterYAML emits a letts.yaml wiring each stub as a dugdale whose url points
// at the stub's httptest URL, under a single global admin token. The map key is
// the dugdale id; ids are sorted so the output is deterministic.
func clusterYAML(stubs map[string]*stubDugdale) string {
	ids := make([]string, 0, len(stubs))
	for id := range stubs {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	var b strings.Builder
	b.WriteString("auth: {admin_token: \"test-admin\"}\n")
	b.WriteString("dugdales:\n")
	for _, id := range ids {
		fmt.Fprintf(&b, "  - {id: %s, url: \"%s\"}\n", id, stubs[id].srv.URL)
	}
	return b.String()
}

// loadRegistry writes yaml to a temp file with 0600 perms (LoadAndResolve's
// strict permissions check requires 0600/0400 for plain-text tokens) and loads
// it into a Registry.
func loadRegistry(t *testing.T, yaml string) *registry.Registry {
	t.Helper()
	p := filepath.Join(t.TempDir(), "letts.yaml")
	if err := os.WriteFile(p, []byte(yaml), 0o600); err != nil {
		t.Fatal(err)
	}
	reg, err := registry.Load(registry.Options{ConfigPath: p, Getenv: os.LookupEnv})
	if err != nil {
		t.Fatalf("loadRegistry: %v", err)
	}
	return reg
}
