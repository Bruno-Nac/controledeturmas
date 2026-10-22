'use strict';

// Parses "Ocupação de Turmas vNN.xlsx" — the weekly analysis of how enrollment
// is going (PROGRAMAS sheet: one row per turma with min/ideal/current,
// percentage, weekly delta and the risk/trend label). It is the *analysis*
// layer: the official enrollment numbers live in the Master
// (parseMatriculas.js), so buildDashboard.js only falls back to the numbers
// here for turmas the Master doesn't have, and always uses this file for the
// risk/trend reading ("analise").
//
// The sheet's own "PROGRAMA" column mixes the product with schedule/
// modality info ("PFCC MX  2ª/4ª", "ABP Online  3ª/5ª", "CNP Pres. T.
// Presencial"...) instead of the plain canonical names parseTurmas.js uses
// ("PFCC LATAM", "ABP", "CNP"...) — mapPrograma() below normalizes that.

const { sheetToGrid, norm } = require('./xlsxGrid');
const { isoDate, isoFromJsDate } = require('./dateUtils');

const SHEET_NAME = 'PROGRAMAS';

// Longest/most-specific pattern first, since e.g. "PFCC MX" must not fall
// through to the plain "PFCC" rule.
const PROGRAM_RULES = [
  [/^CNP\b/i, 'CNP'],
  [/PFCC\s*MX/i, 'PFCC LATAM'],
  [/PFCC\s*LATAM/i, 'PFCC LATAM'],
  [/PFCC/i, 'PFCC'],
  [/^ABP/i, 'ABP'],
  [/Lean\s*Governance/i, 'Lean Governance'],
  [/^PFIC/i, 'PFIC'],
  [/Board\s*Sprint/i, 'Board Sprint'],
  [/Board\s*360/i, 'Board 360'],
  [/^CES/i, 'CES'],
  [/IA\s*na\s*Pr[aá]tica/i, 'IA na Prática'],
  [/LinkedIn/i, 'LinkedIn Program'],
  [/Advisor\s*Program/i, 'Advisor Program'],
  [/MBAI/i, 'MBAI'],
  [/B2B/i, 'B2B'],
];

function mapPrograma(rawLabel) {
  const s = (rawLabel || '').trim();
  for (const [pat, canonical] of PROGRAM_RULES) {
    if (pat.test(s)) return canonical;
  }
  return null;
}

function cellStr(v) {
  return typeof v === 'string' ? v.trim() : v;
}

// "T40", "T01", "T7" -> 40 / 1 / 7. Returns null if the code doesn't look
// like "T<digits>".
function turmaCodeNumero(code) {
  if (typeof code !== 'string') return null;
  const m = /^T\s*0*(\d+)$/i.exec(code.trim());
  return m ? parseInt(m[1], 10) : null;
}

// Ocupação's "início" column is date-formatted for most rows but a few slip
// through as raw serial numbers or as "12/dez" without a year — same drift
// pattern already seen in the Cronograma workbook.
function parseInicio(v, anoBase) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isoFromJsDate(v);
  if (typeof v === 'number') {
    // Excel serial date (days since 1899-12-30), matches XLSX's own epoch.
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return isoFromJsDate(new Date(ms));
  }
  if (typeof v === 'string') {
    const s = v.trim();
    const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (iso) return isoDate(parseInt(iso[1], 10), parseInt(iso[2], 10), parseInt(iso[3], 10));
    const m = /^(\d{1,2})\/(\d{1,2}|[a-zç]{3})\.?(?:\/(\d{2,4}))?$/i.exec(s);
    if (m) {
      const d = parseInt(m[1], 10);
      const mo = /^\d+$/.test(m[2]) ? parseInt(m[2], 10) : MES_ABREV[m[2].toLowerCase()];
      if (!mo) return null;
      if (m[3]) {
        const y = parseInt(m[3], 10);
        return isoDate(y < 100 ? y + 2000 : y, mo, d);
      }
      // No year in the source ("14/out"): use the semester's year when the
      // workbook states it (DASH title, "2º Semestre 2026"); otherwise take
      // the year that puts the date closest to today.
      if (anoBase) return isoDate(anoBase, mo, d);
      const now = new Date();
      let y = now.getFullYear();
      const diff = mo - (now.getMonth() + 1);
      if (diff > 6) y -= 1;
      else if (diff < -6) y += 1;
      return isoDate(y, mo, d);
    }
  }
  return null;
}

