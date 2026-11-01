'use strict';
// Erzeugt aus allen Quellen ein kanonisches Filamentprofil. Jeder Wert trägt seine
// Herkunft (Quelle, Datei/URL, Abrufzeit) und die verworfenen Alternativen.
const path = require('path');
const catalog = require('./catalog');
const defaults = require('./defaults');
const orcaSrc = require('./sources/orca');
const prusaSrc = require('./sources/prusa');
const ofdSrc = require('./sources/ofd');

const PLATES = [
  ['cool', 'Cool Plate (glatt)', 'cool_plate_temp'],
  ['eng', 'Engineering Plate', 'eng_plate_temp'],
  ['hot', 'Glattes PEI / High Temp Plate', 'hot_plate_temp'],
  ['textured', 'Texturiertes PEI', 'textured_plate_temp'],
  ['supertack', 'Cool Plate SuperTack', 'supertack_plate_temp'],
  ['textured_cool', 'Texturierte Cool Plate', 'textured_cool_plate_temp'],
];

// Feldliste: id, Gruppe, Beschriftung, Einheit, Rangfolge, Orca-Schlüssel, Prusa-Schlüssel
const F = [];
function field(id, group, label, unit, order, orca, prusa, extra = {}) { F.push({ id, group, label, unit, order, orca, prusa, ...extra }); }
field('nozzle_temp', 'Temperaturen', 'Düse (weitere Schichten)', '°C', 'TEMP', 'nozzle_temperature', 'temperature');
field('nozzle_temp_first', 'Temperaturen', 'Düse (erste Schicht)', '°C', 'TEMP', 'nozzle_temperature_initial_layer', 'first_layer_temperature');
field('nozzle_range_low', 'Temperaturen', 'Empfohlener Bereich min.', '°C', 'MAT', 'nozzle_temperature_range_low', null);
field('nozzle_range_high', 'Temperaturen', 'Empfohlener Bereich max.', '°C', 'MAT', 'nozzle_temperature_range_high', null);
for (const [p, label, key] of PLATES) {
  field('bed_' + p, 'Druckbett', label + ' – weitere Schichten', '°C', 'TEMP', key, null, { plate: p });
  field('bed_' + p + '_first', 'Druckbett', label + ' – erste Schicht', '°C', 'TEMP', key + '_initial_layer', null, { plate: p });
}
field('chamber_temp', 'Temperaturen', 'Bauraum / Kammer', '°C', 'CHAMBER', 'chamber_temperature', 'chamber_temperature');
field('vitrification', 'Temperaturen', 'Erweichungstemperatur (Tg)', '°C', 'MAT', 'temperature_vitrification', null);
field('flow_ratio', 'Fluss', 'Flussrate / Extrusionsmultiplikator', '', 'FLOW', 'filament_flow_ratio', 'extrusion_multiplier');
field('pa', 'Fluss', 'Pressure/Linear Advance (K)', '', 'PRN', 'pressure_advance', null);
field('pa_enable', 'Fluss', 'Pressure Advance aktivieren', 'bool', 'PRN', 'enable_pressure_advance', null);
field('mvs', 'Fluss', 'Max. volumetrische Geschwindigkeit', 'mm³/s', 'PRN', 'filament_max_volumetric_speed', 'filament_max_volumetric_speed');
field('fan_min', 'Kühlung', 'Bauteillüfter min.', '%', 'FAN', 'fan_min_speed', 'min_fan_speed');
field('fan_max', 'Kühlung', 'Bauteillüfter max.', '%', 'FAN', 'fan_max_speed', 'max_fan_speed');
field('overhang_fan', 'Kühlung', 'Lüfter bei Überhängen/Brücken', '%', 'FAN', 'overhang_fan_speed', 'bridge_fan_speed');
field('overhang_threshold', 'Kühlung', 'Überhang-Schwelle für Lüfter', '%', 'FAN', 'overhang_fan_threshold', null);
field('fan_cooling_layer_time', 'Kühlung', 'Lüfter auf Max. unter Schichtzeit', 's', 'FAN', 'fan_cooling_layer_time', 'fan_below_layer_time');
field('slow_down_layer_time', 'Kühlung', 'Verlangsamen unter Schichtzeit', 's', 'FAN', 'slow_down_layer_time', 'slowdown_below_layer_time');
field('slow_down_min_speed', 'Kühlung', 'Min. Druckgeschwindigkeit', 'mm/s', 'FAN', 'slow_down_min_speed', 'min_print_speed');
field('close_fan_first', 'Kühlung', 'Lüfter aus für die ersten Schichten', 'Schichten', 'FAN', 'close_fan_the_first_x_layers', 'disable_fan_first_layers');
field('full_fan_layer', 'Kühlung', 'Volle Lüfterleistung ab Schicht', '', 'FAN', 'full_fan_speed_layer', 'full_fan_speed_layer');
field('aux_fan', 'Kühlung', 'Zusatzlüfter (Aux)', '%', 'FAN', 'additional_cooling_fan_speed', null);
field('retract_length', 'Retraktion', 'Retraktionslänge', 'mm', 'RETR', 'filament_retraction_length', 'filament_retract_length');
field('retract_speed', 'Retraktion', 'Retraktionsgeschwindigkeit', 'mm/s', 'RETR', 'filament_retraction_speed', 'filament_retract_speed');
field('deretract_speed', 'Retraktion', 'Deretraktionsgeschwindigkeit', 'mm/s', 'RETR', 'filament_deretraction_speed', 'filament_deretract_speed');
field('z_hop', 'Retraktion', 'Z-Hop', 'mm', 'RETR', 'filament_z_hop', 'filament_retract_lift');
field('type', 'Material', 'Filamenttyp', 'text', 'MAT', 'filament_type', 'filament_type');
field('vendor', 'Material', 'Hersteller', 'text', 'MAT', 'filament_vendor', 'filament_vendor');
field('density', 'Material', 'Dichte', 'g/cm³', 'MAT', 'filament_density', 'filament_density');
field('diameter', 'Material', 'Durchmesser', 'mm', 'MAT', 'filament_diameter', 'filament_diameter');
field('shrink_xy', 'Material', 'Schrumpfung XY', '%', 'MAT', 'filament_shrink', 'filament_shrinkage_compensation_xy');
field('shrink_z', 'Material', 'Schrumpfung Z', '%', 'MAT', 'filament_shrinkage_compensation_z', 'filament_shrinkage_compensation_z');
field('cost', 'Material', 'Preis pro kg', '€', 'MAT', 'filament_cost', 'filament_cost');
field('spool_weight', 'Material', 'Filamentgewicht je Spule (netto)', 'g', 'MAT', null, null);
field('empty_spool', 'Material', 'Leerspulengewicht', 'g', 'MAT', null, 'filament_spool_weight');
field('soluble', 'Material', 'Löslich', 'bool', 'MAT', 'filament_soluble', 'filament_soluble');
field('is_support', 'Material', 'Stützmaterial', 'bool', 'MAT', 'filament_is_support', null);
field('abrasive', 'Material', 'Abrasiv (gehärtete Düse nötig)', 'bool', 'MAT', 'required_nozzle_HRC', 'filament_abrasive');
field('dry_temp', 'Trocknung', 'Trocknungstemperatur', '°C', 'MAT', null, null);
field('dry_time', 'Trocknung', 'Trocknungsdauer', 'h', 'MAT', null, null);

