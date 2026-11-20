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
import { shortName, type ChatData, type ChatMessage, type Passage } from "@/lib/api"
import { cn } from "cn"
import { toast } from "sonner"

const CITE = /\[(\d+(?:\s*,\s*\d+)*)\]/g

function citedNumbers(text: string): Set<number> {
  const out = new Set<number>()
  for (const m of text.matchAll(CITE)) {
    for (const n of m[1].split(",")) out.add(Number(n.trim()))
  }
  return out
}

export function AssistantMessage({
  message,
  pending = false,
  streaming = false,
  step,
  isLast = false,
  onRegenerate,
}: {
  message?: ChatMessage
  pending?: boolean
  streaming?: boolean
  step?: ChatData["status"]["step"] | null
  isLast?: boolean
  onRegenerate?: () => void
}) {
  const text = message ? textOf(message) : ""
  const sources = message?.parts.find((p) => p.type === "data-sources")?.data
  const meta = message?.parts.find((p) => p.type === "data-meta")?.data
  const passages = sources?.passages ?? []
  const cited = citedNumbers(text)
  const notCovered = /do not cover this|not specified in the (given )?passages|no passages/i.test(text)

  return (
    <div className="flex gap-3">
      <Logo size={30} />
      <div className="flex min-w-0 flex-1 flex-col gap-3.5 pt-0.5">
        {pending || (!text && streaming) ? (
          <StepIndicator step={step ?? "retrieving"} found={passages.length} />
        ) : (
          <AnswerText text={text} passages={passages} hideCitations={notCovered} streaming={streaming} />
        )}

        {passages.length > 0 && !streaming && (
          <Sources
            passages={passages}
            cited={notCovered ? new Set() : cited}
            closestOnly={sources?.covered === false}
          />
        )}

        {message && !streaming && text && (
          <Actions text={text} meta={meta} isLast={isLast} onRegenerate={onRegenerate} />
        )}
      </div>
    </div>
  )
}

function StepIndicator({ step, found }: { step: ChatData["status"]["step"]; found: number }) {
  return (
    <div className="flex items-center gap-2.5 py-1 text-sm text-muted-foreground" role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="size-1.5 animate-bounce rounded-full bg-primary/60"
            style={{ animationDelay: `${i * 120}ms` }}
          />
        ))}
      </span>
      {step === "retrieving"
        ? "Searching the library…"
        : `Found ${found} relevant passage${found === 1 ? "" : "s"} · writing the answer…`}
    </div>
  )
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
    nodes.push(text.slice(last, at))
    if (!hideCitations) {
      for (const n of m[1].split(",").map((x) => Number(x.trim()))) {
        const p = passages[n - 1]
        nodes.push(p ? <Citation key={`${at}-${n}`} n={n} passage={p} /> : null)
      }
    }
    last = at + m[0].length
  }
  nodes.push(text.slice(last))

  return (
    <p className="text-[15px] leading-[1.7] whitespace-pre-wrap">
      {nodes}
      {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-primary/50 align-middle" />}
    </p>
  )
}

function Citation({ n, passage }: { n: number; passage: Passage }) {
  const { openDocument } = useShell()
  return (
    <HoverCard>
      <HoverCardTrigger
        delay={150}
        render={
          <button
            onClick={() => openDocument({ id: passage.documentId, page: passage.page, highlight: passage.text })}
            className="mx-0.5 inline-flex h-5 min-w-5 -translate-y-px items-center justify-center rounded-md bg-cite px-1 align-middle text-xs font-semibold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
            aria-label={`Source ${n}: ${shortName(passage.filename)}, page ${passage.page}`}
          />
        }
      >
        {n}
      </HoverCardTrigger>
      <HoverCardContent className="w-80 p-3.5" side="top">
        <div className="flex flex-col gap-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            {shortName(passage.filename)} · page {passage.page}
          </div>
          <div className="text-sm leading-snug font-semibold">{passage.title || shortName(passage.filename)}</div>
          <p className="line-clamp-5 text-[13px] leading-relaxed text-slate-600">{passage.text}</p>
          <div className="pt-1 text-xs font-medium text-primary">Click to open the page</div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}

function Sources({
  passages,
  cited,
  closestOnly,
}: {
  passages: Passage[]
  cited: Set<number>
  closestOnly: boolean
}) {
  const [showAll, setShowAll] = React.useState(false)
  const numbered = passages.map((p, i) => ({ p, n: i + 1 }))
  const primary = cited.size ? numbered.filter((x) => cited.has(x.n)) : numbered.slice(0, 2)
  const rest = numbered.filter((x) => !primary.includes(x))
  const shown = showAll ? [...primary, ...rest] : primary

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {closestOnly
          ? "Closest passages · not relevant enough to answer from"
          : cited.size
            ? `Cited sources · ${primary.length}`
            : "Top sources"}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {shown.map(({ p, n }) => (
          <SourceCard key={p.id} passage={p} n={n} cited={cited.has(n)} />
        ))}
      </div>
      {rest.length > 0 && (
        <button
          onClick={() => setShowAll((s) => !s)}
          className="flex w-fit items-center gap-1 text-[13px] font-medium text-primary hover:underline"
        >
          <ChevronDownIcon className={cn("size-4 transition-transform", showAll && "rotate-180")} />
          {showAll ? "Hide other passages" : `${rest.length} more retrieved passage${rest.length === 1 ? "" : "s"}`}
        </button>
      )}
    </div>
  )
}

function SourceCard({ passage, n, cited }: { passage: Passage; n: number; cited: boolean }) {
  const { openDocument } = useShell()
  return (
    <button
      onClick={() => openDocument({ id: passage.documentId, page: passage.page, highlight: passage.text })}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-xl border px-3.5 py-3 text-left transition-colors hover:border-primary/50",
        cited ? "border-primary/25 bg-[#F7F9FF]" : "bg-background"
      )}
    >
      <span className="flex items-center gap-2 text-xs font-semibold">
        <span className="text-primary">{n}</span>
        <span className="truncate">{passage.title || shortName(passage.filename)}</span>
        <span className="ml-auto shrink-0 font-medium text-muted-foreground">p. {passage.page}</span>
      </span>
      <span className="line-clamp-2 text-[13px] leading-normal text-slate-600">{passage.text}</span>
      <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <span className="truncate">{passage.filename}</span>
        {passage.ocr && (
          <span className="shrink-0 rounded-full bg-ocr px-1.5 py-px font-medium text-ocr-foreground">OCR</span>
        )}
      </span>
    </button>
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
            size="icon-sm"
            aria-label={label}
            onClick={onClick}
            className={cn("text-muted-foreground", active && "bg-accent text-primary")}
          />
        }
      >
        {child}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )

  return (
    <div className="-ml-1.5 flex items-center gap-0.5">
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
          {(meta.tookMs / 1000).toFixed(1)} s · {meta.mode} search · {meta.model}
        </span>
      )}
    </div>
  )
}
