"use client"

import * as React from "react"
import { MenuIcon, UploadIcon } from "lucide-react"
import { AppSidebar } from "@/components/app-sidebar"
import { ChatView } from "@/components/chat/chat-view"
import { IngestDialog } from "@/components/ingest-dialog"
import { LibraryView } from "@/components/library-view"
import { Logo } from "@/components/logo"
import { DocumentPanel } from "@/components/panels/document-panel"
import { Button } from "@/components/ui/button"
import { SidebarInset, SidebarProvider, useSidebar } from "@/components/ui/sidebar"
import { LibraryProvider, useConversations, type Conversation } from "@/lib/store"
import { cn } from "cn"

export type DocTarget = {
  id: string
  page?: number
  /** Passage to mark on the page. */
  highlight?: string
  /** The line inside it that answers the question (marked strongly). */
  focus?: string
  from?: "library"
}
type Scope = { id: string; title: string } | null

interface ShellActions {
  view: "chat" | "library"
  openDocument: (t: DocTarget) => void
  openLibrary: (category?: string) => void
  showChat: () => void
  openIngest: () => void
  /** Restrict chat retrieval to one document (null = all documents). */
  setScope: (scope: Scope) => void
  scope: Scope
  /** Ask a question in the current chat (used by "Ask this document" etc.). */
  askRef: React.RefObject<((q: string) => void) | null>
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
  const [chat, setChat] = React.useState<{ id: string; initial: Conversation | null }>({
    id: "initial",
    initial: null,
  })
  const [view, setView] = React.useState<"chat" | "library">("chat")
  const [libraryCategory, setLibraryCategory] = React.useState<string | undefined>()
  const [doc, setDoc] = React.useState<DocTarget | null>(null)
  const [expanded, setExpanded] = React.useState(false)
  const [ingestOpen, setIngestOpen] = React.useState(false)
  const [scope, setScope] = React.useState<Scope>(null)
  const askRef = React.useRef<((q: string) => void) | null>(null)

  const actions = React.useMemo<ShellActions>(
    () => ({
      view,
      openDocument: (t) => setDoc(t),
      openLibrary: (category) => {
        setLibraryCategory(category)
        setView("library")
        setDoc(null)
        setExpanded(false)
      },
      showChat: () => setView("chat"),
      openIngest: () => setIngestOpen(true),
      setScope,
      scope,
      askRef,
    }),
    [view, scope]
  )

  const startNewChat = () => {
    setChat({ id: newId(), initial: null })
    setScope(null)
    setView("chat")
  }

  return (
    <ShellContext.Provider value={actions}>
      <LibraryProvider>
        <SidebarProvider
          className="h-svh overflow-hidden"
          style={{ "--sidebar-width": "18.5rem", "--sidebar-width-icon": "4.75rem" } as React.CSSProperties}
        >
          <AppSidebar
            conversations={conversations}
            activeId={chat.id}
            onNewChat={startNewChat}
            onOpenConversation={(c) => {
              setChat({ id: c.id, initial: c })
              setView("chat")
            }}
            onDeleteConversation={(id) => {
              remove(id)
              if (id === chat.id) startNewChat()
            }}
          />
          <SidebarInset className="flex h-svh min-w-0 flex-col bg-background p-2.5 md:pl-0">
            <MobileHeader onIngest={() => setIngestOpen(true)} />
            <div className="flex min-h-0 flex-1 overflow-hidden rounded-[22px] bg-card shadow-[0_0_0_1px_var(--border),0_10px_40px_rgba(13,23,51,0.05)]">
              <div className={cn("flex min-w-0 flex-1 flex-col", doc && expanded && "hidden", view !== "chat" && "hidden")}>
                <ChatView key={chat.id} chatId={chat.id} initial={chat.initial} onSave={upsert} />
              </div>
              {view === "library" && (
                <div className={cn("flex min-w-0 flex-1 flex-col", doc && expanded && "hidden")}>
                  <LibraryView key={libraryCategory ?? "all"} initialCategory={libraryCategory} compact={Boolean(doc)} />
                </div>
              )}
              {doc && (
                <aside
                  className={cn(
                    "flex min-w-0 shrink-0 flex-col border-l bg-panel",
                    expanded ? "flex-1" : "w-[min(470px,44vw)]",
                    "max-md:fixed max-md:inset-0 max-md:z-40 max-md:w-full max-md:border-0"
                  )}
                >
                  <DocumentPanel
                    key={`${doc.id}:${doc.page ?? ""}:${doc.highlight ?? ""}`}
                    {...doc}
                    expanded={expanded}
                    onToggleExpand={() => setExpanded((e) => !e)}
                    onClose={() => {
                      setDoc(null)
                      setExpanded(false)
                    }}
                  />
                </aside>
              )}
            </div>
          </SidebarInset>
        </SidebarProvider>
        <IngestDialog open={ingestOpen} onOpenChange={setIngestOpen} />
      </LibraryProvider>
    </ShellContext.Provider>
  )
}

function MobileHeader({ onIngest }: { onIngest: () => void }) {
  const { toggleSidebar } = useSidebar()
  return (
    <header className="flex items-center gap-2.5 pb-2.5 md:hidden">
      <Button variant="secondary" size="icon-lg" aria-label="Open menu" onClick={toggleSidebar} className="bg-card">
        <MenuIcon />
      </Button>
      <Logo size={30} />
      <span className="flex-1 font-serif text-[19px] font-semibold">Sahayak</span>
      <Button size="icon-lg" aria-label="Ingest documents" onClick={onIngest}>
        <UploadIcon />
      </Button>
    </header>
  )
}
