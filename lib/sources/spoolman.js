'use strict';
// Quelle: SpoolmanDB (Donkie/SpoolmanDB) – Community-Datenbank mit Dichte, Spulengewicht,
// Leergewicht und Temperaturangaben je Hersteller/Material.
const { request } = require('../net');

const URL_JSON = 'https://donkie.github.io/SpoolmanDB/filaments.json';

async function remoteStamp() {
  const r = await fetch(URL_JSON, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
  return r.headers.get('etag') || r.headers.get('last-modified') || '';
}

async function check(prev) {
  const ref = await remoteStamp();
  return { ref, changed: !prev || !ref || prev.ref !== ref };
}

async function update(prev, progress) {
  progress('SpoolmanDB wird geladen …');
  const ref = await remoteStamp().catch(() => '');
  if (prev && ref && prev.ref === ref) return prev;
  const list = JSON.parse(await request(URL_JSON, { timeout: 120000 }));
  // Je Hersteller+Material verdichten.
  const groups = {};
  for (const f of list) {
    const k = f.manufacturer + '|' + f.material;
    const g = groups[k] || (groups[k] = { manufacturer: f.manufacturer, material: f.material, items: 0, density: {}, weight: {}, spool_weight: {}, extruder_temp: {}, bed_temp: {}, names: [] });
    g.items++;
    for (const key of ['density', 'weight', 'spool_weight', 'extruder_temp', 'bed_temp']) {
      if (f[key] != null) g[key][f[key]] = (g[key][f[key]] || 0) + 1;
    }
    if (g.names.length < 40 && !g.names.includes(f.name)) g.names.push(f.name);
  }
  const mode = o => { let best = null, n = 0; for (const [k, c] of Object.entries(o)) if (c > n) { n = c; best = parseFloat(k); } return best; };
  const out = Object.values(groups).map(g => ({
    manufacturer: g.manufacturer, material: g.material, count: g.items, names: g.names,
    density: mode(g.density), weight: mode(g.weight), spool_weight: mode(g.spool_weight),
    extruder_temp: mode(g.extruder_temp), bed_temp: mode(g.bed_temp),
  }));
  return { ref, url: URL_JSON, fetchedAt: new Date().toISOString(), groups: out };
}

module.exports = { check, update, URL_JSON };
