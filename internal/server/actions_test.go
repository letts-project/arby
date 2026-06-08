package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"letts/pkg/lettsclient"
)

// mutate issues an unsafe-method request (POST/DELETE) against the test server.
// When csrfToken != "" it supplies a matching arby_csrf cookie and X-CSRF-Token
// header so the csrf middleware lets it through; with "" it sends neither (to
// prove the middleware rejects tokenless mutations). It decodes the JSON body
// into v (when non-nil) and returns the status code.
func mutate(t *testing.T, method, url, csrfToken string, body any, v any) int {
	t.Helper()
	var rdr *bytes.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
		rdr = bytes.NewReader(b)
	} else {
		rdr = bytes.NewReader(nil)
	}
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	if csrfToken != "" {
		req.AddCookie(&http.Cookie{Name: "arby_csrf", Value: csrfToken})
		req.Header.Set("X-CSRF-Token", csrfToken)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, url, err)
	}
	defer resp.Body.Close()
	if v != nil {
		if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
			t.Fatalf("decode %s: %v", url, err)
		}
	}
	return resp.StatusCode
}

func TestRestartReachesHostReturns201(t *testing.T) {
	stubs := map[string]*stub{
		"s1": newStub(t, []lettsclient.Mission{mkMission("m-a", 10, 0, "")}),
		"s2": newStub(t, []lettsclient.Mission{mkMission("m-b", 20, 0, "")}),
	}
	ts := newTestServer(t, stubs)

	var resp lettsclient.RestartResponse
	code := mutate(t, "POST", ts.URL+"/api/missions/s1/m-a/restart", "tok", nil, &resp)
	if code != http.StatusCreated {
		t.Fatalf("restart status = %d, want 201", code)
	}
	if resp.MissionID != "m-a-r" || resp.RestartedFrom != "m-a" {
		t.Fatalf("restart body = %+v, want mission_id=m-a-r restarted_from=m-a", resp)
	}
	// reached s1's stub, not s2's.
	if got := stubs["s1"].gotPaths; len(got) != 1 || got[0] != "/v1/missions/m-a/restart" {
		t.Fatalf("s1 gotPaths = %v, want [/v1/missions/m-a/restart]", got)
	}
	if len(stubs["s2"].gotPaths) != 0 {
		t.Fatalf("s2 should not be touched, gotPaths = %v", stubs["s2"].gotPaths)
	}
}

func TestRestartConflictPassesThrough(t *testing.T) {
	st := newStub(t, []lettsclient.Mission{mkMission("m-a", 10, 0, "")})
	st.conflictID = "m-a"
	ts := newTestServer(t, map[string]*stub{"s1": st})

	var body struct {
		Error   string `json:"error"`
		Message string `json:"message"`
	}
	code := mutate(t, "POST", ts.URL+"/api/missions/s1/m-a/restart", "tok", nil, &body)
	if code != http.StatusConflict {
		t.Fatalf("status = %d, want 409", code)
	}
	if body.Error != "mission_running" {
		t.Fatalf("error code = %q, want mission_running", body.Error)
	}
}

func TestKillReturns204(t *testing.T) {
	st := newStub(t, []lettsclient.Mission{mkMission("m-a", 10, 0, "")})
	ts := newTestServer(t, map[string]*stub{"s1": st})

	code := mutate(t, "POST", ts.URL+"/api/missions/s1/m-a/kill", "tok",
		map[string]string{"signal": "KILL"}, nil)
	if code != http.StatusNoContent {
		t.Fatalf("kill status = %d, want 204", code)
	}
	if got := st.gotPaths; len(got) != 1 || got[0] != "/v1/missions/m-a/kill" {
		t.Fatalf("gotPaths = %v, want [/v1/missions/m-a/kill]", got)
	}
}

