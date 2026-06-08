package aggregator

import "letts/pkg/lettsclient"

// LanesResult is every lane across the cluster, host-tagged.
type LanesResult struct {
	Lanes              []LaneStatus      `json:"lanes"`
	Unavailable        []string          `json:"unavailable_hosts,omitempty"`
	UnavailableReasons map[string]string `json:"unavailable_reasons,omitempty"`
}

// Lanes fans out ListLanes per host and flattens to host-tagged rows. Cached
// under "lanes" (busted by lane pause/continue via InvalidateAll).
func (a *Aggregator) Lanes() (LanesResult, error) {
	v, err := a.cache.get("lanes", func() (any, error) { return a.lanesFanout() })
	if err != nil {
		return LanesResult{}, err
	}
	return v.(LanesResult), nil
}

func (a *Aggregator) lanesFanout() (any, error) {
	results, unavailable, reasons := fanOut(a.hosts, func(h hostClient) ([]lettsclient.LaneInfo, error) {
		return lettsclient.ListLanes(h.Client)
	})
	lanes := []LaneStatus{}      // non-nil: serialized as "lanes": [], never null
	for _, hc := range a.hosts { // iterate a.hosts (stable order) not the map
		ls, ok := results[hc.ID]
		if !ok {
			continue
		}
		for _, l := range ls {
			lanes = append(lanes, LaneStatus{
				Host: hc.ID, Name: l.Name, Queued: l.Queued, Running: l.Running,
				Concurrency: l.Concurrency, Paused: l.Paused,
			})
		}
	}
	return LanesResult{Lanes: lanes, Unavailable: unavailable, UnavailableReasons: reasons}, nil
}
