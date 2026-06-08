package server

import (
	"net/http"
	"testing"

	"arby/internal/aggregator"
	"letts/pkg/lettsclient"
)

// mkExec builds a kind=exec mission for the server-package stub.
func mkExec(id string, createdMs int64, group, status, outcome string) lettsclient.Mission {
	m := lettsclient.Mission{
		MissionID: id, Kind: "exec", GroupID: group, Status: status, TimeCreatedMs: createdMs,
		DisplayName: "cmd " + id,
	}
	if outcome != "" {
		m.Outcome = outcome
	}
	return m
}

// TestExecListMergesAcrossHosts drives GET /api/exec through the full handler
// and asserts both stubs' exec rows appear, globally DESC by created, kind=exec
// only (the plain mission on s1 must not leak in).
func TestExecListMergesAcrossHosts(t *testing.T) {
	s1 := newStub(t, []lettsclient.Mission{mkMission("plain-1", 100, 0, "")})
	s1.execMissions = []lettsclient.Mission{
		mkExec("e-a", 30, "g1", "done", "success"),
		mkExec("e-c", 10, "g1", "done", "failed"),
	}
	s2 := newStub(t, nil)
	s2.execMissions = []lettsclient.Mission{mkExec("e-b", 20, "g2", "running", "")}
	ts := newTestServer(t, map[string]*stub{"s1": s1, "s2": s2})

	var page aggregator.MissionsPage
	if code := getJSON(t, ts.URL+"/api/exec", &page); code != http.StatusOK {
		t.Fatalf("GET /api/exec status = %d, want 200", code)
	}
	got := missionIDs(page.Items)
	want := []string{"e-a", "e-b", "e-c"}
	if !eqStrings(got, want) {
		t.Fatalf("exec ids = %v, want %v", got, want)
	}
	for _, m := range page.Items {
		if m.Kind != "exec" {
			t.Fatalf("item %s kind = %q, want exec", m.MissionID, m.Kind)
		}
	}
}

