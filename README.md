# Painel de Turmas

Dashboard do cronograma de turmas e programas da Board Academy. Site estático (`index.html`) + funções serverless que processam as planilhas de origem e mantêm o painel atualizado — sem Python, sem SharePoint automatizado, sem depender de ninguém rodar comando nenhum.

## Como funciona

Fluxo manual (atalho — o fluxo automático está na próxima seção):

1. Alguém baixa as três planilhas mais recentes do SharePoint:
   - **Cronograma Oficial Board - Turmas.xlsx** — cronograma de aulas por turma, de todos os produtos ativos.
   - **Ocupação de Turmas.xlsx** — análise do andamento das inscrições (semáforo de risco, % do ideal, tendência semanal).
   - **Planilha_Master_Controle_Alunos_2026.xlsx** — controle de inscritos por turma e vendas (fonte oficial de inscritos, mínimo e ideal).
2. Abre `/admin` neste site, digita a senha e arrasta os três arquivos.
3. A função `/api/process` lê as planilhas, roda a mesma lógica de extração que os scripts Python faziam (portada e estendida para JavaScript, ver `lib/`), cruza as três e salva o resultado no Vercel Blob.
4. O painel (`/`) busca os dados de `/api/dashboard-data` a cada carregamento — sempre reflete o último upload, sem precisar de redeploy.

## Atualização automática (sem ninguém subir arquivo)

O painel se atualiza sozinho: um cron do Vercel busca as planilhas no Microsoft 365 e reprocessa. `/admin` continua funcionando como atalho manual, e turmas cadastradas à mão em `/admin` (origem `manual`) são preservadas a cada atualização.

### Configuração

`api/sync.js` baixa as 3 planilhas direto do SharePoint/OneDrive pela Microsoft Graph e reprocessa. Roda **de hora em hora** pelo GitHub Actions (veja "Atualização de hora em hora" abaixo), 1 vez por dia às 10h UTC (7h em Brasília) pelo cron do `vercel.json` como reforço, e a qualquer momento pelo botão **Atualizar dados agora** do gestor (ou `GET /api/sync` com o header `x-admin-password`).

Configuração única — exige um administrador do Microsoft 365 (Entra ID / Azure AD):

1. **Registrar um app** em *Microsoft Entra ID → App registrations → New registration* (qualquer nome, ex.: "Painel de Turmas"). Anote o *Directory (tenant) ID* e o *Application (client) ID*.
2. Em *Certificates & secrets*, criar um **client secret** e copiar o valor.
3. Em *API permissions → Microsoft Graph → Application permissions*, adicionar **`Files.Read.All`** e clicar em **Grant admin consent**. (Se o admin preferir restringir a só esses 3 arquivos/sites, `Sites.Selected` também funciona, concedendo acesso por site.)
4. No SharePoint/OneDrive, copiar o link de compartilhamento de cada uma das 3 planilhas (*Compartilhar → Copiar link*).
5. No Vercel (*Settings → Environment Variables*), cadastrar:

| Variável | Valor |
|---|---|
| `MS_TENANT_ID` | Directory (tenant) ID do passo 1 |
| `MS_CLIENT_ID` | Application (client) ID do passo 1 |
| `MS_CLIENT_SECRET` | secret do passo 2 |
| `SRC_CRONOGRAMA_URL` | link do *Cronograma Oficial Board - Turmas.xlsx* |
| `SRC_OCUPACAO_URL` | link da *Ocupação de Turmas.xlsx* |
| `SRC_MATRICULAS_URL` | link da *Planilha_Master_Controle_Alunos_2026.xlsx* |
| `CRON_SECRET` | qualquer string longa e aleatória (o Vercel a envia no cron) |

6. Redeploy. Para testar sem esperar o horário: `GET /api/sync` com `x-admin-password: <UPLOAD_PASSWORD>` — a resposta traz o mesmo resumo do upload manual.

### Atualização de hora em hora

O plano Hobby do Vercel só permite cron **diário** (um agendamento mais frequente faz o deploy falhar), então o cron do `vercel.json` roda 1 vez por dia como reforço e o **relógio de hora em hora é o GitHub Actions**: o arquivo `.github/workflows/atualizar-dados.yml` chama `/api/sync` com a chave `CRON_SECRET` todo início de hora (+7 minutos, em UTC).

Configuração única:
1. No GitHub, abra o repositório e vá em *Settings → Secrets and variables → Actions → New repository secret*. Nome: `CRON_SECRET`; valor: o **mesmo** texto da variável `CRON_SECRET` do Vercel. (Se não tiver mais o valor, gere um novo, troque nos dois lugares e faça Redeploy no Vercel.)
2. Garanta que o arquivo `.github/workflows/atualizar-dados.yml` está no repositório (pelo GitHub: *Add file → Create new file* e digite o caminho completo, com as barras).
3. Teste na hora em *Actions → Atualizar dados do painel → Run workflow*. A execução deve terminar verde e mostrar o resumo de turmas no log. Falhas aparecem em vermelho e o GitHub avisa por e-mail.

