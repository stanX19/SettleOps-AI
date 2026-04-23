"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "prose-p:leading-relaxed prose-p:mb-2 last:prose-p:mb-0",
        "prose-ul:my-2 prose-li:my-0.5",
        "prose-code:bg-neutral-background prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs",
        "prose-strong:font-bold prose-strong:text-neutral-text-primary",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
