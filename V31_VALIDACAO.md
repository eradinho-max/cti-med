# CTI v31 — Aprendizagem adaptativa e rota inteligente

## Escopo implementado

1. Flashcards automáticos dos erros
   - cartões criados a partir das questões erradas;
   - quando há correção da IA, usa conceito cobrado/resumo para memorizar;
   - revisão local/offline com `Errei`, `Difícil` e `Fácil`;
   - agendamento adaptativo sem nova chamada de IA.

2. Caderno de erros com causa e ciclo de fechamento
   - motivo do erro: conteúdo, confusão conceitual, interpretação, desatenção, conduta/dose, dúvida entre alternativas;
   - status `Aberto`, `Em andamento` e `Resolvido`;
   - erro repetido reabre a lacuna; três revisões espaçadas bem-sucedidas resolvem a questão.

3. Diagnóstico inicial
   - 40 questões equilibradas;
   - modo prova cronometrado;
   - resultado entra no histórico e passa a orientar o Planner.

4. Correção de rota semanal
   - últimos 7 dias versus semana anterior;
   - área prioritária e metas temáticas;
   - cartão aparece no Planner às segundas e permanece disponível em Desempenho.

5. Mapa de prioridade
   - cruza frequência do tema nas provas em foco com desempenho do aluno;
   - destaca `cai muito e você erra`.

6. Cobertura das provas em foco
   - respondidas / questões únicas disponíveis por prova.

7. Cronograma e reta final
   - usa a data-alvo já existente;
   - nas últimas 6 semanas reduz reforço teórico e prioriza revisão de erros + blocos cronometrados;
   - domingo: simulado de reta final;
   - primeiro domingo do mês: simulado completo de 100 questões.

8. Segunda fase
   - radar de competências a partir das próximas avaliações detalhadas;
   - filtro por apresentação clínica / queixa principal;
   - modo Banca explícito e Treino guiado;
   - `Refazer` permanece disponível e o histórico de tentativas é preservado.

## Compatibilidade

- Mantém v30: Modo Prova, cronômetro regressivo e 3 minutos por questão.
- Mantém v29: até 3 provas em foco e pesos relativos.
- Mantém miniestação, farmacologia e demais módulos anteriores.

## Validações executadas

- `python -m py_compile`: OK.
- `node --check static/app.js`: OK.
- FastAPI TestClient: `/`, `/api/stats`, `/api/indice`, `/static/app.js`: HTTP 200.
- Diagnóstico de 40 questões: 40 itens retornados.
- Simulado de 100 questões: 100 itens retornados.
- HTML contém os novos elementos de flashcards, diagnóstico, mapa de prioridade, radar 2ª fase e reta final.
