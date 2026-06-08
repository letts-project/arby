# arby — build the aggregator web UI binary (single static artifact).
#
# `make build` builds the SPA (Vite generates the route tree and dist),
# typechecks it, then `go build` embeds web/dist via //go:embed → a local
# `arby`. `make linux`/`make deb` cross-compile a linux/amd64 binary (and a
# .deb). All three stamp the version (VERSION file and git commit) via
# -ldflags. `go test`/`go vet` run the Go side alone (the committed
# web/dist/.gitkeep keeps the embed compiling without an npm build).

.PHONY: build build-web test vet linux deb bump version help

VERSION  := $(shell ./scripts/build/version.sh)
COMMIT   := $(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)
BUILT_AT := $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS  := -X arby/internal/version.Version=$(VERSION) \
            -X arby/internal/version.Commit=$(COMMIT) \
            -X arby/internal/version.BuiltAt=$(BUILT_AT)

build-web: ## Build the embedded SPA into web/dist
	npm --prefix web ci
	find web/dist -mindepth 1 ! -name .gitkeep -delete
	npm --prefix web run build
	npm --prefix web run typecheck

build: build-web ## Build the local arby binary (embeds the SPA)
	go build -ldflags "$(LDFLAGS)" -o arby .

test: ## Run the Go test suite (race detector)
	go test ./... -race

vet: ## Run go vet
	go vet ./...

linux: ## Cross-compile a version-stamped linux/amd64 arby into dist/ (SPA and Go)
	./scripts/build/build.sh

deb: ## Build the linux binary and package a .deb into dist/ (needs nfpm)
	./scripts/build/package.sh

bump: ## Increment the build number in VERSION and commit it
	./scripts/build/bump.sh

version: ## Print the current version string (0.0.<N>)
	@./scripts/build/version.sh

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "} {printf "  \033[36m%-10s\033[0m %s\n", $$1, $$2}'
