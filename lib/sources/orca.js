'use strict';
// Quelle: OrcaSlicer-Profilrepo (enthält auch die Bambu-Lab-Profile und die
// OrcaFilamentLibrary mit Herstellerfilamenten). Lädt alle Filament- und
// Druckerprofile des neuesten Releases und aktualisiert inkrementell per Git-Blob-SHA.
const { gh, getText, pool, rawUrl, blobUrl } = require('../net');

const REPO = 'OrcaSlicer/OrcaSlicer';
const BASE = 'resources/profiles/';
const LIB = 'OrcaFilamentLibrary';

// Snapmaker Orca (Fork) bringt eigene, abweichende Snapmaker-Profile mit; diese haben für
// Snapmaker-Drucker Vorrang vor dem Upstream-Ordner.
const UPSTREAM = { repo: REPO, label: 'OrcaSlicer', vendors: null };
const SNAPMAKER = { repo: 'Snapmaker/OrcaSlicer', label: 'Snapmaker Orca', vendors: ['Snapmaker'] };

async function latestRef(repo = REPO) {
  const rel = await gh(`/repos/${repo}/releases/latest`);
  return rel.tag_name;
}

function makeSource(cfg) {
  return {
    check: async prev => { const ref = await latestRef(cfg.repo); return { ref, changed: !prev || prev.ref !== ref }; },
    update: (prev, progress) => update(prev, progress, cfg),
  };
}

async function check(prev) {
  const ref = await latestRef();
  return { ref, changed: !prev || prev.ref !== ref };
}

