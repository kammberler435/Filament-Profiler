'use strict';
// Quelle: offizielle PrusaSlicer-Konfigurationsbündel (Prusa Research + Fremdhersteller).
// Je Hersteller wird die neueste INI-Version geladen.
const { gh, getText, pool, rawUrl, blobUrl } = require('../net');

const REPOS = ['prusa3d/PrusaSlicer-settings-prusa-fff', 'prusa3d/PrusaSlicer-settings-non-prusa-fff'];

function semverCmp(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

async function listLatest() {
  const out = [];
  for (const repo of REPOS) {
    const info = await gh(`/repos/${repo}`);
    const branch = info.default_branch;
    const tree = await gh(`/repos/${repo}/git/trees/${branch}?recursive=1`);
    const best = {};
    for (const t of tree.tree) {
      const m = t.path.match(/^([^/]+)\/(\d+\.\d+\.\d+)\.ini$/);
      if (!m) continue;
      if (!best[m[1]] || semverCmp(m[2], best[m[1]].version) > 0) best[m[1]] = { vendor: m[1], version: m[2], path: t.path, sha: t.sha, repo, ref: branch };
    }
    out.push(...Object.values(best));
  }
  return out;
}

async function check(prev) {
  // Günstiger Check ohne Tree-Abruf: Commit-SHA der beiden Repos.
  const shas = [];
  for (const repo of REPOS) {
    const c = await gh(`/repos/${repo}/commits?per_page=1`);
    shas.push(c[0] && c[0].sha);
  }
  const ref = shas.join(',');
  return { ref, changed: !prev || prev.ref !== ref };
}

async function update(prev, progress) {
  const shas = [];
  for (const repo of REPOS) {
    const c = await gh(`/repos/${repo}/commits?per_page=1`);
    shas.push(c[0] && c[0].sha);
  }
  const list = await listLatest();
  const old = (prev && prev.vendors) || {};
  const vendors = {};
  progress(`PrusaSlicer: ${list.length} Hersteller-Bündel`);
  await pool(list, 6, async v => {
    if (old[v.vendor] && old[v.vendor].sha === v.sha) { vendors[v.vendor] = old[v.vendor]; return; }
    try {
      const text = await getText(rawUrl(v.repo, v.ref, v.path));
      vendors[v.vendor] = { ...v, text, url: blobUrl(v.repo, v.ref, v.path) };
    } catch (e) {
      if (old[v.vendor]) vendors[v.vendor] = old[v.vendor];
    }
  }, (d, n) => progress(`PrusaSlicer: ${d}/${n} Bündel`, d / n));
  return { ref: shas.join(','), fetchedAt: new Date().toISOString(), vendors };
}

// ---------------------------------------------------------------------------

function parseIni(text) {
  const sections = new Map();
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line || line[0] === '#' || line[0] === ';') continue;
    const s = line.match(/^\[([^\]]+)\]\s*$/);
    if (s) { cur = { header: s[1], kv: {} }; sections.set(s[1], cur); continue; }
    if (!cur) continue;
    const i = line.indexOf('=');
    if (i < 0) continue;
    cur.kv[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return sections;
}

function buildModel(raw) {
  const bundles = {};
  for (const [vendor, v] of Object.entries(raw.vendors || {})) bundles[vendor] = { ...v, sections: parseIni(v.text) };
  const memo = new Map();

  function resolve(vendor, kind, name, depth = 0) {
    const key = vendor + '|' + kind + '|' + name;
    if (memo.has(key)) return memo.get(key);
    const b = bundles[vendor];
    const sec = b && b.sections.get(kind + ':' + name);
    if (!sec || depth > 20) return null;
    let values = {};
    if (sec.kv.inherits) {
      for (const parent of sec.kv.inherits.split(';').map(s => s.trim()).filter(Boolean)) {
        const p = resolve(vendor, kind, parent, depth + 1);
        if (p) Object.assign(values, p.values);
      }
    }
    for (const [k, v] of Object.entries(sec.kv)) {
      if (k === 'inherits') continue;
      values[k] = { v, sec: name };
    }
    const res = { vendor, name, values };
    memo.set(key, res);
    return res;
  }

  const printers = [], filaments = [];
  for (const [vendor, b] of Object.entries(bundles)) {
    const models = {};
    for (const [h, sec] of b.sections) {
      if (h.startsWith('printer_model:')) models[h.slice(14)] = sec.kv;
    }
    for (const [h] of b.sections) {
      const [kind, ...rest] = h.split(':');
      const name = rest.join(':');
      if (name.startsWith('*')) continue;
      if (kind === 'printer') {
        const r = resolve(vendor, 'printer', name);
        if (!r || !r.values.printer_model || (r.values.printer_technology && r.values.printer_technology.v !== 'FFF')) continue;
        const pm = r.values.printer_model.v;
        printers.push({
          source: 'prusa', vendorDir: vendor, vendor: (b.sections.get('vendor') || { kv: {} }).kv.name || vendor,
          preset: name, model: (models[pm] && models[pm].name) || pm, modelId: pm,
          nozzle: prusaNozzle(r),
        });
      } else if (kind === 'filament') {
        const r = resolve(vendor, 'filament', name);
        if (!r) continue;
        filaments.push({
          vendorDir: vendor, name, base: name.replace(/\s*@.*$/, '').trim(),
          brand: (r.values.filament_vendor || { v: '' }).v, type: (r.values.filament_type || { v: '' }).v,
          condition: (r.values.compatible_printers_condition || { v: '' }).v,
          compatible: splitList((r.values.compatible_printers || { v: '' }).v),
        });
      }
    }
  }
  return { fetchedAt: raw.fetchedAt, bundles, resolve, printers, filaments };
}

