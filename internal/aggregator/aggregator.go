// Package aggregator fans out read/admin requests to every managed dugdale in
// the cluster, merges the per-host results into one globally-ordered view, and
// caches them briefly. The HTTP server (package server) calls this for the
// dashboard, missions list, and mission detail; SSE streaming is NOT here — the
// server talks to the registry's stream clients directly.
package aggregator

import (
	"encoding/json"
	"fmt"
	"time"

	"arby/internal/registry"
	"letts/pkg/lettsclient"
)

// Options configures the Aggregator.
type Options struct {
	CacheTTL      time.Duration
	FanoutTimeout time.Duration
	now           func() time.Time // test hook; nil → time.Now
}

// Aggregator fans out reads to managed dugdales, merges, and caches. SSE
// streaming is NOT here (the server uses registry stream clients directly).
type Aggregator struct {
	reg       *registry.Registry
	hosts     []hostClient                   // fan-out clients (Timeout=FanoutTimeout)
	unmanaged []hostClient                   // token-less probes for unmanaged hosts (health/version only)
	byID      map[string]*lettsclient.Client // host id → fan-out client, for Mission()
	cache     *cache
}

// New builds fan-out clients for every managed host (admin token, fan-out
// timeout), token-less health/version probes for unmanaged hosts, and the read
// cache.
func New(reg *registry.Registry, opts Options) *Aggregator {
	newClient := func(baseURL, token string) (*lettsclient.Client, error) {
		return lettsclient.New(lettsclient.Options{
			BaseURL: baseURL, Token: token, UserAgent: "arby", Timeout: opts.FanoutTimeout,
			// Fan-out reads poll dugdales across a stateful NAT/firewall with long
			// idle gaps; a pooled keep-alive that the intermediary silently evicted
			// would black-hole until the timeout and flap the host to "unavailable".
			// Dial fresh per request (like curl) — cheap for these cached reads.
			DisableKeepAlives: true,
			// Retry idempotent reads once on a transient (timeout / reset / 5xx) so
			// a single flaky hop doesn't flap a healthy dugdale to "unavailable".
			RetryReads: true,
		})
	}
	a := &Aggregator{reg: reg, byID: map[string]*lettsclient.Client{}, cache: newCache(opts.CacheTTL, opts.now)}
	for _, h := range reg.Hosts() {
		if h.Managed {
			c, err := newClient(h.BaseURL, h.AdminToken)
			if err != nil {
				continue // bad base URL already screened by registry; skip defensively
			}
			a.hosts = append(a.hosts, hostClient{ID: h.ID, Client: c})
			a.byID[h.ID] = c
			continue
		}
		// Unmanaged host: no admin token, so it can't join listings — but
		// /v1/healthz and /v1/version are token-free, so the dashboard can still
		// show it as online/offline with its version.
		c, err := newClient(h.BaseURL, "")
		if err != nil {
			continue
		}
		a.unmanaged = append(a.unmanaged, hostClient{ID: h.ID, Client: c})
	}
	return a
}

// MissionsQuery is the filter for Missions (mirrors /api/missions params).
// Order is the API-boundary string ("" / "created" / "finished") so the server
// package (which can't name the unexported sortOrder) can set it; parseOrder
// maps it to the internal sortOrder. Host ("" = all) narrows the fan-out to a
// single dugdale, so pagination/cursors stay correct under the filter.
type MissionsQuery struct {
	Status, Outcome, Lane, Mission string
	Host                           string
	Order                          string
	Cursor                         string
	Limit                          int
}

// parseOrder maps the API-boundary order string to the internal sortOrder.
// Anything other than "finished" (incl. "" and "created") sorts by creation.
func parseOrder(s string) sortOrder {
	if s == "finished" {
		return orderFinished
	}
	return orderCreated
}

