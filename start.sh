#!/bin/sh
set -e

(cd generated && pnpm run db-setup) || true

TUI_OFF=true pnpm start