// Düsen-Schlüssel: Durchmesser, bei Sondervarianten (z. B. „HF0.4“) die Variante.
function prusaNozzle(r) {
  const d = String(parseFloat((r.values.nozzle_diameter || { v: '0.4' }).v.split(',')[0]));
  const v = r.values.printer_variant && r.values.printer_variant.v.replace(/^"|"$/g, '');
  return v && !/^\d+(\.\d+)?$/.test(v) ? v : d;
}

function splitList(s) {
  if (!s) return [];
  const out = [];
  const re = /"((?:[^"\\]|\\.)*)"|([^;\s][^;]*)/g;
  let m;
  while ((m = re.exec(s))) out.push((m[1] !== undefined ? m[1] : m[2]).trim());
  return out.filter(Boolean);
}

// --- Auswertung von compatible_printers_condition (Teilmenge der PrusaSlicer-Syntax) ---
function evalCondition(cond, vars) {
  if (!cond || !cond.trim()) return true;
  let s = cond.replace(/^"|"$/g, '');
  const toks = [];
  const re = /\s*(\(|\)|==|!=|<=|>=|<|>|=~|!~|\/(?:[^/\\]|\\.)*\/i?|"(?:[^"\\]|\\.)*"|and\b|or\b|not\b|!|[A-Za-z_][A-Za-z0-9_]*(?:\[\d+\])?|-?\d+(?:\.\d+)?)/y;
  let m;
  while (re.lastIndex < s.length && (m = re.exec(s))) toks.push(m[1]);
  let i = 0;
  const peek = () => toks[i], next = () => toks[i++];
  function value(t) {
    if (t === undefined) return undefined;
    if (t[0] === '"') return t.slice(1, -1);
    if (/^-?\d/.test(t)) return parseFloat(t);
    if (t === 'true') return true;
    if (t === 'false') return false;
    const mm = t.match(/^([A-Za-z_]\w*)(?:\[(\d+)\])?$/);
    if (!mm) return t;
    let v = vars[mm[1]];
    if (v === undefined) return '';
    if (mm[2] !== undefined) v = String(v).split(/[,;]/)[+mm[2]];
    else if (typeof v === 'string' && /[,;]/.test(v) && /^[\d.,;\s-]+$/.test(v)) v = v.split(/[,;]/)[0];
    const n = parseFloat(v);
    return (typeof v === 'string' && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) ? n : v;
  }
  function primary() {
    const t = next();
    if (t === '(') { const v = orExpr(); next(); return v; }
    if (t === 'not' || t === '!') return !primary();
    const left = value(t);
    const op = peek();
    if (['==', '!=', '<', '>', '<=', '>=', '=~', '!~'].includes(op)) {
      next();
      const rt = next();
      if (op === '=~' || op === '!~') {
        const rm = rt.match(/^\/(.*)\/(i?)$/);
        const ok = rm ? new RegExp(rm[1], rm[2]).test(String(left)) : false;
        return op === '=~' ? ok : !ok;
      }
      const right = value(rt);
      switch (op) {
        case '==': return left == right; // eslint-disable-line eqeqeq
        case '!=': return left != right; // eslint-disable-line eqeqeq
        case '<': return left < right;
        case '>': return left > right;
        case '<=': return left <= right;
        case '>=': return left >= right;
      }
    }
    return !!left;
  }
  function andExpr() { let v = primary(); while (peek() === 'and') { next(); const r = primary(); v = v && r; } return v; }
  function orExpr() { let v = andExpr(); while (peek() === 'or') { next(); const r = andExpr(); v = v || r; } return v; }
  try { return orExpr(); } catch { return false; }
}

module.exports = { check, update, buildModel, evalCondition, splitList, parseIni };
