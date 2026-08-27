const fs = require('fs');
const XLSX = require('xlsx');
const { extractTurmas } = require('../lib/parseTurmas');
const { extractMatriculas } = require('../lib/parseMatriculas');
const { buildDashboard } = require('../lib/buildDashboard');

const CRONOGRAMA = process.argv[2];
const MATRICULAS = process.argv[3];

function loadWorkbook(p) {
  return XLSX.read(fs.readFileSync(p), { type: 'buffer', cellDates: true });
}

const cronogramaWb = loadWorkbook(CRONOGRAMA);
const matriculasWb = loadWorkbook(MATRICULAS);

const { turmas: rawTurmas, errors } = extractTurmas(cronogramaWb);
const matriculas = extractMatriculas(matriculasWb);
const eventosWorksheet = cronogramaWb.Sheets['Encontros Comunidades'];

const dashboard = buildDashboard({ rawTurmas, matriculas, eventosWorksheet, now: new Date() });

const statusCounts = {};
const progCounts = {};
let comMatriculas = 0;
for (const t of dashboard.turmas) {
  statusCounts[t.status] = (statusCounts[t.status] || 0) + 1;
  progCounts[t.programa] = (progCounts[t.programa] || 0) + 1;
  if (t.matriculas) comMatriculas++;
}

console.log('errors:', errors);
console.log('total turmas (pos-exclusao):', dashboard.turmas.length);
console.log('status:', statusCounts);
console.log('por programa:', progCounts);
console.log('turmas com matriculas cruzadas:', comMatriculas);
console.log('total eventos:', dashboard.eventos_comunidades.length);
console.log('series:', [...new Set(dashboard.eventos_comunidades.map((e) => e.serie))]);
console.log('program_labels.PFCC LATAM:', dashboard.program_labels['PFCC LATAM']);
console.log('sample turma:', JSON.stringify(dashboard.turmas.find((t) => t.status !== 'concluida'), null, 2).slice(0, 800));
