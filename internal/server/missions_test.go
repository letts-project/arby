package server

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"arby/internal/aggregator"
	"letts/pkg/lettsclient"
)

// getJSON does an HTTP GET against the test server and decodes the JSON body
// into v, returning the status code.
func getJSON(t *testing.T, url string, v any) int {
	t.Helper()
	resp, err := http.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	if v != nil {
		if err := json.NewDecoder(resp.Body).Decode(v); err != nil {
			t.Fatalf("decode %s: %v", url, err)
		}
	}
	return resp.StatusCode
}

func missionIDs(items []aggregator.MergedMission) []string {
	out := make([]string, len(items))
	for i, m := range items {
		out[i] = m.MissionID
	}
	return out
}

func eqStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestHandleMissionsMergesAndPaginates(t *testing.T) {
	stubs := map[string]*stub{
		"s1": newStub(t, []lettsclient.Mission{
			mkMission("s1-100", 100, 0, ""),
			mkMission("s1-70", 70, 0, ""),
			mkMission("s1-10", 10, 0, ""),
		}),
		"s2": newStub(t, []lettsclient.Mission{
			mkMission("s2-90", 90, 0, ""),
			mkMission("s2-09", 9, 0, ""),
		}),
	}
	ts := newTestServer(t, stubs)

	// Page 1 (limit 3) merges across both hosts, DESC by created.
	var p1 aggregator.MissionsPage
	if code := getJSON(t, ts.URL+"/api/missions?limit=3", &p1); code != 200 {
		t.Fatalf("page1 status = %d, want 200", code)
	}
	if got := missionIDs(p1.Items); !eqStrings(got, []string{"s1-100", "s2-90", "s1-70"}) {
		t.Fatalf("page1 items = %v, want [s1-100 s2-90 s1-70]", got)
	}
	for _, m := range p1.Items {
		if m.Host != "s1" && m.Host != "s2" {
			t.Errorf("item %s has host %q", m.MissionID, m.Host)
		}
	}
	if len(p1.Unavailable) != 0 {
		t.Errorf("page1 unavailable = %v, want none", p1.Unavailable)
	}
	if p1.NextCursor == "" {
		t.Fatal("page1 next_cursor empty, want more pages")
	}

	// Page 2 (one step with the returned cursor) → the tail.
	var p2 aggregator.MissionsPage
	if code := getJSON(t, ts.URL+"/api/missions?limit=3&cursor="+p1.NextCursor, &p2); code != 200 {
		t.Fatalf("page2 status = %d, want 200", code)
	}
	if got := missionIDs(p2.Items); !eqStrings(got, []string{"s1-10", "s2-09"}) {
		t.Fatalf("page2 items = %v, want [s1-10 s2-09]", got)
	}
}

func TestHandleMissionsHostFilter(t *testing.T) {
	stubs := map[string]*stub{
		"s1": newStub(t, []lettsclient.Mission{mkMission("a-s1", 30, 0, "")}),
		"s2": newStub(t, []lettsclient.Mission{mkMission("b-s2", 20, 0, "")}),
	}
	ts := newTestServer(t, stubs)

	var page aggregator.MissionsPage
	if code := getJSON(t, ts.URL+"/api/missions?host=s2", &page); code != 200 {
		t.Fatalf("status = %d, want 200", code)
	}
	if got := missionIDs(page.Items); !eqStrings(got, []string{"b-s2"}) {
		t.Fatalf("items = %v, want [b-s2]", got)
	}

	var body map[string]any
	if code := getJSON(t, ts.URL+"/api/missions?host=ghost", &body); code != 400 {
		t.Fatalf("unknown host status = %d, want 400", code)
	}
}

func TestHandleHosts(t *testing.T) {
	stubs := map[string]*stub{"s1": newStub(t, nil), "s2": newStub(t, nil)}
	ts := newTestServer(t, stubs)

	var out struct {
		Hosts []struct {
			ID      string `json:"id"`
			Managed bool   `json:"managed"`
		} `json:"hosts"`
	}
	if code := getJSON(t, ts.URL+"/api/hosts", &out); code != 200 {
		t.Fatalf("status = %d, want 200", code)
	}
	if len(out.Hosts) != 2 || out.Hosts[0].ID != "s1" || out.Hosts[1].ID != "s2" {
		t.Fatalf("hosts = %+v, want [s1 s2]", out.Hosts)
	}
	for _, h := range out.Hosts {
		if !h.Managed {
			t.Errorf("host %s managed = false, want true", h.ID)
		}
	}
}

