package aggregator

import (
	"log"
	"sort"
	"sync"

	"letts/pkg/lettsclient"
)

// hostClient pairs a host id with its admin client (decouples aggregator from
// the registry package for testability).
type hostClient struct {
	ID     string
	Client *lettsclient.Client
}

// fanOut runs fn for every host in parallel. Returns host id → result for hosts
// that succeeded, a sorted slice of host ids whose fn errored (treated as
// unavailable), and a host id → reason map carrying each failure's error text.
// fn errors never abort the others.
func fanOut[T any](hosts []hostClient, fn func(hostClient) (T, error)) (map[string]T, []string, map[string]string) {
	var mu sync.Mutex
	results := make(map[string]T, len(hosts))
	var unavailable []string
	reasons := map[string]string{}

	var wg sync.WaitGroup
	for _, h := range hosts {
		wg.Add(1)
		go func(h hostClient) {
			defer wg.Done()
			v, err := fn(h)
			if err != nil {
				// Surface WHY a host is unavailable (timeout / connection reset /
				// HTTP status) — both to the log AND to the API (reasons), so the
				// UI can show the cause without an ssh into journalctl. The error
				// carries the dugdale URL and status, never tokens. Tune the deadline
				// with --fanout-timeout.
				log.Printf("arby: fan-out to host %q failed (marking unavailable): %v", h.ID, err)
				mu.Lock()
				unavailable = append(unavailable, h.ID)
				reasons[h.ID] = err.Error()
				mu.Unlock()
				return
			}
			mu.Lock()
			results[h.ID] = v
			mu.Unlock()
		}(h)
	}
	wg.Wait()
	sort.Strings(unavailable)
	return results, unavailable, reasons
}

// unmanagedStatus is the token-free probe result for one unmanaged host.
type unmanagedStatus struct {
	online  bool
	version string
}

// probeUnmanaged checks every unmanaged host's /v1/healthz and /v1/version in
// parallel (both endpoints are token-free). A failed probe just means the host
// is offline — it does not join unavailable_hosts (which tracks gaps in the
// admin-scoped data) and is not logged, since unmanaged hosts are expected to
// stay in this state indefinitely.
func probeUnmanaged(hosts []hostClient) map[string]unmanagedStatus {
	var mu sync.Mutex
	out := make(map[string]unmanagedStatus, len(hosts))
	var wg sync.WaitGroup
	for _, h := range hosts {
		wg.Add(1)
		go func(h hostClient) {
			defer wg.Done()
			var st unmanagedStatus
			if err := lettsclient.Healthz(h.Client); err == nil {
				st.online = true
				var v struct {
					Version string `json:"version"`
				}
				if verr := h.Client.DoJSON("GET", "/v1/version", nil, nil, &v); verr == nil {
					st.version = v.Version
				}
			}
			mu.Lock()
			out[h.ID] = st
			mu.Unlock()
		}(h)
	}
	wg.Wait()
	return out
}