async function update(prev, progress, cfg = UPSTREAM) {
  const REPO = cfg.repo;
  const ref = await latestRef(REPO);
  const tree = await gh(`/repos/${REPO}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  if (tree.truncated) throw new Error('GitHub-Tree abgeschnitten – bitte später erneut versuchen');
  const inVendors = p => !cfg.vendors || cfg.vendors.some(v => p.startsWith(BASE + v + '/') || p === BASE + v + '.json');
  const wanted = tree.tree.filter(t => t.type === 'blob' && t.path.startsWith(BASE) && t.path.endsWith('.json') && inVendors(t.path) &&
    (/^resources\/profiles\/[^/]+\.json$/.test(t.path) || /^resources\/profiles\/[^/]+\/(filament|machine)\//.test(t.path)));
  const old = (prev && prev.files) || {};
  const files = {};
  const todo = [];
  for (const t of wanted) {
    const rel = t.path.slice(BASE.length);
    if (old[rel] && old[rel].sha === t.sha) files[rel] = old[rel];
    else todo.push({ rel, sha: t.sha, path: t.path });
  }
  progress(`${cfg.label} ${ref}: ${todo.length} von ${wanted.length} Dateien neu/geändert`);
  let failed = 0;
  await pool(todo, 24, async t => {
    try {
      const txt = await getText(rawUrl(REPO, ref, t.path));
      files[t.rel] = { sha: t.sha, j: JSON.parse(txt.replace(/^﻿/, '')) };
    } catch (e) {
      failed++;
      if (old[t.rel]) files[t.rel] = old[t.rel];
    }
  }, (d, n) => { if (d % 200 === 0 || d === n) progress(`${cfg.label}: ${d}/${n} Profile geladen`, d / n); });
  return { ref, repo: REPO, fetchedAt: new Date().toISOString(), files, failed, count: Object.keys(files).length };
}

// ---------------------------------------------------------------------------
// Modell: Vererbung auflösen, Drucker- und Filamentlisten aufbauen.

const VENDOR_NAMES = { BBL: 'Bambu Lab', OrcaFilamentLibrary: 'Orca Filament Library', Custom: 'Generisch' };

// overlay: Rohdaten des Snapmaker-Forks; ersetzt dessen Herstellerordner im Upstream-Bestand.
function buildModel(raw, overlay) {
  const vendors = {};
  const files = { ...raw.files };
  const origin = {};
  if (overlay && overlay.files) {
    const top = rel => rel.split('/')[0].replace(/\.json$/, '');
    const ov = new Set(Object.keys(overlay.files).map(top));
    for (const rel of Object.keys(files)) if (ov.has(top(rel))) delete files[rel];
    for (const [rel, f] of Object.entries(overlay.files)) { files[rel] = f; origin[rel] = overlay; }
  }
  // Herkunft je Datei (Repo, Release, Link) für die Quellenanzeige
  const srcOf = rel => {
    const o = origin[rel] || raw;
    const repo = o.repo || REPO;
    return { label: `${repo === REPO ? 'OrcaSlicer' : 'Snapmaker Orca'} ${o.ref} · ${rel}`, url: blobUrl(repo, o.ref, BASE + rel), fetchedAt: o.fetchedAt };
  };
  for (const [rel, f] of Object.entries(files)) {
    const parts = rel.split('/');
    if (parts.length === 1) continue;
    const vendor = parts[0], kind = parts[1];
    const v = vendors[vendor] || (vendors[vendor] = { filament: new Map(), machine: new Map() });
    if (!f.j || !f.j.name || !v[kind]) continue;
    v[kind].set(f.j.name, { rel, j: f.j });
  }
  const memo = new Map();

  function find(vendor, kind, name) {
    for (const vn of [vendor, LIB, 'BBL']) {
      const v = vendors[vn];
      if (v && v[kind] && v[kind].has(name)) return { vendor: vn, ...v[kind].get(name) };
    }
    return null;
  }

  // Liefert {key: {v, rel}} mit aufgelöster Vererbung (inherits + include).
  function resolve(vendor, kind, name, depth = 0) {
    const k = vendor + '|' + kind + '|' + name;
    if (memo.has(k)) return memo.get(k);
    const p = find(vendor, kind, name);
    if (!p || depth > 20) return null;
    let out = {};
    if (p.j.inherits) {
      const parent = resolve(p.vendor, kind, p.j.inherits, depth + 1);
      if (parent) out = { ...parent.values };
    }
    for (const inc of [].concat(p.j.include || [])) {
      const ip = resolve(p.vendor, kind, inc, depth + 1);
      if (ip) for (const [key, val] of Object.entries(ip.values)) out[key] = mergeVal(out[key], val);
    }
    for (const [key, v] of Object.entries(p.j)) {
      if (['inherits', 'include', 'name', 'from', 'instantiation', 'type', 'setting_id'].includes(key)) continue;
      out[key] = mergeVal(out[key], { v, rel: p.rel });
    }
    const res = { name, vendor: p.vendor, rel: p.rel, values: out, raw: p.j };
    memo.set(k, res);
    return res;
  }

  // Printers
  const printers = [];
  for (const [vendor, v] of Object.entries(vendors)) {
    for (const [name, p] of v.machine) {
      if (p.j.instantiation === 'false' || p.j.type !== 'machine') continue;
      const r = resolve(vendor, 'machine', name);
      if (!r) continue;
      const val = key => r.values[key] && r.values[key].v;
      const model = val('printer_model');
      if (!model) continue;
      const noz = first(val('nozzle_diameter')) || p.j.printer_variant;
      printers.push({
        source: 'orca', vendorDir: vendor, vendor: VENDOR_NAMES[vendor] || vendor,
        preset: name, model, nozzle: String(parseFloat(noz)),
        variants: String(first(val('extruder_variant_list')) || '').split(',').map(s => s.trim()).filter(Boolean),
        rel: p.rel,
      });
    }
  }

  // Filaments (instanzierbar)
  const filaments = [];
  for (const [vendor, v] of Object.entries(vendors)) {
    for (const [name, p] of v.filament) {
      if (p.j.instantiation === 'false' || name.startsWith('fdm_')) continue;
      const r = resolve(vendor, 'filament', name);
      if (!r) continue;
      const val = key => r.values[key] && r.values[key].v;
      filaments.push({
        vendorDir: vendor, name, base: name.replace(/\s*@.*$/, '').trim(),
        brand: first(val('filament_vendor')) || '', type: first(val('filament_type')) || '',
        compatible: [].concat(val('compatible_printers') || []).filter(Boolean),
        condition: val('compatible_printers_condition') || '',
        rel: p.rel,
      });
    }
  }
  return { ref: raw.ref, fetchedAt: raw.fetchedAt, vendors, resolve, printers, filaments, find, srcOf };
}

function mergeVal(prev, next) {
  // "nil" in einem Array-Eintrag bedeutet: Wert vom Elternprofil übernehmen.
  if (prev && Array.isArray(prev.v) && Array.isArray(next.v) && next.v.includes('nil')) {
    const v = next.v.map((x, i) => x === 'nil' && prev.v[i] !== undefined ? prev.v[i] : x);
    const rels = next.v.map((x, i) => x === 'nil' ? (prev.rels ? prev.rels[i] : prev.rel) : next.rel);
    return { v, rel: next.rel, rels };
  }
  return next;
}

function first(v) { return Array.isArray(v) ? v[0] : v; }

module.exports = { check, update, buildModel, REPO, snapmaker: makeSource(SNAPMAKER), VENDOR_NAMES, blob: (ref, rel) => blobUrl(REPO, ref, BASE + rel) };
