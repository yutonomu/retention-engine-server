-- =============================================
-- Migration 003: knowledge_cards テーブル作成
-- Story 2-3: 暗黙知自動識別 & KC生成
-- =============================================

-- 1. 旧テーブル削除 (存在する場合)
DROP TABLE IF EXISTS public.extracted_knowledge CASCADE;

-- 2. knowledge_cards テーブル作成
CREATE TABLE IF NOT EXISTS public.knowledge_cards (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  content         TEXT NOT NULL,                    -- マークダウン (状況/ノウハウ/注意点)
  source_type     TEXT NOT NULL DEFAULT 'expert'
                  CHECK (source_type IN ('expert', 'ai', 'document', 'merged')),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'verified', 'official')),
  creator_id      UUID NOT NULL,
  verifier_id     UUID,
  project_id      UUID,
  tags            TEXT[] NOT NULL DEFAULT '{}',
  confidence      NUMERIC(3,2),                     -- 0.00 ~ 1.00
  source_conversation_id UUID,
  source_message_range   JSONB,                     -- { start_index, end_index }
  embedding       vector(768),                      -- pgvector
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verified_at     TIMESTAMPTZ,
  view_count      INTEGER NOT NULL DEFAULT 0,
  useful_count    INTEGER NOT NULL DEFAULT 0
);

-- 3. インデックス
CREATE INDEX IF NOT EXISTS idx_kc_status       ON public.knowledge_cards (status);
CREATE INDEX IF NOT EXISTS idx_kc_source_type  ON public.knowledge_cards (source_type);
CREATE INDEX IF NOT EXISTS idx_kc_creator      ON public.knowledge_cards (creator_id);
CREATE INDEX IF NOT EXISTS idx_kc_tags         ON public.knowledge_cards USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_kc_created_at   ON public.knowledge_cards (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kc_conversation ON public.knowledge_cards (source_conversation_id)
  WHERE source_conversation_id IS NOT NULL;

-- pgvector: IVFFlat or HNSW (HNSWの方が検索品質が高い)
-- 少量データ段階では cosine index を作成
CREATE INDEX IF NOT EXISTS idx_kc_embedding ON public.knowledge_cards
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- 4. RLS ポリシー
ALTER TABLE public.knowledge_cards ENABLE ROW LEVEL SECURITY;

-- 認証ユーザーは読み取り可能
CREATE POLICY "kc_select_authenticated"
  ON public.knowledge_cards FOR SELECT
  TO authenticated
  USING (true);

-- 作成者は自分のKCを作成・更新可能
CREATE POLICY "kc_insert_authenticated"
  ON public.knowledge_cards FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "kc_update_own"
  ON public.knowledge_cards FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id);

-- service_role は全操作可能（バックエンド用）
CREATE POLICY "kc_service_role_all"
  ON public.knowledge_cards FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. 類似KC検索 RPC関数
CREATE OR REPLACE FUNCTION public.search_similar_kcs(
  query_embedding vector(768),
  similarity_threshold FLOAT DEFAULT 0.85,
  match_limit INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title TEXT,
  content TEXT,
  source_type TEXT,
  status TEXT,
  tags TEXT[],
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id,
    kc.title,
    kc.content,
    kc.source_type,
    kc.status,
    kc.tags,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_cards kc
  WHERE kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;
