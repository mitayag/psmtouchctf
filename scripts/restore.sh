#!/usr/bin/env bash
# restore.sh — Restore PostgreSQL database for PSM TouchCTF
# Usage: ./scripts/restore.sh <backup_file.sql.gz>
set -euo pipefail

if [ $# -lt 1 ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: ${BACKUP_FILE}" >&2
    exit 1
fi

echo "WARNING: This will overwrite the current database."
read -p "Continue? [y/N] " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

echo "Restoring from: ${BACKUP_FILE}"

if command -v docker &>/dev/null && docker compose ps db --format json 2>/dev/null | grep -q '"Name"'; then
    gunzip -c "$BACKUP_FILE" | docker compose exec -T db psql -U touchctf -d touchctf
elif command -v psql &>/dev/null; then
    gunzip -c "$BACKUP_FILE" | psql -U touchctf -d touchctf
else
    echo "Error: Neither Docker Compose nor psql found." >&2
    exit 1
fi

echo "Restore complete."
