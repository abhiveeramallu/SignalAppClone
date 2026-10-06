"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import type { Message, MessageStatusValue } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ConnectionState = "connecting" | "connected" | "reconnecting" | "disconnected" | "error";

interface WsErrorEvent {
  code: string;
  message: string;
}

export interface TypingUser {
  id: number;
  display_name: string;
}

/** One recipient's status changed — sent only to the message's sender, with
 *  the sender's recomputed aggregate (null only if the message vanished
 *  between the update and this computation, which shouldn't happen). */
export interface MessageStatusEvent {
  message_id: number;
  conversation_id: number;
  user_id: number;
  status: MessageStatusValue | null;
}

/**
 * Broadcast to the other participants when `user_id` marks messages read.
 * `statuses` gives each message's recomputed aggregate (keyed by message id
 * as a string, since JSON object keys always are) — a reader in a group
 * isn't necessarily the only other participant, so `message_ids` alone
 * isn't enough to assume every message is now fully "read".
 */
export interface MessagesReadEvent {
  conversation_id: number;
  user_id: number;
  message_ids: number[];
  statuses: Record<string, MessageStatusValue | null>;
}

export interface TypingEvent {
  conversation_id: number;
  user: TypingUser;
  is_typing: boolean;
}

/** Deliberately minimal — just enough to know which conversation to refetch
 * via REST (GET /conversations/{id} and GET /conversations), which stays the
 * one source of truth for membership. No member data is ever carried here. */
export interface GroupUpdatedEvent {
  conversation_id: number;
}

type Listener<T> = (payload: T) => void;

const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 15000;

/**
 * Transport-only WebSocket client: one connection, authenticate-first
 * handshake, bounded exponential-backoff reconnect. No React here — a
 * provider below wires it into component lifecycle.
 */
export class WebSocketClient {
  private socket: WebSocket | null = null;
  private token: string | null = null;
  private state: ConnectionState = "disconnected";
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = true;

  private stateListeners = new Set<Listener<ConnectionState>>();
  private messageListeners = new Set<Listener<Message>>();
  private errorListeners = new Set<Listener<WsErrorEvent>>();
  private reconnectedListeners = new Set<Listener<void>>();
  private messageStatusListeners = new Set<Listener<MessageStatusEvent>>();
  private messagesReadListeners = new Set<Listener<MessagesReadEvent>>();
  private typingListeners = new Set<Listener<TypingEvent>>();
  private groupUpdatedListeners = new Set<Listener<GroupUpdatedEvent>>();

  connect(token: string): void {
    if (this.token === token && !this.manuallyClosed) return; // already connecting/connected with this token
    this.manuallyClosed = false;
    this.token = token;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.socket?.close();
    this.open();
  }

  disconnect(): void {
    this.manuallyClosed = true;
    this.token = null;
    this.clearReconnectTimer();
    this.socket?.close();
    this.socket = null;
    this.setState("disconnected");
  }

  /** Returns false (and sends nothing) if not currently connected+authenticated. */
  send(event: Record<string, unknown>): boolean {
    if (this.state !== "connected" || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return false;
    }
    this.socket.send(JSON.stringify(event));
    return true;
  }

  getState(): ConnectionState {
    return this.state;
  }

  onStateChange(listener: Listener<ConnectionState>): () => void {
    this.stateListeners.add(listener);
    return () => this.stateListeners.delete(listener);
  }

  onMessage(listener: Listener<Message>): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onError(listener: Listener<WsErrorEvent>): () => void {
    this.errorListeners.add(listener);
    return () => this.errorListeners.delete(listener);
  }

  /** Fires after a RECONNECT succeeds (not the first connect) — callers use
   * this to refresh state via REST, since events may have been missed while down. */
  onReconnected(listener: Listener<void>): () => void {
    this.reconnectedListeners.add(listener);
    return () => this.reconnectedListeners.delete(listener);
  }

  /** A recipient's delivery status changed — fires on the SENDER's connection only. */
  onMessageStatus(listener: Listener<MessageStatusEvent>): () => void {
    this.messageStatusListeners.add(listener);
    return () => this.messageStatusListeners.delete(listener);
  }

  /** Someone marked one or more of your sent messages as read. */
  onMessagesRead(listener: Listener<MessagesReadEvent>): () => void {
    this.messagesReadListeners.add(listener);
    return () => this.messagesReadListeners.delete(listener);
  }

