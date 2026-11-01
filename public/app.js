'use strict';
// Filament Profiler – Oberfläche
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
};
// Auf der Website (statisch, ohne Server) beantwortet engine.js die Anfragen im Browser.
const WEB = window.FP_WEB || null;
async function api(path, body) {
  if (WEB) return WEB.api(path.replace(/^\//, ''), body);
  const r = await fetch(path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {});
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || r.statusText); e.status = r.status; e.data = j; throw e; }
  return j;
}
const fmtDate = s => s ? new Date(s).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–';
const fmtNum = v => typeof v === 'number' ? String(Math.round(v * 10000) / 10000).replace('.', ',') : v;
const parseNum = s => parseFloat(String(s).replace(',', '.'));

const TIERS = {
  exact: 'Offizielles Profil für genau diesen Drucker',
  ofd: 'Herstellerangabe (Datenblatt / Open Filament Database)',
  catalog: 'Ausgewählter Hersteller',
  brand: 'Herstellerprofil, nicht druckerspezifisch',
  pgeneric: 'Standardprofil des Druckers für dieses Material',
  pvendorbase: 'Grundprofil des Druckerherstellers',
  spoolman: 'Community-Datenbank (SpoolmanDB)',
  printer: 'Druckerprofil (Maschine)',
  slicerbase: 'Slicer-Grundwert der Materialklasse',
  default: 'Standardwert – keine Herstellerdaten, bitte prüfen',
  manual: 'Manuell geändert',
};
const SLICER_LABEL = { orca: 'OrcaSlicer', snapmaker: 'Snapmaker Orca', bambu: 'Bambu Studio', prusa: 'PrusaSlicer', cura: 'Cura' };

const S = {
  brands: [], printers: [], fields: [], brand: null, products: [], family: null, product: null,
  printer: null, printerInfo: null, nozzle: null, variant: null, target: null, overrides: {}, result: null,
  status: null, openDetail: null,
};

// ------------------------------------------------------------------ Status & Update
async function refreshStatus() {
  const st = await api('/api/status');
  S.status = st;
  const u = st.updater;
  const chip = $('#dataChip');
  if (st.hasData) {
    chip.textContent = `Datenstand ${fmtDate(u.lastUpdate)} · ${st.counts.brands} Hersteller · ${st.counts.products} Produkte · ${st.counts.printers} Drucker`;
    chip.className = 'chip ok';
  } else {
    chip.textContent = u.running ? 'Erstes Laden der Daten …' : 'Noch keine Daten – bitte aktualisieren';
    chip.className = 'chip warn';
  }
  const avail = Object.keys(u.available || {}).length;
  if (avail && !u.running) { chip.textContent += ` · ${avail} Update(s) verfügbar`; chip.className = 'chip warn'; }
  $('#updateBar').hidden = !u.running;
  $('#updateProgress').style.width = Math.round((u.progress || 0) * 100) + '%';
  $('#updatePhase').textContent = u.phase || '';
  $('#btnUpdate').disabled = u.running;
  $('#btnUpdate').textContent = u.running ? 'Aktualisiere …' : 'Daten aktualisieren';
  if (!S.target) S.target = st.local.orca ? 'orca' : st.local.snapmaker ? 'snapmaker' : st.local.bambu ? 'bambu' : st.local.prusa ? 'prusa' : 'orca';
  renderSourcesDialog();
  return st;
}

let wasRunning = false;
async function pollUpdate() {
  try {
    const st = await refreshStatus();
    const running = st.updater.running;
    if (wasRunning && !running) {
      await loadCatalog();
      if (st.updater.error) flash(st.updater.error, true);
      else flash('Daten aktualisiert.');
    }
    if (!wasRunning && running) wasRunning = true;
    wasRunning = running;
    setTimeout(pollUpdate, running ? 800 : 15000);
  } catch { setTimeout(pollUpdate, 3000); }
}

$('#btnUpdate').addEventListener('click', async () => {
  await api('/api/update', {});
  wasRunning = true;
  setTimeout(pollUpdate, 300);
});
$('#btnSources').addEventListener('click', () => { renderSourcesDialog(); $('#sourcesDialog').showModal(); });
$('#autoUpdate').addEventListener('change', e => api('/api/settings', { autoUpdate: e.target.checked }));

