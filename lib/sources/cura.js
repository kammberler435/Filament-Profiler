'use strict';
// Quelle: Ultimaker fdm_materials (offizielle Cura-Materialprofile, viele Hersteller).
const { gh, getText, pool, rawUrl, blobUrl } = require('../net');

const REPO = 'Ultimaker/fdm_materials';

async function head() {
  const info = await gh(`/repos/${REPO}`);
  const c = await gh(`/repos/${REPO}/commits?per_page=1`);
  return { branch: info.default_branch, sha: c[0] && c[0].sha };
}

async function check(prev) {
  const c = await gh(`/repos/${REPO}/commits?per_page=1`);
  const ref = c[0] && c[0].sha;
  return { ref, changed: !prev || prev.ref !== ref };
}

async function update(prev, progress) {
  const h = await head();
  const tree = await gh(`/repos/${REPO}/git/trees/${h.sha}?recursive=1`);
  const old = (prev && prev.files) || {};
  const files = {};
  const todo = [];
  for (const t of tree.tree) {
    if (t.type !== 'blob' || !t.path.endsWith('.fdm_material')) continue;
    if (old[t.path] && old[t.path].sha === t.sha) files[t.path] = old[t.path];
    else todo.push(t);
  }
  progress(`Cura: ${todo.length} Materialdateien neu/geändert`);
  await pool(todo, 16, async t => {
    try {
      files[t.path] = { sha: t.sha, xml: await getText(rawUrl(REPO, h.sha, t.path)) };
    } catch { if (old[t.path]) files[t.path] = old[t.path]; }
  }, (d, n) => { if (d % 40 === 0 || d === n) progress(`Cura: ${d}/${n}`, d / n); });
  return { ref: h.sha, fetchedAt: new Date().toISOString(), files };
}

// Minimal-XML-Auswertung des fdmmaterial-Formats.
function parseMaterial(xml) {
  const strip = s => s.replace(/<!--[\s\S]*?-->/g, '');
  xml = strip(xml);
  const tag = (src, name) => { const m = src.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? m[1].trim() : ''; };
  const meta = tag(xml, 'metadata');
  const nm = tag(meta, 'name');
  const props = tag(xml, 'properties');
  const settingsBlock = tag(xml, 'settings');
  const globalPart = settingsBlock.replace(/<machine>[\s\S]*?<\/machine>/g, '');
  const settings = {};
  for (const m of globalPart.matchAll(/<setting key="([^"]+)">([^<]*)<\/setting>/g)) settings[m[1]] = m[2].trim();
  const machines = [];
  for (const mm of settingsBlock.matchAll(/<machine>([\s\S]*?)<\/machine>/g)) {
    const ids = [...mm[1].matchAll(/<machine_identifier manufacturer="([^"]*)" product="([^"]*)"/g)].map(x => ({ manufacturer: x[1], product: x[2] }));
    const s = {};
    for (const m of mm[1].replace(/<hotend[\s\S]*?(\/>|<\/hotend>)/g, '').matchAll(/<setting key="([^"]+)">([^<]*)<\/setting>/g)) s[m[1]] = m[2].trim();
    machines.push({ ids, settings: s });
  }
  return {
    brand: tag(nm, 'brand'), material: tag(nm, 'material'), color: tag(nm, 'color'), label: tag(nm, 'label'),
    guid: tag(meta, 'GUID'), colorCode: tag(meta, 'color_code'), description: tag(meta, 'description'),
    density: parseFloat(tag(props, 'density')) || null, diameter: parseFloat(tag(props, 'diameter')) || null,
    settings, machines,
  };
}

function buildModel(raw) {
  const materials = [];
  for (const [p, f] of Object.entries(raw.files || {})) {
    try {
      const m = parseMaterial(f.xml);
      m.path = p;
      m.url = blobUrl(REPO, raw.ref, p);
      materials.push(m);
    } catch { /* ungültige Datei überspringen */ }
  }
  return { fetchedAt: raw.fetchedAt, materials };
}

module.exports = { check, update, buildModel, parseMaterial, REPO };
