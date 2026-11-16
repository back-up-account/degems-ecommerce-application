#!/usr/bin/env bash
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL must be configured}"
: "${BACKUP_DIR:?BACKUP_DIR must name a protected backup directory}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT must be an age public recipient}"

command -v pg_dump >/dev/null
command -v age >/dev/null
command -v sha256sum >/dev/null

umask 077
mkdir -p -- "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
backup_file="$BACKUP_DIR/degems-$timestamp.dump.age"
temporary_file="$(mktemp "$BACKUP_DIR/.degems-$timestamp.XXXXXX")"
trap 'rm -f -- "$temporary_file"' EXIT

pg_dump --format=custom "$DATABASE_URL" \
  | age --encrypt --recipient "$BACKUP_AGE_RECIPIENT" > "$temporary_file"

mv -- "$temporary_file" "$backup_file"
sha256sum "$backup_file" > "$backup_file.sha256"
printf 'Encrypted database backup created: %s\n' "$backup_file"
