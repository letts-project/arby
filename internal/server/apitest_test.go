package server

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
	"time"

	"arby/internal/aggregator"
	"arby/internal/arbyconfig"
	"arby/internal/registry"
	"letts/pkg/lettsclient"
)

// stub is an httptest server emulating one dugdale's read /v1 surface that the
// read handlers exercise: GET /v1/missions (cursor-paged, honoring filters +
// order), /v1/missions/{id}, /v1/dugdale, /v1/lanes, /v1/healthz. offline → 502
// on every route so the fan-out marks the host unavailable. This mirrors the
// aggregator package's stub_test.go, but lives in package server (the
// aggregator's test-only stubs can't be imported across packages).
type stub struct {
	srv      *httptest.Server
	missions []lettsclient.Mission
	byID     map[string]lettsclient.Mission
	info     lettsclient.DugdaleInfo
	lanes    []lettsclient.LaneInfo
	offline  bool
	// conflictID, when set, makes the single-mission action routes
	// (restart/kill/delete) return a 409 `{"error":"mission_running"}` for that
	// id, so tests can assert the dugdale's status code passes through arby.
	conflictID string
	// gotPaths records every action request path the stub received, so tests can
	// assert an action reached the right host's stub.
	gotPaths []string
	// stateJSON is returned verbatim by GET /v1/admin/state (opaque config).
	stateJSON string
	// pauseCalls / continueCalls record the lane names passed to the lane admin
	// routes so tests can assert a lane action reached the right host's stub.
	pauseCalls    []string
	continueCalls []string
	// --- exec surface -------------------------------------------
	// execMissions backs GET /v1/missions?kind=exec (honoring ?group_id), used by
	// the /api/exec list and group handlers.
	execMissions []lettsclient.Mission
	// scriptByMission maps a mission id → its script body, served by the staging
	// routes (GET /v1/staging?mission_id=…&ref_kind=script lists one StagingFile;
	// GET /v1/staging/{id} returns the bytes, honoring a bytes=0-N Range). Used by
	// exec-detail script preview and by the staging download proxy.
	scriptByMission map[string]string
	// stagingRanges records the Range header value the staging download route saw
	// for each request (empty string when none), so a test can assert the proxy
	// forwarded Range upstream.
	stagingRanges []string
	// rawStaging maps an exact staging id → body for GET /v1/staging/{id},
	// independent of the scriptByMission convention (for ids that aren't
	// "<mission>-script", e.g. ones with awkward characters).
	rawStaging map[string]string
	// hugeOutputLine makes the output route emit a single NDJSON line larger
	// than the relay's per-line scanner cap, to exercise its error reporting.
	hugeOutputLine bool
}

