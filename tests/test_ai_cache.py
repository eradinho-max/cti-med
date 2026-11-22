"""Regressão do cache: sem rede/Neon real; idempotência, chaves, privacidade e fallback."""
import unittest
from unittest.mock import patch
import ai_cache_store as cache

class MemoryCache:
    def __init__(self):
        self.ready=True
        self.failure=False
        self.rows={}
        self.claims=[]
        self.finished=[]
    def get(self,key,scope,owner=None):
        value=self.rows.get((key,scope,owner))
        return value
    def claim(self,key,digest,kind,scope="shared",owner=None):
        keytuple=(key,scope,owner)
        if keytuple in self.rows:
            return None
        if keytuple in self.claims:
            return None
        lease=cache.Lease(key,"claim-1",1)
        self.claims.append(keytuple)
        return lease
    def finish(self,lease,payload,scope,owner=None):
        self.finished.append((lease.cache_key,payload,scope,owner))
        if payload:
            self.rows[(lease.cache_key,scope,owner)]=payload
        self.claims.clear()
        return bool(payload)
    def wait_ready(self,key,scope,owner=None,seconds=0):
        return self.rows.get((key,scope,owner))

class CacheTests(unittest.TestCase):
    def test_key_is_versioned_and_content_bound(self):
        a=cache.fingerprint("tutor",{"id":1,"stem":"A","gab":"B"})
        b=cache.fingerprint("tutor",{"id":1,"stem":"A","gab":"C"})
        c=cache.fingerprint("tip",{"id":1,"stem":"A","gab":"B"})
        self.assertNotEqual(a,b);self.assertNotEqual(a,c)
        self.assertEqual(a,cache.fingerprint("tutor",{"gab":"B","stem":"A","id":1}))
        self.assertNotIn("stem",a[0])

    def test_cached_comment_reused_by_another_device(self):
        mem=MemoryCache();calls=[]
        key,digest=cache.fingerprint("tutor",{"id":2})
        def generate():
            calls.append(True)
            return {"fonte":"ia","schema_version":4,"question_id":2}
        valid=lambda x:x.get("fonte")=="ia" and x.get("schema_version")==4
        x=cache.get_or_generate(key=key,digest=digest,kind="tutor",
                                generator=generate,validator=valid,store=mem)
        y=cache.get_or_generate(key=key,digest=digest,kind="tutor",
                                generator=generate,validator=valid,store=mem)
        self.assertEqual(x,y);self.assertEqual(len(calls),1)
        self.assertEqual(mem.finished[0][2],"shared")

    def test_invalid_output_not_cached(self):
        mem=MemoryCache()
        key,digest=cache.fingerprint("tutor",{"id":4})
        out=cache.get_or_generate(key=key,digest=digest,kind="tutor",
                                  generator=lambda:{"fonte":"indisponivel"},
                                  validator=lambda x:x.get("fonte")=="ia",store=mem)
        self.assertIsNone(out);self.assertFalse(mem.rows)

    def test_private_kotu_cache_isolated(self):
        mem=MemoryCache()
        k1,d1=cache.fingerprint("kotu_study",{"question":5},owner_id="studentA")
        k2,d2=cache.fingerprint("kotu_study",{"question":5},owner_id="studentB")
        self.assertNotEqual(k1,k2)
        def gen():return {"material":{"titulo":"Revisão","flashcards":[1,2,3]}}
        valid=lambda x:bool(x.get("material",{}).get("titulo"))
        a=cache.get_or_generate(key=k1,digest=d1,kind="kotu_study",
                                owner="studentA",generator=gen,validator=valid,store=mem)
        self.assertIsNone(mem.get(k1,"private","studentB"))
        self.assertEqual(a,mem.get(k1,"private","studentA"))
        b=cache.get_or_generate(key=k2,digest=d2,kind="kotu_study",
                                owner="studentB",generator=gen,validator=valid,store=mem)
        self.assertEqual(b,a)
        self.assertEqual(len(mem.rows),2)

    def test_no_owner_never_creates_shared_kotu_material(self):
        mem=MemoryCache()
        key,dig=cache.fingerprint("kotu_study",{"question":5})
        out=cache.get_or_generate(key=key,digest=dig,kind="kotu_study",
                                  owner="",generator=lambda:{"material":{"titulo":"T"}},
                                  validator=lambda x:True,store=mem)
        self.assertEqual(out["material"]["titulo"],"T")
        self.assertEqual(mem.rows,{})

    def test_database_down_preserves_original_generator(self):
        mem=MemoryCache();mem.failure=True
        mem.claim=lambda *args,**kwargs:None
        key,dig=cache.fingerprint("tutor",{"id":8})
        out=cache.get_or_generate(key=key,digest=dig,kind="tutor",
                                  generator=lambda:{"fonte":"ia"},validator=lambda x:True,
                                  store=mem)
        self.assertEqual(out["fonte"],"ia")

    def test_pending_avoids_duplicate_model_call(self):
        mem=MemoryCache()
        key,dig=cache.fingerprint("tip",{"id":9})
        mem.claim=lambda *args,**kwargs:None
        def no_second_generation():raise AssertionError("duplicated generation")
        result=cache.get_or_generate(key=key,digest=dig,kind="tip",
                        generator=no_second_generation,validator=lambda x:True,store=mem)
        self.assertIsNone(result)

    def test_disabled_store_preserves_legacy(self):
        mem=cache.AICacheStore(url="",enabled=False)
        key,dig=cache.fingerprint("tutor",{"id":10})
        self.assertEqual(cache.get_or_generate(key=key,digest=dig,kind="tutor",
               generator=lambda:{"fonte":"ia"},validator=lambda x:True,store=mem)["fonte"],"ia")

    def test_groq_is_opt_in(self):
        import subprocess,os,sys
        env=dict(os.environ)
        for name in ["GROQ_API_KEY","CTI_GROQ_API_KEY","CTI_GEMINI_API_KEY","GEMINI_API_KEY",
                     "NVIDIA_API_KEY","CTI_NVIDIA_API_KEY","CTI_LLM_API_KEY",
                     "MEDQUEST_LLM_API_KEY","OPENAI_API_KEY"]:
            env.pop(name,None)
        env["GROQ_API_KEY"]="test-non-secret"
        out=subprocess.check_output([sys.executable,"-c",
             "import ia_provedores as m; print([(p.nome,p.url,p.modelo) for p in m.PROVEDORES])"],
             text=True,env=env)
        self.assertIn("Groq/Reserva",out)
        self.assertIn("https://api.groq.com/openai/v1",out)
        self.assertIn("openai/gpt-oss-120b",out)

if __name__=="__main__":
    unittest.main()
