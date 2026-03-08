/** Return true if the person born on `dob` is at least `minAge` years old today. */
export function isAtLeastAge(dob: Date, minAge: number): boolean {
  const today = new Date();
  const cutoff = new Date(
    today.getFullYear() - minAge,
    today.getMonth(),
    today.getDate(),
  );
  return dob <= cutoff;
}
