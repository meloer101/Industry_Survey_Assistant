import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Download } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { analysisMdComponents } from "@/lib/markdown";

export interface AnalysisOutputs {
  macro?: string;
  fundamental?: string;
  risk?: string;
}

interface AnalysisPanelProps {
  report: string;
  analysisOutputs: AnalysisOutputs;
  onExportMarkdown?: () => void;
}

function ExportButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="flex-shrink-0 flex items-center gap-1.5 text-xs text-[var(--app-warm-500)] border-[var(--app-warm-200)] hover:text-[var(--app-gold-dim)] hover:border-[var(--app-gold)] hover:bg-[var(--app-gold-bg)] transition-all"
    >
      <Download className="h-3.5 w-3.5" />
      导出 Markdown
    </Button>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="prose max-w-none text-[var(--app-warm-700)]">
      <ReactMarkdown components={analysisMdComponents} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export function AnalysisPanel({ report, analysisOutputs, onExportMarkdown }: AnalysisPanelProps) {
  const hasMacro = Boolean(analysisOutputs.macro);
  const hasFundamental = Boolean(analysisOutputs.fundamental);
  const hasRisk = Boolean(analysisOutputs.risk);
  const hasAnyAnalysis = hasMacro || hasFundamental || hasRisk;

  if (!hasAnyAnalysis) {
    return (
      <div className="mt-4">
        {onExportMarkdown && (
          <div className="flex justify-end mb-2">
            <ExportButton onClick={onExportMarkdown} />
          </div>
        )}
        <MarkdownContent content={report} />
      </div>
    );
  }

  return (
    <div className="mt-4">
      <Tabs defaultValue="report">
        <div className="flex items-start justify-between mb-4 gap-2">
        <TabsList className="bg-[var(--app-warm-100)] border border-[var(--app-warm-200)] flex-wrap h-auto gap-1 p-1 rounded-lg">
          <TabsTrigger
            value="report"
            className="text-xs data-[state=active]:bg-white data-[state=active]:text-[var(--app-warm-900)] data-[state=active]:shadow-sm text-[var(--app-warm-500)]"
            style={{ fontFamily: 'var(--app-font-display)' }}
          >
            📄 完整报告
          </TabsTrigger>
          {hasMacro && (
            <TabsTrigger
              value="macro"
              className="text-xs data-[state=active]:bg-white data-[state=active]:text-[var(--app-gold-dim)] data-[state=active]:shadow-sm text-[var(--app-warm-500)]"
              style={{ fontFamily: 'var(--app-font-display)' }}
            >
              🌐 宏观分析
            </TabsTrigger>
          )}
          {hasFundamental && (
            <TabsTrigger
              value="fundamental"
              className="text-xs data-[state=active]:bg-white data-[state=active]:text-[var(--app-gold-dim)] data-[state=active]:shadow-sm text-[var(--app-warm-500)]"
              style={{ fontFamily: 'var(--app-font-display)' }}
            >
              📊 基本面
            </TabsTrigger>
          )}
          {hasRisk && (
            <TabsTrigger
              value="risk"
              className="text-xs data-[state=active]:bg-white data-[state=active]:text-amber-600 data-[state=active]:shadow-sm text-[var(--app-warm-500)]"
              style={{ fontFamily: 'var(--app-font-display)' }}
            >
              🛡️ 风险评估
            </TabsTrigger>
          )}
        </TabsList>
        {onExportMarkdown && <ExportButton onClick={onExportMarkdown} />}
        </div>

        <TabsContent value="report">
          <MarkdownContent content={report} />
        </TabsContent>

        {hasMacro && (
          <TabsContent value="macro">
            <div className="mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--app-gold)' }} />
              <span className="text-xs text-[var(--app-warm-400)]" style={{ fontFamily: 'var(--app-font-mono)' }}>宏观政策分析</span>
            </div>
            <MarkdownContent content={analysisOutputs.macro!} />
          </TabsContent>
        )}

        {hasFundamental && (
          <TabsContent value="fundamental">
            <div className="mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--app-gold)' }} />
              <span className="text-xs text-[var(--app-warm-400)]" style={{ fontFamily: 'var(--app-font-mono)' }}>基本面分析</span>
            </div>
            <MarkdownContent content={analysisOutputs.fundamental!} />
          </TabsContent>
        )}

        {hasRisk && (
          <TabsContent value="risk">
            <div className="mb-3 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
              <span className="text-xs text-[var(--app-warm-400)]" style={{ fontFamily: 'var(--app-font-mono)' }}>风险评估</span>
            </div>
            <MarkdownContent content={analysisOutputs.risk!} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
