"use client"

import { Fragment, useState } from "react"
import { FileText, Loader2, Search, Sparkles } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import {
  api,
  type AskResponse,
  type DocumentDto,
  type SearchMode,
} from "@/lib/api"

const MODES: { value: SearchMode; label: string }[] = [
  { value: "hybrid", label: "Hybrid (BM25 + vector)" },
  { value: "semantic", label: "Semantic (vector)" },
  { value: "keyword", label: "Keyword (BM25)" },
]

const ALL_DOCS = "__all__"

export function SearchPanel({ documents }: { documents: DocumentDto[] }) {
  const [query, setQuery] = useState("")
  const [mode, setMode] = useState<SearchMode>("hybrid")
  const [alpha, setAlpha] = useState(0.5)
  const [limit, setLimit] = useState(6)
  const [documentId, setDocumentId] = useState<string>(ALL_DOCS)
  const [generate, setGenerate] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AskResponse | null>(null)

  const readyDocs = documents.filter((d) => d.status === "ready")
  const docItems = [
    { value: ALL_DOCS, label: "All documents" },
    ...readyDocs.map((d) => ({ value: d.id, label: d.filename })),
  ]

  async function run(e?: React.FormEvent) {
    e?.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      setResult(
        await api.ask({
          query: query.trim(),
          mode,
          alpha,
          limit,
          documentId: documentId === ALL_DOCS ? undefined : documentId,
          generate,
        }),
      )
    } catch (err) {
      setError((err as Error).message)
      setResult(null)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Ask the knowledge base</CardTitle>
          <CardDescription>
            Retrieval runs in Weaviate. With RAG on, the retrieved passages are passed
            to a local LLM that answers only from them and cites its sources.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={run} className="grid gap-5">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. What is the procedure for registering a complaint?"
                className="h-10"
                autoFocus
              />
              <Button type="submit" size="lg" className="h-10" disabled={loading || !query.trim()}>
                {loading ? <Loader2 className="animate-spin" /> : <Search />}
                Search
              </Button>
            </div>

            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-2">
                <Label>Retrieval mode</Label>
                <Select
                  items={MODES}
                  value={mode}
                  onValueChange={(v) => v && setMode(v as SearchMode)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODES.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Scope</Label>
                <Select
                  items={docItems}
                  value={documentId}
                  onValueChange={(v) => setDocumentId(v ?? ALL_DOCS)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {docItems.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-3">
                <Label className="justify-between">
                  <span>
                    {mode === "hybrid" ? "Keyword ↔ Vector" : "Hybrid weight"}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    α {alpha.toFixed(2)}
                  </span>
                </Label>
                <Slider
                  min={0}
                  max={1}
                  step={0.05}
                  value={[alpha]}
                  disabled={mode !== "hybrid"}
                  onValueChange={(v) => setAlpha(Array.isArray(v) ? v[0] : v)}
                />
              </div>

              <div className="grid gap-3">
                <Label className="justify-between">
                  <span>Passages</span>
                  <span className="tabular-nums text-muted-foreground">{limit}</span>
                </Label>
                <Slider
                  min={1}
                  max={20}
                  step={1}
                  value={[limit]}
                  onValueChange={(v) => setLimit(Array.isArray(v) ? v[0] : v)}
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Switch id="rag" checked={generate} onCheckedChange={setGenerate} />
              <Label htmlFor="rag" className="flex-col items-start gap-0.5">
                <span>Generate answer (RAG)</span>
                <span className="text-xs font-normal text-muted-foreground">
                  Off = retrieval only, no LLM call
                </span>
              </Label>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Search failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading && <ResultsSkeleton withAnswer={generate} />}

      {!loading && result && (
        <>
          {result.answer !== null && (
            <Card className="border-primary/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="size-4" /> Answer
                </CardTitle>
                <CardDescription>
                  Generated from the {result.passages.length} passages below · {result.tookMs} ms
                </CardDescription>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap leading-relaxed">
                {result.answer}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-medium">
                Source passages{" "}
                <span className="text-muted-foreground">({result.passages.length})</span>
              </h2>
              {result.answer === null && (
                <span className="text-xs text-muted-foreground">{result.tookMs} ms</span>
              )}
            </div>
            {result.passages.length === 0 && (
              <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                No sufficiently relevant passage was found.
              </p>
            )}
            {result.passages.map((p, i) => (
              <Card key={p.id} size="sm">
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge variant="outline" className="tabular-nums">
                      #{i + 1}
                    </Badge>
                    <FileText className="size-4 text-muted-foreground" />
                    <span className="truncate">{p.filename}</span>
                    <Badge variant="secondary">p. {p.page}</Badge>
                    {p.score !== null && (
                      <span className="ml-auto text-xs font-normal tabular-nums text-muted-foreground">
                        score {p.score.toFixed(3)}
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm leading-relaxed text-muted-foreground">
                  <Highlight text={p.text} query={result.query} />
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function ResultsSkeleton({ withAnswer }: { withAnswer: boolean }) {
  return (
    <div className="grid gap-3">
      {withAnswer && <Skeleton className="h-32 w-full" />}
      <Separator />
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-24 w-full" />
      ))}
    </div>
  )
}

/** Bold the query's terms inside a passage (purely visual aid). */
function Highlight({ text, query }: { text: string; query: string }) {
  const terms = query
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter((t) => t.length > 2)
  if (!terms.length) return <>{text}</>
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "giu")
  const lower = new Set(terms.map((t) => t.toLowerCase()))
  return (
    <>
      {text.split(re).map((part, i) =>
        lower.has(part.toLowerCase()) ? (
          <mark key={i} className="rounded bg-yellow-200/60 px-0.5 text-foreground dark:bg-yellow-500/30">
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  )
}
