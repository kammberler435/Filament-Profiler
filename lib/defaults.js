'use strict';
// Fallback-Standardwerte je Materialklasse (für 0,4-mm-Düse, Direktextruder).
// Werden nur verwendet, wenn keine Hersteller-/Slicer-Daten existieren, und in der
// Oberfläche ausdrücklich als „Standardwert“ markiert. Richtwerte aus gängigen
// Slicer-Grundprofilen und Hersteller-Datenblättern; immer kalibrieren.

const BASE = {
  PLA: {
    nozzle_temp: 215, nozzle_temp_first: 220, nozzle_range_low: 190, nozzle_range_high: 230,
    bed: { cool: 35, eng: 55, hot: 55, textured: 55, supertack: 35, textured_cool: 40 }, chamber_temp: 0,
    fan_min: 100, fan_max: 100, overhang_fan: 100, overhang_threshold: 50, fan_cooling_layer_time: 100,
    slow_down_layer_time: 6, slow_down_min_speed: 20, close_fan_first: 1, full_fan_layer: 3, aux_fan: 70,
    mvs: 15, flow_ratio: 0.98, pa: 0.03,
    density: 1.24, vitrification: 55, shrink_xy: 0, shrink_z: 0, cost: 20,
    dry_temp: 50, dry_time: 8, soluble: false, is_support: false, abrasive: false,
    note: 'Unkritisch, kein Gehäuse nötig. Bei geschlossenem Drucker Tür/Deckel öffnen (Hitzestau).',
  },
  PETG: {
    nozzle_temp: 245, nozzle_temp_first: 245, nozzle_range_low: 220, nozzle_range_high: 260,
    bed: { cool: 0, eng: 70, hot: 70, textured: 70, supertack: 70, textured_cool: 0 }, chamber_temp: 0,
    fan_min: 20, fan_max: 50, overhang_fan: 90, overhang_threshold: 25, fan_cooling_layer_time: 30,
    slow_down_layer_time: 8, slow_down_min_speed: 20, close_fan_first: 3, full_fan_layer: 0, aux_fan: 0,
    mvs: 11, flow_ratio: 0.95, pa: 0.045,
    density: 1.27, vitrification: 70, shrink_xy: 0, shrink_z: 0, cost: 22,
    dry_temp: 65, dry_time: 8, soluble: false, is_support: false, abrasive: false,
    note: 'Haftet sehr stark auf glattem PEI – Trennmittel (Kleber) verwenden. Neigt zu Fäden.',
  },
  PCTG: {
    nozzle_temp: 255, nozzle_temp_first: 255, nozzle_range_low: 240, nozzle_range_high: 270,
    bed: { cool: 0, eng: 75, hot: 75, textured: 75, supertack: 75, textured_cool: 0 }, chamber_temp: 0,
    fan_min: 20, fan_max: 50, overhang_fan: 80, overhang_threshold: 25, fan_cooling_layer_time: 30,
    slow_down_layer_time: 8, slow_down_min_speed: 20, close_fan_first: 3, full_fan_layer: 0, aux_fan: 0,
    mvs: 12, flow_ratio: 0.95, pa: 0.045,
    density: 1.23, vitrification: 75, shrink_xy: 0, shrink_z: 0, cost: 25,
    dry_temp: 65, dry_time: 8, soluble: false, is_support: false, abrasive: false,
    note: 'Wie PETG, zäher. Trennmittel auf glattem PEI empfohlen.',
  },
  ABS: {
    nozzle_temp: 255, nozzle_temp_first: 260, nozzle_range_low: 240, nozzle_range_high: 270,
    bed: { cool: 0, eng: 100, hot: 100, textured: 100, supertack: 0, textured_cool: 0 }, chamber_temp: 45,
    fan_min: 10, fan_max: 40, overhang_fan: 60, overhang_threshold: 25, fan_cooling_layer_time: 30,
    slow_down_layer_time: 4, slow_down_min_speed: 20, close_fan_first: 3, full_fan_layer: 0, aux_fan: 0,
    mvs: 16, flow_ratio: 0.95, pa: 0.04,
    density: 1.04, vitrification: 100, shrink_xy: 0, shrink_z: 0, cost: 22,
    dry_temp: 80, dry_time: 6, soluble: false, is_support: false, abrasive: false,
    note: 'Geschlossener Bauraum empfohlen (Verzug). Dämpfe – gut lüften/Filter verwenden.',
  },
  ASA: {
    nozzle_temp: 260, nozzle_temp_first: 260, nozzle_range_low: 240, nozzle_range_high: 280,
    bed: { cool: 0, eng: 100, hot: 100, textured: 100, supertack: 0, textured_cool: 0 }, chamber_temp: 45,
    fan_min: 15, fan_max: 40, overhang_fan: 60, overhang_threshold: 25, fan_cooling_layer_time: 30,
    slow_down_layer_time: 4, slow_down_min_speed: 20, close_fan_first: 3, full_fan_layer: 0, aux_fan: 0,
    mvs: 16, flow_ratio: 0.95, pa: 0.04,
    density: 1.07, vitrification: 100, shrink_xy: 0, shrink_z: 0, cost: 25,
    dry_temp: 80, dry_time: 6, soluble: false, is_support: false, abrasive: false,
    note: 'UV-beständig. Geschlossener Bauraum empfohlen. Dämpfe – gut lüften.',
  },
  TPU: {
    nozzle_temp: 225, nozzle_temp_first: 225, nozzle_range_low: 200, nozzle_range_high: 240,
    bed: { cool: 30, eng: 35, hot: 35, textured: 35, supertack: 30, textured_cool: 35 }, chamber_temp: 0,
    fan_min: 100, fan_max: 100, overhang_fan: 100, overhang_threshold: 95, fan_cooling_layer_time: 100,
    slow_down_layer_time: 8, slow_down_min_speed: 10, close_fan_first: 1, full_fan_layer: 0, aux_fan: 0,
    mvs: 3.5, flow_ratio: 1.0, pa: 0.0,
    density: 1.21, vitrification: 30, shrink_xy: 0, shrink_z: 0, cost: 30,
    dry_temp: 55, dry_time: 8, soluble: false, is_support: false, abrasive: false,
    retract_length: 0.8, retract_speed: 25,
    note: 'Flexibel: langsam drucken, wenig Retraktion. Nicht für Bowden-Extruder/AMS geeignet (je nach Härte).',
  },
  PA: {
    nozzle_temp: 270, nozzle_temp_first: 270, nozzle_range_low: 250, nozzle_range_high: 290,
    bed: { cool: 0, eng: 90, hot: 90, textured: 90, supertack: 0, textured_cool: 0 }, chamber_temp: 50,
    fan_min: 0, fan_max: 30, overhang_fan: 40, overhang_threshold: 25, fan_cooling_layer_time: 15,
    slow_down_layer_time: 4, slow_down_min_speed: 20, close_fan_first: 3, full_fan_layer: 0, aux_fan: 0,
    mvs: 8, flow_ratio: 0.96, pa: 0.03,
    density: 1.14, vitrification: 70, shrink_xy: 0, shrink_z: 0, cost: 40,
    dry_temp: 80, dry_time: 12, soluble: false, is_support: false, abrasive: false,
    note: 'Stark hygroskopisch – immer frisch getrocknet und aus der Trockenbox drucken. Klebestift auf der Platte.',
  },
  PC: {
    nozzle_temp: 270, nozzle_temp_first: 270, nozzle_range_low: 260, nozzle_range_high: 290,
    bed: { cool: 0, eng: 110, hot: 110, textured: 100, supertack: 0, textured_cool: 0 }, chamber_temp: 55,
    fan_min: 0, fan_max: 30, overhang_fan: 40, overhang_threshold: 25, fan_cooling_layer_time: 30,
    slow_down_layer_time: 4, slow_down_min_speed: 20, close_fan_first: 3, full_fan_layer: 0, aux_fan: 0,
    mvs: 12, flow_ratio: 0.95, pa: 0.04,
    density: 1.20, vitrification: 110, shrink_xy: 0, shrink_z: 0, cost: 35,
    dry_temp: 80, dry_time: 8, soluble: false, is_support: false, abrasive: false,
    note: 'Geschlossener, beheizter Bauraum dringend empfohlen. Hygroskopisch.',
  },
  PET: {
    nozzle_temp: 270, nozzle_temp_first: 270, nozzle_range_low: 255, nozzle_range_high: 290,
    bed: { cool: 0, eng: 80, hot: 80, textured: 80, supertack: 0, textured_cool: 0 }, chamber_temp: 0,
    fan_min: 0, fan_max: 30, overhang_fan: 40, overhang_threshold: 25, fan_cooling_layer_time: 15,
    slow_down_layer_time: 4, slow_down_min_speed: 20, close_fan_first: 3, full_fan_layer: 0, aux_fan: 0,
    mvs: 8, flow_ratio: 0.96, pa: 0.03,
    density: 1.29, vitrification: 80, shrink_xy: 0, shrink_z: 0, cost: 45,
    dry_temp: 80, dry_time: 10, soluble: false, is_support: false, abrasive: false,
    note: 'Technisches Material – trocken drucken.',
  },
  PVA: {
    nozzle_temp: 215, nozzle_temp_first: 220, nozzle_range_low: 190, nozzle_range_high: 230,
    bed: { cool: 35, eng: 55, hot: 55, textured: 55, supertack: 35, textured_cool: 40 }, chamber_temp: 0,
    fan_min: 100, fan_max: 100, overhang_fan: 100, overhang_threshold: 50, fan_cooling_layer_time: 100,
    slow_down_layer_time: 8, slow_down_min_speed: 20, close_fan_first: 1, full_fan_layer: 0, aux_fan: 0,
    mvs: 8, flow_ratio: 0.95, pa: 0.02,
    density: 1.23, vitrification: 50, shrink_xy: 0, shrink_z: 0, cost: 70,
    dry_temp: 55, dry_time: 8, soluble: true, is_support: true, abrasive: false,
    note: 'Wasserlösliches Stützmaterial – extrem hygroskopisch, luftdicht lagern.',
  },
  HIPS: {
    nozzle_temp: 240, nozzle_temp_first: 240, nozzle_range_low: 220, nozzle_range_high: 250,
    bed: { cool: 0, eng: 90, hot: 90, textured: 90, supertack: 0, textured_cool: 0 }, chamber_temp: 40,
    fan_min: 10, fan_max: 40, overhang_fan: 60, overhang_threshold: 25, fan_cooling_layer_time: 30,
    slow_down_layer_time: 4, slow_down_min_speed: 20, close_fan_first: 3, full_fan_layer: 0, aux_fan: 0,
    mvs: 8, flow_ratio: 0.95, pa: 0.04,
    density: 1.04, vitrification: 90, shrink_xy: 0, shrink_z: 0, cost: 25,
    dry_temp: 70, dry_time: 6, soluble: false, is_support: true, abrasive: false,
    note: 'Stützmaterial für ABS (in Limonen löslich).',
  },
  PP: {
    nozzle_temp: 230, nozzle_temp_first: 235, nozzle_range_low: 210, nozzle_range_high: 250,
    bed: { cool: 0, eng: 85, hot: 85, textured: 85, supertack: 0, textured_cool: 0 }, chamber_temp: 0,
    fan_min: 20, fan_max: 50, overhang_fan: 60, overhang_threshold: 25, fan_cooling_layer_time: 30,
    slow_down_layer_time: 6, slow_down_min_speed: 20, close_fan_first: 3, full_fan_layer: 0, aux_fan: 0,
    mvs: 8, flow_ratio: 0.97, pa: 0.03,
    density: 0.90, vitrification: 60, shrink_xy: 0, shrink_z: 0, cost: 35,
    dry_temp: 55, dry_time: 6, soluble: false, is_support: false, abrasive: false,
    note: 'Haftet kaum auf üblichen Platten – PP-Klebeband oder spezielle Platte verwenden.',
  },
};

