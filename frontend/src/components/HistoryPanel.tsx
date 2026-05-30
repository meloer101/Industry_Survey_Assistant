import { useEffect, useState } from "react";
import { Clock, History, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const HISTORY_PAGE_SIZE = 20;

interface HistoryItem {
  session_id: string;
  update_time: string;
  research_plan: string | null;
  title: string;
  has_final_report: boolean;
}

interface HistoryPanelProps {
  userId: string | null;
  isOpen: boolean;
  requestHeaders: Record<string, string>;
  onToggle: () => void;
  onSelectSession: (sessionId: string) => void;
}

export function HistoryPanel({
  userId,
  isOpen,
  requestHeaders,
  onToggle,
  onSelectSession,
}: HistoryPanelProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (!userId || !isOpen) return;

    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/history/${userId}?limit=${HISTORY_PAGE_SIZE}&offset=0`, { headers: requestHeaders })
      .then((response) => (response.ok ? response.json() : { sessions: [], has_more: false }))
      .then((data) => {
        if (!cancelled) {
          setHistory(data.sessions ?? []);
          setHasMore(Boolean(data.has_more));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setHistory([]);
          setHasMore(false);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, requestHeaders, userId]);

  const loadMore = async () => {
    if (!userId || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const response = await fetch(
        `/api/history/${userId}?limit=${HISTORY_PAGE_SIZE}&offset=${history.length}`,
        { headers: requestHeaders },
      );
      const data = response.ok ? await response.json() : { sessions: [], has_more: false };
      setHistory((prev) => [...prev, ...(data.sessions ?? [])]);
      setHasMore(Boolean(data.has_more));
    } catch {
      setHasMore(false);
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <aside
      className={`border-r border-gray-200 bg-gray-50 transition-[width] duration-200 ${
        isOpen ? "w-72" : "w-12"
      } flex-shrink-0 overflow-hidden`}
    >
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center justify-between border-b border-gray-200 px-3">
          {isOpen && (
            <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-700">
              <History className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">历史研究</span>
            </div>
          )}
          <button
            type="button"
            title={isOpen ? "收起历史记录" : "展开历史记录"}
            aria-label={isOpen ? "收起历史记录" : "展开历史记录"}
            onClick={onToggle}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-200 hover:text-gray-900"
          >
            {isOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
          </button>
        </div>

        {isOpen && (
          <div className="flex-1 overflow-y-auto p-2">
            {!userId ? (
              <p className="px-2 py-3 text-xs text-gray-500">开始一次研究后会显示历史记录。</p>
            ) : isLoading ? (
              <p className="px-2 py-3 text-xs text-gray-500">正在加载...</p>
            ) : history.length === 0 ? (
              <p className="px-2 py-3 text-xs text-gray-500">暂无历史记录</p>
            ) : (
              <div className="space-y-1">
                {history.map((item) => (
                  <button
                    key={item.session_id}
                    type="button"
                    onClick={() => onSelectSession(item.session_id)}
                    className="w-full rounded-md px-2 py-2 text-left hover:bg-white hover:shadow-sm"
                  >
                    <p className="line-clamp-2 text-xs font-medium leading-5 text-gray-800">
                      {item.title}
                    </p>
                    <div className="mt-1 flex items-center gap-1 text-[11px] text-gray-500">
                      <Clock className="h-3 w-3" />
                      <span>{new Date(item.update_time).toLocaleString("zh-CN")}</span>
                    </div>
                  </button>
                ))}
                {hasMore && (
                  <button
                    type="button"
                    aria-label="加载更多历史记录"
                    onClick={loadMore}
                    disabled={isLoadingMore}
                    className="mt-2 w-full rounded-md border border-gray-200 bg-white px-2 py-2 text-xs font-medium text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isLoadingMore ? "正在加载..." : "加载更多"}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
