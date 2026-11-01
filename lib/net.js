'use strict';
// Netzwerk-Helfer: fetch mit Timeout/Retry, robots.txt-Prüfung, Parallel-Pool.
const zlib = require('zlib');

const UA = 'FilamentProfiler/1.0 (lokale Desktop-App; liest oeffentliche Profil-Datenbanken)';
const robotsCache = new Map();

async function robotsAllowed(url) {
  const u = new URL(url);
  const key = u.origin;
  if (!robotsCache.has(key)) {
    robotsCache.set(key, (async () => {
      try {
        const r = await fetch(key + '/robots.txt', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || !ct.includes('text/plain')) return [];
        return parseRobots(await r.text());
      } catch { return []; }
    })());
  }
  const rules = await robotsCache.get(key);
  const p = u.pathname + u.search;
  let best = null;
  for (const r of rules) {
    if (p.startsWith(r.path) && (!best || r.path.length > best.path.length)) best = r;
  }
  return !best || best.allow;
}

function parseRobots(txt) {
  // Nur Gruppen für "*" bzw. unseren UA auswerten.
  const rules = [];
  let applies = false, lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === 'user-agent') {
      if (!lastWasAgent) applies = false;
      if (v === '*' || /filamentprofiler/i.test(v)) applies = true;
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!applies) continue;
    if (k === 'disallow' && v) rules.push({ path: v, allow: false });
    if (k === 'allow' && v) rules.push({ path: v, allow: true });
  }
  return rules;
}

async function request(url, { as = 'text', retries = 3, timeout = 60000, headers = {} } = {}) {
  if (!(await robotsAllowed(url))) throw new Error('robots.txt verbietet Zugriff: ' + url);
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: as === 'json' ? 'application/json' : '*/*', ...headers },
        redirect: 'follow',
        signal: AbortSignal.timeout(timeout),
      });
      if (r.status === 404) { const e = new Error('404 ' + url); e.status = 404; throw e; }
      if (r.status === 403 || r.status === 429) {
        const reset = r.headers.get('x-ratelimit-reset');
        const e = new Error(`HTTP ${r.status} (Rate-Limit?) ${url}` + (reset ? ` – wieder frei ab ${new Date(reset * 1000).toLocaleTimeString('de-DE')}` : ''));
        e.status = r.status;
        throw e;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`);
      if (as === 'json') return await r.json();
      if (as === 'buffer') return Buffer.from(await r.arrayBuffer());
      if (as === 'gunzip-json') return JSON.parse(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString('utf8'));
      return await r.text();
    } catch (e) {
      lastErr = e;
      if (e.status === 404 || e.status === 403) break;
      await new Promise(res => setTimeout(res, 800 * (i + 1)));
    }
  }
  throw lastErr;
}

const getJSON = (url, o) => request(url, { ...o, as: 'json' });
const getText = (url, o) => request(url, { ...o, as: 'text' });

// GitHub-API (ohne Token: 60 Anfragen/Stunde) – nur für Tree-Listen & Release-Infos verwendet.
async function gh(path) {
  // Im GitHub-Actions-Update-Job steht ein Token bereit (höheres Abruflimit).
  const auth = process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {};
  return getJSON('https://api.github.com' + path, { headers: { Accept: 'application/vnd.github+json', ...auth } });
}

async function pool(items, n, fn, onProgress) {
  let i = 0, done = 0;
  const results = new Array(items.length);
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await fn(items[idx], idx);
      done++;
      if (onProgress) onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return results;
}

const rawUrl = (repo, ref, path) =>
  `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref).replace(/%2F/g, '/')}/${path.split('/').map(encodeURIComponent).join('/')}`;
const blobUrl = (repo, ref, path) =>
  `https://github.com/${repo}/blob/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`;

module.exports = { request, getJSON, getText, gh, pool, rawUrl, blobUrl, robotsAllowed, UA };
