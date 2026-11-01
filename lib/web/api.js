'use strict';
// Browser-Gegenstück zu den Server-Endpunkten: die Oberfläche ruft api(pfad, body) auf,
// auf der Website beantwortet dieses Modul die Anfragen lokal.
const store = require('./store');
const catalog = require('../catalog');
const generator = require('../generator');
const exporters = require('../exporters');

const LABELS = {
  orca: 'OrcaSlicer-Profile (inkl. Bambu Lab & Orca Filament Library)', snapmaker: 'Snapmaker-Orca-Profile (Snapmaker-Drucker, vom Hersteller)',
  prusa: 'PrusaSlicer-Profilbündel', cura: 'Cura fdm_materials', ofd: 'Open Filament Database (Herstellerdaten/TDS)', spoolman: 'SpoolmanDB',
};

async function load(onProgress) {
  const r = await fetch('data/data.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('Daten konnten nicht geladen werden (HTTP ' + r.status + ')');
  const total = +r.headers.get('content-length') || 0;
  let data;
  if (r.body && total && onProgress) {
    const reader = r.body.getReader();
    const parts = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parts.push(value);
      got += value.length;
      onProgress(Math.min(1, got / total));
    }
    data = JSON.parse(new TextDecoder().decode(await new Blob(parts).arrayBuffer()));
  } else data = await r.json();
  store.load(data);
  catalog.build();
}

// Schema einer gewählten Slicer-Version in die vom Exporter erwartete Form bringen.
function schemaFor(target, tag) {
  const list = store.data().schemas[target] || [];
  const s = list.find(x => x.tag === tag) || list[0];
  return s ? { slicers: { [target]: s } } : null;
}
function versionFromTag(target, tag) {
  if (!tag || !['orca', 'snapmaker', 'bambu'].includes(target)) return undefined;
  return tag.replace(/^v/, '');
}

function status() {
  const d = store.data();
  const counts = catalog.summary().counts;
  const schema = {}, schemaVersions = {};
  for (const [k, list] of Object.entries(d.schemas || {})) {
    if (!list.length) continue;
    schema[k] = { tag: list[0].tag, basis: 'neuestes Release', url: list[0].url, keys: (list[0].keys || []).length };
    schemaVersions[k] = list.map(x => x.tag);
  }
  return {
    web: true, hasData: true, counts, local: {}, settings: {}, schema, schemaVersions,
    updater: {
      running: false, phase: '', progress: 1, error: null, available: {}, log: [], lastUpdate: d.builtAt, lastCheck: d.builtAt,
      sources: Object.entries(d.meta.sources || {}).map(([id, s]) => ({ id, label: LABELS[id] || id, url: s.url || null, ...s })),
    },
  };
}

async function api(path, body) {
  const url = new URL(path, location.href);
  const p = url.pathname.replace(/^.*\/api\//, '/api/');
  const q = k => url.searchParams.get(k);
  switch (p) {
    case '/api/status': return status();
    case '/api/fields': return generator.FIELDS.map(f => ({ id: f.id, group: f.group, label: f.label, unit: f.unit, plate: f.plate || null, orca: f.orca, prusa: f.prusa }));
    case '/api/brands': return catalog.summary().brands;
    case '/api/printers': return catalog.summary().printers;
    case '/api/products': return catalog.productsOf(q('brand'));
    case '/api/printer': {
      const pr = catalog.get().printers.get(q('key'));
      if (!pr) throw Object.assign(new Error('Drucker nicht gefunden'), { status: 404 });
      const nozzles = {};
      for (const [n, v] of Object.entries(pr.nozzles)) nozzles[n] = { orca: v.orca && v.orca.preset, prusa: v.prusa && v.prusa.preset, variants: (v.orca && v.orca.variants) || [] };
      return { key: pr.key, vendor: pr.vendor, model: pr.model, nozzles };
    }
    case '/api/generate': return generator.generate(body);
    case '/api/export': {
      const r = generator.generate(body);
      const tag = body.exportOptions && body.exportOptions.schemaTag;
      return exporters.exportProfile(r, body.target, schemaFor(body.target, tag), { ...body.exportOptions, version: versionFromTag(body.target, tag) });
    }
    case '/api/heartbeat': case '/api/settings': case '/api/check': return {};
    default: throw Object.assign(new Error('Auf der Website nicht verfügbar'), { status: 404 });
  }
}

module.exports = { load, api };
