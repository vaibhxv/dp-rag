"use client"

import * as React from "react"
import { CheckIcon, UploadIcon, XIcon } from "lucide-react"
import { useShell } from "@/components/app-shell"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { api, displayTitle, formatBytes, type DocumentDto } from "@/lib/api"
import { useLibrary } from "@/lib/store"
import { cn } from "cn"
import { toast } from "sonner"

const ACCEPT = ".pdf,.docx,.txt,.md"

const STAGES = [
  ["Store", "Original kept, duplicates caught"],
  ["Read", "Text layer, or OCR in English + Hindi"],
  ["Understand", "Title, summary, category"],
  ["Index", "Passages embedded for search"],
] as const

/** Fill (0..1) of each of the 4 pipeline stages for a document. */
function stageFill(d: DocumentDto): number[] {
  if (d.status === "ready") return [1, 1, 1, 1]
  if (d.status === "queued") return [0, 0, 0, 0]
  if (d.status === "failed") return [1, 0, 0, 0]
  const p = d.progress
  const ocr = /OCR page (\d+) of (\d+)/.exec(p)
  if (ocr) return [1, (Number(ocr[1]) - 0.5) / Number(ocr[2]), 0, 0]
  if (p.startsWith("Summarising")) return [1, 1, 0.5, 0]
  if (p.startsWith("Embedding")) return [1, 1, 1, 0.5]
  return [1, 0.1, 0, 0]
}

type Duplicate = { filename: string; id: string; title: string }

