#!/usr/bin/env bash
# backup-sqlite.sh — Back up SQLite database for PSM TouchCTF
# Usage: ./scripts/backup-sqlite.sh [output_dir]
set -euo pipefail

DB_PATH="${SQLITE_PATH:-/data/touchctf.db}"
OUTPUT_DIR="${1:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${OUTPUT_DIR}/touchctf_${TIMESTAMP}.db"

mkdir -p "$OUTPUT_DIR"

echo "Creating SQLite backup: ${BACKUP_FILE}"

if command -v docker &>/dev/null && docker compose ps api --format json 2>/dev/null | grep -q '"Name"'; then
    docker compose cp api:"${DB_PATH}" "$BACKUP_FILE"
elif [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$BACKUP_FILE"
else
    echo "Error: SQLite database not found at ${DB_PATH}" >&2
    exit 1
fi

FILESIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup complete: ${BACKUP_FILE} (${FILESIZE})"
