"use client"

import * as React from "react"
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  RefreshCwIcon,
  ThumbsDownIcon,
  ThumbsUpIcon,
} from "lucide-react"
import { useShell } from "@/components/app-shell"
import { textOf } from "@/components/chat/chat-view"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { displayTitle, shortName, type ChatData, type ChatMessage, type Passage } from "@/lib/api"
import { useLibrary } from "@/lib/store"
import { cn } from "cn"
import { toast } from "sonner"

const CITE = /\[(\d+(?:\s*,\s*\d+)*)\]/g
/** Key figures worth a highlighter stroke: rupee amounts and full dates. */
const FIGURE =
  /(Rs\.?\s?[\d,]+(?:\/-)?|₹\s?[\d,]+|\b\d{1,2}(?:st|nd|rd|th)?\s(?:day of\s)?(?:January|February|March|April|May|June|July|August|September|October|November|December),?\s\d{4})/g
const NOT_COVERED = /do not cover this|not specified in the (given )?passages|no passages/i

function citedNumbers(text: string): number[] {
  const out = new Set<number>()
  for (const m of text.matchAll(CITE)) for (const n of m[1].split(",")) out.add(Number(n.trim()))
  return [...out]
}

export function AssistantMessage({
  message,
  pending = false,
  streaming = false,
  step,
  isLast = false,
  asked,
  onAsk,
  onRegenerate,
}: {
  message?: ChatMessage
  pending?: boolean
  streaming?: boolean
  step?: ChatData["status"]["step"] | null
  isLast?: boolean
  asked?: Set<string>
  onAsk?: (q: string) => void
  onRegenerate?: () => void
}) {
  const { documents } = useLibrary()
  const text = message ? textOf(message) : ""
  const sources = message?.parts.find((p) => p.type === "data-sources")?.data
  const meta = message?.parts.find((p) => p.type === "data-meta")?.data
  const passages = sources?.passages ?? []
  const notCovered = sources?.covered === false || NOT_COVERED.test(text)
  const cited = notCovered ? [] : citedNumbers(text).filter((n) => passages[n - 1])
  const evidence = cited.length ? cited : notCovered ? [] : passages.length ? [1] : []
  const unused = passages.map((_, i) => i + 1).filter((n) => !evidence.includes(n))
  const citedDocs = [...new Set(evidence.map((n) => passages[n - 1].documentId))]
  const followUps = citedDocs
    .flatMap((id) => documents.find((d) => d.id === id)?.questions ?? [])
    .filter((q) => !asked?.has(q))
    .slice(0, 2)
  const thinking = pending || (streaming && !text)

  return (
    <article className="flex gap-3.5">
      <Logo size={32} className="mt-0.5 max-sm:hidden" />
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <MetaRow
          thinking={thinking}
          streaming={streaming}
          step={step}
          found={passages.length}
          notCovered={notCovered}
          sourceCount={new Set(evidence.map((n) => passages[n - 1]?.documentId)).size}
          tookMs={meta?.tookMs}
        />

        {!thinking && (
          <AnswerText text={text} passages={passages} hideCitations={notCovered} streaming={streaming} />
        )}

        {!streaming && evidence.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {evidence.map((n) => (
              <EvidenceSlip key={n} n={n} passage={passages[n - 1]} answer={text} />
            ))}
          </div>
        )}

        {!streaming && unused.length > 0 && (
          <MorePassages
            label={
              notCovered
                ? `${unused.length} closest passage${unused.length === 1 ? " was" : "s were"} not relevant enough to answer from`
                : `${unused.length} more passage${unused.length === 1 ? " was" : "s were"} retrieved but not used`
            }
            items={unused.map((n) => ({ n, passage: passages[n - 1] }))}
            answer={text}
          />
        )}

        {message && !streaming && text && (
          <Actions text={text} meta={meta} isLast={isLast} onRegenerate={onRegenerate} />
        )}

        {isLast && !streaming && !notCovered && followUps.length > 0 && onAsk && (
          <div className="flex flex-wrap gap-2">
            {followUps.map((q) => (
              <button
                key={q}
                onClick={() => onAsk(q)}
                className="h-[34px] max-w-full truncate rounded-full border bg-card px-3.5 text-[13px] text-ink-2 transition-colors hover:border-primary/40 hover:text-primary"
              >
                {q}
              </button>
            ))}
          </div>
        )}
      </div>
    </article>
  )
}

