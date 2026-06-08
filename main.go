// Command arby is the admin web UI aggregator for a letts cluster: it reads
// letts.yaml, fans out to every dugdale over /v1, merges, and serves a SPA.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"arby/internal/aggregator"
	"arby/internal/arbyconfig"
	"arby/internal/registry"
	"arby/internal/server"
	"arby/internal/version"
	"arby/web"
)

func main() {
	cfg, err := arbyconfig.Parse(os.Args[1:])
	if err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return // -h/--help: usage already printed, exit 0
		}
		log.Fatalf("arby: %v", err)
	}
	if cfg.ShowVersion {
		fmt.Println(version.String())
		return
	}
	reg, err := registry.Load(registry.Options{ConfigPath: cfg.LettsConfig, Getenv: os.LookupEnv})
	if err != nil {
		log.Fatalf("arby: load cluster: %v", err)
	}
	for _, h := range reg.Hosts() {
		if !h.Managed {
			log.Printf("arby: warning: host %q has no usable admin token (%v) — health/version only, excluded from listings and actions", h.ID, h.TokenErr)
		}
	}
	agg := aggregator.New(reg, aggregator.Options{CacheTTL: cfg.CacheTTL, FanoutTimeout: cfg.FanoutTimeout})
	srv := &http.Server{Addr: cfg.Listen, Handler: server.New(cfg, reg, agg, web.FS()).Handler()}
	log.Printf("arby %s listening on %s (%d hosts, %d managed)", version.Version, cfg.Listen, len(reg.Hosts()), len(reg.Managed()))

	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	select {
	case err := <-errCh:
		log.Fatalf("arby: serve: %v", err)
	case sig := <-stop:
		log.Printf("arby: %s — shutting down", sig)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := srv.Shutdown(ctx); err != nil {
			// Long-lived SSE tails outlive the drain window; drop them — the
			// browser EventSource reconnects after the restart.
			_ = srv.Close()
		}
	}
}