// TestExecListPaginates walks the cursor with limit=1 and asserts the merged
// sequence is globally ordered and terminates.
func TestExecListPaginates(t *testing.T) {
	s1 := newStub(t, nil)
	s1.execMissions = []lettsclient.Mission{
		mkExec("e-a", 30, "g1", "done", "success"),
		mkExec("e-c", 10, "g1", "done", "failed"),
	}
	s2 := newStub(t, nil)
	s2.execMissions = []lettsclient.Mission{mkExec("e-b", 20, "g2", "running", "")}
	ts := newTestServer(t, map[string]*stub{"s1": s1, "s2": s2})

	var seen []string
	cursor := ""
	for i := 0; i < 10; i++ {
		var page aggregator.MissionsPage
		url := ts.URL + "/api/exec?limit=1"
		if cursor != "" {
			url += "&cursor=" + cursor
		}
		if code := getJSON(t, url, &page); code != http.StatusOK {
			t.Fatalf("GET %s status = %d, want 200", url, code)
		}
		if len(page.Items) == 0 {
			break
		}
		seen = append(seen, page.Items[0].MissionID)
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	want := []string{"e-a", "e-b", "e-c"}
	if !eqStrings(seen, want) {
		t.Fatalf("paginated exec ids = %v, want %v", seen, want)
	}
}

// TestExecListInvalidOrderAndLimit asserts a bad order/limit is a 400, mirroring
// the missions list.
func TestExecListInvalidOrderAndLimit(t *testing.T) {
	s1 := newStub(t, nil)
	ts := newTestServer(t, map[string]*stub{"s1": s1})

	if code := getJSON(t, ts.URL+"/api/exec?order=bogus", nil); code != http.StatusBadRequest {
		t.Fatalf("bad order status = %d, want 400", code)
	}
	if code := getJSON(t, ts.URL+"/api/exec?limit=abc", nil); code != http.StatusBadRequest {
		t.Fatalf("bad limit status = %d, want 400", code)
	}
}

// TestExecDetailReturnsScriptPreview asserts GET /api/exec/{host}/{id} returns the
// mission tagged with its host plus a script_preview read from staging.
func TestExecDetailReturnsScriptPreview(t *testing.T) {
	s1 := newStub(t, []lettsclient.Mission{mkExec("e-a", 30, "g1", "done", "success")})
	s1.scriptByMission = map[string]string{"e-a": "#!/bin/sh\necho hi\n"}
	ts := newTestServer(t, map[string]*stub{"s1": s1})

	var d aggregator.ExecDetail
	if code := getJSON(t, ts.URL+"/api/exec/s1/e-a", &d); code != http.StatusOK {
		t.Fatalf("GET /api/exec/s1/e-a status = %d, want 200", code)
	}
	if d.MissionID != "e-a" || d.Host != "s1" {
		t.Fatalf("detail = %s/%s, want e-a/s1", d.MissionID, d.Host)
	}
	if d.ScriptStagingID != "e-a-script" {
		t.Fatalf("ScriptStagingID = %q, want e-a-script", d.ScriptStagingID)
	}
	if d.ScriptPreview != "#!/bin/sh\necho hi\n" {
		t.Fatalf("ScriptPreview = %q", d.ScriptPreview)
	}
}

// TestExecDetailUnknownHost asserts an unmanaged host yields 404.
func TestExecDetailUnknownHost(t *testing.T) {
	s1 := newStub(t, nil)
	ts := newTestServer(t, map[string]*stub{"s1": s1})

	if code := getJSON(t, ts.URL+"/api/exec/nope/e-a", nil); code != http.StatusNotFound {
		t.Fatalf("unknown-host exec detail status = %d, want 404", code)
	}
}

// TestExecGroupReturnsMembersAndSummary asserts GET /api/exec/groups/{gid}
// returns all members across hosts with a correct summary.
func TestExecGroupReturnsMembersAndSummary(t *testing.T) {
	s1 := newStub(t, nil)
	s1.execMissions = []lettsclient.Mission{
		mkExec("e-a", 30, "g1", "done", "success"),
		mkExec("e-b", 25, "g1", "done", "failed"),
		mkExec("other", 5, "g2", "done", "success"),
	}
	s2 := newStub(t, nil)
	s2.execMissions = []lettsclient.Mission{
		mkExec("e-c", 20, "g1", "running", ""),
		mkExec("e-d", 15, "g1", "queued", ""),
	}
	ts := newTestServer(t, map[string]*stub{"s1": s1, "s2": s2})

	var g aggregator.ExecGroup
	if code := getJSON(t, ts.URL+"/api/exec/groups/g1", &g); code != http.StatusOK {
		t.Fatalf("GET /api/exec/groups/g1 status = %d, want 200", code)
	}
	if g.GroupID != "g1" {
		t.Fatalf("GroupID = %q, want g1", g.GroupID)
	}
	if len(g.Items) != 4 {
		t.Fatalf("members = %d, want 4: %+v", len(g.Items), g.Items)
	}
	want := aggregator.ExecGroupSummary{Total: 4, Success: 1, Failed: 1, Running: 1, Queued: 1}
	if g.Summary != want {
		t.Fatalf("Summary = %+v, want %+v", g.Summary, want)
	}
}

// TestExecGroupsPathHitsGroupHandler asserts the route /api/exec/groups/{gid}
// matches the GROUP handler (not detail with host="groups"). The group handler
// returns a body shaped {group_id,...}; detail would 404 (no host "groups").
func TestExecGroupsPathHitsGroupHandler(t *testing.T) {
	s1 := newStub(t, nil)
	s1.execMissions = []lettsclient.Mission{mkExec("e-a", 30, "g1", "done", "success")}
	ts := newTestServer(t, map[string]*stub{"s1": s1})

	var g aggregator.ExecGroup
	if code := getJSON(t, ts.URL+"/api/exec/groups/g1", &g); code != http.StatusOK {
		t.Fatalf("GET /api/exec/groups/g1 status = %d, want 200 (group handler)", code)
	}
	// The group handler always sets group_id from the path; the detail handler
	// (host="groups", id="g1") would have returned a 404 instead.
	if g.GroupID != "g1" {
		t.Fatalf("group_id = %q, want g1 — route likely hit the detail handler", g.GroupID)
	}
}