// Modifikatoren für Varianten (Silk, Matt, CF/GF, High-Speed).
function forProduct(family, flags) {
  const base = BASE[family] || BASE.PLA;
  const d = JSON.parse(JSON.stringify(base));
  d.family = BASE[family] ? family : 'PLA';
  const notes = [];
  if (flags.silk) { d.nozzle_temp += 5; d.nozzle_temp_first += 5; d.mvs = Math.min(d.mvs, 8); d.density = 1.32; notes.push('Silk: höhere Temperatur, langsamer drucken für Glanz.'); }
  if (flags.matte) { d.density = family === 'PLA' ? 1.32 : d.density; notes.push('Matt: leicht höhere Dichte, oft weniger Fluss nötig.'); }
  if (flags.hs) { d.mvs = Math.round(d.mvs * 1.6); notes.push('High-Speed-Variante: höhere Fließrate möglich (Drucker-abhängig).'); }
  if (flags.cf || flags.gf) {
    d.abrasive = true; d.mvs = Math.min(d.mvs, family === 'PLA' ? 12 : 8); d.flow_ratio = Math.min(d.flow_ratio, 0.95);
    d.density = Math.round((d.density + 0.06) * 100) / 100; d.dry_time += 2;
    notes.push('Faserverstärkt (abrasiv): gehärtete Düse (≥ 0,4 mm, besser 0,6 mm) verwenden.');
  }
  if (flags.wood || flags.glow || flags.marble || flags.metal) notes.push('Füllstoff-Filament: Düse ≥ 0,4 mm, Verstopfungsgefahr; Glow/Metall sind abrasiv.');
  if (flags.glow || flags.metal) d.abrasive = true;
  if (flags.plus && family === 'PLA') { d.nozzle_temp += 5; d.nozzle_temp_first += 5; d.nozzle_range_high = 240; }
  d.note = [d.note, ...notes].join(' ');
  return d;
}

// Grobe Skalierung der max. Fließrate nach Düsendurchmesser (Schmelzleistung begrenzt).
const MVS_SCALE = { 0.2: 0.15, 0.25: 0.25, 0.3: 0.5, 0.4: 1, 0.5: 1.25, 0.6: 1.45, 0.8: 1.7, 1.0: 1.8 };
function nozzleScale(n) {
  const v = parseFloat(n);
  if (MVS_SCALE[v] !== undefined) return MVS_SCALE[v];
  return Math.max(0.15, Math.min(1.8, Math.pow(v / 0.4, 1.3)));
}

module.exports = { BASE, forProduct, nozzleScale };
