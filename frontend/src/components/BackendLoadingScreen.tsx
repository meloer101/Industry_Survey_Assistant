export function BackendLoadingScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden relative bg-[var(--app-warm-50)]"
         style={{ fontFamily: 'var(--app-font-body)' }}>
      <div className="w-full max-w-2xl z-10 bg-white p-8 rounded-2xl border border-[var(--app-warm-200)] shadow-lg shadow-[var(--app-warm-200)]/60">
        <div className="text-center space-y-6">
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

          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-[var(--app-warm-200)] rounded-full animate-spin"
                   style={{ borderTopColor: 'var(--app-gold)' }}></div>
              <div
                className="absolute inset-0 w-16 h-16 border-4 border-transparent rounded-full animate-spin"
                style={{
                  borderRightColor: 'var(--app-gold-light)',
                  animationDirection: "reverse",
                  animationDuration: "1.5s",
                }}
              ></div>
            </div>

            <div className="space-y-2">
              <p className="text-xl text-[var(--app-warm-600)]">正在连接后端服务...</p>
              <p className="text-sm text-[var(--app-warm-400)]"
                 style={{ fontFamily: 'var(--app-font-mono)' }}>
                首次启动可能需要片刻，请稍候
              </p>
            </div>

            <div className="flex space-x-1.5">
              <div className="w-2 h-2 rounded-full animate-bounce"
                   style={{ backgroundColor: 'var(--app-gold)', animationDelay: '0ms' }}></div>
              <div className="w-2 h-2 rounded-full animate-bounce"
                   style={{ backgroundColor: 'var(--app-gold)', animationDelay: '150ms', opacity: 0.7 }}></div>
              <div className="w-2 h-2 rounded-full animate-bounce"
                   style={{ backgroundColor: 'var(--app-gold)', animationDelay: '300ms', opacity: 0.5 }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