function renderSourcesDialog() {
  const st = S.status;
  if (!st) return;
  const tb = $('#srcRows');
  tb.replaceChildren(...st.updater.sources.map(s => el('tr', {},
    el('td', {}, s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.label) : s.label),
    el('td', {}, el('code', {}, s.id === 'schema' && s.ref ? Object.entries(JSON.parse(s.ref)).map(([k, v]) => `${SLICER_LABEL[k]} ${v}`).join(', ') : (s.ref || '–'))),
    el('td', {}, fmtDate(s.fetchedAt)),
    el('td', {}, s.ok === false ? el('span', { class: 't-default' }, 'Fehler: ' + s.error) : s.updateAvailable ? el('span', { class: 't-pgeneric' }, 'Update verfügbar') : s.fetchedAt ? el('span', { class: 't-exact' }, 'aktuell') : '–'),
  )));
  const ll = $('#localList');
  const loc = Object.values(st.local || {});
  ll.replaceChildren(...(loc.length ? loc.map(l => el('li', {}, `${l.label} ${l.version || ''}`,
    l.activePrinter ? ` · aktiver Drucker: ${l.activePrinter}` : '', el('br'), el('span', { class: 'muted small' }, 'Benutzerprofile: ' + l.userDir))) : [el('li', {}, 'Keine Slicer gefunden.')]));
  if (st.schema) {
    ll.append(el('li', {}, 'Geprüfte Schemas: ', ...Object.entries(st.schema).map(([k, v], i) => [i ? ', ' : '', el('a', { href: v.url, target: '_blank', rel: 'noopener' }, `${SLICER_LABEL[k]} ${v.tag}`), ` (${v.basis}, ${v.keys} Schlüssel)`])));
  }
  $('#autoUpdate').checked = !!(st.settings && st.settings.autoUpdate);
  $('#updateLog').textContent = st.updater.log.map(l => `${new Date(l.t).toLocaleTimeString('de-DE')}  ${l.msg}`).join('\n');
}

// ------------------------------------------------------------------ Katalog
async function loadCatalog() {
  if (!S.status || !S.status.hasData) return;
  [S.brands, S.printers, S.fields] = await Promise.all([api('/api/brands'), api('/api/printers'), api('/api/fields')]);
  renderBrands();
  renderPrinters();
  renderLocalPrinters();
  if (S.brand) await selectBrand(S.brand, true);
}

function renderBrands() {
  const q = $('#brandSearch').value.trim().toLowerCase();
  const list = S.brands.filter(b => !q || b.name.toLowerCase().includes(q));
  $('#brandCount').textContent = `${S.brands.length} Hersteller`;
  $('#brandList').replaceChildren(...(list.length ? list.map(b => el('li', {
    class: b.key === S.brand ? 'sel' : '', role: 'option', onclick: () => selectBrand(b.key),
  }, el('span', { class: 'name' }, b.name), el('span', { class: 'meta' }, b.count))) : [el('li', { class: 'empty' }, 'Kein Treffer')]));
}
$('#brandSearch').addEventListener('input', renderBrands);

async function selectBrand(key, keep) {
  S.brand = key;
  if (!keep) { S.product = null; S.family = null; }
  renderBrands();
  S.products = await api('/api/products?brand=' + encodeURIComponent(key));
  renderProducts();
  update();
}

function renderProducts() {
  const fams = [...new Set(S.products.map(p => p.family))].sort();
  $('#familyChips').replaceChildren(...(fams.length > 1 ? [el('button', { class: S.family ? '' : 'on', onclick: () => { S.family = null; renderProducts(); } }, 'Alle'),
    ...fams.map(f => el('button', { class: S.family === f ? 'on' : '', onclick: () => { S.family = f; renderProducts(); } }, f))] : []));
  const q = $('#productSearch').value.trim().toLowerCase();
  const list = S.products.filter(p => (!S.family || p.family === S.family) && (!q || (p.name + ' ' + p.type).toLowerCase().includes(q)));
  $('#productCount').textContent = S.products.length ? `${S.products.length} Produkte` : '';
  const items = [];
  let lastFam = null;
  for (const p of list) {
    if (p.family !== lastFam) { items.push(el('li', { class: 'group' }, p.family)); lastFam = p.family; }
    const flags = Object.entries(p.flags || {}).filter(([k, v]) => v && ['silk', 'matte', 'cf', 'gf', 'hs', 'translucent'].includes(k))
      .map(([k]) => ({ silk: 'Silk', matte: 'Matt', cf: 'CF', gf: 'GF', hs: 'High-Speed', translucent: 'Transluzent' })[k]);
    const src = [];
    if (p.sources.ofd) src.push(el('span', { class: 'badge src tds', title: 'Herstellerdaten (Open Filament Database)' }, 'TDS'));
    if (p.sources.orca) src.push(el('span', { class: 'badge src', title: `${p.sources.orca} OrcaSlicer/Bambu-Profile` }, 'Orca'));
    if (p.sources.prusa) src.push(el('span', { class: 'badge src', title: `${p.sources.prusa} PrusaSlicer-Profile` }, 'Prusa'));
    if (p.sources.cura) src.push(el('span', { class: 'badge src', title: 'Cura-Materialprofil' }, 'Cura'));
    items.push(el('li', { class: p.key === S.product ? 'sel' : '', role: 'option', title: p.type, onclick: () => { S.product = p.key; S.overrides = {}; renderProducts(); update(); } },
      el('span', { class: 'name' }, p.name, ' ', ...flags.map(f => el('span', { class: 'badge' }, f))),
      el('span', { class: 'badges' }, src)));
  }
  $('#productList').replaceChildren(...(items.length ? items : [el('li', { class: 'empty' }, S.brand ? 'Kein Treffer' : 'Zuerst einen Hersteller wählen.')]));
}
$('#productSearch').addEventListener('input', renderProducts);

