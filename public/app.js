const CONFIG = {
  // TMDB is called through our own /api proxy (src/worker.js) so it works where TMDB is blocked and the key stays server-side.
  API: '/api',
  IMG: 'https://image.tmdb.org/t/p/w500',
  GOOD_RATING: 7.0,
  SNIPPET_MAX: 150
};

// Opportunity cost database (minutes)
const ALTERNATIVES = [
  { activity: "microwave and eat a single sad burrito, with ceremony", time: 6 },
  { activity: "do a full 7-minute workout and feel mildly smug", time: 7 },
  { activity: "text the friend you keep saying you'll text", time: 15 },
  { activity: "meditate and finally hear how loud your own thoughts are", time: 20 },
  { activity: "cook a real meal that doesn't come in a box", time: 45 },
  { activity: "take a long walk and pet at least three strange dogs", time: 60 },
  { activity: "watch 4 episodes of a good sitcom", time: 88 },
  { activity: "learn the basics of chess and lose to a stranger online", time: 90 },
  { activity: "deep clean your bathroom until it sparkles", time: 120 },
  { activity: "learn how to juggle", time: 150 },
  { activity: "fly from New York to Washington, D.C. and still have time for a pretzel", time: 80 },
  { activity: "bake sourdough from scratch (bread, not a personality)", time: 180 },
  { activity: "sort your entire junk drawer and finally discover what that key opens", time: 40 },
  { activity: "learn 40 words of a new language", time: 50 },
  { activity: "write the first chapter of the novel you keep mentioning at parties", time: 75 },
  { activity: "do your taxes early and stun your accountant", time: 100 },
  { activity: "listen to Abbey Road twice, front to back", time: 94 },
  { activity: "call your grandparents and actually listen", time: 30 },
  { activity: "repot every plant you've been neglecting", time: 35 },
  { activity: "stare at a wall, but with intent", time: 10 },
  { activity: "read 60 pages of a book you own and have never opened", time: 110 },
  { activity: "unsubscribe from 200 emails and feel something close to peace", time: 25 }
];

const FALLBACK_QUOTES = [
  "I'd ask for my money back, but what I really want is my time.",
  "Nobody involved in this film seemed to be having a good time. I joined them.",
  "I've seen better plot structure in a grocery list."
];

const $ = id => document.getElementById(id);
const el = { form: $('form'), q: $('q'), result: $('result'), install: $('install'), tally: $('tally') };
let deferredPrompt = null;
let lastShare = null;

// ---------- PWA ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredPrompt = e; });
window.addEventListener('appinstalled', () => { el.install.hidden = true; });
if (window.matchMedia('(display-mode: standalone)').matches) el.install.hidden = true;
el.install.addEventListener('click', async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  } else {
    alert('On iPhone: tap Share, then "Add to Home Screen".\nOn Android/Chrome: open the browser menu, then "Install app".');
  }
});

// ---------- Time saved tally ----------
function getSaved() { try { return +localStorage.getItem('rs_saved') || 0; } catch { return 0; } }
function addSaved(min) { try { localStorage.setItem('rs_saved', getSaved() + min); } catch {} renderTally(); }
function renderTally() {
  const m = getSaved();
  if (!m) return;
  el.tally.hidden = false;
  el.tally.textContent = `Lifetime time saved: ${fmt(m)}`;
}
renderTally();

// ---------- Helpers ----------
const fmt = m => m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pick = a => a[Math.floor(Math.random() * a.length)];

async function tmdb(path, params = {}) {
  const url = new URL(CONFIG.API + path, location.origin);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 401 ? 'Server TMDB key is invalid.' : `TMDB error ${res.status}.`);
  return res.json();
}

