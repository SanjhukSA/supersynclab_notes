import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppAuth } from "@/features/auth/AuthContext";
import type {
  GoogleClassroomCourse,
  GoogleClassroomMaterial,
  GoogleConnectionStatus,
  GoogleDriveBrowseResponse,
  GoogleImportItem,
  GoogleImportResponse,
} from "@/types";

const API_BASE = "/api/v1/integrations/google";
const GOOGLE_TOKEN_STORAGE_KEY = "supernotes_google_access_token";

export function getStoredGoogleToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(GOOGLE_TOKEN_STORAGE_KEY);
}

export function setStoredGoogleToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    localStorage.setItem(GOOGLE_TOKEN_STORAGE_KEY, token.trim());
  } else {
    localStorage.removeItem(GOOGLE_TOKEN_STORAGE_KEY);
  }
}

export function useGoogleStatus(googleAccessToken?: string | null) {
  const { getToken } = useAppAuth();

  return useQuery({
    queryKey: ["googleStatus", googleAccessToken],
    queryFn: async (): Promise<GoogleConnectionStatus> => {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (googleAccessToken) headers["X-Google-Access-Token"] = googleAccessToken;

      const res = await fetch(`${API_BASE}/status`, { headers });
      if (!res.ok) throw new Error("Failed to load Google status");
      return (await res.json()) as GoogleConnectionStatus;
    },
  });
}

export function useBrowseGoogleDrive(
  folderId: string = "root",
  searchQuery?: string,
  googleAccessToken?: string | null
) {
  const { getToken } = useAppAuth();

  return useQuery({
    queryKey: ["googleDriveBrowse", folderId, searchQuery, googleAccessToken],
    queryFn: async (): Promise<GoogleDriveBrowseResponse> => {
      if (!googleAccessToken) {
        throw new Error("Google access token required to browse Drive");
      }
      const token = await getToken();
      const headers: Record<string, string> = {
        "X-Google-Access-Token": googleAccessToken,
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const params = new URLSearchParams({ folder_id: folderId });
      if (searchQuery && searchQuery.trim()) {
        params.set("query", searchQuery.trim());
      }

      const res = await fetch(`${API_BASE}/drive/browse?${params.toString()}`, {
        headers,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Failed to browse Google Drive");
      }
      return (await res.json()) as GoogleDriveBrowseResponse;
    },
    enabled: Boolean(googleAccessToken),
  });
}

export function useGoogleClassroomCourses(googleAccessToken?: string | null) {
  const { getToken } = useAppAuth();

  return useQuery({
    queryKey: ["googleClassroomCourses", googleAccessToken],
    queryFn: async (): Promise<GoogleClassroomCourse[]> => {
      if (!googleAccessToken) return [];
      const token = await getToken();
      const headers: Record<string, string> = {
        "X-Google-Access-Token": googleAccessToken,
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`${API_BASE}/classroom/courses`, { headers });
      if (!res.ok) throw new Error("Failed to load Classroom courses");
      return (await res.json()) as GoogleClassroomCourse[];
    },
    enabled: Boolean(googleAccessToken),
  });
}

export function useGoogleClassroomMaterials(
  courseId: string | null,
  googleAccessToken?: string | null
) {
  const { getToken } = useAppAuth();

  return useQuery({
    queryKey: ["googleClassroomMaterials", courseId, googleAccessToken],
    queryFn: async (): Promise<GoogleClassroomMaterial[]> => {
      if (!courseId || !googleAccessToken) return [];
      const token = await getToken();
      const headers: Record<string, string> = {
        "X-Google-Access-Token": googleAccessToken,
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(
        `${API_BASE}/classroom/courses/${courseId}/materials`,
        { headers }
      );
      if (!res.ok) throw new Error("Failed to load course materials");
      return (await res.json()) as GoogleClassroomMaterial[];
    },
    enabled: Boolean(courseId && googleAccessToken),
  });
}

export function useImportGoogleMaterials() {
  const queryClient = useQueryClient();
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async ({
      items,
      folderId,
      accessToken,
      createSubfolder,
      subfolderName,
    }: {
      items: GoogleImportItem[];
      folderId?: string | null;
      accessToken?: string | null;
      createSubfolder?: boolean;
      subfolderName?: string | null;
    }): Promise<GoogleImportResponse> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      if (accessToken) headers["X-Google-Access-Token"] = accessToken;

      const res = await fetch(`${API_BASE}/import`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          items,
          folder_id: folderId,
          access_token: accessToken,
          create_subfolder: createSubfolder,
          subfolder_name: subfolderName,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Failed to import materials");
      }

      return (await res.json()) as GoogleImportResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes"] });
      queryClient.invalidateQueries({ queryKey: ["folders"] });
    },
  });
}
