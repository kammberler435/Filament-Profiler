'use strict';
// Browser-Ersatz für lib/net.js: Auf der Website wird nichts nachgeladen, nur Links gebaut.
const offline = () => { throw new Error('Auf der Website nicht verfügbar'); };

const rawUrl = (repo, ref, path) =>
  `https://raw.githubusercontent.com/${repo}/${encodeURIComponent(ref).replace(/%2F/g, '/')}/${path.split('/').map(encodeURIComponent).join('/')}`;
const blobUrl = (repo, ref, path) =>
  `https://github.com/${repo}/blob/${ref}/${path.split('/').map(encodeURIComponent).join('/')}`;

module.exports = { request: offline, getJSON: offline, getText: offline, gh: offline, pool: offline, rawUrl, blobUrl, robotsAllowed: offline, UA: '' };
