import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, SignInButton, useAuth } from "@clerk/react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { isClerkEnabled } from "@/hooks/useAppAuth";
import "./global.css";
import App from "./App.tsx";
import LandingPage from "@/pages/LandingPage.tsx";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";

function RequireAuth() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--app-warm-50)] text-sm text-[var(--app-warm-500)]">
        正在加载登录状态...
      </div>
    );
  }

  if (isSignedIn) {
    return <App />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-warm-50)] p-6 text-[var(--app-warm-900)]">
      <div className="w-full max-w-sm rounded-lg border border-[var(--app-warm-200)] bg-white p-6 text-center shadow-sm">
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--app-font-display)" }}
        >
          登录后开始研究
        </h1>
        <p className="mt-2 text-sm text-[var(--app-warm-500)]">
          使用 Clerk 登录或注册，系统会把研究历史绑定到你的账户。
        </p>
        <SignInButton mode="modal">
          <button className="mt-5 rounded-md bg-[var(--app-warm-900)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--app-warm-700)]">
            登录 / 注册
          </button>
        </SignInButton>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ClerkProvider publishableKey={clerkPublishableKey}>
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route
              path="/app/*"
              element={isClerkEnabled ? <RequireAuth /> : <App />}
            />
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
    </ClerkProvider>
  </StrictMode>,
);
