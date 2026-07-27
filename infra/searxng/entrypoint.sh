#!/bin/sh
set -eu
: "${SEARXNG_SECRET_KEY:?SEARXNG_SECRET_KEY must be set}"
: "${PORT:=8080}"
escaped_key=$(printf '%s' "$SEARXNG_SECRET_KEY" | sed 's/[\/&]/\\&/g')
sed "s/__SEARXNG_SECRET_KEY__/$escaped_key/g" /etc/searxng/settings.yml.template > /etc/searxng/settings.yml
export SEARXNG_BIND_ADDRESS=0.0.0.0
export SEARXNG_PORT="$PORT"
exec /usr/local/searxng/entrypoint.sh
