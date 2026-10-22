package aggregator

import (
	"encoding/base64"
	"encoding/json"
	"sort"
	"testing"

	"letts/pkg/lettsclient"
)

func decodeExt(t *testing.T, s string) map[string]string {
	t.Helper()
	if s == "" {
		return map[string]string{}
	}
	raw, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		t.Fatal(err)
	}
	var w struct {
		PerHost map[string]string `json:"per_host"`
	}
	if err := json.Unmarshal(raw, &w); err != nil {
		t.Fatal(err)
	}
	return w.PerHost
}

func idsOf(items []MergedMission) []string {
	out := make([]string, len(items))
	for i, m := range items {
		out[i] = m.MissionID
	}
	return out
}
func eqIDs(a, b []string) bool {
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

// hostStreams wraps per-host pages as merge streams keyed by host id, none of
// which reports more rows.
func hostStreams(perHost map[string][]lettsclient.Mission) map[string]streamPage {
	out := make(map[string]streamPage, len(perHost))
	for host, ms := range perHost {
		out[host] = streamPage{host: host, missions: ms}
	}
	return out
}

func keysOf(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func TestMergeGlobalOrderCreated(t *testing.T) {
	perHost := map[string][]lettsclient.Mission{
		"s1": {mkMission("s1-30", 30, 0, ""), mkMission("s1-10", 10, 0, "")},
		"s2": {mkMission("s2-20", 20, 0, ""), mkMission("s2-05", 5, 0, "")},
	}
	page, _ := mergePage(hostStreams(perHost), nil, orderCreated, 10)
	want := []string{"s1-30", "s2-20", "s1-10", "s2-05"}
	if !eqIDs(idsOf(page), want) {
		t.Fatalf("order: got %v want %v", idsOf(page), want)
	}
}

func TestMergePaginationStableNoDupes(t *testing.T) {
	perHost := map[string][]lettsclient.Mission{
		"s1": {mkMission("s1-30", 30, 0, ""), mkMission("s1-10", 10, 0, "")},
		"s2": {mkMission("s2-20", 20, 0, ""), mkMission("s2-05", 5, 0, "")},
	}
	page1, next1 := mergePage(hostStreams(perHost), nil, orderCreated, 2)
	if !eqIDs(idsOf(page1), []string{"s1-30", "s2-20"}) {
		t.Fatalf("page1 ids=%v", idsOf(page1))
	}
	if next1 == "" {
		t.Fatal("truncated page must carry a next cursor")
	}
	pc := decodeExt(t, next1)
	if c, _ := lettsclient.DecodeListCursor(pc["s1"]); c.TimeCreatedMs != 30 || c.MissionID != "s1-30" {
		t.Errorf("s1 cursor=%+v", c)
	}
	if c, _ := lettsclient.DecodeListCursor(pc["s2"]); c.TimeCreatedMs != 20 || c.MissionID != "s2-20" {
		t.Errorf("s2 cursor=%+v", c)
	}
	perHost2 := map[string][]lettsclient.Mission{
		"s1": {mkMission("s1-10", 10, 0, "")},
		"s2": {mkMission("s2-05", 5, 0, "")},
	}
	page2, next2 := mergePage(hostStreams(perHost2), pc, orderCreated, 2)
	if !eqIDs(idsOf(page2), []string{"s1-10", "s2-05"}) {
		t.Fatalf("page2 ids=%v", idsOf(page2))
	}
	if next2 != "" {
		t.Errorf("last page next=%q, want empty", next2)
	}
}

func TestMergeFinishedOrder(t *testing.T) {
	streams := map[string]streamPage{
		"s1": {host: "s1", missions: []lettsclient.Mission{mkMission("s1", 1, 500, "failed")}, more: true},
		"s2": {host: "s2", missions: []lettsclient.Mission{mkMission("s2", 99, 400, "failed")}},
	}
	page, next := mergePage(streams, nil, orderFinished, 10)
	if !eqIDs(idsOf(page), []string{"s1", "s2"}) {
		t.Fatalf("finished order ids=%v", idsOf(page))
	}
	if c, _ := lettsclient.DecodeListCursor(decodeExt(t, next)["s1"]); c.TimeFinishedMs != 500 || c.TimeCreatedMs != 0 {
		t.Errorf("s1 finished cursor=%+v", c)
	}
}

func TestMergeEmpty(t *testing.T) {
	page, next := mergePage(map[string]streamPage{}, nil, orderCreated, 10)
	if len(page) != 0 || next != "" {
		t.Errorf("empty merge: page=%v next=%q", page, next)
	}
}

func TestMergeNoNextCursorWhenEveryStreamExhausted(t *testing.T) {
	perHost := map[string][]lettsclient.Mission{
		"s1": {mkMission("s1-30", 30, 0, ""), mkMission("s1-10", 10, 0, "")},
		"s2": {mkMission("s2-20", 20, 0, "")},
	}
	page, next := mergePage(hostStreams(perHost), nil, orderCreated, 3)
	if len(page) != 3 {
		t.Fatalf("page=%v, want 3 items", idsOf(page))
	}
	if next != "" {
		t.Errorf("next=%q, want empty (not truncated, no stream has more)", next)
	}
}

func TestMergeNextCursorWhenAStreamHasMore(t *testing.T) {
	streams := map[string]streamPage{
		"s1": {host: "s1", missions: []lettsclient.Mission{mkMission("s1-30", 30, 0, "")}, more: true},
		"s2": {host: "s2", missions: []lettsclient.Mission{mkMission("s2-20", 20, 0, "")}},
	}
	page, next := mergePage(streams, nil, orderCreated, 10)
	if len(page) != 2 {
		t.Fatalf("page=%v, want 2 items", idsOf(page))
	}
	if next == "" {
		t.Fatal("next empty, want a cursor (s1 reported more rows)")
	}
	if c, _ := lettsclient.DecodeListCursor(decodeExt(t, next)["s1"]); c.MissionID != "s1-30" {
		t.Errorf("s1 cursor=%+v, want after s1-30", c)
	}
}

func TestMergeEmptyPageEndsEvenIfAStreamHasMore(t *testing.T) {
	prev := map[string]string{"s1": lettsclient.EncodeListCursor(lettsclient.ListCursor{TimeCreatedMs: 50, MissionID: "s1-50"})}
	streams := map[string]streamPage{"s1": {host: "s1", more: true}}
	page, next := mergePage(streams, prev, orderCreated, 10)
	if len(page) != 0 || next != "" {
		t.Errorf("page=%v next=%q, want empty page and no cursor", idsOf(page), next)
	}
}

func TestMergeTiebreakByMissionIDDesc(t *testing.T) {
	// same sortKey across hosts → tiebreak mission_id DESC
	perHost := map[string][]lettsclient.Mission{
		"s1": {mkMission("aaa", 50, 0, "")},
		"s2": {mkMission("zzz", 50, 0, "")},
	}
	page, _ := mergePage(hostStreams(perHost), nil, orderCreated, 10)
	if !eqIDs(idsOf(page), []string{"zzz", "aaa"}) {
		t.Fatalf("tiebreak ids=%v want [zzz aaa]", idsOf(page))
	}
}

func TestDecodePerHostCursorRoundTrip(t *testing.T) {
	perHost := map[string][]lettsclient.Mission{
		"s1": {mkMission("s1-30", 30, 0, "")},
		"s2": {mkMission("s2-20", 20, 0, "")},
	}
	_, next := mergePage(hostStreams(perHost), nil, orderCreated, 1)
	got, err := decodePerHostCursor(next)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 || got["s1"] == "" {
		t.Fatalf("decoded per-host=%v", got)
	}
	// empty string → empty map, no error
	if m, err := decodePerHostCursor(""); err != nil || len(m) != 0 {
		t.Errorf("empty: m=%v err=%v", m, err)
	}
}

// fetchAfter simulates a dugdale serving its (DESC-sorted) list from a cursor:
// returns items strictly after (cursor.key, cursor.MissionID) in
// (key DESC, id DESC) order, up to limit. Empty cursor → from the start.
func fetchAfter(full []lettsclient.Mission, order sortOrder, cursorStr string, limit int) []lettsclient.Mission {
	cur, _ := lettsclient.DecodeListCursor(cursorStr)
	has := cursorStr != ""
	ck := cur.TimeCreatedMs
	if order == orderFinished {
		ck = cur.TimeFinishedMs
	}
	var out []lettsclient.Mission
	for _, m := range full {
		if has {
			k := order.keyOf(m)
			if !(k < ck || (k == ck && m.MissionID < cur.MissionID)) {
				continue // not strictly after the cursor
			}
		}
		out = append(out, m)
		if len(out) == limit {
			break
		}
	}
	return out
}

// streamAfter is fetchAfter shaped as a dugdale list response: more is set when
// rows remain after the returned page.
func streamAfter(host string, full []lettsclient.Mission, order sortOrder, cursorStr string, limit int) streamPage {
	ms := fetchAfter(full, order, cursorStr, limit+1)
	sp := streamPage{host: host, missions: ms}
	if len(ms) > limit {
		sp.missions, sp.more = ms[:limit], true
	}
	return sp
}

func TestMergeMultiPageCarryForwardNoDupes(t *testing.T) {
	// 3 hosts, limit 3. s3 contributes on page 1 (s3-80), then is shadowed out
	// of the top-N on later pages — its cursor MUST carry forward so s3-80 is
	// never served twice and s3 resumes after it.
	full := map[string][]lettsclient.Mission{
		"s1": {mkMission("s1-100", 100, 0, ""), mkMission("s1-70", 70, 0, ""), mkMission("s1-69", 69, 0, ""), mkMission("s1-10", 10, 0, "")},
		"s2": {mkMission("s2-90", 90, 0, ""), mkMission("s2-68", 68, 0, ""), mkMission("s2-67", 67, 0, ""), mkMission("s2-09", 9, 0, "")},
		"s3": {mkMission("s3-80", 80, 0, ""), mkMission("s3-05", 5, 0, ""), mkMission("s3-04", 4, 0, "")},
	}
	seen := map[string]int{}
	ext := ""
	total := 0
	pages := 0
	for page := 0; page < 50; page++ {
		prev, err := decodePerHostCursor(ext)
		if err != nil {
			t.Fatal(err)
		}
		streams := map[string]streamPage{}
		for host, list := range full {
			streams[host] = streamAfter(host, list, orderCreated, prev[host], 3)
		}
		items, next := mergePage(streams, prev, orderCreated, 3)
		if len(items) == 0 {
			t.Fatalf("page %d is empty: the previous page advertised a next page that does not exist", page)
		}
		pages++
		for _, m := range items {
			seen[m.MissionID]++
			total++
			if seen[m.MissionID] > 1 {
				t.Fatalf("DUPLICATE %s on page %d (cursor carry-forward broken)", m.MissionID, page)
			}
		}
		if next == "" {
			break
		}
		ext = next
	}
	if total != 11 || len(seen) != 11 {
		t.Fatalf("want 11 unique items across all pages, got total=%d unique=%d", total, len(seen))
	}
	if pages != 4 {
		t.Errorf("pages=%d, want 4 (11 items at 3 per page)", pages)
	}
}

func TestMergeOfflineHostKeepsCursor(t *testing.T) {
	// s2 is offline this round: present in prevCursors but absent from streams
	// (fan-out skipped it). Its prior cursor must carry forward unchanged while
	// s1 still has more rows.
	s2Cursor := lettsclient.EncodeListCursor(lettsclient.ListCursor{TimeCreatedMs: 50, MissionID: "s2-50"})
	prev := map[string]string{"s2": s2Cursor}
	streams := map[string]streamPage{
		"s1": {host: "s1", missions: []lettsclient.Mission{mkMission("s1-30", 30, 0, "")}, more: true},
	}
	_, next := mergePage(streams, prev, orderCreated, 10)
	got := decodeExt(t, next)
	if got["s2"] != s2Cursor {
		t.Errorf("offline host s2 cursor changed: got %q want %q", got["s2"], s2Cursor)
	}
	if got["s1"] == "" {
		t.Error("contributing host s1 should have a cursor")
	}
}

func TestMergeOfflineHostAloneDoesNotKeepNextPage(t *testing.T) {
	prev := map[string]string{"s2": lettsclient.EncodeListCursor(lettsclient.ListCursor{TimeCreatedMs: 50, MissionID: "s2-50"})}
	streams := map[string]streamPage{
		"s1": {host: "s1", missions: []lettsclient.Mission{mkMission("s1-30", 30, 0, "")}},
	}
	page, next := mergePage(streams, prev, orderCreated, 10)
	if !eqIDs(idsOf(page), []string{"s1-30"}) {
		t.Fatalf("page=%v, want [s1-30]", idsOf(page))
	}
	if next != "" {
		t.Errorf("next=%q, want empty (only the offline host holds a cursor)", next)
	}
}

func TestMergeStreamKeysTagRealHost(t *testing.T) {
	streams := map[string]streamPage{
		"s1|failed":  {host: "s1", missions: []lettsclient.Mission{mkMission("f-50", 50, 0, "failed")}},
		"s1|crashed": {host: "s1", missions: []lettsclient.Mission{mkMission("c-40", 40, 0, "crashed")}, more: true},
		"s2|failed":  {host: "s2", missions: []lettsclient.Mission{mkMission("f-45", 45, 0, "failed")}},
	}
	page, next := mergePage(streams, nil, orderCreated, 10)
	if !eqIDs(idsOf(page), []string{"f-50", "f-45", "c-40"}) {
		t.Fatalf("page=%v, want [f-50 f-45 c-40]", idsOf(page))
	}
	wantHost := map[string]string{"f-50": "s1", "f-45": "s2", "c-40": "s1"}
	for _, m := range page {
		if m.Host != wantHost[m.MissionID] {
			t.Errorf("%s host=%q, want %q", m.MissionID, m.Host, wantHost[m.MissionID])
		}
	}
	got := decodeExt(t, next)
	if keys := keysOf(got); !eqIDs(keys, []string{"s1|crashed", "s1|failed", "s2|failed"}) {
		t.Fatalf("cursor keys=%v, want the stream keys", keys)
	}
	if c, _ := lettsclient.DecodeListCursor(got["s1|crashed"]); c.MissionID != "c-40" {
		t.Errorf("s1|crashed cursor=%+v, want after c-40", c)
	}
}
