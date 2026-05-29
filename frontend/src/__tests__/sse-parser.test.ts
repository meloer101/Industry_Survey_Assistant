import { describe, it, expect } from "vitest";
import { extractDataFromSSE, getEventTitle, getFunctionTitle } from "@/lib/sse";

describe("extractDataFromSSE", () => {
  it("extracts text parts from content.parts", () => {
    const data = JSON.stringify({
      content: { parts: [{ text: "Hello" }, { text: "World" }] },
      author: "plan_generator",
    });

    const result = extractDataFromSSE(data);

    expect(result.textParts).toEqual(["Hello", "World"]);
  });

  it("extracts agent from author field", () => {
    const data = JSON.stringify({
      author: "section_researcher",
      content: { parts: [] },
    });

    const result = extractDataFromSSE(data);

    expect(result.agent).toBe("section_researcher");
  });

  it("extracts final report from stateDelta", () => {
    const data = JSON.stringify({
      author: "report_composer_with_citations",
      actions: {
        stateDelta: {
          final_report_with_citations: "# Final Report\nContent here.",
        },
      },
    });

    const result = extractDataFromSSE(data);

    expect(result.finalReportWithCitations).toBe("# Final Report\nContent here.");
  });

  it("extracts source count from url_to_short_id", () => {
    const data = JSON.stringify({
      author: "section_researcher",
      actions: {
        stateDelta: {
          url_to_short_id: {
            "https://a.com": "src-1",
            "https://b.com": "src-2",
            "https://c.com": "src-3",
          },
        },
      },
    });

    const result = extractDataFromSSE(data);

    expect(result.sourceCount).toBe(3);
  });

  it("extracts analysis outputs from stateDelta", () => {
    const data = JSON.stringify({
      author: "analysis_coordinator",
      actions: {
        stateDelta: {
          macro_analysis_output: "Macro content",
          risk_analysis_output: "Risk content",
        },
      },
    });

    const result = extractDataFromSSE(data);

    expect(result.newAnalysisOutputs.macro).toBe("Macro content");
    expect(result.newAnalysisOutputs.risk).toBe("Risk content");
    expect(result.newAnalysisOutputs.fundamental).toBeUndefined();
  });

  it("returns empty result on invalid JSON", () => {
    const result = extractDataFromSSE("not json at all");

    expect(result.textParts).toEqual([]);
    expect(result.agent).toBe("");
    expect(result.finalReportWithCitations).toBeUndefined();
  });

  it("handles event with no content.parts gracefully", () => {
    const data = JSON.stringify({
      author: "some_agent",
    });

    const result = extractDataFromSSE(data);

    expect(result.textParts).toEqual([]);
    expect(result.agent).toBe("some_agent");
  });

  it("extracts function call from parts", () => {
    const data = JSON.stringify({
      author: "analysis_coordinator",
      content: {
        parts: [
          {
            functionCall: {
              name: "macro_analysis_agent",
              args: { topic: "rates" },
              id: "fc-1",
            },
          },
        ],
      },
    });

    const result = extractDataFromSSE(data);

    expect(result.functionCall).toEqual({
      name: "macro_analysis_agent",
      args: { topic: "rates" },
      id: "fc-1",
    });
  });

  it("extracts sources from stateDelta", () => {
    const data = JSON.stringify({
      author: "section_researcher",
      actions: {
        stateDelta: {
          sources: {
            "src-1": { title: "Reuters", url: "https://reuters.com" },
          },
        },
      },
    });

    const result = extractDataFromSSE(data);

    expect(result.sources).toEqual({
      "src-1": { title: "Reuters", url: "https://reuters.com" },
    });
  });
});

describe("getEventTitle", () => {
  it("maps known agent names to titles", () => {
    expect(getEventTitle("plan_generator")).toBe("Planning Research Strategy");
    expect(getEventTitle("section_researcher")).toBe("Initial Web Research");
    expect(getEventTitle("macro_analysis_agent")).toBe("Macro Policy Analysis");
    expect(getEventTitle("risk_analysis_agent")).toBe("Risk Assessment");
  });

  it("returns fallback for unknown agents", () => {
    expect(getEventTitle("custom_agent")).toBe("Processing (custom_agent)");
  });

  it("handles empty agent name", () => {
    expect(getEventTitle("")).toBe("Processing (Unknown Agent)");
  });
});

describe("getFunctionTitle", () => {
  it("formats known function calls", () => {
    expect(getFunctionTitle("macro_analysis_agent", "call")).toBe("▶ Macro Policy Analysis");
    expect(getFunctionTitle("macro_analysis_agent", "response")).toBe("✓ Macro Policy Analysis");
  });

  it("formats unknown function calls", () => {
    expect(getFunctionTitle("some_tool", "call")).toBe("Function Call: some_tool");
    expect(getFunctionTitle("some_tool", "response")).toBe("Function Response: some_tool");
  });
});
