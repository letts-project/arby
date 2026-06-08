#!/usr/bin/env bash
# build.sh — build the embedded SPA, then cross-compile the arby binary into
# dist/ with version stamping. Defaults to linux/amd64; override via GOOS/GOARCH.
# Pure-Go (CGO off). The SPA (web/dist) is platform-independent and embedded via
# //go:embed, so it is built once regardless of the target arch.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

GOOS="${GOOS:-linux}"
GOARCH="${GOARCH:-amd64}"

VERSION="$("$ROOT/scripts/build/version.sh")"   # 0.0.<N> from the VERSION file
COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
BUILT_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Build the embedded SPA (static assets — architecture-independent).
npm --prefix web ci
find web/dist -mindepth 1 ! -name .gitkeep -delete
npm --prefix web run build
npm --prefix web run typecheck

LDFLAGS="-s -w \
  -X arby/internal/version.Version=${VERSION} \
  -X arby/internal/version.Commit=${COMMIT} \
  -X arby/internal/version.BuiltAt=${BUILT_AT}"

mkdir -p dist
CGO_ENABLED=0 GOOS="$GOOS" GOARCH="$GOARCH" \
  go build -trimpath -ldflags "$LDFLAGS" -o "dist/arby-${GOOS}-${GOARCH}" .

echo "built: dist/arby-${GOOS}-${GOARCH} (version=${VERSION} commit=${COMMIT})"
