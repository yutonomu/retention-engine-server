-- Knowledge Cards マイグレーション (Story 2-3)
-- UX Spec 10.1 情報アーキテクチャ 2カードシステム準拠
-- Supabase Dashboard → SQL Editor で実行してください

-- ============================================
-- 1. 旧テーブル・関数を削除
-- ============================================
DROP FUNCTION IF EXISTS search_similar_knowledge;
DROP TABLE IF EXISTS extracted_knowledge;

-- ============================================
-- 2. knowledge_cards テーブル作成
-- ============================================
CREATE TABLE knowledge_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,                            -- マークダウン (状況/ノウハウ/注意点 構造化)
  source_type VARCHAR(20) NOT NULL DEFAULT 'expert',  -- expert | ai | document | merged
  status VARCHAR(20) NOT NULL DEFAULT 'draft',        -- draft | verified | official
  creator_id UUID NOT NULL,                         -- 作成者 (メンター or AI)
  verifier_id UUID,                                 -- 検証者 (所長) — Epic 4で使用
  project_id UUID,                                  -- 所属現場 — 将来マルチプロジェクト
  tags TEXT[] DEFAULT '{}',
  confidence REAL,                                  -- AI 信頼度 (0.0~1.0)
  source_conversation_id UUID,                      -- 出処会話
  source_message_range JSONB,                       -- {start_index, end_index}
  embedding VECTOR(768),                            -- pgvector セマンティック検索
  created_at TIMESTAMPTZ DEFAULT NOW(),
  verified_at TIMESTAMPTZ,                          -- 検証日時
  view_count INT DEFAULT 0,
  useful_count INT DEFAULT 0                        -- 「役に立った」カウント
);

-- ============================================
-- 3. インデックス
-- ============================================
CREATE INDEX idx_kc_embedding ON knowledge_cards
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_kc_status ON knowledge_cards(status);
CREATE INDEX idx_kc_creator ON knowledge_cards(creator_id);
CREATE INDEX idx_kc_source_type ON knowledge_cards(source_type);
CREATE INDEX idx_kc_tags ON knowledge_cards USING gin(tags);

-- ============================================
-- 4. RLS (Row Level Security)
-- ============================================
ALTER TABLE knowledge_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kc_read" ON knowledge_cards
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "kc_insert" ON knowledge_cards
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = creator_id);

CREATE POLICY "kc_update_own" ON knowledge_cards
  FOR UPDATE TO authenticated
  USING (auth.uid() = creator_id OR auth.uid() = verifier_id);

-- ============================================
-- 5. 類似KC検索関数
-- ============================================
CREATE OR REPLACE FUNCTION search_similar_knowledge_cards(
  query_embedding VECTOR(768),
  similarity_threshold FLOAT DEFAULT 0.85,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  title VARCHAR(200),
  content TEXT,
  source_type VARCHAR(20),
  status VARCHAR(20),
  tags TEXT[],
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.id, kc.title, kc.content, kc.source_type, kc.status, kc.tags,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM knowledge_cards kc
  WHERE kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ============================================
-- カウンター増加関数
-- ============================================

CREATE OR REPLACE FUNCTION increment_kc_view_count(row_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE knowledge_cards SET view_count = view_count + 1 WHERE id = row_id;
$$;

CREATE OR REPLACE FUNCTION increment_kc_useful_count(row_id UUID)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE knowledge_cards SET useful_count = useful_count + 1 WHERE id = row_id;
$$;