// MissionsPage is the merged result.
type MissionsPage struct {
	Items       []MergedMission `json:"items"`
	NextCursor  string          `json:"next_cursor,omitempty"`
	Unavailable []string        `json:"unavailable_hosts,omitempty"`
	// UnavailableReasons maps each unavailable host id to its fan-out error text
	// (timeout / reset / HTTP status), so the UI can show WHY without journalctl.
	UnavailableReasons map[string]string `json:"unavailable_reasons,omitempty"`
}

// cacheKey normalizes a MissionsQuery into a deterministic string so identical
// requests (incl. cursor and order) share a cache entry. The leading tag keeps it
// from colliding with other cached resources (e.g. the dashboard).
func (q MissionsQuery) cacheKey() string {
	return fmt.Sprintf("missions\x00status=%s\x00outcome=%s\x00lane=%s\x00mission=%s\x00host=%s\x00order=%s\x00cursor=%s\x00limit=%d",
		q.Status, q.Outcome, q.Lane, q.Mission, q.Host, q.Order, q.Cursor, q.Limit)
}

// hostsFor narrows the fan-out set to one host when the filter names it.
// ok=false when the named host has no fan-out client (unknown or unmanaged).
func (a *Aggregator) hostsFor(host string) (hosts []hostClient, ok bool) {
	if host == "" {
		return a.hosts, true
	}
	for _, hc := range a.hosts {
		if hc.ID == host {
			return []hostClient{hc}, true
		}
	}
	return nil, false
}

// Missions fans out ListMissions per host (using each host's prior cursor),
// k-way-merges, and returns one page. kind is forced to "mission". The result
// is cached under a key derived from all query params.
//
// The returned MissionsPage.Items aliases the cached page entry and MUST be
// treated as read-only: it is shared with concurrent readers, so mutating it
// would corrupt the cached page seen by other callers.
func (a *Aggregator) Missions(q MissionsQuery) (MissionsPage, error) {
	// Normalize the effective limit BEFORE keying so Limit:0 and Limit:100
	// (which yield identical results) share one cache entry; missions() reuses
	// the same default below.
	if q.Limit <= 0 {
		q.Limit = 100
	}
	v, err := a.cache.get(q.cacheKey(), func() (any, error) {
		return a.missions(q)
	})
	if err != nil {
		return MissionsPage{}, err
	}
	return v.(MissionsPage), nil
}

func (a *Aggregator) missions(q MissionsQuery) (any, error) {
	prev, err := decodePerHostCursor(q.Cursor)
	if err != nil {
		return MissionsPage{}, err
	}
	hosts, ok := a.hostsFor(q.Host)
	if !ok {
		return MissionsPage{}, &lettsclient.HTTPError{
			Status: 400, Code: "bad_request", Message: "unknown or unmanaged host",
		}
	}
	limit := q.Limit
	if limit <= 0 {
		limit = 100
	}
	order := parseOrder(q.Order)
	results, unavailable, reasons := fanOut(hosts, func(h hostClient) ([]lettsclient.Mission, error) {
		resp, ferr := lettsclient.ListMissions(h.Client, lettsclient.ListMissionsOpts{
			Kind: "mission", Status: q.Status, Outcome: q.Outcome, Lane: q.Lane, Mission: q.Mission,
			Order: q.Order, Cursor: prev[h.ID], Limit: limit,
		})
		if ferr != nil {
			return nil, ferr
		}
		out := resp.Missions
		// client-side belt-and-suspenders: drop any 'deleting' rows from an
		// un-upgraded dugdale.
		filtered := out[:0]
		for _, m := range out {
			if m.Status != "deleting" {
				filtered = append(filtered, m)
			}
		}
		return filtered, nil
	})
	perHost := map[string][]lettsclient.Mission{}
	for host, ms := range results {
		perHost[host] = ms
	}
	items, next := mergePage(perHost, prev, order, limit)
	return MissionsPage{Items: items, NextCursor: next, Unavailable: unavailable, UnavailableReasons: reasons}, nil
}

