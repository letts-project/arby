package aggregator

import (
	"encoding/base64"
	"encoding/json"
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

func TestMergeGlobalOrderCreated(t *testing.T) {
	perHost := map[string][]lettsclient.Mission{
		"s1": {mkMission("s1-30", 30, 0, ""), mkMission("s1-10", 10, 0, "")},
		"s2": {mkMission("s2-20", 20, 0, ""), mkMission("s2-05", 5, 0, "")},
	}
	page, _ := mergePage(perHost, nil, orderCreated, 10)
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
	page1, next1 := mergePage(perHost, nil, orderCreated, 2)
	if !eqIDs(idsOf(page1), []string{"s1-30", "s2-20"}) {
		t.Fatalf("page1 ids=%v", idsOf(page1))
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
	page2, _ := mergePage(perHost2, nil, orderCreated, 2)
	if !eqIDs(idsOf(page2), []string{"s1-10", "s2-05"}) {
		t.Fatalf("page2 ids=%v", idsOf(page2))
	}
}

func TestMergeFinishedOrder(t *testing.T) {
	perHost := map[string][]lettsclient.Mission{
		"s1": {mkMission("s1", 1, 500, "failed")},
		"s2": {mkMission("s2", 99, 400, "failed")},
	}
	page, next := mergePage(perHost, nil, orderFinished, 10)
	if !eqIDs(idsOf(page), []string{"s1", "s2"}) {
		t.Fatalf("finished order ids=%v", idsOf(page))
	}
	if c, _ := lettsclient.DecodeListCursor(decodeExt(t, next)["s1"]); c.TimeFinishedMs != 500 || c.TimeCreatedMs != 0 {
		t.Errorf("s1 finished cursor=%+v", c)
	}
}

func TestMergeEmpty(t *testing.T) {
	page, next := mergePage(map[string][]lettsclient.Mission{}, nil, orderCreated, 10)
	if len(page) != 0 || next != "" {
		t.Errorf("empty merge: page=%v next=%q", page, next)
	}
}

func TestMergeTiebreakByMissionIDDesc(t *testing.T) {
	// same sortKey across hosts → tiebreak mission_id DESC
	perHost := map[string][]lettsclient.Mission{
		"s1": {mkMission("aaa", 50, 0, "")},
		"s2": {mkMission("zzz", 50, 0, "")},
	}
	page, _ := mergePage(perHost, nil, orderCreated, 10)
	if !eqIDs(idsOf(page), []string{"zzz", "aaa"}) {
		t.Fatalf("tiebreak ids=%v want [zzz aaa]", idsOf(page))
	}
}

func TestDecodePerHostCursorRoundTrip(t *testing.T) {
	perHost := map[string][]lettsclient.Mission{
		"s1": {mkMission("s1-30", 30, 0, "")},
		"s2": {mkMission("s2-20", 20, 0, "")},
	}
	_, next := mergePage(perHost, nil, orderCreated, 10)
	got, err := decodePerHostCursor(next)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 2 || got["s1"] == "" || got["s2"] == "" {
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
	for page := 0; page < 50; page++ {
		prev, err := decodePerHostCursor(ext)
		if err != nil {
			t.Fatal(err)
		}
		perHost := map[string][]lettsclient.Mission{}
		for host, list := range full {
			perHost[host] = fetchAfter(list, orderCreated, prev[host], 3)
		}
		items, next := mergePage(perHost, prev, orderCreated, 3)
		if len(items) == 0 {
			break
		}
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
}

func TestMergeOfflineHostKeepsCursor(t *testing.T) {
	// s2 is offline this round: present in prevCursors but absent from perHost
	// (fan-out skipped it). Its prior cursor must carry forward unchanged.
	s2Cursor := lettsclient.EncodeListCursor(lettsclient.ListCursor{TimeCreatedMs: 50, MissionID: "s2-50"})
	prev := map[string]string{"s2": s2Cursor}
	perHost := map[string][]lettsclient.Mission{
		"s1": {mkMission("s1-30", 30, 0, "")},
		// s2 absent — offline
	}
	_, next := mergePage(perHost, prev, orderCreated, 10)
	got := decodeExt(t, next)
	if got["s2"] != s2Cursor {
		t.Errorf("offline host s2 cursor changed: got %q want %q", got["s2"], s2Cursor)
	}
	if got["s1"] == "" {
		t.Error("contributing host s1 should have a cursor")
	}
}
