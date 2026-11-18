"use client"

import { useCallback, useEffect, useState } from "react"
import { Database, Search, UploadCloud } from "lucide-react"

import { IngestPanel } from "@/components/ingest-panel"
import { SearchPanel } from "@/components/search-panel"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { api, type DocumentDto } from "@/lib/api"

type Health = "checking" | "ok" | "degraded" | "down"

export default function Home() {
  const [documents, setDocuments] = useState<DocumentDto[]>([])
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<Health>("checking")

  const refresh = useCallback(async () => {
    try {
      setDocuments(await api.listDocuments())
    } catch {
      // surfaced via the health badge
    }
  }, [])

  useEffect(() => {
    api
      .health()
      .then((h) => setHealth(h.weaviate ? "ok" : "degraded"))
      .catch(() => setHealth("down"))
    api
      .listDocuments()
      .then(setDocuments)
      .catch(() => {}) // surfaced via the health badge
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Database className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              Knowledge Retrieval · RAG MVP
            </h1>
            <p className="text-sm text-muted-foreground">
              Ingest documents, then search them with source-grounded answers.
            </p>
          </div>
        </div>
        <Badge
          variant={health === "ok" ? "secondary" : health === "checking" ? "outline" : "destructive"}
        >
          <span
            className={
              health === "ok"
                ? "size-2 rounded-full bg-emerald-500"
                : health === "checking"
                  ? "size-2 rounded-full bg-muted-foreground"
                  : "size-2 rounded-full bg-red-500"
            }
          />
          {health === "ok"
            ? "API + Weaviate online"
            : health === "checking"
              ? "Checking…"
              : health === "degraded"
                ? "Weaviate unreachable"
                : "API unreachable"}
        </Badge>
      </header>

      <Tabs defaultValue="search">
        <TabsList className="mb-4">
          <TabsTrigger value="search">
            <Search /> Search
          </TabsTrigger>
          <TabsTrigger value="ingest">
            <UploadCloud /> Ingest
            <Badge variant="secondary" className="ml-1 tabular-nums">
              {documents.length}
            </Badge>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="search">
          <SearchPanel documents={documents} />
        </TabsContent>
        <TabsContent value="ingest">
          <IngestPanel documents={documents} loading={loading} onChanged={refresh} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
