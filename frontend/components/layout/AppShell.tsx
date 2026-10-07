"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { MainChatArea } from "@/components/layout/MainChatArea";
import { Toast } from "@/components/ui/Toast";
import { NewConversationModal } from "@/components/contacts/NewConversationModal";
import { GroupDetailsModal } from "@/components/chat/GroupDetailsModal";
import { useAuth } from "@/lib/auth-context";
import { useWebSocket, type TypingUser } from "@/lib/ws";
import { api, ApiError } from "@/lib/api";
import type { ConversationPreview, Message, PendingAttachment } from "@/lib/types";

interface MessageThreadState {
  messages: Message[]; // oldest -> newest
  hasMore: boolean;
  nextCursor: number | null;
  initialLoading: boolean;
  loadingOlder: boolean;
  error: string | null;
  loaded: boolean;
}

const EMPTY_THREAD: MessageThreadState = {
  messages: [],
  hasMore: false,
  nextCursor: null,
  initialLoading: false,
  loadingOlder: false,
  error: null,
  loaded: false,
};

const TYPING_EXPIRE_MS = 3000;

/** Combine two message lists into one, newest-consistent and duplicate-free —
 * used when a REST refresh (after reconnect) needs to merge with whatever
 * already arrived locally via WebSocket in the meantime. */
function mergeById(existing: Message[], incoming: Message[]): Message[] {
  const byId = new Map<number, Message>();
  for (const m of existing) byId.set(m.id, m);
  for (const m of incoming) byId.set(m.id, m);
  return Array.from(byId.values()).sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id - b.id;
  });
}

