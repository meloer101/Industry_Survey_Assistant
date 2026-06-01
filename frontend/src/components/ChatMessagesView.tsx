import type React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, CopyCheck, PlusCircle } from "lucide-react";
import { InputForm } from "@/components/InputForm";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm';
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { AnalysisPanel } from "@/components/AnalysisPanel";
import { mdComponents } from "@/lib/markdown";
import { buildMarkdownExport, downloadTextFile, reportFilename } from "@/lib/export";
import type { ProcessedEvent, MessageWithAgent, AnalysisOutputs } from "@/types";

interface HumanMessageBubbleProps {
  message: { content: string; id: string };
}

const HumanMessageBubble: React.FC<HumanMessageBubbleProps> = ({ message }) => {
  return (
    <div className="text-[var(--app-warm-900)] rounded-2xl break-words min-h-7 bg-[var(--app-warm-100)] max-w-[85%] sm:max-w-[80%] px-4 pt-3 pb-2 rounded-br-sm">
      <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]}>
        {message.content}
      </ReactMarkdown>
    </div>
  );
};

interface AiMessageBubbleProps {
  message: { content: string; id: string };
  handleCopy: (text: string, messageId: string) => void;
  copiedMessageId: string | null;
  agent?: string;
  finalReportWithCitations?: boolean;
  processedEvents: ProcessedEvent[];
  websiteCount: number;
  isLoading: boolean;
  analysisOutputs?: AnalysisOutputs;
}

