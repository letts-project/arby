package arbyconfig

import (
	"testing"
	"time"
)

func TestParseDefaultsAndFlags(t *testing.T) {
	c, err := Parse([]string{})
	if err != nil {
		t.Fatal(err)
	}
	if c.Listen != "127.0.0.1:8080" || c.CacheTTL != 3*time.Second || c.FanoutTimeout != 5*time.Second || c.Theme != "light" {
		t.Fatalf("defaults wrong: %+v", c)
	}
	c2, err := Parse([]string{"--listen", ":9090", "--cache-ttl", "2s", "--fanout-timeout", "10s", "--theme", "dark", "--letts-config", "/etc/letts/letts.yaml"})
	if err != nil {
		t.Fatal(err)
	}
	if c2.Listen != ":9090" || c2.CacheTTL != 2*time.Second || c2.Theme != "dark" || c2.LettsConfig != "/etc/letts/letts.yaml" {
		t.Fatalf("flags wrong: %+v", c2)
	}
	if _, err := Parse([]string{"--theme", "rainbow"}); err == nil {
		t.Error("expected error on invalid theme")
	}
}
