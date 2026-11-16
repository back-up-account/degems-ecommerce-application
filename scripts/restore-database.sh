#!/usr/bin/env bash
set -Eeuo pipefail

: "${BACKUP_FILE:?BACKUP_FILE must name an encrypted database backup}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL must point to an isolated restore database}"
: "${BACKUP_AGE_IDENTITY_FILE:?BACKUP_AGE_IDENTITY_FILE must name the private age identity file}"

[[ -f "$BACKUP_FILE" ]] || { printf 'Backup file does not exist.\n' >&2; exit 1; }
[[ -f "$BACKUP_FILE.sha256" ]] || { printf 'Backup checksum file does not exist.\n' >&2; exit 1; }
[[ -f "$BACKUP_AGE_IDENTITY_FILE" ]] || { printf 'Age identity file does not exist.\n' >&2; exit 1; }

command -v age >/dev/null
command -v pg_restore >/dev/null
command -v psql >/dev/null
command -v sha256sum >/dev/null

sha256sum --check "$BACKUP_FILE.sha256"
database_name="$(psql "$RESTORE_DATABASE_URL" --tuples-only --no-align --command='SELECT current_database()')"
if [[ ! "$database_name" =~ ^degems_restore_[a-z0-9_]+$ ]]; then
  printf 'Refusing restore: target database must be named degems_restore_<suffix>.\n' >&2
  exit 1
fi

age --decrypt --identity "$BACKUP_AGE_IDENTITY_FILE" "$BACKUP_FILE" \
  | pg_restore --clean --if-exists --no-owner --no-acl --exit-on-error --dbname "$RESTORE_DATABASE_URL"

printf 'Restore completed in isolated database %s.\n' "$database_name"