function renderPrinters() {
  const q = $('#printerSearch').value.trim().toLowerCase();
  const list = S.printers.filter(p => !q || (p.vendor + ' ' + p.model).toLowerCase().includes(q));
  $('#printerCount').textContent = `${S.printers.length} Drucker`;
  const items = [];
  let last = null;
  for (const p of list.slice(0, 600)) {
    if (p.vendor !== last) { items.push(el('li', { class: 'group' }, p.vendor)); last = p.vendor; }
    items.push(el('li', { class: p.key === S.printer ? 'sel' : '', role: 'option', onclick: () => selectPrinter(p.key) },
      el('span', { class: 'name' }, p.model), el('span', { class: 'meta' }, p.nozzles.join(' / '))));
  }
  $('#printerList').replaceChildren(...(items.length ? items : [el('li', { class: 'empty' }, 'Kein Treffer')]));
}
$('#printerSearch').addEventListener('input', renderPrinters);

async function renderLocalPrinters() {
  const loc = S.status && S.status.local || {};
  const chips = [];
  for (const [id, l] of Object.entries(loc)) {
    if (!l.activePrinter) continue;
    try {
      const hit = await api('/api/printerByPreset?name=' + encodeURIComponent(l.activePrinter));
      if (hit && hit.key) chips.push(el('button', { title: `Aktiver Drucker in ${l.label}`, onclick: () => { S.target = id; selectPrinter(hit.key, hit.nozzle); } }, `${l.label}: ${hit.model} ${hit.nozzle} mm`));
    } catch { /* nicht im Katalog */ }
  }
  $('#localPrinters').replaceChildren(...chips);
}

async function selectPrinter(key, nozzle) {
  S.printer = key;
  renderPrinters();
  const sel = $('#printerList .sel');
  if (sel) sel.scrollIntoView({ block: 'nearest' });
  S.printerInfo = await api('/api/printer?key=' + encodeURIComponent(key));
  const nz = Object.keys(S.printerInfo.nozzles).sort((a, b) => parseFloat(a) - parseFloat(b) || a.localeCompare(b));
  S.nozzle = nozzle && nz.includes(nozzle) ? nozzle : nz.includes(S.nozzle) ? S.nozzle : nz.includes('0.4') ? '0.4' : nz[0];
  const ns = $('#nozzleSelect');
  ns.disabled = false;
  ns.replaceChildren(...nz.map(n => el('option', { value: n, selected: n === S.nozzle }, /^\d/.test(n) ? n + ' mm' : n)));
  renderVariants();
  update();
}
$('#nozzleSelect').addEventListener('change', e => { S.nozzle = e.target.value; renderVariants(); update(); });
function renderVariants() {
  const v = (S.printerInfo && S.printerInfo.nozzles[S.nozzle] && S.printerInfo.nozzles[S.nozzle].variants) || [];
  $('#variantWrap').hidden = v.length < 2;
  if (!v.includes(S.variant)) S.variant = v[0] || null;
  $('#variantSelect').replaceChildren(...v.map(x => el('option', { value: x, selected: x === S.variant }, x.replace('Direct Drive ', ''))));
}
$('#variantSelect').addEventListener('change', e => { S.variant = e.target.value; update(); });

