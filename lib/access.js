'use strict';

// Two views of the same data, chosen on the opening page:
//
//   gestao  — everything: enrollment numbers per turma, the Ocupação and
//             Análise sections, and the "Atualizar dados agora" button.
//   usuario — for the commercial team, who share their screen with clients:
//             the turmas and their schedule, but never enrollment numbers.
//             The only analytical information is each turma's situation
//             (risco / atenção / saudável / lotada), so the team knows which
//             turmas to prioritize.
//
// The "usuario" view is built here, on the server: the data it receives has
// the numbers already removed, so nothing sensitive is in that page's network
// traffic at all (hiding it on the page would not be enough).
//
// IMPORTANT: there is no password on this choice. "gestao" is just a request
// parameter, so it separates the screens but does not protect the numbers from
// someone who knows the address. If that protection is needed later, ask for a
// password before returning the "gestao" version in api/dashboard-data.js.

const { nivelOcupacao } = require('./nivel');

// Anything other than an explicit "gestao" gets the restricted version.
function perfilDe(req) {
  let valor = '';
  try {
    valor = new URL(req.url || '', 'http://localhost').searchParams.get('perfil') || '';
  } catch (e) {
    valor = (req.query && req.query.perfil) || '';
  }
  return String(valor).toLowerCase() === 'gestao' ? 'gestao' : 'usuario';
}

function dadosParaPerfil(perfil, data) {
  if (perfil === 'gestao') return { ...data, acesso: { papel: 'gestor', perfil: 'gestao' } };

  return {
    ...data,
    acesso: { papel: 'consulta', perfil: 'usuario' },
    ocupacao_painel: null,
    ocupacao_nao_vinculada: [],
    turmas: (data.turmas || []).map((t) => {
      const { matriculas, ...resto } = t;
      return {
        ...resto,
        matriculas: null,
        nivel: matriculas ? nivelOcupacao(matriculas.min, matriculas.max, matriculas.atual) : null,
      };
    }),
  };
}

// Actions that change data (refreshing it from SharePoint) still need the
// /admin password, since the page itself has no login.
function adminAutorizado(req) {
  const senha = req.headers && req.headers['x-admin-password'];
  return typeof senha === 'string' && senha.length > 0
    && !!process.env.UPLOAD_PASSWORD && senha === process.env.UPLOAD_PASSWORD;
}

module.exports = { perfilDe, dadosParaPerfil, adminAutorizado };
