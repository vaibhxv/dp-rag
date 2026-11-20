"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { ArrowDownIcon, BookOpenIcon, FileTextIcon } from "lucide-react"
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom"
import { useShell } from "@/components/app-shell"
import { AssistantMessage } from "@/components/chat/assistant-message"
import { Composer } from "@/components/chat/composer"
import { Welcome } from "@/components/chat/welcome"
import { Button } from "@/components/ui/button"
import { API_URL, type ChatData, type ChatMessage } from "@/lib/api"
import { useLibrary, type Conversation } from "@/lib/store"
import { toast } from "sonner"

export const textOf = (m: ChatMessage) =>
  m.parts
    .filter((p) => p.type === "text")
    .map((p) => p.text)
    .join("")

export function ChatView({
  chatId,
  initial,
  onSave,
}: {
  chatId: string
  initial: Conversation | null
  onSave: (c: Conversation) => void
}) {
  const { scope, askRef } = useShell()
  const { documents } = useLibrary()
  const body = scope ? { documentId: scope.id } : {}
  const [step, setStep] = React.useState<ChatData["status"]["step"] | null>(null)

  const transport = React.useMemo(
    () => new DefaultChatTransport<ChatMessage>({ api: `${API_URL}/chat` }),
    []
  )

  const { messages, sendMessage, status, stop, regenerate, error } = useChat<ChatMessage>({
    id: chatId,
    messages: initial?.messages ?? [],
    transport,
    onData: (part) => {
      if (part.type === "data-status") setStep(part.data.step)
    },
    onFinish: () => setStep(null),
    onError: (e) => {
      setStep(null)
      toast.error(e.message || "The assistant could not answer")
    },
  })

  const busy = status === "submitted" || status === "streaming"
  React.useEffect(() => {
    if (busy || messages.length === 0) return
    const firstUser = messages.find((m) => m.role === "user")
    onSave({
      id: chatId,
      title: (firstUser ? textOf(firstUser) : "Conversation").slice(0, 80),
      messages,
      updatedAt: Date.now(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, messages.length])

  const send = (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    setStep("retrieving")
    void sendMessage({ text: t }, { body })
  }

  // Let other parts of the app (suggestions, "Ask this document") ask here.
  React.useEffect(() => {
    askRef.current = send
  })

  const firstUser = messages.find((m) => m.role === "user")
  const asked = new Set(messages.filter((m) => m.role === "user").map(textOf))
  const ready = documents.filter((d) => d.status === "ready")

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-16 shrink-0 items-center gap-3 border-b border-[#EEF1F6] px-4 sm:px-7">
        <h1 className="truncate text-[15px] font-semibold">{firstUser ? textOf(firstUser) : "New chat"}</h1>
        <span className="inline-flex h-7 max-w-[50%] shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 text-xs font-medium text-ink-2">
          {scope ? <FileTextIcon className="size-3.5" /> : <BookOpenIcon className="size-3.5" />}
          <span className="truncate">{scope ? `Only: ${scope.title}` : `All ${ready.length} documents`}</span>
        </span>
      </header>

      {messages.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Welcome onAsk={send} busy={busy} />
        </div>
      ) : (
        <>
          <StickToBottom className="relative min-h-0 flex-1 overflow-y-hidden" resize="smooth" initial="instant">
            <StickToBottom.Content className="mx-auto flex w-full max-w-[780px] flex-col gap-7 px-4 pt-8 pb-6 sm:px-7">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div
                    key={m.id}
                    className="max-w-[78%] self-end rounded-[20px] rounded-br-md bg-navy-ink px-[18px] py-3 text-[15px] whitespace-pre-wrap text-white"
                  >
                    {textOf(m)}
                  </div>
                ) : (
                  <AssistantMessage
                    key={m.id}
                    message={m}
                    streaming={busy && i === messages.length - 1}
                    step={i === messages.length - 1 ? step : null}
                    isLast={i === messages.length - 1}
                    asked={asked}
                    onAsk={send}
                    onRegenerate={() => {
                      setStep("retrieving")
                      void regenerate({ body })
                    }}
                  />
                )
              )}
              {status === "submitted" && messages.at(-1)?.role === "user" && (
                <AssistantMessage pending step={step ?? "retrieving"} />
              )}
              {error && !busy && (
                <p className="text-sm text-destructive">
                  {error.message || "Something went wrong."}{" "}
                  <button className="underline" onClick={() => void regenerate({ body })}>
                    Try again
                  </button>
                </p>
              )}
            </StickToBottom.Content>
            <JumpToLatest />
          </StickToBottom>
          <div className="mx-auto w-full max-w-[780px] px-3 pt-2 pb-4 sm:px-7 sm:pb-5">
            <Composer onSend={send} onStop={stop} busy={busy} placeholder="Ask a follow-up, in English, Hindi or Hinglish" />
          </div>
        </>
      )}
    </div>
  )
}

function JumpToLatest() {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext()
  if (isAtBottom) return null
  return (
    <Button
      variant="outline"
      size="sm"
      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-card shadow-md"
      onClick={() => void scrollToBottom()}
    >
      <ArrowDownIcon />
      Jump to latest
    </Button>
  )
}
