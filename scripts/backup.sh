#!/usr/bin/env bash
# backup.sh — Back up PostgreSQL database for PSM TouchCTF
# Usage: ./scripts/backup.sh [output_dir]
set -euo pipefail

OUTPUT_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${OUTPUT_DIR}/touchctf_${TIMESTAMP}.sql.gz"

mkdir -p "$OUTPUT_DIR"

echo "Creating backup: ${BACKUP_FILE}"

# Check if running via Docker Compose
if command -v docker &>/dev/null && docker compose ps db --format json 2>/dev/null | grep -q '"Name"'; then
    docker compose exec -T db pg_dump -U touchctf -d touchctf | gzip > "$BACKUP_FILE"
elif command -v pg_dump &>/dev/null; then
    pg_dump -U touchctf -d touchctf | gzip > "$BACKUP_FILE"
else
    echo "Error: Neither Docker Compose nor pg_dump found." >&2
    exit 1
fi

FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup complete: ${BACKUP_FILE} (${FILESIZE})"

# Prune backups older than 30 days
find "$OUTPUT_DIR" -name "touchctf_*.sql.gz" -mtime +30 -delete 2>/dev/null || true
echo "Old backups (>30 days) pruned."
