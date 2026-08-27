'use strict';

// Serves the current processed dashboard data to the front-end. Reads it from
// Vercel Blob (written by /api/process on each self-service upload) so the
// page URL never changes and the front-end never needs to know the blob's
// actual URL. Falls back to the bundled seed if nothing has been uploaded yet
// (fresh deploy) or the blob store isn't reachable.

const { head } = require('@vercel/blob');
const seed = require('../data/dashboard-data.seed.json');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const info = await head('dashboard-data.json');
    const upstream = await fetch(info.url, { cache: 'no-store' });
    if (!upstream.ok) throw new Error(`blob fetch failed: ${upstream.status}`);
    const text = await upstream.text();
    res.status(200).send(text);
  } catch (e) {
    res.status(200).send(JSON.stringify(seed));
  }
};
