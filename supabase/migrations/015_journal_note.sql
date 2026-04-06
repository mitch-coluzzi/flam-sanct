-- Free-form journal entry, addable after day completion
ALTER TABLE daily_logs ADD COLUMN journal_note text;
