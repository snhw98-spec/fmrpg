/** Age as of a given in-save date — player records only store dateOfBirth, so age must
 * always be derived relative to the save's current date, never a fixed "today". */
export function ageAt(dateOfBirth: string, asOfDate: string): number {
  const dob = new Date(dateOfBirth);
  const now = new Date(asOfDate);
  let a = now.getFullYear() - dob.getFullYear();
  if (now.getMonth() < dob.getMonth() || (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())) a--;
  return a;
}
