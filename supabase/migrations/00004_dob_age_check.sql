-- Enforce minimum age of 18 at the database level (defense-in-depth).
-- The client validates this too, but this prevents bypass via direct API calls.
ALTER TABLE public.profiles
  ADD CONSTRAINT chk_dob_minimum_age
  CHECK (date_of_birth IS NULL OR date_of_birth <= CURRENT_DATE - INTERVAL '18 years');
