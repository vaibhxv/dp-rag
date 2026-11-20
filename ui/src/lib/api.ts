import type { UIMessage } from "ai"

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000"

export type DocumentStatus = "queued" | "processing" | "ready" | "failed"

export interface DocumentDto {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  sha256: string
  pageCount: number
  ocrPageCount: number
  ocrConfidence: number | null
  chunkCount: number
  status: DocumentStatus
  progress: string
  error: string
  title: string
  summary: string
  category: string
  questions: string[]
  uploadedAt: string
  processedAt: string | null
}

export interface PageDto {
  page: number
  text: string
  ocr: boolean
  ocrConfidence: number | null
}

export interface Passage {
  id: string
  documentId: string
  filename: string
  title: string
  page: number
  chunkIndex: number
  text: string
  ocr: boolean
  score: number | null
}

export interface Health {
  status: "ok" | "degraded"
  weaviate: boolean
  ollama: boolean
  model: string
  stats: { documents: number; pages: number; chunks: number; pending: number }
}

/** Custom data parts streamed by POST /chat (see api/src/chat). */
export type ChatData = {
  /** covered=false: best passage was below the relevance threshold, so the LLM was not asked. */
  sources: { passages: Passage[]; mode: string; relevance?: number; covered?: boolean }
  meta: { tookMs: number; model: string; mode: string }
  status: { step: "retrieving" | "generating" }
}
export type ChatMessage = UIMessage<never, ChatData>

export type UploadResult =
  | { ok: true; document: DocumentDto }
  | { ok: false; filename: string; error: string }

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { message?: string | string[] }
      if (body.message) {
        message = Array.isArray(body.message) ? body.message.join(", ") : body.message
      }
    } catch {
      // not JSON
    }
    throw new Error(message)
  }
  return (await res.json()) as T
}

export const api = {
  health: () => fetch(`${API_URL}/health`, { cache: "no-store" }).then((r) => json<Health>(r)),
  listDocuments: () =>
    fetch(`${API_URL}/documents`, { cache: "no-store" }).then((r) => json<DocumentDto[]>(r)),
  pages: (id: string) => fetch(`${API_URL}/documents/${id}/pages`).then((r) => json<PageDto[]>(r)),
  upload: (files: File[]) => {
    const body = new FormData()
    for (const f of files) body.append("files", f)
    return fetch(`${API_URL}/documents`, { method: "POST", body }).then((r) =>
      json<{ results: UploadResult[] }>(r)
    )
  },
  deleteDocument: async (id: string) => {
    const res = await fetch(`${API_URL}/documents/${id}`, { method: "DELETE" })
    if (!res.ok) throw new Error(`Delete failed (${res.status})`)
  },
}

export const fileUrl = (id: string, page?: number) =>
  `${API_URL}/documents/${id}/file${page ? `#page=${page}` : ""}`

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export const displayTitle = (d: Pick<DocumentDto, "title" | "filename">) =>
  d.title || d.filename.replace(/\.[^.]+$/, "")

export const shortName = (filename: string) => filename.replace(/\.[^.]+$/, "")
