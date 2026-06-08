package registry

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeYAML(t *testing.T, body string) string {
	t.Helper()
	dir := t.TempDir()
	p := filepath.Join(dir, "letts.yaml")
	if err := os.WriteFile(p, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return p
}

func TestLoadResolvesHostsAndTokens(t *testing.T) {
	t.Setenv("ADMIN_TOK", "secret-admin")
	yaml := `
auth:
  admin_token: "${ADMIN_TOK}"
defaults:
  port: 7180
dugdales:
  - {id: s1, host: server1.internal}
  - {id: s2, host: server2.internal, port: 7181}
`
	reg, err := Load(Options{ConfigPath: writeYAML(t, yaml), Getenv: os.LookupEnv})
	if err != nil {
		t.Fatal(err)
	}
	if len(reg.Hosts()) != 2 {
		t.Fatalf("want 2 hosts, got %d", len(reg.Hosts()))
	}
	s1 := reg.ByID("s1")
	if s1 == nil {
		t.Fatal("s1 missing")
	}
	if s1.BaseURL != "http://server1.internal:7180" {
		t.Errorf("s1 BaseURL=%q", s1.BaseURL)
	}
	if s1.AdminToken != "secret-admin" {
		t.Errorf("s1 AdminToken=%q", s1.AdminToken)
	}
	if !s1.Managed || s1.Client == nil {
		t.Errorf("s1 should be managed with a client")
	}
	if reg.ByID("s2").BaseURL != "http://server2.internal:7181" {
		t.Errorf("s2 BaseURL=%q", reg.ByID("s2").BaseURL)
	}
	if got := len(reg.Managed()); got != 2 {
		t.Errorf("Managed()=%d want 2", got)
	}
}

func TestUnmanagedHostWhenNoAdminToken(t *testing.T) {
	yaml := `
defaults: {port: 7180}
dugdales:
  - {id: s1, host: server1.internal}
`
	reg, err := Load(Options{ConfigPath: writeYAML(t, yaml), Getenv: os.LookupEnv})
	if err != nil {
		t.Fatal(err)
	}
	h := reg.ByID("s1")
	if h == nil {
		t.Fatal("s1 missing")
	}
	if h.Managed {
		t.Error("s1 should be unmanaged (no admin token)")
	}
	if h.TokenErr == nil {
		t.Error("s1.TokenErr should explain why the host is unmanaged")
	}
	if len(reg.Managed()) != 0 {
		t.Errorf("Managed() should be empty, got %d", len(reg.Managed()))
	}
}

func TestUnmanagedHostWhenTokenEnvMissing(t *testing.T) {
	yaml := `
auth:
  admin_token: "${ARBY_TEST_UNSET_ADMIN_TOKEN}"
defaults: {port: 7180}
dugdales:
  - {id: s1, host: server1.internal}
`
	reg, err := Load(Options{ConfigPath: writeYAML(t, yaml), Getenv: os.LookupEnv})
	if err != nil {
		t.Fatal(err)
	}
	h := reg.ByID("s1")
	if h == nil {
		t.Fatal("s1 missing")
	}
	if h.Managed {
		t.Error("s1 should be unmanaged (token env var unset)")
	}
	if h.TokenErr == nil || !strings.Contains(h.TokenErr.Error(), "ARBY_TEST_UNSET_ADMIN_TOKEN") {
		t.Errorf("TokenErr = %v, want it to name the missing env var", h.TokenErr)
	}
}
