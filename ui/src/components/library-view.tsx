"use client"

import * as React from "react"
import { SearchIcon, UploadIcon } from "lucide-react"
import { useShell } from "@/components/app-shell"
import { progressFraction } from "@/components/panels/status-badge"
import { displayTitle, thumbnailUrl, type DocumentDto } from "@/lib/api"
import { CATEGORIES, categoryMeta } from "@/lib/categories"
import { useLibrary } from "@/lib/store"
import { cn } from "cn"

type Filter = { kind: "all" } | { kind: "category"; value: string } | { kind: "scanned" }

export function LibraryView({ initialCategory }: { initialCategory?: string; compact?: boolean }) {
  const { documents } = useLibrary()
  const { openDocument, openIngest } = useShell()
  const [query, setQuery] = React.useState("")
  const [filter, setFilter] = React.useState<Filter>(
    initialCategory ? { kind: "category", value: initialCategory } : { kind: "all" }
  )

  const pages = documents.reduce((n, d) => n + d.pageCount, 0)
  const q = query.trim().toLowerCase()
  const visible = documents.filter((d) => {
    if (q && ![d.title, d.filename, d.summary, d.category].some((s) => s.toLowerCase().includes(q))) return false
    if (filter.kind === "scanned") return d.ocrPageCount > 0
    if (filter.kind === "category") return d.category === filter.value
    return true
  })
  const same = (a: Filter) => JSON.stringify(a) === JSON.stringify(filter)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex flex-col gap-6 px-6 py-8 sm:px-9">
        <header className="flex flex-wrap items-end gap-4">
          <div className="min-w-[260px] flex-1">
            <div className="text-xs font-semibold tracking-[0.1em] text-gold-ink uppercase">Library</div>
            <h1 className="mt-1 font-serif text-[40px] leading-[1.1] font-medium tracking-[-0.02em]">
              {documents.length} documents, {pages} pages
            </h1>
            <p className="mt-1.5 max-w-[620px] text-ink-2/90">
              Originals are kept on this computer. Titles, summaries and categories were written by the local model at
              ingestion.
            </p>
          </div>
          <label className="flex h-[46px] w-[340px] max-w-full items-center gap-2.5 rounded-[14px] border border-input bg-card px-4 text-muted-foreground focus-within:border-ring">
            <SearchIcon className="size-[17px]" />
            <span className="sr-only">Search the library</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search titles, files, summaries"
              className="flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
            />
          </label>
        </header>

        <div className="flex flex-wrap items-center gap-2">
          <Chip active={same({ kind: "all" })} onClick={() => setFilter({ kind: "all" })}>
            All · {documents.length}
          </Chip>
          {CATEGORIES.map((c) => {
            const count = documents.filter((d) => d.category === c.key).length
            if (!count) return null
            const f: Filter = { kind: "category", value: c.key }
            return (
              <Chip key={c.key} active={same(f)} onClick={() => setFilter(f)}>
                <span className="size-2 rounded-[3px]" style={{ background: c.color }} />
                {c.label} · {count}
              </Chip>
            )
          })}
          <span className="mx-1 h-6 w-px bg-border" />
          <Chip active={same({ kind: "scanned" })} onClick={() => setFilter({ kind: "scanned" })} gold>
            Scanned · {documents.filter((d) => d.ocrPageCount > 0).length}
          </Chip>
        </div>

        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-[18px]">
          <button
            onClick={openIngest}
            className="flex min-h-[290px] flex-col items-center justify-center gap-2.5 rounded-[20px] border-[1.5px] border-dashed border-[#B9C6E4] bg-[#F7F9FF] p-6 text-center transition-colors hover:border-primary hover:bg-accent"
          >
            <span className="flex size-[52px] items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-[0_8px_20px_rgba(28,58,148,0.25)]">
              <UploadIcon className="size-[22px]" />
            </span>
            <span className="font-serif text-xl font-medium">Add documents</span>
            <span className="text-[13px] text-muted-foreground">Drop PDFs, Word or text files. Scanned pages are read with OCR.</span>
          </button>
          {visible.map((d) => (
            <DocCard key={d.id} doc={d} onOpen={() => openDocument({ id: d.id, from: "library" })} />
          ))}
        </div>
        {visible.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">No documents match.</p>
        )}
      </div>
    </div>
  )
}

