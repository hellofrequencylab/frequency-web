'use client'

import ReactMarkdown from 'react-markdown'

export function DispatchBody({ body }: { body: string }) {
  return (
    <div className="dispatch-prose">
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-2xl font-black text-gray-900 dark:text-gray-50 mt-8 mb-3 leading-tight">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-black text-gray-900 dark:text-gray-50 mt-7 mb-2 leading-tight">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-bold text-gray-800 dark:text-gray-200 mt-5 mb-2">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="text-base text-gray-700 dark:text-gray-300 leading-relaxed mb-4">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-gray-900 dark:text-gray-50">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-gray-700 dark:text-gray-300">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="space-y-1.5 mb-4 ml-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="space-y-1.5 mb-4 ml-4 list-decimal">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-base text-gray-700 dark:text-gray-300 leading-relaxed flex gap-2">
              <span className="shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-indigo-400" aria-hidden />
              <span>{children}</span>
            </li>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:text-indigo-800 dark:hover:text-indigo-300 transition-colors"
            >
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-indigo-300 dark:border-indigo-700 pl-4 my-4 italic text-gray-600 dark:text-gray-400">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="font-mono text-sm bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 px-1.5 py-0.5 rounded">
              {children}
            </code>
          ),
          hr: () => (
            <hr className="my-6 border-gray-200 dark:border-gray-800" />
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}
