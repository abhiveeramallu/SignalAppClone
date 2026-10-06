"use client";

import { useLayoutEffect, useRef } from "react";
import { MessageBubble } from "./MessageBubble";
import { Spinner } from "@/components/ui/Spinner";
import type { Message } from "@/lib/types";

const NEAR_TOP_THRESHOLD_PX = 100;
const NEAR_BOTTOM_THRESHOLD_PX = 150;

function dateLabel(iso: string, reference: Date = new Date()): string {
  const date = new Date(iso);
  if (date.toDateString() === reference.toDateString()) return "Today";

  const yesterday = new Date(reference);
  yesterday.setDate(reference.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";

  return date.toLocaleDateString([], {
    month: "long",
    day: "numeric",
    year: date.getFullYear() === reference.getFullYear() ? undefined : "numeric",
  });
}

interface MessageGroup {
  label: string;
  messages: Message[];
}

function groupByDay(messages: Message[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const message of messages) {
    const label = dateLabel(message.created_at);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === label) {
      lastGroup.messages.push(message);
    } else {
      groups.push({ label, messages: [message] });
    }
  }
  return groups;
}

interface MessageListProps {
  messages: Message[];
  isGroup: boolean;
  currentUserId: number;
  initialLoading: boolean;
  error: string | null;
  hasMore: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
}

export function MessageList({
  messages,
  isGroup,
  currentUserId,
  initialLoading,
  error,
  hasMore,
  loadingOlder,
  onLoadOlder,
}: MessageListProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);
  const prevCountRef = useRef(0);
  const prevFirstIdRef = useRef<number | null>(null);
  const isNearBottomRef = useRef(true);

  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD_PX;

    if (el.scrollTop < NEAR_TOP_THRESHOLD_PX && hasMore && !loadingOlder) {
      prevScrollHeightRef.current = el.scrollHeight;
      onLoadOlder();
    }
  }

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const firstId = messages[0]?.id ?? null;
    const wasPaginatingOlder = prevScrollHeightRef.current != null;

    if (wasPaginatingOlder && firstId !== prevFirstIdRef.current) {
      // Older messages were prepended — keep the user's visual position
      // fixed relative to what they were already looking at.
      const recordedHeight = prevScrollHeightRef.current as number;
      el.scrollTop = el.scrollHeight - recordedHeight + el.scrollTop;
      prevScrollHeightRef.current = null;
    } else if (prevCountRef.current === 0 && messages.length > 0) {
      // Conversation just opened — jump straight to the newest message.
      bottomRef.current?.scrollIntoView({ block: "end" });
    } else if (messages.length > prevCountRef.current && isNearBottomRef.current) {
      // A message was appended at the bottom (sent or received) and the
      // user was already near the bottom — follow it down. If they'd
      // scrolled up to read history, leave them where they are.
      bottomRef.current?.scrollIntoView({ block: "end" });
    }

    prevCountRef.current = messages.length;
    prevFirstIdRef.current = firstId;
  }, [messages]);

  if (initialLoading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-neutral-50">
        <Spinner className="h-5 w-5 text-neutral-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center bg-neutral-50 px-6 text-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center bg-neutral-50 px-6 text-center text-sm text-neutral-500">
        No messages yet. Say hello!
      </div>
    );
  }

  const groups = groupByDay(messages);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 space-y-4 overflow-y-auto bg-neutral-50 px-4 py-4 sm:px-6"
    >
      {hasMore && (
        <div className="flex justify-center py-1">
          {loadingOlder ? (
            <Spinner className="h-4 w-4 text-neutral-400" />
          ) : (
            <span className="text-xs text-neutral-400">Scroll up for earlier messages</span>
          )}
        </div>
      )}
      {groups.map((group) => (
        <div key={group.label} className="space-y-1.5">
          <div className="flex justify-center py-1">
            <span className="rounded-full bg-neutral-200/70 px-3 py-1 text-xs font-medium text-neutral-600">
              {group.label}
            </span>
          </div>
          {group.messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              currentUserId={currentUserId}
              showSenderName={isGroup && message.sender.id !== currentUserId}
            />
          ))}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
