-- =============================================
-- Migration 004: conversation テーブルに type カラム追加
-- Story 2-3: メンターAIチャット対応
-- =============================================

-- 1. type カラム追加 (既存レコードは 'student_chat' デフォルト)
ALTER TABLE public.conversation
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'student_chat'
  CHECK (type IN ('student_chat', 'mentor_ai_chat'));

-- 2. type カラムのインデックス作成
CREATE INDEX IF NOT EXISTS idx_conversation_type
  ON public.conversation (type);

-- 3. owner_id + type 複合インデックス (findByOwnerAndType クエリ最適化)
CREATE INDEX IF NOT EXISTS idx_conversation_owner_type
  ON public.conversation (owner_id, type);
