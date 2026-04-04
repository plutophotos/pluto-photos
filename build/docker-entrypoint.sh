#!/bin/sh
# Adjust the 'pluto' user UID/GID to match PUID/PGID environment vars
# so host-mounted volumes are readable/writable.
#
# NOTE: We edit /etc/passwd and /etc/group directly instead of using
# usermod/groupmod because those commands can hang on Docker Desktop
# (mailspool locking, subuid checks, etc.).

PUID=${PUID:-1000}
PGID=${PGID:-1000}

# Only modify if running as root (entrypoint started as root)
if [ "$(id -u)" = "0" ]; then
  # Remove the default 'node' user from base image to avoid UID conflicts
  sed -i '/^node:/d' /etc/passwd 2>/dev/null || true
  sed -i '/^node:/d' /etc/group 2>/dev/null || true
  sed -i '/^node:/d' /etc/shadow 2>/dev/null || true

  # Update pluto group GID directly in /etc/group (avoids groupmod hanging)
  sed -i "s/^pluto:x:[0-9]*:/pluto:x:${PGID}:/" /etc/group 2>/dev/null || true

  # Update pluto user UID and GID directly in /etc/passwd (avoids usermod hanging)
  sed -i "s/^pluto:x:[0-9]*:[0-9]*:/pluto:x:${PUID}:${PGID}:/" /etc/passwd 2>/dev/null || true

  # Fix ownership of /data only (where DB + thumbnails live).
  # Skip /app — it's thousands of files in node_modules and never needs ownership changes.
  # Skip /photos — it's mounted read-only.
  chown -R "${PUID}:${PGID}" /data 2>/dev/null || true

  # Drop privileges and exec the main command
  exec gosu pluto "$@"
else
  # Already running as non-root (e.g. Kubernetes), just exec
  exec "$@"
fi
