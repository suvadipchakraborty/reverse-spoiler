// Cloudflare Worker: serves the static app from /public and proxies TMDB at /api/*
// Visitors only talk to your domain, so TMDB blocks (e.g. some Indian ISPs) don't matter.

// Preferred: set a secret instead (wrangler secret put TMDB_TOKEN) and delete this fallback.
const FALLBACK_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjMGNiYmNjMzQxMmY4ZGE2OTIwY2UwZWQxM2JiOGUzNCIsIm5iZiI6MTc5MDg2OTc4OS4xODEsInN1YiI6IjZhYmU4MTFkZjI5NDU0YTE3NzE4NmU2MSIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.75IkXLK1rElVrLT3gqlkHLGPdusjDc77z8sPLbFiSo4';

// Trakt Client ID is a public read-only identifier. Override with a Worker variable/secret TRAKT_CLIENT_ID if you prefer.
const FALLBACK_TRAKT_ID = 'kA9f0R4xf6tbzRjbF3y-5elgSNcEUwZ1QXKLABEO7eI';
const TRAKT_ALLOWED = /^\/trakt\/movies\/tt\d+\/comments\/(lowest|likes|newest)$/;

const ALLOWED = [/^\/search\/movie$/, /^\/movie\/\d+$/, /^\/movie\/\d+\/reviews$/];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    const path = url.pathname.slice(4); // strip "/api"

    // ---- Trakt comments ----
    if (request.method === 'GET' && TRAKT_ALLOWED.test(path)) {
      const t = new URL('https://api.trakt.tv' + path.slice(6));
      ['page', 'limit'].forEach(k => url.searchParams.has(k) && t.searchParams.set(k, url.searchParams.get(k)));
      const tr = await fetch(t, {
        headers: { 'trakt-api-version': '2', 'trakt-api-key': env.TRAKT_CLIENT_ID || FALLBACK_TRAKT_ID, 'content-type': 'application/json' },
        cf: { cacheTtl: 3600, cacheEverything: true }
      });
      return new Response(tr.body, { status: tr.status, headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' } });
    }

    // ---- TMDB ----
    if (request.method !== 'GET' || !ALLOWED.some(r => r.test(path))) {
      return new Response('Not allowed', { status: 403 });
    }
    const upstream = new URL('https://api.themoviedb.org/3' + path);
    ['query', 'language', 'page'].forEach(k => url.searchParams.has(k) && upstream.searchParams.set(k, url.searchParams.get(k)));

    const res = await fetch(upstream, {
      headers: { Authorization: `Bearer ${env.TMDB_TOKEN || FALLBACK_TOKEN}`, accept: 'application/json' },
      cf: { cacheTtl: 3600, cacheEverything: true }
    });
    return new Response(res.body, {
      status: res.status,
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' }
    });
  }
};
