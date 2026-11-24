import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppAuth } from "@/features/auth/AuthContext";
import type { Folder } from "@/types";

const API_BASE = "/api/v1";

interface FoldersResponse {
  data: Folder[];
  count: number;
}

interface FolderDetailResponse {
  data: Folder;
}

/**
 * Hook to fetch all user folders with note counts.
 */
export function useFolders() {
  const { getToken } = useAppAuth();

  return useQuery({
    queryKey: ["folders"],
    queryFn: async (): Promise<Folder[]> => {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/folders`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch folders: ${res.statusText}`);
      }
      const data = (await res.json()) as FoldersResponse;
      return data.data;
    },
  });
}

/**
 * Hook to create a new folder.
 */
export function useCreateFolder() {
  const queryClient = useQueryClient();
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async ({
      name,
      parentId,
    }: {
      name: string;
      parentId?: string | null;
    }): Promise<Folder> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/folders`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name, parent_id: parentId || null }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Failed to create folder");
      }

      const data = (await res.json()) as FolderDetailResponse;
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}

/**
 * Hook to rename or move a folder.
 */
export function useUpdateFolder() {
  const queryClient = useQueryClient();
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async ({
      folderId,
      name,
      parentId,
    }: {
      folderId: string;
      name?: string;
      parentId?: string | null;
    }): Promise<Folder> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (parentId !== undefined) body.parent_id = parentId;

      const res = await fetch(`${API_BASE}/folders/${folderId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Failed to update folder");
      }

      const data = (await res.json()) as FolderDetailResponse;
      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}

/**
 * Hook to delete a folder.
 */
export function useDeleteFolder() {
  const queryClient = useQueryClient();
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async (folderId: string): Promise<void> => {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/folders/${folderId}`, {
        method: "DELETE",
        headers,
      });

      if (!res.ok) {
        throw new Error(`Failed to delete folder: ${res.statusText}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["notes"] });
    },
  });
}
