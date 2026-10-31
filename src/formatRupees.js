/** ₹ with Indian-style grouping (e.g. 1,23,456.78). */
export function formatRupees(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return "—";
  const n = Number(amount);
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
