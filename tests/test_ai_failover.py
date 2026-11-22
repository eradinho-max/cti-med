"""CTI regressão: fallback IA Tutora / Kotu sem rede, sem chaves e sem alterar o gabarito."""
import json
import os
import unittest
from unittest.mock import patch
import urllib.request
import ia_provedores as ia

class FakeProvider:
    def __init__(self, name, response=None, error=None):
        self.nome=name
        self.modelo=name
        self.timeout=30
        self.response=response
        self.error=error
        self.calls=[]
        self.ultimo_erro=""
        self.pausado_ate=0
    def disponivel(self):
        return True
    def chamar(self,msgs,**kwargs):
        self.calls.append((msgs,kwargs))
        if self.error:
            raise self.error
        return self.response

class UrlResponse:
    def __init__(self,text):
        self.text=text
    def __enter__(self):return self
    def __exit__(self,*args):return False
    def read(self):
        return json.dumps({"choices":[{"message":{"content":self.text}}]}).encode()

class ReliabilityTests(unittest.TestCase):
    def test_two_models_registered_with_same_key(self):
        # No real tokens are used: the provider module is loaded in a clean process.
        import subprocess,sys
        env=dict(os.environ)
        for k in ["CTI_GEMINI_API_KEY","GEMINI_API_KEY","CTI_LLM_API_KEY","MEDQUEST_LLM_API_KEY","OPENAI_API_KEY"]:
            env.pop(k,None)
        env["NVIDIA_API_KEY"]="test-token-not-a-secret"
        env["CTI_NVIDIA_MODEL"]="nvidia/example-primary"
        env["CTI_NVIDIA_FALLBACK_MODEL"]="nvidia/nemotron-3.5-super-vl-120b-a12b"
        code="import ia_provedores as a; print([(p.nome,p.modelo) for p in a.PROVEDORES])"
        out=subprocess.check_output([sys.executable,"-c",code],env=env,text=True)
        self.assertIn("nvidia/example-primary",out)
        self.assertIn("nvidia/nemotron-3.5-super-vl-120b-a12b",out)

    def test_tutor_switches_to_backup_on_invalid(self):
        first=FakeProvider("primary",response={"itens":[{"resumo":"insuficiente"}]})
        backup=FakeProvider("backup",response={"itens":[{"resumo":"validado"}]})
        q={"id":580,"enunciado":"Qual a conduta?","edicao":"2026","numero":1,
           "especialidade":"Clínica","tema":"Diabetes","gabarito_oficial":"B","alt_A":"A","alt_B":"B"}
        with patch.object(ia,"PROVEDORES",[first,backup]),patch.object(ia,"valido",side_effect=lambda item,question:item.get("resumo")=="validado"),patch.object(ia,"_guardar",return_value=None):
            item,reason=ia.gerar(q)
        self.assertIsNone(reason)
        self.assertEqual(item["id"],580)
        self.assertEqual(item["modelo"],"backup")
        self.assertEqual(item["cti_schema_version"],4)
        self.assertEqual(len(first.calls),1)
        self.assertEqual(len(backup.calls),1)
        self.assertLessEqual(first.calls[0][1]["timeout"],29)

    def test_kotu_chat_switches_after_error(self):
        first=FakeProvider("primary",error=TimeoutError("test timeout"))
        backup=FakeProvider("backup",response={"resposta":"O raciocínio começa pelos sinais de alarme."})
        with patch.object(ia,"PROVEDORES",[first,backup]),patch.object(ia.time,"sleep",return_value=None):
            reply,model,reason=ia.conversar("Tema de exemplo","Responda sem gabarito",[],"Explique o raciocínio")
        self.assertEqual(model,"backup")
        self.assertIsNone(reason)
        self.assertIn("raciocínio",reply)
        self.assertEqual(len(backup.calls),1)
        self.assertTrue(backup.calls[0][1]["allow_text"])

    def test_kotu_accepts_plain_text_only_in_chat(self):
        p=ia.Provedor("mock","https://example.invalid/v1","dummy","mock")
        with patch.object(urllib.request,"urlopen",return_value=UrlResponse("Explicação breve baseada nas pistas do caso.")):
            msg=p.chamar([{"role":"user","content":"Olá"}],allow_text=True)
            self.assertIn("Explicação",msg["resposta"])
            with self.assertRaises(json.JSONDecodeError):
                p.chamar([{"role":"user","content":"Olá"}],allow_text=False)
    
if __name__=="__main__":
    unittest.main()
