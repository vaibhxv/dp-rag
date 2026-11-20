import { Loader2Icon } from "lucide-react"
import type { DocumentDto } from "@/lib/api"

export function StatusBadge({ doc }: { doc: DocumentDto }) {
  switch (doc.status) {
    case "ready":
      return null
    case "failed":
      return (
        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs text-red-700" title={doc.error}>
          Failed
        </span>
      )
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">
          <Loader2Icon className="size-3 animate-spin" />
          {doc.progress || (doc.status === "queued" ? "Queued" : "Processing")}
        </span>
      )
  }
}

/** "OCR page 3 of 12" -> 0.25; used for progress bars. */
export function progressFraction(doc: DocumentDto): number {
  if (doc.status === "ready") return 1
  if (doc.status === "queued") return 0
  const m = /OCR page (\d+) of (\d+)/.exec(doc.progress)
  if (m) return 0.1 + 0.75 * ((Number(m[1]) - 1) / Number(m[2]))
  if (doc.progress.startsWith("Summarising")) return 0.88
  if (doc.progress.startsWith("Embedding")) return 0.95
  return 0.05
}
