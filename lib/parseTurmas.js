'use strict';

// Port of pipeline/extract_turmas.py — same block-detection algorithm, operating
// on the padded grid from xlsxGrid.sheetToGrid() instead of a calamine grid.

const { sheetToGrid, norm } = require('./xlsxGrid');
const { isoDate, isoFromJsDate } = require('./dateUtils');

const MESES = {
  janeiro: 1, fevereiro: 2, março: 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

// Returns [isoDateOrNull, rawWeekdayOrUnparsedTextOrNull] — mirrors parse_date()
// in extract_turmas.py, including its fall-through when a month name doesn't
// match (falls to the DD/MM/YYYY check) rather than short-circuiting.
function parseDate(v) {
  if (v === null || v === undefined || v === '') return [null, null];
  if (v instanceof Date) return [isoFromJsDate(v), null];
  if (typeof v !== 'string') return [null, null];

  const s = v.trim();

  let m = /(\d{1,2})\s*de\s*([a-zçãéêô]+)\s*de\s*(\d{4})/i.exec(s);
  if (m) {
    const day = parseInt(m[1], 10);
    const mesName = m[2].toLowerCase();
    const year = parseInt(m[3], 10);
    const mes = MESES[mesName];
    if (mes) {
      const iso = isoDate(year, mes, day);
      if (iso) {
        const weekday = s.indexOf(',') !== -1 ? s.split(',')[0].trim() : null;
        return [iso, weekday];
      }
      return [null, s];
    }
  }

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    let d = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    const iso = isoDate(y, mo, d);
    if (iso) return [iso, null];
    return [null, s];
  }

  const upper = s.toUpperCase();
  if (upper === 'XXXX' || upper === 'TBD' || upper === '') return [null, null];
  return [null, s];
}

function findBlocks(rows) {
  const blocks = [];
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    let c = 0;
    while (c < row.length) {
      const val = norm(row[c]);
      if (typeof val === 'string' && val.toLowerCase() === 'data') {
        const headers = [];
        let cc = c;
        while (cc < row.length) {
          const v = norm(row[cc]);
          if (v === '') {
            const nxt = cc + 1 < row.length ? norm(row[cc + 1]) : '';
            if (nxt === '' || (typeof nxt === 'string' && nxt.toLowerCase() === 'data')) break;
            headers.push('');
            cc += 1;
            continue;
          }
          if (typeof v === 'string' && v.toLowerCase() === 'data' && cc !== c) break;
          headers.push(v);
          cc += 1;
        }
        blocks.push({ row: r, col: c, width: cc - c, headers });
        c = cc;
      } else {
        c += 1;
      }
    }
  }
  return blocks;
}

function colRangeOverlaps(a, b) {
  const aStart = a.col, aEnd = a.col + Math.max(a.width, 6);
  const bStart = b.col, bEnd = b.col + Math.max(b.width, 6);
  return !(aEnd <= bStart || bEnd <= aStart);
}

function extractSheetGrid(rows, programLabel) {
  const nrows = rows.length;
  const blocks = findBlocks(rows);
  const turmas = [];

  for (let i = 0; i < blocks.length; i++) {
    const blk = blocks[i];
    const r = blk.row, c = blk.col, headers = blk.headers;

    let title = null;
    for (const back of [1, 2, 3]) {
      const rrUp = r - back;
      if (rrUp < 0) break;
      const rowUp = rows[rrUp];
      const start = Math.max(0, c - 2);
      const end = Math.min(rowUp.length, c + headers.length + 4);
      for (let cc = start; cc < end; cc++) {
        const cand = norm(rowUp[cc]);
        if (cand && !(typeof cand === 'string' && /^https?:\/\//i.test(cand))) {
          title = cand;
          break;
        }
      }
      if (title) break;
    }

    let endRow = nrows;
    let fallbackRow = null;
    let brokeInner = false;
    for (let j = i + 1; j < blocks.length; j++) {
      const other = blocks[j];
      if (other.row > r) {
        if (fallbackRow === null) fallbackRow = other.row;
        if (colRangeOverlaps(blk, other)) {
          endRow = other.row - 1;
          brokeInner = true;
          break;
        }
      }
    }
    if (!brokeInner && fallbackRow !== null) endRow = fallbackRow - 1;

    const colStart = c, colEnd = c + headers.length;
    const aulas = [];
    let blankStreak = 0;
    let lastDateIso = null;
    let lastDateRaw = null;
    let rr = r + 1;

    while (rr < Math.min(endRow, nrows)) {
      const row = rows[rr];
      const segment = [];
      for (let cc = colStart; cc < colEnd; cc++) segment.push(cc < row.length ? norm(row[cc]) : '');

      if (segment.every((x) => x === '')) {
        blankStreak += 1;
        if (blankStreak >= 2) break;
        rr += 1;
        continue;
      }
      blankStreak = 0;

      const rowdict = {};
      for (let k = 0; k < headers.length; k++) rowdict[headers[k]] = segment[k];

      const rawDate = Object.prototype.hasOwnProperty.call(rowdict, 'Data') ? rowdict.Data : '';
      let iso = null, rawTxt = null;
      if (rawDate !== '') [iso, rawTxt] = parseDate(rawDate);

      if (iso) {
        lastDateIso = iso;
        lastDateRaw = typeof rawDate === 'string' ? rawDate : null;
      } else if (rawTxt) {
        lastDateRaw = rawTxt;
        lastDateIso = null;
      }

      const disciplina = rowdict.Disciplina || rowdict.Disciplinas || '';
      const facilitador = rowdict.Facilitador || '';
      const horario = rowdict['Horário'] || rowdict.Horario || '';

      if (disciplina || facilitador || horario) {
        aulas.push({
          data: rawDate !== '' ? iso : lastDateIso,
          data_raw: typeof rawDate === 'string' && rawDate ? rawDate : lastDateRaw,
          dia: rowdict.Dia || '',
          horario,
          disciplina,
          facilitador,
          confirmacao: rowdict['Confirmação'] || '',
          mediador: rowdict.Mediador || '',
        });
      }
      rr += 1;
    }

    if (aulas.length > 0 && title) {
      turmas.push({ programa: programLabel, turma: title, aulas });
    }
  }

  return turmas;
}

const TARGETS = [
  ['PFIC ', 'PFIC'],
  ['PFCC', 'PFCC'],
  ['PFCC LATAM', 'PFCC LATAM'],
  ['ABP', 'ABP'],
  ['Lean Governance', 'Lean Governance'],
  ['Board 360', 'Board 360'],
  ['CES', 'CES'],
  ['Sprint', 'Board Sprint'],
];

function extractTurmas(workbook) {
  const allTurmas = [];
  const errors = [];
  for (const [sheetName, label] of TARGETS) {
    try {
      const ws = workbook.Sheets[sheetName];
      if (!ws) throw new Error(`sheet not found: ${sheetName}`);
      const grid = sheetToGrid(ws);
      const turmas = extractSheetGrid(grid, label);
      allTurmas.push(...turmas);
    } catch (e) {
      errors.push(`${label}: ${e.message}`);
    }
  }
  return { turmas: allTurmas, errors };
}

module.exports = { extractTurmas, extractSheetGrid, parseDate, findBlocks, TARGETS };
