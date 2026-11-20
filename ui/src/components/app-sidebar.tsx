"use client"

import { BookOpenIcon, MessageCircleIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { useShell } from "@/components/app-shell"
import { Logo } from "@/components/logo"
import { progressFraction } from "@/components/panels/status-badge"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { CATEGORIES } from "@/lib/categories"
import { useLibrary, type Conversation } from "@/lib/store"
import { cn } from "cn"

const isToday = (t: number) => new Date(t).toDateString() === new Date().toDateString()

export function AppSidebar({
  conversations,
  activeId,
  onNewChat,
  onOpenConversation,
  onDeleteConversation,
}: {
  conversations: Conversation[]
  activeId: string
  onNewChat: () => void
  onOpenConversation: (c: Conversation) => void
  onDeleteConversation: (id: string) => void
}) {
  const { openLibrary, openIngest, showChat, view } = useShell()
  const { documents, health } = useLibrary()
  const { setOpenMobile, isMobile } = useSidebar()
  const close = () => isMobile && setOpenMobile(false)

  const pending = documents.filter((d) => d.status === "queued" || d.status === "processing")
  const current = pending.find((d) => d.status === "processing") ?? pending[0]
  const online = health?.status === "ok"
  const today = conversations.filter((c) => isToday(c.updatedAt))
  const earlier = conversations.filter((c) => !isToday(c.updatedAt))

  const convoGroup = (label: string, list: Conversation[]) =>
    list.length > 0 && (
      <SidebarGroup className="py-1 group-data-[collapsible=icon]:hidden">
        <SidebarGroupLabel className="eyebrow">{label}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {list.map((c) => (
              <SidebarMenuItem key={c.id}>
                <SidebarMenuButton
                  isActive={c.id === activeId && view === "chat"}
                  onClick={() => {
                    onOpenConversation(c)
                    close()
                  }}
                  className="h-9 rounded-[10px] text-ink-2 data-active:bg-accent data-active:text-accent-foreground"
                >
                  <span>{c.title}</span>
                </SidebarMenuButton>
                <SidebarMenuAction showOnHover aria-label={`Delete "${c.title}"`} onClick={() => onDeleteConversation(c.id)}>
                  <Trash2Icon />
                </SidebarMenuAction>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="gap-4 px-3.5 pt-4">
        <div className="flex items-center gap-2.5 px-0.5 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
          <Logo size={40} />
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <div className="font-serif text-[21px] leading-[1.1] font-semibold tracking-[-0.01em]">Sahayak</div>
            <div className="truncate text-xs text-muted-foreground">Delhi Police · Knowledge desk</div>
          </div>
          <SidebarTrigger className="size-9 rounded-[10px] text-muted-foreground" />
        </div>

        <div className="grid grid-cols-2 gap-2 group-data-[collapsible=icon]:grid-cols-1 group-data-[collapsible=icon]:justify-items-center">
          <SidebarMenuButton
            tooltip="New chat"
            onClick={() => {
              onNewChat()
              close()
            }}
            className="h-11 justify-center rounded-xl border bg-card font-medium shadow-[0_1px_2px_rgba(13,23,51,0.04)] hover:bg-card group-data-[collapsible=icon]:size-11!"
          >
            <PlusIcon />
            <span>New chat</span>
          </SidebarMenuButton>
          <SidebarMenuButton
            tooltip="Ingest documents"
            onClick={() => {
              openIngest()
              close()
            }}
            className="h-11 justify-center rounded-xl bg-primary font-medium text-primary-foreground shadow-[0_6px_16px_rgba(28,58,148,0.22)] hover:bg-primary/92 hover:text-primary-foreground active:bg-primary active:text-primary-foreground group-data-[collapsible=icon]:size-11!"
          >
            <UploadIcon />
            <span>Ingest</span>
          </SidebarMenuButton>
        </div>
      </SidebarHeader>

      <SidebarContent className="gap-1 px-1.5">
        <SidebarGroup className="py-1">
          <SidebarMenu className="gap-0.5 group-data-[collapsible=icon]:items-center">
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Ask"
                isActive={view === "chat"}
                onClick={() => {
                  showChat()
                  close()
                }}
                className="h-10 rounded-[10px] text-ink-2 data-active:bg-card data-active:font-semibold data-active:text-foreground data-active:shadow-[0_1px_2px_rgba(13,23,51,0.06)] group-data-[collapsible=icon]:size-11!"
              >
                <MessageCircleIcon className="text-primary" />
                <span>Ask</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Library"
                isActive={view === "library"}
                onClick={() => {
                  openLibrary()
                  close()
                }}
                className="h-10 rounded-[10px] text-ink-2 data-active:bg-card data-active:font-semibold data-active:text-foreground data-active:shadow-[0_1px_2px_rgba(13,23,51,0.06)] group-data-[collapsible=icon]:size-11!"
              >
                <BookOpenIcon />
                <span>Library</span>
              </SidebarMenuButton>
              <SidebarMenuBadge className="top-2.5! text-muted-foreground">{documents.length}</SidebarMenuBadge>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        <SidebarGroup className="py-1 group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel className="eyebrow">Collections</SidebarGroupLabel>
          <SidebarMenu className="gap-0">
            {CATEGORIES.map((c) => {
              const count = documents.filter((d) => d.category === c.key).length
              if (!count) return null
              return (
                <SidebarMenuItem key={c.key}>
                  <SidebarMenuButton
                    onClick={() => {
                      openLibrary(c.key)
                      close()
                    }}
                    className="h-[34px] rounded-[10px] text-ink-2"
                  >
                    <span className="size-2 shrink-0 rounded-[3px]" style={{ background: c.color }} />
                    <span>{c.label}</span>
                  </SidebarMenuButton>
                  <SidebarMenuBadge className="text-muted-foreground">{count}</SidebarMenuBadge>
                </SidebarMenuItem>
              )
            })}
          </SidebarMenu>
        </SidebarGroup>

        {convoGroup("Today", today)}
        {convoGroup("Earlier", earlier)}
      </SidebarContent>

      <SidebarFooter className="gap-3 px-3.5 pb-4">
        {current && (
          <button
            onClick={openIngest}
            className="flex flex-col gap-2 rounded-[14px] border bg-card px-3.5 py-3 text-left transition-colors hover:border-primary/30 group-data-[collapsible=icon]:hidden"
          >
            <span className="flex items-center gap-2 text-[13px] font-semibold">
              <ProgressRing value={progressFraction(current)} />
              Ingesting {pending.length} file{pending.length === 1 ? "" : "s"}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {current.filename.replace(/\.[^.]+$/, "")} · {current.progress || "waiting"}
            </span>
            <span className="h-[5px] rounded-full bg-accent">
              <span
                className="block h-[5px] rounded-full bg-primary transition-[width] duration-700"
                style={{ width: `${Math.max(4, Math.round(progressFraction(current) * 100))}%` }}
              />
            </span>
          </button>
        )}
        <div
          className="flex items-center gap-2 px-1.5 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center"
          title={health ? `Weaviate ${health.weaviate ? "up" : "down"} · Ollama ${health.ollama ? "up" : "down"} · ${health.model}` : "API unreachable"}
        >
          <span
            className={cn(
              "size-[7px] shrink-0 rounded-full",
              online ? "bg-ok shadow-[0_0_0_3px_var(--ok-soft)]" : health ? "bg-gold" : "bg-crimson"
            )}
          />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {online ? "On this computer · nothing leaves it" : health ? "Some services are down" : "API unreachable"}
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

function ProgressRing({ value }: { value: number }) {
  const c = 2 * Math.PI * 9
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="var(--accent)" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="var(--primary)"
        strokeWidth="3"
        strokeDasharray={`${c * value} ${c}`}
        transform="rotate(-90 12 12)"
      />
    </svg>
  )
}
