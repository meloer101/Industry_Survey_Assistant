import { v4 as uuidv4 } from "uuid";

const API_KEY = import.meta.env.VITE_API_KEY ?? "";

export function authHeaders(): Record<string, string> {
  return API_KEY ? { "X-API-Key": API_KEY } : {};
}

export const requestHeaders = authHeaders();

export const USER_ID_STORAGE_KEY = "investmentResearchUserId";

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 10,
  maxDuration: number = 120000,
): Promise<T> {
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
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      console.warn(
        `Attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

export async function createSession(
  signal?: AbortSignal,
  existingUserId?: string | null,
): Promise<{ userId: string; sessionId: string; appName: string }> {
  const generatedUserId = existingUserId ?? `u_${uuidv4()}`;
  const generatedSessionId = uuidv4();
  const response = await fetch(
    `/api/apps/app/users/${generatedUserId}/sessions/${generatedSessionId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...requestHeaders,
      },
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to create session: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return {
    userId: data.userId,
    sessionId: data.id,
    appName: data.appName,
  };
}

export async function cancelRun(
  appName: string,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const response = await fetch(
    `/api/apps/${appName}/users/${userId}/sessions/${sessionId}/run`,
    {
      method: "DELETE",
      headers: requestHeaders,
    },
  );
  return response.ok;
}

export interface SessionEvent {
  author: string;
  content: {
    role?: string;
    parts?: Array<{
      text?: string;
      thought?: boolean;
      functionCall?: unknown;
      functionResponse?: unknown;
    }>;
  } | null;
}

export interface AnalysisOutputs {
  macro?: string;
  fundamental?: string;
  risk?: string;
}

export interface LoadedSession {
  sessionId: string;
  appName: string;
  userId: string;
  analysisOutputs: AnalysisOutputs;
  messages: Array<{ type: "human" | "ai"; content: string; id: string; agent?: string; finalReportWithCitations?: boolean; analysisOutputs?: AnalysisOutputs }>;
}

// Agents whose plain text messages should appear in the chat as AI messages
const VISIBLE_AI_AUTHORS = new Set([
  "interactive_planner_agent",
  "report_composer_with_citations",
  "report_composer",
]);

export async function loadSession(
  userId: string,
  sessionId: string,
): Promise<LoadedSession> {
  const response = await fetch(
    `/api/apps/app/users/${userId}/sessions/${sessionId}`,
    { headers: requestHeaders },
  );
  if (!response.ok) {
    throw new Error(`Failed to load session: ${response.status}`);
  }
  const data = await response.json();
  const events: SessionEvent[] = data.events ?? [];
  const state: Record<string, string> = data.state ?? {};
  const messages: LoadedSession["messages"] = [];

  // [P2] Restore analysis outputs from session state
  const analysisOutputs: AnalysisOutputs = {};
  if (state.macro_analysis_output) analysisOutputs.macro = state.macro_analysis_output;
  if (state.fundamental_analysis_output) analysisOutputs.fundamental = state.fundamental_analysis_output;
  if (state.risk_analysis_output) analysisOutputs.risk = state.risk_analysis_output;

  for (const ev of events) {
    const parts = ev.content?.parts ?? [];
    const hasFunctionCall = parts.some((p) => "functionCall" in p);
    const hasFunctionResponse = parts.some((p) => "functionResponse" in p);
    if (hasFunctionCall || hasFunctionResponse) continue;

    // [P1] Exclude thought parts (internal reasoning) from visible text
    const text = parts
      .filter((p) => !p.thought)
      .map((p) => p.text ?? "")
      .join("")
      .trim();
    if (!text) continue;

    if (ev.author === "user") {
      messages.push({ type: "human", content: text, id: `hist_${messages.length}` });
    } else if (VISIBLE_AI_AUTHORS.has(ev.author)) {
      const isFinalReport =
        ev.author === "report_composer_with_citations" ||
        ev.author === "report_composer";
      // For report_composer, only keep the actual report (starts with #) not the internal thinking preamble
      if (isFinalReport && !text.startsWith("#")) continue;
      messages.push({
        type: "ai",
        content: text,
        id: `hist_${messages.length}`,
        agent: ev.author,
        // [P2] Attach analysis outputs to the final report message so AnalysisPanel renders
        ...(isFinalReport
          ? { finalReportWithCitations: true, analysisOutputs }
          : {}),
      });
    }
  }

  return {
    sessionId: data.id,
    appName: data.appName,
    userId: data.userId,
    analysisOutputs,
    messages,
  };
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch("/api/health", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...requestHeaders,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
