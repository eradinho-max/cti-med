# Validação — COTU Material de Estudo v1

- `main.py`: sintaxe Python validada com `py_compile`.
- `ia_provedores.py`: sintaxe Python validada com `py_compile`.
- JavaScript inline de `static/index.html`: validado com `node --check`.
- Sanitização básica do JSON estruturado da IA testada com amostra válida.
- O fluxo não adiciona dependências externas.
- O PDF usa impressão nativa do navegador.
- A rota `/api/cotu/estudo` continua sob o rate limit já aplicado às rotas `/api/cotu`.
- Modo Prova e pré-resposta continuam protegidos.
