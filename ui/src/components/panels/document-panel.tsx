"use client"

import * as React from "react"
import {
  DownloadIcon,
  ExternalLinkIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  Trash2Icon,
} from "lucide-react"
import { useShell } from "@/components/app-shell"
import { PanelHeader } from "@/components/panels/panel-header"
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, displayTitle, fileUrl, formatBytes, type PageDto } from "@/lib/api"
import { useLibrary } from "@/lib/store"
import { cn } from "cn"
import { toast } from "sonner"

export function DocumentPanel({
  id,
  page,
  highlight,
  expanded,
  onToggleExpand,
  onBack,
  onClose,
}: {
  id: string
  page?: number
  highlight?: string
  expanded: boolean
  onToggleExpand: () => void
  onBack?: () => void
  onClose: () => void
}) {
  const { documents, refresh } = useLibrary()
  const { setScope } = useShell()
  const doc = documents.find((d) => d.id === id)
  const [pages, setPages] = React.useState<PageDto[] | null>(null)
  const [tab, setTab] = React.useState<string>("text")

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

  // Scroll the cited page into view once the text is there.
  const target = React.useRef<HTMLElement | null>(null)
  React.useEffect(() => {
    if (pages && target.current) {
      target.current.scrollIntoView({ block: "start", behavior: "smooth" })
    }
  }, [pages])

  if (!doc) {
    return (
      <>
        <PanelHeader title="Document" expanded={expanded} onToggleExpand={onToggleExpand} onClose={onClose} onBack={onBack} />
        <p className="p-6 text-sm text-muted-foreground">This document is no longer in the library.</p>
      </>
    )
  }

  const title = displayTitle(doc)

  return (
    <>
      <PanelHeader title="Document" expanded={expanded} onToggleExpand={onToggleExpand} onClose={onClose} onBack={onBack}>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" aria-label="Document actions" className="text-muted-foreground" />}
          >
            <MoreHorizontalIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
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
      </PanelHeader>

      <div className="flex shrink-0 flex-col gap-3 px-5 pt-4 pb-3">
        <div className="text-xs text-muted-foreground">
          {doc.filename} · {doc.pageCount || "?"} page{doc.pageCount === 1 ? "" : "s"} · {formatBytes(doc.sizeBytes)}
        </div>
        <h2 className="text-xl leading-snug font-semibold tracking-tight">{title}</h2>
        {doc.summary && <p className="text-sm leading-relaxed text-slate-600">{doc.summary}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          {doc.category && (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-slate-600">{doc.category}</span>
          )}
          <StatusBadge doc={doc} />
          {doc.ocrPageCount > 0 && (
            <span className="rounded-full bg-ocr px-2 py-0.5 text-xs text-ocr-foreground">
              {doc.ocrPageCount} page{doc.ocrPageCount === 1 ? "" : "s"} OCR&apos;d
              {doc.ocrConfidence !== null && ` · ${doc.ocrConfidence}% confidence`}
            </span>
          )}
          {doc.status === "ready" && (
            <Button
              size="xs"
              variant="outline"
              className="ml-auto"
              onClick={() => {
                setScope({ id: doc.id, title })
                toast.success("Questions now search only this document")
              }}
            >
              <MessageSquareTextIcon />
              Ask this document
            </Button>
          )}
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="flex min-h-0 flex-1 flex-col gap-0">
        <div className="px-5 pb-3">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="text">Extracted text</TabsTrigger>
            <TabsTrigger value="pdf">Original {doc.mimeType === "application/pdf" ? "PDF" : "file"}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="text" className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
          {!pages ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : pages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {doc.status === "ready" || doc.status === "failed"
                ? "No extracted text."
                : "Text appears here once this document has been read."}
            </p>
          ) : (
            <div className="flex flex-col gap-5">
              {pages.map((p) => {
                const isTarget = p.page === page
                return (
                  <section
                    key={p.page}
                    ref={isTarget ? (el) => void (target.current = el) : undefined}
                    className="scroll-mt-3"
                  >
                    <div className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
                      Page {p.page}
                      {p.ocr && (
                        <span className="rounded-full bg-ocr px-1.5 py-px tracking-normal text-ocr-foreground normal-case">
                          OCR{p.ocrConfidence !== null && ` ${p.ocrConfidence}%`}
                        </span>
                      )}
                      {isTarget && <span className="tracking-normal text-primary normal-case">Cited page</span>}
                    </div>
                    <div
                      className={cn(
                        "rounded-xl border p-3.5 text-[13px] leading-[1.7] whitespace-pre-wrap text-slate-700",
                        isTarget && "border-primary/30 bg-[#F7F9FF]"
                      )}
                    >
                      <HighlightedText text={p.text} highlight={isTarget ? highlight : undefined} />
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pdf" className="flex min-h-0 flex-1 flex-col gap-2 px-5 pb-5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Stored in the local file store{page ? ` · opened at page ${page}` : ""}</span>
            <a
              href={fileUrl(doc.id, page)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            >
              Open in new tab
              <ExternalLinkIcon className="size-3.5" />
            </a>
          </div>
          {tab === "pdf" &&
            (doc.mimeType === "application/pdf" ? (
              <PdfViewer url={fileUrl(doc.id)} page={page} />
            ) : (
              <iframe
                title={`Original file: ${doc.filename}`}
                src={fileUrl(doc.id)}
                className="min-h-0 w-full flex-1 rounded-xl border bg-muted"
              />
            ))}
        </TabsContent>
      </Tabs>
    </>
  )
}

/**
 * Highlights the cited passage inside the page text. Chunks were whitespace-
 * normalised at ingestion, so match on words with flexible whitespace, using
 * the first and last few words of the passage as anchors.
 */
function HighlightedText({ text, highlight }: { text: string; highlight?: string }) {
  const range = React.useMemo(() => (highlight ? findRange(text, highlight) : null), [text, highlight])
  const mark = React.useRef<HTMLElement>(null)
  React.useEffect(() => {
    mark.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [range])
  if (!range) return <>{text}</>
  return (
    <>
      {text.slice(0, range[0])}
      <mark ref={mark} className="rounded-[3px] bg-highlight px-0.5 text-inherit">
        {text.slice(range[0], range[1])}
      </mark>
      {text.slice(range[1])}
    </>
  )
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

function findRange(text: string, passage: string): [number, number] | null {
  const words = passage.split(/\s+/).filter(Boolean)
  if (words.length < 3) return null
  const pattern = (ws: string[]) => new RegExp(ws.map(escape).join("\\s+"))
  const n = Math.min(8, words.length)
  const start = pattern(words.slice(0, n)).exec(text)
  if (!start) return null
  const end = pattern(words.slice(-n)).exec(text.slice(start.index))
  const endAt = end ? start.index + end.index + end[0].length : start.index + start[0].length
  return [start.index, endAt]
}
