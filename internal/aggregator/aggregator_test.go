package aggregator

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"letts/pkg/lettsclient"
)

// newAgg builds an Aggregator over the given stub cluster with a tiny cache TTL.
func newAgg(t *testing.T, stubs map[string]*stubDugdale) *Aggregator {
	t.Helper()
	reg := loadRegistry(t, clusterYAML(stubs))
	return New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})
}

func ids(items []MergedMission) []string {
	out := make([]string, len(items))
	for i, m := range items {
		out[i] = m.MissionID
	}
	return out
}

func eqStr(a, b []string) bool {
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

func TestMissionsMergesAcrossHosts(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{
			mkMission("s1-30", 30, 0, ""),
			mkMission("s1-10", 10, 0, ""),
		}),
		"s2": newStub(t, []lettsclient.Mission{
			mkMission("s2-20", 20, 0, ""),
			mkMission("s2-05", 5, 0, ""),
		}),
	}
	a := newAgg(t, stubs)

	page, err := a.Missions(MissionsQuery{Order: "created", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"s1-30", "s2-20", "s1-10", "s2-05"}
	if got := ids(page.Items); !eqStr(got, want) {
		t.Fatalf("merged order = %v, want %v", got, want)
	}
	if len(page.Unavailable) != 0 {
		t.Errorf("Unavailable = %v, want none", page.Unavailable)
	}
	// Tag every item with its source host.
	for _, m := range page.Items {
		if m.Host != "s1" && m.Host != "s2" {
			t.Errorf("item %s has host %q", m.MissionID, m.Host)
		}
	}
}

func TestMissionsPaginatesWithOpaqueCursor(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{
			mkMission("s1-100", 100, 0, ""),
			mkMission("s1-70", 70, 0, ""),
			mkMission("s1-69", 69, 0, ""),
			mkMission("s1-10", 10, 0, ""),
		}),
		"s2": newStub(t, []lettsclient.Mission{
			mkMission("s2-90", 90, 0, ""),
			mkMission("s2-68", 68, 0, ""),
			mkMission("s2-67", 67, 0, ""),
			mkMission("s2-09", 9, 0, ""),
		}),
	}
	a := newAgg(t, stubs)

	seen := map[string]int{}
	var order []string
	cursor := ""
	for page := 0; page < 50; page++ {
		p, err := a.Missions(MissionsQuery{Order: "created", Cursor: cursor, Limit: 3})
		if err != nil {
			t.Fatal(err)
		}
		if len(p.Items) == 0 {
			break
		}
		for _, m := range p.Items {
			seen[m.MissionID]++
			if seen[m.MissionID] > 1 {
				t.Fatalf("DUPLICATE %s on page %d", m.MissionID, page)
			}
			order = append(order, m.MissionID)
		}
		if p.NextCursor == "" {
			break
		}
		cursor = p.NextCursor
	}
	want := []string{
		"s1-100", "s2-90", "s1-70", // page 1
		"s1-69", "s2-68", "s2-67", // page 2
		"s1-10", "s2-09", // page 3 (tail)
	}
	if !eqStr(order, want) {
		t.Fatalf("paginated order = %v\nwant %v", order, want)
	}
	if len(seen) != 8 {
		t.Fatalf("want 8 unique items, got %d", len(seen))
	}
}

