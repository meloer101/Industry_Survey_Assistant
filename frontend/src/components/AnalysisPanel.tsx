import { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/utils";

type MdComponentProps = {
  className?: string;
  children?: ReactNode;
  [key: string]: any;
};

const mdComponents = {
  h1: ({ className, children, ...props }: MdComponentProps) => (
    <h1 className={cn("text-xl font-bold mt-4 mb-2 text-gray-900", className)} {...props}>{children}</h1>
  ),
  h2: ({ className, children, ...props }: MdComponentProps) => (
    <h2 className={cn("text-lg font-bold mt-3 mb-2 text-gray-900", className)} {...props}>{children}</h2>
  ),
  h3: ({ className, children, ...props }: MdComponentProps) => (
    <h3 className={cn("text-base font-semibold mt-3 mb-1 text-gray-800", className)} {...props}>{children}</h3>
  ),
  p: ({ className, children, ...props }: MdComponentProps) => (
    <p className={cn("mb-3 leading-7 text-sm text-gray-700", className)} {...props}>{children}</p>
  ),
  a: ({ className, children, href, ...props }: MdComponentProps) => (
    <Badge className="text-xs mx-0.5 bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100">
      <a
        className={cn("text-blue-600 hover:text-blue-700 text-xs", className)}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        {...props}
      >
        {children}
      </a>
    </Badge>
  ),
  ul: ({ className, children, ...props }: MdComponentProps) => (
    <ul className={cn("list-disc pl-5 mb-3 text-sm text-gray-700", className)} {...props}>{children}</ul>
  ),
  ol: ({ className, children, ...props }: MdComponentProps) => (
    <ol className={cn("list-decimal pl-5 mb-3 text-sm text-gray-700", className)} {...props}>{children}</ol>
  ),
  li: ({ className, children, ...props }: MdComponentProps) => (
    <li className={cn("mb-1", className)} {...props}>{children}</li>
  ),
  blockquote: ({ className, children, ...props }: MdComponentProps) => (
    <blockquote className={cn("border-l-4 border-gray-300 pl-4 italic my-3 text-sm text-gray-500", className)} {...props}>
      {children}
    </blockquote>
  ),
  hr: ({ className, ...props }: MdComponentProps) => (
    <hr className={cn("border-gray-200 my-3", className)} {...props} />
  ),
};

export interface AnalysisOutputs {
  macro?: string;
  fundamental?: string;
  risk?: string;
}

interface AnalysisPanelProps {
  report: string;
  analysisOutputs: AnalysisOutputs;
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose max-w-none text-gray-700">
      <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function AnalysisPanel({ report, analysisOutputs }: AnalysisPanelProps) {
  const hasMacro = Boolean(analysisOutputs.macro);
  const hasFundamental = Boolean(analysisOutputs.fundamental);
  const hasRisk = Boolean(analysisOutputs.risk);
  const hasAnyAnalysis = hasMacro || hasFundamental || hasRisk;

  if (!hasAnyAnalysis) {
    return (
      <div className="mt-4">
        <MarkdownContent content={report} />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <Tabs defaultValue="report">
        <TabsList className="bg-gray-100 border border-gray-200 mb-4 flex-wrap h-auto gap-1 p-1 rounded-lg">
          <TabsTrigger
            value="report"
            className="text-xs data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm text-gray-500"
          >
            📄 完整报告
          </TabsTrigger>
          {hasMacro && (
            <TabsTrigger
              value="macro"
              className="text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-gray-500"
            >
              🌐 宏观分析
            </TabsTrigger>
          )}
          {hasFundamental && (
            <TabsTrigger
              value="fundamental"
              className="text-xs data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-sm text-gray-500"
            >
              📊 基本面
            </TabsTrigger>
          )}
          {hasRisk && (
            <TabsTrigger
              value="risk"
              className="text-xs data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-sm text-gray-500"
            >
              🛡️ 风险评估
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="report">
          <MarkdownContent content={report} />
        </TabsContent>

        {hasMacro && (
          <TabsContent value="macro">
            <div className="mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              <span className="text-xs text-neutral-400">宏观政策分析</span>
            </div>
            <MarkdownContent content={analysisOutputs.macro!} />
          </TabsContent>
        )}

        {hasFundamental && (
          <TabsContent value="fundamental">
            <div className="mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              <span className="text-xs text-neutral-400">基本面分析</span>
            </div>
            <MarkdownContent content={analysisOutputs.fundamental!} />
          </TabsContent>
        )}

        {hasRisk && (
          <TabsContent value="risk">
            <div className="mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              <span className="text-xs text-neutral-400">风险评估</span>
            </div>
            <MarkdownContent content={analysisOutputs.risk!} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
