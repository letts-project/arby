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

// streamPage is one merge input: a single dugdale's list page for one outcome
// filter (or none). more reports that the dugdale has rows after this page.
type streamPage struct {
	host     string
	missions []lettsclient.Mission
	more     bool
}

// mergePage k-way-merges per-stream pages into a single globally-ordered page of
// at most limit items, and returns the next opaque arby cursor, or "" when there
// is no next page.
//
// streams maps a stream key → that stream's page (already sorted by the host in
// the requested order). The stream key is the per_host cursor key: the host id,
// or "host|outcome" when a query spans several outcomes. prevCursors maps stream
// key → the dugdale cursor used to fetch this round (decoded from the incoming
// external cursor; nil/empty for the first page).
//
// A next page exists iff the merged set was truncated to limit or some fetched
// stream reported more rows. Its cursor is seeded from prevCursors so that
// streams which contributed NOTHING to this page — shadowed out of the top-N, or
// offline/unfetched — KEEP their prior position; contributing streams then
// overwrite with the last item accepted from them. Reusing a host's own
// returned next_cursor is wrong: it points past items dropped from the merged
// top-N.
func mergePage(streams map[string]streamPage, prevCursors map[string]string, order sortOrder, limit int) ([]MergedMission, string) {
	type keyed struct {
		m   MergedMission
		key string
	}
	var merged []keyed
	more := false
	for key, sp := range streams {
		more = more || sp.more
		for _, m := range sp.missions {
			merged = append(merged, keyed{m: MergedMission{Mission: m, Host: sp.host}, key: key})
		}
	}
	sort.SliceStable(merged, func(i, j int) bool { return order.before(merged[i].m, merged[j].m) })

	if limit > 0 && len(merged) > limit {
		merged = merged[:limit]
		more = true
	}

	// Non-nil even when empty: these items go straight to JSON, and the SPA
	// expects an array ("items": []), never null.
	all := make([]MergedMission, len(merged))
	for i, k := range merged {
		all[i] = k.m
	}

	// An empty page re-encoding prevCursors would make the next request
	// identical to this one and page forever.
	if len(all) == 0 || !more {
		return all, ""
	}

	perHostCursor := map[string]string{}
	for k, c := range prevCursors {
		if c != "" {
			perHostCursor[k] = c
		}
	}
	lastByStream := map[string]MergedMission{}
	for _, k := range merged {
		lastByStream[k.key] = k.m // page sorted DESC; last write = last accepted
	}
	for key, m := range lastByStream {
		lc := lettsclient.ListCursor{MissionID: m.MissionID}
		if order == orderFinished {
			lc.TimeFinishedMs = order.keyOf(m.Mission)
		} else {
			lc.TimeCreatedMs = order.keyOf(m.Mission)
		}
		perHostCursor[key] = lettsclient.EncodeListCursor(lc)
	}
	wrapper := struct {
		PerHost map[string]string `json:"per_host"`
	}{PerHost: perHostCursor}
	b, _ := json.Marshal(wrapper)
	return all, base64.RawURLEncoding.EncodeToString(b)
}

// decodePerHostCursor parses an external arby cursor into per-stream dugdale
// cursor strings, keyed as in mergePage. Empty string → empty map (first page).
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