const AiMessageBubble: React.FC<AiMessageBubbleProps> = ({
  message,
  handleCopy,
  copiedMessageId,
  agent,
  finalReportWithCitations,
  processedEvents,
  websiteCount,
  isLoading,
  analysisOutputs,
}) => {
  const shouldShowTimeline = processedEvents.length > 0;
  const shouldDisplayDirectly =
    agent === "interactive_planner_agent" ||
    (agent === "report_composer_with_citations" && finalReportWithCitations);

  if (shouldDisplayDirectly) {
    const isFinalReport = agent === "report_composer_with_citations" && finalReportWithCitations;

    return (
      <div className="relative break-words flex flex-col w-full">
        {shouldShowTimeline && agent === "interactive_planner_agent" && (
          <div className="w-full mb-3">
            <ActivityTimeline
              processedEvents={processedEvents}
              isLoading={isLoading}
              websiteCount={websiteCount}
            />
          </div>
        )}
        <div className="flex items-start gap-2">
          <div className="flex-1">
            {isFinalReport && analysisOutputs ? (
              <AnalysisPanel
                report={message.content}
                analysisOutputs={analysisOutputs}
                onExportMarkdown={() => {
                  const md = buildMarkdownExport(message.content, analysisOutputs);
                  downloadTextFile(md, reportFilename());
                }}
              />
            ) : (
              <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            )}
          </div>
          <button
            onClick={() => handleCopy(message.content, message.id)}
            className="p-1.5 hover:bg-gray-100 rounded-md flex-shrink-0 mt-0.5"
          >
            {copiedMessageId === message.id ? (
              <CopyCheck className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>
    );
  } else if (shouldShowTimeline) {
    return (
      <div className="relative break-words flex flex-col w-full">
        <div className="w-full">
          <ActivityTimeline
            processedEvents={processedEvents}
            isLoading={isLoading}
            websiteCount={websiteCount}
          />
        </div>
        {message.content && message.content.trim() && agent !== "interactive_planner_agent" && (
          <div className="flex items-start gap-2 mt-2">
            <div className="flex-1">
              <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
            <button
              onClick={() => handleCopy(message.content, message.id)}
              className="p-1.5 hover:bg-gray-100 rounded-md flex-shrink-0"
            >
              {copiedMessageId === message.id ? (
                <CopyCheck className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4 text-gray-400" />
              )}
            </button>
          </div>
        )}
      </div>
    );
  } else {
    return (
      <div className="relative break-words flex flex-col w-full">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
          </div>
          <button
            onClick={() => handleCopy(message.content, message.id)}
            className="p-1.5 hover:bg-gray-100 rounded-md flex-shrink-0"
          >
            {copiedMessageId === message.id ? (
              <CopyCheck className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4 text-gray-400" />
            )}
          </button>
        </div>
      </div>
    );
  }
};

interface ChatMessagesViewProps {
  messages: MessageWithAgent[];
  isLoading: boolean;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  onSubmit: (query: string) => void;
  onCancel: () => void;
  onNewResearch: () => void;
  displayData: string | null;
  messageEvents: Map<string, ProcessedEvent[]>;
  websiteCount: number;
}

export function ChatMessagesView({
  messages,
  isLoading,
  scrollAreaRef,
  onSubmit,
  onCancel,
  onNewResearch,
  messageEvents,
  websiteCount,
}: ChatMessagesViewProps) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [showNewResearchConfirm, setShowNewResearchConfirm] = useState(false);

  const handleCopy = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const handleNewChatClick = () => {
    if (isLoading) {
      setShowNewResearchConfirm(true);
    } else {
      onNewResearch();
    }
  };

  const lastAiMessage = messages.slice().reverse().find(m => m.type === "ai");
  const lastAiMessageId = lastAiMessage?.id;

  return (
    <div className="flex flex-col h-full w-full bg-white" style={{ fontFamily: 'var(--app-font-body)' }}>
      {/* Header */}
      <div className="border-b border-[var(--app-warm-200)] px-4 py-3 bg-white">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <span className="text-sm font-medium text-[var(--app-warm-700)] flex items-center gap-2.5"
                style={{ fontFamily: 'var(--app-font-display)' }}>
            <svg className="w-5 h-5" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="16" stroke="var(--app-gold)" strokeWidth="1.4" opacity="0.55" fill="none"/>
              <line x1="20" y1="20" x2="20" y2="6" stroke="var(--app-gold)" strokeWidth="1.2" opacity="0.4"/>
              <line x1="20" y1="20" x2="32" y2="27" stroke="var(--app-gold)" strokeWidth="1.2" opacity="0.4"/>
              <line x1="20" y1="20" x2="8" y2="27" stroke="var(--app-gold)" strokeWidth="1.2" opacity="0.4"/>
              <circle cx="20" cy="6" r="2.6" fill="var(--app-gold)"/>
              <circle cx="32" cy="27" r="2.6" fill="var(--app-gold)"/>
              <circle cx="8" cy="27" r="2.6" fill="var(--app-gold)"/>
              <circle cx="20" cy="20" r="3.6" fill="var(--app-gold-light)"/>
            </svg>
            <span>Veris <span className="text-[var(--app-warm-400)] font-normal text-xs ml-0.5">维睿</span></span>
          </span>
          <Button
            onClick={handleNewChatClick}
            variant="outline"
            size="sm"
            className="text-[var(--app-warm-500)] border-[var(--app-warm-200)] hover:bg-[var(--app-gold-bg)] hover:text-[var(--app-gold-dim)] hover:border-[var(--app-gold)] text-sm flex items-center gap-1.5 transition-all"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            新建研究
          </Button>
        </div>
      </div>

      {/* Confirm new research dialog */}
      {showNewResearchConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-sm w-full mx-4 space-y-4">
            <h3 className="text-base font-semibold text-gray-900">开始新的研究？</h3>
            <p className="text-sm text-gray-500">当前研究仍在进行中，开始新对话将取消它。</p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNewResearchConfirm(false)}
              >
                继续等待
              </Button>
              <Button
                size="sm"
                className="text-white"
                style={{ background: 'linear-gradient(180deg, var(--app-gold-light), var(--app-gold))' }}
                onClick={() => {
                  setShowNewResearchConfirm(false);
                  onCancel();
                  onNewResearch();
                }}
              >
                开始新对话
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 flex flex-col w-full bg-[var(--app-warm-50)]">
        <ScrollArea ref={scrollAreaRef} className="flex-1 w-full">
          <div className="p-4 md:p-6 space-y-6 max-w-4xl mx-auto">
            {messages.map((message) => {
              const eventsForMessage = message.type === "ai" ? (messageEvents.get(message.id) || []) : [];
              const isCurrentMessageTheLastAiMessage = message.type === "ai" && message.id === lastAiMessageId;

              return (
                <div
                  key={message.id}
                  className={`flex ${message.type === "human" ? "justify-end" : "justify-start"}`}
                >
                  {message.type === "human" ? (
                    <HumanMessageBubble message={message} />
                  ) : (
                    <AiMessageBubble
                      message={message}
                      handleCopy={handleCopy}
                      copiedMessageId={copiedMessageId}
                      agent={message.agent}
                      finalReportWithCitations={message.finalReportWithCitations}
                      processedEvents={eventsForMessage}
                      websiteCount={isCurrentMessageTheLastAiMessage ? websiteCount : 0}
                      isLoading={isCurrentMessageTheLastAiMessage && isLoading}
                      analysisOutputs={message.analysisOutputs}
                    />
                  )}
                </div>
              );
            })}

          </div>
        </ScrollArea>
      </div>

      {/* Input */}
      <div className="border-t border-[var(--app-warm-200)] p-4 bg-white w-full">
        <div className="max-w-3xl mx-auto">
          <InputForm onSubmit={onSubmit} isLoading={isLoading} context="chat" />
          {isLoading && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={onCancel}
                className="text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
              >
                取消
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
