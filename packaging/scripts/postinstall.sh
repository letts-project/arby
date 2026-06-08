#!/bin/sh
# postinstall — create the arby system user/group, reload systemd. Does NOT
# enable/start arby (no cluster config wired up yet). deb calls this with
# $1=configure; rpm with $1=1|2. Idempotent.
set -e

getent group arby  >/dev/null 2>&1 || groupadd --system arby
getent passwd arby >/dev/null 2>&1 || \
  useradd --system --gid arby --no-create-home \
          --home-dir /nonexistent --shell /usr/sbin/nologin arby

mkdir -p /etc/arby

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload || true
  systemctl try-restart arby.service || true   # no-op on fresh install
fi