export function IngestDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { documents, refresh } = useLibrary()
  const { openDocument, setScope, showChat } = useShell()
  const [files, setFiles] = React.useState<File[]>([])
  const [uploading, setUploading] = React.useState(false)
  const [drag, setDrag] = React.useState(false)
  const [tracked, setTracked] = React.useState<string[]>([])
  const [duplicates, setDuplicates] = React.useState<Duplicate[]>([])
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
      const ok: string[] = []
      const dups: Duplicate[] = []
      for (const r of results) {
        if (r.ok) ok.push(r.document.id)
        else if (r.duplicateOf) dups.push({ filename: r.filename, id: r.duplicateOf.id, title: r.duplicateOf.title || r.duplicateOf.filename })
        else toast.error(r.filename, { description: r.error })
      }
      setTracked((t) => [...ok, ...t])
      setDuplicates((d) => [...dups, ...d.filter((x) => !dups.some((y) => y.filename === x.filename))])
      setFiles([])
      void refresh()
    } catch (e) {
      toast.error("Upload failed", { description: (e as Error).message })
    } finally {
      setUploading(false)
    }
  }

  const trackedDocs = tracked
    .map((id) => documents.find((d) => d.id === id))
    .filter((d): d is DocumentDto => Boolean(d))
  const readyNew = trackedDocs.filter((d) => d.status === "ready")

  const openDoc = (id: string) => {
    onOpenChange(false)
    openDocument({ id })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="gap-0 overflow-hidden rounded-[28px] p-0 shadow-[0_30px_80px_rgba(13,23,51,0.18)] sm:max-w-[860px]">
        <div className="flex items-start gap-4 pt-7 pr-7 pb-2 pl-8">
          <Logo size={44} />
          <div className="flex-1">
            <DialogTitle className="font-serif text-[30px] leading-[1.1] font-medium tracking-[-0.015em]">Add to the library</DialogTitle>
            <DialogDescription className="mt-1.5 text-sm">
              PDF, Word, text or Markdown, up to 25 MB each. Keep working while files are processed.
            </DialogDescription>
          </div>
          <Button variant="secondary" size="icon-lg" aria-label="Close" onClick={() => onOpenChange(false)} className="size-10 rounded-xl">
            <XIcon />
          </Button>
        </div>

        <div className="flex max-h-[62vh] flex-col gap-5 overflow-y-auto px-8 pt-4 pb-2">
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
              "flex items-center justify-center gap-[18px] rounded-[22px] border-[1.5px] border-dashed border-[#B9C6E4] bg-[#F7F9FF] px-5 py-7 transition-colors",
              drag && "border-primary bg-accent"
            )}
          >
            <span className="flex size-14 shrink-0 items-center justify-center rounded-[18px] bg-primary text-primary-foreground shadow-[0_10px_24px_rgba(28,58,148,0.25)]">
              <UploadIcon className="size-6" />
            </span>
            <span className="flex flex-col items-start gap-0.5 text-left">
              <span className="text-[17px] font-semibold">Drop files here, or browse</span>
              <span className="text-[13px] text-muted-foreground">
                Originals are stored on this computer so anyone can open the exact page later
              </span>
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

          <ol aria-label="How a file is processed" className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {STAGES.map(([name, hint], i) => (
              <li key={name} className="flex items-start gap-2.5 rounded-2xl bg-secondary p-3">
                <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-card text-xs font-semibold text-primary shadow-[0_0_0_1px_var(--border)]">
                  {i + 1}
                </span>
                <span>
                  <span className="block text-[13px] font-semibold">{name}</span>
                  <span className="text-xs text-muted-foreground">{hint}</span>
                </span>
              </li>
            ))}
          </ol>

          {(files.length > 0 || trackedDocs.length > 0 || duplicates.length > 0) && (
            <ul className="flex flex-col gap-2.5">
              {files.map((f) => (
                <Row key={f.name + f.size} name={f.name}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{f.name}</span>
                    <span className="text-xs text-muted-foreground">{formatBytes(f.size)} · ready to add</span>
                  </span>
                  <Button variant="ghost" size="sm" disabled={uploading} onClick={() => setFiles((p) => p.filter((x) => x !== f))}>
                    Remove
                  </Button>
                </Row>
              ))}
              {trackedDocs.map((d) => {
                const fill = stageFill(d)
                const done = d.status === "ready"
                return (
                  <Row key={d.id} name={d.filename} tone={done ? undefined : d.status === "processing" ? "active" : undefined}>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className={cn("truncate font-semibold", done ? "font-serif text-base" : "text-[15px]")}>
                        {done ? displayTitle(d) : d.filename}
                      </span>
                      <span className={cn("truncate text-xs", d.status === "processing" ? "font-medium text-primary" : d.status === "failed" ? "text-crimson" : "text-muted-foreground")}>
                        {done
                          ? `${d.filename} · ${d.pageCount} pages${d.ocrPageCount ? ` · ${d.ocrPageCount} read by OCR${d.ocrConfidence != null ? ` (${d.ocrConfidence}%)` : ""}` : ""} · ${d.chunkCount} passages`
                          : d.status === "failed"
                            ? d.error
                            : d.status === "queued"
                              ? "Waiting in queue"
                              : d.progress.replace(/^OCR/, "Reading · OCR")}
                      </span>
                    </span>
                    <span className="hidden w-[132px] shrink-0 grid-cols-4 gap-1 sm:grid" aria-label={done ? "All 4 stages done" : "Progress through 4 stages"}>
                      {fill.map((f, i) => (
                        <span key={i} className="h-1.5 overflow-hidden rounded-full bg-[#D7E0F6]">
                          <span
                            className={cn("block h-full rounded-full transition-[width] duration-700", done ? "bg-ok" : d.status === "failed" ? "bg-crimson" : "bg-primary")}
                            style={{ width: `${Math.round(f * 100)}%` }}
                          />
                        </span>
                      ))}
                    </span>
                    {done ? (
                      <button
                        onClick={() => openDoc(d.id)}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-ok-soft px-3 text-xs font-semibold text-ok-ink hover:underline"
                      >
                        <CheckIcon className="size-3.5" strokeWidth={2.6} />
                        Ready · open
                      </button>
                    ) : (
                      <span className="hidden w-[92px] shrink-0 sm:block" />
                    )}
                  </Row>
                )
              })}
              {duplicates.map((d) => (
                <Row key={`dup-${d.filename}`} name={d.filename} tone="gold">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{d.filename}</span>
                    <span className="text-xs text-gold-ink">Already in the library as “{d.title}”</span>
                  </span>
                  <button
                    onClick={() => openDoc(d.id)}
                    className="h-8 shrink-0 rounded-full bg-card px-3 text-xs font-semibold text-gold-ink shadow-[0_0_0_1px_var(--gold-line)] hover:underline"
                  >
                    Open existing
                  </button>
                </Row>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[#EEF1F6] bg-[#FBFCFE] px-8 pt-[18px] pb-[26px]">
          <span className="flex min-w-[240px] flex-1 items-center gap-2 text-[13px] text-muted-foreground">
            <span className="size-[7px] rounded-full bg-ok shadow-[0_0_0_3px_var(--ok-soft)]" />
            Processed on this computer. Nothing is sent to the internet.
          </span>
          {files.length > 0 ? (
            <Button onClick={() => void ingest()} disabled={uploading} className="h-11 rounded-[14px] px-5 font-semibold shadow-[0_8px_20px_rgba(28,58,148,0.25)]">
              {uploading ? "Uploading…" : `Add ${files.length} file${files.length === 1 ? "" : "s"}`}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} className="h-11 rounded-[14px] px-[18px]">
                Keep working
              </Button>
              <Button
                disabled={readyNew.length === 0}
                onClick={() => {
                  onOpenChange(false)
                  showChat()
                  if (readyNew.length === 1) setScope({ id: readyNew[0].id, title: displayTitle(readyNew[0]) })
                }}
                className="h-11 rounded-[14px] px-5 font-semibold shadow-[0_8px_20px_rgba(28,58,148,0.25)] disabled:shadow-none"
              >
                Ask about new file{readyNew.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Row({ name, tone, children }: { name: string; tone?: "active" | "gold"; children: React.ReactNode }) {
  const ext = name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "FILE"
  return (
    <li
      className={cn(
        "flex items-center gap-3.5 rounded-[18px] border px-4 py-3.5",
        tone === "active" && "border-[#C9D6F6] bg-[#F7F9FF]",
        tone === "gold" && "border-gold-line bg-[#FFFBF0]"
      )}
    >
      <span
        className={cn(
          "flex h-11 w-9 shrink-0 items-end justify-center rounded-md pb-[5px] text-[10px] font-bold",
          ext === "PDF" ? "bg-crimson-soft text-crimson" : "bg-accent text-primary"
        )}
      >
        {ext}
      </span>
      {children}
    </li>
  )
}
