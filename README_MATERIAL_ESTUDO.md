# CTI · COTU — Material de Estudo v1

## Objetivo
Transformar uma questão já corrigida ou uma estação da 2ª fase já autoavaliada em um material de estudo do **tema**, e não apenas repetir a questão.

## Fluxo
1. O aluno responde a questão / conclui a autoavaliação da estação.
2. Surge a ação **Gerar material** e, no COTU, o chip **Material de estudo** / **Material da estação**.
3. O front chama `POST /api/cotu/estudo` enviando apenas IDs e estado da tela.
4. O servidor reconstrói o contexto confiável (questão, gabarito, comentário IA, PEP, itens perdidos e reforço curado do CTI).
5. A IA faz **uma única geração estruturada**.
6. A mesma resposta alimenta:
   - Folha de Estudo;
   - Flashcards;
   - PDF / impressão.

## Conteúdo da Folha de Estudo
- O que estava realmente sendo testado;
- Essenciais do tema;
- Raciocínio / algoritmo mental;
- Quadro clínico e critérios, quando aplicável;
- Diagnósticos diferenciais;
- Conduta;
- Farmacologia/técnica, quando relevante;
- Red flags;
- Pegadinhas;
- Tips de prova;
- **Além da questão**: conhecimento transferível para outras questões;
- Na 2ª fase: roteiro de 10 minutos, frases que pontuam e erros comuns;
- 6–10 flashcards.

## PDF
O botão **PDF / imprimir** abre uma folha A4 otimizada e chama a impressão nativa do navegador.
O aluno escolhe **Salvar como PDF**. Isso evita biblioteca externa, mantém o deploy leve e funciona em Chrome/Edge/Safari modernos.

## Cache e custo de IA
A geração é salva em `cti_material_estudo_v1`.
Abrir novamente a folha, flashcards ou PDF **não chama a IA de novo**.
Somente **Regenerar** executa nova chamada.

## Flashcards
São salvos em:
- `cti_material_flashcards_v1`
- `cti_study_flashcards_v32` (compatibilidade com o Caderno/MB32)

## Segurança pedagógica
- Questão não respondida: material bloqueado.
- Modo Prova não entregue: bloqueado.
- Estação em treinamento: bloqueado até a autoavaliação.
- Gabarito/checklist são reconstruídos no servidor; não são aceitos do navegador.

## Arquivos alterados
- `main.py`
- `ia_provedores.py`
- `static/index.html`
- `static/sw.js`

## Novo endpoint
`POST /api/cotu/estudo`

Payload:
```json
{
  "context": {
    "origin": "question",
    "questionId": 123,
    "answered": true,
    "selectedOption": "B",
    "mode": "treino"
  }
}
```

Para estação:
```json
{
  "context": {
    "origin": "fase2",
    "stationId": "2025_2_E03",
    "phase": "resultado",
    "lostItems": [2, 5, 7]
  }
}
```
