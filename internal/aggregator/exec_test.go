package aggregator

import (
	"testing"
	"time"

	"letts/pkg/lettsclient"
)

// mkExec builds a kind=exec mission with the given id/created/group/status/outcome.
func mkExec(id string, createdMs int64, group, status, outcome string) lettsclient.Mission {
	m := lettsclient.Mission{
		MissionID: id, Kind: "exec", GroupID: group, Status: status, TimeCreatedMs: createdMs,
	}
	if outcome != "" {
		m.Outcome = outcome
	}
	return m
}

// TestExecsMergesAcrossHosts asserts Execs() k-way-merges kind=exec missions from
// every host into one globally DESC-by-created page, ignoring kind=mission rows.
func TestExecsMergesAcrossHosts(t *testing.T) {
	s1 := newStub(t, []lettsclient.Mission{mkMission("plain-1", 100, 0, "")})
	s1.execMissions = []lettsclient.Mission{
		mkExec("e-a", 30, "g1", "done", "success"),
		mkExec("e-c", 10, "g1", "done", "failed"),
	}
	s2 := newStub(t, nil)
	s2.execMissions = []lettsclient.Mission{
		mkExec("e-b", 20, "g2", "running", ""),
	}

	reg := loadRegistry(t, clusterYAML(map[string]*stubDugdale{"s1": s1, "s2": s2}))
	agg := New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})

	page, err := agg.Execs(ExecsQuery{})
	if err != nil {
		t.Fatalf("Execs: %v", err)
	}
	if len(page.Unavailable) != 0 {
		t.Fatalf("Unavailable = %v, want empty", page.Unavailable)
	}
	// Globally DESC by time_created: e-a(30), e-b(20), e-c(10). No plain mission.
	gotIDs := make([]string, len(page.Items))
	for i, m := range page.Items {
		gotIDs[i] = m.MissionID
		if m.Kind != "exec" {
			t.Fatalf("item %s kind = %q, want exec", m.MissionID, m.Kind)
		}
	}
	want := []string{"e-a", "e-b", "e-c"}
	if len(gotIDs) != len(want) {
		t.Fatalf("ids = %v, want %v", gotIDs, want)
	}
	for i := range want {
		if gotIDs[i] != want[i] {
			t.Fatalf("ids = %v, want %v", gotIDs, want)
		}
	}
	// Host tagging follows the source stub.
	byID := map[string]MergedMission{}
	for _, m := range page.Items {
		byID[m.MissionID] = m
	}
	if byID["e-a"].Host != "s1" || byID["e-b"].Host != "s2" {
		t.Fatalf("host tags wrong: e-a=%s e-b=%s", byID["e-a"].Host, byID["e-b"].Host)
	}
}

// TestExecsPaginatesAcrossHosts walks the cursor with limit=1 and asserts the
// page sequence is globally ordered and terminates, same cursor scheme as
// Missions.
func TestExecsPaginatesAcrossHosts(t *testing.T) {
	s1 := newStub(t, nil)
	s1.execMissions = []lettsclient.Mission{
		mkExec("e-a", 30, "g1", "done", "success"),
		mkExec("e-c", 10, "g1", "done", "failed"),
	}
	s2 := newStub(t, nil)
	s2.execMissions = []lettsclient.Mission{
		mkExec("e-b", 20, "g2", "running", ""),
	}

	reg := loadRegistry(t, clusterYAML(map[string]*stubDugdale{"s1": s1, "s2": s2}))
	agg := New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})

	var seen []string
	cursor := ""
	for i := 0; i < 10; i++ {
		page, err := agg.Execs(ExecsQuery{Limit: 1, Cursor: cursor})
		if err != nil {
			t.Fatalf("Execs page %d: %v", i, err)
		}
		if len(page.Items) == 0 {
			break
		}
		if len(page.Items) != 1 {
			t.Fatalf("page %d len = %d, want 1", i, len(page.Items))
		}
		seen = append(seen, page.Items[0].MissionID)
		if page.NextCursor == "" {
			break
		}
		cursor = page.NextCursor
	}
	want := []string{"e-a", "e-b", "e-c"}
	if len(seen) != len(want) {
		t.Fatalf("paginated ids = %v, want %v", seen, want)
	}
	for i := range want {
		if seen[i] != want[i] {
			t.Fatalf("paginated ids = %v, want %v", seen, want)
		}
	}
}

