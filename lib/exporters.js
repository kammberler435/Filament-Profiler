'use strict';
// Exporter: OrcaSlicer/Bambu Studio (JSON), PrusaSlicer/SuperSlicer (INI), Cura (.fdm_material XML).
const crypto = require('crypto');
const catalog = require('./catalog');
const { FIELDS, PLATES } = require('./generator');

const META_KEYS = new Set(['name', 'inherits', 'from', 'instantiation', 'type', 'setting_id', 'include', 'version', 'filament_id',
  'filament_settings_id', 'compatible_printers', 'compatible_printers_condition', 'compatible_prints', 'compatible_prints_condition',
  'is_custom_defined', 'base_id', 'renamed_from', 'description', 'url']);
const OVERHANG_STEPS = [0, 10, 25, 50, 75, 95];

const fmt = n => {
  if (typeof n === 'boolean') return n ? '1' : '0';
  if (typeof n === 'number') return String(Math.round(n * 10000) / 10000);
  return String(n);
};
const val = (r, id) => r.fields[id] && r.fields[id].value;

function notesText(r) {
  const lines = [];
  lines.push(`Erstellt mit Filament Profiler am ${new Date().toLocaleDateString('de-DE')}.`);
  const pname = r.printer.model.toLowerCase().startsWith(r.printer.vendor.toLowerCase()) ? r.printer.model : `${r.printer.vendor} ${r.printer.model}`;
  lines.push(`Filament: ${r.product.brand} ${r.product.name} (${r.product.type || r.product.family}) · Drucker: ${pname}, Düse ${r.printer.nozzle} mm${r.printer.variant ? ' (' + r.printer.variant + ')' : ''}.`);
  if (val(r, 'dry_temp')) lines.push(`Trocknung: ${val(r, 'dry_temp')} °C${val(r, 'dry_time') ? ' für ' + val(r, 'dry_time') + ' h' : ''}.`);
  if (val(r, 'nozzle_range_low') && val(r, 'nozzle_range_high')) lines.push(`Düsentemperatur laut Hersteller: ${val(r, 'nozzle_range_low')}–${val(r, 'nozzle_range_high')} °C.`);
  if (val(r, 'chamber_temp')) lines.push(`Empfohlene Bauraumtemperatur: ${val(r, 'chamber_temp')} °C.`);
  if (val(r, 'spool_weight')) lines.push(`Spule: ${val(r, 'spool_weight')} g netto${val(r, 'empty_spool') ? ', Leerspule ' + val(r, 'empty_spool') + ' g' : ''}.`);
  if (val(r, 'abrasive')) lines.push('Abrasiv: gehärtete Düse verwenden.');
  if (r.note) lines.push('Hinweis: ' + r.note);
  if (r.tds) lines.push('Datenblatt: ' + r.tds);
  const def = Object.entries(r.fields).filter(([, f]) => f.tier === 'default').map(([id]) => id);
  if (def.length) lines.push('Standardwerte (keine Herstellerdaten): ' + def.join(', ') + '.');
  lines.push('Quellen: ' + [...new Set(r.sources.map(s => s.name + ' [' + s.kind + ']'))].join('; '));
  return lines.join('\n');
}

function filamentId(name) {
  return 'P' + crypto.createHash('sha1').update(name).digest('hex').slice(0, 7);
}
function sortKeys(o) { const out = {}; for (const k of Object.keys(o).sort()) out[k] = o[k]; return out; }

