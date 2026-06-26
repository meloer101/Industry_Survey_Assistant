import { useState, useEffect } from "react";
import { checkBackendHealth } from "@/lib/api";

interface BackendHealthState {
  isBackendReady: boolean;
  isCheckingBackend: boolean;
}

export function useBackendHealth(): BackendHealthState {
  const [isBackendReady, setIsBackendReady] = useState(false);
  const [isCheckingBackend, setIsCheckingBackend] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkBackend = async () => {
      const maxAttempts = 60;
      let attempts = 0;

      while (attempts < maxAttempts && !cancelled) {
        const isReady = await checkBackendHealth();
        if (isReady && !cancelled) {
          setIsBackendReady(true);
          setIsCheckingBackend(false);
          return;
        }
        attempts++;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }

      if (!cancelled) {
        setIsCheckingBackend(false);
        console.error("Backend failed to start within 2 minutes");
      }
    };

    checkBackend();
    return () => { cancelled = true; };
  }, []);

  return { isBackendReady, isCheckingBackend };
}
