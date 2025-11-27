-- Add custom_prompt column to books table to store custom story/theme prompts
ALTER TABLE books ADD COLUMN IF NOT EXISTS custom_prompt TEXT NULL;

-- Backfill Janice's book with the custom prompt from generation data
UPDATE books 
SET custom_prompt = 'Magical forest quest' 
WHERE character_name = 'Janice' 
  AND custom_prompt IS NULL;