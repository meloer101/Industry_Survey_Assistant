/**
 * Client-side export utilities.
 * Currently supports Markdown download; PDF support can be added later.
 */
import type { AnalysisOutputs } from "@/types";

/**
 * Build the full Markdown content for a research report, optionally
 * appending analysis module outputs as appendices.
 */
export function buildMarkdownExport(
  report: string,
  analysisOutputs?: AnalysisOutputs,
): string {
  const sections: string[] = [report.trimEnd()];

  const appendices: Array<{ heading: string; content: string }> = [];
  if (analysisOutputs?.macro) {
    appendices.push({ heading: "宏观政策分析", content: analysisOutputs.macro });
  }
  if (analysisOutputs?.fundamental) {
    appendices.push({ heading: "基本面分析", content: analysisOutputs.fundamental });
  }
  if (analysisOutputs?.risk) {
    appendices.push({ heading: "风险评估", content: analysisOutputs.risk });
  }

  if (appendices.length > 0) {
    sections.push("\n---\n\n## 附录：专项分析");
    for (const { heading, content } of appendices) {
      sections.push(`\n### ${heading}\n\n${content.trimEnd()}`);
    }
  }

  return sections.join("\n\n");
}

/**
 * Trigger a browser file download for the given text content.
 */
export function downloadTextFile(content: string, filename: string, mimeType = "text/markdown"): void {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

/**
 * Generate a timestamped filename for the report.
 * Format: 研究报告_YYYY-MM-DD_HH-mm.md
 */
export function reportFilename(): string {
  const now = new Date();
  const date = now.toLocaleDateString("sv-SE"); // YYYY-MM-DD
  const time = now.toTimeString().slice(0, 5).replace(":", "-"); // HH-mm
  return `研究报告_${date}_${time}.md`;
}
