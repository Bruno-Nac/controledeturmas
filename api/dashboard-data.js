'use strict';

// Serves the current processed dashboard data to the front-end. Reads it from
// Vercel Blob (written by /api/process on each self-service upload) so the
// page URL never changes and the front-end never needs to know the blob's
// actual URL. The store is private (no public unauthenticated blob URL, in
// keeping with keeping this whole site unlisted-but-ungated rather than
// exposing a bare data endpoint anyone could hit directly), so reads go
// through the SDK's authenticated get() rather than a plain fetch of a
// public URL. Falls back to the bundled seed if nothing has been uploaded
// yet (fresh deploy) or the blob store isn't reachable.

const { get } = require('@vercel/blob');
const seed = require('../data/dashboard-data.seed.json');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  try {
    const result = await get('dashboard-data.json', { access: 'private' });
    if (!result || !result.stream) throw new Error('blob not found');
    const text = await new Response(result.stream).text();
    res.status(200).send(text);
  } catch (e) {
    res.status(200).send(JSON.stringify(seed));
  }
};