export function AppShell() {
  const { token, currentUser } = useAuth();
  const { client, state: wsState } = useWebSocket();

  const [conversations, setConversations] = useState<ConversationPreview[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [groupDetailsOpen, setGroupDetailsOpen] = useState(false);

  const [messagesByConversation, setMessagesByConversation] = useState<Record<number, MessageThreadState>>({});
  const [typingByConversation, setTypingByConversation] = useState<Record<number, TypingUser[]>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Long-lived WebSocket subscriptions read these refs instead of closing
  // over state directly, so they always see the latest value without
  // needing to resubscribe on every change (which would be wasteful and
  // risks missing an event during the brief resubscribe window).
  const selectedIdRef = useRef<number | null>(null);
  const currentUserIdRef = useRef<number | null>(null);
  const messagesByConversationRef = useRef(messagesByConversation);
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);
  useEffect(() => {
    currentUserIdRef.current = currentUser?.id ?? null;
  }, [currentUser]);
  useEffect(() => {
    messagesByConversationRef.current = messagesByConversation;
  }, [messagesByConversation]);

  const showToast = useCallback((message: string) => setToastMessage(message), []);
  useEffect(() => {
    if (!toastMessage) return;
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, [toastMessage]);

  const loadConversations = useCallback(() => {
    if (!token) return;
    // No synchronous setConversationsLoading(true) here: the initial load is
    // already covered by useState(true) above, and a reconnect-triggered
    // refresh should update the list quietly in the background rather than
    // flash a loading spinner over data that's already on screen.
    api
      .getConversations(token)
      .then((data) => {
        setConversations(data);
        setConversationsError(null);

        // The only way a conversation this client already knew about can
        // vanish from this list is group removal (no leave/delete feature
        // exists) — so if the currently-open one is gone, we were removed.
        // Don't leave the user staring at a now-inaccessible chat (Part O).
        const activeId = selectedIdRef.current;
        if (activeId != null && !data.some((c) => c.id === activeId)) {
          setSelectedId(null);
          setMobileView("list");
          setGroupDetailsOpen(false);
          showToast("You're no longer a member of that group.");
        }
      })
      .catch((err) => {
        setConversationsError(err instanceof ApiError ? err.message : "Failed to load conversations.");
      })
      .finally(() => setConversationsLoading(false));
  }, [token, showToast]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Delivery acks for messages picked up via REST (initial load, reconnect
  // refresh, or older-page pagination) rather than a live new_message push —
  // otherwise a message sent while this user was fully offline would stay
  // "sent" forever, since the live-push ack path in the onMessage handler
  // below never sees it.
  const ackDeliveredMessages = useCallback(
    (messages: Message[]) => {
      const myId = currentUserIdRef.current;
      for (const message of messages) {
        if (message.sender.id !== myId && message.status === "sent") {
          client.send({ type: "message_delivered", message_id: message.id });
        }
      }
    },
    [client],
  );

  const loadMessages = useCallback(
    (conversationId: number, mode: "initial" | "refresh") => {
      if (!token) return;
      // Deferred behind a microtask boundary (rather than a bare setState at
      // the top of this function) so nothing here runs synchronously when
      // called from an effect — the marker update and the fetch are both
      // async-chained instead.
      Promise.resolve()
        .then(() => {
          setMessagesByConversation((prev) => ({
            ...prev,
            [conversationId]: {
              ...(prev[conversationId] ?? EMPTY_THREAD),
              initialLoading: mode === "initial",
              error: null,
            },
          }));
          return api.getMessages(token, conversationId, { limit: 50 });
        })
        .then((page) => {
          setMessagesByConversation((prev) => {
            const current = prev[conversationId] ?? EMPTY_THREAD;
            // On a reconnect-triggered refresh, merge rather than replace —
            // a message that arrived over the WebSocket just before this
            // REST response lands must not be lost or duplicated.
            const messages = mode === "refresh" ? mergeById(current.messages, page.messages) : page.messages;
            return {
              ...prev,
              [conversationId]: {
                messages,
                hasMore: page.has_more,
                nextCursor: page.next_cursor,
                initialLoading: false,
                loadingOlder: false,
                error: null,
                loaded: true,
              },
            };
          });
          ackDeliveredMessages(page.messages);
        })
        .catch((err) => {
          setMessagesByConversation((prev) => ({
            ...prev,
            [conversationId]: {
              ...(prev[conversationId] ?? EMPTY_THREAD),
              initialLoading: false,
              error: err instanceof ApiError ? err.message : "Failed to load messages.",
            },
          }));
        });
    },
    [token, ackDeliveredMessages],
  );

  // Load a conversation's history the first time it's selected (cached after that).
  useEffect(() => {
    if (selectedId == null) return;
    const existing = messagesByConversationRef.current[selectedId];
    if (existing?.loaded || existing?.initialLoading) return;
    loadMessages(selectedId, "initial");
  }, [selectedId, loadMessages]);

  const loadOlderMessages = useCallback(
    (conversationId: number) => {
      const thread = messagesByConversationRef.current[conversationId];
      if (!token || !thread || !thread.hasMore || thread.loadingOlder || thread.nextCursor == null) return;
      setMessagesByConversation((prev) => ({
        ...prev,
        [conversationId]: { ...prev[conversationId], loadingOlder: true },
      }));
      api
        .getMessages(token, conversationId, { limit: 50, beforeId: thread.nextCursor })
        .then((page) => {
          setMessagesByConversation((prev) => {
            const current = prev[conversationId];
            const existingIds = new Set(current.messages.map((m) => m.id));
            const olderOnly = page.messages.filter((m) => !existingIds.has(m.id));
            return {
              ...prev,
              [conversationId]: {
                ...current,
                messages: [...olderOnly, ...current.messages],
                hasMore: page.has_more,
                nextCursor: page.next_cursor,
                loadingOlder: false,
              },
            };
          });
          ackDeliveredMessages(page.messages);
        })
        .catch(() => {
          setMessagesByConversation((prev) => ({
            ...prev,
            [conversationId]: { ...prev[conversationId], loadingOlder: false },
          }));
        });
    },
    [token, ackDeliveredMessages],
  );

  const markRead = useCallback(
    (conversationId: number) => {
      client.send({ type: "mark_read", conversation_id: conversationId });
    },
    [client],
  );

  // Real-time incoming messages — the sender gets this event too, so the
  // same code path handles "my message was just confirmed" and "someone
  // else sent me a message."
  useEffect(() => {
    return client.onMessage((message) => {
      const activeId = selectedIdRef.current;
      const myId = currentUserIdRef.current;
      const isOwnMessage = message.sender.id === myId;
      const isActive = message.conversation_id === activeId;

      setMessagesByConversation((prev) => {
        const thread = prev[message.conversation_id];
        if (!thread?.loaded) return prev; // its own REST load will already include this message
        if (thread.messages.some((m) => m.id === message.id)) return prev; // de-dupe
        return {
          ...prev,
          [message.conversation_id]: { ...thread, messages: [...thread.messages, message] },
        };
      });

      setConversations((prev) => {
        const index = prev.findIndex((c) => c.id === message.conversation_id);
        if (index === -1) {
          // A conversation we don't know about yet (someone just started one
          // with us) — fetch the authoritative list instead of guessing a
          // preview from a bare message event.
          loadConversations();
          return prev;
        }
        const current = prev[index];
        const updated: ConversationPreview = {
          ...current,
          last_message: {
            content: message.content,
            message_type: message.message_type,
            attachment_filename: message.attachment_filename,
            created_at: message.created_at,
          },
          unread_count: isActive || isOwnMessage ? current.unread_count : current.unread_count + 1,
        };
        return [updated, ...prev.slice(0, index), ...prev.slice(index + 1)];
      });

      // "Delivered" is an explicit client acknowledgement, never inferred
      // from the broadcast merely having been sent — only a genuine
      // recipient acks, never the sender for their own message.
      if (!isOwnMessage) {
        client.send({ type: "message_delivered", message_id: message.id });
        // Already viewing this conversation when the message arrives — treat
        // it as read immediately rather than waiting for a separate action.
        if (isActive) markRead(message.conversation_id);
      }
    });
  }, [client, loadConversations, markRead]);

  // A recipient's delivery status changed (sent -> delivered). Only ever
  // received on the sender's own connection.
  useEffect(() => {
    return client.onMessageStatus(({ message_id, conversation_id, status }) => {
      if (!status) return; // defensive: the message was found when this fired, so this shouldn't happen
      setMessagesByConversation((prev) => {
        const thread = prev[conversation_id];
        if (!thread?.loaded) return prev;
        return {
          ...prev,
          [conversation_id]: {
            ...thread,
            messages: thread.messages.map((m) => (m.id === message_id ? { ...m, status } : m)),
          },
        };
      });
    });
  }, [client]);

  // Someone marked messages read in this conversation. In a group, the
  // reader isn't necessarily the only other participant, so this can
  // name messages we didn't send too — those aren't ours to reinterpret
  // here: our own view of an incoming message is governed by our own
  // read state, not by learning that a third party read it. Only apply
  // `statuses` to messages where we're the sender, using each message's
  // own recomputed aggregate rather than assuming blanket "read".
  useEffect(() => {
    return client.onMessagesRead(({ conversation_id, message_ids, statuses }) => {
      const myId = currentUserIdRef.current;
      const idSet = new Set(message_ids);
      setMessagesByConversation((prev) => {
        const thread = prev[conversation_id];
        if (!thread?.loaded) return prev;
        return {
          ...prev,
          [conversation_id]: {
            ...thread,
            messages: thread.messages.map((m) => {
              if (!idSet.has(m.id) || m.sender.id !== myId) return m;
              const status = statuses[String(m.id)];
              return status ? { ...m, status } : m;
            }),
          },
        };
      });
    });
  }, [client]);

  // Typing indicators — ephemeral, per-conversation set of currently-typing
  // users, with a client-side expiry in case a typing_stop is ever lost.
  useEffect(() => {
    return client.onTyping(({ conversation_id, user, is_typing }) => {
      const key = `${conversation_id}:${user.id}`;
      const existingTimer = typingTimersRef.current.get(key);
      if (existingTimer) clearTimeout(existingTimer);
      typingTimersRef.current.delete(key);

      setTypingByConversation((prev) => {
        const current = prev[conversation_id] ?? [];
        if (is_typing) {
          if (current.some((u) => u.id === user.id)) return prev;
          return { ...prev, [conversation_id]: [...current, user] };
        }
        if (!current.some((u) => u.id === user.id)) return prev;
        return { ...prev, [conversation_id]: current.filter((u) => u.id !== user.id) };
      });

      if (is_typing) {
        const timer = setTimeout(() => {
          typingTimersRef.current.delete(key);
          setTypingByConversation((prev) => ({
            ...prev,
            [conversation_id]: (prev[conversation_id] ?? []).filter((u) => u.id !== user.id),
          }));
        }, TYPING_EXPIRE_MS);
        typingTimersRef.current.set(key, timer);
      }
    });
  }, [client]);

  // Group membership/role/name/avatar changed somewhere. The conversation
  // list is the one source of truth for "am I still a member" (handled
  // inside loadConversations above) — this effect just makes sure that
  // refetch actually happens whenever such a change occurs, even if no
  // group-details panel is open to trigger it itself.
  useEffect(() => {
    return client.onGroupUpdated(() => loadConversations());
  }, [client, loadConversations]);

  useEffect(() => {
    return client.onError(({ message }) => showToast(message));
  }, [client, showToast]);

  // REST is the source of truth: after a reconnect, re-sync explicitly
  // rather than assume no events were missed while the socket was down.
  // Typing state is purely ephemeral and never survives a reconnect either —
  // any mid-air typing_stop from before the drop is simply gone.
  useEffect(() => {
    return client.onReconnected(() => {
      loadConversations();
      const activeId = selectedIdRef.current;
      if (activeId != null) {
        loadMessages(activeId, "refresh");
        // Still actively viewing this conversation — re-send mark_read too,
        // the same as "user returns to the tab while it's active."
        markRead(activeId);
      }

      typingTimersRef.current.forEach((timer) => clearTimeout(timer));
      typingTimersRef.current.clear();
      setTypingByConversation({});
    });
  }, [client, loadConversations, loadMessages, markRead]);

  function handleSelect(id: number) {
    setSelectedId(id);
    setMobileView("chat");
    // Optimistic local clear for instant feedback; the real source of truth
    // is the backend update triggered by markRead below, which is what
    // actually makes this value correct again after a refresh.
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)));
    markRead(id);
  }

  function handleConversationReady(conversation: ConversationPreview) {
    setConversations((prev) => {
      const exists = prev.some((c) => c.id === conversation.id);
      if (exists) return prev.map((c) => (c.id === conversation.id ? conversation : c));
      return [conversation, ...prev];
    });
    setSelectedId(conversation.id);
    setMobileView("chat");
  }

  function handleSend(text: string, attachment?: PendingAttachment): boolean {
    if (selectedId == null) return false;
    const dispatched = client.send({
      type: "send_message",
      conversation_id: selectedId,
      content: text,
      ...(attachment && {
        message_type: "file",
        attachment_filename: attachment.attachment_filename,
        attachment_path: attachment.attachment_path,
        attachment_mime_type: attachment.attachment_mime_type,
        attachment_size: attachment.attachment_size,
      }),
    });
    if (!dispatched) {
      showToast("Not connected — try again in a moment.");
    }
    return dispatched;
  }

  async function handleUploadFile(file: File): Promise<PendingAttachment> {
    if (!token) throw new Error("Not authenticated");
    return api.uploadFile(token, file);
  }

  function handleTypingStart(conversationId: number) {
    client.send({ type: "typing_start", conversation_id: conversationId });
  }

  function handleTypingStop(conversationId: number) {
    client.send({ type: "typing_stop", conversation_id: conversationId });
  }

  function handleGroupRenamed(conversationId: number, name: string) {
    setConversations((prev) => prev.map((c) => (c.id === conversationId ? { ...c, name } : c)));
  }

  function handleSelfRemoved(conversationId: number) {
    setGroupDetailsOpen(false);
    if (selectedIdRef.current === conversationId) {
      setSelectedId(null);
      setMobileView("list");
    }
    loadConversations();
    showToast("You removed yourself from the group.");
  }

  if (!currentUser) return null;

  const selectedConversation = conversations.find((c) => c.id === selectedId) ?? null;
  const thread = selectedId != null ? (messagesByConversation[selectedId] ?? EMPTY_THREAD) : EMPTY_THREAD;
  const typingUsers = selectedId != null ? (typingByConversation[selectedId] ?? []) : [];

  return (
    <>
      <Sidebar
        conversations={conversations}
        conversationsLoading={conversationsLoading}
        conversationsError={conversationsError}
        selectedId={selectedId}
        onSelect={handleSelect}
        onNewConversation={() => setNewConversationOpen(true)}
        connectionState={wsState}
        hidden={mobileView === "chat"}
      />
      <MainChatArea
        conversation={selectedConversation}
        currentUserId={currentUser.id}
        messages={thread.messages}
        messagesInitialLoading={thread.initialLoading}
        messagesError={thread.error}
        hasMoreMessages={thread.hasMore}
        loadingOlderMessages={thread.loadingOlder}
        onLoadOlderMessages={() => selectedId != null && loadOlderMessages(selectedId)}
        typingUsers={typingUsers}
        onTypingStart={() => selectedId != null && handleTypingStart(selectedId)}
        onTypingStop={() => selectedId != null && handleTypingStop(selectedId)}
        onSend={handleSend}
        onUploadFile={handleUploadFile}
        composerDisabled={wsState !== "connected"}
        connectionState={wsState}
        onBack={() => setMobileView("list")}
        onNotImplemented={(feature) => showToast(`${feature}: not available yet.`)}
        onOpenGroupDetails={() => setGroupDetailsOpen(true)}
        hidden={mobileView === "list"}
      />
      {toastMessage && <Toast message={toastMessage} />}
      <NewConversationModal
        open={newConversationOpen}
        onClose={() => setNewConversationOpen(false)}
        onConversationReady={handleConversationReady}
        onToast={showToast}
      />
      {selectedConversation && selectedConversation.type === "group" && (
        <GroupDetailsModal
          open={groupDetailsOpen}
          conversationId={selectedConversation.id}
          currentUserId={currentUser.id}
          onClose={() => setGroupDetailsOpen(false)}
          onRenamed={handleGroupRenamed}
          onSelfRemoved={handleSelfRemoved}
          onToast={showToast}
        />
      )}
    </>
  );
}
