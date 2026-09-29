#!/bin/sh
set -eu
manifest="$(ls -1 /backups/testpilot-*.sha256 2>/dev/null | sort | tail -1)"
[ -n "$manifest" ] || { echo 'No backup manifest found.' >&2; exit 1; }
cd /backups
sha256sum -c "$(basename "$manifest")"
dump="$(sed -n '1s/^[^ ]*  //p' "$manifest")"
verify_db="testpilot_restore_verify_$(date +%s)"
export PGPASSWORD="$POSTGRES_PASSWORD"
trap 'dropdb -h postgres -U "$POSTGRES_USER" --if-exists "$verify_db" >/dev/null 2>&1 || true' EXIT
createdb -h postgres -U "$POSTGRES_USER" "$verify_db"
pg_restore -h postgres -U "$POSTGRES_USER" -d "$verify_db" --no-owner --no-privileges "$dump"
psql -h postgres -U "$POSTGRES_USER" -d "$verify_db" -v ON_ERROR_STOP=1 -c 'SELECT COUNT(*) AS applied_migrations FROM "_prisma_migrations";' -c 'SELECT COUNT(*) AS projects FROM "Project";'
echo "Backup integrity and isolated database restore verified."
