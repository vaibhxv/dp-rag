"use client"

import * as React from "react"
import { CheckCircle2Icon, UploadIcon, XIcon } from "lucide-react"
import { useShell } from "@/components/app-shell"
import { FileGlyph } from "@/components/panels/library-panel"
import { progressFraction } from "@/components/panels/status-badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { api, displayTitle, formatBytes } from "@/lib/api"
import { useLibrary } from "@/lib/store"
import { cn } from "cn"
import { toast } from "sonner"

const ACCEPT = ".pdf,.docx,.txt,.md"

export function IngestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { documents, refresh } = useLibrary()
  const { openDocument } = useShell()
  const [files, setFiles] = React.useState<File[]>([])
  const [uploading, setUploading] = React.useState(false)
  const [drag, setDrag] = React.useState(false)
  /** Documents uploaded from this dialog in this session, to show live progress. */
  const [tracked, setTracked] = React.useState<string[]>([])
  const input = React.useRef<HTMLInputElement>(null)

  const add = (list: FileList | null) => {
    if (!list) return
    const incoming = Array.from(list).filter((f) => /\.(pdf|docx|txt|md)$/i.test(f.name))
    if (incoming.length < list.length) toast.warning("Only PDF, DOCX, TXT and MD files are supported")
    setFiles((prev) => [...prev, ...incoming.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))])
  }

  const ingest = async () => {
    setUploading(true)
    try {
      const { results } = await api.upload(files)
      const ok = results.filter((r) => r.ok)
      const failed = results.filter((r) => !r.ok)
      setTracked((t) => [...ok.map((r) => r.document.id), ...t])
      setFiles([])
      void refresh()
      if (ok.length) toast.success(`${ok.length} file${ok.length === 1 ? "" : "s"} queued for ingestion`)
      for (const f of failed) toast.error(f.filename, { description: f.error })
    } catch (e) {
      toast.error("Upload failed", { description: (e as Error).message })
    } finally {
      setUploading(false)
    }
  }

  const trackedDocs = tracked
    .map((id) => documents.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 p-0 sm:max-w-[620px]">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle className="text-xl">Ingest documents</DialogTitle>
          <DialogDescription>
            PDF, DOCX, TXT or MD, up to 25 MB each. Scanned pages are read with OCR (English + Hindi).
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-6 py-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDrag(true)
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDrag(false)
              add(e.dataTransfer.files)
            }}
            className={cn(
              "flex flex-col items-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#B9C6E4] bg-[#F7F9FF] px-4 py-7 transition-colors",
              drag && "border-primary bg-accent"
            )}
          >
            <span className="flex size-11 items-center justify-center rounded-xl bg-accent text-primary">
              <UploadIcon className="size-5" />
            </span>
            <span className="font-medium">Drop files here or click to browse</span>
            <span className="text-xs text-muted-foreground">
              Originals are kept in the local file store so anyone can open them later
            </span>
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              add(e.target.files)
              e.target.value = ""
            }}
          />

          {(files.length > 0 || trackedDocs.length > 0) && (
            <ul className="flex flex-col gap-2">
              {files.map((f) => (
                <li key={f.name + f.size} className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
                  <FileGlyph small mime={f.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "text/plain"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(f.size)} · ready to ingest</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${f.name}`}
                    disabled={uploading}
                    onClick={() => setFiles((prev) => prev.filter((p) => p !== f))}
                  >
                    <XIcon />
                  </Button>
                </li>
              ))}
              {trackedDocs.map((d) => {
                const done = d.status === "ready"
                return (
                  <li key={d.id} className="flex items-center gap-3 rounded-xl border px-3 py-2.5">
                    <FileGlyph small mime={d.mimeType} />
                    <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{done ? displayTitle(d) : d.filename}</span>
                        {!done && d.status !== "failed" && (
                          <span className="ml-auto shrink-0 text-xs text-primary">{d.progress || "Queued"}</span>
                        )}
                      </span>
                      {done ? (
                        <span className="text-xs text-muted-foreground">
                          {d.filename} · {d.pageCount} pages{d.ocrPageCount ? ` · ${d.ocrPageCount} OCR'd` : ""} ·{" "}
                          {d.chunkCount} passages
                        </span>
                      ) : d.status === "failed" ? (
                        <span className="text-xs text-red-700">{d.error}</span>
                      ) : (
                        <span className="h-1.5 rounded-full bg-secondary">
                          <span
                            className="block h-1.5 rounded-full bg-primary transition-[width] duration-700"
                            style={{ width: `${Math.round(progressFraction(d) * 100)}%` }}
                          />
                        </span>
                      )}
                    </span>
                    {done && (
                      <button
                        onClick={() => {
                          onOpenChange(false)
                          openDocument({ id: d.id })
                        }}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ok px-2.5 py-0.5 text-xs font-medium text-ok-foreground hover:underline"
                      >
                        <CheckCircle2Icon className="size-3.5" />
                        Ready
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <DialogFooter className="mx-0 mb-0 items-center px-6 py-4">
          <span className="mr-auto text-[13px] text-muted-foreground">
            You can keep chatting. Ingestion continues in the background.
          </span>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={() => void ingest()} disabled={!files.length || uploading}>
            {uploading ? "Uploading…" : `Ingest ${files.length || ""} file${files.length === 1 ? "" : "s"}`.replace("  ", " ")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
