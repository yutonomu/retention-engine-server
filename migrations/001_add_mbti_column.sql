-- Migration: Add MBTI column to user table
-- Description: Add mbti column to store user's Myers-Briggs Type Indicator personality type
-- Date: 2025-12-02

-- Add mbti column to user table
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS mbti VARCHAR(4);

-- Add comment to document the column
COMMENT ON COLUMN "user".mbti IS 'User MBTI personality type (16 types: INTJ, INTP, ENTJ, ENTP, INFJ, INFP, ENFJ, ENFP, ISTJ, ISFJ, ESTJ, ESFJ, ISTP, ISFP, ESTP, ESFP)';

-- Optional: Add check constraint to ensure only valid MBTI types
-- Uncomment if you want database-level validation
-- ALTER TABLE "user" ADD CONSTRAINT mbti_valid_type 
--   CHECK (mbti IS NULL OR mbti IN (
--     'INTJ', 'INTP', 'ENTJ', 'ENTP',
--     'INFJ', 'INFP', 'ENFJ', 'ENFP',
--     'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ',
--     'ISTP', 'ISFP', 'ESTP', 'ESFP'
--   ));
