package aggregator

import (
	"testing"
	"time"

	"letts/pkg/lettsclient"
)

// TestLanesMergesAcrossHosts builds the aggregator from two stub dugdales and
// asserts Lanes() returns host-tagged LaneStatus rows from both, in stable
// (a.hosts) order with each host's lanes in upstream order.
func TestLanesMergesAcrossHosts(t *testing.T) {
	s1 := newStub(t, nil)
	s1.lanes = []lettsclient.LaneInfo{
		{Name: "normal", Concurrency: 4, Paused: false, Queued: 2, Running: 1},
		{Name: "high", Concurrency: 8, Paused: true, Queued: 0, Running: 3},
	}
	s2 := newStub(t, nil)
	s2.lanes = []lettsclient.LaneInfo{
		{Name: "bulk", Concurrency: 2, Paused: false, Queued: 5, Running: 0},
	}

	reg := loadRegistry(t, clusterYAML(map[string]*stubDugdale{"s1": s1, "s2": s2}))
	agg := New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})

	res, err := agg.Lanes()
	if err != nil {
		t.Fatalf("Lanes: %v", err)
	}
	if len(res.Unavailable) != 0 {
		t.Fatalf("Unavailable = %v, want empty", res.Unavailable)
	}
	want := []LaneStatus{
		{Host: "s1", Name: "normal", Queued: 2, Running: 1, Concurrency: 4, Paused: false},
		{Host: "s1", Name: "high", Queued: 0, Running: 3, Concurrency: 8, Paused: true},
		{Host: "s2", Name: "bulk", Queued: 5, Running: 0, Concurrency: 2, Paused: false},
	}
	if len(res.Lanes) != len(want) {
		t.Fatalf("got %d lanes, want %d: %+v", len(res.Lanes), len(want), res.Lanes)
	}
	for i, w := range want {
		if res.Lanes[i] != w {
			t.Fatalf("lane[%d] = %+v, want %+v", i, res.Lanes[i], w)
		}
	}
}

// TestLanesOfflineHostUnavailable asserts an offline stub is absent from the
// merged lanes and reported in Unavailable.
func TestLanesOfflineHostUnavailable(t *testing.T) {
	s1 := newStub(t, nil)
	s1.lanes = []lettsclient.LaneInfo{{Name: "normal", Concurrency: 4, Queued: 1, Running: 0}}
	s2 := newStub(t, nil)
	s2.lanes = []lettsclient.LaneInfo{{Name: "bulk", Concurrency: 2}}
	s2.offline = true

	reg := loadRegistry(t, clusterYAML(map[string]*stubDugdale{"s1": s1, "s2": s2}))
	agg := New(reg, Options{CacheTTL: time.Second, FanoutTimeout: 2 * time.Second})

	res, err := agg.Lanes()
	if err != nil {
		t.Fatalf("Lanes: %v", err)
	}
	for _, l := range res.Lanes {
		if l.Host == "s2" {
			t.Fatalf("offline host s2 leaked a lane: %+v", l)
		}
	}
	if len(res.Unavailable) != 1 || res.Unavailable[0] != "s2" {
		t.Fatalf("Unavailable = %v, want [s2]", res.Unavailable)
	}
}
