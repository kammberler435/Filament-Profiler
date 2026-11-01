'use strict';
// Liest die echten Einstellungs-Schemas der Slicer aus deren Quellcode, damit Exporte nur
// Schlüssel enthalten, die die jeweilige Slicer-Version kennt.
const { gh, getText, rawUrl, blobUrl } = require('../net');

const SLICERS = {
  orca: { repo: 'OrcaSlicer/OrcaSlicer', file: 'src/libslic3r/PrintConfig.cpp', label: 'OrcaSlicer' },
  snapmaker: { repo: 'Snapmaker/OrcaSlicer', file: 'src/libslic3r/PrintConfig.cpp', label: 'Snapmaker Orca' },
  bambu: { repo: 'bambulab/BambuStudio', file: 'src/libslic3r/PrintConfig.cpp', label: 'Bambu Studio' },
  prusa: { repo: 'prusa3d/PrusaSlicer', file: 'src/libslic3r/PrintConfig.cpp', label: 'PrusaSlicer' },
};
const CURA_REPO = 'Ultimaker/Cura';
const PARSER = 3; // bei Änderungen an der Schlüssel-Extraktion erhöhen → Cache wird neu aufgebaut

function cppKeys(src) {
  const keys = new Set();
  for (const m of src.matchAll(/this->add(?:_nullable)?\(\s*"([A-Za-z0-9_]+)"/g)) keys.add(m[1]);
  // Per Schleife erzeugte Schlüssel, z. B. for (opt_key : {"retraction_length", …}) add(std::string("filament_") + opt_key)
  for (const m of src.matchAll(/this->add(?:_nullable)?\(\s*std::string\("([A-Za-z0-9_]+)"\)\s*\+\s*opt_key/g)) {
    const before = src.slice(Math.max(0, m.index - 4000), m.index);
    const loopAt = before.lastIndexOf('for (const char *opt_key : {');
    if (loopAt < 0) continue;
    const list = before.slice(loopAt, before.indexOf('})', loopAt) + 1).replace(/\/\/[^\n]*/g, '');
    for (const k of list.matchAll(/"([A-Za-z0-9_]+)"/g)) keys.add(m[1] + k[1]);
  }
  // Bambu-Stil: for (auto& opt_key : LISTE) { … add_nullable(opt_key, …) } mit LISTE = { "…", … };
  for (const m of src.matchAll(/for\s*\(\s*(?:const\s+)?auto\s*&?\s*opt_key\s*:\s*([A-Za-z0-9_]+)\s*\)\s*\{[\s\S]{0,600}?this->add(?:_nullable)?\(\s*opt_key\b/g)) {
    const decl = src.match(new RegExp(m[1] + '\\s*=?\\s*\\{([\\s\\S]*?)\\};'));
    if (decl) for (const k of decl[1].replace(/\/\/[^\n]*/g, '').matchAll(/"([A-Za-z0-9_]+)"/g)) keys.add(k[1]);
  }
  return [...keys];
}

async function tagExists(repo, tag) {
  try { await gh(`/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`); return true; } catch { return false; }
}

async function latestTag(repo) {
  return (await gh(`/repos/${repo}/releases/latest`)).tag_name;
}

async function check(prev, local) {
  const refs = {};
  for (const id of Object.keys(SLICERS)) refs[id] = (local && local[id] && local[id].tag) || await latestTag(SLICERS[id].repo);
  refs.cura = await latestTag(CURA_REPO);
  const ref = JSON.stringify(refs);
  return { ref, changed: !prev || prev.ref !== ref };
}

// local: erkannte installierte Versionen {orca:{tag}, bambu:{tag}} – bevorzugt deren Schema.
async function update(prev, progress, local = {}) {
  const out = { fetchedAt: new Date().toISOString(), slicers: {} };
  const refs = {};
  for (const [id, s] of Object.entries(SLICERS)) {
    let tag = local[id] && local[id].tag;
    let basis = 'installierte Version';
    if (!tag || !(await tagExists(s.repo, tag))) { tag = await latestTag(s.repo); basis = 'neuestes Release'; }
    refs[id] = tag;
    const old = prev && prev.slicers && prev.slicers[id];
    if (old && old.tag === tag && old.parser === PARSER) { out.slicers[id] = old; continue; }
    progress(`Schema ${s.label} ${tag} wird gelesen …`);
    const src = await getText(rawUrl(s.repo, tag, s.file));
    out.slicers[id] = { tag, basis, parser: PARSER, url: blobUrl(s.repo, tag, s.file), keys: cppKeys(src) };
  }
  // Cura: Material-XML-Zuordnung + gültige Einstellungs-Schlüssel aus fdmprinter.def.json
  out.slicers.cura = await curaSchema(prev && prev.slicers && prev.slicers.cura, progress);
  refs.cura = out.slicers.cura.tag;
  out.ref = JSON.stringify(refs);
  return out;
}

// Cura: Material-XML-Zuordnung + gültige Einstellungs-Schlüssel aus fdmprinter.def.json (neuestes Release)
async function curaSchema(old, progress) {
  const ctag = await latestTag(CURA_REPO);
  if (old && old.tag === ctag) return old;
  progress(`Schema Cura ${ctag} wird gelesen …`);
  const py = await getText(rawUrl(CURA_REPO, ctag, 'plugins/XmlMaterialProfile/XmlMaterialProfile.py'));
  const block = name => { const m = py.match(new RegExp(name + '\\s*=\\s*\\{([\\s\\S]*?)\\}')); return m ? m[1] : ''; };
  const mapKeys = s => [...s.matchAll(/"([^"]+)"\s*:/g)].map(m => m[1]);
  const setKeys = s => [...s.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  const def = JSON.parse(await getText(rawUrl(CURA_REPO, ctag, 'resources/definitions/fdmprinter.def.json')));
  const settingKeys = [];
  (function walk(o) { for (const [k, v] of Object.entries(o || {})) { if (v && typeof v === 'object') { if (v.type && v.type !== 'category') settingKeys.push(k); walk(v.children); } } })(def.settings);
  return {
    tag: ctag, basis: 'neuestes Release',
    url: blobUrl(CURA_REPO, ctag, 'plugins/XmlMaterialProfile/XmlMaterialProfile.py'),
    xmlSettings: mapKeys(block('__material_settings_setting_map')),
    xmlSerialized: setKeys(block('__keep_serialized_settings')),
    keys: settingKeys,
  };
}

// Für die Website: Schemas der letzten `count` stabilen Releases je Slicer (Nutzer wählt seine Version).
// prev: vorheriges Ergebnis – bereits gelesene Versionen werden wiederverwendet.
async function versions(prev, progress, count = 4) {
  const out = {};
  for (const [id, s] of Object.entries(SLICERS)) {
    const rels = (await gh(`/repos/${s.repo}/releases?per_page=30`)).filter(r => !r.draft && !r.prerelease).slice(0, count);
    out[id] = [];
    for (const r of rels) {
      const old = prev && (prev[id] || []).find(x => x.tag === r.tag_name && x.parser === PARSER);
      if (old) { out[id].push(old); continue; }
      progress(`Schema ${s.label} ${r.tag_name} wird gelesen …`);
      const src = await getText(rawUrl(s.repo, r.tag_name, s.file));
      out[id].push({ tag: r.tag_name, basis: 'Release', parser: PARSER, url: blobUrl(s.repo, r.tag_name, s.file), keys: cppKeys(src) });
    }
  }
  out.cura = [await curaSchema(prev && prev.cura && prev.cura[0], progress)];
  return out;
}

module.exports = { check, update, versions, SLICERS };
