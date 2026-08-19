# Régua de Turmas

Dashboard estático (HTML/CSS/JS puro, sem backend) com o cronograma das turmas e programas da Board Academy.

## Deploy

`index.html` na raiz é tudo que o Vercel precisa — é um site estático, sem build step, sem framework. Basta importar este repositório no Vercel (Import Git Repository) e ele detecta e publica sozinho.

## Como atualizar os dados

Os dados vêm de duas planilhas no SharePoint:
- `Cronograma 2026 - Turmas.xlsx` (pasta SysAdmin/FONTE DE DADOS - BI/GED)
- `Planilha_Master_Controle_Alunos_2026.xlsx` (OneDrive do Mikael Oliveira)

Passos:
1. Baixe as duas planilhas mais recentes do SharePoint.
2. Coloque-as na pasta `Downloads` do usuário que vai rodar os scripts.
3. Rode, nesta ordem, dentro de `pipeline/`:
   ```
   python extract_turmas.py
   python extract_matriculas.py
   python build_dashboard_data.py
   ```
4. O `build_dashboard_data.py` gera um `regua_de_turmas.html` já com os dados novos embutidos. Copie o conteúdo dele para `index.html` na raiz deste repositório, commit e push — o Vercel republica automaticamente.

Os scripts dependem de `python_calamine` (`pip install python_calamine`) para ler os `.xlsx`.

## Estrutura

- `index.html` — o dashboard publicado (o que o Vercel serve).
- `pipeline/` — scripts Python + template usados para gerar o `index.html` a partir das planilhas de origem. Não é servido publicamente pelo Vercel (só o que está na raiz é publicado), mas fica versionado aqui para quem for atualizar o painel no futuro.
