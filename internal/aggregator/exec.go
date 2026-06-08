package aggregator

import (
	"io"
	"strconv"

	"letts/pkg/lettsclient"
)

// ExecsQuery filters the exec list (kind=exec). Mirrors MissionsQuery plus GroupID.
// Order is the API-boundary string ("" / "created" / "finished"); parseOrder
// maps it to the internal sortOrder, exactly as Missions does. Host ("" = all)
// narrows the fan-out to a single dugdale.
type ExecsQuery struct {
	Status, Outcome, GroupID string
	Host                     string
	Order                    string
	Cursor                   string
	Limit                    int
}

// cacheKey normalizes an ExecsQuery into a deterministic string. The leading
// "exec" tag keeps exec pages from colliding with the missions cache (which is
// tagged "missions") even when every other field matches.
func (q ExecsQuery) cacheKey() string {
	return "exec\x00status=" + q.Status + "\x00outcome=" + q.Outcome + "\x00group=" + q.GroupID +
		"\x00host=" + q.Host + "\x00order=" + q.Order + "\x00cursor=" + q.Cursor + "\x00limit=" + strconv.Itoa(q.Limit)
}

// Execs fans out ListMissions(kind=exec) per host (using each host's prior
// cursor), k-way-merges, and returns one page. Same MissionsPage shape and
// cursor scheme as Missions; the result is cached under the exec-tagged key.
//
// The returned MissionsPage.Items aliases the cached page entry and MUST be
// treated as read-only (shared with concurrent readers).
func (a *Aggregator) Execs(q ExecsQuery) (MissionsPage, error) {
	// Normalize the effective limit BEFORE keying so Limit:0 and Limit:100
	// (identical results) share one cache entry; execs() reuses the same default.
	if q.Limit <= 0 {
		q.Limit = 100
	}
	v, err := a.cache.get(q.cacheKey(), func() (any, error) { return a.execs(q) })
	if err != nil {
		return MissionsPage{}, err
	}
	return v.(MissionsPage), nil
}

func (a *Aggregator) execs(q ExecsQuery) (any, error) {
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
	order := parseOrder(q.Order)
	results, unavailable, reasons := fanOut(hosts, func(h hostClient) ([]lettsclient.Mission, error) {
		resp, ferr := lettsclient.ListMissions(h.Client, lettsclient.ListMissionsOpts{
			Kind: "exec", Status: q.Status, Outcome: q.Outcome, GroupID: q.GroupID,
			Order: q.Order, Cursor: prev[h.ID], Limit: q.Limit,
		})
		if ferr != nil {
			return nil, ferr
		}
		// client-side belt-and-suspenders: drop any 'deleting' rows from an
		// un-upgraded dugdale (mirrors the missions path).
		out := resp.Missions
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
	items, next := mergePage(perHost, prev, order, q.Limit)
	return MissionsPage{Items: items, NextCursor: next, Unavailable: unavailable, UnavailableReasons: reasons}, nil
}

// ExecDetail is one exec mission plus a best-effort script preview (first 4 KiB).
// The detail record omits the script staging_id (it returns only input/output
// refs), so arby looks it up via the admin staging listing.
type ExecDetail struct {
	MergedMission
	ScriptPreview   string `json:"script_preview,omitempty"`
	ScriptTruncated bool   `json:"script_truncated,omitempty"`
	ScriptStagingID string `json:"script_staging_id,omitempty"`
}

// ExecDetail fetches a single exec mission from a specific host, tags it, and
// attaches a best-effort script preview. An unknown/unmanaged host yields a 404
// *HTTPError. A preview lookup failure NEVER fails the detail — the mission is
// still returned with an empty preview.
func (a *Aggregator) ExecDetail(host, id string) (*ExecDetail, error) {
	c := a.byID[host]
	if c == nil {
		return nil, &lettsclient.HTTPError{Status: 404, Code: "not_found", Message: "unknown or unmanaged host"}
	}
	m, err := lettsclient.GetMission(c, id)
	if err != nil {
		return nil, err
	}
	d := &ExecDetail{MergedMission: MergedMission{Mission: *m, Host: host}}
	// Best-effort script preview; never fail the detail on preview errors.
	if sl, e := lettsclient.ListStaging(c, lettsclient.ListStagingOpts{MissionID: id, RefKind: "script", Limit: 1}); e == nil && len(sl.Staging) > 0 {
		sid := sl.Staging[0].StagingID
		d.ScriptStagingID = sid
		if body, _, e2 := lettsclient.GetStaging(c, sid, "bytes=0-4095"); e2 == nil {
			buf, _ := io.ReadAll(io.LimitReader(body, 4096))
			_ = body.Close()
			d.ScriptPreview = string(buf)
			d.ScriptTruncated = sl.Staging[0].Size > int64(len(buf))
		}
	}
	return d, nil
}

// ExecGroupSummary tallies the members of an exec group by terminal/active state.
type ExecGroupSummary struct {
	Total   int `json:"total"`
	Success int `json:"success"`
	Failed  int `json:"failed"`
	Running int `json:"running"`
	Queued  int `json:"queued"`
}

// ExecGroup gathers all exec missions sharing a group_id across the cluster,
// host-tagged, with a status/outcome tally.
type ExecGroup struct {
	GroupID            string            `json:"group_id"`
	Items              []MergedMission   `json:"items"`
	Summary            ExecGroupSummary  `json:"summary"`
	Unavailable        []string          `json:"unavailable_hosts,omitempty"`
	UnavailableReasons map[string]string `json:"unavailable_reasons,omitempty"`
}

// ExecGroup fans out ListMissions(kind=exec, group_id=…) per host (large limit —
// a group is bounded), tags each member by host, and tallies the summary. Not
// cached: a group view polls and is cheap relative to the full list. Iterating
// a.hosts (not the results map) keeps member order stable across calls.
func (a *Aggregator) ExecGroup(groupID string) (*ExecGroup, error) {
	results, unavailable, reasons := fanOut(a.hosts, func(h hostClient) ([]lettsclient.Mission, error) {
		resp, ferr := lettsclient.ListMissions(h.Client, lettsclient.ListMissionsOpts{Kind: "exec", GroupID: groupID, Limit: 1000})
		if ferr != nil {
			return nil, ferr
		}
		// client-side belt-and-suspenders: drop any 'deleting' rows from an
		// un-upgraded dugdale (mirrors the missions/exec list paths) — they would
		// otherwise inflate Total without landing in any summary bucket.
		out := resp.Missions
		filtered := out[:0]
		for _, m := range out {
			if m.Status != "deleting" {
				filtered = append(filtered, m)
			}
		}
		return filtered, nil
	})
	g := &ExecGroup{
		GroupID: groupID, Unavailable: unavailable, UnavailableReasons: reasons,
		Items: []MergedMission{}, // non-nil: serialized as "items": [], never null
	}
	for _, hc := range a.hosts {
		for _, m := range results[hc.ID] {
			g.Items = append(g.Items, MergedMission{Mission: m, Host: hc.ID})
			g.Summary.Total++
			switch {
			case m.Status == "running":
				g.Summary.Running++
			case m.Status == "queued":
				g.Summary.Queued++
			case m.Outcome == "success":
				g.Summary.Success++
			case m.Outcome != "":
				g.Summary.Failed++
			}
		}
	}
	return g, nil
}
