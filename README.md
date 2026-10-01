# The Reverse Spoiler: The Anti-Watchlist
Static PWA in `public/`, plus a tiny Cloudflare Worker (`src/worker.js`) that proxies TMDB at `/api/*`.

Deploy: push to GitHub, connect the repo in Cloudflare (Workers & Pages -> Create -> Import a repository).
Worker name must be `reverse-spoiler`; deploy command `npx wrangler deploy`; no build command.

Security: the TMDB token lives in `src/worker.js` as a fallback. Keep the repo PRIVATE, or better:
`npx wrangler secret put TMDB_TOKEN` (or Dashboard -> Settings -> Variables and Secrets), then delete FALLBACK_TOKEN.

Second review source: Trakt (looked up by IMDb id). Optional: set TRAKT_CLIENT_ID as a Worker variable to override the built-in Client ID.
