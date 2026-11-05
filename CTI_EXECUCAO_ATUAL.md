# CTI — Quadro Permanente de Execução

> Este arquivo é a fonte única de verdade do roadmap. Atualizar a cada macrobloco/deploy.
> Produção só recebe mudanças após branch isolada + smoke tests + preview quando aplicável.

## Status geral

### Concluído
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
- [ ] MB33 — Material de Estudo Inteligente
  - [ ] CTA após questão corrigida
  - [ ] CTA após estação autoavaliada
  - [ ] Modal/página própria: Folha de Estudo + Flashcards
  - [ ] Uma única geração IA por material
  - [ ] Cache local do material
  - [ ] Integrar flashcards gerados ao mesmo motor MB32
  - [ ] Salvar no Caderno/Trilhas
  - [ ] PDF/print A4
  - [ ] Regenerar conscientemente, sem duplicar chamada
  - [ ] Não exibir nada durante Modo Prova

### Próximos macroblocos
- [ ] MB34 — Atlas Visual vinculado a temas/estações
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
