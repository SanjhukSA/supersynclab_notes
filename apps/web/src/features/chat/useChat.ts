import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAppAuth } from "@/features/auth/AuthContext";
import { getLlmHeaders } from "@/lib/api";
import type { AnswerMode, Chat, ChatMessage } from "@/types";

const API_BASE = "/api/v1";

interface ChatListResponse {
  data: Chat[];
  count: number;
}

interface ChatDetailResponse {
  data: Chat;
  messages: ChatMessage[];
}

interface SendMessageResponse {
  message: ChatMessage;
  chat_id: string;
}

/**
 * Fetch all chat sessions owned by the current user.
 */
export function useChats() {
  const { getToken } = useAppAuth();

  return useQuery({
    queryKey: ["chats"],
    queryFn: async (): Promise<Chat[]> => {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/chats`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch chats: ${res.statusText}`);
      }
      const data = (await res.json()) as ChatListResponse;
      return data.data;
    },
  });
}

/**
 * Fetch a single chat with its full message history and citations.
 */
export function useChat(chatId: string | null) {
  const { getToken } = useAppAuth();

  return useQuery({
    queryKey: ["chat", chatId],
    queryFn: async (): Promise<ChatDetailResponse | null> => {
      if (!chatId) return null;
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/chats/${chatId}`, { headers });
      if (!res.ok) {
        throw new Error(`Failed to fetch chat details: ${res.statusText}`);
      }
      return (await res.json()) as ChatDetailResponse;
    },
    enabled: Boolean(chatId),
  });
}

/**
 * Mutation to create a new study chat session.
 */
export function useCreateChat() {
  const queryClient = useQueryClient();
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async (title?: string): Promise<Chat> => {
      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...getLlmHeaders(),
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/chats`, {
        method: "POST",
        headers,
        body: JSON.stringify({ title: title || "New Chat" }),
      });

      if (!res.ok) {
        throw new Error(`Failed to create chat: ${res.statusText}`);
      }
      return (await res.json()) as Chat;
    },
    onSuccess: (newChat) => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
      queryClient.setQueryData(["chat", newChat.id], {
        data: newChat,
        messages: [],
      });
    },
  });
}

/**
 * Mutation to send a message to the assistant (triggers RAG retrieval).
 */
export function useSendMessage(chatId: string | null) {
  const queryClient = useQueryClient();
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async ({
      content,
      mode = "hybrid",
      allowExternal = true,
      imageData = null,
      noteIds = null,
      folderId = null,
    }: {
      content: string;
      mode?: AnswerMode;
      allowExternal?: boolean;
      imageData?: string | null;
      noteIds?: string[] | null;
      folderId?: string | null;
    }): Promise<SendMessageResponse> => {
      if (!chatId) {
        throw new Error("Cannot send message without an active chat session.");
      }

      const token = await getToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...getLlmHeaders(),
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/chats/${chatId}/messages`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          content,
          mode,
          allow_external: allowExternal,
          image_data: imageData,
          note_ids: noteIds,
          folder_id: folderId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        const errorMsg =
          errorData?.detail?.message ||
          `Failed to send message: ${res.statusText}`;
        throw new Error(errorMsg);
      }

      return (await res.json()) as SendMessageResponse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chat", chatId] });
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}

/**
 * Mutation to delete a chat session.
 */
export function useDeleteChat() {
  const queryClient = useQueryClient();
  const { getToken } = useAppAuth();

  return useMutation({
    mutationFn: async (chatId: string): Promise<void> => {
      const token = await getToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch(`${API_BASE}/chats/${chatId}`, {
        method: "DELETE",
        headers,
      });

      if (!res.ok) {
        throw new Error(`Failed to delete chat: ${res.statusText}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["chats"] });
    },
  });
}