// "% ATUAL" arrives as text ("98%") in these sheets, but a real percentage
// cell would arrive as a fraction (0.98) — accept both.
function parsePercent(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  if (typeof v === 'string') {
    const m = /(-?\d+(?:[.,]\d+)?)\s*%/.exec(v);
    if (m) return Math.round(parseFloat(m[1].replace(',', '.')));
  }
  return null;
}

// The Ocupação's semáforo, reproduced from the numbers so the dashboard can
// classify every turma that has a minimum/ideal/enrollment — checked against
// all 45 rows of the sheet (45/45 identical): lotada at or above the ideal;
// risco at or below the minimum; otherwise saudável from 75% of the ideal and
// atenção below that. ("Em construção" is on the sheet's legend but never
// used: atenção covers everything between the minimum and 75%.)
function nivelOcupacao(min, ideal, atual) {
  if (typeof atual !== 'number' || typeof ideal !== 'number' || !(ideal > 0)) return null;
  if (atual >= ideal) return 'lotado';
  if (typeof min === 'number' && atual <= min) return 'risco';
  return atual / ideal >= 0.75 ? 'saudavel' : 'atencao';
}

const MES_ABREV = {
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

// The Ocupação's own read of a turma — what the dashboard shows as analysis.
// `nivel` is the semáforo label without emoji/accents ("🔴 Risco" -> "risco",
// "🟡 Em construção" -> "em_construcao") so the front-end can key styles on it.
function analiseOf(rec) {
  const nivel = (rec.tendencia || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z ]/g, '').trim().toLowerCase().replace(/\s+/g, '_') || null;
  return {
    nivel,
    tendencia: rec.tendencia || '',
    percent_atual: rec.percent_atual,
    delta_semana: rec.deltaSemana || '',
  };
}

function findHeaderRow(grid) {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r].map(cellStr);
    if (row.some((c) => c === 'PROGRAMA') && row.some((c) => c === 'TURMA')) return r;
  }
  return -1;
}

// Year of the semester, read from the DASH title ("... 2º Semestre 2026").
function detectAno(workbook) {
  const ws = workbook.Sheets.DASH;
  if (!ws) return null;
  const grid = sheetToGrid(ws);
  for (let r = 0; r < Math.min(grid.length, 3); r++) {
    for (const v of grid[r]) {
      const m = typeof v === 'string' ? /\b(20\d{2})\b/.exec(v) : null;
      if (m) return parseInt(m[1], 10);
    }
  }
  return null;
}

// Plain-text form for label matching: no emoji, accents or repeated spaces.
function plain(v) {
  return typeof v === 'string'
    ? v.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9()%º ]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
    : '';
}

