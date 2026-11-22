"""Regressões da triagem por tipo de cobrança: exemplos sintéticos conhecidos."""
import unittest

from exam_taxonomy import LABELS, UNCLASSIFIED, classify, classify_question

class TaxonomyTests(unittest.TestCase):
    def test_explicit_categories(self):
        cases = {
            "Diagnóstico":"Paciente com febre persistente e tosse. Qual é o diagnóstico mais provável?",
            "Tratamento e conduta":"Paciente com pneumonia e hipoxemia. Qual é a conduta indicada?",
            "Conceito e classificação":"Paciente com insuficiência cardíaca. Qual é a classificação funcional?",
            "Prevenção e rastreamento":"Na população descrita, qual o rastreamento recomendado?",
            "Fisiopatologia":"Em um paciente com hipoxemia, qual o mecanismo fisiopatológico predominante?",
            "Epidemiologia":"Qual é a prevalência da doença nesta população?",
            "Quadro clínico":"Qual é a manifestação clínica mais comum desta doença?",
            "Complicações":"Qual é a complicação mais frequente deste quadro?",
        }
        for label,text in cases.items():
            with self.subTest(label=label):
                self.assertEqual(classify(text).tipo,label)

    def test_missing_or_ambiguous_remains_unknown(self):
        self.assertEqual(classify("Qual é a alternativa correta?").tipo,UNCLASSIFIED)
        self.assertEqual(classify("Paciente com febre e tosse sem detalhes.").tipo,UNCLASSIFIED)
        self.assertEqual(classify("Qual é o diagnóstico e a conduta do paciente?").tipo,UNCLASSIFIED)
        self.assertEqual(classify("DADOS INSUFICIENTES").tipo,UNCLASSIFIED)

    def test_no_answer_leak_or_changes(self):
        q={"enunciado":"Paciente com diabetes descompensada. Qual a conduta inicial?",
           "gabarito_oficial":"C","alt_a":"Diagnóstico","alt_c":"Tratamento"}
        before=dict(q)
        res=classify_question(q)
        self.assertEqual(res["tipo"],"Tratamento e conduta")
        self.assertEqual(q,before)
        self.assertFalse(res["revisada"])
        self.assertIn(res["tipo"],LABELS)

if __name__=="__main__":
    unittest.main()
