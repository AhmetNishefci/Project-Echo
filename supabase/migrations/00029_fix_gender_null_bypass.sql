-- 00029: Fix gender immutability trigger NULL bypass
--
-- BUG: The previous trigger only blocks changing gender from one non-NULL value
-- to another. But if gender is set (e.g. 'male'), a client could bypass
-- immutability by first setting gender to NULL, then to a different value.
--
-- FIX: Also prevent clearing gender once set (NULL-ing a non-NULL gender).

CREATE OR REPLACE FUNCTION prevent_gender_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.gender IS NOT NULL AND (NEW.gender IS NULL OR NEW.gender IS DISTINCT FROM OLD.gender) THEN
    RAISE EXCEPTION 'Gender cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