// ------------------------------------------------------------------ Profil
function request() {
  return { productKey: S.product, printerKey: S.printer, nozzle: S.nozzle, variant: S.variant, overrides: S.overrides, name: $('#profileName').dataset.custom ? $('#profileName').value : undefined };
}

let genSeq = 0;
async function update() {
  const ready = S.product && S.printer;
  $('#profileSection').hidden = !ready;
  $('#emptyHint').hidden = !!ready;
  if (!ready) return;
  const seq = ++genSeq;
  try {
    const r = await api('/api/generate', request());
    if (seq !== genSeq) return;
    S.result = r;
    renderProfile();
  } catch (e) { flash('Fehler: ' + e.message, true); }
}

function renderProfile() {
  const r = S.result;
  $('#profileTitle').textContent = `${r.product.brand} ${r.product.name}`;
  const pm = r.printer.model.toLowerCase().startsWith(r.printer.vendor.toLowerCase()) ? r.printer.model : `${r.printer.vendor} ${r.printer.model}`;
  $('#profileSub').textContent = `${r.product.type || r.product.family} · ${pm} · Düse ${r.printer.nozzle}${r.printer.variant ? ' · ' + r.printer.variant : ''}`;
  if (!$('#profileName').dataset.custom) $('#profileName').value = r.name;
  // Legende (nur verwendete Ebenen)
  const usedTiers = [...new Set(Object.values(r.fields).map(f => f.tier))];
  $('#legend').replaceChildren(...Object.keys(TIERS).filter(t => usedTiers.includes(t)).map(t => el('span', { class: 't-' + t }, el('i', { class: 'dot' }), el('span', { class: 'muted' }, TIERS[t]))));
  // Warnungen
  const warns = [...r.warnings];
  const defs = Object.values(r.fields).filter(f => f.tier === 'default').length;
  if (defs) warns.push(`${defs} Wert(e) sind Standardwerte ohne Hersteller- oder Slicerdaten (orange markiert) – bitte prüfen.`);
  $('#warnings').replaceChildren(...warns.map(w => el('div', { class: 'warn' }, '⚠ ', w)),
    r.note ? el('div', { class: 'warn', style: 'background:var(--accent-soft);border-color:transparent' }, 'ℹ ', r.note) : '');
  // Ziel-Slicer
  for (const b of document.querySelectorAll('#targetSeg button')) b.classList.toggle('on', b.dataset.target === S.target);
  $('#optPlate').hidden = !['prusa', 'cura'].includes(S.target);
  $('#optColor').hidden = S.target !== 'cura';
  const loc = S.status.local[S.target];
  $('#btnInstall').hidden = !(loc && S.target !== 'cura');
  $('#btnInstall').textContent = `In ${SLICER_LABEL[S.target]} installieren`;
  const sch = S.status.schema && S.status.schema[S.target];
  // Website: Slicer-Version wählbar (keine Erkennung der Installation möglich)
  const vers = (S.status.schemaVersions && S.status.schemaVersions[S.target]) || [];
  $('#optVersion').hidden = vers.length < 2;
  const vs = $('#versionSelect');
  if (vs.dataset.target !== S.target) {
    vs.dataset.target = S.target;
    vs.replaceChildren(...vers.map((v, i) => el('option', { value: v }, v.replace(/^version_/, '') + (i === 0 ? ' (neueste)' : ''))));
  }
  const tag = vers.length ? vs.value : sch && sch.tag;
  $('#schemaInfo').textContent = tag ? `Geprüft gegen ${SLICER_LABEL[S.target]} ${tag.replace(/^version_/, '')}` : '';
  // Felder
  const groups = {};
  for (const f of S.fields) {
    if (!r.fields[f.id]) continue;
    (groups[f.group] = groups[f.group] || []).push(f);
  }
  const box = $('#fieldGroups');
  box.replaceChildren(...Object.entries(groups).map(([g, fs]) => el('div', { class: 'group' }, el('h3', {}, g, g === 'Druckbett' ? el('small', {}, '0 °C = Platte für dieses Material nicht empfohlen') : ''), ...fs.map(fieldRow))));
  // Quellen
  const srcs = [];
  if (r.tds) srcs.push(el('li', {}, '📄 Technisches Datenblatt: ', el('a', { href: r.tds, target: '_blank', rel: 'noopener' }, r.tds)));
  if (r.sds) srcs.push(el('li', {}, '📄 Sicherheitsdatenblatt: ', el('a', { href: r.sds, target: '_blank', rel: 'noopener' }, r.sds)));
  for (const s of r.sources) srcs.push(el('li', { class: 't-' + s.tier }, el('i', { class: 'dot' }), ' ', el('span', { style: 'color:var(--ink)' }, `${s.name} – ${TIERS[s.tier] || s.tier} · `), s.url ? el('a', { href: s.url, target: '_blank', rel: 'noopener' }, 'Quelle öffnen') : ''));
  $('#usedSources').replaceChildren(...srcs);
}

