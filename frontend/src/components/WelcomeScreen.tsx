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
    <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden bg-[var(--app-warm-50)]">
      <div className="w-full max-w-2xl
                      bg-white rounded-2xl border border-[var(--app-warm-200)]
                      shadow-sm p-8
                      transition-all duration-300 hover:shadow-md hover:border-[var(--app-warm-300)]">

        <div className="text-center space-y-3">
          <h1 className="text-4xl font-semibold text-[var(--app-warm-900)] flex items-center justify-center gap-3"
              style={{ fontFamily: 'var(--app-font-display)' }}>
            <svg className="w-9 h-9" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="16" stroke="var(--app-gold)" strokeWidth="1.4" opacity="0.55" fill="none"/>
              <line x1="20" y1="20" x2="20" y2="6" stroke="var(--app-gold)" strokeWidth="1.2" opacity="0.4"/>
              <line x1="20" y1="20" x2="32" y2="27" stroke="var(--app-gold)" strokeWidth="1.2" opacity="0.4"/>
              <line x1="20" y1="20" x2="8" y2="27" stroke="var(--app-gold)" strokeWidth="1.2" opacity="0.4"/>
              <circle cx="20" cy="6" r="2.6" fill="var(--app-gold)"/>
              <circle cx="32" cy="27" r="2.6" fill="var(--app-gold)"/>
              <circle cx="8" cy="27" r="2.6" fill="var(--app-gold)"/>
              <circle cx="20" cy="20" r="3.6" fill="var(--app-gold-light)"/>
            </svg>
            AI 投资研究平台
          </h1>
          <p className="text-lg text-[var(--app-warm-500)]">
            将投资研究问题转化为专业分析报告
          </p>
          <p className="text-sm text-[var(--app-warm-400)]"
             style={{ fontFamily: 'var(--app-font-mono)', letterSpacing: '0.02em' }}>
            8 Agents · 实时流式 · 引用溯源
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 justify-center">
          {EXAMPLE_QUERIES.map((item) => (
            <button
              key={item.label}
              onClick={() => handleSubmit(item.query)}
              disabled={isLoading}
              className="px-3 py-1.5 text-xs rounded-full border border-[var(--app-warm-200)]
                         bg-[var(--app-warm-50)] text-[var(--app-warm-600)]
                         hover:border-[var(--app-gold)] hover:text-[var(--app-gold-dim)] hover:bg-[var(--app-gold-bg)]
                         transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
