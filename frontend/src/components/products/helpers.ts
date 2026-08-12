export function taxCategoryOptionLabel(tc: { label: string; rate_percent?: number | null }): string {
  return tc.rate_percent != null ? `${tc.label} (${tc.rate_percent}%)` : tc.label;
}
