-- knowledge_cards に question_card_id を追加（回答由来のKC用）
ALTER TABLE knowledge_cards
  ADD COLUMN question_card_id UUID REFERENCES question_cards(id) ON DELETE SET NULL;

CREATE INDEX idx_kc_question_card ON knowledge_cards(question_card_id);

-- question_cards.answer_count を KC側からも更新するトリガー
CREATE OR REPLACE FUNCTION update_question_answer_count_from_kc()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.question_card_id IS NOT NULL THEN
    UPDATE question_cards
    SET answer_count = answer_count + 1
    WHERE id = NEW.question_card_id;
  ELSIF TG_OP = 'DELETE' AND OLD.question_card_id IS NOT NULL THEN
    UPDATE question_cards
    SET answer_count = answer_count - 1
    WHERE id = OLD.question_card_id;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_kc_question_answer_count
  AFTER INSERT OR DELETE ON knowledge_cards
  FOR EACH ROW
  EXECUTE FUNCTION update_question_answer_count_from_kc();
