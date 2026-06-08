package server

import (
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"letts/pkg/lettsclient"
)

// sseClient is given a timeout as a belt-and-suspenders against a hung stream:
// the stub closes after the terminal `done` (events) / last line (output), so
// io.ReadAll returns cleanly, but a bug that kept the relay open would otherwise
// hang the test forever. 5s is far longer than these in-memory streams need.
var sseClient = &http.Client{Timeout: 5 * time.Second}

// readSSE GETs an SSE endpoint (optionally with a Last-Event-ID header) and
// returns the full body as a string after the stub closes the connection.
func readSSE(t *testing.T, url, lastEventID string) (string, int) {
	t.Helper()
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		t.Fatalf("new request %s: %v", url, err)
	}
	if lastEventID != "" {
		req.Header.Set("Last-Event-ID", lastEventID)
	}
	resp, err := sseClient.Do(req)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body %s: %v", url, err)
	}
	return string(body), resp.StatusCode
}

// orderedIndexes returns the position of each needle in s, requiring every
// needle to be present and to appear strictly after the previous one.
func assertOrdered(t *testing.T, s string, needles ...string) {
	t.Helper()
	prev := -1
	for _, n := range needles {
		i := strings.Index(s, n)
		if i < 0 {
			t.Fatalf("missing %q in:\n%s", n, s)
		}
		if i <= prev {
			t.Fatalf("%q out of order (at %d, want > %d) in:\n%s", n, i, prev, s)
		}
		prev = i
	}
}

func newEventStub(t *testing.T) map[string]*stub {
	return map[string]*stub{
		"s1": newStub(t, []lettsclient.Mission{mkMission("m1", 10, 0, "")}),
	}
}

func TestEventsRelayFramesInOrder(t *testing.T) {
	ts := newTestServer(t, newEventStub(t))

	body, code := readSSE(t, ts.URL+"/api/missions/s1/m1/events", "")
	if code != 200 {
		t.Fatalf("status = %d, want 200", code)
	}
	// id:/data: frames for every seq, in order, ending with the done event.
	assertOrdered(t, body,
		"id: 1", `"event":"queued"`,
		"id: 2", `"event":"running"`,
		"id: 3", `"event":"progress"`,
		"id: 4", `"event":"done"`,
	)
	if !strings.Contains(body, `"outcome":"success"`) {
		t.Errorf("done frame missing outcome in:\n%s", body)
	}
}

func TestEventsRelayResumeViaLastEventID(t *testing.T) {
	ts := newTestServer(t, newEventStub(t))

	// Last-Event-ID: 2 → upstream ?from=2 → only seq 3 and 4 emitted.
	body, code := readSSE(t, ts.URL+"/api/missions/s1/m1/events", "2")
	if code != 200 {
		t.Fatalf("status = %d, want 200", code)
	}
	if strings.Contains(body, "id: 1") || strings.Contains(body, "id: 2") {
		t.Fatalf("resume leaked seq 1/2 in:\n%s", body)
	}
	assertOrdered(t, body, "id: 3", `"event":"progress"`, "id: 4", `"event":"done"`)
}

func TestOutputRelayFrames(t *testing.T) {
	ts := newTestServer(t, newEventStub(t))

	body, code := readSSE(t, ts.URL+"/api/missions/s1/m1/output", "")
	if code != 200 {
		t.Fatalf("status = %d, want 200", code)
	}
	// data: frames for each combined-envelope line, in order. No id: line —
	// output has no seq.
	assertOrdered(t, body,
		`data: {"t":1,"stream":"stdout","data":"hello\n"}`,
		`data: {"t":2,"stream":"stderr","data":"warn\n"}`,
	)
	if strings.Contains(body, "id: ") {
		t.Errorf("output frames must not carry an id: line, got:\n%s", body)
	}
}

// TestOutputRelayReportsStreamError: when the upstream scan dies mid-stream
// (here: a line beyond the scanner cap), the relay must emit a stream_error
// event instead of ending the SSE as if the output completed.
func TestOutputRelayReportsStreamError(t *testing.T) {
	stubs := newEventStub(t)
	stubs["s1"].hugeOutputLine = true
	ts := newTestServer(t, stubs)

	body, code := readSSE(t, ts.URL+"/api/missions/s1/m1/output", "")
	if code != 200 {
		t.Fatalf("status = %d, want 200", code)
	}
	if !strings.Contains(body, "event: stream_error") {
		t.Fatalf("expected a stream_error event, got:\n%.200s…", body)
	}
	if !strings.Contains(body, "token too long") {
		t.Errorf("stream_error should carry the scanner error, got:\n%.200s…", body)
	}
}

func TestStreamUnknownHost404(t *testing.T) {
	ts := newTestServer(t, newEventStub(t))

	if _, code := readSSE(t, ts.URL+"/api/missions/nope/m1/events", ""); code != 404 {
		t.Fatalf("events unknown host status = %d, want 404", code)
	}
	if _, code := readSSE(t, ts.URL+"/api/missions/nope/m1/output", ""); code != 404 {
		t.Fatalf("output unknown host status = %d, want 404", code)
	}
}
