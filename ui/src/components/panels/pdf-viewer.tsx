"use client"

import * as React from "react"
import { MinusIcon, PlusIcon } from "lucide-react"
import type { PDFDocumentProxy } from "pdfjs-dist"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * In-app PDF viewer (pdf.js). Renders the original file stored in SQLite,
 * opens at the cited page, and works everywhere — including browsers or
 * kiosks without a built-in PDF plugin.
 */
export function PdfViewer({ url, page: cited }: { url: string; page?: number }) {
  const page = cited ?? 1
  const [pdf, setPdf] = React.useState<PDFDocumentProxy | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [zoom, setZoom] = React.useState(1)
  const [current, setCurrent] = React.useState(page)
  const [width, setWidth] = React.useState(0)
  const scroller = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    let alive = true
    let doc: PDFDocumentProxy | null = null
    ;(async () => {
      const pdfjs = await import("pdfjs-dist")
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url
      ).toString()
      doc = await pdfjs.getDocument({ url }).promise
      if (alive) setPdf(doc)
    })().catch((e: Error) => alive && setError(e.message))
    return () => {
      alive = false
      void doc?.destroy()
    }
  }, [url])

  React.useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(() => setWidth(el.clientWidth - 24))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Jump to the cited page once the first pages are laid out.
  const jumped = React.useRef(false)
  const onPageReady = React.useCallback(
    (n: number, el: HTMLElement) => {
      if (!jumped.current && n === page) {
        jumped.current = true
        el.scrollIntoView({ block: "start" })
      }
    },
    [page]
  )

  const onScroll = () => {
    const el = scroller.current
    if (!el) return
    const pages = el.querySelectorAll<HTMLElement>("[data-page]")
    const mid = el.scrollTop + el.clientHeight / 3
    for (const p of pages) {
      if (p.offsetTop + p.offsetHeight > mid) {
        setCurrent(Number(p.dataset.page))
        break
      }
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border bg-[#EEF1F5]">
      <div className="flex h-10 shrink-0 items-center gap-1 border-b bg-background px-2 text-xs text-muted-foreground">
        <span className="px-1 tabular-nums">
          Page {current} / {pdf?.numPages ?? "…"}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-xs" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
            <MinusIcon />
          </Button>
          <span className="w-10 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <Button variant="ghost" size="icon-xs" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(3, z + 0.25))}>
            <PlusIcon />
          </Button>
        </div>
      </div>
      <div ref={scroller} onScroll={onScroll} className="min-h-0 flex-1 overflow-auto p-3">
        {error ? (
          <p className="p-4 text-sm text-destructive">Could not open the file: {error}</p>
        ) : !pdf || !width ? (
          <Skeleton className="aspect-[1/1.41] w-full" />
        ) : (
          <div className="flex flex-col items-center gap-3">
            {Array.from({ length: pdf.numPages }, (_, i) => (
              <PdfPage
                key={i + 1}
                pdf={pdf}
                n={i + 1}
                width={width * zoom}
                highlight={i + 1 === cited}
                onReady={onPageReady}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PdfPage({
  pdf,
  n,
  width,
  highlight,
  onReady,
}: {
  pdf: PDFDocumentProxy
  n: number
  width: number
  highlight: boolean
  onReady: (n: number, el: HTMLElement) => void
}) {
  const canvas = React.useRef<HTMLCanvasElement>(null)
  const box = React.useRef<HTMLDivElement>(null)
  const [ratio, setRatio] = React.useState(1.414)

  React.useEffect(() => {
    let cancelled = false
    let task: { cancel: () => void; promise: Promise<void> } | null = null
    ;(async () => {
      const page = await pdf.getPage(n)
      const base = page.getViewport({ scale: 1 })
      if (cancelled) return
      setRatio(base.height / base.width)
      const dpr = window.devicePixelRatio || 1
      const viewport = page.getViewport({ scale: (width / base.width) * dpr })
      const c = canvas.current
      if (!c) return
      c.width = Math.floor(viewport.width)
      c.height = Math.floor(viewport.height)
      task = page.render({ canvas: c, viewport })
      await task.promise
      if (!cancelled && box.current) onReady(n, box.current)
    })().catch(() => undefined)
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [pdf, n, width, onReady])

  return (
    <div
      ref={box}
      data-page={n}
      className={highlight ? "rounded-sm ring-2 ring-primary ring-offset-2 ring-offset-[#EEF1F5]" : undefined}
      style={{ width, height: width * ratio }}
    >
      <canvas ref={canvas} className="h-full w-full bg-white shadow-sm" aria-label={`Page ${n}`} />
    </div>
  )
}
