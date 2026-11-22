"""Integração de Kotu: histórico privado, alias legado e política anti-spoiler.

Sem banco real e sem rede externa.
"""
import unittest
from types import SimpleNamespace
from unittest.mock import patch
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from kotu_api import build_kotu_router
import ai_cache_store as cache
import ia_provedores

class MemoryStore:
    ready = True
    failure = False
    def __init__(self):
        self.data={}
        self.tokens={}
        self.calls=[]
    def get(self,key,scope,owner=None):
        return self.data.get((key,scope,owner))
    def claim(self,key,digest,kind,scope="shared",owner=None):
        if (key,scope,owner) in self.data:return None
        if (key,scope,owner) in self.tokens:return None
        lease=cache.Lease(key,"sample",1)
        self.tokens[(key,scope,owner)]=lease
        return lease
    def wait_ready(self,key,scope,owner=None,seconds=5):
        return self.get(key,scope,owner)
    def finish(self,lease,payload,scope,owner=None):
        self.calls.append((lease.cache_key,scope,owner))
        if payload:self.data[(lease.cache_key,scope,owner)]=payload
        self.tokens.pop((lease.cache_key,scope,owner),None)
        return True

class EndpointTests(unittest.TestCase):
    def setUp(self):
        self.app=FastAPI()
        @self.app.middleware("http")
        async def fake_session(request,call_next):
            request.state.user=SimpleNamespace(user_id=request.headers.get("X-Student","student-a"))
            return await call_next(request)
        self.question={
            "id":580,"exame":"Revalida","edicao":"2026","numero":7,
            "especialidade":"Clínica","tema":"Diabetes",
            "enunciado":"Paciente adulto com hiperglicemia. Qual a conduta?",
            "alt_A":"A","alt_B":"B","gabarito_oficial":"B","tem_imagem":False
        }
        self.app.include_router(build_kotu_router({580:self.question},{},set(),{}))
        self.client=TestClient(self.app)
        self.mem=MemoryStore()
        self.stub=patch.object(cache,"STORE",self.mem)
        self.stub.start()
        self.calls=0
        def generate(*args,**kwargs):
            self.calls+=1
            return ({
                "titulo":"Estudo sobre diabetes","essenciais":["a","b","c"],
                "flashcards":[{"frente":"P1","verso":"R1"},{"frente":"P2","verso":"R2"},{"frente":"P3","verso":"R3"}]
            },"test-model",None)
        self.ai=patch.object(ia_provedores,"gerar_material_estudo",side_effect=generate)
        self.ai.start()
    def tearDown(self):
        self.ai.stop();self.stub.stop()

    def payload(self):
        return {"context":{"origin":"question","questionId":580,"answered":True,
                           "selectedOption":"A","mode":"treino"}}

    def test_same_user_second_device_reads_private_cache(self):
        a=self.client.post("/api/kotu/estudo",json=self.payload(),headers={"X-Student":"student-a"})
        b=self.client.post("/api/kotu/estudo",json=self.payload(),headers={"X-Student":"student-a"})
        self.assertEqual(a.status_code,200,a.text)
        self.assertTrue(a.json()["ok"])
        self.assertEqual(a.json()["material"],b.json()["material"])
        self.assertEqual(self.calls,1)

    def test_different_user_not_shared(self):
        a=self.client.post("/api/kotu/estudo",json=self.payload(),headers={"X-Student":"student-a"})
        b=self.client.post("/api/kotu/estudo",json=self.payload(),headers={"X-Student":"student-b"})
        self.assertTrue(a.json()["ok"]);self.assertTrue(b.json()["ok"])
        self.assertEqual(self.calls,2)
        self.assertEqual(sorted(v[2] for v in self.mem.calls),["student-a","student-b"])

    def test_legacy_alias_and_exam_protection(self):
        a=self.client.post("/api/cotu/estudo",json=self.payload())
        self.assertEqual(a.status_code,200,a.text)
        self.assertTrue(a.json()["ok"])
        locked={"context":{"origin":"question","questionId":580,"answered":False,"mode":"prova"}}
        r=self.client.post("/api/kotu/estudo",json=locked)
        self.assertEqual(r.status_code,423)
        self.assertEqual(self.calls,1)

    def test_private_material_requires_answered(self):
        r=self.client.post("/api/kotu/estudo",json={"context":{"origin":"question","questionId":580,"answered":False,"mode":"treino"}})
        self.assertEqual(r.status_code,409)
        self.assertEqual(self.calls,0)

if __name__=="__main__":
    unittest.main()
