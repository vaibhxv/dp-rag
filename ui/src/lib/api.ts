export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost:4000"

export type DocumentStatus = "processing" | "ready" | "failed"

export interface DocumentDto {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
  sha256: string
  pageCount: number
  ocrPageCount: number
  chunkCount: number
  status: DocumentStatus
  error: string
  uploadedAt: string
}

export type UploadResult =
  | { ok: true; document: DocumentDto }
  | { ok: false; filename: string; error: string }

export type SearchMode = "hybrid" | "semantic" | "keyword"

export interface SearchRequest {
  query: string
  mode: SearchMode
  alpha: number
  limit: number
  documentId?: string
}

export interface Passage {
  id: string
  documentId: string
  filename: string
  page: number
  chunkIndex: number
  text: string
  /** Text came from OCR of a scanned page. */
  ocr: boolean
  score: number | null
}

export interface AskResponse {
  query: string
  mode: SearchMode
  passages: Passage[]
  answer: string | null
  tookMs: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init)
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      message = Array.isArray(body.message)
        ? body.message.join(", ")
        : (body.message ?? message)
    } catch {
      // non-JSON error body
    }
    throw new Error(message)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  health: () => request<{ status: string; weaviate: boolean }>("/health"),

  listDocuments: () => request<DocumentDto[]>("/documents"),

  uploadDocuments: (files: File[]) => {
    const form = new FormData()
    files.forEach((f) => form.append("files", f))
    return request<{ results: UploadResult[] }>("/documents", {
      method: "POST",
      body: form,
    })
  },

  deleteDocument: (id: string) =>
    request<void>(`/documents/${id}`, { method: "DELETE" }),

  /** generate=false -> retrieval only; generate=true -> RAG answer + sources. */
  ask: (body: SearchRequest & { generate: boolean }) =>
    request<AskResponse>("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
