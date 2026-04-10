"use client";

/**
 * NoteContentRenderer — full markdown rendering with GFM support.
 * Handles: headings, bold, italic, tables, lists, code blocks,
 * blockquotes, horizontal rules, links, strikethrough.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
}

export default function NoteContentRenderer({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h2 className="mt-6 mb-2 text-xl font-bold text-gray-900">{children}</h2>
        ),
        h2: ({ children }) => (
          <h3 className="mt-5 mb-1 text-lg font-semibold text-gray-900">{children}</h3>
        ),
        h3: ({ children }) => (
          <h4 className="mt-4 mb-1 text-base font-semibold text-gray-800">{children}</h4>
        ),
        h4: ({ children }) => (
          <h5 className="mt-3 mb-1 text-sm font-semibold text-gray-700 uppercase tracking-wide">{children}</h5>
        ),
        p: ({ children }) => (
          <p className="text-base text-gray-900 leading-relaxed my-2">{children}</p>
        ),
        strong: ({ children }) => (
          <strong className="font-semibold text-gray-900">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-gray-800">{children}</em>
        ),
        del: ({ children }) => (
          <del className="line-through text-gray-500">{children}</del>
        ),
        ul: ({ children }) => (
          <ul className="my-2 list-disc pl-6 space-y-1 text-gray-800">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2 list-decimal pl-6 space-y-1 text-gray-800">{children}</ol>
        ),
        li: ({ children }) => (
          <li className="text-base leading-relaxed">{children}</li>
        ),
        blockquote: ({ children }) => (
          <blockquote className="my-3 pl-4 border-l-4 border-gray-300 text-gray-600 italic">
            {children}
          </blockquote>
        ),
        code: ({ inline, children, ...props }: { inline?: boolean; children?: React.ReactNode }) =>
          inline ? (
            <code
              className="px-1.5 py-0.5 rounded bg-gray-100 text-sm font-mono text-gray-800"
              {...props}
            >
              {children}
            </code>
          ) : (
            <pre className="my-3 p-4 rounded-lg bg-gray-900 text-gray-100 text-sm font-mono overflow-x-auto">
              <code {...props}>{children}</code>
            </pre>
          ),
        table: ({ children }) => (
          <div className="my-3 overflow-x-auto">
            <table className="min-w-full text-sm border-collapse border border-gray-200">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-gray-50">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-gray-100">{children}</tbody>
        ),
        tr: ({ children }) => (
          <tr className="hover:bg-gray-50 transition-colors">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left font-semibold text-gray-700 border border-gray-200">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-gray-800 border border-gray-200">{children}</td>
        ),
        hr: () => <hr className="my-4 border-gray-200" />,
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline hover:text-blue-800"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
