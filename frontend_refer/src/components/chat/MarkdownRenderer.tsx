import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';

interface MarkdownRendererProps {
    content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
                h1: ({ children }) => <h1 className="text-2xl font-bold mt-6 mb-4 text-gray-800 dark:text-gray-100">{children}</h1>,
                h2: ({ children }) => <h2 className="text-xl font-semibold mt-5 mb-3 text-gray-800 dark:text-gray-100">{children}</h2>,
                h3: ({ children }) => <h3 className="text-lg font-medium mt-4 mb-2 text-gray-800 dark:text-gray-100">{children}</h3>,
                p: ({ children }) => <p className="mb-4 last:mb-0 leading-relaxed text-gray-800 dark:text-gray-200">{children}</p>,
                ul: ({ children }) => <ul className="mb-4 pl-6 space-y-2 list-disc marker:text-gray-400">{children}</ul>,
                ol: ({ children }) => <ol className="mb-4 pl-6 space-y-2 list-decimal marker:text-gray-400">{children}</ol>,
                li: ({ children }) => <li className="text-gray-800 dark:text-gray-200">{children}</li>,
                strong: ({ children }) => <strong className="font-semibold text-gray-900 dark:text-white">{children}</strong>,
                em: ({ children }) => <em className="italic text-gray-800 dark:text-gray-200">{children}</em>,
                blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-gray-200 dark:border-gray-700 pl-4 italic text-gray-600 dark:text-gray-400 my-4 bg-gray-50 dark:bg-gray-800/50 py-2 rounded-r-lg">
                        {children}
                    </blockquote>
                ),
                code: ({ node, inline, className, children, ...props }: any) => {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = inline || !match;

                    if (isInline) {
                        return (
                            <code className="px-1.5 py-0.5 rounded-md bg-black/5 dark:bg-white/10 text-[0.9em] font-mono text-gray-800 dark:text-gray-200" {...props}>
                                {children}
                            </code>
                        );
                    }

                    const language = match ? match[1] : '';
                    const codeString = String(children).replace(/\n$/, '');

                    return (
                        <div className="relative group my-4 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 bg-gray-900 shadow-sm">
                            <div className="flex items-center justify-between px-4 py-2 bg-gray-800 text-xs font-mono text-gray-300 border-b border-gray-700">
                                <span>{language || 'text'}</span>
                                <CopyButton text={codeString} />
                            </div>
                            <div className="p-4 overflow-x-auto">
                                <code className="text-[13px] leading-relaxed font-mono text-gray-100" {...props}>
                                    {codeString}
                                </code>
                            </div>
                        </div>
                    );
                },
                a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:text-blue-800 underline underline-offset-2 transition-colors">
                        {children}
                    </a>
                ),
                table: ({ children }) => (
                    <div className="overflow-x-auto my-6 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 text-sm">
                            {children}
                        </table>
                    </div>
                ),
                thead: ({ children }) => <thead className="bg-gray-50 dark:bg-gray-800/50">{children}</thead>,
                tbody: ({ children }) => <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-transparent">{children}</tbody>,
                tr: ({ children }) => <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/50 transition-colors">{children}</tr>,
                th: ({ children }) => <th className="px-4 py-3 text-left font-medium text-gray-900 dark:text-white tracking-wider">{children}</th>,
                td: ({ children }) => <td className="px-4 py-3 text-gray-800 dark:text-gray-200 whitespace-nowrap">{children}</td>,
                hr: () => <hr className="my-6 border-gray-200 dark:border-gray-700" />
            }}
        >
            {content}
        </ReactMarkdown>
    );
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = React.useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            onClick={handleCopy}
            className="p-1.5 rounded-md hover:bg-gray-700 transition-colors text-gray-400 hover:text-white focus:outline-none focus:ring-2 focus:ring-gray-500"
            title="Copy code"
            aria-label="Copy code"
        >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
        </button>
    );
}
