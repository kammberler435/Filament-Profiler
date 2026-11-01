'use strict';
// Filament Profiler – lokaler Server (nur 127.0.0.1) + Start des App-Fensters.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = 47811;
const HOST = '127.0.0.1';
const PUBLIC = path.join(__dirname, 'public');
const OPEN = process.argv.includes('--open');

const store = require('./lib/store');
const updater = require('./lib/updater');
const catalog = require('./lib/catalog');
const generator = require('./lib/generator');
const exporters = require('./lib/exporters');
const local = require('./lib/local');

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

function settings() { return store.read('settings.json', { autoUpdate: true }); }

let lastBeat = 0, everBeat = false, liveCount = 0;

function send(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', d => { s += d; if (s.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function fieldMeta() {
  return generator.FIELDS.map(f => ({ id: f.id, group: f.group, label: f.label, unit: f.unit, plate: f.plate || null, orca: f.orca, prusa: f.prusa }));
}

function schemaInfo() {
  const s = store.read('sources/schema.json');
  if (!s) return null;
  const o = {};
  for (const [k, v] of Object.entries(s.slicers || {})) o[k] = { tag: v.tag, basis: v.basis, url: v.url, keys: (v.keys || []).length };
  return o;
}

async function api(req, res, url) {
  const p = url.pathname;
  if (p === '/api/ping') return send(res, 200, { app: 'filament-profiler' });
  if (p === '/api/live') {
    // Dauerverbindung des App-Fensters: bricht sie ab und kommt nicht wieder, wird der Server beendet.
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write(': verbunden\n\n');
    liveCount++; everBeat = true; lastBeat = Date.now();
    const ping = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(ping);
      liveCount--;
      lastBeat = Date.now();
      setTimeout(() => {
        if (OPEN && liveCount === 0 && !updater.state.running) { console.log('Fenster geschlossen – beende.'); process.exit(0); }
      }, 10000);
    });
    return;
  }
  if (p === '/api/heartbeat') { lastBeat = Date.now(); everBeat = true; return send(res, 200, { ok: true }); }
  if (p === '/api/bye') { lastBeat = Date.now() - 170000; return send(res, 200, { ok: true }); }
  if (p === '/api/status') {
    const hasData = updater.hasData();
    return send(res, 200, {
      updater: updater.status(), hasData, settings: settings(),
      counts: hasData ? catalog.summary().counts : null,
      local: local.publicInfo(local.detect()), schema: schemaInfo(),
    });
  }
  if (p === '/api/settings' && req.method === 'POST') {
    const b = await readBody(req);
    const s = { ...settings(), ...b };
    store.write('settings.json', s);
    return send(res, 200, s);
  }
  if (p === '/api/check' && req.method === 'POST') { const a = await updater.check(); return send(res, 200, { available: a }); }
  if (p === '/api/update' && req.method === 'POST') {
    const b = await readBody(req);
    updater.update(b.only).catch(() => {});
    return send(res, 202, { started: true });
  }
  if (p === '/api/fields') return send(res, 200, fieldMeta());
  if (p === '/api/brands') return send(res, 200, catalog.summary().brands);
  if (p === '/api/printers') return send(res, 200, catalog.summary().printers);
  if (p === '/api/products') return send(res, 200, catalog.productsOf(url.searchParams.get('brand')));
  if (p === '/api/printer') {
    const pr = catalog.get().printers.get(url.searchParams.get('key'));
    if (!pr) return send(res, 404, { error: 'Drucker nicht gefunden' });
    const nozzles = {};
    for (const [n, v] of Object.entries(pr.nozzles)) nozzles[n] = { orca: v.orca && v.orca.preset, prusa: v.prusa && v.prusa.preset, variants: (v.orca && v.orca.variants) || [] };
    return send(res, 200, { key: pr.key, vendor: pr.vendor, model: pr.model, nozzles });
  }
  if (p === '/api/printerByPreset') {
    const name = url.searchParams.get('name');
    for (const pr of catalog.get().printers.values()) {
      for (const [n, v] of Object.entries(pr.nozzles)) {
        if ((v.orca && v.orca.preset === name) || (v.prusa && v.prusa.preset === name)) return send(res, 200, { key: pr.key, model: pr.model, nozzle: n });
      }
    }
    return send(res, 404, { error: 'Nicht im Katalog' });
  }
  if (p === '/api/generate' && req.method === 'POST') {
    const b = await readBody(req);
    return send(res, 200, generator.generate(b));
  }
  if (p === '/api/export' && req.method === 'POST') {
    const b = await readBody(req);
    const r = generator.generate(b);
    const out = exporters.exportProfile(r, b.target, store.read('sources/schema.json'), { ...b.exportOptions, version: localVersion(b.target) });
    return send(res, 200, out);
  }
  if (p === '/api/install' && req.method === 'POST') {
    const b = await readBody(req);
    const r = generator.generate(b);
    const out = exporters.exportProfile(r, b.target, store.read('sources/schema.json'), { ...b.exportOptions, version: localVersion(b.target) });
    const files = [{ name: out.filename, content: out.content }];
    if (out.info) files.push({ name: out.infoName, content: out.info });
    try {
      const standalone = ['orca', 'bambu', 'snapmaker'].includes(b.target) && !/"inherits": "[^"]/.test(out.content);
      const written = local.install(local.detect(), b.target, files, !!b.overwrite, standalone ? 'base' : null);
      return send(res, 200, { written, removed: out.removed });
    } catch (e) {
      return send(res, e.code === 'EXISTS' ? 409 : 400, { error: e.message, exists: e.code === 'EXISTS' });
    }
  }
  return send(res, 404, { error: 'Unbekannter Endpunkt' });
}