const ORDERS = {
  MAT: ['manual', 'catalog', 'ofd', 'exact', 'brand', 'spoolman', 'pgeneric', 'pvendorbase', 'slicerbase', 'default'],
  TEMP: ['manual', 'exact', 'brand', 'ofd', 'spoolman', 'pgeneric', 'pvendorbase', 'slicerbase', 'default'],
  CHAMBER: ['manual', 'exact', 'ofd', 'brand', 'pgeneric', 'pvendorbase', 'slicerbase', 'default'],
  FLOW: ['manual', 'exact', 'brand', 'pgeneric', 'pvendorbase', 'slicerbase', 'default'],
  PRN: ['manual', 'exact', 'pgeneric', 'pvendorbase', 'brand', 'ofd', 'slicerbase', 'default'],
  FAN: ['manual', 'exact', 'brand', 'pgeneric', 'pvendorbase', 'ofd', 'slicerbase', 'default'],
  RETR: ['manual', 'exact', 'pgeneric', 'printer', 'pvendorbase', 'default'],
};
const TIER_LABEL = {
  manual: 'Manuell geändert', catalog: 'Ausgewählter Hersteller', exact: 'Slicer-Profil für genau diesen Drucker', ofd: 'Herstellerangabe (Datenblatt)',
  brand: 'Herstellerprofil (anderer/kein bestimmter Drucker)', spoolman: 'Community-Datenbank',
  pgeneric: 'Drucker-Standardprofil dieses Materials', pvendorbase: 'Grundprofil des Druckerherstellers',
  slicerbase: 'Slicer-Grundwert der Materialklasse', printer: 'Druckerprofil (Maschine)', default: 'Standardwert (Materialklasse)',
};