func TestDeleteForceReturns202(t *testing.T) {
	st := newStub(t, []lettsclient.Mission{mkMission("m-a", 10, 0, "")})
	ts := newTestServer(t, map[string]*stub{"s1": st})

	var body struct {
		Status string `json:"status"`
	}
	code := mutate(t, "DELETE", ts.URL+"/api/missions/s1/m-a?force=true", "tok", nil, &body)
	if code != http.StatusAccepted {
		t.Fatalf("delete status = %d, want 202", code)
	}
	if body.Status != "deletion_pending" {
		t.Fatalf("status = %q, want deletion_pending", body.Status)
	}
	// ?force=true must reach the dugdale.
	if got := st.gotPaths; len(got) != 1 || got[0] != "/v1/missions/m-a" {
		t.Fatalf("gotPaths = %v, want [/v1/missions/m-a]", got)
	}
}

// TestActionWithoutCSRFTokenIs403 proves the csrf middleware guards mutations:
// the exact same POST that succeeds with a token is rejected 403 without one,
// and never reaches the dugdale.
func TestActionWithoutCSRFTokenIs403(t *testing.T) {
	st := newStub(t, []lettsclient.Mission{mkMission("m-a", 10, 0, "")})
	ts := newTestServer(t, map[string]*stub{"s1": st})

	code := mutate(t, "POST", ts.URL+"/api/missions/s1/m-a/restart", "", nil, nil)
	if code != http.StatusForbidden {
		t.Fatalf("tokenless restart status = %d, want 403", code)
	}
	if len(st.gotPaths) != 0 {
		t.Fatalf("blocked request must not reach the dugdale, gotPaths = %v", st.gotPaths)
	}
}

func TestUnknownHostSingleIs404(t *testing.T) {
	ts := newTestServer(t, map[string]*stub{
		"s1": newStub(t, []lettsclient.Mission{mkMission("m-a", 10, 0, "")}),
	})
	var body struct {
		Error string `json:"error"`
	}
	code := mutate(t, "POST", ts.URL+"/api/missions/nope/m-a/restart", "tok", nil, &body)
	if code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", code)
	}
	if body.Error != "not_found" {
		t.Fatalf("error = %q, want not_found", body.Error)
	}
}

func TestBulkRestartGroupsByHost(t *testing.T) {
	stubs := map[string]*stub{
		"s1": newStub(t, nil),
		"s2": newStub(t, nil),
	}
	ts := newTestServer(t, stubs)

	req := map[string]any{
		"items": []map[string]string{
			{"host": "s1", "id": "a1"},
			{"host": "s2", "id": "b1"},
			{"host": "s1", "id": "a2"},
		},
	}
	var resp struct {
		Results []struct {
			Host string `json:"host"`
			lettsclient.BulkResult
		} `json:"results"`
	}
	code := mutate(t, "POST", ts.URL+"/api/missions/bulk-restart", "tok", req, &resp)
	if code != http.StatusOK {
		t.Fatalf("bulk status = %d, want 200", code)
	}
	// All three ids present in the merged results, each tagged with its host
	// (ids are only unique per host).
	wantHost := map[string]string{"a1": "s1", "a2": "s1", "b1": "s2"}
	gotIDs := map[string]bool{}
	for _, r := range resp.Results {
		gotIDs[r.ID] = true
		if !r.OK {
			t.Fatalf("result %s not ok: %+v", r.ID, r)
		}
		if r.Host != wantHost[r.ID] {
			t.Fatalf("result %s host = %q, want %q", r.ID, r.Host, wantHost[r.ID])
		}
	}
	for _, want := range []string{"a1", "a2", "b1"} {
		if !gotIDs[want] {
			t.Fatalf("missing id %q in results %+v", want, resp.Results)
		}
	}
	if len(resp.Results) != 3 {
		t.Fatalf("results len = %d, want 3", len(resp.Results))
	}
	// Each host's bulk endpoint hit exactly once (grouped, not per-id).
	if got := stubs["s1"].gotPaths; len(got) != 1 || got[0] != "/v1/missions/bulk-restart" {
		t.Fatalf("s1 bulk gotPaths = %v, want one bulk-restart", got)
	}
	if got := stubs["s2"].gotPaths; len(got) != 1 || got[0] != "/v1/missions/bulk-restart" {
		t.Fatalf("s2 bulk gotPaths = %v, want one bulk-restart", got)
	}
}

