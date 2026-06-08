// Package registry resolves a letts.yaml into a set of per-host admin clients.
package registry

import (
	"fmt"
	"os"
	"sort"

	"letts/pkg/lettsclient"
	"letts/pkg/lettsconfig"
)

// Host is one resolved dugdale: identity and admin client. Managed is false when
// no admin token resolves (online-but-unmanaged) — such a host stays
// listed for health/version but is excluded from admin fan-out aggregations.
type Host struct {
	ID         string
	BaseURL    string
	AdminToken string
	Labels     []string
	Managed    bool
	TokenErr   error               // why the admin token didn't resolve (unmanaged only)
	Client     *lettsclient.Client // admin-scoped; nil when unmanaged
}

// Registry is the immutable resolved cluster view.
type Registry struct {
	hosts []*Host
	byID  map[string]*Host
}

// Options configures Load.
type Options struct {
	ConfigPath string                // explicit letts.yaml path; "" → auto-discover
	Getenv     lettsconfig.EnvLookup // env lookup for ${VAR}; pass os.LookupEnv
	UserAgent  string                // client UA; defaults to "arby"
}

// Load reads and resolves letts.yaml and builds the host registry.
func Load(opts Options) (*Registry, error) {
	getenv := opts.Getenv
	if getenv == nil {
		return nil, fmt.Errorf("registry.Load: Getenv is required")
	}
	path := opts.ConfigPath
	if path == "" {
		cwd, _ := os.Getwd()
		home, _ := os.UserHomeDir()
		p, err := lettsconfig.Discover(lettsconfig.DiscoverOpts{
			Getenv:   getenv,
			Cwd:      cwd,
			HomeDir:  home,
			FlagName: "--letts-config", // arby's flag name (for the not-found message)
		})
		if err != nil {
			return nil, fmt.Errorf("discover letts.yaml: %w", err)
		}
		path = p
	}
	// arby skips the plain-token permissions check (0600/0400): it runs as a
	// dedicated service user reading a shared /etc/letts/letts.yaml that may be
	// group-readable, behind a reverse proxy. File permissions are the deployer's
	// concern; the recommended ${ENV}-token model keeps secrets out of the yaml.
	cfg, err := lettsconfig.LoadAndResolveWithOpts(path, lettsconfig.ResolveOpts{Insecure: true})
	if err != nil {
		return nil, fmt.Errorf("load %s: %w", path, err)
	}
	ua := opts.UserAgent
	if ua == "" {
		ua = "arby"
	}
	reg := &Registry{byID: map[string]*Host{}}
	for i := range cfg.Dugdales {
		d := &cfg.Dugdales[i]
		base, berr := lettsconfig.BaseURLFor(cfg, d.ID)
		if berr != nil {
			return nil, fmt.Errorf("resolve base url for %s: %w", d.ID, berr)
		}
		h := &Host{ID: d.ID, BaseURL: base, Labels: d.Labels}
		tok, terr := lettsconfig.ResolveToken(cfg, d.ID, lettsconfig.ScopeAdmin, getenv)
		switch {
		case terr != nil:
			// No token configured, or a ${VAR} that didn't resolve. Keep the reason
			// so startup can log it — a typo'd env var name lands here and would
			// otherwise be indistinguishable from an intentionally tokenless host.
			h.TokenErr = terr
		case tok == "":
			h.TokenErr = fmt.Errorf("admin token resolves to an empty string")
		default:
			c, cerr := lettsclient.New(lettsclient.Options{BaseURL: base, Token: tok, UserAgent: ua})
			if cerr != nil {
				return nil, fmt.Errorf("client for %s: %w", d.ID, cerr)
			}
			h.AdminToken = tok
			h.Managed = true
			h.Client = c
		}
		reg.hosts = append(reg.hosts, h)
		reg.byID[h.ID] = h
	}
	sort.Slice(reg.hosts, func(i, j int) bool { return reg.hosts[i].ID < reg.hosts[j].ID })
	return reg, nil
}

// Hosts returns all hosts (sorted by ID), managed and unmanaged. The returned
// slice is a copy; callers may reorder it freely without affecting the registry.
func (r *Registry) Hosts() []*Host {
	out := make([]*Host, len(r.hosts))
	copy(out, r.hosts)
	return out
}

// Managed returns only hosts with a resolved admin client (fan-out targets).
func (r *Registry) Managed() []*Host {
	var out []*Host
	for _, h := range r.hosts {
		if h.Managed {
			out = append(out, h)
		}
	}
	return out
}

// ByID returns the host or nil.
func (r *Registry) ByID(id string) *Host { return r.byID[id] }
