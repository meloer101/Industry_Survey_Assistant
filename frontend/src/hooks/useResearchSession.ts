import { useState, useRef, useCallback } from "react";
import { useAppAuth } from "@/hooks/useAppAuth";
import type { AnalysisOutputs, MessageWithAgent, ProcessedEvent } from "@/types";
import {
  extractDataFromSSE,
  getEventTitle,
  getFunctionTitle,
} from "@/lib/sse";
import {
  retryWithBackoff,
  createSession,
  loadSession,
  cancelRun,
  authHeaders,
} from "@/lib/api";
import { UI } from "@/lib/strings";
import { devWarn } from "@/lib/logging";

export interface ResearchSessionState {
  messages: MessageWithAgent[];
  displayData: string | null;
  isLoading: boolean;
  messageEvents: Map<string, ProcessedEvent[]>;
  websiteCount: number;
  isHistoryOpen: boolean;
  historyRefreshKey: number;
  scrollAreaRef: React.RefObject<HTMLDivElement | null>;
}

export interface ResearchSessionActions {
  handleSubmit: (query: string) => Promise<void>;
  handleCancel: () => void;
  handleNewResearch: () => void;
  handleSelectHistorySession: (sessionId: string) => Promise<void>;
  setIsHistoryOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useResearchSession(): ResearchSessionState & ResearchSessionActions {
  const { userId, getToken } = useAppAuth();

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [appName, setAppName] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageWithAgent[]>([]);
  const [displayData, setDisplayData] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [messageEvents, setMessageEvents] = useState<Map<string, ProcessedEvent[]>>(new Map());
  const [websiteCount, setWebsiteCount] = useState<number>(0);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

  const currentAgentRef = useRef("");
  const accumulatedTextRef = useRef("");
  const analysisOutputsRef = useRef<AnalysisOutputs>({});
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const finalReportReceivedRef = useRef(false);

  const processSseEventData = useCallback((jsonData: string, aiMessageId: string) => {
    const {
      textParts, agent, finalReportWithCitations,
      functionCall, functionResponse, sourceCount, sources, newAnalysisOutputs,
    } = extractDataFromSSE(jsonData);

    if (Object.keys(newAnalysisOutputs).length > 0) {
      analysisOutputsRef.current = { ...analysisOutputsRef.current, ...newAnalysisOutputs };
      setMessages((prev) =>
        prev.map((msg) =>
          msg.finalReportWithCitations
            ? { ...msg, analysisOutputs: { ...(msg.analysisOutputs || {}), ...newAnalysisOutputs } }
            : msg,
        ),
      );
    }

    if (sourceCount > 0) {
      setWebsiteCount((prev) => Math.max(prev, sourceCount));
    }

    if (agent && agent !== currentAgentRef.current) {
      currentAgentRef.current = agent;
    }

    if (functionCall) {
      const title = getFunctionTitle(functionCall.name, "call");
      setMessageEvents((prev) =>
        new Map(prev).set(aiMessageId, [
          ...(prev.get(aiMessageId) || []),
          { title, data: { type: "functionCall" as const, name: functionCall.name, args: functionCall.args, id: functionCall.id } },
        ]),
      );
    }

    if (functionResponse) {
      const title = getFunctionTitle(functionResponse.name, "response");
      setMessageEvents((prev) =>
        new Map(prev).set(aiMessageId, [
          ...(prev.get(aiMessageId) || []),
          { title, data: { type: "functionResponse" as const, name: functionResponse.name, response: functionResponse.response, id: functionResponse.id } },
        ]),
      );
    }

    if (textParts.length > 0 && agent !== "report_composer_with_citations" && !finalReportReceivedRef.current) {
      if (agent !== "interactive_planner_agent") {
        const eventTitle = getEventTitle(agent);
        setMessageEvents((prev) =>
          new Map(prev).set(aiMessageId, [
            ...(prev.get(aiMessageId) || []),
            { title: eventTitle, data: { type: "text" as const, content: textParts.join(" ") } },
          ]),
        );
      } else {
        for (const text of textParts) {
          accumulatedTextRef.current += text + " ";
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === aiMessageId
                ? { ...msg, content: accumulatedTextRef.current.trim(), agent: currentAgentRef.current || msg.agent }
                : msg,
            ),
          );
          setDisplayData(accumulatedTextRef.current.trim());
        }
      }
    }

    if (sources) {
      setMessageEvents((prev) =>
        new Map(prev).set(aiMessageId, [
          ...(prev.get(aiMessageId) || []),
          { title: UI.retrievedSources, data: { type: "sources" as const, content: sources as Record<string, { title: string; url: string }> } },
        ]),
      );
    }

    if (agent === "report_composer_with_citations" && finalReportWithCitations) {
      finalReportReceivedRef.current = true;
      const finalReportMessageId = Date.now().toString() + "_final";
      const snapshotOutputs = { ...analysisOutputsRef.current };
      setMessages((prev) => [
        ...prev,
        {
          type: "ai",
          content: finalReportWithCitations,
          id: finalReportMessageId,
          agent: currentAgentRef.current,
          finalReportWithCitations: true,
          analysisOutputs: snapshotOutputs,
        },
      ]);
      setDisplayData(finalReportWithCitations);
      analysisOutputsRef.current = {};
    }
  }, []);

  const resetChatState = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setMessages([]);
    setDisplayData(null);
    setMessageEvents(new Map());
    setWebsiteCount(0);
    setIsLoading(false);
    analysisOutputsRef.current = {};
    finalReportReceivedRef.current = false;
  }, []);

  const handleSubmit = useCallback(async (query: string) => {
    if (!query.trim() || !userId) return;

    setIsLoading(true);
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const abortSignal = abortControllerRef.current.signal;

    try {
      let currentUserId = userId;
      let currentSessionId = sessionId;
      let currentAppName = appName;

      if (!currentSessionId || !currentAppName) {
        const sessionData = await retryWithBackoff(() => createSession(getToken, currentUserId, abortSignal));
        currentUserId = sessionData.userId;
        currentSessionId = sessionData.sessionId;
        currentAppName = sessionData.appName;
        setSessionId(currentSessionId);
        setAppName(currentAppName);
      }

      const userMessageId = Date.now().toString();
      setMessages((prev) => [...prev, { type: "human", content: query, id: userMessageId }]);

      const aiMessageId = Date.now().toString() + "_ai";
      currentAgentRef.current = "";
      accumulatedTextRef.current = "";
      finalReportReceivedRef.current = false;

      setMessages((prev) => [...prev, { type: "ai", content: "", id: aiMessageId, agent: "" }]);

      const response = await retryWithBackoff(async () => {
        const resp = await fetch("/api/run_sse", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders(getToken)) },
          signal: abortSignal,
          body: JSON.stringify({
            appName: currentAppName,
            userId: currentUserId,
            sessionId: currentSessionId,
            newMessage: { parts: [{ text: query }], role: "user" },
            streaming: false,
          }),
        });
        if (!resp.ok) throw new Error(`Failed to send message: ${resp.status} ${resp.statusText}`);
        return resp;
      });

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = "";
      let eventDataBuffer = "";

      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (value) lineBuffer += decoder.decode(value, { stream: true });

            let eolIndex;
            while ((eolIndex = lineBuffer.indexOf("\n")) >= 0 || (done && lineBuffer.length > 0)) {
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
                  const jsonDataToParse = eventDataBuffer.endsWith("\n") ? eventDataBuffer.slice(0, -1) : eventDataBuffer;
                  processSseEventData(jsonDataToParse, aiMessageId);
                  eventDataBuffer = "";
                }
              } else if (line.startsWith("data:")) {
                eventDataBuffer += line.substring(5).trimStart() + "\n";
              }
            }

            if (done) {
              if (eventDataBuffer.length > 0) {
                const jsonDataToParse = eventDataBuffer.endsWith("\n") ? eventDataBuffer.slice(0, -1) : eventDataBuffer;
                processSseEventData(jsonDataToParse, aiMessageId);
              }
              break;
            }
          }
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") throw error;
          throw error;
        }
      }

      setIsLoading(false);
      setHistoryRefreshKey((k) => k + 1);
      abortControllerRef.current = null;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setIsLoading(false);
        return;
      }
      console.error("Error:", error);
      const errorMsgId = Date.now().toString() + "_ai_error";
      setMessages((prev) => [
        ...prev,
        { type: "ai", content: UI.errorProcessingRequest(error instanceof Error ? error.message : UI.unknownError), id: errorMsgId },
      ]);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [appName, getToken, processSseEventData, sessionId, userId]);

  const handleCancel = useCallback(() => {
    if (appName && userId && sessionId) {
      void cancelRun(getToken, appName, userId, sessionId).catch((error) => {
        devWarn("Failed to notify backend run cancellation", error);
      });
    }
    resetChatState();
  }, [appName, getToken, resetChatState, sessionId, userId]);

  const handleNewResearch = useCallback(() => {
    resetChatState();
    setSessionId(null);
    setAppName(null);
    setHistoryRefreshKey((k) => k + 1);
  }, [resetChatState]);

  const handleSelectHistorySession = useCallback(async (selectedSessionId: string) => {
    if (!userId) return;
    resetChatState();
    setIsLoading(true);

    try {
      const loaded = await loadSession(getToken, userId, selectedSessionId);
      setSessionId(loaded.sessionId);
      setAppName(loaded.appName);
      analysisOutputsRef.current = loaded.analysisOutputs;
      if (loaded.messages.length > 0) {
        setMessages(loaded.messages);
      } else {
        setMessages([{ type: "ai", content: "已加载历史会话，暂无可显示的消息。", id: `${Date.now()}_history`, agent: "history" }]);
      }
    } catch (err) {
      console.error("Failed to load session", err);
      setSessionId(null);
      setAppName(null);
      setMessages([{ type: "ai", content: "历史会话加载失败，请重试。", id: `${Date.now()}_history`, agent: "history" }]);
    } finally {
      setIsLoading(false);
    }
  }, [getToken, resetChatState, userId]);

  return {
    messages,
    displayData,
    isLoading,
    messageEvents,
    websiteCount,
    isHistoryOpen,
    historyRefreshKey,
    scrollAreaRef,
    handleSubmit,
    handleCancel,
    handleNewResearch,
    handleSelectHistorySession,
    setIsHistoryOpen,
  };
}
