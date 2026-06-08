package aggregator

import (
	"sort"
	"testing"

	"letts/pkg/lettsclient"
)

func TestFanOutCollectsResultsAndUnavailable(t *testing.T) {
	up := newStub(t, []lettsclient.Mission{mkMission("a", 1, 0, "")})
	down := newStub(t, nil)
	down.offline = true

	hosts := []hostClient{
		{ID: "up", Client: up.client(t)},
		{ID: "down", Client: down.client(t)},
	}
	results, unavailable, reasons := fanOut(hosts, func(h hostClient) (int, error) {
		resp, err := lettsclient.ListMissions(h.Client, lettsclient.ListMissionsOpts{})
		if err != nil {
			return 0, err
		}
		return len(resp.Missions), nil
	})
	if results["up"] != 1 {
		t.Errorf("up result=%d want 1", results["up"])
	}
	if _, ok := results["down"]; ok {
		t.Error("down should not have a result")
	}
	sort.Strings(unavailable)
	if len(unavailable) != 1 || unavailable[0] != "down" {
		t.Errorf("unavailable=%v want [down]", unavailable)
	}
	// The failure reason is captured for the UI (host id → error text).
	if reasons["down"] == "" {
		t.Error("expected a failure reason for down")
	}
	if _, ok := reasons["up"]; ok {
		t.Error("up succeeded; it must not have a reason")
	}
}
