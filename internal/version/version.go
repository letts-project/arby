// Package version exposes build-time version metadata for arby, set via
// -ldflags at build time (see scripts/build/build.sh). Mirrors
// letts/internal/version.
package version

// These are overridden by the linker at build time; keep them as vars.
var (
	Version = "dev"
	Commit  = "unknown"
	BuiltAt = "unknown"
)

// String returns a one-line human version summary.
func String() string {
	return "arby " + Version + " (commit " + Commit + ", built " + BuiltAt + ")"
}