func TestMissionsOfflineHostInUnavailable(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{mkMission("s1-30", 30, 0, "")}),
		"s2": newStub(t, []lettsclient.Mission{mkMission("s2-20", 20, 0, "")}),
	}
	stubs["s2"].offline = true
	a := newAgg(t, stubs)

	page, err := a.Missions(MissionsQuery{Order: "created", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if got := ids(page.Items); !eqStr(got, []string{"s1-30"}) {
		t.Fatalf("items = %v, want [s1-30]", got)
	}
	if !eqStr(page.Unavailable, []string{"s2"}) {
		t.Fatalf("Unavailable = %v, want [s2]", page.Unavailable)
	}
}

func TestMissionsHostFilterNarrowsFanOut(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{mkMission("s1-30", 30, 0, "")}),
		"s2": newStub(t, []lettsclient.Mission{mkMission("s2-20", 20, 0, "")}),
	}
	a := newAgg(t, stubs)

	page, err := a.Missions(MissionsQuery{Host: "s2", Order: "created", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if got := ids(page.Items); !eqStr(got, []string{"s2-20"}) {
		t.Fatalf("host-filtered items = %v, want [s2-20]", got)
	}
	for _, m := range page.Items {
		if m.Host != "s2" {
			t.Errorf("item %s has host %q, want s2", m.MissionID, m.Host)
		}
	}

	// Unknown host → 400 HTTPError (not an empty page).
	_, err = a.Missions(MissionsQuery{Host: "nope", Limit: 10})
	he, ok := err.(*lettsclient.HTTPError)
	if !ok || he.Status != 400 {
		t.Fatalf("unknown host err = %v (%T), want 400 HTTPError", err, err)
	}
}

func TestMissionsDropsDeletingRows(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{
			mkMission("keep", 30, 0, ""),
			func() lettsclient.Mission {
				m := mkMission("gone", 20, 0, "")
				m.Status = "deleting"
				return m
			}(),
		}),
	}
	a := newAgg(t, stubs)
	page, err := a.Missions(MissionsQuery{Order: "created", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if got := ids(page.Items); !eqStr(got, []string{"keep"}) {
		t.Fatalf("items = %v, want [keep] (deleting row must be dropped)", got)
	}
}

func TestDashboardAggregatesHostsLanesAndFailures(t *testing.T) {
	applied := int64(1717800000000)
	s1 := newStub(t, []lettsclient.Mission{
		mkMission("s1-fail", 10, 500, "failed"),
		mkMission("s1-ok", 20, 600, "success"),
	})
	s1.info = lettsclient.DugdaleInfo{
		Version: "1.2.3", UptimeSeconds: 42, AppliedAt: &applied,
		QueueSummary: lettsclient.QueueSummary{Queued: 3, Running: 1},
	}
	s1.lanes = []lettsclient.LaneInfo{
		{Name: "default", Concurrency: 4, Paused: false, Queued: 3, Running: 1},
	}
	s2 := newStub(t, []lettsclient.Mission{
		mkMission("s2-fail", 5, 700, "failed"),
	})
	s2.info = lettsclient.DugdaleInfo{Version: "1.2.3", UptimeSeconds: 7}
	s2.lanes = []lettsclient.LaneInfo{
		{Name: "heavy", Concurrency: 1, Paused: true, Queued: 0, Running: 0},
	}
	stubs := map[string]*stubDugdale{"s1": s1, "s2": s2}
	a := newAgg(t, stubs)

	d, err := a.Dashboard()
	if err != nil {
		t.Fatal(err)
	}
	if len(d.Hosts) != 2 {
		t.Fatalf("Hosts = %d, want 2", len(d.Hosts))
	}
	byHost := map[string]HostStatus{}
	for _, h := range d.Hosts {
		byHost[h.ID] = h
	}
	if !byHost["s1"].Online || byHost["s1"].Version != "1.2.3" || byHost["s1"].UptimeSeconds != 42 {
		t.Errorf("s1 status wrong: %+v", byHost["s1"])
	}
	if byHost["s1"].AppliedAt == nil || *byHost["s1"].AppliedAt != applied {
		t.Errorf("s1 applied_at wrong: %+v", byHost["s1"].AppliedAt)
	}
	if byHost["s1"].Queue.Queued != 3 || byHost["s1"].Queue.Running != 1 {
		t.Errorf("s1 queue wrong: %+v", byHost["s1"].Queue)
	}
	// Lanes: tagged with host, two total.
	if len(d.Lanes) != 2 {
		t.Fatalf("Lanes = %d, want 2", len(d.Lanes))
	}
	laneByName := map[string]LaneStatus{}
	for _, l := range d.Lanes {
		laneByName[l.Name] = l
	}
	if laneByName["default"].Host != "s1" || laneByName["default"].Concurrency != 4 {
		t.Errorf("default lane wrong: %+v", laneByName["default"])
	}
	if laneByName["heavy"].Host != "s2" || !laneByName["heavy"].Paused {
		t.Errorf("heavy lane wrong: %+v", laneByName["heavy"])
	}
	// Recent failures: only 'failed' outcomes, DESC by time_finished across hosts.
	wantFail := []string{"s2-fail", "s1-fail"} // 700 > 500
	if got := ids(d.RecentFailures); !eqStr(got, wantFail) {
		t.Fatalf("RecentFailures = %v, want %v", got, wantFail)
	}
}

func TestDashboardOfflineHostMarkedOffline(t *testing.T) {
	s1 := newStub(t, nil)
	s1.info = lettsclient.DugdaleInfo{Version: "9.9.9", UptimeSeconds: 1}
	s2 := newStub(t, nil)
	s2.offline = true
	stubs := map[string]*stubDugdale{"s1": s1, "s2": s2}
	a := newAgg(t, stubs)

	d, err := a.Dashboard()
	if err != nil {
		t.Fatal(err)
	}
	byHost := map[string]HostStatus{}
	for _, h := range d.Hosts {
		byHost[h.ID] = h
	}
	if !byHost["s1"].Online {
		t.Errorf("s1 should be online")
	}
	if byHost["s2"].Online {
		t.Errorf("s2 should be offline")
	}
	found := false
	for _, u := range d.Unavailable {
		if u == "s2" {
			found = true
		}
	}
	if !found {
		t.Errorf("s2 should be in Unavailable, got %v", d.Unavailable)
	}
}

func TestDashboardIncludesUnmanagedHost(t *testing.T) {
	s1 := newStub(t, []lettsclient.Mission{mkMission("s1-a", 10, 0, "")})
	s1.info = lettsclient.DugdaleInfo{Version: "1.0.0", UptimeSeconds: 5}
	s1.lanes = []lettsclient.LaneInfo{{Name: "default", Concurrency: 2}}
	s2 := newStub(t, []lettsclient.Mission{mkMission("s2-a", 20, 0, "")})
	s2.info = lettsclient.DugdaleInfo{Version: "2.0.0"}

	// s2 has an admin token pointing at an unset env var → unmanaged.
	yaml := "auth: {admin_token: \"test-admin\"}\n" +
		"dugdales:\n" +
		"  - {id: s1, url: \"" + s1.srv.URL + "\"}\n" +
		"  - {id: s2, url: \"" + s2.srv.URL + "\", admin_token: \"${ARBY_TEST_NO_SUCH_TOKEN}\"}\n"
	reg := loadRegistry(t, yaml)
	a := New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})

	d, err := a.Dashboard()
	if err != nil {
		t.Fatal(err)
	}
	byHost := map[string]HostStatus{}
	for _, h := range d.Hosts {
		byHost[h.ID] = h
	}
	if len(d.Hosts) != 2 {
		t.Fatalf("Hosts = %v, want both s1 and s2 (unmanaged must still be listed)", d.Hosts)
	}
	if !byHost["s1"].Managed || !byHost["s1"].Online {
		t.Errorf("s1 = %+v, want managed+online", byHost["s1"])
	}
	if byHost["s2"].Managed {
		t.Errorf("s2 = %+v, want Managed=false", byHost["s2"])
	}
	if !byHost["s2"].Online || byHost["s2"].Version != "2.0.0" {
		t.Errorf("s2 = %+v, want online with version from the token-free probe", byHost["s2"])
	}
	for _, u := range d.Unavailable {
		if u == "s2" {
			t.Errorf("unmanaged s2 must not be in Unavailable (= %v)", d.Unavailable)
		}
	}
	// Listings skip the unmanaged host entirely.
	page, err := a.Missions(MissionsQuery{Order: "created", Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if got := ids(page.Items); !eqStr(got, []string{"s1-a"}) {
		t.Fatalf("items = %v, want [s1-a] (unmanaged host must not join listings)", got)
	}
}

func TestMissionRoutesToHost(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{mkMission("m-s1", 30, 0, "")}),
		"s2": newStub(t, []lettsclient.Mission{mkMission("m-s2", 20, 0, "")}),
	}
	a := newAgg(t, stubs)

	got, err := a.Mission("s2", "m-s2")
	if err != nil {
		t.Fatal(err)
	}
	if got.MissionID != "m-s2" || got.Host != "s2" {
		t.Fatalf("Mission = %+v, want id=m-s2 host=s2", got)
	}

	// Unknown host → 404 HTTPError.
	_, err = a.Mission("nope", "x")
	if err == nil {
		t.Fatal("expected error for unknown host")
	}
	he, ok := err.(*lettsclient.HTTPError)
	if !ok {
		t.Fatalf("want *HTTPError, got %T: %v", err, err)
	}
	if he.Status != 404 || he.Code != "not_found" {
		t.Errorf("HTTPError = %+v, want 404/not_found", he)
	}

	// Unknown mission on a known host → upstream 404 passes through.
	_, err = a.Mission("s1", "missing")
	if err == nil {
		t.Fatal("expected error for missing mission")
	}
	if he, ok := err.(*lettsclient.HTTPError); !ok || he.Status != 404 {
		t.Errorf("missing mission err = %v (%T), want 404 HTTPError", err, err)
	}
}