const num = v => { const n = parseFloat(String(v).replace('%', '')); return Number.isFinite(n) ? n : null; };
const pick = (v, idx) => Array.isArray(v) ? (v[idx] !== undefined ? v[idx] : v[0]) : v;

// ---- Werte aus OrcaSlicer-Profil lesen ----
function fromOrca(id, raw) {
  if (raw === undefined || raw === null || raw === 'nil' || raw === '') return undefined;
  switch (id) {
    case 'pa_enable': case 'soluble': case 'is_support': return raw === '1' || raw === 'true' || raw === 1;
    case 'abrasive': return (num(raw) || 0) > 3;
    case 'shrink_xy': case 'shrink_z': { const n = num(raw); return n === null ? undefined : Math.round((100 - n) * 100) / 100; }
    case 'type': case 'vendor': return String(raw);
    case 'overhang_threshold': return num(raw);
    default: return num(raw);
  }
}
function fromPrusa(id, raw) {
  if (raw === undefined || raw === null || raw === 'nil' || raw === '') return undefined;
  raw = String(raw).replace(/^"|"$/g, '');
  switch (id) {
    case 'soluble': case 'abrasive': return raw === '1';
    case 'type': case 'vendor': return raw;
    case 'shrink_xy': case 'shrink_z': return num(raw);
    case 'mvs': { const n = num(raw); return n ? n : undefined; }
    case 'chamber_temp': { const n = num(raw); return n ? n : undefined; }
    default: return num(String(raw).split(',')[0]);
  }
}

// Einfache Auswertung von {if}{elsif}{else}{endif}-Blöcken in Prusa-G-Code.
function prusaTemplate(code, vars) {
  let out = code, guard = 0;
  const re = /\{if\s+([^}]*)\}((?:(?!\{if)[\s\S])*?)\{endif\}/;
  while (re.test(out) && guard++ < 50) {
    out = out.replace(re, (_, cond, body) => {
      const parts = body.split(/\{(elsif\s+[^}]*|else)\}/);
      const branches = [{ cond, text: parts[0] }];
      for (let i = 1; i < parts.length; i += 2) {
        const h = parts[i];
        branches.push({ cond: h === 'else' ? 'true' : h.replace(/^elsif\s+/, ''), text: parts[i + 1] || '' });
      }
      for (const b of branches) if (b.cond === 'true' || prusaSrc.evalCondition(b.cond, vars)) return b.text;
      return '';
    });
  }
  return out;
}
function paFromGcode(code) {
  const m = String(code).match(/(?:M572\s+S|M900\s+K|SET_PRESSURE_ADVANCE\s+ADVANCE=)\s*([\d.]+)/i);
  return m ? parseFloat(m[1]) : undefined;
}

