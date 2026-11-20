"use client"

import { ChevronLeftIcon, Maximize2Icon, Minimize2Icon, XIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

export function PanelHeader({
  title,
  expanded,
  onToggleExpand,
  onClose,
  onBack,
  backLabel = "Library",
  children,
}: {
  title: string
  expanded: boolean
  onToggleExpand: () => void
  onClose: () => void
  onBack?: () => void
  backLabel?: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-1 border-b px-3">
      {onBack ? (
        <Button variant="ghost" size="sm" onClick={onBack} className="text-primary">
          <ChevronLeftIcon />
          {backLabel}
        </Button>
      ) : (
        <span className="pl-2 text-sm font-semibold">{title}</span>
      )}
      <div className="ml-auto flex items-center gap-0.5">
        {children}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={expanded ? "Shrink panel" : "Expand panel"}
          onClick={onToggleExpand}
          className="text-muted-foreground"
        >
          {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Close panel" onClick={onClose} className="text-muted-foreground">
          <XIcon />
        </Button>
      </div>
    </div>
  )
}
