import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-sm border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-neutral-text-primary text-neutral-white hover:bg-neutral-text-primary/80",
        secondary:
          "border-transparent bg-neutral-background text-neutral-text-secondary hover:bg-neutral-background/80",
        distructive:
          "border-transparent bg-semantic-danger text-neutral-white hover:bg-semantic-danger/80",
        success:
          "border-transparent bg-semantic-success text-neutral-white hover:bg-semantic-success/80",
        warning:
          "border-transparent bg-semantic-warning text-neutral-white hover:bg-semantic-warning/80",
        outline: "text-neutral-text-primary border-neutral-border",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
