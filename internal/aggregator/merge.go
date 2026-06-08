package aggregator

import (
	"encoding/base64"
	"encoding/json"
	"sort"

	"letts/pkg/lettsclient"
)

// sortOrder selects the merge key.
type sortOrder int

const (
	orderCreated  sortOrder = iota // by time_created
	orderFinished                  // by time_finished (dashboard "last failures")
)

// MergedMission is a mission tagged with the host it came from. Host is the
// extra field arby adds so detail/actions can route back to the right dugdale.
type MergedMission struct {
	lettsclient.Mission
	Host string `json:"host"`
}

func (o sortOrder) keyOf(m lettsclient.Mission) int64 {
	if o == orderFinished {
		return m.TimeFinishedMs
	}
	return m.TimeCreatedMs
}

// before reports whether a should sort BEFORE b in the merged page, i.e. a is
// "greater" under (key DESC, mission_id DESC) — mirrors the dugdale ORDER BY.
func (o sortOrder) before(a, b MergedMission) bool {
	ka, kb := o.keyOf(a.Mission), o.keyOf(b.Mission)
	if ka != kb {
		return ka > kb
	}
	return a.MissionID > b.MissionID
}

// mergePage k-way-merges per-host pages into a single globally-ordered page of
// at most limit items, and returns the next opaque arby cursor.
//
// perHost maps host id → that host's returned missions (already sorted by the
// host in the requested order). prevCursors maps host id → the per-host cursor
// that was used to fetch this round (decoded from the incoming external cursor;
// nil/empty for the first page).
//
// The next cursor is seeded from prevCursors so that hosts which contributed
// NOTHING to this page — shadowed out of the top-N (hosts > limit), or
// offline/unfetched — KEEP their prior position; contributing hosts
// then overwrite with the last item accepted from them. Reusing a host's own
// returned next_cursor is wrong: it points past items dropped from the merged
// top-N.
func mergePage(perHost map[string][]lettsclient.Mission, prevCursors map[string]string, order sortOrder, limit int) ([]MergedMission, string) {
	// Non-nil even when empty: these items go straight to JSON, and the SPA
	// expects an array ("items": []), never null.
	all := []MergedMission{}
	for host, missions := range perHost {
		for _, m := range missions {
			all = append(all, MergedMission{Mission: m, Host: host})
		}
	}
	sort.SliceStable(all, func(i, j int) bool { return order.before(all[i], all[j]) })

	if limit > 0 && len(all) > limit {
		all = all[:limit]
	}

	if len(all) == 0 {
		// Every fetched host returned nothing at/after its cursor → all hosts
		// are exhausted at their positions → end of pages. Note: if an offline
		// host still held a non-empty prior cursor, it is intentionally dropped
		// here (re-encoding prevCursors would loop forever on persistently-empty
		// rounds); offline hosts are best-effort and re-listed fresh later.
		return all, ""
	}

	// Seed with the incoming cursors so zero-contributing / offline hosts keep
	// their prior position; contributing hosts overwrite below.
	perHostCursor := map[string]string{}
	for h, c := range prevCursors {
		if c != "" {
			perHostCursor[h] = c
		}
	}
	lastByHost := map[string]MergedMission{}
	for _, m := range all {
		lastByHost[m.Host] = m // page sorted DESC; last write = last accepted
	}
	for host, m := range lastByHost {
		lc := lettsclient.ListCursor{MissionID: m.MissionID}
		if order == orderFinished {
			lc.TimeFinishedMs = order.keyOf(m.Mission)
		} else {
			lc.TimeCreatedMs = order.keyOf(m.Mission)
		}
		perHostCursor[host] = lettsclient.EncodeListCursor(lc)
	}
	wrapper := struct {
		PerHost map[string]string `json:"per_host"`
	}{PerHost: perHostCursor}
	b, _ := json.Marshal(wrapper)
	return all, base64.RawURLEncoding.EncodeToString(b)
}

// decodePerHostCursor parses an external arby cursor into per-host dugdale
// cursor strings. Empty string → empty map (first page). Used by the list
// handler to feed each host's ListMissionsOpts.Cursor.
func decodePerHostCursor(s string) (map[string]string, error) {
	if s == "" {
		return map[string]string{}, nil
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return nil, err
	}
	var w struct {
		PerHost map[string]string `json:"per_host"`
	}
	if err := json.Unmarshal(raw, &w); err != nil {
		return nil, err
	}
	if w.PerHost == nil {
		w.PerHost = map[string]string{}
	}
	return w.PerHost, nil
}
