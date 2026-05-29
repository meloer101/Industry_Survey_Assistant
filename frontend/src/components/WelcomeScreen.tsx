import { Button } from "@/components/ui/button";
import { InputForm } from "@/components/InputForm";

interface WelcomeScreenProps {
  handleSubmit: (query: string) => void;
  isLoading: boolean;
  onCancel: () => void;
}

const EXAMPLE_QUERIES = [
  { label: "美联储降息路径", query: "美联储2025年降息路径分析及对美债市场的影响" },
  { label: "NVDA 财报解读", query: "[TICKER: NVDA] NVDA Q4财报解读及2025年前景展望" },
  { label: "半导体贸易摩擦", query: "中美贸易摩擦对半导体行业的长期影响分析" },
  { label: "黄金通胀对冲", query: "高通胀环境下黄金的避险价值与配置建议" },
];

export function WelcomeScreen({
  handleSubmit,
  isLoading,
  onCancel,
}: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden bg-gray-50">
      <div className="w-full max-w-2xl
                      bg-white rounded-2xl border border-gray-200
                      shadow-sm p-8
                      transition-all duration-300 hover:shadow-md hover:border-gray-300">

        <div className="text-center space-y-3">
          <h1 className="text-4xl font-bold text-gray-900 flex items-center justify-center gap-3">
            📈 AI 投资研究平台
          </h1>
          <p className="text-lg text-gray-600 max-w-md mx-auto">
            将投资研究问题转化为专业分析报告
          </p>
          <p className="text-sm text-gray-400">
            支持宏观政策分析、个股基本面研究、风险评估
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          {EXAMPLE_QUERIES.map((item) => (
            <button
              key={item.label}
              onClick={() => handleSubmit(item.query)}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs rounded-full border border-gray-200
                         bg-gray-50 text-gray-600
                         hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50
                         transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-6">
          <InputForm onSubmit={handleSubmit} isLoading={isLoading} context="homepage" />
          {isLoading && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="outline"
                onClick={onCancel}
                className="text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
              >
                取消
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
