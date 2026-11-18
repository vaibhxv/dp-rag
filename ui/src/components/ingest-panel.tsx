"use client"

import { useCallback, useRef, useState } from "react"
import { FileText, Loader2, Trash2, UploadCloud, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { api, formatBytes, type DocumentDto } from "@/lib/api"
import { cn } from "@/lib/utils"

const ACCEPT = ".pdf,.docx,.txt,.md"

interface Props {
  documents: DocumentDto[]
  loading: boolean
  onChanged: () => void
}

export function IngestPanel({ documents, loading, onChanged }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [queued, setQueued] = useState<File[]>([])
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)

  const addFiles = useCallback((list: FileList | null) => {
    if (!list) return
    setQueued((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`))
      return [...prev, ...Array.from(list).filter((f) => !seen.has(`${f.name}:${f.size}`))]
    })
  }, [])

  async function upload() {
    if (!queued.length) return
    setUploading(true)
    try {
      const { results } = await api.uploadDocuments(queued)
      for (const r of results) {
        if (r.ok && r.document.status === "ready") {
          toast.success(`${r.document.filename} ingested`, {
            description: `${r.document.chunkCount} chunks from ${r.document.pageCount} page(s)`,
          })
        } else if (r.ok) {
          toast.error(`${r.document.filename} failed`, { description: r.document.error })
        } else {
          toast.error(`${r.filename} rejected`, { description: r.error })
        }
      }
      setQueued([])
      onChanged()
    } catch (err) {
      toast.error("Upload failed", { description: (err as Error).message })
    } finally {
      setUploading(false)
    }
  }

  async function remove(doc: DocumentDto) {
    setDeleting(doc.id)
    try {
      await api.deleteDocument(doc.id)
      toast.success(`Deleted ${doc.filename}`)
      onChanged()
    } catch (err) {
      toast.error("Delete failed", { description: (err as Error).message })
    } finally {
      setDeleting(null)
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Upload documents</CardTitle>
          <CardDescription>
            PDF, DOCX, TXT or Markdown. Files are parsed, chunked page-by-page and
            vectorized by Weaviate on insert.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              addFiles(e.dataTransfer.files)
            }}
            className={cn(
              "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
              dragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50",
            )}
          >
            <UploadCloud className="size-8 text-muted-foreground" />
            <span className="text-sm font-medium">
              Drop files here or click to browse
            </span>
            <span className="text-xs text-muted-foreground">
              Up to 10 files, 25 MB each
            </span>
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ""
            }}
          />

          {queued.length > 0 && (
            <ul className="grid gap-2">
              {queued.map((f) => (
                <li
                  key={`${f.name}:${f.size}`}
                  className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{f.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                    {formatBytes(f.size)}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={uploading}
                    onClick={() => setQueued((q) => q.filter((x) => x !== f))}
                    aria-label={`Remove ${f.name}`}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex justify-end">
            <Button onClick={upload} disabled={!queued.length || uploading}>
              {uploading ? <Loader2 className="animate-spin" /> : <UploadCloud />}
              {uploading
                ? "Ingesting…"
                : `Ingest ${queued.length || ""} file${queued.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Knowledge base</CardTitle>
          <CardDescription>
            {documents.length} document{documents.length === 1 ? "" : "s"} indexed,{" "}
            {documents.reduce((n, d) => n + d.chunkCount, 0)} searchable chunks
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Pages</TableHead>
                <TableHead className="text-right">Chunks</TableHead>
                <TableHead className="text-right">Size</TableHead>
                <TableHead>Uploaded</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    {loading ? "Loading…" : "No documents yet. Upload one above."}
                  </TableCell>
                </TableRow>
              )}
              {documents.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="max-w-64 truncate font-medium" title={d.filename}>
                    {d.filename}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        d.status === "ready"
                          ? "secondary"
                          : d.status === "failed"
                            ? "destructive"
                            : "outline"
                      }
                      title={d.error || undefined}
                    >
                      {d.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{d.pageCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.chunkCount}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBytes(d.sizeBytes)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(d.uploadedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      disabled={deleting === d.id}
                      onClick={() => remove(d)}
                      aria-label={`Delete ${d.filename}`}
                    >
                      {deleting === d.id ? <Loader2 className="animate-spin" /> : <Trash2 />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
