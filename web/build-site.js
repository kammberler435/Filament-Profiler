'use strict';
// Baut die statische Website nach web/dist:
//  - bündelt lib/* (CommonJS) mit Browser-Ersatzmodulen zu engine.js
//  - kopiert die Oberfläche aus public/
//  - packt den Datencache (data/sources/*) und die Slicer-Schemas zu data/data.json
// Aufruf: node web/build-site.js   (Daten vorher mit web/build-data.js oder der Desktop-App laden)
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(__dirname, 'dist');
const DATA = path.join(ROOT, 'data');

const MODULES = [
  'lib/catalog.js', 'lib/generator.js', 'lib/defaults.js', 'lib/exporters.js',
  'lib/sources/orca.js', 'lib/sources/prusa.js', 'lib/sources/cura.js', 'lib/sources/ofd.js',
  'lib/web/store.js', 'lib/web/net.js', 'lib/web/crypto.js', 'lib/web/api.js',
];
// Node-Module → Browser-Ersatz
const ALIAS = { 'lib/store.js': 'lib/web/store.js', 'lib/net.js': 'lib/web/net.js', crypto: 'lib/web/crypto.js', path: '@path' };

function bundle() {
  let out = '/* Filament Profiler – Browser-Engine (automatisch erzeugt aus lib/, nicht bearbeiten) */\n(function () {\n"use strict";\nconst defs = {};\n';
  for (const m of MODULES) {
    const src = fs.readFileSync(path.join(ROOT, m), 'utf8');
    out += `defs[${JSON.stringify(m)}] = function (module, exports, require) {\n${src}\n};\n`;
  }
  out += `
const ALIAS = ${JSON.stringify(ALIAS)};
const cache = {};
const builtin = { '@path': { basename: p => String(p).split(/[\\\\/]/).pop() } };
function resolve(from, req) {
  if (!req.startsWith('.')) return ALIAS[req] || req;
  const parts = from.split('/'); parts.pop();
  for (const seg of req.split('/')) { if (seg === '..') parts.pop(); else if (seg !== '.') parts.push(seg); }
  let id = parts.join('/');
  if (!id.endsWith('.js')) id += '.js';
  return ALIAS[id] || id;
}
function load(id) {
  if (builtin[id]) return builtin[id];
  if (cache[id]) return cache[id].exports;
  if (!defs[id]) throw new Error('Modul fehlt im Bundle: ' + id);
  const module = { exports: {} };
  cache[id] = module;
  defs[id](module, module.exports, req => load(resolve(id, req)));
  return module.exports;
}
window.FP_WEB = load('lib/web/api.js');
})();
`;
  return out;
}

// Druckerprofile enthalten große G-Code-Blöcke, die der Generator nicht braucht.
const MACHINE_KEYS = new Set(['type', 'name', 'inherits', 'include', 'from', 'instantiation', 'setting_id', 'printer_model', 'printer_variant',
  'nozzle_diameter', 'extruder_variant_list', 'retraction_length', 'retraction_speed', 'deretraction_speed', 'z_hop', 'extruder_type',
  'gcode_flavor', 'nozzle_type']);
function compactOrca(raw) {
  if (!raw) return raw;
  const files = {};
  for (const [rel, f] of Object.entries(raw.files)) {
    if (!f.j) continue;
    let j = f.j;
    if (/\/machine\//.test(rel)) j = Object.fromEntries(Object.entries(j).filter(([k]) => MACHINE_KEYS.has(k)));
    else if (!rel.includes('/')) j = { name: j.name, version: j.version };
    files[rel] = { j };
  }
  return { ...raw, files };
}
function compactPrusa(raw) {
  if (!raw) return raw;
  const vendors = {};
  for (const [k, v] of Object.entries(raw.vendors || {})) {
    // Nur Abschnitte behalten, die der Generator nutzt (Hersteller, Druckermodelle, Drucker, Filamente).
    const keep = [];
    let on = false;
    for (const line of v.text.split(/\r?\n/)) {
      const s = line.match(/^\[([^\]:]+)/);
      if (s) on = ['vendor', 'printer_model', 'printer', 'filament'].includes(s[1]);
      if (on) keep.push(line);
    }
    vendors[k] = { vendor: v.vendor, version: v.version, url: v.url, text: keep.join('\n') };
  }
  return { ...raw, vendors };
}
function compactCura(raw) {
  if (!raw) return raw;
  return { ...raw, files: Object.fromEntries(Object.entries(raw.files).map(([p, f]) => [p, { xml: f.xml }])) };
}

function readJson(f, fb = null) { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fb; } }

function buildData() {
  const src = n => readJson(path.join(DATA, 'sources', n + '.json'));
  const meta = readJson(path.join(DATA, 'meta.json'), { sources: {} });
  // Mehrere Slicer-Versionen (vom Update-Job), sonst die eine Version aus dem Desktop-Cache
  let schemas = readJson(path.join(DATA, 'web-schemas.json'));
  if (!schemas) {
    const s = src('schema');
    schemas = {};
    for (const [k, v] of Object.entries((s && s.slicers) || {})) schemas[k] = [v];
  }
  const URLS = {
    orca: 'https://github.com/OrcaSlicer/OrcaSlicer/tree/main/resources/profiles', snapmaker: 'https://github.com/Snapmaker/OrcaSlicer/tree/main/resources/profiles/Snapmaker',
    prusa: 'https://github.com/prusa3d/PrusaSlicer-settings-prusa-fff', cura: 'https://github.com/Ultimaker/fdm_materials',
    ofd: 'https://github.com/OpenFilamentCollective/open-filament-database', spoolman: 'https://github.com/Donkie/SpoolmanDB',
  };
  const sources = {};
  for (const id of Object.keys(URLS)) if (meta.sources[id]) sources[id] = { ref: meta.sources[id].ref, fetchedAt: meta.sources[id].fetchedAt, ok: meta.sources[id].ok, url: URLS[id] };
  return {
    builtAt: meta.lastUpdate || new Date().toISOString(),
    meta: { sources },
    schemas,
    store: {
      'sources/orca.json': compactOrca(src('orca')),
      'sources/snapmaker.json': compactOrca(src('snapmaker')),
      'sources/prusa.json': compactPrusa(src('prusa')),
      'sources/cura.json': compactCura(src('cura')),
      'sources/ofd.json': src('ofd'),
      'sources/spoolman.json': src('spoolman'),
    },
  };
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
  fs.writeFileSync(path.join(DIST, 'engine.js'), bundle());
  for (const f of ['app.js', 'style.css', 'icon.svg']) fs.copyFileSync(path.join(ROOT, 'public', f), path.join(DIST, f));
  const html = fs.readFileSync(path.join(ROOT, 'public', 'index.html'), 'utf8')
    .replace('<script src="app.js"></script>', '<script src="engine.js"></script>\n<script src="app.js"></script>');
  fs.writeFileSync(path.join(DIST, 'index.html'), html);
  fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
  const data = JSON.stringify(buildData());
  fs.writeFileSync(path.join(DIST, 'data', 'data.json'), data);
  const gz = require('zlib').gzipSync(data).length;
  console.log(`Website gebaut: ${DIST}\n  data.json ${(data.length / 1e6).toFixed(1)} MB (gzip ca. ${(gz / 1e6).toFixed(1)} MB)`);
}

main();
