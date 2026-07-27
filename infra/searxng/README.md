# Heather private SearXNG

Build with `docker build -t heather-searxng .` and run with `docker run --rm -p 8080:8080 -e SEARXNG_SECRET_KEY="$(openssl rand -hex 32)" heather-searxng`.

For Railway, deploy this directory as a private service and set `SEARXNG_SECRET_KEY`; do not expose its domain publicly. Point Agent Runtime `SEARXNG_URL` to the platform-provided private DNS URL and port.
