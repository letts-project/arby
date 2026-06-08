package aggregator

import (
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