// TestExecsGroupIDScopesRun asserts a GroupID filter is forwarded to the dugdale
// (which scopes by group_id) so only that run's execs come back.
func TestExecsGroupIDScopesRun(t *testing.T) {
	s1 := newStub(t, nil)
	s1.execMissions = []lettsclient.Mission{
		mkExec("e-a", 30, "g1", "done", "success"),
		mkExec("e-c", 10, "g2", "done", "failed"),
	}
	reg := loadRegistry(t, clusterYAML(map[string]*stubDugdale{"s1": s1}))
	agg := New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})

	page, err := agg.Execs(ExecsQuery{GroupID: "g1"})
	if err != nil {
		t.Fatalf("Execs: %v", err)
	}
	if len(page.Items) != 1 || page.Items[0].MissionID != "e-a" {
		t.Fatalf("group-scoped items = %+v, want only e-a", page.Items)
	}
}

// TestExecDetailReturnsScriptPreview asserts ExecDetail returns the mission plus
// a script preview (<=4096 bytes) read from the host's staging file, with the
// staging id and a truncation flag.
func TestExecDetailReturnsScriptPreview(t *testing.T) {
	s1 := newStub(t, []lettsclient.Mission{mkExec("e-a", 30, "g1", "done", "success")})
	s1.scriptByMission = map[string]string{"e-a": "#!/bin/sh\necho hello\n"}

	reg := loadRegistry(t, clusterYAML(map[string]*stubDugdale{"s1": s1}))
	agg := New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})

	d, err := agg.ExecDetail("s1", "e-a")
	if err != nil {
		t.Fatalf("ExecDetail: %v", err)
	}
	if d.MissionID != "e-a" || d.Host != "s1" {
		t.Fatalf("detail mission = %s host = %s, want e-a/s1", d.MissionID, d.Host)
	}
	if d.ScriptStagingID != "e-a-script" {
		t.Fatalf("ScriptStagingID = %q, want e-a-script", d.ScriptStagingID)
	}
	if d.ScriptPreview != "#!/bin/sh\necho hello\n" {
		t.Fatalf("ScriptPreview = %q", d.ScriptPreview)
	}
	if len(d.ScriptPreview) > 4096 {
		t.Fatalf("ScriptPreview is %d bytes, want <=4096", len(d.ScriptPreview))
	}
	if d.ScriptTruncated {
		t.Fatalf("ScriptTruncated = true, want false for a small script")
	}
}

// TestExecDetailTruncatesLargeScript asserts a >4 KiB script yields a 4096-byte
// preview flagged truncated, and the detail still succeeds.
func TestExecDetailTruncatesLargeScript(t *testing.T) {
	big := make([]byte, 5000)
	for i := range big {
		big[i] = 'x'
	}
	s1 := newStub(t, []lettsclient.Mission{mkExec("e-a", 30, "g1", "done", "success")})
	s1.scriptByMission = map[string]string{"e-a": string(big)}

	reg := loadRegistry(t, clusterYAML(map[string]*stubDugdale{"s1": s1}))
	agg := New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})

	d, err := agg.ExecDetail("s1", "e-a")
	if err != nil {
		t.Fatalf("ExecDetail: %v", err)
	}
	if len(d.ScriptPreview) != 4096 {
		t.Fatalf("ScriptPreview is %d bytes, want exactly 4096", len(d.ScriptPreview))
	}
	if !d.ScriptTruncated {
		t.Fatalf("ScriptTruncated = false, want true for a 5000-byte script")
	}
}

// TestExecDetailNoScriptStillSucceeds asserts a mission with no recorded script
// returns the detail with an empty preview (preview is best-effort).
func TestExecDetailNoScriptStillSucceeds(t *testing.T) {
	s1 := newStub(t, []lettsclient.Mission{mkExec("e-a", 30, "g1", "done", "success")})
	// no scriptByMission entry

	reg := loadRegistry(t, clusterYAML(map[string]*stubDugdale{"s1": s1}))
	agg := New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})

	d, err := agg.ExecDetail("s1", "e-a")
	if err != nil {
		t.Fatalf("ExecDetail: %v", err)
	}
	if d.ScriptPreview != "" || d.ScriptStagingID != "" {
		t.Fatalf("expected empty preview/staging id, got preview=%q sid=%q", d.ScriptPreview, d.ScriptStagingID)
	}
}

