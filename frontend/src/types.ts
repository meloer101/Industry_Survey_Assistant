import type { AnalysisOutputs } from "@/components/AnalysisPanel";

export interface ProcessedEvent {
  title: string;
  data: SseEventData;
}

export type SseEventData =
  | { type: "text"; content: string }
  | { type: "functionCall"; name: string; args: Record<string, unknown>; id: string }
  | { type: "functionResponse"; name: string; response: unknown; id: string }
  | { type: "sources"; content: Record<string, { title: string; url: string }> };

export interface MessageWithAgent {
  type: "human" | "ai";
  content: string;
  id: string;
  agent?: string;
  finalReportWithCitations?: boolean;
  analysisOutputs?: AnalysisOutputs;
}

export type { AnalysisOutputs };
