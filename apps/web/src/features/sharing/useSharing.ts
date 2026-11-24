import { useMutation, useQuery } from "@tanstack/react-query";
import { useAppAuth } from "@/features/auth/AuthContext";
import type { ShareLinkResponse, SharedResource } from "@/types";

const API_BASE = "/api/v1/share";

/**
 * Generate or retrieve a public read-only share link.
 */
export function useCreateShareLink() {
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async ({
      resourceType,
      resourceId,
    }: {
      resourceType: "note" | "chat" | "folder";
      resourceId: string;
    }): Promise<ShareLinkResponse> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/links`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Failed to generate share link");
      }

      return (await res.json()) as ShareLinkResponse;
    },
  });
}

/**
 * Fetch a shared document or chat transcript via public token (no auth needed).
 */
export function usePublicSharedResource(token: string | null) {
  return useQuery({
    queryKey: ["publicShare", token],
    queryFn: async (): Promise<SharedResource | null> => {
      if (!token) return null;
      const res = await fetch(`${API_BASE}/public/${token}`);
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Share link expired or not found");
      }
      return (await res.json()) as SharedResource;
    },
    enabled: Boolean(token),
  });
}

/**
 * Grant direct access to another student by email.
 */
export function useCreateShareGrant() {
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async ({
      resourceType,
      resourceId,
      granteeEmail,
      role = "viewer",
    }: {
      resourceType: "note" | "chat" | "folder";
      resourceId: string;
      granteeEmail: string;
      role?: "viewer" | "editor";
    }) => {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/grants`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          resource_type: resourceType,
          resource_id: resourceId,
          grantee_email: granteeEmail,
          role,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.detail?.message || "Failed to share with student");
      }

      return await res.json();
    },
  });
}
