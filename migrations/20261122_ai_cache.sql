-- CTI: macrobloco de cache persistente de IA (somente novas tabelas).
-- Execute em homologação primeiro; depois em produção antes de ativar CTI_AI_CACHE_ENABLED.
CREATE TABLE IF NOT EXISTS public.cti_ai_cache_v1 (
  cache_key text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('tutor','tip','kotu_study')),
  scope text NOT NULL CHECK (scope IN ('shared','private')),
  owner_id text,
  content_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','ready')),
  claim_token text,
  payload jsonb,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cti_ai_cache_scope CHECK (
    (scope = 'shared' AND owner_id IS NULL) OR
    (scope = 'private' AND owner_id IS NOT NULL)
  ),
  CONSTRAINT cti_ai_cache_ready_payload CHECK (
    status <> 'ready' OR payload IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS idx_cti_ai_cache_expiry ON public.cti_ai_cache_v1 (expires_at);
CREATE INDEX IF NOT EXISTS idx_cti_ai_cache_private ON public.cti_ai_cache_v1 (owner_id, updated_at DESC) WHERE owner_id IS NOT NULL;

-- Semáforo global de chamadas externas, distribuído entre funções Vercel.
CREATE TABLE IF NOT EXISTS public.cti_ai_generation_slots_v1 (
  slot_id smallint PRIMARY KEY CHECK (slot_id BETWEEN 1 AND 8),
  lease_token text,
  lease_until timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cti_ai_generation_slots_v1 (slot_id)
SELECT generate_series(1, 3)::smallint
ON CONFLICT (slot_id) DO NOTHING;
