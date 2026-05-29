import { useState, useRef, useCallback, useEffect } from "react";
import { v4 as uuidv4 } from 'uuid';
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { ChatMessagesView } from "@/components/ChatMessagesView";
import { HistoryPanel } from "@/components/HistoryPanel";
import type { AnalysisOutputs } from "@/components/AnalysisPanel";

const API_KEY = import.meta.env.VITE_API_KEY ?? "";
const authHeaders = (): Record<string, string> =>
  API_KEY ? { "X-API-Key": API_KEY } : {};
const requestHeaders = authHeaders();
const USER_ID_STORAGE_KEY = "investmentResearchUserId";

// Update DisplayData to be a string type
type DisplayData = string | null;
interface MessageWithAgent {
  type: "human" | "ai";
  content: string;
  id: string;
  agent?: string;
  finalReportWithCitations?: boolean;
  analysisOutputs?: AnalysisOutputs;
}

interface ProcessedEvent {
  title: string;
  data: any;
}

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

  const retryWithBackoff = async (
    fn: () => Promise<any>,
    maxRetries: number = 10,
    maxDuration: number = 120000 // 2 minutes
  ): Promise<any> => {
    const startTime = Date.now();
    let lastError: Error;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (Date.now() - startTime > maxDuration) {
        throw new Error(`Retry timeout after ${maxDuration}ms`);
      }
      
      try {
        return await fn();
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw error;
        }
        lastError = error as Error;
        const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
        console.warn(`Attempt ${attempt + 1} failed, retrying in ${delay}ms...`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  };

  const createSession = async (signal?: AbortSignal, existingUserId?: string | null): Promise<{userId: string, sessionId: string, appName: string}> => {
    const generatedUserId = existingUserId ?? `u_${uuidv4()}`;
    const generatedSessionId = uuidv4();
    const response = await fetch(`/api/apps/app/users/${generatedUserId}/sessions/${generatedSessionId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...requestHeaders,
      },
      signal,
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create session: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    return {
      userId: data.userId,
      sessionId: data.id,
      appName: data.appName
    };
  };

  const checkBackendHealth = async (): Promise<boolean> => {
    try {
      const response = await fetch("/api/health", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          ...requestHeaders,
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  };

  // Function to extract text and metadata from SSE data
  const extractDataFromSSE = (data: string) => {
    try {
      const parsed = JSON.parse(data);

      let textParts: string[] = [];
      let agent = '';
      let finalReportWithCitations = undefined;
      let functionCall = null;
      let functionResponse = null;
      let sources = null;

      // Check if content.parts exists and has text
      if (parsed.content && parsed.content.parts) {
        textParts = parsed.content.parts
          .filter((part: any) => part.text)
          .map((part: any) => part.text);
        
        // Check for function calls
        const functionCallPart = parsed.content.parts.find((part: any) => part.functionCall);
        if (functionCallPart) {
          functionCall = functionCallPart.functionCall;
        }
        
        // Check for function responses
        const functionResponsePart = parsed.content.parts.find((part: any) => part.functionResponse);
        if (functionResponsePart) {
          functionResponse = functionResponsePart.functionResponse;
        }
      }

      // Extract agent information
      if (parsed.author) {
        agent = parsed.author;
      }

      if (
        parsed.actions &&
        parsed.actions.stateDelta &&
        parsed.actions.stateDelta.final_report_with_citations
      ) {
        finalReportWithCitations = parsed.actions.stateDelta.final_report_with_citations;
      }

      // Extract website count from research agents
      let sourceCount = 0;
      if ((parsed.author === 'section_researcher' || parsed.author === 'enhanced_search_executor')) {
        if (parsed.actions?.stateDelta?.url_to_short_id) {
          sourceCount = Object.keys(parsed.actions.stateDelta.url_to_short_id).length;
        }
      }

      // Extract sources if available
      if (parsed.actions?.stateDelta?.sources) {
        sources = parsed.actions.stateDelta.sources;
      }

      // Extract analysis agent outputs from stateDelta
      let newAnalysisOutputs: AnalysisOutputs = {};
      if (parsed.actions?.stateDelta) {
        const delta = parsed.actions.stateDelta;
        if (delta.macro_analysis_output) newAnalysisOutputs.macro = delta.macro_analysis_output;
        if (delta.fundamental_analysis_output) newAnalysisOutputs.fundamental = delta.fundamental_analysis_output;
        if (delta.risk_analysis_output) newAnalysisOutputs.risk = delta.risk_analysis_output;
      }

      return { textParts, agent, finalReportWithCitations, functionCall, functionResponse, sourceCount, sources, newAnalysisOutputs };
    } catch (error) {
      // Log the error and a truncated version of the problematic data for easier debugging.
      const truncatedData = data.length > 200 ? data.substring(0, 200) + "..." : data;
      console.error('Error parsing SSE data. Raw data (truncated): "', truncatedData, '". Error details:', error);
      return { textParts: [], agent: '', finalReportWithCitations: undefined, functionCall: null, functionResponse: null, sourceCount: 0, sources: null, newAnalysisOutputs: {} };
    }
  };

  // Define getEventTitle here or ensure it's in scope from where it's used
  const getEventTitle = (agentName: string): string => {
    switch (agentName) {
      case "plan_generator":
        return "Planning Research Strategy";
      case "section_planner":
        return "Structuring Report Outline";
      case "section_researcher":
        return "Initial Web Research";
      case "research_evaluator":
        return "Evaluating Research Quality";
      case "EscalationChecker":
        return "Quality Assessment";
      case "enhanced_search_executor":
        return "Enhanced Web Research";
      case "analysis_coordinator":
        return "Coordinating Financial Analysis";
      case "macro_analysis_agent":
        return "Macro Policy Analysis";
      case "fundamental_analysis_agent":
        return "Fundamental Analysis";
      case "risk_analysis_agent":
        return "Risk Assessment";
      case "research_pipeline":
        return "Executing Research Pipeline";
      case "iterative_refinement_loop":
        return "Refining Research";
      case "interactive_planner_agent":
      case "root_agent":
        return "Interactive Planning";
      default:
        return `Processing (${agentName || 'Unknown Agent'})`;
    }
  };

  const getFunctionTitle = (funcName: string, type: 'call' | 'response'): string => {
    const friendlyNames: Record<string, string> = {
      macro_analysis_agent: "Macro Policy Analysis",
      fundamental_analysis_agent: "Fundamental Analysis",
      risk_analysis_agent: "Risk Assessment",
    };
    const prefix = type === 'call' ? '▶' : '✓';
    if (friendlyNames[funcName]) {
      return `${prefix} ${friendlyNames[funcName]}`;
    }
    return `Function ${type === 'call' ? 'Call' : 'Response'}: ${funcName}`;
  };

  const processSseEventData = (jsonData: string, aiMessageId: string) => {
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
        data: { type: 'functionCall', name: functionCall.name, args: functionCall.args, id: functionCall.id }
      }]));
    }

    if (functionResponse) {
      const functionResponseTitle = getFunctionTitle(functionResponse.name, 'response');
      setMessageEvents(prev => new Map(prev).set(aiMessageId, [...(prev.get(aiMessageId) || []), {
        title: functionResponseTitle,
        data: { type: 'functionResponse', name: functionResponse.name, response: functionResponse.response, id: functionResponse.id }
      }]));
    }

    if (textParts.length > 0 && agent !== "report_composer_with_citations") {
      if (agent !== "interactive_planner_agent") {
        const eventTitle = getEventTitle(agent);
        setMessageEvents(prev => new Map(prev).set(aiMessageId, [...(prev.get(aiMessageId) || []), {
          title: eventTitle,
          data: { type: 'text', content: textParts.join(" ") }
        }]));
      } else { // interactive_planner_agent text updates the main AI message
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
        title: "Retrieved Sources", data: { type: 'sources', content: sources }
      }]));
    }

    if (agent === "report_composer_with_citations" && finalReportWithCitations) {
      const finalReportMessageId = Date.now().toString() + "_final";
      const snapshotOutputs = { ...analysisOutputsRef.current };
      setMessages(prev => [...prev, {
        type: "ai",
        content: finalReportWithCitations as string,
        id: finalReportMessageId,
        agent: currentAgentRef.current,
        finalReportWithCitations: true,
        analysisOutputs: snapshotOutputs,
      }]);
      setDisplayData(finalReportWithCitations as string);
      analysisOutputsRef.current = {};
    }
  };

  const handleSubmit = useCallback(async (query: string) => {
    if (!query.trim()) return;

    setIsLoading(true);
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    const abortSignal = abortControllerRef.current.signal;

    try {
      // Create session if it doesn't exist
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

      // Add user message to chat
      const userMessageId = Date.now().toString();
      setMessages(prev => [...prev, { type: "human", content: query, id: userMessageId }]);

      // Create AI message placeholder
      const aiMessageId = Date.now().toString() + "_ai";
      currentAgentRef.current = ''; // Reset current agent
      accumulatedTextRef.current = ''; // Reset accumulated text

      setMessages(prev => [...prev, {
        type: "ai",
        content: "",
        id: aiMessageId,
        agent: '',
      }]);

      // Send the message with retry logic
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

      // Handle SSE streaming
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = ""; 
      let eventDataBuffer = "";

      if (reader) {
        try {
          // eslint-disable-next-line no-constant-condition
          while (true) {
            const { done, value } = await reader.read();

            if (value) {
              lineBuffer += decoder.decode(value, { stream: true });
            }
          
            let eolIndex;
            // Process all complete lines in the buffer, or the remaining buffer if 'done'
            while ((eolIndex = lineBuffer.indexOf('\n')) >= 0 || (done && lineBuffer.length > 0)) {
              let line: string;
              if (eolIndex >= 0) {
                line = lineBuffer.substring(0, eolIndex);
                lineBuffer = lineBuffer.substring(eolIndex + 1);
              } else { // Only if done and lineBuffer has content without a trailing newline
                line = lineBuffer;
                lineBuffer = "";
              }

              if (line.trim() === "") { // Empty line: dispatch event
                if (eventDataBuffer.length > 0) {
                  // Remove trailing newline before parsing
                  const jsonDataToParse = eventDataBuffer.endsWith('\n') ? eventDataBuffer.slice(0, -1) : eventDataBuffer;
                  processSseEventData(jsonDataToParse, aiMessageId);
                  eventDataBuffer = ""; // Reset for next event
                }
              } else if (line.startsWith('data:')) {
                eventDataBuffer += line.substring(5).trimStart() + '\n'; // Add newline as per spec for multi-line data
              } else if (line.startsWith(':')) {
                // Comment line, ignore
              } // Other SSE fields (event, id, retry) can be handled here if needed
            }

            if (done) {
              // If the loop exited due to 'done', and there's still data in eventDataBuffer
              // (e.g., stream ended after data lines but before an empty line delimiter)
              if (eventDataBuffer.length > 0) {
                const jsonDataToParse = eventDataBuffer.endsWith('\n') ? eventDataBuffer.slice(0, -1) : eventDataBuffer;
                processSseEventData(jsonDataToParse, aiMessageId);
                eventDataBuffer = ""; // Clear buffer
              }
              break; // Exit the while(true) loop
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
      // Update the AI message placeholder with an error message
      const aiMessageId = Date.now().toString() + "_ai_error";
      setMessages(prev => [...prev, { 
        type: "ai", 
        content: `Sorry, there was an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        id: aiMessageId 
      }]);
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [processSseEventData]);

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
      
      // Check if backend is ready with retry logic
      const maxAttempts = 60; // 2 minutes with 2-second intervals
      let attempts = 0;
      
      while (attempts < maxAttempts) {
        const isReady = await checkBackendHealth();
        if (isReady) {
          setIsBackendReady(true);
          setIsCheckingBackend(false);
          return;
        }
        
        attempts++;
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds between checks
      }
      
      // If we get here, backend didn't come up in time
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

  const handleSelectHistorySession = useCallback((selectedSessionId: string) => {
    setSessionId(selectedSessionId);
    setAppName("app");
    setMessages(prev => [...prev, {
      type: "ai",
      content: `已选择历史会话 ${selectedSessionId}。你可以继续提问；完整历史报告加载将在后续版本支持。`,
      id: `${Date.now()}_history`,
      agent: "history",
    }]);
  }, []);

  const BackendLoadingScreen = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden relative">
      <div className="w-full max-w-2xl z-10
                      bg-white p-8 rounded-2xl border border-gray-200
                      shadow-lg shadow-gray-200/60">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold text-gray-900 flex items-center justify-center gap-3">
            📈 AI 投资研究平台
          </h1>

          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 w-16 h-16 border-4 border-transparent border-r-amber-400 rounded-full animate-spin" style={{animationDirection: 'reverse', animationDuration: '1.5s'}}></div>
            </div>

            <div className="space-y-2">
              <p className="text-xl text-gray-600">
                正在连接后端服务...
              </p>
              <p className="text-sm text-gray-400">
                首次启动可能需要片刻，请稍候
              </p>
            </div>

            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay: '0ms'}}></div>
              <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{animationDelay: '150ms'}}></div>
              <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" style={{animationDelay: '300ms'}}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

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
