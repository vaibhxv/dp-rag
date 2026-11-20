"use client"

import * as React from "react"
import { api, type DocumentDto, type Health, type ChatMessage } from "@/lib/api"

/* ------------------------------------------------------------------ */
/* Documents + health: polled, faster while ingestion is running.      */
/* ------------------------------------------------------------------ */

interface LibraryState {
  documents: DocumentDto[]
  health: Health | null
  loaded: boolean
  refresh: () => Promise<void>
}

const LibraryContext = React.createContext<LibraryState | null>(null)

export function LibraryProvider({ children }: { children: React.ReactNode }) {
  const [documents, setDocuments] = React.useState<DocumentDto[]>([])
  const [health, setHealth] = React.useState<Health | null>(null)
  const [loaded, setLoaded] = React.useState(false)

  const refresh = React.useCallback(async () => {
    const [docs, h] = await Promise.allSettled([api.listDocuments(), api.health()])
    if (docs.status === "fulfilled") setDocuments(docs.value)
    setHealth(h.status === "fulfilled" ? h.value : null)
    setLoaded(true)
  }, [])

  const pending = documents.some((d) => d.status === "queued" || d.status === "processing")

  React.useEffect(() => {
    let alive = true
    const tick = () => {
      if (alive) void refresh()
    }
    tick()
    const t = setInterval(tick, pending ? 1500 : 10000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [refresh, pending])

  const value = React.useMemo(
    () => ({ documents, health, loaded, refresh }),
    [documents, health, loaded, refresh]
  )
  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>
}

export function useLibrary() {
  const ctx = React.useContext(LibraryContext)
  if (!ctx) throw new Error("useLibrary must be used inside LibraryProvider")
  return ctx
}

/* ------------------------------------------------------------------ */
/* Conversations: kept in this browser only (localStorage).            */
/* ------------------------------------------------------------------ */

export interface Conversation {
  id: string
  title: string
  messages: ChatMessage[]
  updatedAt: number
}

const KEY = "sahayak.conversations.v1"

function load(): Conversation[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Conversation[]) : []
  } catch {
    return []
  }
}

function save(list: Conversation[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30)))
  } catch {
    // storage full or blocked: history just isn't kept
  }
}

export function useConversations() {
  const [list, setList] = React.useState<Conversation[]>([])
  React.useEffect(() => {
    // localStorage only exists in the browser, so read after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setList(load())
  }, [])

  const upsert = React.useCallback((c: Conversation) => {
    setList((prev) => {
      const next = [c, ...prev.filter((p) => p.id !== c.id)]
      save(next)
      return next
    })
  }, [])

  const remove = React.useCallback((id: string) => {
    setList((prev) => {
      const next = prev.filter((p) => p.id !== id)
      save(next)
      return next
    })
  }, [])

  return { conversations: list, upsert, remove }
}
