#!/usr/bin/env bash
# Local development database. Not for production — production uses managed
# PostgreSQL per the Technical Architecture.
set -e
PGBIN=${PGBIN:-/usr/lib/postgresql/16/bin}
PGDATA=${PGDATA:-/home/claude/pgdata}
SOCK=${SOCK:-/tmp/pgrun}
mkdir -p "$SOCK"; chown postgres:postgres "$SOCK" "$PGDATA" 2>/dev/null || true
if ! su postgres -s /bin/bash -c "$PGBIN/pg_ctl -D $PGDATA status" >/dev/null 2>&1; then
  su postgres -s /bin/bash -c \
    "$PGBIN/pg_ctl -D $PGDATA -o '-p 5433 -k $SOCK -c fsync=off -c synchronous_commit=off' -l /tmp/pg.log start" >/dev/null
  for i in $(seq 1 20); do
    su postgres -s /bin/bash -c "$PGBIN/psql -h $SOCK -p 5433 -U postgres -tAc 'select 1'" >/dev/null 2>&1 && break
    sleep 1
  done
fi
echo "postgres ready on $SOCK:5433"
