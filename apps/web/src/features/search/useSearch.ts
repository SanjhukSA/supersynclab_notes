import { useQuery } from "@tanstack/react-query";
import { useAppAuth } from "@/features/auth/AuthContext";
import type { GlobalSearchResponse } from "@/types";

const API_BASE = "/api/v1";

/**
 * Hook to execute global search across note titles, subjects, topics, and chunk text.
 */
export function useGlobalSearch(query: string) {
  const { getToken } = useAppAuth();
  const trimmed = query.trim();

  return useQuery({
    queryKey: ["global-search", trimmed],
    queryFn: async (): Promise<GlobalSearchResponse> => {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(
        `${API_BASE}/notes/search?q=${encodeURIComponent(trimmed)}`,
        { headers },
      );
      if (!res.ok) {
        throw new Error(`Search failed: ${res.statusText}`);
      }
      return (await res.json()) as GlobalSearchResponse;
    },
    enabled: trimmed.length >= 1,
    staleTime: 1000 * 30,
  });
}
