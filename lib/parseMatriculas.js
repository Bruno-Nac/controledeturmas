'use strict';

// Port of pipeline/extract_matriculas.py.
//
// The Python original hardcodes the header row/column position
// (data[4][15:25]) because calamine's grid happened to align that way for
// this sheet. SheetJS trims leading all-blank columns from its output
// (this sheet's `!ref` starts at C1, not A1), which shifts every fixed index
// — so instead of hardcoding a position, we search the grid for the exact
// header sequence and read relative to wherever it actually is. This is
// strictly more robust than the original (survives column-layout drift too).

const { sheetToGrid } = require('./xlsxGrid');

const HEADER_SEQUENCE = [
  'FormacaoCodigo', 'Modalidade', 'Turma', 'DataInicio', 'DataFim',
  'MinAlunos', 'MaxAlunos', 'InscritosAtivos', 'DiasParaComecar', 'FaltamParaMinimo',
];

const CODE_TO_PROGRAMA = {
  ABP: 'ABP',
  B_SPRINT: 'Board Sprint',
  BOARD_360: 'Board 360',
  PFIC: 'PFIC',
  PFCC: 'PFCC',
  PFCC_MX: 'PFCC LATAM',
  PFCC_CH: 'PFCC LATAM',
  CES: 'CES',
  LEAN_GOVERNANCE: 'Lean Governance',
};

function trailingNumber(s) {
  if (typeof s !== 'string') return null;
  const m = /(\d+)\s*$/.exec(s.trim());
  return m ? parseInt(m[1], 10) : null;
}

// Python: isinstance(v, (int, float)) and v != '' — the `v != ''` half is
// always true for a real number in Python 3, so this reduces to a type check.
function numOrNone(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

function cellStr(v) {
  return typeof v === 'string' ? v.trim() : v;
}

function findHeaderBlock(grid) {
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r];
    for (let c = 0; c < row.length; c++) {
      if (cellStr(row[c]) !== 'FormacaoCodigo') continue;
      const slice = row.slice(c, c + HEADER_SEQUENCE.length).map(cellStr);
      if (HEADER_SEQUENCE.every((h, i) => slice[i] === h)) return { row: r, col: c };
    }
  }
  return null;
}

function extractMatriculas(workbook) {
  const ws = workbook.Sheets.CONFIGURACOES;
  if (!ws) throw new Error('sheet not found: CONFIGURACOES');
  const grid = sheetToGrid(ws);

  const headerPos = findHeaderBlock(grid);
  if (!headerPos) throw new Error('header row (FormacaoCodigo...FaltamParaMinimo) not found in CONFIGURACOES');

  const colStart = headerPos.col;
  const rows = [];
  for (let i = headerPos.row + 1; i < grid.length; i++) {
    const r = grid[i];
    const seg = r.slice(colStart, colStart + HEADER_SEQUENCE.length);
    if (!seg.some((x) => x !== null && x !== '')) continue;
    if (seg[0] === null || seg[0] === '') continue;
    const obj = {};
    for (let k = 0; k < HEADER_SEQUENCE.length; k++) obj[HEADER_SEQUENCE[k]] = seg[k];
    rows.push(obj);
  }

  const matriculas = {};
  for (const r of rows) {
    const programa = CODE_TO_PROGRAMA[r.FormacaoCodigo];
    if (!programa) continue;
    const num = trailingNumber(r.Turma);
    if (num === null) continue;
    matriculas[`${programa}|${num}`] = {
      min: numOrNone(r.MinAlunos),
      max: numOrNone(r.MaxAlunos),
      atual: numOrNone(r.InscritosAtivos),
      faltam_para_minimo: numOrNone(r.FaltamParaMinimo),
      dias_para_comecar: numOrNone(r.DiasParaComecar),
      modalidade_ctrl: r.Modalidade,
      turma_codigo: r.Turma,
    };
  }
  return matriculas;
}

module.exports = { extractMatriculas, trailingNumber };
