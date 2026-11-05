# CTI — Quadro Permanente de Execução

> Este arquivo é a fonte única de verdade do roadmap. Atualizar a cada macrobloco/deploy.
> Produção só recebe mudanças após branch isolada + smoke tests + preview quando aplicável.

## Status geral

### Concluído
- [x] Texto técnico do Radar removido da interface do usuário
- [x] Recuperação da produção e estrutura canônica
- [x] GitHub + Vercel alinhados
- [x] Autenticação single-user sem Supabase
- [x] CI com smoke tests
- [x] MB32 — Matriz Temática Inteligente
- [x] Caderno de Estudo
- [x] Marca-texto por categoria
- [x] Flashcards manuais do Caderno
- [x] Revisão espaçada Errei / Difícil / Fácil
- [x] Kotu modular e isolado do núcleo
- [x] Radar de Atualizações funcionando com fallback RSS
- [x] Estabilização da IA NVIDIA: timeout, deduplicação, dica leve, thinking off

### Em andamento
- [x] Estabilização pós-MB33 / PWA
  - [x] Diagnóstico do travamento do Kotu: loop de MutationObserver
  - [x] Corrigir Kotu sem observer recursivo
  - [x] Confirmação explícita ao salvar flashcards
  - [x] Atualização imediata do Caderno após importação de flashcards
  - [x] Auditoria PWA mobile/tablet e orientação landscape
  - [x] Smoke test PWA/manifest/service worker
- [x] MB33 — Material de Estudo Inteligente
  - [x] CTA após questão corrigida
  - [x] CTA após estação autoavaliada
  - [x] Modal próprio: Folha de Estudo + Flashcards
  - [x] Uma única geração IA por material
  - [x] Cache local do material
  - [x] Integrar flashcards gerados ao mesmo motor MB32
  - [x] Salvar flashcards no Caderno/revisão
  - [x] PDF/print A4
  - [x] Regenerar conscientemente, sem duplicar chamada
  - [x] Não exibir durante Modo Prova
  - [x] Preview Vercel + CI + rota /api/kotu/estudo sem 500
  - [x] Validar geração real com NVIDIA em produção

### Próximo macrobloco
- [ ] MB34 — Atlas Visual vinculado a temas/estações

### Depois do MB34
- [ ] MB35 — Paciente IA textual / treino estruturado de estação
- [ ] MB36 — Prontidão + Prescrição Pedagógica
- [ ] MB37 — Planner consolidado
- [ ] MB38 — Colaboração, somente após estabilidade do núcleo individual

## Pendências técnicas controladas
- [ ] Cache global de comentários IA entre dispositivos (hoje: localStorage + arquivos pré-carregados)
- [ ] Sincronização multi-dispositivo quando houver backend persistente dedicado
- [ ] Migração futura para autenticação multiusuário/banco quando houver infraestrutura
- [ ] Revisar UX final do cronômetro do Modo Prova
- [ ] Auditoria final de acessibilidade/mobile antes de encerrar ciclo de deploys

## Regra de deploy
1. Criar branch do macrobloco.
2. Implementar sem substituir arquivos centrais por versões reduzidas.
3. Rodar syntax checks + smoke tests.
4. Criar preview se houver mudança funcional relevante.
5. Validar fluxo principal e regressões.
6. Promover para `main`.
7. Confirmar deploy Vercel READY e ausência de runtime errors.
8. Atualizar este arquivo e o backup de continuidade.
