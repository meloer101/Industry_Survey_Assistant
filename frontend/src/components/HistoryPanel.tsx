import { useEffect, useState } from "react";
import { Clock, History, PanelLeftClose, PanelLeftOpen } from "lucide-react";

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

  useEffect(() => {
    if (!userId || !isOpen) return;

    let cancelled = false;
    setIsLoading(true);
    fetch(`/api/history/${userId}`, { headers: requestHeaders })
      .then((response) => (response.ok ? response.json() : { sessions: [] }))
      .then((data) => {
        if (!cancelled) setHistory(data.sessions ?? []);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, requestHeaders, userId]);

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
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