// HostStatus is one dugdale's health, version, and queue summary. Managed=false
// means no admin token resolved for the host: it is probed for health/version
// only and carries no queue/lane data (and is absent from listings).
type HostStatus struct {
	ID            string                   `json:"id"`
	Online        bool                     `json:"online"`
	Managed       bool                     `json:"managed"`
	Version       string                   `json:"version,omitempty"`
	UptimeSeconds float64                  `json:"uptime_seconds,omitempty"`
	AppliedAt     *int64                   `json:"applied_at,omitempty"`
	Queue         lettsclient.QueueSummary `json:"queue_summary"`
	Labels        []string                 `json:"labels,omitempty"` // from letts.yaml (registry), for display and filtering
}

// LaneStatus is one lane on one host (host-tagged so the UI can group).
type LaneStatus struct {
	Host        string `json:"host"`
	Name        string `json:"name"`
	Queued      int    `json:"queued"`
	Running     int    `json:"running"`
	Concurrency int    `json:"concurrency"`
	Paused      bool   `json:"paused"`
}

// DashboardResult is the cluster overview: per-host status, every lane across
// the cluster, and the most-recent failures.
type DashboardResult struct {
	Hosts          []HostStatus    `json:"hosts"`
	Lanes          []LaneStatus    `json:"lanes"`
	RecentFailures []MergedMission `json:"recent_failures"`
	Unavailable    []string        `json:"unavailable_hosts,omitempty"`
	// UnavailableReasons maps each unavailable host id to its fan-out error text.
	UnavailableReasons map[string]string `json:"unavailable_reasons,omitempty"`
}

// dashboardData is the per-host fan-out result (dugdale info and lanes); a nil
// info means Healthz/GetDugdaleInfo failed (host offline).
type dashboardData struct {
	info  *lettsclient.DugdaleInfo
	lanes []lettsclient.LaneInfo
}

// Dashboard fans out GetDugdaleInfo, Healthz, and ListLanes per host and gathers
// recent failures via Missions(outcome=failed, order=finished). Cached.
//
// The returned DashboardResult aliases the cached entry (incl. its slices and
// RecentFailures) and MUST be treated as read-only: it is shared with
// concurrent readers, so mutating it would corrupt the cached page.
func (a *Aggregator) Dashboard() (DashboardResult, error) {
	v, err := a.cache.get("dashboard", func() (any, error) {
		return a.dashboard()
	})
	if err != nil {
		return DashboardResult{}, err
	}
	return v.(DashboardResult), nil
}

func (a *Aggregator) dashboard() (any, error) {
	results, unavailable, reasons := fanOut(a.hosts, func(h hostClient) (dashboardData, error) {
		if herr := lettsclient.Healthz(h.Client); herr != nil {
			return dashboardData{}, herr
		}
		info, ierr := lettsclient.GetDugdaleInfo(h.Client)
		if ierr != nil {
			return dashboardData{}, ierr
		}
		lanes, lerr := lettsclient.ListLanes(h.Client)
		if lerr != nil {
			return dashboardData{}, lerr
		}
		return dashboardData{info: info, lanes: lanes}, nil
	})

	var probes map[string]unmanagedStatus
	if len(a.unmanaged) > 0 {
		probes = probeUnmanaged(a.unmanaged)
	}

	// One HostStatus per configured host (registry order = sorted by id).
	// Managed hosts carry queue/lane data from the admin fan-out; unmanaged
	// hosts carry only health/version from the token-free probe.
	regHosts := a.reg.Hosts()
	hosts := make([]HostStatus, 0, len(regHosts))
	lanes := []LaneStatus{} // non-nil: serialized as "lanes": [], never null
	for _, rh := range regHosts {
		hs := HostStatus{ID: rh.ID, Managed: rh.Managed, Labels: rh.Labels}
		if rh.Managed {
			d, ok := results[rh.ID]
			hs.Online = ok
			if ok && d.info != nil {
				hs.Version = d.info.Version
				hs.UptimeSeconds = d.info.UptimeSeconds
				hs.AppliedAt = d.info.AppliedAt
				hs.Queue = d.info.QueueSummary
				for _, l := range d.lanes {
					lanes = append(lanes, LaneStatus{
						Host: rh.ID, Name: l.Name, Queued: l.Queued, Running: l.Running,
						Concurrency: l.Concurrency, Paused: l.Paused,
					})
				}
			}
		} else if st, ok := probes[rh.ID]; ok {
			hs.Online = st.online
			hs.Version = st.version
		}
		hosts = append(hosts, hs)
	}

	// Recent failures across the cluster (reuses the cached Missions path).
	fails, ferr := a.Missions(MissionsQuery{Outcome: "failed", Order: "finished", Limit: 20})
	if ferr != nil {
		return DashboardResult{}, ferr
	}
	// Merge the failure fan-out's unavailable set (+reasons) with the dashboard's.
	unavailable = mergeUnavailable(unavailable, fails.Unavailable)
	reasons = mergeReasons(reasons, fails.UnavailableReasons)

	return DashboardResult{
		Hosts:              hosts,
		Lanes:              lanes,
		RecentFailures:     fails.Items,
		Unavailable:        unavailable,
		UnavailableReasons: reasons,
	}, nil
}

