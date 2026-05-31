import type { AnalysisOutputs } from "@/components/AnalysisPanel";
import { AGENT_EVENT_TITLES, FUNCTION_FRIENDLY_NAMES, UI } from "@/lib/strings";

interface SsePart {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown>; id: string };
  functionResponse?: { name: string; response: unknown; id: string };
}

interface SourceInfo {
  title: string;
  url: string;
  domain?: string;
}

export interface SseExtractResult {
  textParts: string[];
  agent: string;
  finalReportWithCitations: string | undefined;
  functionCall: { name: string; args: Record<string, unknown>; id: string } | null;
  functionResponse: { name: string; response: unknown; id: string } | null;
  sourceCount: number;
  sources: Record<string, SourceInfo> | null;
  newAnalysisOutputs: AnalysisOutputs;
}

export function extractDataFromSSE(data: string): SseExtractResult {
  try {
    const parsed = JSON.parse(data);

    let textParts: string[] = [];
    let agent = "";
    let finalReportWithCitations: string | undefined = undefined;
    let functionCall: SseExtractResult["functionCall"] = null;
    let functionResponse: SseExtractResult["functionResponse"] = null;
    let sources: Record<string, SourceInfo> | null = null;

    if (parsed.content && parsed.content.parts) {
      textParts = parsed.content.parts
        .filter((part: SsePart) => part.text)
        .map((part: SsePart) => part.text as string);

      const functionCallPart = parsed.content.parts.find(
        (part: SsePart) => part.functionCall,
      );
      if (functionCallPart) {
        functionCall = functionCallPart.functionCall;
      }

      const functionResponsePart = parsed.content.parts.find(
        (part: SsePart) => part.functionResponse,
      );
      if (functionResponsePart) {
        functionResponse = functionResponsePart.functionResponse;
      }
    }

    if (parsed.author) {
      agent = parsed.author;
    }

    if (
      parsed.actions &&
      parsed.actions.stateDelta &&
      parsed.actions.stateDelta.final_report_with_citations
    ) {
      finalReportWithCitations =
        parsed.actions.stateDelta.final_report_with_citations;
    }

    let sourceCount = 0;
    if (
      parsed.author === "section_researcher" ||
      parsed.author === "enhanced_search_executor"
    ) {
      if (parsed.actions?.stateDelta?.url_to_short_id) {
        sourceCount = Object.keys(
          parsed.actions.stateDelta.url_to_short_id,
        ).length;
      }
    }

    if (parsed.actions?.stateDelta?.sources) {
      sources = parsed.actions.stateDelta.sources;
    }

    const newAnalysisOutputs: AnalysisOutputs = {};
    if (parsed.actions?.stateDelta) {
      const delta = parsed.actions.stateDelta;
      if (delta.macro_analysis_output)
        newAnalysisOutputs.macro = delta.macro_analysis_output;
      if (delta.fundamental_analysis_output)
        newAnalysisOutputs.fundamental = delta.fundamental_analysis_output;
      if (delta.risk_analysis_output)
        newAnalysisOutputs.risk = delta.risk_analysis_output;
    }

    return {
      textParts,
      agent,
      finalReportWithCitations,
      functionCall,
      functionResponse,
      sourceCount,
      sources,
      newAnalysisOutputs,
    };
  } catch (error) {
    const truncatedData =
      data.length > 200 ? data.substring(0, 200) + "..." : data;
    console.error(
      'Error parsing SSE data. Raw data (truncated): "',
      truncatedData,
      '". Error details:',
      error,
    );
    return {
      textParts: [],
      agent: "",
      finalReportWithCitations: undefined,
      functionCall: null,
      functionResponse: null,
      sourceCount: 0,
      sources: null,
      newAnalysisOutputs: {},
    };
  }
}

export function getEventTitle(agentName: string): string {
  return AGENT_EVENT_TITLES[agentName] ?? UI.processingAgent(agentName || UI.unknownAgent);
}

export function getFunctionTitle(
  funcName: string,
  type: "call" | "response",
): string {
  const friendly = FUNCTION_FRIENDLY_NAMES[funcName];
  if (type === "call") {
    return friendly ? `▶ ${friendly}` : UI.functionCall(funcName);
  }
  return friendly ? `✓ ${friendly}` : UI.functionResponse(funcName);
}
