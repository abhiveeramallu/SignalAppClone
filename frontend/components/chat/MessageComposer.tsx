"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
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
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 border-t border-neutral-200 bg-white px-4 py-3"
    >
      <button
        type="button"
        onClick={onAttachClick}
        aria-label="Attach file (not implemented)"
        className="shrink-0 rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M15.621 4.379a3 3 0 00-4.242 0l-7 7a3 3 0 004.241 4.243h.001l.497-.5a.75.75 0 011.064 1.057l-.498.501-.002.002a4.5 4.5 0 01-6.364-6.364l7-7a4.5 4.5 0 016.368 6.36l-3.455 3.553A2.625 2.625 0 119.52 9.52l3.45-3.451a.75.75 0 111.061 1.06l-3.45 3.451a1.125 1.125 0 001.587 1.595l3.454-3.553a3 3 0 000-4.242z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={disabled ? (connectionState && DISCONNECTED_PLACEHOLDER[connectionState]) || "Connecting…" : "Write a message"}
        rows={1}
        disabled={disabled}
        className="max-h-32 flex-1 resize-none overflow-y-auto rounded-full border border-neutral-300 bg-neutral-100 px-4 py-2 text-sm text-neutral-900 placeholder:text-neutral-500 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      />

      <button
        type="submit"
        disabled={!text.trim() || disabled}
        aria-label="Send message"
        className="shrink-0 rounded-full bg-blue-600 p-2.5 text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path d="M3.105 2.289a.75.75 0 00-.826.95l1.414 4.925A1.5 1.5 0 005.135 9.25h6.115a.75.75 0 010 1.5H5.135a1.5 1.5 0 00-1.442 1.086l-1.414 4.926a.75.75 0 00.826.95 28.896 28.896 0 0015.293-7.154.75.75 0 000-1.115A28.897 28.897 0 003.105 2.289z" />
        </svg>
      </button>
    </form>
  );
}
