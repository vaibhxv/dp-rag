"use client"

import * as React from "react"
import {
  DownloadIcon,
  ExternalLinkIcon,
  Maximize2Icon,
  MessageCircleIcon,
  Minimize2Icon,
  MoreHorizontalIcon,
  Trash2Icon,
  XIcon,
} from "lucide-react"
import { useShell } from "@/components/app-shell"
import { PdfViewer } from "@/components/panels/pdf-viewer"
import { StatusBadge } from "@/components/panels/status-badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { api, displayTitle, fileUrl, formatBytes, type PageDto } from "@/lib/api"
import { categoryMeta } from "@/lib/categories"
import { useLibrary } from "@/lib/store"
import { cn } from "cn"
import { toast } from "sonner"

export function DocumentPanel({
  id,
  page,
  highlight,
  focus,
  expanded,
  onToggleExpand,
  onClose,
}: {
  id: string
  page?: number
  highlight?: string
  focus?: string
  expanded: boolean
  onToggleExpand: () => void
  onClose: () => void
}) {
  const { documents, refresh } = useLibrary()
  const { setScope, openLibrary, showChat } = useShell()
  const doc = documents.find((d) => d.id === id)
  const [pages, setPages] = React.useState<PageDto[] | null>(null)
  const [tab, setTab] = React.useState<"text" | "scan">("text")
  const scroller = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    let alive = true
    api
      .pages(id)
      .then((p) => alive && setPages(p))
      .catch(() => alive && setPages([]))
    return () => {
      alive = false
    }
  }, [id, doc?.status])

  const goToPage = (n: number) =>
    scroller.current?.querySelector(`[data-page="${n}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" })

  if (!doc) {
    return (
      <>
        <PanelBar onClose={onClose} expanded={expanded} onToggleExpand={onToggleExpand} />
        <p className="p-6 text-sm text-muted-foreground">This document is no longer in the library.</p>
      </>
    )
  }

  const title = displayTitle(doc)
  const cat = categoryMeta(doc.category)

  return (
    <>
      <PanelBar
        onClose={onClose}
        expanded={expanded}
        onToggleExpand={onToggleExpand}
        crumb={
          <span className="truncate text-xs text-muted-foreground">
            <button className="text-primary hover:underline" onClick={() => openLibrary()}>
              Library
            </button>{" "}
            /{" "}
            <button className="hover:underline" onClick={() => openLibrary(doc.category)}>
              {cat.label}
            </button>
          </span>
        }
      >
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon" aria-label="Document actions" className="rounded-[10px] text-muted-foreground" />}
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem render={<a href={fileUrl(doc.id)} target="_blank" rel="noreferrer" />}>
              <ExternalLinkIcon />
              Open original in new tab
            </DropdownMenuItem>
            <DropdownMenuItem render={<a href={fileUrl(doc.id)} download={doc.filename} />}>
              <DownloadIcon />
              Download original
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onClick={async () => {
                try {
                  await api.deleteDocument(doc.id)
                  toast.success(`Deleted "${doc.filename}"`)
                  onClose()
                  void refresh()
                } catch (e) {
                  toast.error((e as Error).message)
                }
              }}
            >
              <Trash2Icon />
              Delete document
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PanelBar>

      <div className="flex shrink-0 flex-col gap-3 px-[22px] pt-5 pb-3.5">
        <h2 className="font-serif text-[26px] leading-[1.15] font-semibold tracking-[-0.01em] text-balance">{title}</h2>
        <div className="flex flex-wrap gap-1.5 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2.5 py-0.5 font-medium text-accent-foreground">
            <span className="size-1.5 rounded-[2px]" style={{ background: cat.color }} />
            {doc.category || "Uncategorised"}
          </span>
          <span className="rounded-full border bg-card px-2.5 py-0.5 text-ink-2">
            {doc.filename} · {doc.pageCount || "?"} page{doc.pageCount === 1 ? "" : "s"} · {formatBytes(doc.sizeBytes)}
          </span>
          {doc.ocrPageCount > 0 && (
            <span className="rounded-full bg-gold-soft px-2.5 py-0.5 font-medium text-gold-ink">
              {doc.ocrPageCount} scanned page{doc.ocrPageCount === 1 ? "" : "s"}
              {doc.ocrConfidence !== null && ` · OCR ${doc.ocrConfidence}%`}
            </span>
          )}
          <StatusBadge doc={doc} />
        </div>
        {doc.summary && <p className="text-[13.5px] leading-relaxed text-ink-2">{doc.summary}</p>}
        <div className="flex items-center gap-2">
          <div role="tablist" aria-label="View" className="grid flex-1 grid-cols-2 rounded-xl bg-[#F0EDE4] p-1">
            {(
              [
                ["text", "Text"],
                ["scan", doc.mimeType === "application/pdf" ? "Original scan" : "Original file"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn(
                  "h-[34px] rounded-[9px] text-[13px] transition-all",
                  tab === key ? "bg-card font-semibold text-foreground shadow-[0_1px_3px_rgba(13,23,51,0.1)]" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {doc.status === "ready" && (
            <Button
              variant="outline"
              className="h-[42px] rounded-xl bg-card"
              onClick={() => {
                setScope({ id: doc.id, title })
                showChat()
                toast.success("Questions now search only this document")
              }}
            >
              <MessageCircleIcon />
              Ask this document
            </Button>
          )}
        </div>
      </div>

      {tab === "text" ? (
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-[22px] pb-6">
          {!pages ? (
            <div className="flex flex-col gap-3 rounded-md bg-card p-6 shadow-sm">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {doc.status === "ready" || doc.status === "failed" ? "No extracted text." : "Text appears here once this document has been read."}
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {pages.map((p) => (
                <PaperPage
                  key={p.page}
                  page={p}
                  isCited={p.page === page}
                  highlight={p.page === page ? highlight : undefined}
                  focus={p.page === page ? focus : undefined}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-[22px] pb-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Stored on this computer{page ? ` · opened at page ${page}` : ""}</span>
            <a href={fileUrl(doc.id, page)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
              Open in new tab
              <ExternalLinkIcon className="size-3.5" />
            </a>
          </div>
          {doc.mimeType === "application/pdf" ? (
            <PdfViewer url={fileUrl(doc.id)} page={page} />
          ) : (
            <iframe title={`Original file: ${doc.filename}`} src={fileUrl(doc.id)} className="min-h-0 w-full flex-1 rounded-xl border bg-card" />
          )}
        </div>
      )}

      {tab === "text" && pages && pages.length > 1 && (
        <div className="flex shrink-0 items-center gap-2.5 overflow-x-auto border-t border-[#EEEADF] px-[22px] py-3">
          {pages.map((p) => (
            <button
              key={p.page}
              onClick={() => goToPage(p.page)}
              aria-label={`Page ${p.page}${p.page === page ? ", cited" : ""}`}
              className={cn(
                "flex h-[52px] w-10 shrink-0 items-end justify-center rounded bg-card pb-1 text-[11px] transition-shadow",
                p.page === page ? "font-semibold text-primary shadow-[0_0_0_2px_var(--primary)]" : "text-muted-foreground shadow-[0_0_0_1px_var(--border)] hover:shadow-[0_0_0_1px_var(--ring)]"
              )}
            >
              {p.page}
            </button>
          ))}
          {page && <span className="shrink-0 pl-1 text-xs text-muted-foreground">Cited on page {page} · highlighted in amber</span>}
        </div>
      )}
    </>
  )
}

function PanelBar({
  crumb,
  children,
  expanded,
  onToggleExpand,
  onClose,
}: {
  crumb?: React.ReactNode
  children?: React.ReactNode
  expanded: boolean
  onToggleExpand: () => void
  onClose: () => void
}) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-1 border-b border-[#EEEADF] pr-3 pl-[22px]">
      <div className="min-w-0 flex-1">{crumb}</div>
      {children}
      <Button variant="ghost" size="icon" aria-label={expanded ? "Shrink panel" : "Expand panel"} onClick={onToggleExpand} className="rounded-[10px] text-muted-foreground max-md:hidden">
        {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
      </Button>
      <Button variant="ghost" size="icon" aria-label="Close panel" onClick={onClose} className="rounded-[10px] text-muted-foreground">
        <XIcon />
      </Button>
    </div>
  )
}

/** One page of extracted text, set like a printed page, with the cited passage marked. */
function PaperPage({
  page,
  isCited,
  highlight,
  focus,
}: {
  page: PageDto
  isCited: boolean
  highlight?: string
  focus?: string
}) {
  const ref = React.useRef<HTMLElement>(null)
  const mark = React.useRef<HTMLElement>(null)
  const text = page.text
  const pieces = React.useMemo(() => {
    const passage = highlight ? findRange(text, highlight) : null
    const line = focus ? findRange(text, focus, passage?.[0] ?? 0) : null
    // [start, end, kind] in reading order; "soft" = rest of the passage.
    const out: [number, number, "plain" | "soft" | "strong"][] = []
    const push = (a: number, b: number, k: "plain" | "soft" | "strong") => b > a && out.push([a, b, k])
    if (passage && line && line[0] >= passage[0] && line[1] <= passage[1]) {
      push(0, passage[0], "plain")
      push(passage[0], line[0], "soft")
      push(line[0], line[1], "strong")
      push(line[1], passage[1], "soft")
      push(passage[1], text.length, "plain")
    } else if (line || passage) {
      const r = (line ?? passage)!
      push(0, r[0], "plain")
      push(r[0], r[1], "strong")
      push(r[1], text.length, "plain")
    } else push(0, text.length, "plain")
    return out
  }, [text, highlight, focus])

  React.useEffect(() => {
    if (!isCited) return
    const target = mark.current ?? ref.current
    target?.scrollIntoView({ block: mark.current ? "center" : "start", behavior: "smooth" })
  }, [isCited, pieces])

  return (
    <section
      ref={ref}
      data-page={page.page}
      className={cn(
        "relative scroll-mt-3 rounded-md bg-card px-[26px] pt-5 pb-6 shadow-[0_1px_2px_rgba(13,23,51,0.06),0_12px_30px_rgba(13,23,51,0.07)]",
        isCited && "ring-2 ring-primary/25"
      )}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2 text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        <span>Page {page.page}</span>
        {page.ocr && (
          <span className="rounded-full bg-gold-soft px-2 py-px tracking-normal text-gold-ink normal-case">
            Read by OCR{page.ocrConfidence !== null && ` · ${page.ocrConfidence}%`}
          </span>
        )}
      </div>
      <div className="font-serif text-[15px] leading-[1.75] whitespace-pre-wrap text-ink-2">
        {pieces.map(([a, b, kind]) =>
          kind === "plain" ? (
            <React.Fragment key={a}>{text.slice(a, b)}</React.Fragment>
          ) : kind === "soft" ? (
            <span key={a} className="bg-gold-soft/70 [box-decoration-break:clone]">
              {text.slice(a, b)}
            </span>
          ) : (
            <mark key={a} ref={mark} className="rounded-[3px] bg-highlight px-0.5 text-foreground [box-decoration-break:clone]">
              {text.slice(a, b)}
            </mark>
          )
        )}
      </div>
    </section>
  )
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

/**
 * Finds `needle` in the page text, tolerating different whitespace (chunks were
 * whitespace-normalised at ingestion). Anchors on its first and last words.
 */
function findRange(text: string, needle: string, from = 0): [number, number] | null {
  const words = needle.replace(/…/g, " ").split(/\s+/).filter(Boolean)
  if (words.length < 2) return null
  const pattern = (ws: string[]) => new RegExp(ws.map(escape).join("\\s+"))
  const n = Math.min(8, words.length)
  const hay = text.slice(from)
  const start = pattern(words.slice(0, n)).exec(hay)
  if (!start) return from ? findRange(text, needle, 0) : null
  const end = pattern(words.slice(-n)).exec(hay.slice(start.index))
  const s0 = from + start.index
  const endAt = end ? s0 + end.index + end[0].length : s0 + start[0].length
  return [s0, endAt]
}
