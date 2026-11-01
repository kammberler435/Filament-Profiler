'use strict';
// Täglicher Datenabruf für die Website (läuft in GitHub Actions, nutzt GITHUB_TOKEN):
// aktualisiert alle Quellen inkrementell in data/ und liest die Slicer-Schemas der letzten Releases.
const path = require('path');
const fs = require('fs');
const updater = require('../lib/updater');
const schema = require('../lib/sources/schema');

const FILE = path.join(__dirname, '..', 'data', 'web-schemas.json');

(async () => {
  let last = '';
  const iv = setInterval(() => { const s = updater.status(); if (s.phase !== last) { last = s.phase; console.log(s.phase); } }, 500);
  await updater.update(['orca', 'snapmaker', 'prusa', 'cura', 'ofd', 'spoolman']);
  clearInterval(iv);
  const st = updater.status();
  const failed = st.sources.filter(s => s.ok === false);
  for (const s of failed) console.error(`Quelle ${s.id} fehlgeschlagen: ${s.error}`);

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { /* erster Lauf */ }
  const v = await schema.versions(prev, msg => console.log(msg));
  fs.writeFileSync(FILE, JSON.stringify(v));
  console.log('Schemas:', Object.entries(v).map(([k, l]) => `${k}: ${l.map(x => x.tag).join(', ')}`).join(' | '));
  // Ohne jede Quelle keine Website bauen; einzelne Fehler behalten die Daten vom Vortag.
  if (failed.length === 6) process.exit(1);
})().catch(e => { console.error(e); process.exit(1); });