func newStub(t *testing.T, missions []lettsclient.Mission) *stub {
	t.Helper()
	s := &stub{missions: missions, byID: map[string]lettsclient.Mission{}}
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
		finished := r.URL.Query().Get("order") == "finished"
		fStatus := r.URL.Query().Get("status")
		fOutcome := r.URL.Query().Get("outcome")
		fLane := r.URL.Query().Get("lane")
		fGroup := r.URL.Query().Get("group_id")
		// kind=exec serves execMissions; everything else serves the
		// regular missions slice.
		src := s.missions
		if r.URL.Query().Get("kind") == "exec" {
			src = s.execMissions
		}
		var filtered []lettsclient.Mission
		for _, m := range src {
			if fStatus != "" && m.Status != fStatus {
				continue
			}
			if fOutcome != "" && m.Outcome != fOutcome {
				continue
			}
			if fLane != "" && m.Lane != fLane {
				continue
			}
			if fGroup != "" && m.GroupID != fGroup {
				continue
			}
			filtered = append(filtered, m)
		}
		// Sort DESC by the requested key (mission_id tiebreaker), then serve the
		// page strictly after ?cursor so a real multi-host cursor walk paginates
		// end-to-end through arby's merge.
		sorted := append([]lettsclient.Mission(nil), filtered...)
		sort.SliceStable(sorted, func(i, j int) bool {
			ki, kj := keyOf(sorted[i], finished), keyOf(sorted[j], finished)
			if ki != kj {
				return ki > kj
			}
			return sorted[i].MissionID > sorted[j].MissionID
		})
		page := fetchAfter(sorted, finished, r.URL.Query().Get("cursor"), limit)
		next := ""
		if len(page) == limit {
			last := page[len(page)-1]
			lc := lettsclient.ListCursor{MissionID: last.MissionID}
			if finished {
				lc.TimeFinishedMs = keyOf(last, true)
			} else {
				lc.TimeCreatedMs = keyOf(last, false)
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
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "not_found", "message": "no such mission"})
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

	// POST /v1/admin/lanes/{name}/pause|continue → 204, recording the lane name.
	mux.HandleFunc("POST /v1/admin/lanes/{name}/pause", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		s.pauseCalls = append(s.pauseCalls, r.PathValue("name"))
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("POST /v1/admin/lanes/{name}/continue", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		s.continueCalls = append(s.continueCalls, r.PathValue("name"))
		w.WriteHeader(http.StatusNoContent)
	})

	// GET /v1/admin/state → the canned applied-state JSON (opaque to arby).
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

	// GET /v1/staging?mission_id=…&ref_kind=script → a single StagingFile for the
	// mission's script (id "<mission>-script", size = len(body)), or an empty
	// list when the mission has no recorded script. Backs exec-detail preview.
	mux.HandleFunc("GET /v1/staging", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		mid := r.URL.Query().Get("mission_id")
		refKind := r.URL.Query().Get("ref_kind")
		var files []lettsclient.StagingFile
		if body, ok := s.scriptByMission[mid]; ok && (refKind == "" || refKind == "script") {
			files = append(files, lettsclient.StagingFile{
				StagingID: mid + "-script", State: "complete", RefKind: "script",
				Role: "script", Size: int64(len(body)),
			})
		}
		_ = json.NewEncoder(w).Encode(lettsclient.ListStagingResponse{Staging: files})
	})

	// GET /v1/staging/{id} → the script bytes for "<mission>-script", honoring a
	// leading-window Range like "bytes=0-4095" (inclusive end, clamped to len).
	// Records the Range it saw so a test can assert the proxy forwarded it.
	mux.HandleFunc("GET /v1/staging/{id}", func(w http.ResponseWriter, r *http.Request) {
		s.stagingRanges = append(s.stagingRanges, r.Header.Get("Range"))
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		id := r.PathValue("id")
		body, ok := s.rawStaging[id]
		if !ok {
			body, ok = s.scriptByMission[strings.TrimSuffix(id, "-script")]
		}
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			_ = json.NewEncoder(w).Encode(map[string]any{"error": "not_found", "message": "no such staging file"})
			return
		}
		data := []byte(body)
		status := http.StatusOK
		if rng := r.Header.Get("Range"); strings.HasPrefix(rng, "bytes=0-") {
			if end, err := strconv.Atoi(strings.TrimPrefix(rng, "bytes=0-")); err == nil {
				if end+1 < len(data) { // inclusive end; only a partial slice is a 206
					data = data[:end+1]
					status = http.StatusPartialContent
				}
			}
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(status)
		_, _ = w.Write(data)
	})

	// GET /v1/missions/{id}/events streams NDJSON event lines (seq-ordered),
	// honoring ?from=<seq> (emit only seq > from for resume), flushing each, and
	// ending with a terminal `done` so StreamEvents (Follow=true) terminates
	// instead of reconnecting forever. Closing after `done` lets arby's relay end.
	mux.HandleFunc("GET /v1/missions/{id}/events", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		var from int64
		if v := r.URL.Query().Get("from"); v != "" {
			from, _ = strconv.ParseInt(v, 10, 64)
		}
		fl, _ := w.(http.Flusher)
		w.Header().Set("Content-Type", "application/x-ndjson")
		w.WriteHeader(http.StatusOK)
		events := []string{
			`{"seq":1,"event":"queued","mission_id":"m","lane":"default"}`,
			`{"seq":2,"event":"running","time":1,"pid":4242}`,
			`{"seq":3,"event":"progress","time":2,"value":0.5}`,
			`{"seq":4,"event":"done","time_finished":3,"outcome":"success","exit_code":0}`,
		}
		for i, line := range events {
			if int64(i+1) <= from { // seq is i+1; emit only seq > from
				continue
			}
			fmt.Fprintf(w, "%s\n", line)
			if fl != nil {
				fl.Flush()
			}
		}
	})

	// GET /v1/missions/{id}/output streams a few NDJSON combined-envelope lines,
	// flushes, then returns (closes) so the relay's scanner ends. With
	// hugeOutputLine it instead emits one line beyond the relay's 4 MiB scanner
	// cap to exercise the relay's stream-error reporting.
	mux.HandleFunc("GET /v1/missions/{id}/output", func(w http.ResponseWriter, r *http.Request) {
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		fl, _ := w.(http.Flusher)
		w.Header().Set("Content-Type", "application/x-ndjson")
		w.WriteHeader(http.StatusOK)
		if s.hugeOutputLine {
			fmt.Fprintf(w, `{"t":1,"stream":"stdout","data":"%s"}`+"\n", strings.Repeat("x", 5*1024*1024))
			if fl != nil {
				fl.Flush()
			}
			return
		}
		lines := []string{
			`{"t":1,"stream":"stdout","data":"hello\n"}`,
			`{"t":2,"stream":"stderr","data":"warn\n"}`,
		}
		for _, line := range lines {
			fmt.Fprintf(w, "%s\n", line)
			if fl != nil {
				fl.Flush()
			}
		}
	})

	// --- control actions -------------------------------------------

	// conflict writes a 409 mission_running error (the dugdale's status code that
	// arby must pass through unchanged).
	conflict := func(w http.ResponseWriter) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error": "mission_running", "message": "mission is still running",
		})
	}

	// POST /v1/missions/{id}/restart → 201 {mission_id, restarted_from, status}.
	mux.HandleFunc("POST /v1/missions/{id}/restart", func(w http.ResponseWriter, r *http.Request) {
		s.gotPaths = append(s.gotPaths, r.URL.Path)
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		id := r.PathValue("id")
		if s.conflictID != "" && id == s.conflictID {
			conflict(w)
			return
		}
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(lettsclient.RestartResponse{
			MissionID: id + "-r", RestartedFrom: id, Status: "queued",
		})
	})

	// POST /v1/missions/{id}/kill → 204 (no body). Records the signal nowhere;
	// tests only assert the call reached the host.
	mux.HandleFunc("POST /v1/missions/{id}/kill", func(w http.ResponseWriter, r *http.Request) {
		s.gotPaths = append(s.gotPaths, r.URL.Path)
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		if s.conflictID != "" && r.PathValue("id") == s.conflictID {
			conflict(w)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	// DELETE /v1/missions/{id} → 204 (no body); honors ?force=true implicitly.
	mux.HandleFunc("DELETE /v1/missions/{id}", func(w http.ResponseWriter, r *http.Request) {
		s.gotPaths = append(s.gotPaths, r.URL.Path)
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		if s.conflictID != "" && r.PathValue("id") == s.conflictID {
			conflict(w)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	// POST /v1/missions/bulk-restart → {results:[{id,ok,mission_id,status}]}.
	mux.HandleFunc("POST /v1/missions/bulk-restart", func(w http.ResponseWriter, r *http.Request) {
		s.gotPaths = append(s.gotPaths, r.URL.Path)
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		var body struct {
			IDs []string `json:"ids"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		results := make([]lettsclient.BulkResult, 0, len(body.IDs))
		for _, id := range body.IDs {
			results = append(results, lettsclient.BulkResult{
				ID: id, OK: true, MissionID: id + "-r", Status: "queued",
			})
		}
		_ = json.NewEncoder(w).Encode(lettsclient.BulkResponse{Results: results})
	})

	// POST /v1/missions/bulk-delete → {results:[{id,ok,status}]}.
	mux.HandleFunc("POST /v1/missions/bulk-delete", func(w http.ResponseWriter, r *http.Request) {
		s.gotPaths = append(s.gotPaths, r.URL.Path)
		if s.offline {
			http.Error(w, "down", http.StatusBadGateway)
			return
		}
		var body struct {
			IDs   []string `json:"ids"`
			Force bool     `json:"force"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		results := make([]lettsclient.BulkResult, 0, len(body.IDs))
		for _, id := range body.IDs {
			results = append(results, lettsclient.BulkResult{
				ID: id, OK: true, Status: "deletion_pending",
			})
		}
		_ = json.NewEncoder(w).Encode(lettsclient.BulkResponse{Results: results})
	})

	s.srv = httptest.NewServer(mux)
	t.Cleanup(s.srv.Close)
	return s
}

// keyOf returns the mission's sort key for the requested order.
func keyOf(m lettsclient.Mission, finished bool) int64 {
	if finished {
		return m.TimeFinishedMs
	}
	return m.TimeCreatedMs
}

// fetchAfter returns up to limit missions from the DESC-sorted slice strictly
// after the decoded cursor (by key DESC, mission_id DESC). An empty cursor
// returns from the head.
func fetchAfter(sorted []lettsclient.Mission, finished bool, cursor string, limit int) []lettsclient.Mission {
	start := 0
	if cursor != "" {
		lc, err := lettsclient.DecodeListCursor(cursor)
		if err == nil {
			ck := lc.TimeCreatedMs
			if finished {
				ck = lc.TimeFinishedMs
			}
			for i, m := range sorted {
				k := keyOf(m, finished)
				if k < ck || (k == ck && m.MissionID < lc.MissionID) {
					start = i
					break
				}
				start = i + 1
			}
		}
	}
	end := start + limit
	if end > len(sorted) {
		end = len(sorted)
	}
	return sorted[start:end]
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
// at the stub's httptest URL, under a single global admin token. Stub ids are
// sorted so the output is deterministic.
func clusterYAML(stubs map[string]*stub) string {
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

// newTestServer writes a letts.yaml (mode 0600 — LoadAndResolve requires
// 0600/0400 for plain-text tokens) for the stub cluster, loads the registry,
// builds the aggregator and server, and returns the running httptest server.
// Reads go through the FULL middleware stack; GET is a CSRF-safe method so no
// token is needed.
func newTestServer(t *testing.T, stubs map[string]*stub) *httptest.Server {
	t.Helper()
	p := filepath.Join(t.TempDir(), "letts.yaml")
	if err := os.WriteFile(p, []byte(clusterYAML(stubs)), 0o600); err != nil {
		t.Fatal(err)
	}
	reg, err := registry.Load(registry.Options{ConfigPath: p, Getenv: os.LookupEnv})
	if err != nil {
		t.Fatalf("registry.Load: %v", err)
	}
	agg := aggregator.New(reg, aggregator.Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})
	srv := New(arbyconfig.Config{}, reg, agg, nil)
	ts := httptest.NewServer(srv.Handler())
	t.Cleanup(ts.Close)
	return ts
}