function Chip({
  active,
  gold,
  onClick,
  children,
}: {
  active: boolean
  gold?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] transition-colors",
        active
          ? "border-navy-ink bg-navy-ink font-medium text-white"
          : gold
            ? "border-gold-line bg-gold-soft text-gold-ink hover:border-gold"
            : "bg-card text-ink-2 hover:border-primary/40"
      )}
    >
      {children}
    </button>
  )
}

/** Added in the last two hours: worth a "New" badge. */
const isNew = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 2 * 3600_000

function DocCard({ doc, onOpen }: { doc: DocumentDto; onOpen: () => void }) {
  const cat = categoryMeta(doc.category)
  // Scanned pages render faithfully; text-only PDFs can come out blank without
  // their fonts on the server, so those get a drawn page instead.
  const [thumbOk, setThumbOk] = React.useState(doc.mimeType === "application/pdf" && doc.ocrPageCount > 0)
  const pending = doc.status === "queued" || doc.status === "processing"

  return (
    <button
      onClick={onOpen}
      className="group flex flex-col overflow-hidden rounded-[20px] border bg-card text-left shadow-[0_1px_2px_rgba(13,23,51,0.04)] transition-all hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_14px_34px_rgba(13,23,51,0.09)]"
    >
      <span
        className={cn(
          "relative flex h-[132px] items-end justify-center overflow-hidden",
          doc.ocrPageCount > 0 ? "bg-[#F3F1EA]" : "bg-[#EEF2FA]"
        )}
      >
        {thumbOk && doc.status === "ready" ? (
          // eslint-disable-next-line @next/next/no-img-element -- served by the API, already sized
          <img
            src={thumbnailUrl(doc.id)}
            alt=""
            loading="lazy"
            onError={() => setThumbOk(false)}
            className="h-[112px] w-[118px] rounded-t object-cover object-top shadow-[0_6px_16px_rgba(13,23,51,0.12)] transition-transform group-hover:-translate-y-1"
          />
        ) : (
          <span className="flex h-[112px] w-[118px] flex-col gap-[5px] rounded-t bg-card px-3.5 pt-4 shadow-[0_6px_16px_rgba(13,23,51,0.1)]">
            <span className="h-[5px] w-3/5 rounded-sm opacity-60" style={{ background: cat.color }} />
            {[100, 80, 100, 70].map((w, i) => (
              <span key={i} className="h-[3px] rounded-sm bg-[#E8ECF3]" style={{ width: `${w}%` }} />
            ))}
          </span>
        )}
        <span
          className={cn(
            "absolute top-3 left-3 rounded-full px-2 py-0.5 text-[11px] font-semibold",
            doc.ocrPageCount > 0 ? "bg-gold-soft text-gold-ink" : "bg-card text-ink-2 shadow-[0_0_0_1px_var(--border)]"
          )}
        >
          {doc.ocrPageCount > 0 ? "OCR" : "Digital"}
        </span>
        {isNew(doc.processedAt) && (
          <span className="absolute top-3 right-3 rounded-full bg-ok px-2 py-0.5 text-[11px] font-semibold text-white">New</span>
        )}
      </span>
      <span className="h-[3px]" style={{ background: cat.color }} />
      <span className="flex flex-col gap-1.5 px-4 pt-3.5 pb-4">
        <span className="line-clamp-3 font-serif text-[17px] leading-[1.25] font-semibold">
          {doc.status === "ready" ? displayTitle(doc) : doc.filename}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {doc.filename}
          {doc.pageCount > 0 && ` · ${doc.pageCount} page${doc.pageCount === 1 ? "" : "s"}`}
          {doc.chunkCount > 0 && ` · ${doc.chunkCount} passages`}
        </span>
        {pending ? (
          <span className="flex flex-col gap-1.5 pt-1">
            <span className="text-xs font-medium text-primary">{doc.progress || "Waiting in queue"}</span>
            <span className="h-[5px] rounded-full bg-accent">
              <span className="block h-[5px] rounded-full bg-primary transition-[width] duration-700" style={{ width: `${Math.max(4, progressFraction(doc) * 100)}%` }} />
            </span>
          </span>
        ) : doc.status === "failed" ? (
          <span className="text-xs text-crimson">Failed: {doc.error}</span>
        ) : (
          doc.summary && <span className="line-clamp-2 text-[13px] leading-[1.45] text-ink-2">{doc.summary}</span>
        )}
      </span>
    </button>
  )
}
