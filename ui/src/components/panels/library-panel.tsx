"use client"

import * as React from "react"
import { SearchIcon, UploadIcon } from "lucide-react"
import { useShell } from "@/components/app-shell"
import { PanelHeader } from "@/components/panels/panel-header"
import { StatusBadge } from "@/components/panels/status-badge"
import { Button } from "@/components/ui/button"
import { displayTitle, type DocumentDto } from "@/lib/api"
import { useLibrary } from "@/lib/store"
import { cn } from "cn"

const CATEGORY_ORDER = ["Notification", "Circular / Order", "Guidelines / SOP", "Tender / Procurement", "Other"]

type Filter = { kind: "all" } | { kind: "category"; value: string } | { kind: "ocr" } | { kind: "pending" }

export function LibraryPanel({
  expanded,
  onToggleExpand,
  onClose,
}: {
  expanded: boolean
  onToggleExpand: () => void
  onClose: () => void
}) {
  const { documents } = useLibrary()
  const { openDocument, openIngest } = useShell()
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<Filter>({ kind: "all" })

  const q = query.trim().toLowerCase()
  const matches = (d: DocumentDto) =>
    !q ||
    [d.title, d.filename, d.summary, d.category].some((s) => s.toLowerCase().includes(q))
  const passes = (d: DocumentDto) => {
    switch (filter.kind) {
      case "all":
        return true
      case "ocr":
        return d.ocrPageCount > 0
      case "pending":
        return d.status === "queued" || d.status === "processing" || d.status === "failed"
      case "category":
        return d.category === filter.value
    }
  }
  const visible = documents.filter((d) => matches(d) && passes(d))

  const pending = documents.filter((d) => d.status !== "ready")
  const groups = new Map<string, DocumentDto[]>()
  for (const d of visible) {
    const key = d.status === "ready" ? d.category || "Other" : "Being ingested"
    groups.set(key, [...(groups.get(key) ?? []), d])
  }
  const order = ["Being ingested", ...CATEGORY_ORDER]
  const sortedGroups = [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))

  const categories = CATEGORY_ORDER.filter((c) => documents.some((d) => d.category === c))
  const chips: { label: string; f: Filter; count: number }[] = [
    { label: "All", f: { kind: "all" }, count: documents.length },
    ...categories.map((c) => ({
      label: c,
      f: { kind: "category", value: c } as Filter,
      count: documents.filter((d) => d.category === c).length,
    })),
    { label: "Scanned (OCR)", f: { kind: "ocr" }, count: documents.filter((d) => d.ocrPageCount > 0).length },
    ...(pending.length ? [{ label: "Ingesting", f: { kind: "pending" } as Filter, count: pending.length }] : []),
  ]
  const same = (a: Filter, b: Filter) => JSON.stringify(a) === JSON.stringify(b)

  return (
    <>
      <PanelHeader title="Library" expanded={expanded} onToggleExpand={onToggleExpand} onClose={onClose}>
        <Button size="sm" variant="outline" onClick={openIngest} className="mr-1">
          <UploadIcon />
          Ingest
        </Button>
      </PanelHeader>
      <div className="flex shrink-0 flex-col gap-3 px-5 pt-4 pb-2">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Library</h2>
          <p className="text-[13px] text-muted-foreground">
            Every ingested document with its original file and extracted text.
          </p>
        </div>
        <label className="flex h-10 items-center gap-2 rounded-[10px] border border-input px-3 text-muted-foreground focus-within:border-ring">
          <SearchIcon className="size-4" />
          <span className="sr-only">Search the library</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search titles, file names or summaries"
            className="flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
          />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button
              key={c.label}
              onClick={() => setFilter(c.f)}
              className={cn(
                "h-7 rounded-full border px-3 text-[13px] transition-colors",
                same(filter, c.f)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:border-primary/40"
              )}
            >
              {c.label} <span className="opacity-70">{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {visible.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {documents.length ? "No documents match." : "The library is empty. Ingest some documents to start."}
          </p>
        )}
        {sortedGroups.map(([group, docs]) => (
          <section key={group} className="pt-3">
            <h3 className="pb-1.5 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
              {group} · {docs.length}
            </h3>
            <ul className="flex flex-col gap-1">
              {docs.map((d) => (
                <li key={d.id}>
                  <button
                    onClick={() => openDocument({ id: d.id, from: "library" })}
                    className="flex w-full items-start gap-3 rounded-[10px] border border-transparent p-2.5 text-left transition-colors hover:border-border hover:bg-secondary/50"
                  >
                    <FileGlyph mime={d.mimeType} />
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-sm leading-snug font-medium">{displayTitle(d)}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {d.filename}
                        {d.pageCount > 0 && ` · ${d.pageCount} page${d.pageCount === 1 ? "" : "s"}`}
                        {d.chunkCount > 0 && ` · ${d.chunkCount} passages`}
                      </span>
                      {d.status !== "ready" && (
                        <span className="pt-1">
                          <StatusBadge doc={d} />
                        </span>
                      )}
                    </span>
                    {d.status === "ready" && (
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px]",
                          d.ocrPageCount > 0 ? "bg-ocr text-ocr-foreground" : "bg-secondary text-slate-600"
                        )}
                      >
                        {d.ocrPageCount > 0 ? "OCR" : "Digital"}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  )
}

export function FileGlyph({ mime, small = false }: { mime: string; small?: boolean }) {
  const label = mime === "application/pdf" ? "PDF" : mime.includes("word") ? "DOC" : "TXT"
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-end justify-center rounded-md pb-1 font-bold",
        label === "PDF" ? "bg-[#FDECEC] text-[#B42318]" : "bg-accent text-primary",
        small ? "h-9 w-[30px] text-[9px]" : "h-11 w-9 text-[10px]"
      )}
    >
      {label}
    </span>
  )
}
