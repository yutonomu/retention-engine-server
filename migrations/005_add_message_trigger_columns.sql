-- Story 2-6: 暗黙知トリガー検出メタデータ
-- message テーブルにトリガー関連カラムを追加

-- 1. トリガータイプカラム追加
ALTER TABLE message ADD COLUMN IF NOT EXISTS trigger_type TEXT
  CHECK (trigger_type IN (
    'REBUTTAL',
    'SHARP_INSIGHT',
    'ALTERNATIVE_PERSPECTIVE',
    'EXPERIENCE_SHARING',
    'QUANTIFICATION'
  ));

-- 2. トリガー信頼度カラム追加 (0.00 ~ 1.00)
ALTER TABLE message ADD COLUMN IF NOT EXISTS trigger_confidence NUMERIC(3,2)
  CHECK (trigger_confidence >= 0.00 AND trigger_confidence <= 1.00);

-- 3. トリガー検出箇所の抜粋
ALTER TABLE message ADD COLUMN IF NOT EXISTS trigger_excerpt TEXT;

-- 4. インデックス追加 (トリガーがあるメッセージを効率的に検索)
CREATE INDEX IF NOT EXISTS idx_message_trigger_type 
  ON message(trigger_type) 
  WHERE trigger_type IS NOT NULL;

-- 5. 会話別トリガー集計用複合インデックス
CREATE INDEX IF NOT EXISTS idx_message_conv_trigger 
  ON message(conv_id, trigger_type) 
  WHERE trigger_type IS NOT NULL;

COMMENT ON COLUMN message.trigger_type IS '暗黙知トリガータイプ: REBUTTAL, SHARP_INSIGHT, ALTERNATIVE_PERSPECTIVE, EXPERIENCE_SHARING, QUANTIFICATION';
COMMENT ON COLUMN message.trigger_confidence IS 'トリガー検出信頼度 (0.8以上が有効)';
COMMENT ON COLUMN message.trigger_excerpt IS 'トリガーが検出されたテキスト抜粋';
