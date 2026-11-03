/** A price in paise, as rupees with Indian digit grouping. */
export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}