// TestExecDetailUnknownHost asserts ExecDetail returns a 404 HTTPError for an
// unmanaged host.
func TestExecDetailUnknownHost(t *testing.T) {
	s1 := newStub(t, nil)
	reg := loadRegistry(t, clusterYAML(map[string]*stubDugdale{"s1": s1}))
	agg := New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})

	_, err := agg.ExecDetail("nope", "e-a")
	if err == nil {
		t.Fatal("ExecDetail(unknown host): expected error, got nil")
	}
	var he *lettsclient.HTTPError
	if !asHTTPError(err, &he) || he.Status != 404 {
		t.Fatalf("err = %v, want 404 HTTPError", err)
	}
}

// TestExecGroupGathersMembersWithSummary asserts ExecGroup pulls all members of a
// group across hosts and tallies the summary by status/outcome.
func TestExecGroupGathersMembersWithSummary(t *testing.T) {
	s1 := newStub(t, nil)
	s1.execMissions = []lettsclient.Mission{
		mkExec("e-a", 30, "g1", "done", "success"),
		mkExec("e-b", 25, "g1", "done", "failed"),
		mkExec("other", 5, "g2", "done", "success"), // different group, excluded
	}
	s2 := newStub(t, nil)
	s2.execMissions = []lettsclient.Mission{
		mkExec("e-c", 20, "g1", "running", ""),
		mkExec("e-d", 15, "g1", "queued", ""),
	}

	reg := loadRegistry(t, clusterYAML(map[string]*stubDugdale{"s1": s1, "s2": s2}))
	agg := New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})

	g, err := agg.ExecGroup("g1")
	if err != nil {
		t.Fatalf("ExecGroup: %v", err)
	}
	if g.GroupID != "g1" {
		t.Fatalf("GroupID = %q, want g1", g.GroupID)
	}
	if len(g.Items) != 4 {
		t.Fatalf("got %d members, want 4: %+v", len(g.Items), g.Items)
	}
	// Members come from both hosts.
	hosts := map[string]bool{}
	ids := map[string]bool{}
	for _, m := range g.Items {
		hosts[m.Host] = true
		ids[m.MissionID] = true
	}
	if !hosts["s1"] || !hosts["s2"] {
		t.Fatalf("members missing a host: %+v", g.Items)
	}
	if ids["other"] {
		t.Fatalf("group g1 leaked a g2 member")
	}
	want := ExecGroupSummary{Total: 4, Success: 1, Failed: 1, Running: 1, Queued: 1}
	if g.Summary != want {
		t.Fatalf("Summary = %+v, want %+v", g.Summary, want)
	}
}

func TestExecGroupDropsDeletingRows(t *testing.T) {
	s1 := newStub(t, nil)
	s1.execMissions = []lettsclient.Mission{
		mkExec("e-a", 30, "g1", "done", "success"),
		mkExec("e-gone", 20, "g1", "deleting", ""),
	}
	reg := loadRegistry(t, clusterYAML(map[string]*stubDugdale{"s1": s1}))
	agg := New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})

	g, err := agg.ExecGroup("g1")
	if err != nil {
		t.Fatalf("ExecGroup: %v", err)
	}
	if len(g.Items) != 1 || g.Items[0].MissionID != "e-a" {
		t.Fatalf("Items = %+v, want only e-a (deleting row must be dropped)", g.Items)
	}
	want := ExecGroupSummary{Total: 1, Success: 1}
	if g.Summary != want {
		t.Fatalf("Summary = %+v, want %+v (Total must equal the bucket sum)", g.Summary, want)
	}
}

// asHTTPError is a tiny errors.As wrapper kept here so the test file owns its
// only use without pulling errors into the import set elsewhere.
func asHTTPError(err error, target **lettsclient.HTTPError) bool {
	for err != nil {
		if he, ok := err.(*lettsclient.HTTPError); ok {
			*target = he
			return true
		}
		type unwrapper interface{ Unwrap() error }
		u, ok := err.(unwrapper)
		if !ok {
			return false
		}
		err = u.Unwrap()
	}
	return false
}
