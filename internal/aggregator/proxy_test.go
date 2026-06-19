package aggregator

import (
	"fmt"
	"io"
	"net"
	"strconv"
	"sync/atomic"
	"testing"
	"time"

	"letts/pkg/lettsclient"
)

// startSOCKS5 stands up a minimal SOCKS5 CONNECT proxy and returns its address
// and a counter of how many CONNECTs it served — enough to prove the
// aggregator's fan-out actually tunneled through the per-dugdale proxy.
func startSOCKS5(t *testing.T) (addr string, connects *int32) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	var count int32
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go serveSOCKS5(conn, &count)
		}
	}()
	t.Cleanup(func() { _ = ln.Close() })
	return ln.Addr().String(), &count
}

func serveSOCKS5(c net.Conn, count *int32) {
	defer func() { _ = c.Close() }()
	hdr := make([]byte, 2)
	if _, err := io.ReadFull(c, hdr); err != nil || hdr[0] != 0x05 {
		return
	}
	methods := make([]byte, int(hdr[1]))
	if _, err := io.ReadFull(c, methods); err != nil {
		return
	}
	if _, err := c.Write([]byte{0x05, 0x00}); err != nil {
		return
	}
	req := make([]byte, 4)
	if _, err := io.ReadFull(c, req); err != nil || req[1] != 0x01 {
		return
	}
	var host string
	switch req[3] {
	case 0x01:
		b := make([]byte, 4)
		if _, err := io.ReadFull(c, b); err != nil {
			return
		}
		host = net.IP(b).String()
	case 0x03:
		l := make([]byte, 1)
		if _, err := io.ReadFull(c, l); err != nil {
			return
		}
		b := make([]byte, int(l[0]))
		if _, err := io.ReadFull(c, b); err != nil {
			return
		}
		host = string(b)
	case 0x04:
		b := make([]byte, 16)
		if _, err := io.ReadFull(c, b); err != nil {
			return
		}
		host = net.IP(b).String()
	default:
		return
	}
	pb := make([]byte, 2)
	if _, err := io.ReadFull(c, pb); err != nil {
		return
	}
	port := int(pb[0])<<8 | int(pb[1])
	atomic.AddInt32(count, 1)
	up, err := net.Dial("tcp", net.JoinHostPort(host, strconv.Itoa(port)))
	if err != nil {
		_, _ = c.Write([]byte{0x05, 0x01, 0x00, 0x01, 0, 0, 0, 0, 0, 0})
		return
	}
	defer func() { _ = up.Close() }()
	if _, err := c.Write([]byte{0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0, 0, 0}); err != nil {
		return
	}
	go func() { _, _ = io.Copy(up, c) }()
	_, _ = io.Copy(c, up)
}

// TestFanOutRoutesThroughProxy wires a stub dugdale behind a SOCKS5 proxy and
// confirms the aggregator's fan-out reaches it only through the proxy.
func TestFanOutRoutesThroughProxy(t *testing.T) {
	stub := newStub(t, []lettsclient.Mission{mkMission("m1", 100, 0, "")})
	stub.info = lettsclient.DugdaleInfo{Version: "v1"}

	socksAddr, connects := startSOCKS5(t)
	yaml := fmt.Sprintf(
		"auth: {admin_token: \"test-admin\"}\ndugdales:\n  - {id: s1, url: \"%s\", proxy: \"socks5h://%s\"}\n",
		stub.srv.URL, socksAddr,
	)
	reg := loadRegistry(t, yaml)
	agg := New(reg, Options{CacheTTL: time.Millisecond, FanoutTimeout: 2 * time.Second})

	if _, err := agg.Dashboard(); err != nil {
		t.Fatalf("dashboard: %v", err)
	}
	if atomic.LoadInt32(connects) == 0 {
		t.Error("fan-out did not route through the SOCKS5 proxy")
	}
}
