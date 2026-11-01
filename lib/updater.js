'use strict';
// Steuert Prüfung und Aktualisierung aller Datenquellen; Fortschritt für die Oberfläche.
const store = require('./store');
const catalog = require('./catalog');
const local = require('./local');

const SOURCES = {
  orca: { mod: require('./sources/orca'), label: 'OrcaSlicer-Profile (inkl. Bambu Lab & Orca Filament Library)', url: 'https://github.com/OrcaSlicer/OrcaSlicer/tree/main/resources/profiles' },
  snapmaker: { mod: require('./sources/orca').snapmaker, label: 'Snapmaker-Orca-Profile (Snapmaker-Drucker, vom Hersteller)', url: 'https://github.com/Snapmaker/OrcaSlicer/tree/main/resources/profiles/Snapmaker' },
  prusa: { mod: require('./sources/prusa'), label: 'PrusaSlicer-Profilbündel', url: 'https://github.com/prusa3d/PrusaSlicer-settings-prusa-fff' },
  cura: { mod: require('./sources/cura'), label: 'Cura fdm_materials', url: 'https://github.com/Ultimaker/fdm_materials' },
  ofd: { mod: require('./sources/ofd'), label: 'Open Filament Database (Herstellerdaten/TDS)', url: 'https://github.com/OpenFilamentCollective/open-filament-database' },
  spoolman: { mod: require('./sources/spoolman'), label: 'SpoolmanDB', url: 'https://github.com/Donkie/SpoolmanDB' },
  schema: { mod: require('./sources/schema'), label: 'Slicer-Schemas (gültige Einstellungen)', url: null },
};

const state = { running: false, phase: '', progress: 0, log: [], lastCheck: null, available: {}, error: null };

function meta() { return store.read('meta.json', { sources: {} }); }
function log(msg) {
  state.log.push({ t: new Date().toISOString(), msg });
  if (state.log.length > 200) state.log.shift();
  state.phase = msg;
}

function status() {
  const m = meta();
  return {
    running: state.running, phase: state.phase, progress: state.progress, error: state.error,
    lastCheck: m.lastCheck || null, lastUpdate: m.lastUpdate || null, available: state.available,
    log: state.log.slice(-30),
    sources: Object.entries(SOURCES).map(([id, s]) => ({ id, label: s.label, url: s.url, ...(m.sources[id] || {}), updateAvailable: !!state.available[id] })),
  };
}

function localTags() {
  const l = local.detect();
  return { snapmaker: l.snapmaker && l.snapmaker.tag ? { tag: l.snapmaker.tag } : null, orca: l.orca && l.orca.tag ? { tag: l.orca.tag } : null, bambu: l.bambu && l.bambu.tag ? { tag: l.bambu.tag } : null, prusa: l.prusa && l.prusa.tag ? { tag: l.prusa.tag } : null };
}

async function check() {
  const m = meta();
  const avail = {};
  for (const [id, s] of Object.entries(SOURCES)) {
    if (id === 'schema') continue;
    const prev = m.sources[id];
    try {
      const r = await s.mod.check(prev && { ref: prev.ref });
      if (r.changed || !store.read(`sources/${id}.json`)) avail[id] = r.ref || true;
    } catch (e) {
      log(`Prüfung ${id} fehlgeschlagen: ${e.message}`);
    }
  }
  m.lastCheck = new Date().toISOString();
  store.write('meta.json', m);
  state.available = avail;
  return avail;
}

async function update(only) {
  if (state.running) throw new Error('Aktualisierung läuft bereits');
  state.running = true; state.error = null; state.progress = 0;
  const ids = only && only.length ? only : Object.keys(SOURCES);
  const m = meta();
  let errors = 0;
  try {
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const s = SOURCES[id];
      const prev = store.read(`sources/${id}.json`);
      log(`${s.label}: wird aktualisiert …`);
      const progress = (msg, frac) => { log(msg); state.progress = (i + (frac || 0)) / ids.length; };
      try {
        const data = id === 'schema' ? await s.mod.update(prev, progress, localTags()) : await s.mod.update(prev, progress);
        store.write(`sources/${id}.json`, data);
        m.sources[id] = { ref: data.ref, fetchedAt: data.fetchedAt, ok: true, error: null };
        delete state.available[id];
        log(`${s.label}: fertig (${data.ref ? String(data.ref).slice(0, 40) : 'ok'})`);
      } catch (e) {
        errors++;
        m.sources[id] = { ...(m.sources[id] || {}), ok: false, error: e.message, failedAt: new Date().toISOString() };
        log(`${s.label}: FEHLER – ${e.message}`);
      }
      store.write('meta.json', m);
    }
    m.lastUpdate = new Date().toISOString();
    m.lastCheck = m.lastUpdate;
    store.write('meta.json', m);
    log('Katalog wird neu aufgebaut …');
    catalog.build();
    const sm = catalog.summary();
    log(`Fertig: ${sm.counts.brands} Hersteller, ${sm.counts.products} Produkte, ${sm.counts.printers} Drucker` + (errors ? ` – ${errors} Quelle(n) mit Fehlern (alte Daten bleiben erhalten)` : ''));
    state.progress = 1;
    if (errors) state.error = `${errors} Quelle(n) konnten nicht aktualisiert werden – siehe Protokoll.`;
  } catch (e) {
    state.error = e.message;
    log('Fehler: ' + e.message);
  } finally {
    state.running = false;
  }
}

function hasData() { return !!store.read('meta.json', { sources: {} }).lastUpdate; }

module.exports = { check, update, status, hasData, state };
