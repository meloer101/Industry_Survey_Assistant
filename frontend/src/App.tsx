import { useEffect, useRef } from "react";
import { UserButton } from "@clerk/react";
import { useLocation } from "react-router-dom";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { ChatMessagesView } from "@/components/ChatMessagesView";
import { HistoryPanel } from "@/components/HistoryPanel";
import { BackendLoadingScreen } from "@/components/BackendLoadingScreen";
import { useResearchSession } from "@/hooks/useResearchSession";
import { useBackendHealth } from "@/hooks/useBackendHealth";
import { useAppAuth, isClerkEnabled } from "@/hooks/useAppAuth";

export default function App() {
  const { userId, getToken } = useAppAuth();
  const { isBackendReady, isCheckingBackend } = useBackendHealth();
  const {
    messages,
    isLoading,
    messageEvents,
    websiteCount,
    isHistoryOpen,
    historyRefreshKey,
    scrollAreaRef,
    displayData,
    handleSubmit,
    handleCancel,
    handleNewResearch,
    handleSelectHistorySession,
    setIsHistoryOpen,
  } = useResearchSession();

  const location = useLocation();
  const autoSubmittedRef = useRef(false);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector("[data-radix-scroll-area-viewport]");
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [messages, scrollAreaRef]);

  // Auto-submit a query passed from the landing page via router state
  useEffect(() => {
    const state = location.state as { query?: string } | null;
    if (state?.query && !autoSubmittedRef.current && isBackendReady) {
      autoSubmittedRef.current = true;
      handleSubmit(state.query);
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [isBackendReady, location.state, handleSubmit]);

  return (
    <div className="app-root flex h-screen bg-[var(--app-warm-50)] text-[var(--app-warm-900)] antialiased">
      <HistoryPanel
        userId={userId ?? null}
        isOpen={isHistoryOpen}
        getToken={getToken}
        refreshKey={historyRefreshKey}
        onToggle={() => setIsHistoryOpen((prev) => !prev)}
        onSelectSession={handleSelectHistorySession}
        onNewResearch={handleNewResearch}
      />
      {isClerkEnabled && (
        <div className="fixed right-4 top-4 z-50">
          <UserButton />
        </div>
      )}
      <main className="flex-1 flex flex-col overflow-hidden w-full">
        <div className={`flex-1 overflow-y-auto ${messages.length === 0 || isCheckingBackend ? "flex" : ""}`}>
          {isCheckingBackend ? (
            <BackendLoadingScreen />
          ) : !isBackendReady ? (
            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <div className="text-center space-y-4">
                <h2 className="text-2xl font-bold text-red-500" style={{ fontFamily: "var(--app-font-display)" }}>
                  后端服务不可用
                </h2>
                <p className="text-[var(--app-warm-500)]">无法连接到 localhost:8000，请检查后端是否已启动</p>
                <button
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 text-white rounded-lg transition-colors"
                  style={{ background: "linear-gradient(180deg, var(--app-gold-light), var(--app-gold))" }}
                >
                  重试
                </button>
              </div>
            </div>
          ) : messages.length === 0 ? (
            <WelcomeScreen handleSubmit={handleSubmit} isLoading={isLoading} onCancel={handleCancel} />
          ) : (
            <ChatMessagesView
              messages={messages}
              isLoading={isLoading}
              scrollAreaRef={scrollAreaRef}
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              onNewResearch={handleNewResearch}
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
