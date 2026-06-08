package aggregator

import (
	"sync"
	"time"
)

type cacheEntry struct {
	val     any
	expires time.Time
}

// sweepEvery is how often get() walks the map to drop expired entries. Keys
// include cursors and filter combos, so without a sweep a long-running,
// read-only process would accumulate stale pages indefinitely.
const sweepEvery = time.Minute

// cache is a tiny TTL cache. Callers are short fan-out reads; a brief duplicate
// load under contention is acceptable (no single-flight).
type cache struct {
	ttl       time.Duration
	now       func() time.Time
	mu        sync.Mutex
	items     map[string]cacheEntry
	nextSweep time.Time
}

func newCache(ttl time.Duration, now func() time.Time) *cache {
	if now == nil {
		now = time.Now
	}
	return &cache{ttl: ttl, now: now, items: map[string]cacheEntry{}, nextSweep: now().Add(sweepEvery)}
}

// get returns the cached value for key, or calls load and caches it. Errors are
// not cached.
func (c *cache) get(key string, load func() (any, error)) (any, error) {
	c.mu.Lock()
	if e, ok := c.items[key]; ok && c.now().Before(e.expires) {
		c.mu.Unlock()
		return e.val, nil
	}
	c.mu.Unlock()

	v, err := load()
	if err != nil {
		return nil, err
	}
	c.mu.Lock()
	c.items[key] = cacheEntry{val: v, expires: c.now().Add(c.ttl)}
	c.sweepLocked()
	c.mu.Unlock()
	return v, nil
}

// sweepLocked drops expired entries at most once per sweepEvery. Caller holds mu.
func (c *cache) sweepLocked() {
	now := c.now()
	if now.Before(c.nextSweep) {
		return
	}
	c.nextSweep = now.Add(sweepEvery)
	for k, e := range c.items {
		if !now.Before(e.expires) {
			delete(c.items, k)
		}
	}
}

// invalidate drops a key (used after mutations).
func (c *cache) invalidate(key string) {
	c.mu.Lock()
	delete(c.items, key)
	c.mu.Unlock()
}

// invalidateAll drops everything (used after broad mutations).
func (c *cache) invalidateAll() {
	c.mu.Lock()
	c.items = map[string]cacheEntry{}
	c.mu.Unlock()
}
