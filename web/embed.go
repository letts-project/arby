// Package web holds the embedded built SPA assets (web/dist), produced by the
// Vite build. A committed web/dist/.gitkeep keeps the directory non-empty so a
// bare `go build` (without the npm build) still compiles the //go:embed directive.
package web

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var distFS embed.FS

// FS returns the SPA file system rooted at dist/.
func FS() fs.FS {
	sub, err := fs.Sub(distFS, "dist")
	if err != nil {
		panic(err) // dist is embedded at build time; this cannot fail
	}
	return sub
}