func mkStatus(id string, createdMs int64, status string) lettsclient.Mission {
	m := mkMission(id, createdMs, 0, "")
	m.Status = status
	return m
}

func TestMissionsLastPageHasNoNextCursor(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{
			mkStatus("r1", 60, "running"), mkStatus("r2", 50, "running"), mkStatus("r3", 40, "running"),
			mkStatus("d1", 35, "done"),
		}),
		"s2": newStub(t, []lettsclient.Mission{
			mkStatus("r4", 30, "running"), mkStatus("r5", 20, "running"), mkStatus("r6", 10, "running"),
		}),
	}
	a := newAgg(t, stubs)

	page, err := a.Missions(MissionsQuery{Status: "running", Limit: 100})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 6 {
		t.Fatalf("items = %v, want 6 running", ids(page.Items))
	}
	if page.NextCursor != "" {
		t.Errorf("NextCursor = %q, want empty (all rows fit on one page)", page.NextCursor)
	}

	// Exactly limit rows across hosts, none left on any host.
	page, err = a.Missions(MissionsQuery{Status: "running", Limit: 6})
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Items) != 6 || page.NextCursor != "" {
		t.Errorf("limit=6: items=%v next=%q, want 6 items and no cursor", ids(page.Items), page.NextCursor)
	}
}