Observações: o GitHub pode atrasar alguns minutos um agendamento em horário de pico, e em repositórios **públicos** ele pausa os agendamentos depois de 60 dias sem nenhuma atividade no repositório (basta reativar na aba Actions). Com um plano Pro do Vercel, dá para trocar o `schedule` do `vercel.json` por `"0 * * * *"` e dispensar o GitHub Actions.

## Produtos cobertos

PFIC, PFCC, PFCC LATAM, ABP, Lean Governance, Board 360, CES, Board Sprint, MBAI, LinkedIn Program, Advisor Program, IA na Prática, B2B e CNP (Conselho na Prática — tratado como turma de sessão única, já que não é uma turma com disciplina/facilitador como as demais). Produtos com aba oculta/descontinuada no Cronograma (GRC, Empremax, Master Board, C-Level Program, Succession Program, AI Leadership Program, Global Program, PFCC FORTAL, ESG Starter, AI onBoard...) não entram — reavalie `lib/parseTurmas.js`'s `TARGETS` se algum desses voltar a ser mantido.

## O que o painel mostra (`index.html`)

Quatro seções, escolhidas pelas abas no topo (o endereço guarda a seção: `/#regua`, `/#prioridades`, `/#ocupacao`, `/#analise`):

- **Dados por turma** (`/#prioridades`) — para o time comercial saber quais turmas priorizar: lista as turmas ativas e futuras ordenadas por situação (**em risco** → **atenção** → **saudável** → **lotada**) com a prioridade de venda (alta, média, baixa, nenhuma). Mostra só a situação, sem números de alunos.

- **Turmas** — cards de cada turma com **inscritos / máximo**, mínimo, vagas livres e o nível da turma: **em risco** (alunos ≤ mínimo), **atenção** (acima do mínimo e abaixo de 75% do ideal), **saudável** (75% a 99% do ideal) e **lotada** (ideal ou mais). É a mesma regra do semáforo da planilha de Ocupação (conferida contra as 45 turmas dela: 45/45 iguais), aplicada a todas as turmas que têm mínimo/ideal/inscritos no Master. Os cartões de resumo no topo (ativas/futuras, em andamento, abaixo do mínimo, próxima aula e os quatro níveis) são clicáveis e funcionam como filtro; clicar de novo, ou em "Limpar filtro", desfaz.
- **Ocupação** — espelha as abas DASH e EVOLUÇÃO da planilha Ocupação de Turmas: totais da semana vigente, a tabela "status por turma" (ordenável, com minigráfico de evolução, clique abre a turma) e a evolução semanal de alunos por turma e no total. Vem de `ocupacao_painel` no JSON (`lib/parseOcupacao.js`, `extractPainel`).
- **Análise de turmas** — compara **todas** as turmas do Cronograma (realizadas, em andamento e futuras): resumo do recorte, comparativo por programa (ocupação média, % que atingiu o mínimo, duração, encontros), comparação turma a turma com barras, extremos de ocupação e turmas iniciadas por mês. Os números de inscritos vêm do Master e só existem de 2026 em diante, e a tela mostra a cobertura (quantas turmas têm dados).

O botão de tema (claro/escuro) fica no topo e lembra a escolha no navegador. O logo é `logo-b.png` (o "B" da Board), usado também no ícone da aba e na imagem exportada. Todo o painel é assinado como **Inteligência Comercial**.

## Página de abertura: Usuário e Gestão

Ao abrir o painel aparece uma página com dois botões, e cada um leva à sua visão. A escolha fica guardada na aba do navegador; o botão **Trocar de visão** (no topo) volta à abertura. Atalhos diretos: `/?perfil=usuario` e `/?perfil=gestao`.

| Visão | Para quem | O que mostra |
|---|---|---|
| **Usuário** | time comercial (tela compartilhada com clientes) | Turmas e calendário **sem números de inscritos**, e a aba **Dados por turma** (só a situação: risco, atenção, saudável, lotada) |
| **Gestão** | análise comercial | Tudo: inscritos e máximo de cada turma, abas Ocupação e Análise, e o botão **Atualizar dados agora** (pede a `UPLOAD_PASSWORD`) |

A separação é feita **no servidor** (`lib/access.js`): a visão Usuário recebe o JSON já sem nenhum número de inscritos, então nada sensível chega àquela tela (esconder só no visual não bastaria).

**Atenção: não há senha nem cadastro nesta etapa.** A escolha é só uma separação de telas: quem souber o endereço pode pedir `perfil=gestao`. Para proteger a Gestão de verdade depois, o ponto único é `api/dashboard-data.js` (exigir credencial antes de devolver `perfil=gestao`).

## Papel de cada planilha

