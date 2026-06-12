# arby

**arby** is the admin web UI for a [letts](https://git.eswyft.org/letts/letts) task-queue cluster — a single
Go binary with an embedded React SPA. It reads your existing `letts.yaml`, fans
out in parallel to every dugdale over its `/v1` HTTP API, merges the per-host
results into one cluster-wide view, and serves that to the browser as its own
`/api` plus the SPA.

It is a **stateless aggregator**: no database, no daemon on the dugdale hosts —
just a short in-memory cache. You run **one instance per cluster**, typically on
an admin/dev box behind a reverse proxy.

arby is **read and control**, not dispatch: you can browse, filter, tail, and run
control operations (restart / kill / delete / pause / continue), but new missions
are still created by your applications and the `letts` CLI, not here.

## What you get

- **Dashboard** — every dugdale's online/offline status, version and uptime;
  per-lane queue depth (queued / running / concurrency / paused); and the most
  recent failures across the whole cluster.
- **Missions** — a dense, cursor-paginated list merged across all hosts, with
  filters for status, outcome, lane, name and host. Each row carries its host,
  because a mission is identified by `(host, mission_id)`.
- **Mission detail and live tail** — full record plus two live SSE streams for a
  running mission: structured events (progress/status) and interleaved
  stdout/stderr output.
- **Control actions** — restart, kill, and delete, individually or in bulk
  (bulk requests are chunked and grouped per host).
- **Lanes** — every lane across the cluster, with pause / continue.
- **Dugdales** — per-host status table.
- **Config** — read-only view of each host's applied config.
- **Exec history** — ad-hoc `letts exec` runs: list, detail (with script
  preview), and grouped view of bulk sessions, plus a download proxy for output
  artifacts.
- **Light / dark theme**, toggle persisted in the browser.

## How it works

```
              ┌───────────────────────────────────────────┐
              │ Reverse proxy                             │   ← authentication lives here
              │ (nginx basic_auth / OAuth2-proxy / SSO)   │   (arby has no login of its own)
              └─────────────────────┬─────────────────────┘
                                    │
              ┌─────────────────────┴─────────────────────┐
              │ arby — one static Go binary               │
              │   embedded React SPA                      │
              │   /api/* (merged JSON) and SSE live-tail  │
              │   /healthz                                │
              │   aggregator: parallel fan-out,           │
              │   k-way merge, ~3 s cache                 │
              └─────────────────────┬─────────────────────┘
                                    │ /v1/*  (Bearer admin-token, parallel fan-out)
                  ┌─────────────────┼─────────────────┐
                  ▼                 ▼                 ▼
             ┌─────────┐       ┌─────────┐      ┌───────────┐
             │ dugdale │       │ dugdale │      │  dugdale  │
             │    s1   │       │    s2   │      │   s7-dev  │
             └─────────┘       └─────────┘      └───────────┘
```

The browser only ever talks to arby's `/api`; the raw `/v1` cluster API and the
admin tokens stay server-side. Lists and the dashboard refresh by polling on top
of the cache; the only push channel is the live tail on a mission's detail page.

## Requirements

- **Go 1.26**, **Node.js** and **npm** (npm only for building the SPA).
- The **letts repository checked out alongside this one** at `../letts` — arby is
  a separate Go module that pulls `letts/pkg/lettsconfig` and
  `letts/pkg/lettsclient` in via `replace letts => ../letts` (see `go.mod`).
- `nfpm` only if you want to build a `.deb` (`make deb`).

## Build

```sh
make build      # build the SPA (npm ci, vite, typecheck), then embed it into ./arby
make test       # Go test suite (race detector)
make vet        # go vet
make linux      # cross-compile a version-stamped linux/amd64 binary into dist/
make deb        # build the linux binary and package a .deb into dist/ (needs nfpm)
make version    # print the current version (0.0.<N>)
make help       # list all targets
```

`make build` produces a single self-contained `arby` binary with the SPA baked
in via `//go:embed`.

For Go-only work you can also just `go build ./...` / `go test ./...`: a committed
`web/dist/.gitkeep` keeps the embed compiling without an npm build (the resulting
binary serves no SPA — use `make build` for that).

### Frontend dev server

For hot-reload on the UI, run a built `arby` (it serves `/api`) and Vite's dev
server side by side — Vite proxies `/api` and `/healthz` to the running binary:

```sh
./arby &                       # serves /api on 127.0.0.1:8080
npm --prefix web run dev       # Vite dev server with HMR, proxying to arby
```

## Configuration

**Cluster topology and tokens** come from your existing **`letts.yaml`** (the same
file the `letts` CLI uses) — dugdale list, `${ENV}` token references and templates.
arby resolves the **admin token** per dugdale (listing, kill, restart, delete and
pause are admin-only). A host whose admin token doesn't resolve shows up as
*online-but-unmanaged*: visible for health/version, excluded from admin actions.

arby looks for `letts.yaml` in this order: `--letts-config`, `$LETTS_CONFIG`, then
`./letts.yaml`, `~/.letts/letts.yaml`, `/etc/letts/letts.yaml`.

**arby's own knobs are flags** (no separate config file):

| Flag | Default | Description |
|------|---------|-------------|
| `--listen` | `127.0.0.1:8080` | HTTP listen address |
| `--letts-config` | auto-discover | Path to `letts.yaml` |
| `--cache-ttl` | `3s` | In-memory aggregator cache TTL |
| `--fanout-timeout` | `5s` | Per-dugdale timeout for fan-out reads |
| `--theme` | `light` | Default UI theme (`light`/`dark`); users can override in-browser |
| `--version` | — | Print version and exit |

arby must be mounted at the proxy root (`/`) — serving it under a sub-path is
not supported.

## Running in production

> **arby has no authentication of its own.** Never expose its port directly. Put
> it behind a reverse proxy (nginx basic_auth, OAuth2-proxy, SSO, …) or keep it on
> loopback / a VPN. Anyone who reaches arby gets **full admin** to the whole
> cluster — there are no per-user roles.

The `make deb` package installs:

- the binary at `/usr/bin/arby`,
- a systemd unit at `/lib/systemd/system/arby.service` (sandboxed; binds loopback
  by default), and
- an example environment file at `/etc/arby/arby.env.example`.

Copy the example to `/etc/arby/arby.env`, point `LETTS_CONFIG` at your cluster
config, put any extra flags in `ARBY_OPTS`, and reference your dugdale admin
tokens as `${ENV}` in `letts.yaml` with the secrets defined in `arby.env` — that
way `letts.yaml` carries no plaintext secrets. Then `systemctl enable --now arby`
and point your reverse proxy at it. `/healthz` is a cheap liveness check for the
proxy.

## Security model

- **Authentication** is the reverse proxy's job, not arby's.
- **CSRF** — a double-submit cookie is required on every mutating request.
- **Referrer-Policy: same-origin** on all responses, so capability IDs in URLs
  don't leak via `Referer`.
- **Cluster tokens stay server-side** — admin tokens and `mission_id`/`staging_id`
  capabilities are never sent to the browser or written to arby's logs.

## Out of scope

By design, arby does **not** dispatch new missions, render metrics charts
(point Grafana at dugdale's `/v1/metrics` for that), search inside stdout/stderr,
or implement per-user roles.

## Project layout

```
main.go                  flags/config → load cluster → start HTTP server
internal/
  arbyconfig/            arby's own flags
  registry/              resolved dugdales (identity and admin client) from letts.yaml
  aggregator/            fan-out, k-way merge cursor, cache, token redaction
  server/                /api handlers, SSE relays, CSRF and Referrer-Policy, static serve
  version/               build-time version metadata
web/                     React + TypeScript + Vite SPA (TanStack Query/Router/Table,
                         Radix UI, Tailwind), embedded via //go:embed
packaging/               systemd unit, nfpm spec, env example
scripts/build/           version-stamped build, .deb packaging, version bump
```

## License

MIT