// TestEmptyResultsSerializeAsArrays pins the wire contract for empty data: list
// fields are always JSON arrays, never null — the SPA indexes .length on them.
// (A cluster with zero failures/lanes/missions must not crash the dashboard.)
func TestEmptyResultsSerializeAsArrays(t *testing.T) {
	ts := newTestServer(t, map[string]*stub{"s1": newStub(t, nil)})

	rawBody := func(url string) string {
		t.Helper()
		resp, err := http.Get(url)
		if err != nil {
			t.Fatalf("GET %s: %v", url, err)
		}
		defer resp.Body.Close()
		b, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatalf("read %s: %v", url, err)
		}
		if resp.StatusCode != 200 {
			t.Fatalf("GET %s status = %d, want 200 (body %s)", url, resp.StatusCode, b)
		}
		return string(b)
	}

	for _, tc := range []struct{ url, field string }{
		{"/api/dashboard", `"recent_failures":[]`},
		{"/api/missions", `"items":[]`},
		{"/api/exec", `"items":[]`},
		{"/api/lanes", `"lanes":[]`},
		{"/api/exec/groups/no-such-group", `"items":[]`},
	} {
		if body := rawBody(ts.URL + tc.url); !strings.Contains(body, tc.field) {
			t.Errorf("%s: missing %s in body:\n%s", tc.url, tc.field, body)
		}
	}

	// The stub has no lanes either — the dashboard's lanes must be [] too.
	if body := rawBody(ts.URL + "/api/dashboard"); !strings.Contains(body, `"lanes":[]`) {
		t.Errorf("/api/dashboard: missing \"lanes\":[] in body:\n%s", body)
	}
}

func TestHandleMissionsBadOrder(t *testing.T) {
	stubs := map[string]*stub{
		"s1": newStub(t, []lettsclient.Mission{mkMission("s1-1", 1, 0, "")}),
	}
	ts := newTestServer(t, stubs)

	var body map[string]any
	if code := getJSON(t, ts.URL+"/api/missions?order=bogus", &body); code != 400 {
		t.Fatalf("status = %d, want 400", code)
	}
	if body["error"] != "bad_request" {
		t.Errorf("error = %v, want bad_request", body["error"])
	}
}

func TestHandleDashboard(t *testing.T) {
	s1 := newStub(t, []lettsclient.Mission{
		mkMission("s1-fail", 10, 500, "failed"),
		mkMission("s1-ok", 20, 600, "success"),
	})
	s1.info = lettsclient.DugdaleInfo{
		Version: "1.2.3", UptimeSeconds: 42,
		QueueSummary: lettsclient.QueueSummary{Queued: 3, Running: 1},
	}
	s1.lanes = []lettsclient.LaneInfo{{Name: "default", Concurrency: 4, Queued: 3, Running: 1}}
	s2 := newStub(t, []lettsclient.Mission{mkMission("s2-fail", 5, 700, "failed")})
	s2.offline = true
	stubs := map[string]*stub{"s1": s1, "s2": s2}
	ts := newTestServer(t, stubs)

	var d aggregator.DashboardResult
	if code := getJSON(t, ts.URL+"/api/dashboard", &d); code != 200 {
		t.Fatalf("status = %d, want 200", code)
	}
	byHost := map[string]aggregator.HostStatus{}
	for _, h := range d.Hosts {
		byHost[h.ID] = h
	}
	if !byHost["s1"].Online || byHost["s1"].Version != "1.2.3" {
		t.Errorf("s1 status wrong: %+v", byHost["s1"])
	}
	if byHost["s2"].Online {
		t.Errorf("s2 should be offline: %+v", byHost["s2"])
	}
	found := false
	for _, u := range d.Unavailable {
		if u == "s2" {
			found = true
		}
	}
	if !found {
		t.Errorf("s2 should be in unavailable_hosts, got %v", d.Unavailable)
	}
	// Recent failures: only the reachable host's failure (s2 is offline), and
	// ordered by time_finished DESC (single item here).
	if got := missionIDs(d.RecentFailures); !eqStrings(got, []string{"s1-fail"}) {
		t.Fatalf("recent_failures = %v, want [s1-fail]", got)
	}
}

func TestHandleDashboardFailuresOrderedByFinished(t *testing.T) {
	s1 := newStub(t, []lettsclient.Mission{mkMission("s1-fail", 10, 500, "failed")})
	s1.info = lettsclient.DugdaleInfo{Version: "1.0.0"}
	s2 := newStub(t, []lettsclient.Mission{mkMission("s2-fail", 5, 700, "failed")})
	s2.info = lettsclient.DugdaleInfo{Version: "1.0.0"}
	stubs := map[string]*stub{"s1": s1, "s2": s2}
	ts := newTestServer(t, stubs)

	var d aggregator.DashboardResult
	if code := getJSON(t, ts.URL+"/api/dashboard", &d); code != 200 {
		t.Fatalf("status = %d, want 200", code)
	}
	// 700 (s2) > 500 (s1) by time_finished.
	if got := missionIDs(d.RecentFailures); !eqStrings(got, []string{"s2-fail", "s1-fail"}) {
		t.Fatalf("recent_failures = %v, want [s2-fail s1-fail]", got)
	}
}