function snippet(text) {
  let t = text.replace(/[*_#>`~\[\]]/g, '').replace(/\s+/g, ' ').trim();
  if (t.length <= CONFIG.SNIPPET_MAX) return t;
  const cut = t.slice(0, CONFIG.SNIPPET_MAX);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return end > 50 ? cut.slice(0, end + 1) : cut.slice(0, cut.lastIndexOf(' ')) + '…';
}

function bestReview(results) {
  const rated = results.filter(r => r.author_details && r.author_details.rating != null && r.author_details.rating <= 5);
  rated.sort((a, b) => a.author_details.rating - b.author_details.rating);
  const r = rated[0] || results[0];
  return r ? snippet(r.content) : pick(FALLBACK_QUOTES);
}

// Opportunity cost: biggest alternatives that fit, with repeat count
function opportunity(runtime) {
  const fits = ALTERNATIVES.filter(a => a.time <= runtime).sort((a, b) => b.time - a.time);
  const a = pick(fits.slice(0, 4).length ? fits.slice(0, 4) : ALTERNATIVES.slice(0, 1));
  const n = Math.floor(runtime / a.time);
  const times = n === 2 ? ', twice' : n > 2 ? `, ${n} times over` : '';
  return `${a.activity}${times}`;
}

// ---------- UI ----------
function skeleton() {
  el.result.innerHTML = `<div class="sk" aria-busy="true"><p>Consulting the angry internet…</p><i></i><i></i><i></i></div>`;
}
function showError(msg) {
  el.result.innerHTML = `<div class="err" role="alert">${esc(msg)}</div>`;
}

function render(m, review) {
  const good = m.vote_average >= CONFIG.GOOD_RATING;
  const rating = m.vote_average.toFixed(1);
  const poster = m.poster_path
    ? `<img src="${CONFIG.IMG}${m.poster_path}" alt="Poster for ${esc(m.title)}">`
    : `<div class="noimg">${esc(m.title)}</div>`;
  const verdict = good
    ? `<p class="verdict">We'll allow it. This is actually pretty good.</p>`
    : `<p class="verdict">Wait. This movie is <b>${m.runtime} minutes</b> long and has a mediocre <b>${rating}/10</b> score. Instead of watching this, you have exactly enough time to <b>${esc(opportunity(m.runtime))}</b>.</p>
       <blockquote>“${esc(review)}”<cite>Angry Internet User</cite></blockquote>`;

  el.result.innerHTML = `
    <article class="card ${good ? 'go' : 'stop'}">
      <div class="poster">${poster}<div class="stamp">${good ? 'Proceed' : 'Stop'}</div></div>
      <div class="stats"><div>${fmt(m.runtime)}<small>Runtime</small></div><div>${rating}<small>Rating /10</small></div></div>
      <div class="body"><h2 class="title">${esc(m.title)}</h2>${verdict}</div>
      <button class="share" id="share" type="button">${good ? 'Share the good news' : 'Share my rescue'}</button>
    </article>`;

  lastShare = {
    title: 'The Reverse Spoiler',
    text: good
      ? `Reverse Spoiler cleared ${m.title} for takeoff (${rating}/10). Watch it.`
      : `I almost watched ${m.title}, but Reverse Spoiler saved me ${m.runtime} minutes!`,
    url: 'https://reverse-spoiler.suvadipchakraborty.workers.dev/'
  };
  $('share').addEventListener('click', share);

  if (!good) {
    document.body.classList.remove('shake'); void document.body.offsetWidth;
    document.body.classList.add('shake');
    if (navigator.vibrate) navigator.vibrate([200, 80, 200]);
    addSaved(m.runtime);
  }
  el.result.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function share() {
  if (!lastShare) return;
  try {
    if (navigator.share) await navigator.share(lastShare);
    else {
      await navigator.clipboard.writeText(`${lastShare.text} ${lastShare.url}`);
      $('share').textContent = 'Copied!';
    }
  } catch { /* user cancelled */ }
}

// ---------- Main flow ----------
el.form.addEventListener('submit', async e => {
  e.preventDefault();
  const query = el.q.value.trim();
  if (!query) return;
  skeleton();
  try {
    const search = await tmdb('/search/movie', { query });
    if (!search.results.length) return showError(`No movie found for "${query}". Check the spelling.`);
    const id = search.results[0].id;
    const [details, reviews] = await Promise.all([tmdb(`/movie/${id}`), tmdb(`/movie/${id}/reviews`)]);
    if (!details.runtime || !details.vote_average) return showError('TMDB has no runtime or rating for this one yet. Try another title.');
    render(details, bestReview(reviews.results || []));
  } catch (err) {
    showError(navigator.onLine ? err.message : 'You are offline. Reconnect and try again.');
  }
});
