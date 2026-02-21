-- Prevent gender from being changed once set.
-- Gender preference can still be updated freely.
CREATE OR REPLACE FUNCTION prevent_gender_change()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.gender IS NOT NULL AND NEW.gender IS DISTINCT FROM OLD.gender THEN
    RAISE EXCEPTION 'Gender cannot be changed once set';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_gender_immutability
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_gender_change();
