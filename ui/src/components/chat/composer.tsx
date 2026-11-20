"use client"

import * as React from "react"
import { ArrowUpIcon, FileTextIcon, SquareIcon, XIcon } from "lucide-react"
import { useShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { cn } from "cn"

export function Composer({
  onSend,
  onStop,
  busy,
  large = false,
}: {
  onSend: (text: string) => void
  onStop?: () => void
  busy: boolean
  large?: boolean
}) {
  const { scope, setScope } = useShell()
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
    <div className="flex flex-col gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        className={cn(
          "flex flex-col gap-1 rounded-2xl border border-input bg-background px-2 py-2 shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition-shadow focus-within:border-ring focus-within:shadow-[0_6px_24px_rgba(36,87,214,0.10)]",
          large && "rounded-[18px] px-2.5 py-2.5"
        )}
      >
        {scope && (
          <div className="flex px-2 pt-0.5">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-accent py-0.5 pr-1 pl-2.5 text-xs font-medium text-accent-foreground">
              <FileTextIcon className="size-3.5 shrink-0" />
              <span className="truncate">Only searching: {scope.title}</span>
              <button
                type="button"
                aria-label="Search all documents"
                className="rounded-full p-0.5 hover:bg-primary/10"
                onClick={() => setScope(null)}
              >
                <XIcon className="size-3.5" />
              </button>
            </span>
          </div>
        )}
        <div className="flex items-end gap-2">
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
            placeholder="Ask about any order, circular or notification"
            className={cn(
              "min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] outline-none placeholder:text-muted-foreground",
              large && "min-h-10 text-base"
            )}
          />
          {busy && onStop ? (
            <Button type="button" size="icon" variant="secondary" aria-label="Stop" onClick={onStop} className="size-9 rounded-[10px]">
              <SquareIcon className="fill-current" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              aria-label="Send"
              disabled={!text.trim() || busy}
              className={cn("size-9 rounded-[10px]", large && "size-10 rounded-xl")}
            >
              <ArrowUpIcon />
            </Button>
          )}
        </div>
      </form>
      <p className="text-center text-xs text-muted-foreground">
        Answers come only from your ingested documents. Check the cited page before acting on it.
      </p>
    </div>
  )
}