// ------------------------------------------------------------------ Orca / Bambu
function exportOrcaLike(r, target, schema, opts = {}) {
  const c = catalog.get();
  const keys = schema && schema.slicers && schema.slicers[target] && new Set(schema.slicers[target].keys);
  const out = {};
  const removed = [];
  let base = null;
  if (r.bases.orca && c.models.orca) base = c.models.orca.resolve(r.bases.orca.vendor, 'filament', r.bases.orca.name);
  const idx = r.bases.orca ? r.bases.orca.idx : 0;
  const pickV = v => Array.isArray(v) ? [String(v[idx] !== undefined ? v[idx] : v[0])] : v;
  if (base && opts.mode !== 'inherit') {
    for (const [k, e] of Object.entries(base.values)) {
      if (META_KEYS.has(k) || k.startsWith('filament_dev_')) continue;
      out[k] = pickV(e.v);
    }
    if (out.filament_extruder_variant && r.printer.variant) out.filament_extruder_variant = [r.printer.variant];
  }
  for (const f of FIELDS) {
    if (!f.orca || !r.fields[f.id]) continue;
    let v = r.fields[f.id].value;
    let key = f.orca;
    if (f.id === 'chamber_temp' && keys && !keys.has(key) && keys.has('chamber_temperatures')) key = 'chamber_temperatures';
    if (f.id === 'shrink_xy' || f.id === 'shrink_z') v = (Math.round((100 - v) * 100) / 100) + '%';
    else if (f.id === 'overhang_threshold') v = OVERHANG_STEPS.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, 50) + '%';
    else if (f.id === 'abrasive') v = v ? '40' : (out.required_nozzle_HRC && out.required_nozzle_HRC[0] !== '40' ? out.required_nozzle_HRC[0] : '3');
    else if (['retract_length', 'retract_speed', 'deretract_speed', 'z_hop'].includes(f.id) && r.fields[f.id].tier === 'printer' && !opts.explicitRetraction) v = 'nil';
    else if (['nozzle_temp', 'nozzle_temp_first', 'nozzle_range_low', 'nozzle_range_high', 'fan_min', 'fan_max', 'overhang_fan', 'close_fan_first', 'full_fan_layer', 'aux_fan', 'chamber_temp', 'vitrification', 'fan_cooling_layer_time', 'slow_down_layer_time', 'slow_down_min_speed'].includes(f.id) || f.plate) v = Math.round(v);
    out[key] = [fmt(v)];
  }
  if (r.fields.chamber_temp && r.fields.chamber_temp.value > 0 && (!keys || keys.has('activate_chamber_temp_control'))) {
    if (!out.activate_chamber_temp_control) out.activate_chamber_temp_control = ['0'];
  }
  out.filament_notes = [notesText(r)];
  // Meta
  const name = r.name;
  out.name = name;
  out.filament_settings_id = [name];
  out.type = 'filament'; // wird vom Orca/Bambu-CLI zur Typerkennung verlangt; der GUI-Import erkennt am filament_settings_id
  out.from = 'User';
  out.is_custom_defined = '0';
  // Import verlangt eine gültige Semver-Version (ohne führende Nullen, z. B. 02.03.01.10 → 2.3.1.10)
  out.version = String(opts.version || '2.0.0.0').split('.').map(x => String(parseInt(x, 10) || 0)).join('.');
  out.compatible_printers = r.printer.orcaPreset ? [r.printer.orcaPreset] : [];
  out.compatible_printers_condition = '';
  out.compatible_prints = [];
  out.compatible_prints_condition = '';
  if (opts.mode === 'inherit' && base) {
    out.inherits = base.name;
  } else {
    out.inherits = '';
    out.filament_id = (base && base.values.filament_id && String(base.values.filament_id.v)) || filamentId(name);
  }
  // Schema-Filter
  if (keys) {
    for (const k of Object.keys(out)) {
      if (META_KEYS.has(k)) continue;
      if (!keys.has(k)) { removed.push(k); delete out[k]; }
    }
  }
  const json = JSON.stringify(sortKeys(out), null, 4);
  const safe = name.replace(/[<>:"/\\|?*]/g, '_');
  const info = `sync_info = \nuser_id = \nsetting_id = \nbase_id = ${opts.mode === 'inherit' && base && base.raw && base.raw.setting_id ? base.raw.setting_id : ''}\nupdated_time = ${Math.floor(Date.now() / 1000)}\n`;
  return { filename: safe + '.json', content: json, mime: 'application/json', removed, info, infoName: safe + '.info', keyCount: Object.keys(out).length };
}

// ------------------------------------------------------------------ PrusaSlicer
function prusaPa(r) {
  const pa = val(r, 'pa');
  if (pa === undefined || val(r, 'pa_enable') === false) return '';
  const fl = (r.printer.flavor || '').toLowerCase();
  const model = (r.prusaVars && (r.prusaVars.printer_model || '')) + ' ' + r.printer.model;
  if (fl === 'klipper') return `SET_PRESSURE_ADVANCE ADVANCE=${fmt(pa)}`;
  if (/MK4|MK3\.5|MK3\.9|XL|MINI|CORE|COREONE/i.test(model) && /prusa/i.test(r.printer.vendor)) return `M572 S${fmt(pa)} ; Pressure Advance`;
  return `M900 K${fmt(pa)} ; Linear Advance`;
}

function exportPrusa(r, schema, opts = {}) {
  const c = catalog.get();
  const keys = schema && schema.slicers && schema.slicers.prusa && new Set(schema.slicers.prusa.keys);
  const out = {};
  const removed = [];
  let base = null;
  if (r.bases.prusa && c.models.prusa) base = c.models.prusa.resolve(r.bases.prusa.vendor, 'filament', r.bases.prusa.name);
  if (base) for (const [k, e] of Object.entries(base.values)) out[k] = e.v;
  else Object.assign(out, { cooling: '1', fan_always_on: '1', filament_colour: '#29B2B2', start_filament_gcode: '"; Filament gcode\\n"', end_filament_gcode: '"; Filament-specific end gcode\\n"' });
  const plate = opts.plate || 'textured';
  for (const f of FIELDS) {
    if (!r.fields[f.id]) continue;
    let v = r.fields[f.id].value;
    let key = f.prusa;
    if (!key) continue;
    if (['retract_length', 'retract_speed', 'deretract_speed', 'z_hop'].includes(f.id) && r.fields[f.id].tier === 'printer' && !opts.explicitRetraction) { out[key] = 'nil'; continue; }
    if (f.id === 'shrink_xy' || f.id === 'shrink_z') v = fmt(v) + '%';
    else if (f.unit === 'text') v = f.id === 'vendor' || f.id === 'type' ? String(v) : `"${v}"`;
    else if (f.unit === 'bool') v = v ? '1' : '0';
    else if (f.unit === '°C' || f.unit === '%' || f.id === 'close_fan_first' || f.id === 'full_fan_layer' || f.unit === 's') v = String(Math.round(v));
    else v = fmt(v);
    out[key] = v;
  }
  const bt = val(r, 'bed_' + plate) || val(r, 'bed_textured') || val(r, 'bed_hot');
  const btf = val(r, 'bed_' + plate + '_first') || bt;
  if (bt !== undefined) { out.bed_temperature = String(Math.round(bt)); out.first_layer_bed_temperature = String(Math.round(btf)); }
  if (val(r, 'chamber_temp')) { out.chamber_minimal_temperature = out.chamber_minimal_temperature || '0'; }
  // Pressure/Linear Advance im Filament-Start-G-Code
  const pa = prusaPa(r);
  if (pa && !(r.bases.prusa && r.bases.prusa.exact && r.fields.pa && r.fields.pa.tier === 'exact')) {
    // Zeilen sind im INI-String als literales "\n" getrennt; vorhandene PA-Befehle ersetzen.
    const g = (out.start_filament_gcode || '"; Filament gcode\\n"').replace(/^"|"$/g, '')
      .split('\\n').filter(l => l && !/M572|M900|SET_PRESSURE_ADVANCE/i.test(l));
    g.push(pa);
    out.start_filament_gcode = '"' + g.join('\\n') + '\\n"';
  }
  out.filament_notes = '"' + notesText(r).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
  out.compatible_printers = r.printer.prusaPreset ? `"${r.printer.prusaPreset}"` : '';
  out.compatible_printers_condition = '';
  out.compatible_prints = '';
  out.compatible_prints_condition = '';
  out.filament_settings_id = '""';
  delete out.inherits;
  delete out.renamed_from;
  if (keys) for (const k of Object.keys(out)) if (!keys.has(k)) { removed.push(k); delete out[k]; }
  const ver = (schema && schema.slicers && schema.slicers.prusa && schema.slicers.prusa.tag || '').replace('version_', '') || '2.9.0';
  const header = `# generated by PrusaSlicer ${ver} on ${new Date().toISOString().replace('T', ' at ').slice(0, 22)} UTC (Filament Profiler)\n`;
  const body = Object.keys(out).sort().map(k => `${k} = ${out[k]}`).join('\n') + '\n';
  const safe = r.name.replace(/[<>:"/\\|?*]/g, '_');
  const bundle = `# generated by PrusaSlicer ${ver} on ${new Date().toISOString().replace('T', ' at ').slice(0, 22)} UTC (Filament Profiler)\n\n[filament:${r.name}]\n${body}\n[presets]\nfilament = ${r.name}\n`;
  return { filename: safe + '.ini', content: header + body, mime: 'text/plain', removed, bundle, bundleName: safe + ' (Bundle).ini', keyCount: Object.keys(out).length };
}

// ------------------------------------------------------------------ Cura
function uuidFrom(s) {
  const h = crypto.createHash('sha1').update('filament-profiler:' + s).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function exportCura(r, schema, opts = {}) {
  const cs = schema && schema.slicers && schema.slicers.cura;
  const allowedXml = new Set(cs ? cs.xmlSettings.concat(cs.xmlSerialized) : []);
  const allowedCura = new Set(cs ? cs.keys : []);
  const removed = [];
  const plate = opts.plate || 'textured';
  const v = id => val(r, id);
  const settings = [];
  const curaSettings = [];
  const s = (k, x) => { if (x === undefined || x === null) return; if (cs && !allowedXml.has(k)) { removed.push(k); return; } settings.push([k, x]); };
  const cset = (k, x) => { if (x === undefined || x === null) return; if (cs && !allowedCura.has(k)) { removed.push(k); return; } curaSettings.push([k, x]); };
  const bed = v('bed_' + plate) || v('bed_textured') || v('bed_hot');
  const bedFirst = v('bed_' + plate + '_first') || bed;
  s('print temperature', v('nozzle_temp'));
  s('heated bed temperature', bed);
  s('standby temperature', v('nozzle_temp') !== undefined ? Math.max(0, v('nozzle_temp') - 30) : undefined);
  s('print cooling', v('fan_min') !== undefined ? v('fan_min') : v('fan_max'));
  if (r.fields.retract_length && r.fields.retract_length.tier !== 'printer') s('retraction amount', v('retract_length'));
  if (r.fields.retract_speed && r.fields.retract_speed.tier !== 'printer') s('retraction speed', v('retract_speed'));
  if (v('chamber_temp')) s('build volume temperature', v('chamber_temp'));
  if (v('shrink_xy')) s('shrinkage percentage', v('shrink_xy'));
  cset('material_print_temperature_layer_0', v('nozzle_temp_first'));
  cset('material_initial_print_temperature', v('nozzle_temp'));
  cset('material_final_print_temperature', v('nozzle_temp'));
  cset('material_bed_temperature_layer_0', bedFirst);
  cset('material_flow', v('flow_ratio') !== undefined ? Math.round(v('flow_ratio') * 1000) / 10 : undefined);
  cset('cool_fan_speed_min', v('fan_min'));
  cset('cool_fan_speed_max', v('fan_max'));
  cset('cool_min_layer_time', v('slow_down_layer_time'));
  cset('cool_min_layer_time_fan_speed_max', v('fan_cooling_layer_time'));
  cset('cool_min_speed', v('slow_down_min_speed'));
  if (v('close_fan_first') !== undefined) cset('cool_fan_full_layer', Math.max(1, (v('full_fan_layer') || 0) || (v('close_fan_first') + 1)));
  cset('bridge_fan_speed', v('overhang_fan'));
  if (v('shrink_xy')) cset('material_shrinkage_percentage_xy', 100 + v('shrink_xy'));
  if (v('shrink_z')) cset('material_shrinkage_percentage_z', 100 + v('shrink_z'));
  const colorName = opts.color || 'Generic';
  const colorCode = /^#[0-9a-fA-F]{6}$/.test(opts.colorCode || '') ? opts.colorCode : '#ffc924';
  const label = `${r.product.name}${opts.color ? ' ' + opts.color : ''}`;
  const desc = notesText(r);
  const lines = [];
  lines.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  lines.push(`<!-- Erstellt mit Filament Profiler. Quellen siehe description. -->`);
  lines.push(`<fdmmaterial xmlns="http://www.ultimaker.com/material" xmlns:cura="http://www.ultimaker.com/cura" version="1.3">`);
  lines.push(`    <metadata>`);
  lines.push(`        <name>`);
  lines.push(`            <brand>${esc(r.product.brandKey === 'generic' ? 'Generic' : r.product.brand)}</brand>`);
  lines.push(`            <material>${esc(r.product.type || r.product.family)}</material>`);
  lines.push(`            <color>${esc(colorName)}</color>`);
  lines.push(`            <label>${esc(label)}</label>`);
  lines.push(`        </name>`);
  lines.push(`        <GUID>${uuidFrom(r.name + '|' + colorName)}</GUID>`);
  lines.push(`        <version>1</version>`);
  lines.push(`        <color_code>${colorCode}</color_code>`);
  lines.push(`        <description>${esc(desc)}</description>`);
  if (r.tds) lines.push(`        <TDS>${esc(r.tds)}</TDS>`);
  if (r.sds) lines.push(`        <MSDS>${esc(r.sds)}</MSDS>`);
  lines.push(`    </metadata>`);
  lines.push(`    <properties>`);
  if (v('density')) lines.push(`        <density>${fmt(v('density'))}</density>`);
  lines.push(`        <diameter>${fmt(v('diameter') || 1.75)}</diameter>`);
  if (v('spool_weight')) lines.push(`        <weight>${fmt(v('spool_weight'))}</weight>`);
  lines.push(`    </properties>`);
  lines.push(`    <settings>`);
  for (const [k, x] of settings) lines.push(`        <setting key="${esc(k)}">${fmt(x)}</setting>`);
  for (const [k, x] of curaSettings) lines.push(`        <cura:setting key="${esc(k)}">${fmt(x)}</cura:setting>`);
  lines.push(`    </settings>`);
  lines.push(`</fdmmaterial>`);
  const safe = (r.name.replace(/\s*@.*$/, '') + (opts.color ? ' ' + opts.color : '')).replace(/\+/g, 'plus').replace(/[^A-Za-z0-9._-]+/g, '_');
  return { filename: safe + '.xml.fdm_material', content: lines.join('\n') + '\n', mime: 'application/xml', removed, keyCount: settings.length + curaSettings.length };
}

function exportProfile(r, target, schema, opts) {
  if (target === 'orca' || target === 'bambu' || target === 'snapmaker') return exportOrcaLike(r, target, schema, opts);
  if (target === 'prusa') return exportPrusa(r, schema, opts);
  if (target === 'cura') return exportCura(r, schema, opts);
  throw new Error('Unbekannter Slicer: ' + target);
}

module.exports = { exportProfile, notesText, PLATES };
