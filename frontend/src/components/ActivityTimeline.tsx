import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { UI } from "@/lib/strings";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  Activity,
  Info,
  Search,
  TextSearch,
  Brain,
  Pen,
  ChevronDown,
  ChevronUp,
  Link,
  TrendingUp,
  BarChart3,
  Shield,
  GitBranch,
} from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import type { ProcessedEvent, SseEventData } from "@/types";

interface ActivityTimelineProps {
  processedEvents: ProcessedEvent[];
  isLoading: boolean;
  websiteCount: number;
}

type EventCategory = 'research' | 'analysis' | 'other';

const ANALYSIS_KEYWORDS = [
  '金融分析', '宏观', '基本面', '风险评估', '协调',
];
const RESEARCH_KEYWORDS = [
  '搜索', '规划', '大纲', '评估', '质量', '研究', '精炼',
];

function getEventCategory(title: string): EventCategory {
  if (ANALYSIS_KEYWORDS.some(k => title.includes(k))) return 'analysis';
  if (RESEARCH_KEYWORDS.some(k => title.includes(k))) return 'research';
  return 'other';
}

const CATEGORY_STYLES: Record<EventCategory, {
  dotStyle: React.CSSProperties;
  ring: string;
  lineStyle: React.CSSProperties;
}> = {
  research: {
    dotStyle: { backgroundColor: 'var(--app-navy-light, #1a2a44)' },
    ring: 'ring-[var(--app-warm-200)]',
    lineStyle: { backgroundColor: 'var(--app-warm-300, #d5cfc4)' },
  },
  analysis: {
    dotStyle: { backgroundColor: 'var(--app-gold, #c9a35e)' },
    ring: 'ring-[var(--app-gold-bg)]',
    lineStyle: { backgroundColor: 'var(--app-gold-ring, rgba(201,163,94,0.25))' },
  },
  other: {
    dotStyle: { backgroundColor: 'var(--app-warm-400, #a39e93)' },
    ring: 'ring-[var(--app-warm-100)]',
    lineStyle: { backgroundColor: 'var(--app-warm-200, #e8e4dd)' },
  },
};

