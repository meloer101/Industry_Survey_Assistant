import { useAuth } from "@clerk/react";
import type { GetToken } from "@/lib/api";

const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY ?? "";
export const isClerkEnabled = clerkPublishableKey.length > 0;

const DEV_USER_ID = "dev_user";
const nullGetToken: GetToken = async () => null;

interface AppAuth {
  userId: string | null;
  getToken: GetToken;
}

export function useAppAuth(): AppAuth {
  const clerkAuth = useAuth();

  if (isClerkEnabled && clerkAuth.userId) {
    return { userId: clerkAuth.userId, getToken: clerkAuth.getToken };
  }

  if (!isClerkEnabled) {
    return { userId: DEV_USER_ID, getToken: nullGetToken };
  }

  return { userId: clerkAuth.userId ?? null, getToken: clerkAuth.getToken };
}