func TestMissionsNextCursorFollowsDugdaleBeyondDeletingRows(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{
			mkMission("keep-30", 30, 0, ""),
			mkStatus("gone-20", 20, "deleting"),
			mkMission("keep-10", 10, 0, ""),
		}),
	}
	a := newAgg(t, stubs)

	p1, err := a.Missions(MissionsQuery{Limit: 2})
	if err != nil {
		t.Fatal(err)
	}
	if got := ids(p1.Items); !eqStr(got, []string{"keep-30"}) {
		t.Fatalf("page1 = %v, want [keep-30]", got)
	}
	if p1.NextCursor == "" {
		t.Fatal("page1 NextCursor empty, want a cursor (the dugdale reported more rows)")
	}
	p2, err := a.Missions(MissionsQuery{Limit: 2, Cursor: p1.NextCursor})
	if err != nil {
		t.Fatal(err)
	}
	if got := ids(p2.Items); !eqStr(got, []string{"keep-10"}) {
		t.Fatalf("page2 = %v, want [keep-10]", got)
	}
	if p2.NextCursor != "" {
		t.Errorf("page2 NextCursor = %q, want empty", p2.NextCursor)
	}
}

func TestMissionsOfflineHostDoesNotKeepNextPage(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{mkMission("s1-30", 30, 0, ""), mkMission("s1-10", 10, 0, "")}),
		"s2": newStub(t, []lettsclient.Mission{mkMission("s2-20", 20, 0, "")}),
	}
	stubs["s2"].offline = true
	a := newAgg(t, stubs)

	page, err := a.Missions(MissionsQuery{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if !eqStr(page.Unavailable, []string{"s2"}) {
		t.Fatalf("Unavailable = %v, want [s2]", page.Unavailable)
	}
	if page.NextCursor != "" {
		t.Errorf("NextCursor = %q, want empty", page.NextCursor)
	}
}

func TestMissionsMultiOutcomeMergesStreams(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{
			mkMission("f-50", 50, 0, "failed"),
			mkMission("ok-45", 45, 0, "success"),
			mkMission("c-40", 40, 0, "crashed"),
			mkMission("o-30", 30, 0, "oom"),
		}),
		"s2": newStub(t, []lettsclient.Mission{
			mkMission("t-48", 48, 0, "timeout"),
			mkMission("f-35", 35, 0, "failed"),
			mkMission("k-20", 20, 0, "killed"),
		}),
	}
	a := newAgg(t, stubs)

	var got []string
	hostOf := map[string]string{}
	cursor := ""
	for i := 0; i < 10; i++ {
		p, err := a.Missions(MissionsQuery{Outcome: "oom,failed,crashed,timeout", Cursor: cursor, Limit: 2})
		if err != nil {
			t.Fatal(err)
		}
		if len(p.Items) == 0 {
			t.Fatalf("page %d is empty after an advertised next page", i)
		}
		for _, m := range p.Items {
			got = append(got, m.MissionID)
			hostOf[m.MissionID] = m.Host
		}
		if i == 0 {
			for k := range decodeExt(t, p.NextCursor) {
				if host, oc, ok := strings.Cut(k, "|"); !ok || (host != "s1" && host != "s2") || oc == "" {
					t.Errorf("cursor key %q, want host|outcome", k)
				}
			}
		}
		if p.NextCursor == "" {
			break
		}
		cursor = p.NextCursor
	}
	want := []string{"f-50", "t-48", "c-40", "f-35", "o-30"}
	if !eqStr(got, want) {
		t.Fatalf("multi-outcome walk = %v, want %v", got, want)
	}
	for id, h := range map[string]string{"f-50": "s1", "t-48": "s2", "c-40": "s1", "f-35": "s2", "o-30": "s1"} {
		if hostOf[id] != h {
			t.Errorf("%s host = %q, want %q", id, hostOf[id], h)
		}
	}
}

