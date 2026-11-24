import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppAuth } from "@/features/auth/AuthContext";
import type { LLMProvider, LLMSettings, TestConnectionResult } from "@/types";

const API_BASE = "/api/v1";

export function useLLMSettings() {
  const { getToken } = useAppAuth();

  return useQuery({
    queryKey: ["llm-settings"],
    queryFn: async (): Promise<LLMSettings> => {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/settings/llm`, { headers });
      if (!res.ok) {
        // Fall back to client localStorage if backend table or route is offline
        const localProvider = (localStorage.getItem("supernotes_llm_provider") || "gemini") as LLMProvider;
        const localKey = localStorage.getItem("supernotes_llm_key");
        const localModel = localStorage.getItem("supernotes_llm_model");
        return {
          active_provider: localProvider,
          active_model: localModel,
          has_gemini_key: Boolean(localProvider === "gemini" && localKey),
          has_openai_key: Boolean(localProvider === "openai" && localKey),
          has_anthropic_key: Boolean(localProvider === "anthropic" && localKey),
          masked_key: localKey && localKey.length > 8 ? `${localKey.slice(0, 4)}...${localKey.slice(-4)}` : null,
        };
      }
      return (await res.json()) as LLMSettings;
    },
  });
}

export function useUpdateLLMSettings() {
  const queryClient = useQueryClient();
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async ({
      provider,
      model,
      apiKey,
    }: {
      provider: LLMProvider;
      model?: string | null;
      apiKey?: string | null;
    }): Promise<LLMSettings> => {
      // 1. Immediately store in localStorage so all client hooks get it
      try {
        localStorage.setItem("supernotes_llm_provider", provider);
        if (model) localStorage.setItem("supernotes_llm_model", model);
        else localStorage.removeItem("supernotes_llm_model");

        if (apiKey && apiKey !== "RESET") {
          localStorage.setItem("supernotes_llm_key", apiKey.trim());
        } else if (apiKey === "RESET") {
          localStorage.removeItem("supernotes_llm_key");
        }
      } catch {
        // storage quota or restriction
      }

      // 2. Persist to server user_settings
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/settings/llm`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          provider,
          model: model || null,
          api_key: apiKey || null,
        }),
      });

      if (!res.ok) {
        // Even if server PUT fails, client localStorage is preserved
        return {
          active_provider: provider,
          active_model: model || null,
          has_gemini_key: provider === "gemini" && Boolean(apiKey && apiKey !== "RESET"),
          has_openai_key: provider === "openai" && Boolean(apiKey && apiKey !== "RESET"),
          has_anthropic_key: provider === "anthropic" && Boolean(apiKey && apiKey !== "RESET"),
          masked_key: apiKey && apiKey.length > 8 ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : null,
        };
      }

      return (await res.json()) as LLMSettings;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["llm-settings"] });
    },
  });
}

export function useTestConnection() {
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async ({
      provider,
      apiKey,
      model,
    }: {
      provider: LLMProvider;
      apiKey: string;
      model?: string | null;
    }): Promise<TestConnectionResult> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/settings/test-connection`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          provider,
          api_key: apiKey.trim(),
          model: model || null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Failed to test connection");
      }

      return (await res.json()) as TestConnectionResult;
    },
  });
}
