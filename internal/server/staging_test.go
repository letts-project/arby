package server

import (
	"io"
	"mime"
	"net/http"
	"net/url"
	"testing"
)

// TestStagingDownloadReturnsBytesWithHeaders asserts GET /api/staging/{host}/{id}
// streams the host's staging bytes with Content-Disposition: attachment and that
// the global Referrer-Policy: same-origin middleware ran (the staging_id is a
// bearer read-capability and must not leak via Referer). Driving
// through Server.Handler() (via newTestServer) means the full middleware stack
// is exercised.
func TestStagingDownloadReturnsBytesWithHeaders(t *testing.T) {
	s1 := newStub(t, nil)
	s1.scriptByMission = map[string]string{"e-a": "#!/bin/sh\necho hello\n"}
	ts := newTestServer(t, map[string]*stub{"s1": s1})

	resp, err := http.Get(ts.URL + "/api/staging/s1/e-a-script")
	if err != nil {
		t.Fatalf("GET /api/staging/s1/e-a-script: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read body: %v", err)
	}
	if string(body) != "#!/bin/sh\necho hello\n" {
		t.Fatalf("body = %q, want the staged script", string(body))
	}
	cd := resp.Header.Get("Content-Disposition")
	if mt, params, err := mime.ParseMediaType(cd); err != nil || mt != "attachment" || params["filename"] != "e-a-script" {
		t.Fatalf("Content-Disposition = %q, want attachment with filename=e-a-script", cd)
	}
	if ct := resp.Header.Get("Content-Type"); ct != "application/octet-stream" {
		t.Fatalf("Content-Type = %q, want application/octet-stream", ct)
	}
	if ar := resp.Header.Get("Accept-Ranges"); ar != "bytes" {
		t.Fatalf("Accept-Ranges = %q, want bytes", ar)
	}
	if rp := resp.Header.Get("Referrer-Policy"); rp != "same-origin" {
		t.Fatalf("Referrer-Policy = %q, want same-origin (global middleware must run)", rp)
	}
}

// TestStagingDownloadUnknownHost asserts an unmanaged host yields 404.
func TestStagingDownloadUnknownHost(t *testing.T) {
	s1 := newStub(t, nil)
	ts := newTestServer(t, map[string]*stub{"s1": s1})

	if code := getJSON(t, ts.URL+"/api/staging/nope/e-a-script", nil); code != http.StatusNotFound {
		t.Fatalf("unknown-host staging status = %d, want 404", code)
	}
}

// TestStagingDownloadFilenameEscaped asserts a download id containing quotes
// cannot break out of the Content-Disposition filename parameter.
func TestStagingDownloadFilenameEscaped(t *testing.T) {
	id := `e"; filename=evil.exe; x="`
	s1 := newStub(t, nil)
	s1.rawStaging = map[string]string{id: "payload"}
	ts := newTestServer(t, map[string]*stub{"s1": s1})

	resp, err := http.Get(ts.URL + "/api/staging/s1/" + url.PathEscape(id))
	if err != nil {
		t.Fatalf("GET escaped-id staging: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	cd := resp.Header.Get("Content-Disposition")
	mt, params, err := mime.ParseMediaType(cd)
	if err != nil || mt != "attachment" {
		t.Fatalf("Content-Disposition = %q: not a parseable attachment (err=%v)", cd, err)
	}
	if params["filename"] != id {
		t.Fatalf("filename round-trips as %q, want %q (id must be escaped, not interpreted)", params["filename"], id)
	}
}

// TestStagingDownloadForwardsRange asserts a client Range header is forwarded to
// the upstream dugdale (the stub records the Range it saw), so resumable
// downloads work end-to-end through the proxy.
func TestStagingDownloadForwardsRange(t *testing.T) {
	s1 := newStub(t, nil)
	s1.scriptByMission = map[string]string{"e-a": "0123456789abcdef"}
	ts := newTestServer(t, map[string]*stub{"s1": s1})

	req, err := http.NewRequest("GET", ts.URL+"/api/staging/s1/e-a-script", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}
	req.Header.Set("Range", "bytes=0-3")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatalf("GET with Range: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusPartialContent {
		t.Fatalf("ranged status = %d, want 206 Partial Content (proxy must not flatten 206→200)", resp.StatusCode)
	}
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "0123" {
		t.Fatalf("ranged body = %q, want %q", string(body), "0123")
	}
	if len(s1.stagingRanges) != 1 || s1.stagingRanges[0] != "bytes=0-3" {
		t.Fatalf("upstream saw ranges %v, want [bytes=0-3] (proxy must forward Range)", s1.stagingRanges)
	}
}
