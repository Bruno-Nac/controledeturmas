'use strict';

// Port of pipeline/build_dashboard_data.py's merge/status/events logic.

const { sheetToGrid, norm } = require('./xlsxGrid');
const { isoDate, isoFromJsDate } = require('./dateUtils');

const PROGRAM_ORDER = ['PFCC', 'CES', 'Lean Governance', 'Board 360', 'ABP', 'PFCC LATAM', 'PFIC', 'Board Sprint'];
const PROGRAM_LABELS = {
  PFCC: 'Programa de Formação e Certificação de Conselheiros - PFCC',
  CES: 'Conselho Empresarial da Saúde - CES',
  'Lean Governance': 'Lean Governance',
  'Board 360': 'Board 360',
  ABP: 'Advanced Board Program - ABP',
  'PFCC LATAM': 'Programa de Formación y Certificación de Consejeros Latam',
  PFIC: 'Programa de Finanças para Conselheiros - PFIC',
  'Board Sprint': 'Board Sprint',
};

const EXCLUDE_PATTERNS = /cancelad|rascunho/i;

const NUM_PATTERNS = {
  PFCC: /PFCC(\d+)/,
  'PFCC LATAM': /PFCC(\d+)/,
  CES: /CES(\d+)/,
  ABP: /ABP(\d+)/,
  'Board Sprint': /Turma (\d+)/,
  'Lean Governance': /Turma (\d+)/,
  PFIC: /Turma (\d+)/,
  'Board 360': /^T(\d+)/,
};

const MESES = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const COMUNIDADES_SERIES = ['Board Select', 'Lean Board na Prática', 'Health Board Meeting', 'AI Business Community'];

function modalidadeFromTitle(title) {
  const t = title.toLowerCase();
  if (t.includes('presencial')) return 'Presencial';
  if (t.includes('online')) return 'Online';
  return '';
}

function cleanTitle(title) {
  return title.replace(/\s+/g, ' ').trim();
}

function turmaNumero(programa, titulo) {
  const pat = NUM_PATTERNS[programa];
  if (!pat) return null;
  const m = pat.exec(titulo);
  return m ? parseInt(m[1], 10) : null;
}

function lookupMatricula(matriculas, programa, titulo) {
  const num = turmaNumero(programa, titulo);
  if (num === null) return null;
  return matriculas[`${programa}|${num}`] || null;
}

function progKey(p) {
  const idx = PROGRAM_ORDER.indexOf(p);
  return idx === -1 ? PROGRAM_ORDER.length : idx;
}

