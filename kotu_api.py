"""Kotu API: módulo isolado para chat contextual e material de estudo."""
from __future__ import annotations

import json
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field


class KotuMsg(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str = Field(..., max_length=8000)


class KotuContext(BaseModel):
    origin: str = Field("home", max_length=24)
    questionId: Optional[int] = None
    answered: bool = False
    selectedOption: Optional[str] = Field(None, max_length=8)
    mode: Optional[str] = Field(None, max_length=20)
    stationId: Optional[str] = Field(None, max_length=32)
    phase: Optional[str] = Field(None, max_length=20)
    lostItems: List[int] = Field(default_factory=list, max_length=80)
    perfil: Optional[Dict[str, Any]] = None


class KotuRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2500)
    history: List[KotuMsg] = Field(default_factory=list, max_length=16)
    context: KotuContext = Field(default_factory=KotuContext)


class KotuStudyRequest(BaseModel):
    context: KotuContext = Field(default_factory=KotuContext)


def build_kotu_router(by_id: dict, est_by_id: dict, exames_ocultos: set, conteudo: dict):
    router = APIRouter()
    blocked = "Para preservar a validade do simulado, o Kotu fica em silêncio durante o Modo Prova. A análise completa é liberada após a entrega."

    def question_context(c: KotuContext):
        q = by_id.get(c.questionId or -1)
        if not q or q.get("exame") in exames_ocultos:
            return "Questão não encontrada no banco.", "Responda de forma geral."
        import ia_provedores
        alts = "\n".join(f"{l}) {q.get('alt_' + l)}" for l in "ABCDEFGH" if q.get("alt_" + l))
        txt = (
            f"Tela: questão {q.get('exame')} · {q.get('edicao')} · Q{q.get('numero')} · "
            f"área: {q.get('especialidade')} · tema: {q.get('tema')}\n"
            f"{ia_provedores.contexto(q)}Enunciado: {str(q.get('enunciado') or '')[:4000]}\nAlternativas:\n{alts}\n"
        )
        if q.get("tem_imagem"):
            txt += "A questão original possui imagem/figura não incluída neste contexto textual.\n"
        if not c.answered:
            return txt, (
                "O aluno ainda não respondeu. Não revele, sugira, insinue ou elimine alternativas específicas. "
                "Explique conceitos, termos, critérios gerais e raciocínio sem spoiler."
            )
        gab = q.get("gabarito_oficial")
        sel = (c.selectedOption or "").upper()[:1] or None
        txt += f"Gabarito oficial: {gab}. O aluno marcou: {sel or 'em branco'}."
        if gab == "ANULADA" or sel == gab:
            txt += " Resultado: acertou.\n"
        else:
            txt += " Resultado: errou.\n"
        exp = ia_provedores.salvo(q)
        if exp:
            resumo = {k: exp.get(k) for k in ("porque_correta","conceito_cobrado","pegadinhas","resumo","alerta_revisao") if exp.get(k)}
            if resumo:
                txt += "Comentário já mostrado pela IA Tutora; complemente sem repetir: " + json.dumps(resumo, ensure_ascii=False)[:2500] + "\n"
        return txt, "O aluno já respondeu. Pode discutir gabarito, alternativas, erro de raciocínio, tema e criar flashcards."

    def station_context(c: KotuContext):
        e = est_by_id.get(c.stationId or "")
        if not e:
            return "Tela: 2ª Fase do Revalida.", "Ajude com estrutura de estação, tempo, anamnese, exame, conduta e comunicação."
        txt = (
            f"Tela: 2ª fase · {e.get('edicao_rotulo') or e.get('edicao')} · estação {e.get('estacao')} · "
            f"área: {e.get('area')} · título: {e.get('titulo')}\n"
            f"Instruções ao candidato: {str(e.get('instrucoes') or '')[:3500]}\n"
        )
        if c.phase not in ("avaliacao","resultado"):
            return txt, (
                "O aluno está treinando e ainda não se autoavaliou. Ajude a organizar os 10 minutos e raciocínio geral, "
                "mas não revele checklist oficial item a item nem diagnóstico final esperado."
            )
        checklist = e.get("checklist") or []
        itens = "\n".join(
            f"{i.get('n')}. {str(i.get('item') or '')[:260]} ({i.get('max','')} pt)"
            for i in checklist
        )
        if itens:
            txt += "Checklist oficial:\n" + itens[:6500] + "\n"
        if e.get("sintese"):
            txt += "Síntese oficial: " + str(e.get("sintese"))[:2500] + "\n"
        lost = {int(x) for x in c.lostItems if isinstance(x, int) or str(x).isdigit()}
        missed = [i for i in checklist if int(i.get("n") or -1) in lost]
        if missed:
            txt += "Itens abaixo do máximo: " + "; ".join(str(i.get("item") or "")[:180] for i in missed)[:2500] + "\n"
        return txt, "O aluno já se autoavaliou. Pode discutir checklist, pontos perdidos, roteiro ideal, diferenciais e conduta."

    screens = {
        "home":"painel inicial","painel":"painel inicial","desempenho":"Desempenho","erros":"Revisões",
        "reforco":"Trilhas de Estudo","banco":"Banco de Questões","simulado":"Simulados","missao":"Missão diária",
        "favoritos":"Favoritas","resultado":"resultado de sessão","atualizacoes":"Atualizações médicas"
    }

    @router.post("/api/kotu/chat")
    def kotu_chat(req: KotuRequest):
        c = req.context
        if c.origin == "exam" or (c.mode == "prova" and not c.answered):
            raise HTTPException(423, blocked)
        if c.origin == "question":
            context, policy = question_context(c)
        elif c.origin == "fase2":
            context, policy = station_context(c)
        else:
            context = f"Tela: {screens.get(c.origin, 'CTi')}."
            policy = "Ajude a organizar estudo, explicar temas, interpretar desempenho e localizar funções do CTi."
            if c.perfil:
                context += "\nDados de desempenho calculados no aparelho: " + json.dumps(c.perfil, ensure_ascii=False)[:3000]
        import ia_provedores
        t0 = time.time()
        text, model, reason = ia_provedores.conversar(context, policy, [h.model_dump() for h in req.history], req.message.strip())
        if not text:
            return {"ok": False, "reply": None, "code":"AI_UNAVAILABLE", "message":"Kotu está temporariamente indisponível."}
        return {"ok": True, "reply": text, "meta": {"model": model, "latencyMs": int((time.time()-t0)*1000)}}

    @router.post("/api/cotu/chat", include_in_schema=False)
    def cotu_chat_alias(req: KotuRequest):
        return kotu_chat(req)

    def material_context(c: KotuContext):
        if c.origin == "question":
            if not c.answered:
                raise HTTPException(409, "O material de estudo é liberado depois que a questão for respondida.")
            q = by_id.get(c.questionId or -1)
            if not q or q.get("exame") in exames_ocultos:
                raise HTTPException(404, "Questão não encontrada.")
            context, _ = question_context(c)
            extra = conteudo.get(q.get("tema"))
            if extra:
                context += "\nBASE DE REFORÇO CURADA DO CTi:\n" + json.dumps(extra, ensure_ascii=False)[:4500]
            context += "\nAmplie a questão para conhecimento transferível do tema."
            return context, "questao", q.get("especialidade",""), q.get("tema","")
        if c.origin == "fase2":
            if c.phase not in ("avaliacao","resultado"):
                raise HTTPException(409, "O material da estação é liberado depois da autoavaliação.")
            e = est_by_id.get(c.stationId or "")
            if not e:
                raise HTTPException(404, "Estação não encontrada.")
            context, _ = station_context(c)
            context += "\nTransforme a estação em revisão transferível para outras estações semelhantes."
            return context, "estacao", e.get("area",""), e.get("titulo","")
        raise HTTPException(400, "Material disponível após questão respondida ou estação autoavaliada.")

    @router.post("/api/kotu/estudo")
    def kotu_study(req: KotuStudyRequest):
        c = req.context
        if c.origin == "exam" or (c.mode == "prova" and not c.answered):
            raise HTTPException(423, blocked)
        context, origin, area, theme = material_context(c)
        import ia_provedores
        t0 = time.time()
        material, model, reason = ia_provedores.gerar_material_estudo(context, origin, area, theme)
        if not material:
            return {"ok":False,"material":None,"code":"AI_UNAVAILABLE","message":"Kotu não conseguiu gerar o material agora."}
        return {"ok":True,"material":material,"meta":{"model":model,"latencyMs":int((time.time()-t0)*1000),"schemaVersion":1,"source":{"origin":origin,"questionId":c.questionId,"stationId":c.stationId}}}

    @router.post("/api/cotu/estudo", include_in_schema=False)
    def cotu_study_alias(req: KotuStudyRequest):
        return kotu_study(req)

    return router
