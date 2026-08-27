# Régua de Turmas

Dashboard do cronograma de turmas e programas da Board Academy. Site estático (`index.html`) + duas funções serverless que processam as planilhas de origem e mantêm o painel atualizado — sem Python, sem SharePoint automatizado, sem depender de ninguém rodar comando nenhum.

## Como funciona

1. Alguém baixa as duas planilhas mais recentes do SharePoint (isso continua manual — exige login pessoal, não dá pra automatizar sem acesso de administrador do Microsoft 365).
2. Abre `/admin` neste site, digita a senha e arrasta os dois arquivos.
3. A função `/api/process` lê as planilhas, roda a mesma lógica de extração que os scripts Python faziam (portada para JavaScript, ver `lib/`), e salva o resultado no Vercel Blob.
4. O painel (`/`) busca os dados de `/api/dashboard-data` a cada carregamento — sempre reflete o último upload, sem precisar de redeploy.

## Setup necessário no Vercel (uma vez só)

1. **Vercel Blob**: no projeto, vá em `Storage` → `Create Database` → `Blob` e conecte ao projeto. Isso cria automaticamente a variável de ambiente `BLOB_READ_WRITE_TOKEN`.
2. **Senha de upload**: em `Settings` → `Environment Variables`, adicione `UPLOAD_PASSWORD` com uma senha forte. É ela que protege quem pode escrever dados novos em `/admin`.
3. Depois de configurar as duas, faça um redeploy para as variáveis entrarem em vigor.

Sem isso, `/admin` continua acessível mas todo upload falha (a função recusa se `UPLOAD_PASSWORD` não estiver configurada, e não tem onde salvar sem o Blob conectado).

## Estrutura

- `index.html` — o painel (busca dados via fetch, não tem mais dado embutido).
- `admin/index.html` — página de upload self-service.
- `api/process.js` — recebe os 2 arquivos, processa, salva no Blob.
- `api/dashboard-data.js` — serve os dados atuais pro painel (com fallback para o `data/dashboard-data.seed.json` embutido, caso nunca tenha havido upload).
- `lib/` — a lógica de parsing (porte fiel de `pipeline/*.py`, validado linha a linha contra a saída Python real: 238/238 turmas, 2433/2433 campos de aula, 78/78 matrículas, zero divergências).
- `pipeline/` — os scripts Python originais, mantidos como referência/fallback manual (não são publicados pelo Vercel — ver `.vercelignore`).

## Fallback manual (se algum dia precisar)

Os scripts em `pipeline/` continuam funcionando exatamente como antes: baixe as planilhas para `Downloads`, rode `python extract_turmas.py`, `python extract_matriculas.py`, `python build_dashboard_data.py` (requer `pip install python_calamine`). Isso gera um `regua_de_turmas.html` autocontido — útil para um snapshot avulso, mas não afeta o site publicado no Vercel (que só muda via `/admin` ou editando `index.html`/`data/dashboard-data.seed.json` diretamente).
