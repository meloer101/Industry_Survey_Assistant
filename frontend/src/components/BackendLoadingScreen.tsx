export function BackendLoadingScreen() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden relative">
      <div className="w-full max-w-2xl z-10 bg-white p-8 rounded-2xl border border-gray-200 shadow-lg shadow-gray-200/60">
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-bold text-gray-900 flex items-center justify-center gap-3">
            📈 AI 投资研究平台
          </h1>

          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
              <div
                className="absolute inset-0 w-16 h-16 border-4 border-transparent border-r-amber-400 rounded-full animate-spin"
                style={{
                  animationDirection: "reverse",
                  animationDuration: "1.5s",
                }}
              ></div>
            </div>

            <div className="space-y-2">
              <p className="text-xl text-gray-600">正在连接后端服务...</p>
              <p className="text-sm text-gray-400">
                首次启动可能需要片刻，请稍候
              </p>
            </div>

            <div className="flex space-x-1">
              <div
                className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                style={{ animationDelay: "0ms" }}
              ></div>
              <div
                className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"
                style={{ animationDelay: "150ms" }}
              ></div>
              <div
                className="w-2 h-2 bg-blue-600 rounded-full animate-bounce"
                style={{ animationDelay: "300ms" }}
              ></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