// TestBulkRestartUnmanagedHostRecordedPerID checks that an item targeting an
// unknown host is reported as a per-id failure rather than failing the whole
// request, while the valid host's ids still succeed.
func TestBulkRestartUnmanagedHostRecordedPerID(t *testing.T) {
	st := newStub(t, nil)
	ts := newTestServer(t, map[string]*stub{"s1": st})

	req := map[string]any{
		"items": []map[string]string{
			{"host": "s1", "id": "a1"},
			{"host": "ghost", "id": "z9"},
		},
	}
	var resp struct {
		Results []lettsclient.BulkResult `json:"results"`
	}
	code := mutate(t, "POST", ts.URL+"/api/missions/bulk-restart", "tok", req, &resp)
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200", code)
	}
	byID := map[string]lettsclient.BulkResult{}
	for _, r := range resp.Results {
		byID[r.ID] = r
	}
	if r, ok := byID["a1"]; !ok || !r.OK {
		t.Fatalf("a1 result = %+v, want ok", r)
	}
	if r, ok := byID["z9"]; !ok || r.OK || !strings.Contains(r.Error, "unmanaged") {
		t.Fatalf("z9 result = %+v, want failed with unmanaged-host error", r)
	}
}

func TestBulkDeleteThreadsForce(t *testing.T) {
	st := newStub(t, nil)
	ts := newTestServer(t, map[string]*stub{"s1": st})

	req := map[string]any{
		"items": []map[string]string{{"host": "s1", "id": "a1"}},
		"force": true,
	}
	var resp struct {
		Results []lettsclient.BulkResult `json:"results"`
	}
	code := mutate(t, "POST", ts.URL+"/api/missions/bulk-delete", "tok", req, &resp)
	if code != http.StatusOK {
		t.Fatalf("status = %d, want 200", code)
	}
	if len(resp.Results) != 1 || resp.Results[0].ID != "a1" || resp.Results[0].Status != "deletion_pending" {
		t.Fatalf("results = %+v, want one deletion_pending for a1", resp.Results)
	}
	if got := st.gotPaths; len(got) != 1 || got[0] != "/v1/missions/bulk-delete" {
		t.Fatalf("gotPaths = %v, want one bulk-delete", got)
	}
}

// TestBulkBodyOverLimitIs413 sends a bulk body larger than maxMutationBodyBytes
// and expects a 413 payload_too_large (DoS hardening), not a 400 or 200.
func TestBulkBodyOverLimitIs413(t *testing.T) {
	st := newStub(t, nil)
	ts := newTestServer(t, map[string]*stub{"s1": st})

	// Valid-prefix JSON followed by enough padding to exceed the 4 MiB cap, so
	// the cap (not a JSON parse error) is what trips. The decoder reads through
	// the cap boundary before it would finish, yielding *http.MaxBytesError.
	big := `{"items":[],"pad":"` + strings.Repeat("x", maxMutationBodyBytes+1024) + `"}`
	req, err := http.NewRequest("POST", ts.URL+"/api/missions/bulk-restart", bytes.NewReader([]byte(big)))
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.AddCookie(&http.Cookie{Name: "arby_csrf", Value: "tok"})
	req.Header.Set("X-CSRF-Token", "tok")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("do: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413", resp.StatusCode)
	}
	var body struct {
		Error string `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if body.Error != "payload_too_large" {
		t.Fatalf("error = %q, want payload_too_large", body.Error)
	}
	// Nothing should have been forwarded to the dugdale.
	if len(st.gotPaths) != 0 {
		t.Fatalf("gotPaths = %v, want none (rejected before fan-out)", st.gotPaths)
	}
}

// TestChunkIDs covers the ≤1000-per-request split at the unit level.
func TestChunkIDs(t *testing.T) {
	small := make([]string, 1000)
	if got := chunkIDs(small, bulkChunkSize); len(got) != 1 {
		t.Fatalf("1000 ids → %d chunks, want 1", len(got))
	}
	big := make([]string, 2500)
	chunks := chunkIDs(big, bulkChunkSize)
	if len(chunks) != 3 || len(chunks[0]) != 1000 || len(chunks[1]) != 1000 || len(chunks[2]) != 500 {
		sizes := make([]int, len(chunks))
		for i, c := range chunks {
			sizes[i] = len(c)
		}
		t.Fatalf("2500 ids → chunk sizes %v, want [1000 1000 500]", sizes)
	}
}