function fieldRow(f) {
  const v = S.result.fields[f.id];
  const isBool = f.unit === 'bool';
  let input;
  if (isBool) {
    input = el('select', { onchange: e => setOverride(f.id, e.target.value === '1') }, el('option', { value: '1', selected: v.value === true }, 'Ja'), el('option', { value: '0', selected: v.value !== true }, 'Nein'));
  } else {
    input = el('input', { type: 'text', value: f.unit === 'text' ? v.value : fmtNum(v.value), class: v.tier === 'manual' ? 'changed' : '', onchange: e => setOverride(f.id, f.unit === 'text' ? e.target.value : parseNum(e.target.value)) });
  }
  const unit = isBool || f.unit === 'text' ? '' : f.unit;
  const open = S.openDetail === f.id;
  const tierBtn = el('button', { class: 'tier t-' + v.tier, title: `${TIERS[v.tier]}\n${v.src.label}${v.note ? '\n' + v.note : ''}`, onclick: () => { S.openDetail = open ? null : f.id; renderProfile(); } }, el('i', { class: 'dot' }));
  const sub = v.tier === 'default' ? 'Standardwert' : v.src.label.replace(/^(OrcaSlicer|PrusaSlicer) [^·]*· /, '');
  const row = el('div', { class: 'frow' }, el('div', { class: 'lbl' }, f.label, el('small', { class: 't-' + v.tier }, sub)), input, el('span', { class: 'unit' }, unit), tierBtn);
  if (open) {
    const d = el('div', { class: 'detail' },
      el('div', {}, el('b', { class: 't-' + v.tier }, TIERS[v.tier]), ': ', v.src.label),
      v.note ? el('div', { class: 'muted' }, v.note) : '',
      v.src.url ? el('div', {}, el('a', { href: v.src.url, target: '_blank', rel: 'noopener' }, v.src.url)) : '',
      v.src.dataUrl && v.src.dataUrl !== v.src.url ? el('div', {}, 'Datensatz: ', el('a', { href: v.src.dataUrl, target: '_blank', rel: 'noopener' }, v.src.dataUrl)) : '',
      v.src.fetchedAt ? el('div', { class: 'muted' }, 'Abgerufen: ' + fmtDate(v.src.fetchedAt)) : '',
      f.orca || f.prusa ? el('div', { class: 'muted' }, 'Slicer-Schlüssel: ', [f.orca && `Orca/Bambu „${f.orca}“`, f.prusa && `Prusa „${f.prusa}“`].filter(Boolean).join(', ')) : '',
      v.alternatives.length ? el('div', { style: 'margin-top:6px' }, el('b', {}, 'Andere Quellen:')) : '',
      ...v.alternatives.map(a => el('div', { class: 'alt' },
        el('button', { class: 'btn', onclick: () => setOverride(f.id, a.value) }, 'übernehmen'),
        el('span', { class: 't-' + a.tier }, el('i', { class: 'dot' })),
        el('span', {}, el('b', {}, typeof a.value === 'boolean' ? (a.value ? 'Ja' : 'Nein') : fmtNum(a.value)), ` – ${a.src.label}${a.note ? ' (' + a.note + ')' : ''}`))),
      v.tier === 'manual' ? el('div', { class: 'alt' }, el('button', { class: 'btn', onclick: () => { delete S.overrides[f.id]; update(); } }, 'Änderung zurücksetzen')) : '',
    );
    return el('div', {}, row, d);
  }
  return row;
}

function setOverride(id, val) {
  if (val === '' || (typeof val === 'number' && !Number.isFinite(val))) delete S.overrides[id];
  else S.overrides[id] = val;
  update();
}

$('#targetSeg').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  S.target = b.dataset.target;
  renderProfile();
});
$('#profileName').addEventListener('input', e => { e.target.dataset.custom = e.target.value ? '1' : ''; });

function exportBody() {
  return {
    ...request(), target: S.target,
    exportOptions: { schemaTag: $('#optVersion').hidden ? undefined : $('#versionSelect').value, plate: $('#plateSelect').value, explicitRetraction: $('#explicitRetraction').checked, color: $('#colorName').value.trim() || undefined, colorCode: $('#colorCode').value },
  };
}

