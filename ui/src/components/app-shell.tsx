"use client"

import * as React from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { ChatView } from "@/components/chat/chat-view"
import { IngestDialog } from "@/components/ingest-dialog"
import { DocumentPanel } from "@/components/panels/document-panel"
import { LibraryPanel } from "@/components/panels/library-panel"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { LibraryProvider, useConversations, type Conversation } from "@/lib/store"
import { cn } from "cn"

export type Panel =
  | { type: "library" }
  | { type: "document"; id: string; page?: number; highlight?: string; from?: "library" }

interface ShellActions {
  openDocument: (p: Omit<Extract<Panel, { type: "document" }>, "type">) => void
  openLibrary: () => void
  openIngest: () => void
  /** Restrict the next questions to one document (null = all documents). */
  setScope: (scope: { id: string; title: string } | null) => void
  scope: { id: string; title: string } | null
}

const ShellContext = React.createContext<ShellActions | null>(null)
export function useShell() {
  const ctx = React.useContext(ShellContext)
  if (!ctx) throw new Error("useShell must be used inside AppShell")
  return ctx
}

const newId = () => crypto.randomUUID()

export function AppShell() {
  const { conversations, upsert, remove } = useConversations()
  const [chat, setChat] = React.useState<{ id: string; initial: Conversation | null }>(() => ({
    id: "initial",
    initial: null,
  }))
  const [panel, setPanel] = React.useState<Panel | null>(null)
  const [expanded, setExpanded] = React.useState(false)
  const [ingestOpen, setIngestOpen] = React.useState(false)
  const [scope, setScope] = React.useState<{ id: string; title: string } | null>(null)

  const actions = React.useMemo<ShellActions>(
    () => ({
      openDocument: (p) => setPanel({ type: "document", ...p }),
      openLibrary: () => setPanel({ type: "library" }),
      openIngest: () => setIngestOpen(true),
      setScope,
      scope,
    }),
    [scope]
  )

  const startNewChat = () => {
    setChat({ id: newId(), initial: null })
    setScope(null)
  }

  return (
    <ShellContext.Provider value={actions}>
      <LibraryProvider>
        <SidebarProvider className="h-svh overflow-hidden">
          <AppSidebar
            conversations={conversations}
            activeId={chat.id}
            libraryOpen={panel?.type === "library"}
            onNewChat={startNewChat}
            onOpenConversation={(c) => setChat({ id: c.id, initial: c })}
            onDeleteConversation={(id) => {
              remove(id)
              if (id === chat.id) startNewChat()
            }}
          />
          <SidebarInset className="flex h-svh min-w-0 flex-row overflow-hidden">
            <div className={cn("flex min-w-0 flex-1 flex-col", panel && expanded && "hidden")}>
              <ChatView
                key={chat.id}
                chatId={chat.id}
                initial={chat.initial}
                onSave={upsert}
              />
            </div>
            {panel && (
              <aside
                className={cn(
                  "flex h-svh min-w-0 shrink-0 flex-col border-l bg-background",
                  expanded ? "flex-1" : "w-[min(480px,45vw)]"
                )}
              >
                {panel.type === "library" ? (
                  <LibraryPanel
                    expanded={expanded}
                    onToggleExpand={() => setExpanded((e) => !e)}
                    onClose={() => setPanel(null)}
                  />
                ) : (
                  <DocumentPanel
                    key={`${panel.id}:${panel.page ?? ""}:${panel.highlight ?? ""}`}
                    {...panel}
                    expanded={expanded}
                    onToggleExpand={() => setExpanded((e) => !e)}
                    onBack={panel.from === "library" ? () => setPanel({ type: "library" }) : undefined}
                    onClose={() => setPanel(null)}
                  />
                )}
              </aside>
            )}
          </SidebarInset>
        </SidebarProvider>
        <IngestDialog open={ingestOpen} onOpenChange={setIngestOpen} />
      </LibraryProvider>
    </ShellContext.Provider>
  )
}
