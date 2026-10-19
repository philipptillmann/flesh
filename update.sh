#!/usr/bin/env bash
# Update a root-owned checkout of the server branch; preserve configuration/data.
set -Eeuo pipefail
umask 077

fail() { printf 'Flesh: %s\n' "$*" >&2; exit 1; }
main() {
[[ $(id -u) -eq 0 ]] || fail 'Run as root.'
for command in git docker flock; do
    command -v "$command" >/dev/null || fail "Missing dependency: $command"
done
app_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
cd "$app_dir"
exec 9> .update.lock
flock -n 9 || fail 'Another update is already running.'
[[ -d .git ]] || fail 'This directory must be a Git checkout.'
[[ $(git symbolic-ref --quiet --short HEAD) == server ]] || fail 'Check out branch server first.'
[[ -z $(git status --porcelain) ]] || fail 'Working tree contains changes. Commit or move them before updating.'
[[ -f .env ]] || fail 'Create .env from .env.example and configure APP_ORIGIN first.'
docker compose version >/dev/null
docker info >/dev/null
before=$(git rev-parse HEAD)
printf 'Fetching branch server …\n'
git fetch --prune origin server
git merge-base --is-ancestor "$before" origin/server || fail 'Branch has diverged; automatic update refused.'
git merge --ff-only origin/server
# No container is replaced until configuration, build and backup have succeeded.
docker compose config --quiet
old_container=$(docker compose ps -q health)
old_image=''
if [[ -n "$old_container" ]]; then
    old_image=$(docker inspect --format '{{.Image}}' "$old_container")
    docker image tag "$old_image" flesh-server:rollback
fi
docker compose build --pull health
mkdir -p backups
chmod 700 backups
stamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_file="backups/${stamp}-$$.sqlite3"
if docker compose run --rm --no-deps -T health python ops.py backup > "${backup_file}.partial"; then
    mv -- "${backup_file}.partial" "$backup_file"
    printf '%s\n' "$before" > "${backup_file}.commit"
    printf 'Consistent database backup: %s\n' "$backup_file"
else
    backup_status=$?
    rm -f -- "${backup_file}.partial"
    [[ $backup_status -eq 3 ]] || fail 'Backup failed; running service has not been replaced.'
fi
if docker compose up -d --no-build --wait --wait-timeout 90 health; then
    printf 'Flesh updated successfully to %s.\n' "$(git rev-parse --short HEAD)"
else
    if [[ -n "$old_image" ]]; then
        printf 'Healthcheck failed; restoring previous container image.\n' >&2
        docker image tag flesh-server:rollback flesh-server:local
        docker compose up -d --no-build --wait --wait-timeout 90 health || fail 'Rollback failed. See docker compose logs.'
        fail 'Update failed; previous container image restored. Checkout remains on the fetched revision. Review before retrying.'
    fi
    fail 'Initial start failed. See docker compose logs.'
fi
}

# Parse the complete function before git can replace this script during an update.
main "$@"