$('#btnDownload').addEventListener('click', async () => {
  try {
    const out = await api('/api/export', exportBody());
    const files = [[out.filename, out.content, out.mime]];
    if (S.target === 'prusa' && out.bundle) files.push([out.bundleName, out.bundle, 'text/plain']);
    for (const [name, content, mime] of files) {
      const a = el('a', { href: URL.createObjectURL(new Blob([content], { type: mime })), download: name });
      document.body.append(a); a.click(); a.remove();
    }
    flash(exportMessage(out) + importHint());
  } catch (e) { flash('Export fehlgeschlagen: ' + e.message, true); }
});

$('#btnInstall').addEventListener('click', async () => {
  const body = exportBody();
  try {
    const r = await api('/api/install', body);
    flash(`Installiert: ${r.written.join(', ')}. ${SLICER_LABEL[S.target]} neu starten, damit das Profil erscheint.` + (r.removed.length ? ` (${r.removed.length} in dieser Version unbekannte Schlüssel weggelassen)` : ''));
  } catch (e) {
    if (e.status === 409 && confirm(e.message + '\n\nÜberschreiben?')) {
      try {
        const r = await api('/api/install', { ...body, overwrite: true });
        flash(`Überschrieben: ${r.written.join(', ')}. Slicer neu starten.`);
      } catch (e2) { flash('Installation fehlgeschlagen: ' + e2.message, true); }
    } else if (e.status !== 409) flash('Installation fehlgeschlagen: ' + e.message, true);
  }
});

function exportMessage(out) {
  let m = `Gespeichert: ${out.filename} (${out.keyCount} Einstellungen).`;
  if (out.removed && out.removed.length) m += ` ${out.removed.length} Schlüssel, die die installierte ${SLICER_LABEL[S.target]}-Version nicht kennt, wurden weggelassen.`;
  return m;
}
function importHint() {
  return {
    orca: ' Import: OrcaSlicer → Datei → Importieren → Konfigurationen importieren …',
    snapmaker: ' Import: Snapmaker Orca → Datei → Importieren → Konfigurationen importieren …',
    bambu: ' Import: Bambu Studio → Datei → Importieren → Konfigurationen importieren …',
    prusa: ' Import: PrusaSlicer → Datei → Importieren → Konfigurationspaket importieren … (die „(Bundle).ini“), oder die .ini in %APPDATA%\\PrusaSlicer\\filament kopieren.',
    cura: ' Import: Cura → Einstellungen → Konfigurieren → Materialien → Importieren.',
  }[S.target];
}

function flash(msg, err) {
  const m = $('#exportMsg');
  m.hidden = false;
  m.textContent = msg;
  m.className = 'msg' + (err ? ' err' : '');
  if (!$('#profileSection').hidden) return;
  $('#dataChip').textContent = msg;
}

// ------------------------------------------------------------------ Start
if (WEB) {
  document.body.classList.add('web');
  $('#versionSelect').addEventListener('change', () => renderProfile());
  (async () => {
    try {
      $('#dataChip').textContent = 'Lade Filament- und Druckerdaten …';
      $('#updateBar').hidden = false;
      await WEB.load(f => { $('#updateProgress').style.width = Math.round(f * 100) + '%'; $('#updatePhase').textContent = `Daten werden geladen … ${Math.round(f * 100)} %`; });
      $('#updateBar').hidden = true;
      await refreshStatus();
      $('#dataChip').textContent += ' · wird täglich automatisch aktualisiert';
      await loadCatalog();
    } catch (e) { $('#updateBar').hidden = true; flash('Daten konnten nicht geladen werden: ' + e.message, true); }
  })();
} else {
  $('#versionSelect').addEventListener('change', () => renderProfile());
  setInterval(() => fetch('/api/heartbeat', { method: 'POST' }).catch(() => {}), 10000);
  fetch('/api/heartbeat', { method: 'POST' }).catch(() => {});
  addEventListener('pagehide', () => navigator.sendBeacon('/api/bye'));
  // Dauerverbindung: der Server merkt so sofort, wenn das App-Fenster geschlossen wird.
  new EventSource('/api/live');

  (async () => {
    try {
      await refreshStatus();
      await loadCatalog();
    } catch (e) { flash('Server nicht erreichbar: ' + e.message, true); }
    wasRunning = S.status && S.status.updater.running;
    setTimeout(pollUpdate, wasRunning ? 800 : 15000);
  })();
}
