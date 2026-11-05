# V32 — validação MB32

## Escopo entregue
- Matriz Temática Inteligente
- Cobertura individual por tema
- Percentual de acertos
- Erros abertos
- Frequência relativa nas provas em foco
- Prioridade personalizada 0–100
- Busca, filtro por área e ordenação
- Ações Treinar e Resumo
- Marca-texto por seleção de trecho
- Categorias: Achado-chave, Pegadinha, Diagnóstico, Conduta e Livre
- Caderno de Estudo com anotações e destaques
- Reabertura da questão pelo Caderno
- Conversão em flashcard
- Revisão espaçada Errei / Difícil / Fácil
- Persistência local em chaves `cti_*`
- Ocultação das ferramentas no Modo Prova

## Compatibilidade
O pacote não substitui backend, banco de questões, autenticação, Supabase, IA, planner, farmacologia, 2ª fase ou dados existentes.

## Testes estáticos executados
- Sintaxe JavaScript de `static/app.js`
- Sintaxe JavaScript de `static/mb32.js`
- Presença dos assets v31 referenciados no repositório confirmada previamente
- Estrutura esperada `static/` preservada
- Chaves do MB32 começam por `cti_`, portanto participam do mecanismo atual de export/import de progresso

## Validação funcional prévia
O MB32 foi previamente publicado e carregado em projeto de preview Vercel separado, com deployment em estado READY, sem alterar a produção original.
