export const AGENT_EVENT_TITLES: Record<string, string> = {
  plan_generator: "生成研究策略",
  section_planner: "规划报告大纲",
  section_researcher: "初步网络搜索",
  research_evaluator: "评估研究质量",
  EscalationChecker: "质量评估",
  enhanced_search_executor: "深度网络搜索",
  analysis_coordinator: "协调金融分析",
  macro_analysis_agent: "宏观政策分析",
  fundamental_analysis_agent: "公司基本面分析",
  risk_analysis_agent: "风险评估",
  research_pipeline: "执行研究流程",
  iterative_refinement_loop: "精炼研究内容",
  interactive_planner_agent: "交互式规划",
  root_agent: "交互式规划",
};

export const FUNCTION_FRIENDLY_NAMES: Record<string, string> = {
  macro_analysis_agent: "宏观政策分析",
  fundamental_analysis_agent: "公司基本面分析",
  risk_analysis_agent: "风险评估",
};

export const UI = {
  unknownAgent: "未知代理",
  processingAgent: (name: string) => `处理中（${name}）`,
  functionCall: (name: string) => `▶ 函数调用：${name}`,
  functionResponse: (name: string) => `✓ 函数响应：${name}`,
  retrievedSources: "已检索来源",
  callingFunction: (name: string) => `调用函数：${name}`,
  functionArgs: "参数",
  functionResponseLabel: (name: string) => `函数 ${name} 响应`,
  noSourcesFound: "未找到来源",
  untitledSource: "无标题来源",
  errorProcessingRequest: (msg: string) => `处理请求时出错：${msg}`,
  unknownError: "未知错误",
};
