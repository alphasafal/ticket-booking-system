// All monetary values are stored as integer minor units (paise). This is
// the one place that formats them for display, so the rest of the app
// never touches a floating-point rupee amount.
export function formatINR(minorUnits: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(minorUnits / 100);
}
