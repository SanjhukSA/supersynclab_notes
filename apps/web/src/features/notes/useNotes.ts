import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppAuth } from "@/features/auth/AuthContext";
import type { Note } from "@/types";

const API_BASE = "/api/v1";

interface NotesResponse {
  data: Note[];
  count: number;
}

interface UploadNoteResponse {
  message: string;
  data: Note;
}

export interface NotePageItem {
  id: string;
  note_id: string;
  page_number: number;
  image_path: string | null;
  created_at: string;
}

interface PagesResponse {
  data: NotePageItem[];
  count: number;
}

/**
 * Hook to fetch all notes belonging to the current user.
 * Automatically polls every 2 seconds if any note is pending or processing.
 */
export function useNotes() {
  const { getToken } = useAppAuth();

  return useQuery({
    queryKey: ["notes"],
    queryFn: async (): Promise<Note[]> => {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/notes`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch notes: ${res.statusText}`);
      }
      const data = (await res.json()) as NotesResponse;
      return data.data;
    },
    // Auto-poll if any note is still processing or pending
    refetchInterval: (query) => {
      const data = query.state.data;
      const isAnyProcessing = data?.some(
        (n) => n.status === "pending" || n.status === "processing",
      );
      return isAnyProcessing ? 2000 : false;
    },
  });
}

/**
 * Hook to trigger/retry ingestion processing for a note.
 */
export function useProcessNote() {
  const queryClient = useQueryClient();
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async (noteId: string): Promise<void> => {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/notes/${noteId}/process`, {
        method: "POST",
        headers,
      });

      if (!res.ok) {
        throw new Error(`Failed to process note: ${res.statusText}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

/**
 * Hook to fetch rendered pages for a note.
 */
export function useNotePages(noteId: string | null) {
  const { getToken } = useAppAuth();

  return useQuery({
    queryKey: ["note-pages", noteId],
    queryFn: async (): Promise<NotePageItem[]> => {
      if (!noteId) return [];
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/notes/${noteId}/pages`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch pages: ${res.statusText}`);
      }
      const data = (await res.json()) as PagesResponse;
      return data.data;
    },
    enabled: Boolean(noteId),
  });
}

/**
 * Hook to upload a new study note file (PDF, IMG, TXT).
 */
export function useUploadNote() {
  const queryClient = useQueryClient();
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async (
      payload: File | { file: File; folderId?: string | null },
    ): Promise<Note> => {
      const file = payload instanceof File ? payload : payload.file;
      const folderId = payload instanceof File ? null : payload.folderId;

      const token = await getToken();
      const formData = new FormData();
      formData.append("file", file);
      if (folderId) {
        formData.append("folder_id", folderId);
      }

      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/notes/upload`, {
        method: "POST",
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const message =
          errorData?.detail?.message ||
          errorData?.message ||
          `Upload failed (${res.status})`;
        throw new Error(message);
      }

      const data = (await res.json()) as UploadNoteResponse;
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}

/**
 * Hook to update note metadata or assign to folder.
 */
export function useUpdateNote() {
  const queryClient = useQueryClient();
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async ({
      noteId,
      folderId,
      title,
      subject,
    }: {
      noteId: string;
      folderId?: string | null;
      title?: string;
      subject?: string;
    }): Promise<Note> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const body: Record<string, unknown> = {};
      if (folderId !== undefined) body.folder_id = folderId;
      if (title !== undefined) body.title = title;
      if (subject !== undefined) body.subject = subject;

      const res = await fetch(`${API_BASE}/notes/${noteId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Failed to update note");
      }

      const data = (await res.json()) as { data: Note };
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}

/**
 * Hook to delete a note.
 */
export function useDeleteNote() {
  const queryClient = useQueryClient();
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async (noteId: string): Promise<void> => {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/notes/${noteId}`, {
        method: "DELETE",
        headers,
      });

      if (!res.ok) {
        throw new Error(`Failed to delete note: ${res.statusText}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}
