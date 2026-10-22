'use strict';

// Automatic refresh: pulls the three source workbooks from Microsoft 365 and
// republishes the dashboard, with nobody uploading anything. Triggered by the
// hourly GitHub Actions workflow and the daily Vercel cron (both send
// "Authorization: Bearer $CRON_SECRET"), or by hand with the /admin password in
// x-admin-password (the "Atualizar dados agora" button in the Gestão view asks
// for it).

const { fetchSources, missingEnv } = require('../lib/graphSource');
const { runPipeline, summarize } = require('../lib/pipeline');
const { adminAutorizado } = require('../lib/access');

function authorized(req) {
  const bearer = req.headers.authorization;
  if (process.env.CRON_SECRET && bearer === `Bearer ${process.env.CRON_SECRET}`) return true;
  return adminAutorizado(req);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  if (!authorized(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }

  const missing = missingEnv();
  if (missing.length) {
    res.status(500).json({ error: 'server_not_configured', message: `Variáveis de ambiente ausentes: ${missing.join(', ')}` });
    return;
  }

  try {
    const sources = await fetchSources();
    const { dashboard, parseErrors } = await runPipeline(sources);
    res.status(200).json(summarize(dashboard, parseErrors));
  } catch (e) {
    res.status(502).json({ error: 'sync_failed', message: e.message });
  }
};
