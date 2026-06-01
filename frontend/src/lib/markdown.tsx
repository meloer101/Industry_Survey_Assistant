import type { ReactNode } from "react";
import { cn } from "@/utils";
import { Badge } from "@/components/ui/badge";

interface MdComponentProps {
  className?: string;
  children?: ReactNode;
  href?: string;
  [key: string]: unknown;
}

export const mdComponents: Record<string, React.FC<MdComponentProps>> = {
  h1: ({ className, children, ...props }) => (
    <h1
      className={cn("text-2xl font-bold mt-4 mb-2 text-gray-900", className)}
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }) => (
    <h2
      className={cn("text-xl font-bold mt-3 mb-2 text-gray-900", className)}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }) => (
    <h3
      className={cn("text-lg font-bold mt-3 mb-1 text-gray-800", className)}
      {...props}
    >
      {children}
    </h3>
  ),
  p: ({ className, children, ...props }) => (
    <p
      className={cn("mb-3 leading-7 text-gray-700", className)}
      {...props}
    >
      {children}
    </p>
  ),
  a: ({ className, children, href, ...props }) => (
    <Badge className="text-xs mx-0.5 border hover:opacity-90"
           style={{ backgroundColor: 'var(--app-gold-bg)', borderColor: 'var(--app-gold-ring)', color: 'var(--app-gold-dim)' }}>
      <a
        className={cn(
          "text-xs",
          className,
        )}
        style={{ color: 'var(--app-gold-dim)' }}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    </Badge>
  ),
  ul: ({ className, children, ...props }) => (
    <ul
      className={cn("list-disc pl-6 mb-3 text-gray-700", className)}
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ className, children, ...props }) => (
    <ol
      className={cn("list-decimal pl-6 mb-3 text-gray-700", className)}
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ className, children, ...props }) => (
    <li className={cn("mb-1", className)} {...props}>
      {children}
    </li>
  ),
  blockquote: ({ className, children, ...props }) => (
    <blockquote
      className={cn(
        "border-l-4 border-gray-300 pl-4 italic my-3 text-sm text-gray-500",
        className,
      )}
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }) => (
    <code
      className={cn(
        "bg-gray-100 rounded px-1 py-0.5 font-mono text-xs text-gray-800",
        className,
      )}
      {...props}
    >
      {children}
    </code>
  ),
  pre: ({ className, children, ...props }) => (
    <pre
      className={cn(
        "bg-gray-100 p-3 rounded-lg overflow-x-auto font-mono text-xs my-3 text-gray-800",
        className,
      )}
      {...props}
    >
      {children}
    </pre>
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("border-gray-200 my-4", className)} {...props} />
  ),
  table: ({ className, children, ...props }) => (
    <div className="my-3 overflow-x-auto">
      <table
        className={cn("border-collapse w-full", className)}
        {...props}
      >
        {children}
      </table>
    </div>
  ),
  th: ({ className, children, ...props }) => (
    <th
      className={cn(
        "border border-gray-200 px-3 py-2 text-left font-bold bg-gray-50 text-gray-700",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ className, children, ...props }) => (
    <td
      className={cn("border border-gray-200 px-3 py-2 text-gray-700", className)}
      {...props}
    >
      {children}
    </td>
  ),
};

export const analysisMdComponents: Record<string, React.FC<MdComponentProps>> = {
  ...mdComponents,
  h1: ({ className, children, ...props }) => (
    <h1
      className={cn("text-xl font-bold mt-4 mb-2 text-gray-900", className)}
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }) => (
    <h2
      className={cn("text-lg font-bold mt-3 mb-2 text-gray-900", className)}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }) => (
    <h3
      className={cn(
        "text-base font-semibold mt-3 mb-1 text-gray-800",
        className,
      )}
      {...props}
    >
      {children}
    </h3>
  ),
  p: ({ className, children, ...props }) => (
    <p
      className={cn("mb-3 leading-7 text-sm text-gray-700", className)}
      {...props}
    >
      {children}
    </p>
  ),
  ul: ({ className, children, ...props }) => (
    <ul
      className={cn("list-disc pl-5 mb-3 text-sm text-gray-700", className)}
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ className, children, ...props }) => (
    <ol
      className={cn("list-decimal pl-5 mb-3 text-sm text-gray-700", className)}
      {...props}
    >
      {children}
    </ol>
  ),
  blockquote: ({ className, children, ...props }) => (
    <blockquote
      className={cn(
        "border-l-4 border-gray-300 pl-4 italic my-3 text-sm text-gray-500",
        className,
      )}
      {...props}
    >
      {children}
    </blockquote>
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("border-gray-200 my-3", className)} {...props} />
  ),
};
