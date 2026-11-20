"use client"

import * as React from "react"
import { ArrowUpIcon, BookOpenIcon, ChevronDownIcon, FileTextIcon, PaperclipIcon, SquareIcon } from "lucide-react"
import { useShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { displayTitle } from "@/lib/api"
import { useLibrary } from "@/lib/store"
import { cn } from "cn"

export function Composer({
  onSend,
  onStop,
  busy,
  large = false,
  placeholder = "Ask about any order, circular or notification",
}: {
  onSend: (text: string) => void
  onStop?: () => void
  busy: boolean
  large?: boolean
  placeholder?: string
}) {
  const { scope, setScope, openIngest } = useShell()
  const { documents } = useLibrary()
  const ready = documents.filter((d) => d.status === "ready")
  const [text, setText] = React.useState("")
  const ref = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  const submit = () => {
    if (!text.trim() || busy) return
    onSend(text)
    setText("")
  }

  return (
    <div className="flex flex-col gap-2.5">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className={cn(
          "flex flex-col gap-2.5 rounded-[22px] border border-input bg-card py-3 pr-3 pl-[18px] shadow-[0_10px_30px_rgba(13,23,51,0.07)] transition-shadow focus-within:border-ring focus-within:shadow-[0_14px_40px_rgba(28,58,148,0.12)]",
          large && "rounded-[26px] pt-4 pl-[22px]"
        )}
      >
        <label htmlFor="composer" className="sr-only">
          Ask a question
        </label>
        <textarea
          id="composer"
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          placeholder={placeholder}
          className={cn(
            "min-h-7 resize-none bg-transparent text-base outline-none placeholder:text-muted-foreground",
            large && "min-h-8 text-lg"
          )}
        />
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  className="inline-flex h-8 max-w-[60%] items-center gap-1.5 rounded-full border bg-secondary px-3 text-xs font-medium text-ink-2 hover:border-primary/30"
                />
              }
            >
              {scope ? <FileTextIcon className="size-3.5 shrink-0" /> : <BookOpenIcon className="size-3.5 shrink-0" />}
              <span className="truncate">{scope ? scope.title : `All ${ready.length} documents`}</span>
              <ChevronDownIcon className="size-3.5 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-80 w-80">
              <DropdownMenuItem onClick={() => setScope(null)}>
                <BookOpenIcon />
                All {ready.length} documents
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Only one document</DropdownMenuLabel>
              {ready.map((d) => (
                <DropdownMenuItem key={d.id} onClick={() => setScope({ id: d.id, title: displayTitle(d) })}>
                  <FileTextIcon />
                  <span className="truncate">{displayTitle(d)}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Add documents"
            onClick={openIngest}
            className="size-8 rounded-full"
          >
            <PaperclipIcon />
          </Button>
          <span className="ml-auto hidden text-xs text-muted-foreground sm:inline">Enter to send</span>
          {busy && onStop ? (
            <Button type="button" variant="secondary" aria-label="Stop" onClick={onStop} className="size-10 rounded-[14px] border">
              <SquareIcon className="fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              aria-label="Send"
              disabled={!text.trim() || busy}
              className={cn(
                "size-10 rounded-[14px] shadow-[0_6px_16px_rgba(28,58,148,0.3)] disabled:shadow-none",
                large && "size-11 rounded-[15px]"
              )}
            >
              <ArrowUpIcon className="size-[18px]" />
            </Button>
          )}
        </div>
      </form>
      {!large && (
        <p className="text-center text-xs text-muted-foreground">
          Answers come only from ingested documents. Check the cited page before acting on it.
        </p>
      )}
    </div>
  )
}
