package aggregator

import (
	"testing"
	"time"
)

func TestCacheHitMissExpireInvalidate(t *testing.T) {
	clock := int64(1000)
	c := newCache(100*time.Millisecond, func() time.Time { return time.UnixMilli(clock) })

	calls := 0
	load := func() (any, error) { calls++; return "v1", nil }

	v, err := c.get("k", load)
	if err != nil || v.(string) != "v1" || calls != 1 {
		t.Fatalf("first get: v=%v err=%v calls=%d", v, err, calls)
	}
	if _, _ = c.get("k", load); calls != 1 {
		t.Fatalf("expected cache hit, calls=%d", calls)
	}
	clock += 200
	if _, _ = c.get("k", load); calls != 2 {
		t.Fatalf("expected reload after expiry, calls=%d", calls)
	}
	c.invalidate("k")
	if _, _ = c.get("k", load); calls != 3 {
		t.Fatalf("expected reload after invalidate, calls=%d", calls)
	}
}
