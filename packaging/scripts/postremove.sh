#!/bin/sh
# postremove — reload systemd; on purge drop the system user/group.
# deb calls postrm with $1 = remove | purge | upgrade | ...
set -e

if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload || true
fi

if [ "$1" = "purge" ]; then
  userdel  arby >/dev/null 2>&1 || true
  groupdel arby >/dev/null 2>&1 || true
fi
exit 0
