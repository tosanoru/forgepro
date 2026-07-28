"use client";

import useSWR from "swr";
import useSWRMutation from "swr/mutation";
import { useCallback } from "react";

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error("Fetch failed");
      return r.json();
    });

export interface Participant {
  userId: string;
  name: string | null;
  email: string;
  image: string | null;
  lastReadAt: string | null;
}

export interface ConversationSummary {
  id: string;
  subject: string | null;
  lastMessageAt: string;
  lastMessagePreview: string;
  unreadCount: number;
  participants: Participant[];
}

export interface Message {
  id: string;
  content: string;
  senderId: string;
  createdAt: string;
  sender: { name: string | null; email: string; image: string | null };
}

export interface ConversationDetail {
  id: string;
  subject: string | null;
  participants: Participant[];
  messages: Message[];
}

export function useConversations() {
  const { data, error, isLoading, mutate } = useSWR<ConversationSummary[]>(
    "/api/messaging/conversations",
    fetcher,
  );

  return {
    conversations: data ?? [],
    loading: isLoading,
    error,
    mutate,
  };
}

export function useConversation(id: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<ConversationDetail>(
    id ? `/api/messaging/conversations/${id}` : null,
    fetcher,
    { refreshInterval: 3000 },
  );

  return {
    conversation: data ?? null,
    loading: isLoading,
    error,
    mutate,
  };
}

export function useSendMessage(conversationId: string) {
  const { trigger, isMutating } = useSWRMutation(
    `/api/messaging/conversations/${conversationId}/messages`,
    async (url: string, { arg }: { arg: { content: string } }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(arg),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to send");
      return res.json();
    },
  );

  return { send: trigger, sending: isMutating };
}

export function useStartConversation() {
  const { trigger, isMutating } = useSWRMutation(
    "/api/messaging/conversations",
    async (url: string, { arg }: { arg: { participantIds: string[]; subject?: string } }) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(arg),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create");
      return res.json() as Promise<{ id: string }>;
    },
  );

  return { start: trigger, starting: isMutating };
}

export function useMarkRead(conversationId: string) {
  const { trigger } = useSWRMutation(
    `/api/messaging/conversations/${conversationId}/read`,
    async (url: string) => {
      const res = await fetch(url, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed to mark read");
    },
  );

  return { markRead: trigger };
}