func TestMissionsSingleOutcomeKeepsHostCursorKeys(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{mkMission("f-50", 50, 0, "failed"), mkMission("f-40", 40, 0, "failed")}),
		"s2": newStub(t, []lettsclient.Mission{mkMission("f-45", 45, 0, "failed"), mkMission("f-35", 35, 0, "failed")}),
	}
	a := newAgg(t, stubs)

	for _, oc := range []string{"failed", " failed ", "failed,failed"} {
		p, err := a.Missions(MissionsQuery{Outcome: oc, Limit: 2})
		if err != nil {
			t.Fatalf("outcome %q: %v", oc, err)
		}
		if keys := keysOf(decodeExt(t, p.NextCursor)); !eqStr(keys, []string{"s1", "s2"}) {
			t.Errorf("outcome %q: cursor keys = %v, want [s1 s2]", oc, keys)
		}
	}
}

func TestMissionsEquivalentOutcomeListsShareCache(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{mkMission("f-50", 50, 0, "failed"), mkMission("c-40", 40, 0, "crashed")}),
	}
	a := newAgg(t, stubs)

	first, err := a.Missions(MissionsQuery{Outcome: "failed,crashed"})
	if err != nil {
		t.Fatal(err)
	}
	stubs["s1"].offline = true
	second, err := a.Missions(MissionsQuery{Outcome: " crashed,failed,failed"})
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Unavailable) != 0 || !eqStr(ids(second.Items), ids(first.Items)) {
		t.Errorf("second = %v unavailable=%v, want the cached %v", ids(second.Items), second.Unavailable, ids(first.Items))
	}
}

