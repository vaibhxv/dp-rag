/** Library categories (written by the local LLM at ingestion). */
export const CATEGORIES = [
  { key: "Notification", label: "Notifications", color: "var(--primary)" },
  { key: "Guidelines / SOP", label: "Guidelines & SOPs", color: "var(--gold)" },
  { key: "Tender / Procurement", label: "Tenders", color: "var(--crimson)" },
  { key: "Circular / Order", label: "Circulars & orders", color: "var(--slate-dot)" },
  { key: "Other", label: "Other", color: "#C3CAD9" },
] as const

export function categoryMeta(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1]
}
