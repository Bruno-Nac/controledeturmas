'use strict';

// Receives the two source spreadsheets from /admin, parses them with the
// same logic as pipeline/*.py (ported to JS — see lib/), and republishes the
// merged result to Vercel Blob. No SharePoint access, no Python, no Claude —
// anyone with the upload password can refresh the live dashboard in seconds.

const fs = require('fs/promises');
const { formidable } = require('formidable');
const XLSX = require('xlsx');
const { put } = require('@vercel/blob');

const { extractTurmas } = require('../lib/parseTurmas');
const { extractMatriculas } = require('../lib/parseMatriculas');
const { buildDashboard } = require('../lib/buildDashboard');

function first(v) {
  return Array.isArray(v) ? v[0] : v;
}

async function loadWorkbook(filepath) {
  const raw = await fs.readFile(filepath);
  return XLSX.read(raw, { type: 'buffer', cellDates: true });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  if (!process.env.UPLOAD_PASSWORD) {
    res.status(500).json({ error: 'server_not_configured', message: 'UPLOAD_PASSWORD env var is not set.' });
    return;
  }

  let fields, files;
  try {
    const form = formidable({ maxFileSize: 30 * 1024 * 1024, multiples: false });
    [fields, files] = await form.parse(req);
  } catch (e) {
    res.status(400).json({ error: 'bad_upload', message: e.message });
    return;
  }

  const password = first(fields.password);
  if (password !== process.env.UPLOAD_PASSWORD) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const cronogramaFile = first(files.cronograma);
  const matriculasFile = first(files.matriculas);
  if (!cronogramaFile || !matriculasFile) {
    res.status(400).json({ error: 'missing_files', message: 'Envie os dois arquivos: Cronograma e Planilha Master.' });
    return;
  }

  try {
    const cronogramaWb = await loadWorkbook(cronogramaFile.filepath);
    const matriculasWb = await loadWorkbook(matriculasFile.filepath);

    const { turmas: rawTurmas, errors } = extractTurmas(cronogramaWb);
    const matriculas = extractMatriculas(matriculasWb);
    const eventosWorksheet = cronogramaWb.Sheets['Encontros Comunidades'];

    const dashboard = buildDashboard({ rawTurmas, matriculas, eventosWorksheet, now: new Date() });

    await put('dashboard-data.json', JSON.stringify(dashboard), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
    });

    const statusCounts = {};
    for (const t of dashboard.turmas) statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;

    res.status(200).json({
      ok: true,
      gerado_em: dashboard.gerado_em,
      total_turmas: dashboard.turmas.length,
      status: statusCounts,
      eventos: dashboard.eventos_comunidades.length,
      parse_errors: errors,
    });
  } catch (e) {
    res.status(500).json({ error: 'processing_failed', message: e.message });
  } finally {
    for (const f of [cronogramaFile, matriculasFile]) {
      if (f && f.filepath) fs.unlink(f.filepath).catch(() => {});
    }
  }
};
