'use strict';
// Baut aus allen Quellen einen gemeinsamen Katalog: Hersteller → Produkte und Drucker.
const store = require('./store');
const orca = require('./sources/orca');
const prusa = require('./sources/prusa');
const cura = require('./sources/cura');

const BRAND_ALIASES = {
  bambu: 'bambulab', bbl: 'bambulab', bambulabs: 'bambulab',
  prusapolymers: 'prusament', prusa: 'prusament', prusaresearch: 'prusament',
  qiditech: 'qidi', qiditechnology: 'qidi', qidi3d: 'qidi',
  devildesign: 'devildesign', addnorth: 'addnorth', colorfabb: 'colorfabb',
  polymakerltd: 'polymaker', esun3d: 'esun', sunlu3d: 'sunlu', elegoo3d: 'elegoo',
  snapmakerinc: 'snapmaker', crealityhyper: 'creality', anycubic3d: 'anycubic',
  '3djake': '3djake', dasfilament: 'dasfilament', generic: 'generic', orcafilamentlibrary: 'generic', '': 'generic',
};
const STOP = new Set(['filament', '3d', 'mm', '175', '1.75', '1.75mm', '285', 'spool', 'refill', 'the', 'premium']);

function norm(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, ''); }
function brandKey(s) {
  const k = norm(s).replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  return BRAND_ALIASES[k] !== undefined ? BRAND_ALIASES[k] : k;
}
function tokens(s) {
  return norm(s).replace(/\+/g, ' plus ').replace(/[^a-z0-9.]+/g, ' ').split(' ').map(t => t.replace(/^\.+|\.+$/g, '')).filter(Boolean);
}
// Produktname ohne vorangestellten Herstellernamen.
function stripBrand(name, brand) {
  const bt = new Set([...tokens(brand), ...tokens(brand.replace(/\s*lab$/i, '')), brandKey(brand)]);
  for (const [alias, key] of Object.entries(BRAND_ALIASES)) if (key === brandKey(brand) && alias) bt.add(alias);
  const words = String(name).trim().split(/\s+/);
  while (words.length > 1 && tokens(words[0]).every(t => bt.has(t) || t === 'generic')) words.shift();
  return words.join(' ');
}
function productKey(brand, name) {
  const t = tokens(stripBrand(name, brand)).filter(x => !STOP.has(x));
  return brandKey(brand) + '|' + [...new Set(t)].sort().join('-');
}

function family(type, name) {
  const t = (String(type) + ' ' + String(name)).toUpperCase();
  if (/PCTG/.test(t)) return 'PCTG';
  if (/\bPA(6|11|12|66|HT)?\b|PAHT|PA6|PA12|NYLON|\bPPA\b|PA-/.test(t)) return 'PA';
  if (/\bPC\b|PC-|POLYCARB/.test(t)) return 'PC';
  if (/PETG|PET-G/.test(t)) return 'PETG';
  if (/\bPET\b|PET-CF|PET-GF|PETCF/.test(t)) return 'PET';
  if (/\bASA\b|ASA-/.test(t)) return 'ASA';
  if (/\bABS\b|ABS-/.test(t)) return 'ABS';
  if (/TPU|TPE|FLEX|PEBA|\bTPC\b/.test(t)) return 'TPU';
  if (/PVA|BVOH/.test(t)) return 'PVA';
  if (/HIPS/.test(t)) return 'HIPS';
  if (/\bPP\b|PP-/.test(t)) return 'PP';
  if (/PLA|PHA/.test(t)) return 'PLA';
  return String(type || 'PLA').toUpperCase().split(/[-\s]/)[0] || 'PLA';
}
function flags(type, name) {
  const t = (String(type) + ' ' + String(name)).toUpperCase();
  return {
    silk: /SILK|SHINY|SATIN/.test(t), matte: /MATT/.test(t), cf: /\bCF\b|-CF|CARBON/.test(t), gf: /\bGF\b|-GF|GLASS/.test(t),
    hs: /HIGH.?SPEED|\bHS\b|HYPER|RAPID|\bFAST\b|-HS/.test(t), plus: /\+|PLUS|PRO\b|TOUGH/.test(t),
    wood: /WOOD/.test(t), glow: /GLOW/.test(t), marble: /MARBLE|STONE/.test(t), metal: /METAL|BRONZE|COPPER|STEEL/.test(t),
    translucent: /TRANSLUCENT|TRANSPARENT|CLEAR/.test(t), support: /SUPPORT|BREAKAWAY/.test(t), hf: /HF|HIGH.?FLOW/.test(t),
  };
}

let current = null;

