import { v4 as uuidv4 } from "uuid";

const API_KEY = import.meta.env.VITE_API_KEY ?? "";

export function authHeaders(): Record<string, string> {
  return API_KEY ? { "X-API-Key": API_KEY } : {};
}

export const requestHeaders = authHeaders();

export const USER_ID_STORAGE_KEY = "investmentResearchUserId";

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 10,
  maxDuration: number = 120000,
): Promise<T> {
  const startTime = Date.now();
  let lastError: Error;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (Date.now() - startTime > maxDuration) {
      throw new Error(`Retry timeout after ${maxDuration}ms`);
    }

    try {
      return await fn();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw error;
      }
      lastError = error as Error;
      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      console.warn(
        `Attempt ${attempt + 1} failed, retrying in ${delay}ms...`,
        error,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

export async function createSession(
  signal?: AbortSignal,
  existingUserId?: string | null,
): Promise<{ userId: string; sessionId: string; appName: string }> {
  const generatedUserId = existingUserId ?? `u_${uuidv4()}`;
  const generatedSessionId = uuidv4();
  const response = await fetch(
    `/api/apps/app/users/${generatedUserId}/sessions/${generatedSessionId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...requestHeaders,
      },
      signal,
    },
  );

  if (!response.ok) {
    throw new Error(
      `Failed to create session: ${response.status} ${response.statusText}`,
    );
  }

  const data = await response.json();
  return {
    userId: data.userId,
    sessionId: data.id,
    appName: data.appName,
  };
}

export async function checkBackendHealth(): Promise<boolean> {
  try {
    const response = await fetch("/api/health", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...requestHeaders,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
