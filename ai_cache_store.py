"""CTI cache persistente de IA: Postgres, escopo explícito e leases distribuídos.

Não contém autenticação nem altera o estado de estudo. Falhas do banco nunca
invalidam respostas existentes. A ativação requer CTI_AI_CACHE_ENABLED=1 e migração.
"""
from __future__ import annotations

import hashlib
import json
import os
import secrets
import time
from dataclasses import dataclass
from typing import Any, Callable, Optional

CACHE_VERSION = "cti-ai-cache-v1"
PENDING_SECONDS = 105
CACHE_SECONDS = 180 * 86400
_PRIVATE_SECONDS = 60 * 86400


def fingerprint(kind: str, content: dict, owner_id: str = "") -> tuple[str, str]:
    """O hash vincula versão, objeto e usuário quando privado; sem PII na chave."""
    raw = json.dumps({"version": CACHE_VERSION, "kind": kind, "owner": owner_id,
                      "content": content}, ensure_ascii=False, sort_keys=True,
                     separators=(",", ":"), default=str).encode("utf-8")
    digest = hashlib.sha256(raw).hexdigest()
    return kind + ":" + digest, digest


@dataclass(frozen=True)
class Lease:
    cache_key: str
    token: str
    slot_id: int


class AICacheStore:
    def __init__(self, *, url: Optional[str] = None, enabled: Optional[bool] = None) -> None:
        # O banco de sync é isolado da autenticação (user_store).
        self.url = (url if url is not None else os.getenv("CTI_AI_CACHE_DATABASE_URL") or
                    os.getenv("CTI_SYNC_DATABASE_URL") or "").strip()
        self.enabled = (enabled if enabled is not None else
                        os.getenv("CTI_AI_CACHE_ENABLED", "0").lower() in ("1", "true", "yes", "on"))
        self.ready = bool(self.enabled and self.url)

    def _connection(self):
        import psycopg
        from psycopg.rows import dict_row
        return psycopg.connect(self.url, connect_timeout=4, row_factory=dict_row, autocommit=False)

    def get(self, key: str, scope: str, owner: Optional[str] = None) -> Optional[dict]:
        if not self.ready:
            return None
        try:
            with self._connection() as conn, conn.cursor() as cur:
                cur.execute("""SELECT payload FROM cti_ai_cache_v1
                            WHERE cache_key=%s AND scope=%s
                              AND owner_id IS NOT DISTINCT FROM %s
                              AND status='ready' AND expires_at>now()""",
                            (key, scope, owner if scope == "private" else None))
                row = cur.fetchone()
                return row["payload"] if row and isinstance(row["payload"], dict) else None
        except Exception:
            return None

    def claim(self, key: str, digest: str, kind: str, scope: str = "shared",
              owner: Optional[str] = None) -> Optional[Lease]:
        """Claim apenas se cache não existe/expirou; 3 slots globais. Nunca aguarda transação longa."""
        if not self.ready or (scope == "private" and not owner):
            return None
        if scope not in ("private", "shared") or kind not in ("tutor", "tip", "kotu_study"):
            return None
        token = secrets.token_hex(16)
        try:
            with self._connection() as conn, conn.cursor() as cur:
                # Uma transação de milissegundos; advisory lock por cache_key
                # elimina a corrida entre duas funções da Vercel.
                cur.execute("SELECT pg_try_advisory_xact_lock(hashtextextended(%s, 0)) AS acquired", (key,))
                if not cur.fetchone()["acquired"]:
                    return None
                cur.execute("""SELECT status,expires_at FROM cti_ai_cache_v1
                               WHERE cache_key=%s FOR UPDATE""", (key,))
                row = cur.fetchone()
                if row and row["expires_at"].timestamp() > time.time():
                    return None
                # Limite global distribuído sem criar centenas de requisições simultâneas.
                cur.execute("""SELECT slot_id FROM cti_ai_generation_slots_v1
                               WHERE lease_until<=now()
                               ORDER BY slot_id FOR UPDATE SKIP LOCKED LIMIT 1""")
                slot = cur.fetchone()
                if not slot:
                    return None
                cur.execute("""UPDATE cti_ai_generation_slots_v1
                               SET lease_token=%s, lease_until=now() + (%s || ' seconds')::interval
                               WHERE slot_id=%s""", (token, PENDING_SECONDS, slot["slot_id"]))
                cur.execute("""INSERT INTO cti_ai_cache_v1
                               (cache_key,kind,scope,owner_id,content_hash,status,claim_token,
                                payload,expires_at,updated_at)
                               VALUES (%s,%s,%s,%s,%s,'pending',%s,NULL,
                                       now() + (%s || ' seconds')::interval,now())
                               ON CONFLICT (cache_key) DO UPDATE
                               SET content_hash=EXCLUDED.content_hash,kind=EXCLUDED.kind,
                                   scope=EXCLUDED.scope,owner_id=EXCLUDED.owner_id,
                                   status='pending',claim_token=EXCLUDED.claim_token,
                                   payload=NULL,expires_at=EXCLUDED.expires_at,updated_at=now()""",
                            (key, kind, scope, owner if scope == "private" else None, digest,
                             token, PENDING_SECONDS))
                return Lease(key, token, int(slot["slot_id"]))
        except Exception:
            return None

    def finish(self, lease: Lease, payload: Optional[dict], scope: str,
               owner: Optional[str] = None) -> bool:
        if not self.ready:
            return False
        try:
            from psycopg.types.json import Jsonb
            with self._connection() as conn, conn.cursor() as cur:
                if isinstance(payload, dict):
                    ttl = _PRIVATE_SECONDS if scope == "private" else CACHE_SECONDS
                    cur.execute("""UPDATE cti_ai_cache_v1
                                   SET status='ready',payload=%s,claim_token=NULL,
                                       expires_at=now() + (%s || ' seconds')::interval,updated_at=now()
                                   WHERE cache_key=%s AND status='pending'
                                     AND claim_token=%s AND scope=%s
                                     AND owner_id IS NOT DISTINCT FROM %s""",
                                (Jsonb(payload), ttl, lease.cache_key, lease.token, scope,
                                 owner if scope == "private" else None))
                    stored = cur.rowcount == 1
                else:
                    cur.execute("""DELETE FROM cti_ai_cache_v1
                                   WHERE cache_key=%s AND status='pending' AND claim_token=%s""",
                                (lease.cache_key, lease.token))
                    stored = False
                cur.execute("""UPDATE cti_ai_generation_slots_v1
                               SET lease_token=NULL,lease_until=now()
                               WHERE slot_id=%s AND lease_token=%s""",
                            (lease.slot_id, lease.token))
                return stored
        except Exception:
            return False

    def wait_ready(self, key: str, scope: str, owner: Optional[str] = None,
                   seconds: float = 5.0) -> Optional[dict]:
        deadline = time.monotonic() + min(12.0, max(0, seconds))
        while time.monotonic() < deadline:
            value = self.get(key, scope, owner)
            if value is not None:
                return value
            time.sleep(.5)
        return self.get(key, scope, owner)