function build() {
  const raw = {
    orca: store.read('sources/orca.json'), snapmaker: store.read('sources/snapmaker.json'), prusa: store.read('sources/prusa.json'), cura: store.read('sources/cura.json'),
    ofd: store.read('sources/ofd.json'), spoolman: store.read('sources/spoolman.json'), schema: store.read('sources/schema.json'),
  };
  const models = {
    orca: raw.orca ? orca.buildModel(raw.orca, raw.snapmaker) : null,
    prusa: raw.prusa ? prusa.buildModel(raw.prusa) : null,
    cura: raw.cura ? cura.buildModel(raw.cura) : null,
    ofd: raw.ofd, spoolman: raw.spoolman, schema: raw.schema,
  };
  const brands = new Map();
  const products = new Map();

  function brandEntry(name) {
    const k = brandKey(name);
    if (!brands.has(k)) brands.set(k, { key: k, name: k === 'generic' ? 'Generisch' : name, products: new Set(), sources: new Set() });
    return brands.get(k);
  }
  function productEntry(brandName, name, type, src) {
    const b = brandEntry(brandName);
    const key = productKey(brandName, name);
    let p = products.get(key);
    if (!p) {
      const disp = stripBrand(name, brandName);
      p = { key, brandKey: b.key, brand: b.name, name: disp, type: type || '', family: family(type, disp), refs: { orca: [], prusa: [], cura: [], ofd: null, spoolman: null } };
      products.set(key, p);
    }
    if (!p.type && type) { p.type = type; p.family = family(type, p.name); }
    b.products.add(key);
    b.sources.add(src);
    return p;
  }

  // 1) Open Filament Database (Herstellerdaten) – bevorzugte Namen
  if (models.ofd) {
    const brandById = new Map(models.ofd.brands.map(b => [b.id, b]));
    for (const f of models.ofd.filaments) {
      const b = brandById.get(f.brand_id);
      if (!b || f.discontinued) continue;
      const ss = f.slicer_settings || {};
      const prof = (ss.orcaslicer && ss.orcaslicer.profile_name) || (ss.bambustudio && ss.bambustudio.profile_name) || (ss.prusaslicer && ss.prusaslicer.profile_name);
      const p = productEntry(b.name, prof ? stripBrand(prof, b.name) : f.name, f.material, 'ofd');
      if (!brands.get(p.brandKey).nameFromOfd) { brands.get(p.brandKey).name = b.name; brands.get(p.brandKey).nameFromOfd = true; }
      if (!p.refs.ofd) p.refs.ofd = f.id;
      p.ofdName = f.name;
    }
  }
  // 2) OrcaSlicer-Profile
  if (models.orca) {
    for (const f of models.orca.filaments) {
      const brand = f.brand || (f.vendorDir === 'OrcaFilamentLibrary' ? 'Generic' : orca.VENDOR_NAMES[f.vendorDir] || f.vendorDir);
      const p = productEntry(brand, f.base, f.type, 'orca');
      p.refs.orca.push(f);
    }
  }
  // 3) PrusaSlicer-Profile
  if (models.prusa) {
    for (const f of models.prusa.filaments) {
      const brand = f.brand || 'Generic';
      const p = productEntry(brand, f.base, f.type, 'prusa');
      p.refs.prusa.push(f);
    }
  }
  // 4) Cura-Materialien
  if (models.cura) {
    for (const m of models.cura.materials) {
      const label = m.label ? m.label.replace(new RegExp('\\s*' + escapeRe(m.color) + '\\s*$', 'i'), '') : m.material;
      const p = productEntry(m.brand || 'Generic', label || m.material, m.material, 'cura');
      p.refs.cura.push(m);
    }
  }
  // 5) SpoolmanDB – nur Zusatzdaten je Hersteller+Material (keine neuen Produkte)
  const spoolIdx = new Map();
  if (models.spoolman) for (const g of models.spoolman.groups) {
    const k = brandKey(g.manufacturer) + '|' + family(g.material, '');
    if (!spoolIdx.has(k)) spoolIdx.set(k, []);
    spoolIdx.get(k).push(g);
  }
  for (const p of products.values()) {
    const gs = spoolIdx.get(p.brandKey + '|' + p.family) || [];
    p.refs.spoolman = gs.find(g => String(g.material).toUpperCase() === String(p.type).toUpperCase()) || gs.sort((a, b) => b.count - a.count)[0] || null;
    p.flags = flags(p.type, p.name);
  }

  // Drucker
  const printers = new Map();
  function printerEntry(vendor, model) {
    const mk = brandKey(vendor) + '|' + tokens(model).filter(t => t !== 'original').join('');
    if (!printers.has(mk)) printers.set(mk, { key: mk, vendor, model, nozzles: {} });
    return printers.get(mk);
  }
  if (models.orca) for (const p of models.orca.printers) {
    const e = printerEntry(p.vendor, p.model);
    const n = e.nozzles[p.nozzle] || (e.nozzles[p.nozzle] = {});
    if (!n.orca) n.orca = p;
  }
  if (models.prusa) for (const p of models.prusa.printers) {
    const e = printerEntry(p.vendor === 'Prusa Research' ? 'Prusa' : p.vendor, p.model.replace(/^Original\s+/, ''));
    const n = e.nozzles[p.nozzle] || (e.nozzles[p.nozzle] = {});
    if (!n.prusa) n.prusa = p;
  }

  current = { models, brands, products, printers, builtAt: new Date().toISOString() };
  return current;
}

function escapeRe(s) { return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function get() { return current || build(); }

function summary() {
  const c = get();
  const brands = [...c.brands.values()].map(b => ({ key: b.key, name: b.name, count: b.products.size, sources: [...b.sources] }))
    .filter(b => b.count).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const printers = [...c.printers.values()].map(p => ({
    key: p.key, vendor: p.vendor, model: p.model,
    nozzles: Object.keys(p.nozzles).sort((a, b) => a - b),
    sources: [...new Set(Object.values(p.nozzles).flatMap(n => Object.keys(n)))],
  })).sort((a, b) => (a.vendor + a.model).localeCompare(b.vendor + b.model, 'de'));
  return { brands, printers, counts: { brands: brands.length, products: c.products.size, printers: printers.length } };
}

function productsOf(brandKeyStr) {
  const c = get();
  const b = c.brands.get(brandKeyStr);
  if (!b) return [];
  return [...b.products].map(k => c.products.get(k)).map(p => ({
    key: p.key, name: p.name, type: p.type, family: p.family, flags: p.flags,
    sources: { ofd: !!p.refs.ofd, orca: p.refs.orca.length, prusa: p.refs.prusa.length, cura: p.refs.cura.length, spoolman: !!p.refs.spoolman },
  })).sort((a, b) => a.family.localeCompare(b.family) || a.name.localeCompare(b.name, 'de'));
}

module.exports = { build, get, summary, productsOf, brandKey, productKey, family, flags, tokens, stripBrand };