func TestMissionsMultiOutcomeUnavailableReportsHostOnce(t *testing.T) {
	stubs := map[string]*stubDugdale{
		"s1": newStub(t, []lettsclient.Mission{mkMission("f-50", 50, 0, "failed")}),
		"s2": newStub(t, []lettsclient.Mission{mkMission("c-40", 40, 0, "crashed")}),
	}
	stubs["s2"].offline = true
	a := newAgg(t, stubs)

	p, err := a.Missions(MissionsQuery{Outcome: "failed,crashed"})
	if err != nil {
		t.Fatal(err)
	}
	if !eqStr(p.Unavailable, []string{"s2"}) {
		t.Fatalf("Unavailable = %v, want [s2]", p.Unavailable)
	}
	if keys := keysOf(p.UnavailableReasons); !eqStr(keys, []string{"s2"}) || p.UnavailableReasons["s2"] == "" {
		t.Errorf("UnavailableReasons = %v, want a reason keyed by s2 only", p.UnavailableReasons)
	}
	if got := ids(p.Items); !eqStr(got, []string{"f-50"}) {
		t.Errorf("items = %v, want [f-50]", got)
	}
}

func TestMissionsRejectsBadOutcome(t *testing.T) {
	a := newAgg(t, map[string]*stubDugdale{"s1": newStub(t, nil)})
	for _, oc := range []string{"bogus", "failed,bogus", "failed,,crashed", "failed,", " "} {
		_, err := a.Missions(MissionsQuery{Outcome: oc})
		he, ok := err.(*lettsclient.HTTPError)
		if !ok || he.Status != 400 || he.Code != "bad_request" {
			t.Errorf("outcome %q: err = %v (%T), want 400 bad_request", oc, err, err)
		}
	}
}

func TestDashboardRecentFailuresSpanFailureOutcomes(t *testing.T) {
	s1 := newStub(t, []lettsclient.Mission{
		mkMission("failed-500", 1, 500, "failed"),
		mkMission("oom-800", 2, 800, "oom"),
		mkMission("success-900", 3, 900, "success"),
		mkMission("killed-850", 4, 850, "killed"),
	})
	s2 := newStub(t, []lettsclient.Mission{
		mkMission("crashed-700", 5, 700, "crashed"),
		mkMission("timeout-600", 6, 600, "timeout"),
		mkMission("lost-650", 7, 650, "lost"),
	})
	a := newAgg(t, map[string]*stubDugdale{"s1": s1, "s2": s2})

	d, err := a.Dashboard()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"oom-800", "crashed-700", "lost-650", "timeout-600", "failed-500"}
	if got := ids(d.RecentFailures); !eqStr(got, want) {
		t.Fatalf("RecentFailures = %v, want %v", got, want)
	}
}

func TestDashboardRecentFailuresCappedAt20(t *testing.T) {
	var ms []lettsclient.Mission
	for i := 1; i <= 25; i++ {
		oc := failureOutcomes[i%len(failureOutcomes)]
		ms = append(ms, mkMission(fmt.Sprintf("m-%02d", i), int64(i), int64(1000+i), oc))
	}
	a := newAgg(t, map[string]*stubDugdale{"s1": newStub(t, ms)})

	d, err := a.Dashboard()
	if err != nil {
		t.Fatal(err)
	}
	if len(d.RecentFailures) != 20 {
		t.Fatalf("RecentFailures len = %d, want 20", len(d.RecentFailures))
	}
	if d.RecentFailures[0].MissionID != "m-25" || d.RecentFailures[19].MissionID != "m-06" {
		t.Errorf("RecentFailures = %v, want m-25 … m-06", ids(d.RecentFailures))
	}
}