STORE = AICacheStore()


def tutor_key(q: dict, kind: str) -> tuple[str, str]:
    from ia_provedores import LETRAS
    return fingerprint(kind, {
        "id": q.get("id"), "edicao": q.get("edicao"), "exame": q.get("exame"),
        "enunciado": q.get("enunciado"), "gabarito": q.get("gabarito_oficial"),
        "alternativas": [q.get("alt_" + l) for l in LETRAS],
        "version": 4 if kind == "tutor" else 1,
    })


def get_or_generate(*, key: str, digest: str, kind: str, generator: Callable[[], Optional[dict]],
                    validator: Callable[[dict], bool], owner: Optional[str] = None,
                    wait_seconds: float = 6.0, store: Optional[AICacheStore] = None) -> Optional[dict]:
    """Only one caller generates when DB is healthy; never publishes invalid results.

    Database unavailable: run original generator (compatibility). Contended/limited:
    wait briefly and return None, not another costly generation.
    """
    cache = store if store is not None else STORE
    scope = "private" if owner else "shared"
    if not cache.ready:
        return generator()
    hit = cache.get(key, scope, owner)
    if isinstance(hit, dict) and validator(hit):
        return hit
    lease = cache.claim(key, digest, kind, scope, owner)
    if lease is None:
        return cache.wait_ready(key, scope, owner, seconds=wait_seconds)
    result = None
    try:
        result = generator()
        if result is not None and not validator(result):
            result = None
        return result
    finally:
        cache.finish(lease, result, scope, owner)
