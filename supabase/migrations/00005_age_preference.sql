-- Add age preference columns to profiles for age-based radar filtering.
-- NULL values mean "no age filter" (show all ages 18+).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS age_preference_min SMALLINT,
  ADD COLUMN IF NOT EXISTS age_preference_max SMALLINT;

-- Sanity constraints: min/max must be within valid age range
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_age_pref_min CHECK (age_preference_min IS NULL OR (age_preference_min >= 18 AND age_preference_min <= 80)),
  ADD CONSTRAINT chk_age_pref_max CHECK (age_preference_max IS NULL OR (age_preference_max >= 18 AND age_preference_max <= 80)),
  ADD CONSTRAINT chk_age_pref_range CHECK (age_preference_min IS NULL OR age_preference_max IS NULL OR age_preference_min <= age_preference_max);
