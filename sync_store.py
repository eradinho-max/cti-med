"""Persistência versionada de estado do usuário no Neon/Postgres."""
from __future__ import annotations
import os
from typing import Any, Dict, Optional

class SyncStoreError(RuntimeError):
    pass

class SyncConflict(SyncStoreError):
    def __init__(self, current: dict):
        super().__init__("SYNC_CONFLICT")
        self.current=current

class SyncStore:
    def __init__(self) -> None:
        self.url=(os.environ.get("CTI_DATABASE_URL","").strip()
                  or os.environ.get("DATABASE_URL","").strip())

    @property
    def configured(self)->bool:
        return bool(self.url)

    def _connect(self):
        if not self.configured:
            raise SyncStoreError("Banco de sincronização não configurado")
        try:
            import psycopg
            from psycopg.rows import dict_row
            return psycopg.connect(self.url,connect_timeout=6,autocommit=True,row_factory=dict_row)
        except Exception as exc:
            raise SyncStoreError("Falha de conexão com sincronização") from exc

    def get(self,user_id:str,namespace:str="study")->Optional[dict]:
        try:
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute("""SELECT namespace,data,version,updated_at
                               FROM cti_user_state WHERE user_id=%s AND namespace=%s""",
                            (user_id,namespace))
                row=cur.fetchone()
            if not row:return None
            return {"namespace":row["namespace"],"data":row["data"] or {},
                    "version":int(row["version"] or 1),"updated_at":row["updated_at"]}
        except SyncStoreError: raise
        except Exception as exc: raise SyncStoreError("Falha ao ler sincronização") from exc

    def put(self,user_id:str,data:Dict[str,Any],base_version:Optional[int],namespace:str="study")->dict:
        try:
            from psycopg.types.json import Jsonb
            with self._connect() as conn, conn.cursor() as cur:
                cur.execute("""SELECT version FROM cti_user_state
                               WHERE user_id=%s AND namespace=%s FOR UPDATE""",(user_id,namespace))
                row=cur.fetchone()
                if not row:
                    if base_version not in (None,0):
                        raise SyncConflict({"namespace":namespace,"data":{},"version":0,"updated_at":None})
                    cur.execute("""INSERT INTO cti_user_state(user_id,namespace,data,version,updated_at)
                                   VALUES (%s,%s,%s,1,now())
                                   RETURNING data,version,updated_at""",
                                (user_id,namespace,Jsonb(data)))
                    out=cur.fetchone()
                else:
                    current=int(row["version"])
                    if base_version is None or int(base_version)!=current:
                        cur.execute("""SELECT data,version,updated_at FROM cti_user_state
                                       WHERE user_id=%s AND namespace=%s""",(user_id,namespace))
                        now=cur.fetchone()
                        raise SyncConflict({"namespace":namespace,"data":now["data"] or {},
                                            "version":int(now["version"]),"updated_at":now["updated_at"]})
                    cur.execute("""UPDATE cti_user_state
                                   SET data=%s,version=version+1,updated_at=now()
                                   WHERE user_id=%s AND namespace=%s
                                   RETURNING data,version,updated_at""",
                                (Jsonb(data),user_id,namespace))
                    out=cur.fetchone()
            return {"namespace":namespace,"data":out["data"] or {},
                    "version":int(out["version"]),"updated_at":out["updated_at"]}
        except SyncConflict: raise
        except SyncStoreError: raise
        except Exception as exc: raise SyncStoreError("Falha ao salvar sincronização") from exc
