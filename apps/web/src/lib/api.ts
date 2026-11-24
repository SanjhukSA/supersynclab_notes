/**
 * API client for the SuperNotes backend.
 *
 * All calls go through this module so we can attach the Clerk auth
 * token automatically and keep a single base URL config.
 */

const API_BASE = "/api/v1";

interface ApiError {
  code: string;
  message: string;
}

interface ApiErrorResponse {
  error: ApiError;
}

/**
 * Returns custom LLM provider headers saved in browser localStorage (BYOK).
 */
export function getLlmHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const provider = localStorage.getItem("supernotes_llm_provider");
    const key = localStorage.getItem("supernotes_llm_key");
    const model = localStorage.getItem("supernotes_llm_model");
    if (provider) headers["X-LLM-Provider"] = provider;
    if (key) headers["X-LLM-Key"] = key;
    if (model) headers["X-LLM-Model"] = model;
  } catch {
    // localStorage might be blocked or restricted
  }
  return headers;
}

/**
 * Make an authenticated API request.
 *
 * @param path   - Route path (e.g. "/health/me")
 * @param token  - Clerk session token from useAuth().getToken()
 * @param init   - Additional fetch options (method, body, etc.)
 */
export async function apiFetch<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...getLlmHeaders(),
    ...(init?.headers as Record<string, string> | undefined),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as ApiErrorResponse | null;
    const message = body?.error?.message ?? `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return response.json() as Promise<T>;
}
