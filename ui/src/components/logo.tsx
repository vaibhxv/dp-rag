import Image from "next/image"
import { cn } from "cn"

/** Delhi Police emblem (ui/public/logo.png, transparent background). */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/logo.png"
      alt="Delhi Police emblem"
      width={size}
      height={size}
      className={cn("shrink-0 object-contain", className)}
      style={{ width: size, height: size }}
      priority
    />
  )
}
