#!/bin/sh
# preremove — stop+disable arby on real removal, but NOT across upgrades.
# deb calls prerm with $1 = remove | upgrade | deconfigure | failed-upgrade.
set -e

case "$1" in
  remove|deconfigure|0)
    if command -v systemctl >/dev/null 2>&1; then
      systemctl disable --now arby.service >/dev/null 2>&1 || true
    fi
    ;;
esac
exit 0
