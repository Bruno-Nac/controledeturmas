'use strict';

// Serves the current processed dashboard data to the front-end, in the view
// chosen on the opening page (?perfil=usuario or ?perfil=gestao — see
// lib/access.js). Without the parameter the restricted "usuario" version is
// returned, which never carries enrollment numbers. The page URL never changes
// and the front-end never needs to know the blob's actual URL. See
// lib/turmaStore.js for the read path (private Blob, seed fallback).

const { readDashboard } = require('../lib/turmaStore');
const { perfilDe, dadosParaPerfil } = require('../lib/access');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const data = await readDashboard();
  res.status(200).send(JSON.stringify(dadosParaPerfil(perfilDe(req), data)));
};
