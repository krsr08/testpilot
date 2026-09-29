#!/bin/sh
set -eu
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p /backups
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "/backups/testpilot-${stamp}.dump"
tar -C /data -czf "/backups/testpilot-storage-${stamp}.tar.gz" .
sha256sum "/backups/testpilot-${stamp}.dump" "/backups/testpilot-storage-${stamp}.tar.gz" > "/backups/testpilot-${stamp}.sha256"
echo "Backup set ${stamp} created and checksummed."