function localVersion(target) {
  const l = local.detect()[target];
  if (target === 'orca' && l && l.version) return l.version;
  if ((target === 'bambu' || target === 'snapmaker') && l && l.version) return l.version;
  return undefined;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    let f = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!f.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Nicht gefunden'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: e.message });
  }
});

function openWindow() {
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const la = process.env.LOCALAPPDATA || '';
  const candidates = [
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(la, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  const exe = candidates.find(c => fs.existsSync(c));
  const url = `http://${HOST}:${PORT}/`;
  if (!exe) { spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref(); return; }
  const profile = path.join(la, 'FilamentProfiler', 'browser');
  const child = spawn(exe, [`--app=${url}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--window-size=1500,950'], { detached: true, stdio: 'ignore' });
  child.unref();
  // Fenster geschlossen → Browserprozess endet. Kurz warten: lief schon eine Instanz, übergibt der neue
  // Prozess nur und endet sofort, das Fenster sendet aber weiter Herzschläge.
  child.on('exit', () => setTimeout(() => {
    if (liveCount === 0 && Date.now() - lastBeat > 15000 && !updater.state.running) { console.log('Fenster geschlossen – beende.'); process.exit(0); }
  }, 16000));
}

async function startupUpdate() {
  try {
    if (!updater.hasData()) { await updater.update(); return; }
    catalog.build();
    const avail = await updater.check();
    if (Object.keys(avail).length && settings().autoUpdate) await updater.update([...Object.keys(avail), 'schema']);
  } catch (e) { console.error('Startprüfung:', e.message); }
}

server.on('error', async e => {
  if (e.code === 'EADDRINUSE') {
    try {
      const r = await fetch(`http://${HOST}:${PORT}/api/ping`);
      const j = await r.json();
      if (j.app === 'filament-profiler') { console.log('Läuft bereits – öffne Fenster.'); if (OPEN) openWindow(); process.exit(0); }
    } catch { /* fremder Dienst */ }
    console.error(`Port ${PORT} ist belegt.`);
    process.exit(1);
  }
  throw e;
});

server.listen(PORT, HOST, () => {
  console.log(`Filament Profiler läuft auf http://${HOST}:${PORT}/  (Fenster schließen beendet den Server)`);
  if (OPEN) openWindow();
  startupUpdate();
  // Server beenden, wenn das App-Fenster geschlossen wurde (kein Herzschlag mehr).
  setInterval(() => {
    if (OPEN && everBeat && liveCount === 0 && Date.now() - lastBeat > 180000 && !updater.state.running) { console.log('Fenster geschlossen – beende.'); process.exit(0); }
  }, 5000).unref();
});
