import React, { createContext, useContext } from "react";
import {
  ClerkProvider,
  SignedIn as ClerkSignedIn,
  SignedOut as ClerkSignedOut,
  useAuth as useClerkAuth,
  UserButton as ClerkUserButton,
} from "@clerk/clerk-react";

const rawKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

export const isClerkConfigured = Boolean(
  rawKey &&
    !rawKey.includes("PLACEHOLDER") &&
    (rawKey.startsWith("pk_test_") || rawKey.startsWith("pk_live_")) &&
    rawKey.length > 25,
);

interface MockAuthContextType {
  getToken: () => Promise<string>;
  userId: string;
  isLoaded: boolean;
  isSignedIn: boolean;
}

const MockAuthContext = createContext<MockAuthContextType>({
  getToken: async () => "mock-dev-token",
  userId: "user_mock_dev",
  isLoaded: true,
  isSignedIn: true,
});

/**
 * Universal useAuth hook: uses Clerk when configured, or local dev mock when key is pending.
 */
export function useAppAuth() {
  if (isClerkConfigured) {
    return useClerkAuth();
  }
  return useContext(MockAuthContext);
}

/**
 * Universal SignedIn component
 */
export function AppSignedIn({ children }: { children: React.ReactNode }) {
  if (isClerkConfigured) {
    return <ClerkSignedIn>{children}</ClerkSignedIn>;
  }
  return <>{children}</>;
}

/**
 * Universal SignedOut component
 */
export function AppSignedOut({ children }: { children: React.ReactNode }) {
  if (isClerkConfigured) {
    return <ClerkSignedOut>{children}</ClerkSignedOut>;
  }
  return null;
}

/**
 * Universal UserButton component
 */
export function AppUserButton() {
  if (isClerkConfigured) {
    return (
      <ClerkUserButton
        appearance={{
          elements: {
            avatarBox: "h-8 w-8",
          },
        }}
      />
    );
  }

  return (
    <div
      title="Running in local preview mode (Clerk key pending)"
      className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-primary text-xs font-semibold text-white cursor-pointer select-none"
    >
      SN
    </div>
  );
}

/**
 * Root Auth Provider: wraps with ClerkProvider if configured, otherwise supplies dev preview context
 */
export function AppAuthProvider({ children }: { children: React.ReactNode }) {
  if (isClerkConfigured && rawKey) {
    return <ClerkProvider publishableKey={rawKey}>{children}</ClerkProvider>;
  }

  return (
    <MockAuthContext.Provider
      value={{
        getToken: async () => "mock-dev-token",
        userId: "user_mock_dev",
        isLoaded: true,
        isSignedIn: true,
      }}
    >
      <div className="flex flex-col min-h-screen">
        <div className="bg-amber-100 dark:bg-amber-950/60 border-b border-amber-300 dark:border-amber-800 px-4 py-1.5 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
          <span>
            ⚠️ <strong>Preview Mode:</strong> Clerk Publishable Key is not configured yet. Paste your key in <code>apps/web/.env.local</code> to enable real sign-in.
          </span>
          <a
            href="https://dashboard.clerk.com/last-active?path=api-keys"
            target="_blank"
            rel="noreferrer"
            className="underline font-medium hover:text-amber-950 dark:hover:text-amber-100"
          >
            Get Clerk Key →
          </a>
        </div>
        <div className="flex-1 flex flex-col">{children}</div>
      </div>
    </MockAuthContext.Provider>
  );
}
