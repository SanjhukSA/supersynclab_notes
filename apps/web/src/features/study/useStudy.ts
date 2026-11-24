import { useMutation } from "@tanstack/react-query";
import { useAppAuth } from "@/features/auth/AuthContext";
import { getLlmHeaders } from "@/lib/api";
import type { CheatSheet, Quiz } from "@/types";

const API_BASE = "/api/v1";

/**
 * Hook to generate a 1-page high-yield cheat sheet for a note.
 */
export function useGenerateCheatSheet() {
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async (noteId: string): Promise<CheatSheet> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        ...getLlmHeaders(),
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/notes/${noteId}/cheatsheet`, {
        method: "POST",
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Failed to generate cheat sheet");
      }

      return (await res.json()) as CheatSheet;
    },
  });
}

/**
 * Hook to generate an active-recall practice quiz for a note.
 */
export function useGenerateQuiz() {
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async (noteId: string): Promise<Quiz> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        ...getLlmHeaders(),
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/notes/${noteId}/quiz`, {
        method: "POST",
        headers,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Failed to generate quiz");
      }

      return (await res.json()) as Quiz;
    },
  });
}

/**
 * Hook to synthesize a multi-document cheat sheet across a folder or selected notes.
 */
export function useSynthesizeCheatSheet() {
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async ({
      noteIds,
      folderId,
      title,
    }: {
      noteIds?: string[];
      folderId?: string;
      title?: string;
    }): Promise<CheatSheet> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...getLlmHeaders(),
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/study/synthesize/cheatsheet`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          note_ids: noteIds,
          folder_id: folderId,
          title,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Failed to synthesize cheat sheet");
      }

      return (await res.json()) as CheatSheet;
    },
  });
}

/**
 * Hook to synthesize a multi-document practice quiz across a folder or selected notes.
 */
export function useSynthesizeQuiz() {
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async ({
      noteIds,
      folderId,
      title,
    }: {
      noteIds?: string[];
      folderId?: string;
      title?: string;
    }): Promise<Quiz> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...getLlmHeaders(),
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/study/synthesize/quiz`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          note_ids: noteIds,
          folder_id: folderId,
          title,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Failed to synthesize practice quiz");
      }

      return (await res.json()) as Quiz;
    },
  });
}