function MetaRow({
  thinking,
  streaming,
  step,
  found,
  notCovered,
  sourceCount,
  tookMs,
}: {
  thinking: boolean
  streaming: boolean
  step?: ChatData["status"]["step"] | null
  found: number
  notCovered: boolean
  sourceCount: number
  tookMs?: number
}) {
  if (thinking || streaming) {
    return (
      <div className="flex items-center gap-2 text-xs" role="status">
        <span className="flex gap-[3px]" aria-hidden>
          {["bg-primary", "bg-[#6F86C9]", "bg-[#B8C5EA]"].map((c, i) => (
            <span key={c} className={cn("size-[5px] animate-pulse rounded-full", c)} style={{ animationDelay: `${i * 150}ms` }} />
          ))}
        </span>
        <span className="font-semibold text-primary">
          {step === "retrieving" || !found ? "Searching the library…" : `Writing from ${found} passage${found === 1 ? "" : "s"}`}
        </span>
      </div>
    )
  }
  const dot = <span className="size-[3px] rounded-full bg-[#B9C1D3]" />
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span className={cn("font-semibold tracking-[0.08em] uppercase", notCovered ? "text-gold-ink" : "text-primary")}>
        {notCovered ? "Not in the documents" : "Answer"}
      </span>
      {!notCovered && sourceCount > 0 && (
        <>
          {dot}
          <span>
            Grounded in {sourceCount} source{sourceCount === 1 ? "" : "s"}
          </span>
        </>
      )}
      {tookMs !== undefined && (
        <>
          {dot}
          <span>{(tookMs / 1000).toFixed(1)} s</span>
        </>
      )}
    </div>
  )
}

function withMarkers(s: string, key: string): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let last = 0
  for (const m of s.matchAll(FIGURE)) {
    const at = m.index ?? 0
    out.push(s.slice(last, at))
    out.push(
      <span key={`${key}-${at}`} className="marker">
        {m[0]}
      </span>
    )
    last = at + m[0].length
  }
  out.push(s.slice(last))
  return out
}

function AnswerText({
  text,
  passages,
  hideCitations,
  streaming,
}: {
  text: string
  passages: Passage[]
  hideCitations: boolean
  streaming: boolean
}) {
  const nodes: React.ReactNode[] = []
  let last = 0
  for (const m of text.matchAll(CITE)) {
    const at = m.index ?? 0
    nodes.push(...withMarkers(text.slice(last, at), `t${last}`))
    if (!hideCitations) {
      for (const n of m[1].split(",").map((x) => Number(x.trim()))) {
        const p = passages[n - 1]
        if (p) nodes.push(<Seal key={`${at}-${n}`} n={n} passage={p} answer={text} />)
      }
    }
    last = at + m[0].length
  }
  nodes.push(...withMarkers(text.slice(last), `t${last}`))

  return (
    <p className="text-[17px] leading-[1.65] whitespace-pre-wrap">
      {nodes}
      {streaming && (
        <span className="ml-[3px] inline-block h-[18px] w-2 animate-pulse rounded-[2px] bg-primary/55 align-[-3px]" />
      )}
    </p>
  )
}

