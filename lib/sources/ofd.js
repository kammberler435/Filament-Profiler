'use strict';
// Quelle: Open Filament Database (OpenFilamentCollective) – Herstellerangaben aus
// Datenblättern (TDS): Temperaturbereiche, Dichte, Trocknung, Spulengewichte, Datenblatt-Links.
const { gh, request } = require('../net');

const REPO = 'OpenFilamentCollective/open-filament-database';

async function latest() {
  const rel = await gh(`/repos/${REPO}/releases/latest`);
  const asset = (rel.assets || []).find(a => a.name === 'all.json.gz');
  if (!asset) throw new Error('OFD: all.json.gz nicht im Release gefunden');
  return { tag: rel.tag_name, url: asset.browser_download_url };
}

async function check(prev) {
  const l = await latest();
  return { ref: l.tag, changed: !prev || prev.ref !== l.tag };
}

async function update(prev, progress) {
  const l = await latest();
  if (prev && prev.ref === l.tag) return prev;
  progress(`Open Filament Database ${l.tag} wird geladen …`);
  const all = await request(l.url, { as: 'gunzip-json', timeout: 180000 });
  // Spulendaten je Filament verdichten (über Varianten → Größen).
  const variantToFil = new Map(all.variants.map(v => [v.id, v.filament_id]));
  const sizes = {};
  for (const s of all.sizes) {
    const fid = variantToFil.get(s.variant_id);
    if (!fid) continue;
    (sizes[fid] = sizes[fid] || []).push({ w: s.filament_weight, d: s.diameter, spool: s.empty_spool_weight });
  }
  const colors = {};
  for (const v of all.variants) (colors[v.filament_id] = colors[v.filament_id] || []).push({ name: v.name, hex: v.color_hex });
  return {
    ref: l.tag, url: l.url, fetchedAt: new Date().toISOString(), generatedAt: all.generated_at,
    brands: all.brands.map(b => ({ id: b.id, name: b.name, slug: b.slug, website: b.website, origin: b.origin })),
    materials: all.materials.map(m => ({ id: m.id, material: m.material, default_max_dry_temperature: m.default_max_dry_temperature, default_slicer_settings: m.default_slicer_settings })),
    filaments: all.filaments.map(f => ({ ...f, sizes: sizes[f.id] || [], colors: (colors[f.id] || []).slice(0, 60) })),
  };
}

function siteUrl(brandSlug, materialSlug, filSlug) {
  return `https://github.com/${REPO}/tree/main/data/${brandSlug}/${materialSlug}/${filSlug}`;
}

module.exports = { check, update, REPO, siteUrl };
