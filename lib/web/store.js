'use strict';
// Browser-Ersatz für lib/store.js: Daten kommen aus der vorab erzeugten data.json der Website.
let DATA = { store: {} };

function load(data) { DATA = data; }
function read(name, fallback = null) { return DATA.store[name] !== undefined ? DATA.store[name] : fallback; }
function write() { /* auf der Website schreibgeschützt */ }

module.exports = { load, read, write, data: () => DATA };