const KPI_LABELS = [
  ['em_risco', /^em risco$/],
  ['saudaveis', /^saudaveis$/],
  ['lotadas', /^lotadas$/],
  ['total_turmas', /^total turmas/],
  ['alunos', /^alunos \(semana vigente\)/],
  ['em_verificacao', /^em verificacao 2026 \(sem turma/],
  ['total_geral', /^total geral$/],
  ['alunos_ideal', /^alunos \(ideal\)/],
  ['alunos_diferenca', /^alunos \(diferenca\)/],
];

// The workbook's own overview (DASH: totals and the week in force) and the
// week-by-week enrollment history of every turma (EVOLUÇÃO). Both are
// optional: if either sheet is missing or reshaped, the rest of the pipeline
// keeps working and the problem is reported through `errors`.
function extractPainel(workbook, anoBase, errors) {
  const painel = { semana_vigente: null, semana_rotulo: null, ano_base: anoBase, kpis: {}, semanas: [], turmas: [], em_verificacao: [] };

  const dash = workbook.Sheets.DASH;
  if (dash) {
    const g = sheetToGrid(dash);
    for (let r = 0; r < g.length; r++) {
      for (let c = 0; c < g[r].length; c++) {
        const raw = g[r][c];
        if (typeof raw !== 'string') continue;
        const sv = /semana vigente:?\s*(.+)$/i.exec(raw);
        if (sv && !painel.semana_rotulo) {
          painel.semana_rotulo = sv[1].trim();
          painel.semana_vigente = parseInicio(sv[1].trim(), anoBase);
        }
        const p = plain(raw);
        for (const [key, pat] of KPI_LABELS) {
          if (key in painel.kpis || !pat.test(p)) continue;
          const val = g[r + 1] ? g[r + 1][c] : null;
          if (typeof val === 'number') painel.kpis[key] = val;
        }
      }
    }
  } else {
    errors.push('painel: aba DASH não encontrada na Ocupação');
  }

  const evo = workbook.Sheets['EVOLUÇÃO'];
  if (!evo) {
    errors.push('painel: aba EVOLUÇÃO não encontrada na Ocupação');
    return painel;
  }
  const g = sheetToGrid(evo);
  const hr = g.findIndex((row) => row.some((c) => cellStr(c) === 'PROGRAMA') && row.some((c) => /HOJE/i.test(String(c || ''))));
  if (hr === -1) {
    errors.push('painel: cabeçalho (PROGRAMA ... HOJE) não encontrado na aba EVOLUÇÃO');
    return painel;
  }
  const h = g[hr].map((x) => cellStr(norm(x)));
  const iPrograma = h.indexOf('PROGRAMA');
  const iTurma = h.indexOf('TURMA');
  const iInicio = h.findIndex((x) => x === 'INÍCIO');
  const iMin = h.findIndex((x) => /^M[IÍ]N\.?$/i.test(x));
  const iIdeal = h.indexOf('IDEAL');
  const iHoje = h.findIndex((x) => /HOJE/i.test(String(x)));
  const iPct = h.findIndex((x, i) => i > iHoje && /^%/.test(String(x)));
  const iDelta = h.findIndex((x, i) => i > iHoje && /SEMANA/i.test(String(x)));
  const iTend = h.findIndex((x, i) => i > iHoje && /TEND/i.test(String(x)));

  const weekCols = [];
  for (let c = iIdeal + 1; c < iHoje; c++) {
    const iso = parseInicio(g[hr][c], anoBase);
    if (iso) { weekCols.push(c); painel.semanas.push(iso); }
  }
  const serieDe = (row) => weekCols.map((c) => (typeof row[c] === 'number' ? row[c] : null));

  for (let r = hr + 1; r < g.length; r++) {
    const row = g[r];
    const programaRaw = cellStr(row[iPrograma]);
    if (typeof programaRaw !== 'string' || !programaRaw) continue;
    const ver = /EM VERIFICA[CÇ][AÃ]O\s*(20\d{2})/i.exec(programaRaw);
    if (ver) {
      painel.em_verificacao.push({ rotulo: ver[1], atual: typeof row[iHoje] === 'number' ? row[iHoje] : null, serie: serieDe(row) });
      continue;
    }
    const turmaCodigo = cellStr(row[iTurma]);
    if (!turmaCodigo) continue;
    const min = typeof row[iMin] === 'number' ? row[iMin] : null;
    const ideal = typeof row[iIdeal] === 'number' ? row[iIdeal] : null;
    const atual = typeof row[iHoje] === 'number' ? row[iHoje] : null;
    painel.turmas.push({
      programa: mapPrograma(programaRaw),
      programa_raw: programaRaw.replace(/\s+/g, ' '),
      turma_codigo: String(turmaCodigo),
      inicio: parseInicio(row[iInicio], anoBase),
      min,
      ideal,
      atual,
      percent_atual: iPct >= 0 ? parsePercent(row[iPct]) : null,
      delta_semana: iDelta >= 0 ? String(cellStr(row[iDelta]) ?? '') : '',
      tendencia: iTend >= 0 ? String(cellStr(row[iTend]) ?? '') : '',
      nivel: nivelOcupacao(min, ideal, atual),
      serie: serieDe(row),
    });
  }
  return painel;
}

// Returns { records, byKey, errors, painel }.
//   records: every parsed row, including ones we couldn't canonicalize
//            (programa: null) or number-match (turmaNumero: null) — kept so
//            buildDashboard.js can still try a date-proximity match and so
//            unmatched rows can be surfaced instead of silently dropped.
//   byKey:   records with a resolved `${programa}|${numero}` key, in the
//            exact shape parseMatriculas.js produces, for direct reuse by
//            the existing matricula-lookup path in buildDashboard.js.
function extractOcupacao(workbook) {
  const ws = workbook.Sheets[SHEET_NAME];
  if (!ws) throw new Error(`sheet not found: ${SHEET_NAME}`);
  const grid = sheetToGrid(ws);
  const anoBase = detectAno(workbook);

  const headerRow = findHeaderRow(grid);
  if (headerRow === -1) throw new Error('header row (PROGRAMA...TENDÊNCIA) not found in PROGRAMAS');

  const headers = grid[headerRow].map((h) => cellStr(norm(h)));
  const col = (name) => headers.findIndex((h) => h === name);
  const idx = {
    programa: col('PROGRAMA'),
    turma: col('TURMA'),
    inicio: col('INÍCIO'),
    min: headers.findIndex((h) => /^M[IÍ]N\.?$/i.test(h)),
    ideal: col('IDEAL'),
    atual: headers.findIndex((h) => /^ALUNOS/i.test(h)),
    percent: headers.findIndex((h) => /^%/i.test(h)),
    tendencia: col('TENDÊNCIA'),
    delta: headers.findIndex((h) => /SEMANA/i.test(h)),
  };
  if (idx.programa === -1 || idx.turma === -1) {
    throw new Error('required columns (PROGRAMA/TURMA) not found in PROGRAMAS header');
  }

  const records = [];
  const errors = [];

  for (let r = headerRow + 1; r < grid.length; r++) {
    const row = grid[r];
    const programaRaw = cellStr(row[idx.programa]);
    const turmaCodigo = cellStr(row[idx.turma]);
    if (!programaRaw && !turmaCodigo) continue; // blank row
    if (!programaRaw || !turmaCodigo) continue; // stray fragment (legend, footer count, ...)

    const programa = mapPrograma(programaRaw);
    if (!programa) {
      errors.push(`programa não reconhecido: "${programaRaw}" (turma ${turmaCodigo})`);
    }

    const numero = turmaCodeNumero(turmaCodigo);
    const percentAtual = idx.percent >= 0 ? parsePercent(row[idx.percent]) : null;

    // CNP Presencial and CNP Online are two independent numbering series
    // (Presencial sessions 40-57, Online sessions 10-15) that can collide
    // on number alone, so they get separate match keys.
    const matchPrograma = programa === 'CNP'
      ? (/^CNP\s*Online/i.test(programaRaw) ? 'CNP Online' : 'CNP Presencial')
      : programa;

    records.push({
      programa,
      matchPrograma,
      programaRaw,
      turmaCodigo,
      turmaNumero: numero,
      inicio: idx.inicio >= 0 ? parseInicio(row[idx.inicio], anoBase) : null,
      min: typeof row[idx.min] === 'number' ? row[idx.min] : null,
      ideal: typeof row[idx.ideal] === 'number' ? row[idx.ideal] : null,
      atual: typeof row[idx.atual] === 'number' ? row[idx.atual] : null,
      percent_atual: percentAtual,
      tendencia: idx.tendencia >= 0 ? cellStr(row[idx.tendencia]) : '',
      deltaSemana: idx.delta >= 0 ? cellStr(row[idx.delta]) : '',
    });
  }

  const byKey = {};
  for (const rec of records) {
    if (rec.programa === null || rec.turmaNumero === null) continue;
    byKey[`${rec.matchPrograma}|${rec.turmaNumero}`] = {
      min: rec.min,
      max: rec.ideal,
      atual: rec.atual,
      faltam_para_minimo: rec.min !== null ? Math.max(0, rec.min - (rec.atual || 0)) : null,
      dias_para_comecar: null,
      modalidade_ctrl: null,
      turma_codigo: rec.turmaCodigo,
      programa: rec.programa,
      inicio: rec.inicio,
      analise: analiseOf(rec),
    };
  }

  let painel = null;
  try {
    painel = extractPainel(workbook, anoBase, errors);
  } catch (e) {
    errors.push(`painel: ${e.message}`);
  }

  return { records, byKey, errors, painel };
}

module.exports = { extractOcupacao, mapPrograma, turmaCodeNumero, parseInicio, parsePercent, nivelOcupacao, PROGRAM_RULES };
