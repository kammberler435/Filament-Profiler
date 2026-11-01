'use strict';
// Lokaler Daten-Cache (JSON-Dateien im Ordner data/ neben der App).
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(path.join(DATA_DIR, 'sources'), { recursive: true });

function file(name) { return path.join(DATA_DIR, name); }

function read(name, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file(name), 'utf8')); } catch { return fallback; }
}

function write(name, obj) {
  const f = file(name);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, f);
}

module.exports = { DATA_DIR, read, write, file };
