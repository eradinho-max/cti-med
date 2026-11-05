# CTI Revalida — MB32 / v32

Base validada: `inmed-py/CTI-REVALIDA` branch `main`.
Base tree observada: `0af8d5e5050d77f81ce56f344ff4f421f79e3dfc`.

## O que este pacote altera
Substitua/adicone **somente** estes quatro arquivos no repositório:

- `static/app.js` — loader da v31 + MB32
- `static/app.css` — loader dos estilos v31 + MB32
- `static/mb32.js` — Matriz Temática, marca-texto, Caderno de Estudo e flashcards
- `static/mb32.css` — estilos responsivos do MB32

Não apague `static/cti-app-v31.js` nem `static/cti-app-v31.css`; eles são a base preservada que os loaders usam.

## Forma recomendada de aplicar no GitHub
1. Abra o repositório `inmed-py/CTI-REVALIDA`.
2. Faça um backup/branch antes da alteração, se desejar.
3. Envie a pasta `static/` deste ZIP para a raiz do repositório, mantendo os caminhos.
4. Confirme a substituição de `static/app.js` e `static/app.css` e a criação de `static/mb32.js` e `static/mb32.css`.
5. Commit sugerido: `feat: MB32 matriz temática caderno e flashcards`.
6. O Vercel vinculado ao repositório deve iniciar o deploy automaticamente.

## Validação após deploy
- Login continua funcionando.
- Painel, Missão, Banco, Simulado, Desempenho, Trilhas e 2ª Fase continuam abrindo.
- Em Trilhas aparece `Matriz Temática Inteligente` e `Caderno de Estudo`.
- Em questão no modo treino é possível selecionar texto e destacar.
- É possível salvar anotação e convertê-la em flashcard.
- No Modo Prova o Caderno/Marca-texto não aparece.
- Exportação de progresso inclui as chaves `cti_study_*_v32` porque o backup já exporta todas as chaves `cti_*`.

## Rollback rápido
Se houver regressão:
1. Restaure `static/app.js` com o conteúdo de `static/cti-app-v31.js`.
2. Restaure `static/app.css` com o conteúdo de `static/cti-app-v31.css`.
3. `mb32.js/css` podem permanecer no repositório sem efeito ou serem removidos.

## Observação de arquitetura
Este MB32 foi implementado como camada aditiva sobre a v31. Isso reduz o risco de regressão e facilita o próximo MB33.
