# CTI v30 — Simulado cronometrado / Modo Prova

## Mudanças
- Simulado oferece dois modos explícitos:
  - **Modo Prova**: sem dica/IA durante a execução, cronômetro regressivo, correção somente ao entregar.
  - **Modo Treino**: mantém IA e correção após cada resposta.
- Quantidades rápidas: 10, 20, 30, 40, 50 e 100 questões.
- Modo Prova usa orçamento padrão de **3 minutos por questão**.
- Cronômetro continua contando corretamente mesmo com aba em segundo plano (baseado em deadline/Date.now).
- Aviso visual a 25% do tempo restante e estado crítico a 10%.
- Ao zerar, o simulado é entregue automaticamente; itens em branco permanecem não respondidos.
- Resultado mostra média de tempo por questão versus alvo de 3:00.
- Simulados do Planner em modo prova herdam o mesmo orçamento temporal.

## Referência temporal
O Revalida 2026/1 usa 100 questões objetivas em 5 horas, equivalente a 3 min/questão.

## Assets
- `static/app.js` e `static/app.css` atualizados na raiz real usada pela Vercel.
- cópias versionadas `static/cti-app-v30.js` e `static/cti-app-v30.css`.
- query string dos assets: `30.0.0`.
