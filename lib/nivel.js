'use strict';

// The Ocupação's semáforo, reproduced from the numbers so every turma that has
// a minimum/ideal/enrollment can be classified — checked against all 45 rows of
// the Ocupação sheet (45/45 identical): lotada at or above the ideal; risco at
// or below the minimum; otherwise saudável from 75% of the ideal and atenção
// below that. ("Em construção" is on the sheet's legend but never used:
// atenção covers everything between the minimum and 75%.)
//
// Kept in its own tiny module (no spreadsheet library) so the API endpoints
// that classify turmas for restricted users don't have to load SheetJS.
function nivelOcupacao(min, ideal, atual) {
  if (typeof atual !== 'number' || typeof ideal !== 'number' || !(ideal > 0)) return null;
  if (atual >= ideal) return 'lotado';
  if (typeof min === 'number' && atual <= min) return 'risco';
  return atual / ideal >= 0.75 ? 'saudavel' : 'atencao';
}

module.exports = { nivelOcupacao };