function Seal({ n, passage, answer }: { n: number; passage: Passage; answer: string }) {
  const { openDocument } = useShell()
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={150}
        render={
          <button
            onClick={() =>
              openDocument({
                id: passage.documentId,
                page: passage.page,
                highlight: passage.text,
                focus: excerpt(passage.text, answer).line,
              })
            }
            className="seal mx-1 align-[2px] transition-transform hover:scale-110"
            aria-label={`Source ${n}: ${shortName(passage.filename)}, page ${passage.page}`}
          />
        }
      >
        {n}
      </HoverCardTrigger>
      <HoverCardContent className="w-80 rounded-2xl p-4" side="top">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-gold-ink">
            {shortName(passage.filename)} · page {passage.page}
          </div>
          <div className="font-serif text-base leading-snug font-semibold">{passage.title || shortName(passage.filename)}</div>
          <p className="line-clamp-5 font-serif text-sm leading-relaxed text-ink-2">{passage.text}</p>
          <div className="pt-1 text-xs font-semibold text-primary">Click to open the page →</div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

/**
 * Picks the line of the passage that best supports the answer (tokens with
 * digits count triple) and returns it with one line of context on each side.
 * Long lines are windowed around the best match instead of cut from the start.
 */
function excerpt(passage: string, answer: string) {
  const segments = passage
    // Split on sentence ends (not after abbreviations like "Rs." or "No.") and
    // before numbered items ("5. Head Constable …").
    .split(
      /(?<=[;:।]|(?<![\dA-Z]|\b(?:Rs|No|Nos|Sr|Sl|Dy|Jt|Addl|Spl|Sh|Smt|Dr|Mr|Ms|vs|viz|Govt|Deptt))\.)\s+(?=\S)|\s+(?=\d{1,2}\.\s)/
    )
    .map((s) => s.trim())
    .filter(Boolean)
  const tokens = (s: string) => s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []
  const want = new Map<string, number>()
  for (const t of tokens(answer.replace(CITE, ""))) {
    if (/\d/.test(t)) want.set(t, 3)
    else if (t.length > 3) want.set(t, 1)
  }
  let best = 0
  let bestScore = -1
  segments.forEach((s, i) => {
    const score = [...new Set(tokens(s))].reduce((n, t) => n + (want.get(t) ?? 0), 0)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  })

  const MAX = 170
  const clip = (s?: string) => (s && s.length > MAX ? `${s.slice(0, MAX - 3)}…` : s)
  let line = segments[best] ?? ""
  let windowed = false
  if (line.length > MAX) {
    // Centre a window on the densest run of matched tokens.
    const lower = line.toLowerCase()
    let anchor = 0
    let top = 0
    for (const [t, w] of want) {
      const at = lower.indexOf(t)
      if (at >= 0 && w > top) {
        top = w
        anchor = at
      }
    }
    const start = Math.max(0, Math.min(anchor - 60, line.length - MAX))
    const cut = line.slice(start, start + MAX)
    const from = start > 0 ? cut.indexOf(" ") + 1 : 0
    const to = start + MAX < line.length ? cut.lastIndexOf(" ") : cut.length
    line = `${start > 0 ? "…" : ""}${cut.slice(from, to)}${start + MAX < line.length ? "…" : ""}`
    windowed = true
  }
  return {
    before: windowed ? undefined : clip(segments[best - 1]),
    line,
    after: windowed ? undefined : clip(segments[best + 1]),
    more: !windowed && best + 1 < segments.length - 1,
  }
}

function EvidenceSlip({ n, passage, answer, compact = false }: { n: number; passage: Passage; answer: string; compact?: boolean }) {
  const { openDocument } = useShell()
  const { documents } = useLibrary()
  const doc = documents.find((d) => d.id === passage.documentId)
  const ex = excerpt(passage.text, answer)

  return (
    <button
      onClick={() =>
        openDocument({ id: passage.documentId, page: passage.page, highlight: passage.text, focus: ex.line })
      }
      className={cn(
        "group flex flex-col gap-2.5 rounded-2xl border px-4 py-3.5 text-left transition-all hover:-translate-y-px",
        compact
          ? "border-border bg-card hover:border-primary/30"
          : "border-paper-line bg-paper shadow-[0_1px_0_var(--paper-line),0_8px_24px_rgba(122,78,0,0.06)] hover:shadow-[0_1px_0_var(--paper-line),0_14px_30px_rgba(122,78,0,0.1)]"
      )}
      style={{ "--seal-gap": compact ? "#fff" : "var(--paper)" } as React.CSSProperties}
    >
      <span className="flex items-center gap-2.5">
        <span className="seal">{n}</span>
        <span className="min-w-0 flex-1 truncate font-serif text-base font-semibold">
          {doc ? displayTitle(doc) : passage.title || shortName(passage.filename)}
        </span>
        <span className="shrink-0 text-xs font-medium text-gold-ink">
          Page {passage.page}
          {doc?.pageCount ? ` of ${doc.pageCount}` : ""}
        </span>
      </span>
      <span className="font-serif text-[15px] sm:pl-8 leading-[1.6] text-ink-2">
        {ex.before && <span className="block">… {ex.before}</span>}
        <span className={cn("block", !compact && "-mx-1 rounded-[3px] bg-highlight px-1 text-foreground")}>{ex.line}</span>
        {ex.after && (
          <span className="block">
            {ex.after}
            {ex.more ? " …" : ""}
          </span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-2 text-xs sm:pl-8 text-muted-foreground">
        <span className="truncate">{passage.filename}</span>
        {doc?.category && (
          <span className="rounded-full bg-accent px-2 py-px font-medium text-accent-foreground">{doc.category}</span>
        )}
        {passage.ocr && (
          <span className="rounded-full bg-gold-soft px-2 py-px font-medium text-gold-ink">
            Scanned{doc?.ocrConfidence != null ? ` · OCR ${doc.ocrConfidence}%` : ""}
          </span>
        )}
        <span className="ml-auto font-semibold text-primary transition-transform group-hover:translate-x-0.5">Open page →</span>
      </span>
    </button>
  )
}

function MorePassages({
  label,
  items,
  answer,
}: {
  label: string
  items: { n: number; passage: Passage }[]
  answer: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <div className="flex flex-col gap-2.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-fit items-center gap-1.5 text-[13px] text-muted-foreground hover:text-primary"
        aria-expanded={open}
      >
        <ChevronDownIcon className={cn("size-3.5 transition-transform", open && "rotate-180")} />
        {label}
      </button>
      {open && items.map(({ n, passage }) => <EvidenceSlip key={n} n={n} passage={passage} answer={answer} compact />)}
    </div>
  )
}

function Actions({
  text,
  meta,
  isLast,
  onRegenerate,
}: {
  text: string
  meta?: ChatData["meta"]
  isLast: boolean
  onRegenerate?: () => void
}) {
  const [copied, setCopied] = React.useState(false)
  const [vote, setVote] = React.useState<"up" | "down" | null>(null)
  const plain = text.replace(CITE, "").replace(/\s+([.,])/g, "$1").trim()

  const icon = (label: string, onClick: () => void, child: React.ReactNode, active = false) => (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={label}
            onClick={onClick}
            className={cn("rounded-[10px] text-muted-foreground", active && "bg-accent text-primary hover:bg-accent")}
          />
        }
      >
        {child}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <div className="-ml-2 flex items-center gap-0.5">
      {icon(
        "Copy answer",
        () => {
          void navigator.clipboard.writeText(plain)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        },
        copied ? <CheckIcon /> : <CopyIcon />
      )}
      {icon(
        "Useful",
        () => {
          setVote("up")
          toast.success("Thanks, marked as useful")
        },
        <ThumbsUpIcon />,
        vote === "up"
      )}
      {icon(
        "Not useful",
        () => {
          setVote("down")
          toast("Thanks for the feedback", { description: "Try rephrasing, or open the source page to check." })
        },
        <ThumbsDownIcon />,
        vote === "down"
      )}
      {isLast && onRegenerate && icon("Regenerate", onRegenerate, <RefreshCwIcon />)}
      {meta && (
        <span className="ml-auto text-xs text-muted-foreground">
          {meta.mode} search · {meta.model.replace(":", " ").replace(/b$/, "B")} · local
        </span>
      )}
    </div>
  )
}
