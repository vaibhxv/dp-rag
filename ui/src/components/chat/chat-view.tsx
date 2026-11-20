"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { ArrowDownIcon } from "lucide-react"
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom"
import { useShell } from "@/components/app-shell"
import { AssistantMessage } from "@/components/chat/assistant-message"
import { Composer } from "@/components/chat/composer"
import { Welcome } from "@/components/chat/welcome"
import { Button } from "@/components/ui/button"
import { API_URL, type ChatData, type ChatMessage } from "@/lib/api"
import type { Conversation } from "@/lib/store"
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
  const { scope } = useShell()
  const body = scope ? { documentId: scope.id } : {}

  const [step, setStep] = React.useState<ChatData["status"]["step"] | null>(null)

  const transport = React.useMemo(
    () =>
      new DefaultChatTransport<ChatMessage>({
        api: `${API_URL}/chat`,
      }),
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

  // Persist the conversation once a turn completes.
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

  const firstUser = messages.find((m) => m.role === "user")

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b px-6">
        <h1 className="truncate text-sm font-semibold">
          {firstUser ? textOf(firstUser) : "New chat"}
        </h1>
      </header>

      {messages.length === 0 ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <Welcome onAsk={send} busy={busy} />
        </div>
      ) : (
        <>
          <StickToBottom className="relative min-h-0 flex-1 overflow-y-hidden" resize="smooth" initial="instant">
            <StickToBottom.Content className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-7">
              {messages.map((m, i) =>
                m.role === "user" ? (
                  <div
                    key={m.id}
                    className="max-w-[80%] self-end rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-[15px] whitespace-pre-wrap text-primary-foreground"
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
          <div className="mx-auto w-full max-w-3xl px-6 pt-2 pb-5">
            <Composer onSend={send} onStop={stop} busy={busy} />
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
      className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background shadow-sm"
      onClick={() => void scrollToBottom()}
    >
      <ArrowDownIcon />
      Jump to latest
    </Button>
  )
}
