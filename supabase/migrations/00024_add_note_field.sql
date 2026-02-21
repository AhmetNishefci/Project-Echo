-- Add optional short note to profiles (user's editable note, max 40 chars)
ALTER TABLE profiles
  ADD COLUMN note TEXT CHECK (char_length(note) <= 40);

-- Add note snapshot to ephemeral_ids (copied when token is created)
ALTER TABLE ephemeral_ids
  ADD COLUMN note TEXT;