// mergeUnavailable unions two sorted host-id slices, de-duped (small N).
func mergeUnavailable(a, b []string) []string {
	if len(b) == 0 {
		return a
	}
	seen := map[string]bool{}
	var out []string
	for _, s := range a {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	for _, s := range b {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}

// mergeReasons unions two host id → reason maps into a fresh map, preferring a's
// entries. Returns nil when both are empty (so the JSON field is omitted). It
// never mutates or aliases either input, so the result is safe to cache even
// when an input is itself a cached (read-only) map.
func mergeReasons(a, b map[string]string) map[string]string {
	if len(a) == 0 && len(b) == 0 {
		return nil
	}
	out := make(map[string]string, len(a)+len(b))
	for k, v := range b {
		out[k] = v
	}
	for k, v := range a { // a wins on conflict
		out[k] = v
	}
	return out
}

// Mission fetches a single mission from a specific host and tags it. Not cached
// (detail is always served fresh). An unknown/unmanaged host yields a 404
// *HTTPError so the handler maps it straight to 404.
func (a *Aggregator) Mission(host, id string) (*MergedMission, error) {
	c := a.byID[host]
	if c == nil {
		return nil, &lettsclient.HTTPError{
			Status: 404, Code: "not_found", Message: "unknown or unmanaged host",
		}
	}
	m, err := lettsclient.GetMission(c, id)
	if err != nil {
		return nil, err
	}
	return &MergedMission{Mission: *m, Host: host}, nil
}

// Config returns the host's applied config as opaque JSON (GET /v1/admin/state).
// It is intentionally NOT decoded into a typed struct: apply.AppliedState pulls
// the daemon closure (lane/mission/storage) and would defeat the pkg/ split.
func (a *Aggregator) Config(host string) (json.RawMessage, error) {
	c := a.byID[host]
	if c == nil {
		return nil, &lettsclient.HTTPError{Status: 404, Code: "not_found", Message: "unknown or unmanaged host"}
	}
	var raw json.RawMessage
	if err := c.DoJSON("GET", "/v1/admin/state", nil, nil, &raw); err != nil {
		return nil, err
	}
	return raw, nil
}

// ClientFor returns the fan-out client for a managed host, or (nil,false) if
// the host is unknown/unmanaged. Used by the server's action handlers (short
// admin requests, not streams).
func (a *Aggregator) ClientFor(host string) (*lettsclient.Client, bool) {
	c, ok := a.byID[host]
	return c, ok
}

// Invalidate drops a single cache key (after a scoped mutation).
func (a *Aggregator) Invalidate(key string) { a.cache.invalidate(key) }

// InvalidateAll drops the whole read cache (after any mutation —
// a mutation on one host can change merged pages, so blow it all away).
func (a *Aggregator) InvalidateAll() { a.cache.invalidateAll() }