func TestHandleMissionDetail(t *testing.T) {
	stubs := map[string]*stub{
		"s1": newStub(t, []lettsclient.Mission{mkMission("m-s1", 30, 0, "")}),
		"s2": newStub(t, []lettsclient.Mission{mkMission("m-s2", 20, 0, "")}),
	}
	ts := newTestServer(t, stubs)

	// Known host and mission → 200 with the host tag.
	var m aggregator.MergedMission
	if code := getJSON(t, ts.URL+"/api/missions/s2/m-s2", &m); code != 200 {
		t.Fatalf("status = %d, want 200", code)
	}
	if m.MissionID != "m-s2" || m.Host != "s2" {
		t.Fatalf("detail = %+v, want id=m-s2 host=s2", m)
	}

	// Unknown host → 404.
	if code := getJSON(t, ts.URL+"/api/missions/nope/x", nil); code != 404 {
		t.Fatalf("unknown host status = %d, want 404", code)
	}

	// Missing mission on a known host → upstream 404 passes through.
	if code := getJSON(t, ts.URL+"/api/missions/s1/missing", nil); code != 404 {
		t.Fatalf("missing mission status = %d, want 404", code)
	}
}

func TestHandleMissionsLastPageOmitsNextCursor(t *testing.T) {
	running := func(id string, createdMs int64) lettsclient.Mission {
		m := mkMission(id, createdMs, 0, "")
		m.Status = "running"
		return m
	}
	stubs := map[string]*stub{
		"s1": newStub(t, []lettsclient.Mission{running("r1", 60), running("r2", 50), running("r3", 40), mkMission("d1", 35, 0, "")}),
		"s2": newStub(t, []lettsclient.Mission{running("r4", 30), running("r5", 20), running("r6", 10)}),
	}
	ts := newTestServer(t, stubs)

	resp, err := http.Get(ts.URL + "/api/missions?status=running")
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		t.Fatalf("status = %d, body %s", resp.StatusCode, b)
	}
	var page aggregator.MissionsPage
	if err := json.Unmarshal(b, &page); err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 6 {
		t.Fatalf("items = %v, want 6 running", missionIDs(page.Items))
	}
	if strings.Contains(string(b), "next_cursor") {
		t.Errorf("body carries next_cursor on the only page:\n%s", b)
	}
}

func TestHandleMissionsMultiOutcome(t *testing.T) {
	stubs := map[string]*stub{
		"s1": newStub(t, []lettsclient.Mission{
			mkMission("f-50", 50, 500, "failed"),
			mkMission("ok-45", 45, 450, "success"),
			mkMission("o-30", 30, 300, "oom"),
		}),
		"s2": newStub(t, []lettsclient.Mission{
			mkMission("c-40", 40, 400, "crashed"),
			mkMission("k-20", 20, 200, "killed"),
		}),
	}
	ts := newTestServer(t, stubs)

	var page aggregator.MissionsPage
	if code := getJSON(t, ts.URL+"/api/missions?outcome=failed,crashed,oom,timeout,lost&order=finished", &page); code != 200 {
		t.Fatalf("status = %d, want 200", code)
	}
	if got := missionIDs(page.Items); !eqStrings(got, []string{"f-50", "c-40", "o-30"}) {
		t.Fatalf("items = %v, want [f-50 c-40 o-30]", got)
	}
	for _, m := range page.Items {
		if m.Host != "s1" && m.Host != "s2" {
			t.Errorf("item %s host = %q, want a real host id", m.MissionID, m.Host)
		}
	}
	if page.NextCursor != "" {
		t.Errorf("next_cursor = %q, want none", page.NextCursor)
	}
}

func TestHandleMissionsBadOutcome(t *testing.T) {
	ts := newTestServer(t, map[string]*stub{"s1": newStub(t, nil)})

	for _, oc := range []string{"bogus", "failed,bogus", "failed,,crashed", "failed,"} {
		var body map[string]any
		if code := getJSON(t, ts.URL+"/api/missions?outcome="+oc, &body); code != 400 {
			t.Errorf("outcome=%s status = %d, want 400", oc, code)
		}
		if body["error"] != "bad_request" {
			t.Errorf("outcome=%s error = %v, want bad_request", oc, body["error"])
		}
		if msg, _ := body["message"].(string); !strings.Contains(msg, "outcome") {
			t.Errorf("outcome=%s message = %q, want it to name the outcome param", oc, msg)
		}
	}
}
