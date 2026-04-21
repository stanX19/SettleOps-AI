import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-brand-primary text-brand-on-primary hover:bg-brand-primary-hover",
        distructive: "bg-semantic-danger text-neutral-white hover:bg-semantic-danger/90",
        outline: "border border-neutral-border bg-neutral-surface hover:bg-neutral-background text-neutral-text-primary",
        secondary: "bg-neutral-background text-neutral-text-primary hover:bg-neutral-border",
        ghost: "hover:bg-neutral-background text-neutral-text-secondary hover:text-neutral-text-primary",
        link: "text-brand-primary underline-offset-4 hover:underline",
        secondaryAI: "bg-neutral-white text-neutral-text-primary border border-brand-primary px-4 py-2 hover:bg-brand-primary-light rounded-full",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
