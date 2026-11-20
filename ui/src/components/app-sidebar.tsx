"use client"

import { BookOpenIcon, MessageSquareIcon, PlusIcon, Trash2Icon, UploadIcon } from "lucide-react"
import { useShell } from "@/components/app-shell"
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
} from "@/components/ui/sidebar"
import { useLibrary, type Conversation } from "@/lib/store"
import { cn } from "cn"

export function AppSidebar({
  conversations,
  activeId,
  libraryOpen,
  onNewChat,
  onOpenConversation,
  onDeleteConversation,
}: {
  conversations: Conversation[]
  activeId: string
  libraryOpen: boolean
  onNewChat: () => void
  onOpenConversation: (c: Conversation) => void
  onDeleteConversation: (id: string) => void
}) {
  const { openLibrary, openIngest } = useShell()
  const { documents, health } = useLibrary()
  const pending = documents.filter((d) => d.status === "queued" || d.status === "processing").length
  const online = health?.status === "ok"

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 pt-3">
        <div className="flex items-center gap-2.5 px-1 group-data-[collapsible=icon]:flex-col group-data-[collapsible=icon]:px-0">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-primary text-sm font-bold text-primary-foreground">
            S
          </div>
          <div className="min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
            <div className="text-[15px] font-semibold">Sahayak</div>
            <div className="text-xs text-muted-foreground">Knowledge assistant</div>
          </div>
          <SidebarTrigger className="text-muted-foreground" aria-label="Toggle sidebar" />
        </div>
        <SidebarMenu className="gap-1.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="New chat"
              onClick={onNewChat}
              className="h-10 border bg-background font-medium hover:bg-background/70"
            >
              <PlusIcon />
              <span>New chat</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              tooltip="Ingest documents"
              onClick={openIngest}
              className="h-10 bg-primary font-medium text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
            >
              <UploadIcon />
              <span>Ingest documents</span>
            </SidebarMenuButton>
            {pending > 0 && (
              <SidebarMenuBadge className="top-2.5! rounded-full bg-primary-foreground/20 text-primary-foreground!">{pending}</SidebarMenuBadge>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Library" isActive={libraryOpen} onClick={openLibrary}>
                  <BookOpenIcon />
                  <span>Library</span>
                </SidebarMenuButton>
                <SidebarMenuBadge>{documents.length}</SidebarMenuBadge>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {conversations.length > 0 && (
          <SidebarGroup className="group-data-[collapsible=icon]:hidden">
            <SidebarGroupLabel>Recent</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {conversations.map((c) => (
                  <SidebarMenuItem key={c.id}>
                    <SidebarMenuButton
                      isActive={c.id === activeId}
                      onClick={() => onOpenConversation(c)}
                      className="data-active:border data-active:bg-background"
                    >
                      <MessageSquareIcon className="text-muted-foreground" />
                      <span>{c.title}</span>
                    </SidebarMenuButton>
                    <SidebarMenuAction
                      showOnHover
                      aria-label={`Delete "${c.title}"`}
                      onClick={() => onDeleteConversation(c.id)}
                    >
                      <Trash2Icon />
                    </SidebarMenuAction>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <div
          className="flex items-center gap-2 border-t px-2 pt-3 pb-1 text-xs text-muted-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:border-0"
          title={health ? `Weaviate ${health.weaviate ? "up" : "down"} · Ollama ${health.ollama ? "up" : "down"} · ${health.model}` : "API unreachable"}
        >
          <span
            className={cn("size-2 shrink-0 rounded-full", online ? "bg-green-600" : health ? "bg-amber-500" : "bg-red-600")}
          />
          <span className="truncate group-data-[collapsible=icon]:hidden">
            {online ? "All services online · runs locally" : health ? "Some services are down" : "API unreachable"}
          </span>
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
