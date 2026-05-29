import type React from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Copy, CopyCheck } from "lucide-react";
import { InputForm } from "@/components/InputForm";
import { Button } from "@/components/ui/button";
import { useState, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from 'remark-gfm';
import { cn } from "@/utils";
import { Badge } from "@/components/ui/badge";
import { ActivityTimeline } from "@/components/ActivityTimeline";
import { AnalysisPanel, type AnalysisOutputs } from "@/components/AnalysisPanel";

type MdComponentProps = {
  className?: string;
  children?: ReactNode;
  [key: string]: any;
};

interface ProcessedEvent {
  title: string;
  data: any;
}

const mdComponents = {
  h1: ({ className, children, ...props }: MdComponentProps) => (
    <h1 className={cn("text-2xl font-bold mt-4 mb-2 text-gray-900", className)} {...props}>
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }: MdComponentProps) => (
    <h2 className={cn("text-xl font-bold mt-3 mb-2 text-gray-900", className)} {...props}>
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }: MdComponentProps) => (
    <h3 className={cn("text-lg font-bold mt-3 mb-1 text-gray-800", className)} {...props}>
      {children}
    </h3>
  ),
  p: ({ className, children, ...props }: MdComponentProps) => (
    <p className={cn("mb-3 leading-7 text-gray-700", className)} {...props}>
      {children}
    </p>
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
    <ul className={cn("list-disc pl-6 mb-3 text-gray-700", className)} {...props}>
      {children}
    </ul>
  ),
  ol: ({ className, children, ...props }: MdComponentProps) => (
    <ol className={cn("list-decimal pl-6 mb-3 text-gray-700", className)} {...props}>
      {children}
    </ol>
  ),
  li: ({ className, children, ...props }: MdComponentProps) => (
    <li className={cn("mb-1", className)} {...props}>
      {children}
    </li>
  ),
  blockquote: ({ className, children, ...props }: MdComponentProps) => (
    <blockquote
      className={cn("border-l-4 border-gray-300 pl-4 italic my-3 text-sm text-gray-500", className)}
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({ className, children, ...props }: MdComponentProps) => (
    <code
      className={cn("bg-gray-100 rounded px-1 py-0.5 font-mono text-xs text-gray-800", className)}
      {...props}
    >
      {children}
    </code>
  ),
  pre: ({ className, children, ...props }: MdComponentProps) => (
    <pre
      className={cn("bg-gray-100 p-3 rounded-lg overflow-x-auto font-mono text-xs my-3 text-gray-800", className)}
      {...props}
    >
      {children}
    </pre>
  ),
  hr: ({ className, ...props }: MdComponentProps) => (
    <hr className={cn("border-gray-200 my-4", className)} {...props} />
  ),
  table: ({ className, children, ...props }: MdComponentProps) => (
    <div className="my-3 overflow-x-auto">
      <table className={cn("border-collapse w-full", className)} {...props}>
        {children}
      </table>
    </div>
  ),
  th: ({ className, children, ...props }: MdComponentProps) => (
    <th
      className={cn("border border-gray-200 px-3 py-2 text-left font-bold bg-gray-50 text-gray-700", className)}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ className, children, ...props }: MdComponentProps) => (
    <td className={cn("border border-gray-200 px-3 py-2 text-gray-700", className)} {...props}>
      {children}
    </td>
  ),
};

interface HumanMessageBubbleProps {
  message: { content: string; id: string };
  mdComponents: typeof mdComponents;
}

const HumanMessageBubble: React.FC<HumanMessageBubbleProps> = ({ message, mdComponents }) => {
  return (
    <div className="text-gray-900 rounded-2xl break-words min-h-7 bg-gray-100 max-w-[85%] sm:max-w-[80%] px-4 pt-3 pb-2 rounded-br-sm">
      <ReactMarkdown components={mdComponents} remarkPlugins={[remarkGfm]}>
        {message.content}
      </ReactMarkdown>
    </div>
  );
};

interface AiMessageBubbleProps {
  message: { content: string; id: string };
  mdComponents: typeof mdComponents;
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
  mdComponents,
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
              <AnalysisPanel report={message.content} analysisOutputs={analysisOutputs} />
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
  messages: { type: "human" | "ai"; content: string; id: string; agent?: string; finalReportWithCitations?: boolean; analysisOutputs?: AnalysisOutputs }[];
  isLoading: boolean;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
  onSubmit: (query: string) => void;
  onCancel: () => void;
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
  messageEvents,
  websiteCount,
}: ChatMessagesViewProps) {
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  const handleCopy = async (text: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const handleNewChat = () => {
    window.location.reload();
  };

  const lastAiMessage = messages.slice().reverse().find(m => m.type === "ai");
  const lastAiMessageId = lastAiMessage?.id;

  return (
    <div className="flex flex-col h-full w-full bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 px-4 py-3 bg-white">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
            📈 <span>AI 投资研究平台</span>
          </span>
          <Button
            onClick={handleNewChat}
            variant="outline"
            size="sm"
            className="text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900 text-sm"
          >
            新对话
          </Button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col w-full bg-gray-50">
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
                    <HumanMessageBubble message={message} mdComponents={mdComponents} />
                  ) : (
                    <AiMessageBubble
                      message={message}
                      mdComponents={mdComponents}
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

            {isLoading && !lastAiMessage && messages.some(m => m.type === 'human') && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">思考中...</span>
                </div>
              </div>
            )}
            {isLoading && messages.length > 0 && messages[messages.length - 1].type === 'human' && (
              <div className="flex justify-start pl-2">
                <div className="flex items-center gap-2 text-gray-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">思考中...</span>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4 bg-white w-full">
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