function slugify(programa, turma) {
  return `${programa}-${turma}`
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function buildTurmas(rawTurmas, matriculas, todayIso) {
  const turmasOut = [];
  const skipped = [];
  let matchedCount = 0;

  for (const t of rawTurmas) {
    if (EXCLUDE_PATTERNS.test(t.turma)) {
      skipped.push(`${t.programa} | ${t.turma}`);
      continue;
    }
    const dates = t.aulas.map((a) => a.data).filter(Boolean).sort();
    let dataInicio = null, dataFim = null, status;
    if (dates.length) {
      dataInicio = dates[0];
      dataFim = dates[dates.length - 1];
      if (dataInicio >= todayIso) status = 'futura';
      else if (dataFim < todayIso) status = 'concluida';
      else status = 'andamento';
    } else {
      status = 'sem_data';
    }

    const aulasSorted = t.aulas.slice().sort((a, b) => {
      const da = a.data || '9999-99-99', db = b.data || '9999-99-99';
      return da < db ? -1 : da > db ? 1 : 0;
    });

    const mat = lookupMatricula(matriculas, t.programa, t.turma);
    let matriculasOut = null;
    if (mat && (mat.min !== null || mat.max !== null || mat.atual !== null)) {
      matchedCount += 1;
      const atual = mat.atual || 0;
      const minimo = mat.min, maximo = mat.max;
      let capStatus;
      if (minimo !== null && maximo !== null && (minimo > 0 || maximo > 0)) {
        capStatus = atual >= (minimo || 0) ? 'atingido' : 'abaixo';
      } else {
        capStatus = 'sem_config';
      }
      matriculasOut = {
        min: minimo,
        max: maximo,
        atual: mat.atual,
        faltam_para_minimo: mat.faltam_para_minimo,
        status_capacidade: capStatus,
      };
    }

    turmasOut.push({
      id: slugify(t.programa, t.turma),
      programa: t.programa,
      turma: cleanTitle(t.turma),
      modalidade: modalidadeFromTitle(t.turma),
      status,
      data_inicio: dataInicio,
      data_fim: dataFim,
      total_aulas: t.aulas.length,
      matriculas: matriculasOut,
      aulas: aulasSorted.map((a) => ({
        data: a.data,
        data_raw: a.data_raw,
        dia: a.dia,
        horario: a.horario,
        disciplina: a.disciplina,
        facilitador: a.facilitador,
      })),
    });
  }

  turmasOut.sort((a, b) => {
    const ka = progKey(a.programa), kb = progKey(b.programa);
    if (ka !== kb) return ka - kb;
    const da = a.data_inicio || '9999', db = b.data_inicio || '9999';
    return da < db ? -1 : da > db ? 1 : 0;
  });

  return { turmasOut, skipped, matchedCount };
}

function parseEvtDate(v) {
  if (v instanceof Date) return isoFromJsDate(v);
  if (typeof v === 'string') {
    const m = /(\d{1,2})\s*de\s*([a-zçãéêô]+)\s*de\s*(\d{4})/i.exec(v);
    if (m) {
      const day = parseInt(m[1], 10);
      const mesName = m[2].toLowerCase();
      const year = parseInt(m[3], 10);
      const mes = MESES[mesName];
      if (mes) return isoDate(year, mes, day);
    }
  }
  return null;
}

function extractEventos(worksheet, now) {
  if (!worksheet) return [];
  const grid = sheetToGrid(worksheet);

  const sections = [];
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i];
    const nonempty = row.filter((c) => norm(c) !== '');
    if (nonempty.length === 1 && typeof nonempty[0] === 'string' && norm(row[0]) === nonempty[0]) {
      sections.push([i, norm(row[0])]);
    }
  }

  const cutoff = isoDate(now.getFullYear(), now.getMonth() + 1, 1);
  const eventos = [];

  for (let idx = 0; idx < sections.length; idx++) {
    const [rowI, serie] = sections[idx];
    const headerI = rowI + 1;
    const headers = (grid[headerI] || []).map(norm);
    const endI = idx + 1 < sections.length ? sections[idx + 1][0] : grid.length;

    for (let r = headerI + 1; r < endI; r++) {
      const row = grid[r] || [];
      const vals = {};
      for (let k = 0; k < headers.length; k++) vals[headers[k]] = norm(row[k]);
      const dataVal = vals.Data;
      if (dataVal === '' || dataVal === undefined || dataVal === null) continue;
      const iso = parseEvtDate(dataVal);
      if (!iso || iso < cutoff) continue;
      eventos.push({
        serie,
        data: iso,
        status: vals.Status || '',
        convidado: vals.Convidado || '',
        tema: vals.Tema || '',
        programas: vals['Programas que participam'] || '',
      });
    }
  }

  eventos.sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    const ia = COMUNIDADES_SERIES.includes(a.serie) ? COMUNIDADES_SERIES.indexOf(a.serie) : 9;
    const ib = COMUNIDADES_SERIES.includes(b.serie) ? COMUNIDADES_SERIES.indexOf(b.serie) : 9;
    return ia - ib;
  });

  return eventos;
}

function buildDashboard({ rawTurmas, matriculas, eventosWorksheet, now = new Date() }) {
  const todayIso = isoDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const { turmasOut } = buildTurmas(rawTurmas, matriculas, todayIso);
  const eventos = extractEventos(eventosWorksheet, now);
  return {
    gerado_em: now.toISOString(),
    fonte_arquivo: 'Cronograma 2026 - Turmas.xlsx',
    program_order: PROGRAM_ORDER,
    program_labels: PROGRAM_LABELS,
    comunidades_series: COMUNIDADES_SERIES,
    turmas: turmasOut,
    eventos_comunidades: eventos,
  };
}

module.exports = {
  buildDashboard,
  buildTurmas,
  extractEventos,
  PROGRAM_ORDER,
  PROGRAM_LABELS,
};