function generate(opts) {
  const c = catalog.get();
  const { productKey, printerKey, nozzle, variant, overrides = {} } = opts;
  const product = c.products.get(productKey);
  const printer = c.printers.get(printerKey);
  if (!product) throw new Error('Produkt nicht gefunden');
  if (!printer) throw new Error('Drucker nicht gefunden');
  const pn = printer.nozzles[nozzle] || printer.nozzles[Object.keys(printer.nozzles)[0]];
  const nozzleStr = nozzle || Object.keys(printer.nozzles)[0];
  const cands = {}; // id → [{value, tier, src, note}]
  const add = (id, value, tier, src, note) => {
    if (value === undefined || value === null || (typeof value === 'number' && !Number.isFinite(value))) return;
    (cands[id] = cands[id] || []).push({ value, tier, src, note });
  };
  const used = { sources: [] };
  const om = c.models.orca, pm = c.models.prusa;

  // ---------------- OrcaSlicer ----------------
  let orcaExact = null, orcaBrand = null, orcaGeneric = null, orcaMachine = null, variantIdx = 0, variants = [];
  const orcaPrinter = pn.orca;
  if (om) {
    if (orcaPrinter) {
      orcaMachine = om.resolve(orcaPrinter.vendorDir, 'machine', orcaPrinter.preset);
      variants = orcaPrinter.variants || [];
    }
    const refs = product.refs.orca;
    if (orcaPrinter) {
      const ex = refs.filter(f => f.compatible.includes(orcaPrinter.preset));
      ex.sort((a, b) => ((b.vendorDir === orcaPrinter.vendorDir) - (a.vendorDir === orcaPrinter.vendorDir)) || (a.compatible.length - b.compatible.length));
      if (ex[0]) orcaExact = om.resolve(ex[0].vendorDir, 'filament', ex[0].name);
    }
    if (refs.length) {
      const lib = refs.filter(f => !f.compatible.length);
      const sameVendor = orcaPrinter ? refs.filter(f => f.vendorDir === orcaPrinter.vendorDir) : [];
      const pickRef = lib[0] || sameVendor[0] || refs[0];
      if (!orcaExact || pickRef.name !== orcaExact.name) orcaBrand = om.resolve(pickRef.vendorDir, 'filament', pickRef.name);
    }
    if (orcaPrinter) {
      const g = bestGeneric(om.filaments.filter(f => f.compatible.includes(orcaPrinter.preset)), product, printer.vendor);
      if (g && (!orcaExact || g.name !== orcaExact.name)) orcaGeneric = om.resolve(g.vendorDir, 'filament', g.name);
    }
    // Variantenindex (z. B. Bambu „Direct Drive Standard“ / „High Flow“)
    const varSrc = orcaExact || orcaGeneric || orcaBrand;
    const fv = varSrc && varSrc.values.filament_extruder_variant && varSrc.values.filament_extruder_variant.v;
    const chosen = variant || variants[0];
    if (Array.isArray(fv) && chosen) { const i = fv.indexOf(chosen); variantIdx = i >= 0 ? i : 0; }
  }
  const orcaLayer = (res, tier, idx) => {
    if (!res) return;
    used.sources.push({ kind: 'orca', tier, name: res.name, url: om.srcOf(res.rel).url });
    for (const f of F) {
      if (!f.orca) continue;
      let key = f.orca;
      let e = res.values[key];
      if (!e && f.id === 'chamber_temp') e = res.values.chamber_temperatures;
      if (!e) continue;
      const v = fromOrca(f.id, pick(e.v, idx));
      if (v === undefined) continue;
      const rel = (e.rels && e.rels[idx]) || e.rel;
      const fname = path.basename(rel || '');
      let t = tier;
      // Grundprofile (fdm_*) des Druckerherstellers gehören zum offiziellen Profil; fremde Grundprofile sind nur Klassenwerte.
      if (fname.startsWith('fdm_') && !(orcaPrinter && rel.startsWith(orcaPrinter.vendorDir + '/'))) t = 'slicerbase';
      add(f.id, v, t, om.srcOf(rel));
    }
  };
  orcaLayer(orcaExact, 'exact', variantIdx);
  if (orcaExact && !orcaExact.values.enable_pressure_advance) {
    // Im offiziellen Profil nicht gesetzt → Slicer-Standard „aus“ (z. B. Bambu: PA-Kalibrierung am Drucker).
    add('pa_enable', false, 'exact', { ...om.srcOf(orcaExact.rel), label: om.srcOf(orcaExact.rel).label + ' (nicht gesetzt → Slicer-Standard)' }, 'Druckerseitige Kalibrierung');
  }
  orcaLayer(orcaGeneric, 'pgeneric', variantIdx);
  if (!orcaExact && orcaGeneric && !orcaGeneric.values.enable_pressure_advance) {
    add('pa_enable', false, 'pgeneric', { ...om.srcOf(orcaGeneric.rel), label: om.srcOf(orcaGeneric.rel).label + ' (nicht gesetzt → Slicer-Standard)' });
  }
  orcaLayer(orcaBrand, 'brand', variantIdx);
  let extruderType = '', flavor = '';
  if (orcaMachine) {
    const mv = k => orcaMachine.values[k] && pick(orcaMachine.values[k].v, 0);
    extruderType = String(mv('extruder_type') || '');
    flavor = String(mv('gcode_flavor') || '');
    const ms = om.srcOf(orcaMachine.rel);
    const src = { ...ms, label: ms.label + ' (Druckerprofil)' };
    add('retract_length', num(mv('retraction_length')), 'printer', src);
    add('retract_speed', num(mv('retraction_speed')), 'printer', src);
    const ds = num(mv('deretraction_speed'));
    add('deretract_speed', ds || num(mv('retraction_speed')), 'printer', src, ds ? undefined : '0 = wie Retraktion');
    add('z_hop', num(mv('z_hop')), 'printer', src);
  }

  // ---------------- PrusaSlicer ----------------
  let prusaExact = null, prusaBrand = null, prusaGeneric = null, prusaPrinterRes = null, prusaVars = {};
  if (pm) {
    if (pn.prusa) {
      prusaPrinterRes = pm.resolve(pn.prusa.vendorDir, 'printer', pn.prusa.preset);
      if (prusaPrinterRes) for (const [k, v] of Object.entries(prusaPrinterRes.values)) prusaVars[k] = v.v.replace(/^"|"$/g, '');
      prusaVars.num_extruders = (prusaVars.nozzle_diameter || '').split(',').length;
    }
    const compatible = f => pn.prusa && (f.compatible.includes(pn.prusa.preset) || (f.condition && prusaSrc.evalCondition(f.condition, prusaVars)));
    const refs = product.refs.prusa;
    const ex = pn.prusa ? refs.filter(f => f.vendorDir === pn.prusa.vendorDir && compatible(f) && (f.condition || f.compatible.length)) : [];
    if (ex[0]) prusaExact = pm.resolve(ex[0].vendorDir, 'filament', ex[0].name);
    if (refs.length) {
      const r = refs.find(f => !/@/.test(f.name)) || refs[0];
      if (!prusaExact || r.name !== prusaExact.name) prusaBrand = pm.resolve(r.vendorDir, 'filament', r.name);
    }
    if (pn.prusa) {
      const g = bestGeneric(pm.filaments.filter(f => f.vendorDir === pn.prusa.vendorDir && compatible(f)), product, printer.vendor);
      if (g && (!prusaExact || g.name !== prusaExact.name)) prusaGeneric = pm.resolve(g.vendorDir, 'filament', g.name);
    }
  }
  const prusaLayer = (res, tier) => {
    if (!res) return;
    const b = pm.bundles[res.vendor];
    // Abstrakte Abschnitte (*…*) aus dem Bündel des Druckerherstellers gehören zum offiziellen Profil.
    const ownBundle = pn.prusa && res.vendor === pn.prusa.vendorDir && tier !== 'brand';
    used.sources.push({ kind: 'prusa', tier, name: res.name, url: b.url });
    for (const f of F) {
      const keys = f.prusa ? [f.prusa] : (f.plate === 'hot' || f.plate === 'textured') ? [f.id.endsWith('_first') ? 'first_layer_bed_temperature' : 'bed_temperature'] : [];
      for (const key of keys) {
        const e = res.values[key];
        if (!e) continue;
        const v = fromPrusa(f.id, e.v);
        if (v === undefined) continue;
        const t = e.sec.startsWith('*') && !ownBundle ? 'slicerbase' : tier;
        add(f.id, v, t, { label: `PrusaSlicer ${b.vendor} ${b.version} · [filament:${e.sec}]`, url: b.url, fetchedAt: pm.fetchedAt });
      }
    }
    // PA-Werte aus Prusa-G-Code gelten nur für den Prusa-Drucker selbst (Firmware/Einheit).
    const g = tier !== 'brand' && res.values.start_filament_gcode;
    if (g) {
      const pa = paFromGcode(prusaTemplate(g.v.replace(/\\n/g, '\n'), prusaVars));
      if (pa !== undefined) add('pa', pa, g.sec.startsWith('*') && !ownBundle ? 'slicerbase' : tier, { label: `PrusaSlicer ${b.vendor} ${b.version} · start_filament_gcode [filament:${g.sec}]`, url: b.url, fetchedAt: pm.fetchedAt });
    }
  };
  prusaLayer(prusaExact, 'exact');
  prusaLayer(prusaGeneric, 'pgeneric');
  prusaLayer(prusaBrand, 'brand');
  if (prusaPrinterRes) {
    const b = pm.bundles[pn.prusa.vendorDir];
    const src = { label: `PrusaSlicer ${b.vendor} ${b.version} · [printer:${pn.prusa.preset}]`, url: b.url, fetchedAt: pm.fetchedAt };
    const pv = k => prusaPrinterRes.values[k] && num(prusaPrinterRes.values[k].v.split(',')[0]);
    add('retract_length', pv('retract_length'), 'printer', src);
    add('retract_speed', pv('retract_speed'), 'printer', src);
    add('deretract_speed', pv('deretract_speed') || pv('retract_speed'), 'printer', src);
    add('z_hop', pv('retract_lift'), 'printer', src);
    if (!flavor) flavor = prusaVars.gcode_flavor || '';
  }

  // ---------------- Cura ----------------
  const curaMats = product.refs.cura;
  if (curaMats.length) {
    const m = curaMats.find(x => Math.abs((x.diameter || 1.75) - 1.75) < 0.2) || curaMats[0];
    used.sources.push({ kind: 'cura', tier: 'brand', name: `${m.brand} ${m.label || m.material}`, url: m.url });
    const src = { label: `Cura fdm_materials · ${m.path}`, url: m.url, fetchedAt: c.models.cura.fetchedAt };
    const s = m.settings;
    add('nozzle_temp', num(s['print temperature']), 'brand', src);
    add('bed_hot', num(s['heated bed temperature']), 'brand', src);
    add('bed_textured', num(s['heated bed temperature']), 'brand', src);
    const bvt = num(s['build volume temperature']);
    if (bvt && bvt >= 40) add('chamber_temp', bvt, 'brand', src);
    if (s['print cooling'] !== undefined) add('fan_max', num(s['print cooling']), 'brand', src);
    if (m.density) add('density', m.density, 'brand', src);
    if (m.diameter && m.diameter < 2) add('diameter', m.diameter, 'brand', src);
  }

  // ---------------- Open Filament Database (Hersteller-TDS) ----------------
  let ofd = null, ofdBrand = null;
  if (product.refs.ofd && c.models.ofd) {
    ofd = c.models.ofd.filaments.find(f => f.id === product.refs.ofd);
    ofdBrand = ofd && c.models.ofd.brands.find(b => b.id === ofd.brand_id);
  }
  if (ofd) {
    const mat = c.models.ofd.materials.find(m => m.id === ofd.material_id);
    const repoUrl = ofdSrc.siteUrl(ofdBrand.slug, mat ? mat.material : ofd.material, ofd.slug);
    const src = { label: `Open Filament Database ${c.models.ofd.ref} · ${ofdBrand.name} ${ofd.name}` + (ofd.data_sheet_url ? ' (aus Datenblatt)' : ''), url: ofd.data_sheet_url || repoUrl, dataUrl: repoUrl, fetchedAt: c.models.ofd.fetchedAt };
    used.sources.push({ kind: 'ofd', tier: 'ofd', name: `${ofdBrand.name} ${ofd.name}`, url: src.url, tds: ofd.data_sheet_url, sds: ofd.safety_sheet_url });
    add('density', ofd.density, 'ofd', src);
    add('nozzle_range_low', ofd.min_print_temperature, 'ofd', src);
    add('nozzle_range_high', ofd.max_print_temperature, 'ofd', src);
    if (ofd.min_print_temperature && ofd.max_print_temperature) {
      const t = round5((ofd.min_print_temperature + ofd.max_print_temperature) / 2);
      add('nozzle_temp', t, 'ofd', src, `Mitte des Herstellerbereichs ${ofd.min_print_temperature}–${ofd.max_print_temperature} °C`);
      add('nozzle_temp_first', Math.min(t + 5, ofd.max_print_temperature), 'ofd', src, 'Bereichsmitte + 5 °C');
    }
    if (ofd.max_bed_temperature) {
      const lo = ofd.min_bed_temperature || 0, hi = ofd.max_bed_temperature;
      const bt = lo ? round5((lo + hi) / 2) : hi;
      for (const p of ['hot', 'textured', 'eng']) {
        add('bed_' + p, bt, 'ofd', src, `Aus Herstellerbereich ${lo}–${hi} °C`);
        add('bed_' + p + '_first', bt, 'ofd', src, `Aus Herstellerbereich ${lo}–${hi} °C`);
      }
    }
    const ch = ofd.chamber_temperature || (ofd.min_chamber_temperature && ofd.max_chamber_temperature ? round5((ofd.min_chamber_temperature + ofd.max_chamber_temperature) / 2) : ofd.min_chamber_temperature);
    if (ch && ch >= 35) add('chamber_temp', ch, 'ofd', src);
    add('dry_temp', ofd.dry_temperature || undefined, 'ofd', src);
    if (!ofd.dry_temperature && ofd.max_dry_temperature) add('dry_temp', ofd.max_dry_temperature, 'ofd', src, 'Maximal zulässige Trocknungstemperatur laut Hersteller');
    add('dry_time', ofd.dry_time, 'ofd', src);
    add('mvs', ofd.max_volumetric_speed, 'ofd', src);
    add('fan_min', ofd.min_fan_speed, 'ofd', src);
    add('fan_max', ofd.max_fan_speed, 'ofd', src);
    const sizes = (ofd.sizes || []).filter(s => Math.abs((s.d || 1.75) - 1.75) < 0.1);
    const sz = sizes.find(s => s.w === 1000) || sizes[0];
    if (sizes.length) add('diameter', 1.75, 'ofd', src);
    if (sz) { add('spool_weight', sz.w, 'ofd', src); add('empty_spool', sz.spool, 'ofd', src); }
  }

  // ---------------- SpoolmanDB ----------------
  const sp = product.refs.spoolman;
  if (sp) {
    const src = { label: `SpoolmanDB · ${sp.manufacturer} ${sp.material} (${sp.count} Einträge, häufigster Wert)`, url: c.models.spoolman.url, fetchedAt: c.models.spoolman.fetchedAt };
    used.sources.push({ kind: 'spoolman', tier: 'spoolman', name: `${sp.manufacturer} ${sp.material}`, url: src.url });
    add('density', sp.density, 'spoolman', src);
    add('spool_weight', sp.weight, 'spoolman', src);
    add('empty_spool', sp.spool_weight, 'spoolman', src);
    add('nozzle_temp', sp.extruder_temp, 'spoolman', src);
    if (sp.bed_temp) for (const p of ['hot', 'textured']) { add('bed_' + p, sp.bed_temp, 'spoolman', src); add('bed_' + p + '_first', sp.bed_temp, 'spoolman', src); }
  }

  if (product.brandKey !== 'generic') add('vendor', product.brand, 'catalog', { label: 'Ausgewählter Hersteller', url: null });

  // ---------------- Standardwerte ----------------
  const d = defaults.forProduct(product.family, product.flags || {});
  const dsrc = { label: `Standardwert für ${d.family}` + (product.flags && Object.entries(product.flags).filter(([, v]) => v).length ? ' (' + Object.entries(product.flags).filter(([, v]) => v).map(([k]) => k).join(', ') + ')' : ''), url: null };
  const isBowden = /bowden/i.test(extruderType);
  for (const f of F) {
    let v;
    if (f.plate) v = d.bed[f.plate];
    else if (f.id === 'type') v = product.type || d.family;
    else if (f.id === 'vendor') v = product.brandKey === 'generic' ? 'Generic' : product.brand;
    else if (f.id === 'diameter') v = 1.75;
    else if (f.id === 'pa_enable') v = false;
    else if (f.id === 'spool_weight') v = 1000;
    else if (f.id === 'pa') v = isBowden ? Math.min(0.8, Math.max(0.2, d.pa * 12)) : d.pa;
    else if (f.id === 'retract_length') v = d.retract_length !== undefined ? d.retract_length : (isBowden ? 4 : 0.8);
    else if (f.id === 'retract_speed') v = d.retract_speed || 40;
    else if (f.id === 'deretract_speed') v = d.retract_speed || 40;
    else if (f.id === 'z_hop') v = 0.4;
    else v = d[f.id];
    if (v === undefined) continue;
    add(f.id, v, 'default', dsrc, f.id === 'pa' && isBowden ? 'Bowden-Schätzwert – unbedingt kalibrieren' : f.id === 'pa_enable' ? 'Erst nach PA-Kalibrierung aktivieren' : undefined);
  }

  // Düsenskalierung der max. Fließrate für nicht druckerspezifische Werte
  const scale = defaults.nozzleScale(nozzleStr);
  if (cands.mvs && Math.abs(scale - 1) > 0.01) {
    for (const cnd of cands.mvs) {
      if (['brand', 'ofd', 'default', 'slicerbase'].includes(cnd.tier)) {
        cnd.value = Math.round(cnd.value * scale * 10) / 10;
        cnd.note = (cnd.note ? cnd.note + '; ' : '') + `für ${nozzleStr}-mm-Düse skaliert (×${scale})`;
      }
    }
  }

  // Manuelle Überschreibungen
  for (const [id, v] of Object.entries(overrides)) {
    if (v === '' || v === null || v === undefined) continue;
    const f = F.find(x => x.id === id);
    if (!f) continue;
    const val = f.unit === 'bool' ? (v === true || v === 'true' || v === '1') : f.unit === 'text' ? String(v) : num(v);
    add(id, val, 'manual', { label: 'Manuell in der App eingegeben', url: null });
  }

  // Auswahl je Feld nach Rangfolge
  const fields = {};
  for (const f of F) {
    const list = cands[f.id] || [];
    const order = ORDERS[f.order];
    list.sort((a, b) => rank(order, a.tier) - rank(order, b.tier));
    const usable = list.filter(x => order.includes(x.tier));
    const best = usable[0];
    if (!best) continue;
    const alts = [];
    for (const x of usable.slice(1)) if (!alts.some(a => a.value === x.value && a.tier === x.tier)) alts.push(x);
    fields[f.id] = { ...best, tierLabel: TIER_LABEL[best.tier], alternatives: alts.slice(0, 6).map(a => ({ ...a, tierLabel: TIER_LABEL[a.tier] })) };
  }
  // Zusammengehörige Werte (min/max) aus derselben Quelle nehmen, wenn sie sich sonst widersprechen.
  for (const [lo, hi] of [['fan_min', 'fan_max'], ['nozzle_range_low', 'nozzle_range_high']]) {
    const a = fields[lo], b = fields[hi];
    if (!a || !b || b.value >= a.value) continue;
    const same = (cands[hi] || []).find(x => x.src.label === a.src.label && x.value >= a.value);
    if (same) fields[hi] = { ...same, tierLabel: TIER_LABEL[same.tier], alternatives: [b, ...b.alternatives], note: 'aus derselben Quelle wie der Minimalwert gewählt' };
    else fields[hi] = { ...b, value: a.value, note: `auf Minimalwert angehoben (Quelle hatte ${b.value})` };
  }

  // Plausibilität
  const warnings = [];
  const fv = id => fields[id] && fields[id].value;
  if (fv('nozzle_range_low') && fv('nozzle_range_high') && fv('nozzle_temp') && (fv('nozzle_temp') < fv('nozzle_range_low') || fv('nozzle_temp') > fv('nozzle_range_high')))
    warnings.push(`Düsentemperatur ${fv('nozzle_temp')} °C liegt außerhalb des Herstellerbereichs ${fv('nozzle_range_low')}–${fv('nozzle_range_high')} °C.`);
  if (fv('abrasive') && orcaMachine) {
    const nt = orcaMachine.values.nozzle_type && String(pick(orcaMachine.values.nozzle_type.v, 0));
    if (nt && !/hardened|tungsten|ruby/i.test(nt)) warnings.push(`Abrasives Filament, aber im Druckerprofil ist die Düse „${nt}“ hinterlegt – gehärtete Düse verwenden.`);
  }
  if (!orcaExact && !prusaExact) warnings.push('Kein Herstellerprofil speziell für diesen Drucker gefunden – druckerabhängige Werte (Fluss, PA, Retraktion) bitte kalibrieren.');
  if (product.family === 'TPU' && isBowden) warnings.push('TPU mit Bowden-Extruder ist schwierig – nur harte TPU-Sorten (≥ 95A) und sehr langsam.');

  const defaultName = `${product.brandKey === 'generic' ? 'Generic' : product.brand} ${product.name} @${(pn.orca && pn.orca.preset) || (pn.prusa && pn.prusa.preset) || printer.model + ' ' + nozzleStr + ' nozzle'}`;
  return {
    product: { key: product.key, brand: product.brand, brandKey: product.brandKey, name: product.name, type: product.type, family: product.family, flags: product.flags },
    printer: { key: printer.key, vendor: printer.vendor, model: printer.model, nozzle: nozzleStr, orcaPreset: pn.orca && pn.orca.preset, prusaPreset: pn.prusa && pn.prusa.preset, variants, variant: variants[variantIdx] || variants[0] || null, extruderType, flavor },
    name: opts.name || defaultName,
    fields, warnings, note: d.note, sources: used.sources,
    tds: ofd && ofd.data_sheet_url, sds: ofd && ofd.safety_sheet_url,
    bases: {
      orca: (orcaExact || orcaGeneric || orcaBrand) ? { vendor: (orcaExact || orcaGeneric || orcaBrand).vendor, name: (orcaExact || orcaGeneric || orcaBrand).name, idx: variantIdx, exact: !!orcaExact } : null,
      prusa: (prusaExact || prusaGeneric || prusaBrand) ? { vendor: (prusaExact || prusaGeneric || prusaBrand).vendor, name: (prusaExact || prusaGeneric || prusaBrand).name, exact: !!prusaExact } : null,
      cura: curaMats[0] ? curaMats[0].path : null,
    },
    prusaVars,
  };
}

