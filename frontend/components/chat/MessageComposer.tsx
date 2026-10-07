"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AttachIcon, SendIcon } from "@/components/ui/icons";
import type { ConnectionState } from "@/lib/ws";

const TYPING_STOP_DELAY_MS = 1500;

const DISCONNECTED_PLACEHOLDER: Partial<Record<ConnectionState, string>> = {
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  error: "Offline — messages will send once reconnected",
  disconnected: "Offline — messages will send once reconnected",
};

interface MessageComposerProps {
  /** Returns false if the send could not be dispatched (e.g. not connected) —
   * the composer keeps the typed text in that case instead of clearing it. */
  onSend: (text: string) => boolean;
  onAttachClick: () => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  disabled?: boolean;
  connectionState?: ConnectionState;
}

export function MessageComposer({
  onSend,
  onAttachClick,
  onTypingStart,
  onTypingStop,
  disabled,
  connectionState,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const isTypingRef = useRef(false);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearStopTimer() {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
  }

  function stopTypingNow() {
    clearStopTimer();
    if (isTypingRef.current) {
      isTypingRef.current = false;
      onTypingStop();
    }
  }

  function handleChange(value: string) {
    setText(value);

    if (!value.trim()) {
      stopTypingNow();
      return;
    }

    // First keystroke of a burst -> typing_start. Every keystroke after that
    // just resets the "stop" timer rather than sending typing_start again.
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTypingStart();
    }
    clearStopTimer();
    stopTimerRef.current = setTimeout(stopTypingNow, TYPING_STOP_DELAY_MS);
  }

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    const dispatched = onSend(trimmed);
    if (dispatched) {
      setText("");
      stopTypingNow();
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  // Covers switching away from this conversation (MainChatArea remounts this
  // component with a new `key` per conversation) and unmounting entirely —
  // either way, a typing_stop goes out for whichever conversation this
  // instance was bound to, if it was mid-typing.
  useEffect(() => {
    return () => {
      clearStopTimer();
      if (isTypingRef.current) onTypingStop();
    };
    // Intentionally run only on unmount — onTypingStop is stable enough for
    // this instance's lifetime (bound to one conversation via the `key` prop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border bg-background px-4 py-3">
      <button
        type="button"
        onClick={onAttachClick}
        aria-label="Attach file (not implemented)"
        title="Attach"
        className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-surface-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <AttachIcon className="h-5 w-5" />
      </button>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? (connectionState && DISCONNECTED_PLACEHOLDER[connectionState]) || "Connecting…" : "Write a message"}
        rows={1}
        disabled={disabled}
        className="max-h-32 flex-1 resize-none overflow-y-auto rounded-3xl border border-transparent bg-input px-4 py-2 text-[14.5px] text-input-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
      />

      <button
        type="submit"
        disabled={!text.trim() || disabled}
        aria-label="Send message"
        className="shrink-0 rounded-full bg-primary p-2.5 text-primary-foreground transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40"
      >
        <SendIcon className="h-5 w-5" />
      </button>
    </form>
  );
}
