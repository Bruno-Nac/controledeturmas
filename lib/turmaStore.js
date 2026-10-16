'use strict';

// Shared read-modify-write access to the single dashboard-data.json blob.
// Both the xlsx-upload path (api/process.js, full overwrite) and the manual
// CRUD path (api/turmas.js, single-turma read-modify-write) go through this
// so there's one place that knows how the blob is stored (private access,
// fixed pathname, seed fallback).

const { get, put } = require('@vercel/blob');
const seed = require('../data/dashboard-data.seed.json');

// The stored blob normally wins, but a seed generated more recently than the
// blob wins instead: otherwise a stale blob left over from an old upload
// would keep masking the fresh seed shipped with a new deploy until someone
// ran a manual refresh. Any later upload, sync or /admin edit stamps a newer
// gerado_em on the blob and takes over again.
async function readDashboard() {
  // Deep clone so callers can mutate freely without touching the shared seed object.
  const fresh = () => JSON.parse(JSON.stringify(seed));
  try {
    const result = await get('dashboard-data.json', { access: 'private' });
    if (!result || !result.stream) throw new Error('blob not found');
    const stored = JSON.parse(await new Response(result.stream).text());
    return (seed.gerado_em || '') > (stored.gerado_em || '') ? fresh() : stored;
  } catch (e) {
    return fresh();
  }
}

async function writeDashboard(data) {
  await put('dashboard-data.json', JSON.stringify(data), {
    access: 'private',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

module.exports = { readDashboard, writeDashboard };
