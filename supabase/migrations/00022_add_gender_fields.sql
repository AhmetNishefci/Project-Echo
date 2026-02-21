-- Add gender and gender preference to profiles
ALTER TABLE profiles
  ADD COLUMN gender TEXT CHECK (gender IN ('male', 'female')),
  ADD COLUMN gender_preference TEXT CHECK (gender_preference IN ('male', 'female', 'both')) DEFAULT 'both';
