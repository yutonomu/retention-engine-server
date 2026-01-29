-- 暗黙知抽出・蓄積機能用マイグレーション
-- Supabase Dashboard → SQL Editor で実行してください

-- 1. pgvector拡張を有効化（初回のみ）
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. extracted_knowledge テーブル作成
CREATE TABLE IF NOT EXISTS extracted_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  tags TEXT[] DEFAULT '{}',
  source_conversation_id UUID,
  source_message_range JSONB,  -- {start_idx, end_idx} または null（全件）
  extracted_by UUID,
  embedding VECTOR(768),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 意味的類似検索用インデックス（IVFFlat）
CREATE INDEX IF NOT EXISTS idx_knowledge_embedding ON extracted_knowledge
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 4. カテゴリ別検索用インデックス
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON extracted_knowledge(category);

-- 5. 抽出者別検索用インデックス
CREATE INDEX IF NOT EXISTS idx_knowledge_extracted_by ON extracted_knowledge(extracted_by);

-- 6. RLS（Row Level Security）設定
ALTER TABLE extracted_knowledge ENABLE ROW LEVEL SECURITY;

-- 読み取り：認証済みユーザー全員
DROP POLICY IF EXISTS "knowledge_read" ON extracted_knowledge;
CREATE POLICY "knowledge_read" ON extracted_knowledge
  FOR SELECT TO authenticated USING (true);

-- 作成：認証済みユーザー（自分のIDで）
DROP POLICY IF EXISTS "knowledge_insert" ON extracted_knowledge;
CREATE POLICY "knowledge_insert" ON extracted_knowledge
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = extracted_by);

-- 7. 類似検索用の関数
CREATE OR REPLACE FUNCTION search_similar_knowledge(
  query_embedding VECTOR(768),
  similarity_threshold FLOAT DEFAULT 0.85,
  match_count INT DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  category VARCHAR(50),
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ek.id,
    ek.content,
    ek.category,
    1 - (ek.embedding <=> query_embedding) AS similarity
  FROM extracted_knowledge ek
  WHERE ek.embedding IS NOT NULL
    AND 1 - (ek.embedding <=> query_embedding) >= similarity_threshold
  ORDER BY ek.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
