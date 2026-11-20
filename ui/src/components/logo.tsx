import Image from "next/image"
import { cn } from "cn"

/** Organisation emblem (ui/public/logo.png) on a white tile. */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[22%] bg-white ring-1 ring-border",
        className
      )}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.png"
        alt="Delhi Police emblem"
        width={size}
        height={size}
        className="size-[92%] object-contain"
        priority
      />
    </span>
  )
}
