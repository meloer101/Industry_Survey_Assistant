import { useState, useRef, useCallback, useEffect } from "react";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { ChatMessagesView } from "@/components/ChatMessagesView";
import { HistoryPanel } from "@/components/HistoryPanel";
import { BackendLoadingScreen } from "@/components/BackendLoadingScreen";
import type { AnalysisOutputs, MessageWithAgent, ProcessedEvent } from "@/types";
import {
  extractDataFromSSE,
  getEventTitle,
  getFunctionTitle,
} from "@/lib/sse";
import {
  retryWithBackoff,
  createSession,
  checkBackendHealth,
  loadSession,
  requestHeaders,
  USER_ID_STORAGE_KEY,
} from "@/lib/api";

type DisplayData = string | null;

export default function App() {
  const [userId, setUserId] = useState<string | null>(() => localStorage.getItem(USER_ID_STORAGE_KEY));
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [appName, setAppName] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithAgent[]>([]);
  const [displayData, setDisplayData] = useState<DisplayData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [messageEvents, setMessageEvents] = useState<Map<string, ProcessedEvent[]>>(new Map());
  const [websiteCount, setWebsiteCount] = useState<number>(0);
  const [isBackendReady, setIsBackendReady] = useState(false);
  const [isCheckingBackend, setIsCheckingBackend] = useState(true);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const currentAgentRef = useRef('');
  const accumulatedTextRef = useRef("");
  const analysisOutputsRef = useRef<AnalysisOutputs>({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const processSseEventData = useCallback((jsonData: string, aiMessageId: string) => {
    const { textParts, agent, finalReportWithCitations, functionCall, functionResponse, sourceCount, sources, newAnalysisOutputs } = extractDataFromSSE(jsonData);

    if (Object.keys(newAnalysisOutputs).length > 0) {
      analysisOutputsRef.current = { ...analysisOutputsRef.current, ...newAnalysisOutputs };
      setMessages(prev => prev.map(msg =>
        msg.finalReportWithCitations
          ? {
              ...msg,
              analysisOutputs: {
                ...(msg.analysisOutputs || {}),
                ...newAnalysisOutputs,
              },
            }
          : msg
      ));
    }

    if (sourceCount > 0) {
      setWebsiteCount(prev => Math.max(prev, sourceCount));
    }

    if (agent && agent !== currentAgentRef.current) {
      currentAgentRef.current = agent;
    }

    if (functionCall) {
      const functionCallTitle = getFunctionTitle(functionCall.name, 'call');
      setMessageEvents(prev => new Map(prev).set(aiMessageId, [...(prev.get(aiMessageId) || []), {
        title: functionCallTitle,
        data: { type: 'functionCall' as const, name: functionCall.name, args: functionCall.args, id: functionCall.id }
      }]));
    }

    if (functionResponse) {
      const functionResponseTitle = getFunctionTitle(functionResponse.name, 'response');
      setMessageEvents(prev => new Map(prev).set(aiMessageId, [...(prev.get(aiMessageId) || []), {
        title: functionResponseTitle,
        data: { type: 'functionResponse' as const, name: functionResponse.name, response: functionResponse.response, id: functionResponse.id }
      }]));
    }

    if (textParts.length > 0 && agent !== "report_composer_with_citations") {
      if (agent !== "interactive_planner_agent") {
        const eventTitle = getEventTitle(agent);
        setMessageEvents(prev => new Map(prev).set(aiMessageId, [...(prev.get(aiMessageId) || []), {
          title: eventTitle,
          data: { type: 'text' as const, content: textParts.join(" ") }
        }]));
      } else {
        for (const text of textParts) {
          accumulatedTextRef.current += text + " ";
          setMessages(prev => prev.map(msg =>
            msg.id === aiMessageId ? { ...msg, content: accumulatedTextRef.current.trim(), agent: currentAgentRef.current || msg.agent } : msg
          ));
          setDisplayData(accumulatedTextRef.current.trim());
        }
      }
    }

    if (sources) {
      setMessageEvents(prev => new Map(prev).set(aiMessageId, [...(prev.get(aiMessageId) || []), {
        title: "Retrieved Sources", data: { type: 'sources' as const, content: sources as Record<string, { title: string; url: string }> }
      }]));
    }

    if (agent === "report_composer_with_citations" && finalReportWithCitations) {
      const finalReportMessageId = Date.now().toString() + "_final";
      const snapshotOutputs = { ...analysisOutputsRef.current };
      setMessages(prev => [...prev, {
        type: "ai",
        content: finalReportWithCitations,
        id: finalReportMessageId,
        agent: currentAgentRef.current,
        finalReportWithCitations: true,
        analysisOutputs: snapshotOutputs,
      }]);
      setDisplayData(finalReportWithCitations);
      analysisOutputsRef.current = {};
    }
  }, []);

  const handleSubmit = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setIsLoading(true);
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const abortSignal = abortControllerRef.current.signal;

    try {
      let currentUserId = userId;
      let currentSessionId = sessionId;
      let currentAppName = appName;

      if (!currentSessionId || !currentUserId || !currentAppName) {
        const sessionData = await retryWithBackoff(() => createSession(abortSignal, currentUserId));
        const resolvedUserId = sessionData.userId;
        const resolvedSessionId = sessionData.sessionId;
        const resolvedAppName = sessionData.appName;
        currentUserId = resolvedUserId;
        currentSessionId = resolvedSessionId;
        currentAppName = resolvedAppName;

        setUserId(resolvedUserId);
        setSessionId(resolvedSessionId);
        setAppName(resolvedAppName);
        localStorage.setItem(USER_ID_STORAGE_KEY, resolvedUserId);
      }

      const userMessageId = Date.now().toString();
      setMessages(prev => [...prev, { type: "human", content: query, id: userMessageId }]);

      const aiMessageId = Date.now().toString() + "_ai";
      currentAgentRef.current = '';
      accumulatedTextRef.current = '';

      setMessages(prev => [...prev, {
        type: "ai",
        content: "",
        id: aiMessageId,
        agent: '',
      }]);

      const sendMessage = async () => {
        const response = await fetch("/api/run_sse", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...requestHeaders,
          },
          signal: abortSignal,
          body: JSON.stringify({
            appName: currentAppName,
            userId: currentUserId,
            sessionId: currentSessionId,
            newMessage: {
              parts: [{ text: query }],
              role: "user"
            },
            streaming: false
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to send message: ${response.status} ${response.statusText}`);
        }

        return response;
      };

      const response = await retryWithBackoff(sendMessage);

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = "";
      let eventDataBuffer = "";

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (value) {
              lineBuffer += decoder.decode(value, { stream: true });
            }

            let eolIndex;
            while ((eolIndex = lineBuffer.indexOf('\n')) >= 0 || (done && lineBuffer.length > 0)) {
              let line: string;
              if (eolIndex >= 0) {
                line = lineBuffer.substring(0, eolIndex);
                lineBuffer = lineBuffer.substring(eolIndex + 1);
              } else {
                line = lineBuffer;
                lineBuffer = "";
              }

              if (line.trim() === "") {
                if (eventDataBuffer.length > 0) {
                  const jsonDataToParse = eventDataBuffer.endsWith('\n') ? eventDataBuffer.slice(0, -1) : eventDataBuffer;
                  processSseEventData(jsonDataToParse, aiMessageId);
                  eventDataBuffer = "";
                }
              } else if (line.startsWith('data:')) {
                eventDataBuffer += line.substring(5).trimStart() + '\n';
              }
            }

            if (done) {
              if (eventDataBuffer.length > 0) {
                const jsonDataToParse = eventDataBuffer.endsWith('\n') ? eventDataBuffer.slice(0, -1) : eventDataBuffer;
                processSseEventData(jsonDataToParse, aiMessageId);
                eventDataBuffer = "";
              }
              break;
            }
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            throw error;
          }
          throw error;
        }
      }

      setIsLoading(false);
      abortControllerRef.current = null;

    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setIsLoading(false);
        return;
      }
      console.error("Error:", error);
      const aiMessageId = Date.now().toString() + "_ai_error";
      setMessages(prev => [...prev, {
        type: "ai",
        content: `Sorry, there was an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`,
        id: aiMessageId
      }]);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [appName, processSseEventData, sessionId, userId]);

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [messages]);

  useEffect(() => {
    const checkBackend = async () => {
      setIsCheckingBackend(true);

      const maxAttempts = 60;
      let attempts = 0;

      while (attempts < maxAttempts) {
        const isReady = await checkBackendHealth();
        if (isReady) {
          setIsBackendReady(true);
          setIsCheckingBackend(false);
          return;
        }

        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }

      setIsCheckingBackend(false);
      console.error("Backend failed to start within 2 minutes");
    };

    checkBackend();
  }, []);

  const handleCancel = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setDisplayData(null);
    setMessageEvents(new Map());
    setWebsiteCount(0);
    setIsLoading(false);
    analysisOutputsRef.current = {};
  }, []);

  const handleSelectHistorySession = useCallback(async (selectedSessionId: string) => {
    if (!userId) return;
    // Reset current chat state
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setDisplayData(null);
    setMessageEvents(new Map());
    setWebsiteCount(0);
    setIsLoading(true);
    analysisOutputsRef.current = {};

    try {
      const loaded = await loadSession(userId, selectedSessionId);
      setSessionId(loaded.sessionId);
      setAppName(loaded.appName);
      // [P2] Restore analysis outputs into the ref so follow-up SSE events can merge correctly
      analysisOutputsRef.current = loaded.analysisOutputs;
      if (loaded.messages.length > 0) {
        setMessages(loaded.messages);
      } else {
        setMessages([{
          type: "ai",
          content: "已加载历史会话，暂无可显示的消息。",
          id: `${Date.now()}_history`,
          agent: "history",
        }]);
      }
    } catch (err) {
      console.error("Failed to load session", err);
      // [P2] Clear session identity so the next prompt starts a fresh session
      // rather than accidentally continuing a partially-loaded one
      setSessionId(null);
      setAppName(null);
      setMessages([{
        type: "ai",
        content: "历史会话加载失败，请重试。",
        id: `${Date.now()}_history`,
        agent: "history",
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  return (
    <div className="flex h-screen bg-white text-gray-900 font-sans antialiased">
      <HistoryPanel
        userId={userId}
        isOpen={isHistoryOpen}
        requestHeaders={requestHeaders}
        onToggle={() => setIsHistoryOpen(prev => !prev)}
        onSelectSession={handleSelectHistorySession}
      />
      <main className="flex-1 flex flex-col overflow-hidden w-full">
        <div className={`flex-1 overflow-y-auto ${(messages.length === 0 || isCheckingBackend) ? "flex" : ""}`}>
          {isCheckingBackend ? (
            <BackendLoadingScreen />
          ) : !isBackendReady ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <div className="text-center space-y-4">
                <h2 className="text-2xl font-bold text-red-500">后端服务不可用</h2>
                <p className="text-gray-500">
                  无法连接到 localhost:8000，请检查后端是否已启动
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  重试
                </button>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <WelcomeScreen
              handleSubmit={handleSubmit}
              isLoading={isLoading}
              onCancel={handleCancel}
            />
          ) : (
            <ChatMessagesView
              messages={messages}
              isLoading={isLoading}
              scrollAreaRef={scrollAreaRef}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              displayData={displayData}
              messageEvents={messageEvents}
              websiteCount={websiteCount}
            />
          )}
        </div>
      </main>
    </div>
  );
}
