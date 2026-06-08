// Package arbyconfig parses arby's own runtime configuration (flags).
package arbyconfig

import (
	"flag"
	"fmt"
	"time"
)

// Config is arby's runtime config (the cluster topology comes from letts.yaml
// via the registry; this is just arby's own knobs).
type Config struct {
	Listen        string
	LettsConfig   string // path to letts.yaml; "" → auto-discover
	CacheTTL      time.Duration
	FanoutTimeout time.Duration
	Theme         string // "light" | "dark"
	ShowVersion   bool   // --version: print version and exit
}

// Parse builds a Config from CLI args (excluding the program name). A request
// for help returns flag.ErrHelp (the caller should exit 0 after the usage that
// flag already printed).
func Parse(args []string) (Config, error) {
	fs := flag.NewFlagSet("arby", flag.ContinueOnError)
	fs.Usage = func() {
		out := fs.Output()
		fmt.Fprint(out, "arby — admin web UI for a letts task-queue cluster.\n\n")
		fmt.Fprint(out, "Usage: arby [flags]\n\n")
		fmt.Fprint(out, "The cluster topology and tokens are read from letts.yaml — via --letts-config,\n")
		fmt.Fprint(out, "$LETTS_CONFIG, or auto-discovery (./letts.yaml, ~/.letts/letts.yaml,\n")
		fmt.Fprint(out, "/etc/letts/letts.yaml). arby binds loopback by default; put it behind a\n")
		fmt.Fprint(out, "reverse proxy for authentication.\n\nFlags:\n")
		fs.PrintDefaults()
	}
	var c Config
	fs.StringVar(&c.Listen, "listen", "127.0.0.1:8080", "HTTP listen address")
	fs.StringVar(&c.LettsConfig, "letts-config", "", "path to letts.yaml (default: auto-discover)")
	fs.DurationVar(&c.CacheTTL, "cache-ttl", 3*time.Second, "in-memory aggregator cache TTL")
	fs.DurationVar(&c.FanoutTimeout, "fanout-timeout", 5*time.Second, "per-dugdale timeout for fan-out reads")
	fs.StringVar(&c.Theme, "theme", "light", "default UI theme: light|dark")
	fs.BoolVar(&c.ShowVersion, "version", false, "print version and exit")
	if err := fs.Parse(args); err != nil {
		return Config{}, err
	}
	if c.ShowVersion {
		return c, nil // main prints the version and exits before validating the rest
	}
	if c.Theme != "light" && c.Theme != "dark" {
		return Config{}, fmt.Errorf("invalid --theme %q (want light|dark)", c.Theme)
	}
	return c, nil
}
