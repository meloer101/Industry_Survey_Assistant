import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { analysisMdComponents } from "@/lib/markdown";

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
      <ReactMarkdown components={analysisMdComponents} remarkPlugins={[remarkGfm]}>
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