- **Cronograma** — a lista oficial e 100% atualizada das turmas: define quais turmas existem, datas e aulas. Nada aparece no painel que não esteja nele.
- **Master** — controle de inscritos e vendas: é a fonte oficial de **inscritos, mínimo e ideal** de cada turma. Um mínimo/ideal `0` no Master significa meta ainda não cadastrada e cai para o valor da Ocupação.
- **Ocupação** — análise em cima dos inscritos: semáforo de risco, % do ideal e tendência semanal. No painel ela entra como `matriculas.analise`; os números só vêm dela quando o Master não tem a turma (`matriculas.fonte` indica a origem).

## Como o cruzamento da Ocupação funciona

`lib/parseOcupacao.js` lê a aba `PROGRAMAS` da planilha de Ocupação (uma linha por turma, todos os produtos) e normaliza o rótulo livre da coluna PROGRAMA ("PFCC MX 2ª/4ª", "ABP Online 3ª/5ª"...) para o nome canônico usado no Cronograma. `lib/buildDashboard.js` casa cada turma extraída do Cronograma com uma linha da Ocupação (para a análise) por número de turma primeiro ("PFCC116" ↔ "T116") e, se isso falhar, pela data de início mais próxima dentro do mesmo programa (tolerância de 10 dias) — como as duas planilhas são mantidas por pessoas diferentes, nomes e numeração às vezes divergem. Se uma linha da Ocupação não casar com nenhuma turma, ela aparece em `ocupacao_nao_vinculada` na resposta do upload — vale conferir essa lista depois de cada atualização.

## Setup necessário no Vercel (uma vez só)

1. **Vercel Blob**: no projeto, vá em `Storage` → `Create Database` → `Blob` e conecte ao projeto. Isso cria automaticamente a variável de ambiente `BLOB_READ_WRITE_TOKEN`.
2. **Senha de upload**: em `Settings` → `Environment Variables`, adicione `UPLOAD_PASSWORD` com uma senha forte. É ela que protege quem pode escrever dados novos em `/admin`.
3. Depois de configurar as duas, faça um redeploy para as variáveis entrarem em vigor.

Sem isso, `/admin` continua acessível mas todo upload falha (a função recusa se `UPLOAD_PASSWORD` não estiver configurada, e não tem onde salvar sem o Blob conectado).

## Estrutura

- `index.html` — o painel (busca dados via fetch, não tem mais dado embutido).
- `admin/index.html` — página de upload self-service (3 arquivos).
- `api/process.js` — upload manual: recebe os 3 arquivos, processa, salva no Blob.
- `lib/access.js` — separa os dados por visão (Usuário sem inscritos / Gestão completo); `lib/nivel.js` — regra do nível da turma.
- `api/sync.js` + `lib/graphSource.js` — atualização automática: baixa os 3 arquivos do Microsoft 365 (Graph API) e reprocessa; chamada pelo cron de `vercel.json`.
- `lib/pipeline.js` — o núcleo compartilhado pelo upload manual e o sync (parse → cruzamento → publicação, preservando turmas manuais).
- `api/dashboard-data.js` — serve os dados atuais pro painel (com fallback para o `data/dashboard-data.seed.json` embutido, caso nunca tenha havido upload — o seed foi regenerado em 15/10/2026 com os 14 produtos e as 3 planilhas, então o painel já nasce completo e é substituído na primeira atualização).
- `lib/` — a lógica de parsing. `parseTurmas.js`/`parseMatriculas.js` começaram como porte fiel de `pipeline/*.py` (validado linha a linha contra a saída Python: 238/238 turmas, 2433/2433 campos de aula, 78/78 matrículas, zero divergências) e depois ganharam cobertura extra só em JS — os 5 produtos novos, CNP e `parseOcupacao.js` **não têm equivalente no Python** e não foram validados contra uma saída "ground truth" separada, só conferidos manualmente linha a linha contra as planilhas reais durante o desenvolvimento. Rode `test/e2e.js` contra as planilhas reais depois de qualquer mudança aqui.
- `pipeline/` — os scripts Python originais, mantidos como referência/fallback manual (não são publicados pelo Vercel — ver `.vercelignore`). **Ficaram desatualizados**: não cobrem os produtos novos, CNP nem Ocupação de Turmas — servem só de referência histórica agora, não como fallback completo.

## Fallback manual (se algum dia precisar)

Os scripts em `pipeline/` continuam funcionando para os 8 produtos originais: baixe as planilhas para `Downloads`, rode `python extract_turmas.py`, `python extract_matriculas.py`, `python build_dashboard_data.py` (requer `pip install python_calamine`). Isso gera um `regua_de_turmas.html` autocontido — útil para um snapshot avulso dos produtos antigos, mas não cobre os produtos adicionados depois (MBAI, LinkedIn Program, Advisor Program, IA na Prática, B2B, CNP) nem afeta o site publicado no Vercel (que só muda via `/admin` ou editando `index.html`/`data/dashboard-data.seed.json` diretamente).