function rank(order, tier) { const i = order.indexOf(tier); return i < 0 ? 99 : i; }
function round5(n) { return Math.round(n / 5) * 5; }

// Bestes druckerspezifisches Standardprofil derselben Materialfamilie wählen.
function bestGeneric(list, product, printerVendor) {
  let best = null, bestScore = -Infinity;
  const pf = product.flags || {};
  const pv = catalog.brandKey(printerVendor);
  for (const f of list) {
    if (catalog.family(f.type, f.base) !== product.family) continue;
    const ff = catalog.flags(f.type, f.base);
    const bk = catalog.brandKey(f.brand || 'generic');
    let s = 0;
    if (bk === 'generic') s += 3; else if (bk === pv) s += 2; else s += 0;
    if (String(f.type).toUpperCase() === String(product.type).toUpperCase()) s += 2;
    for (const k of ['silk', 'matte', 'cf', 'gf', 'hs']) s += ff[k] === pf[k] ? 1 : -2;
    if (!!ff.support !== !!pf.support) s -= 6;
    if (!!ff.hf !== !!pf.hf) s -= 2;
    s -= f.base.length / 1000; // bei Gleichstand das schlichteste Profil
    if (/@System$/.test(f.name)) s -= 1;
    if (s > bestScore) { bestScore = s; best = f; }
  }
  return best;
}

module.exports = { generate, FIELDS: F, PLATES, TIER_LABEL, prusaTemplate };
