"""Auditoria quantitativa dos rótulos provisórios no acervo real.
Não altera o JSON, não gera gabaritos e não expõe conteúdo de questões.
"""
from collections import Counter, defaultdict
from pathlib import Path
import json, sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from exam_taxonomy import classify_question, UNCLASSIFIED, LABELS

base = Path(__file__).resolve().parents[1]
rows = json.loads((base / "banco_completo_questoes_revalida_e_enamed.json").read_text(encoding="utf-8"))
by_exam = defaultdict(Counter)
count=0
for q in rows:
    if q.get("qualidade") != "ok" or q.get("gabarito_oficial") == "ANULADA" or q.get("duplicata_de"):
        continue
    before = (q.get("gabarito_oficial"),q.get("enunciado"))
    result = classify_question(q)
    label = result["tipo"]
    assert label == UNCLASSIFIED or label in LABELS
    assert result["revisada"] is False
    assert (q.get("gabarito_oficial"),q.get("enunciado")) == before
    by_exam[q.get("exame","")][label] += 1
    count+=1
total = sum(sum(v.values()) for v in by_exam.values())
assert total == count and total >= 1000, "Acervo divergente"
for name, counter in sorted(by_exam.items()):
    n = sum(counter.values())
    known=n-counter[UNCLASSIFIED]
    print(f"TAXONOMY_AUDIT exam={name!r} total={n} provisional={known} unknown={counter[UNCLASSIFIED]} coverage={known/n:.1%} by_type={dict(counter)}")
print(f"TAXONOMY_AUDIT_TOTAL {total}")