export function ActivityTimeline({
  processedEvents,
  isLoading,
  websiteCount,
}: ActivityTimelineProps) {
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState<boolean>(false);

  const formatEventData = (data: SseEventData): string => {
    switch (data.type) {
      case 'functionCall':
        return `${UI.callingFunction(data.name)}\n${UI.functionArgs}：${JSON.stringify(data.args, null, 2)}`;
      case 'functionResponse':
        return `${UI.functionResponseLabel(data.name)}：\n${JSON.stringify(data.response, null, 2)}`;
      case 'text':
        return data.content;
      case 'sources': {
        const sources = data.content;
        if (Object.keys(sources).length === 0) return UI.noSourcesFound;
        return Object.values(sources)
          .map(source => `[${source.title || UI.untitledSource}](${source.url})`).join(', ');
      }
    }
  };

  const isJsonData = (data: SseEventData): boolean => {
    return data.type === 'functionCall' || data.type === 'functionResponse';
  };

  const getEventIcon = (title: string) => {
    if (title.includes("函数调用")) {
      return <Activity className="h-3.5 w-3.5 text-white" />;
    } else if (title.includes("函数响应")) {
      return <Activity className="h-3.5 w-3.5 text-white" />;
    } else if (title.includes("宏观")) {
      return <TrendingUp className="h-3.5 w-3.5 text-white" />;
    } else if (title.includes("基本面")) {
      return <BarChart3 className="h-3.5 w-3.5 text-white" />;
    } else if (title.includes("风险")) {
      return <Shield className="h-3.5 w-3.5 text-white" />;
    } else if (title.includes("协调")) {
      return <GitBranch className="h-3.5 w-3.5 text-white" />;
    } else if (title.includes("搜索") || title.includes("研究")) {
      return <Search className="h-3.5 w-3.5 text-white" />;
    } else if (title.includes("策略") || title.includes("生成")) {
      return <TextSearch className="h-3.5 w-3.5 text-white" />;
    } else if (title.includes("精炼") || title.includes("质量") || title.includes("评估")) {
      return <Brain className="h-3.5 w-3.5 text-white" />;
    } else if (title.includes("大纲") || title.includes("规划")) {
      return <Pen className="h-3.5 w-3.5 text-white" />;
    } else if (title.includes("已检索来源")) {
      return <Link className="h-3.5 w-3.5 text-yellow-300" />;
    }
    return <Activity className="h-3.5 w-3.5 text-white" />;
  };

  useEffect(() => {
    if (!isLoading && processedEvents.length !== 0) {
      setIsTimelineCollapsed(true);
    }
  }, [isLoading, processedEvents]);

  const hasAnalysis = processedEvents.some(e => getEventCategory(e.title) === 'analysis');

  return (
    <Card className={`rounded-xl border border-[var(--app-warm-200)] bg-white shadow-sm ${isTimelineCollapsed ? "h-10 py-2" : "max-h-[28rem] py-2"}`}
          style={{ fontFamily: 'var(--app-font-body)' }}>
      <CardHeader className="py-0">
        <CardDescription className="flex items-center justify-between">
          <div
            className="flex items-center justify-start text-sm w-full cursor-pointer gap-2 text-[var(--app-warm-700)]"
            onClick={() => setIsTimelineCollapsed(!isTimelineCollapsed)}
          >
            <span className="font-medium" style={{ fontFamily: 'var(--app-font-display)' }}>研究进程</span>
            {websiteCount > 0 && (
              <span className="text-xs bg-[var(--app-warm-100)] text-[var(--app-warm-500)] px-2 py-0.5 rounded-full border border-[var(--app-warm-200)]"
                    style={{ fontFamily: 'var(--app-font-mono)' }}>
                {websiteCount} 个来源
              </span>
            )}
            {hasAnalysis && (
              <span className="text-xs flex items-center gap-1 text-[var(--app-warm-500)]">
                <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: 'var(--app-navy-light)' }} />
                研究
                <span className="w-2 h-2 rounded-full inline-block ml-1" style={{ backgroundColor: 'var(--app-gold)' }} />
                分析
              </span>
            )}
            {isTimelineCollapsed ? (
              <ChevronDown className="h-4 w-4 ml-auto text-[var(--app-warm-400)]" />
            ) : (
              <ChevronUp className="h-4 w-4 ml-auto text-[var(--app-warm-400)]" />
            )}
          </div>
        </CardDescription>
      </CardHeader>
      {!isTimelineCollapsed && (
        <ScrollArea className="max-h-80 overflow-y-auto">
          <CardContent>
            {isLoading && processedEvents.length === 0 && (
              <div className="relative pl-8 pb-4">
                <div className="absolute left-3 top-3.5 h-full w-0.5" style={{ backgroundColor: 'var(--app-warm-200)' }} />
                <div className="absolute left-0.5 top-2 h-5 w-5 rounded-full flex items-center justify-center ring-4 ring-white" style={{ backgroundColor: 'var(--app-warm-200)' }}>
                  <Loader2 className="h-3 w-3 animate-spin" style={{ color: 'var(--app-warm-400)' }} />
                </div>
                <p className="text-sm font-medium" style={{ color: 'var(--app-warm-500)' }}>思考中...</p>
              </div>
            )}
            {processedEvents.length > 0 ? (
              <div className="space-y-0">
                {processedEvents.map((eventItem, index) => {
                  const category = getEventCategory(eventItem.title);
                  const styles = CATEGORY_STYLES[category];
                  const nextCategory = index < processedEvents.length - 1
                    ? getEventCategory(processedEvents[index + 1].title)
                    : null;
                  const lineStyle = nextCategory ? CATEGORY_STYLES[nextCategory].lineStyle : styles.lineStyle;

                  return (
                    <div key={index} className="relative pl-8 pb-4">
                      {index < processedEvents.length - 1 ||
                      (isLoading && index === processedEvents.length - 1) ? (
                        <div className="absolute left-3 top-3.5 h-full w-0.5" style={lineStyle} />
                      ) : null}
                      <div className={`absolute left-0.5 top-2 h-6 w-6 rounded-full flex items-center justify-center ring-4 ${styles.ring}`} style={styles.dotStyle}>
                        {getEventIcon(eventItem.title)}
                      </div>
                      <div>
                        <p className="text-sm text-[var(--app-warm-800)] font-medium mb-0.5">
                          {eventItem.title}
                        </p>
                        <div className="text-xs text-[var(--app-warm-500)] leading-relaxed">
                          {isJsonData(eventItem.data) ? (
                            <pre className="bg-[var(--app-warm-50)] border border-[var(--app-warm-200)] p-2 rounded text-xs overflow-x-auto whitespace-pre-wrap text-[var(--app-warm-600)]"
                                 style={{ fontFamily: 'var(--app-font-mono)' }}>
                              {formatEventData(eventItem.data)}
                            </pre>
                          ) : (
                            <ReactMarkdown
                              components={{
                                p: ({ children }) => <span>{children}</span>,
                                a: ({ href, children }) => (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="underline"
                                    style={{ color: 'var(--app-gold-dim)' }}
                                  >
                                    {children}
                                  </a>
                                ),
                                code: ({ children }) => (
                                  <code className="bg-[var(--app-warm-100)] px-1 py-0.5 rounded text-xs text-[var(--app-warm-700)]"
                                        style={{ fontFamily: 'var(--app-font-mono)' }}>
                                    {children}
                                  </code>
                                ),
                              }}
                            >
                              {formatEventData(eventItem.data)}
                            </ReactMarkdown>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {isLoading && processedEvents.length > 0 && (
                  <div className="relative pl-8 pb-4">
                    <div className="absolute left-0.5 top-2 h-5 w-5 rounded-full flex items-center justify-center ring-4 ring-white" style={{ backgroundColor: 'var(--app-warm-200)' }}>
                      <Loader2 className="h-3 w-3 animate-spin" style={{ color: 'var(--app-warm-400)' }} />
                    </div>
                    <p className="text-sm font-medium" style={{ color: 'var(--app-warm-500)' }}>思考中...</p>
                  </div>
                )}
              </div>
            ) : !isLoading ? (
              <div className="flex flex-col items-center justify-center h-full pt-10" style={{ color: 'var(--app-warm-400)' }}>
                <Info className="h-6 w-6 mb-3" />
                <p className="text-sm">暂无活动记录</p>
                <p className="text-xs mt-1" style={{ color: 'var(--app-warm-300)' }}>处理过程中将实时更新。</p>
              </div>
            ) : null}
          </CardContent>
        </ScrollArea>
      )}
    </Card>
  );
}
