# Owntime Assembleia

## Docker VPS

1. Clone the repository on the VPS.
2. Copy `landing-pages/.env.example` to `.env` in the repository root and set the
   Google Sheets webhook URL and token.
3. Run `docker compose -f compose.landing-pages.yaml up -d --build`.
4. Configure the reverse proxy to forward the public domain to
   `127.0.0.1:4180`.

`LANDING_PAGES_BIND` defaults to `127.0.0.1`, keeping the service private to
the VPS. Set `LANDING_PAGES_HOST_PORT` only when a different host port is
needed.
