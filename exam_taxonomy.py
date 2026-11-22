"""Classificação textual conservadora do tipo de cobrança das questões.

Não é um rótulo oficial da banca, nem classificação validada por especialistas.
Termos clinicamente citados no caso não garantem que correspondam à competência
avaliada. Saídas ambíguas permanecem SEM_CLASSIFICACAO.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Mapping

VERSION = "regras-v1"
UNCLASSIFIED = "Não classificada"
LABELS = (
    "Diagnóstico",
    "Tratamento e conduta",
    "Conceito e classificação",
    "Prevenção e rastreamento",
    "Fisiopatologia",
    "Epidemiologia",
    "Quadro clínico",
    "Complicações",
)

# Padrões pesquisados apenas na parte final do enunciado, não nas alternativas.
# Expressões explícitas (ex.: "qual é a conduta") têm precedência sobre menções
# incidentais. O empate na mesma pergunta resulta em "Não classificada".
_RAW_RULES = {
    "Diagnóstico": [
        r"\bdiagnostic[oa]s?\b", r"\bdiagnosis\b", r"\bhipotes[ei] diagnostica\b",
        r"\bexame (?:mais )?(?:indicado|adequado|confirmatorio|de escolha)\b",
        r"\b(?:exames|testes) diagnosticos?\b", r"\b(?:diagnostic|confirmatory) test\b",
        r"\b(?:diagnostic|exame) diferencial\b",
    ],
    "Tratamento e conduta": [
        r"\bconduta\b", r"\btratament[oa]\b", r"\b(?:therap(?:y|eutic)|treatment|management)\b",
        r"\bterapeutic[oa]\b", r"\b(?:manejo|abordagem|intervencao|procedure)\b",
        r"\b(?:medicamento|farmaco|droga|antibiotico|antimicrobiano)\s+(?:indicado|de escolha|adequado|recomendado)\b",
        r"\b(?:next|initial) (?:step|action|management)\b",
        r"\b(?:proxima|primeira) (?:medida|conduta|etapa|intervencao)\b",
    ],
    "Conceito e classificação": [
        r"\b(?:classificacao|classificar|classification|classify)\b",
        r"\b(?:definicao|conceito|definicion|definition)\b",
        r"\b(?:criterios?|criteria)\s+(?:de|para|for)\s+(?:classificacao|classifying)\b",
    ],
    "Prevenção e rastreamento": [
        r"\b(?:prevencao|prevenir|prevention|preventivo|preventive)\b",
        r"\b(?:rastreamento|screening|tamizaje|cribado)\b",
        r"\b(?:profilaxia|prophylaxis|vacina(?:cao)?|vaccination)\b",
    ],
    "Fisiopatologia": [
        r"\b(?:fisiopatologia|pathophysiology|fisiopatologico|pathogenesis)\b",
        r"\b(?:mecanismo|mechanism)\s+(?:fisiopatologico|da doenca|of disease|de accion|de acao)\b",
    ],
    "Epidemiologia": [
        r"\b(?:epidemiologia|epidemiology|prevalencia|incidencia)\b",
        r"\b(?:risco relativo|odds ratio|raz[aã]o de chances|sensibilidade|especificidade)\b",
        r"\b(?:coorte|caso.controle|ensaio clinico|cohort|case.control)\b",
    ],
    "Quadro clínico": [
        r"\b(?:quadro clinico|clinical presentation|manifestacoes clinicas)\b",
        r"\b(?:sinais e sintomas|signs and symptoms|achados clinicos)\b",
        r"\b(?:sintoma|sinal|manifestacao)(?:\s+clinica)?\s+(?:mais comum|caracteristico|tipico)\b",
    ],
    "Complicações": [
        r"\b(?:complicacao|complicacoes|complication|complications)\b",
        r"\b(?:sequela|sequelae|adverse outcome)\b",
    ],
}

def _norm(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").lower())
    return re.sub(r"\s+", " ", "".join(c for c in text if not unicodedata.combining(c))).strip()


RULES = {label: tuple(re.compile(pattern, re.I) for pattern in patterns)
         for label, patterns in _RAW_RULES.items()}

# Pistas de solicitação da resposta. Não analisamos alternativas ou gabaritos.
_QUERY_CUE = re.compile(
    r"\b(?:qual|quais|quando|como|indique|assinale|marque|selecione|"
    r"respecto|respecto a|cu[aá]l|cu[aá]les|se[nñ]ale|"
    r"which|what|choose|select|identify|most likely|best)\b", re.I
)

@dataclass(frozen=True)
class Classification:
    tipo: str
    origem: str = VERSION
    regra: str = ""
    evidencia: str = ""
    revisada: bool = False

    def as_dict(self) -> dict:
        return {
            "tipo": self.tipo,
            "origem": self.origem,
            "regra": self.regra,
            "evidencia": self.evidencia,
            "revisada": self.revisada,
        }


def classify(stem: str) -> Classification:
    text = _norm(stem)
    if len(text) < 12:
        return Classification(UNCLASSIFIED, regra="texto_insuficiente")

    # Exclui textos distantes da solicitação final. Menções narrativas próximas
    # ainda podem produzir erros; por isso os rótulos são sempre provisórios.
    segment = text[-500:]
    matches = []
    for label, rules in RULES.items():
        hits = [(match.start(), match.end(), match.group(0))
                for rule in rules for match in rule.finditer(segment)]
        if not hits:
            continue
        last = max(hits, key=lambda item: item[1])
        matches.append((last[1], label, last[2]))

    if not matches:
        return Classification(UNCLASSIFIED, regra="sem_pista_textual")

    matches.sort(reverse=True)
    end, label, evidence = matches[0]
    others = [m for m in matches[1:] if end - m[0] <= 70]
    if others:
        return Classification(UNCLASSIFIED, regra="multiplas_competencias")

    # Apenas mencionar um conceito no relato, sem pergunta reconhecível,
    # não é evidência para tipificar a competência.
    if not _QUERY_CUE.search(segment):
        return Classification(UNCLASSIFIED, regra="sem_comando_claro")

    return Classification(label, regra="pista_de_cobranca", evidencia=evidence)


def classify_question(question: Mapping) -> dict:
    return classify(question.get("enunciado", "")).as_dict()