  onTyping(listener: Listener<TypingEvent>): () => void {
    this.typingListeners.add(listener);
    return () => this.typingListeners.delete(listener);
  }

  /** Group membership, roles, name, or avatar changed — refetch REST state
   * for this conversation (and the conversation list) rather than trusting
   * any data carried on the event itself (there isn't any). */
  onGroupUpdated(listener: Listener<GroupUpdatedEvent>): () => void {
    this.groupUpdatedListeners.add(listener);
    return () => this.groupUpdatedListeners.delete(listener);
  }

  private open(): void {
    if (!this.token) return;
    // Distinguishes the very first connection attempt from a retry after a
    // drop, so the UI can say "Reconnecting…" instead of reusing "Connecting…"
    // (which reads as if nothing was working before).
    this.setState(this.reconnectAttempt > 0 ? "reconnecting" : "connecting");

    // Token goes in the first message, never the URL — never logged, never
    // visible in network-request history.
    const url = `${API_URL.replace(/^http/, "ws")}/ws`;
    const socket = new WebSocket(url);
    this.socket = socket;
    const tokenForThisAttempt = this.token;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "authenticate", token: tokenForThisAttempt }));
    };

    socket.onmessage = (event) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      if (data.type === "authenticated") {
        const wasReconnect = this.reconnectAttempt > 0;
        this.reconnectAttempt = 0;
        this.setState("connected");
        if (wasReconnect) {
          this.reconnectedListeners.forEach((listener) => listener());
        }
      } else if (data.type === "new_message" && data.message) {
        const message = data.message as Message;
        this.messageListeners.forEach((listener) => listener(message));
      } else if (data.type === "message_status") {
        const event = data as unknown as MessageStatusEvent;
        this.messageStatusListeners.forEach((listener) => listener(event));
      } else if (data.type === "messages_read") {
        const event = data as unknown as MessagesReadEvent;
        this.messagesReadListeners.forEach((listener) => listener(event));
      } else if (data.type === "typing") {
        const event = data as unknown as TypingEvent;
        this.typingListeners.forEach((listener) => listener(event));
      } else if (data.type === "group_updated") {
        const event = data as unknown as GroupUpdatedEvent;
        this.groupUpdatedListeners.forEach((listener) => listener(event));
      } else if (data.type === "error") {
        const errorEvent: WsErrorEvent = {
          code: typeof data.code === "string" ? data.code : "UNKNOWN",
          message: typeof data.message === "string" ? data.message : "Something went wrong.",
        };
        this.errorListeners.forEach((listener) => listener(errorEvent));
      }
    };

    socket.onclose = () => {
      this.socket = null;
      if (this.manuallyClosed) {
        this.setState("disconnected");
        return;
      }
      this.setState("error");
      this.scheduleReconnect();
    };

    // onerror is followed by onclose — reconnect scheduling happens there.
    socket.onerror = () => {};
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed || !this.token) return;
    const delay = Math.min(RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_DELAY_MS);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      if (!this.manuallyClosed && this.token) this.open();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setState(state: ConnectionState): void {
    this.state = state;
    this.stateListeners.forEach((listener) => listener(state));
  }
}

interface WebSocketContextValue {
  client: WebSocketClient;
  state: ConnectionState;
}

const WebSocketContext = createContext<WebSocketContextValue | undefined>(undefined);

export function WebSocketProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  // Lazy useState initializer, not a ref — reading ref.current during render
  // is unsafe under concurrent rendering; useState guarantees the singleton
  // is created exactly once in a render-safe way.
  const [client] = useState(() => new WebSocketClient());

  const [state, setState] = useState<ConnectionState>("disconnected");

  useEffect(() => client.onStateChange(setState), [client]);

  useEffect(() => {
    if (token) {
      client.connect(token);
    } else {
      client.disconnect();
    }
  }, [client, token]);

  // Belt-and-suspenders: always disconnect if this provider itself unmounts
  // (e.g. whole app teardown), so no connection outlives the component tree.
  useEffect(() => () => client.disconnect(), [client]);

  return <WebSocketContext.Provider value={{ client, state }}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) throw new Error("useWebSocket must be used within WebSocketProvider");
  return ctx;
}
