"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { AttachIcon, CloseIcon, FileIcon, SendIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { formatFileSize } from "@/lib/format";
import { isImageAttachment, validateFileForUpload } from "@/lib/attachments";
import type { ConnectionState } from "@/lib/ws";
import type { PendingAttachment } from "@/lib/types";

const TYPING_STOP_DELAY_MS = 1500;

const DISCONNECTED_PLACEHOLDER: Partial<Record<ConnectionState, string>> = {
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  error: "Offline — messages will send once reconnected",
  disconnected: "Offline — messages will send once reconnected",
};

interface MessageComposerProps {
  /** Returns false if the send could not be dispatched (e.g. not connected) —
   * the composer keeps the typed text/attachment in that case instead of
   * clearing it. `attachment` is the already-uploaded file's metadata. */
  onSend: (text: string, attachment?: PendingAttachment) => boolean;
  onUploadFile: (file: File) => Promise<PendingAttachment>;
  onTypingStart: () => void;
  onTypingStop: () => void;
  disabled?: boolean;
  connectionState?: ConnectionState;
}

export function MessageComposer({
  onSend,
  onUploadFile,
  onTypingStart,
  onTypingStop,
  disabled,
  connectionState,
}: MessageComposerProps) {
  const [text, setText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  function clearAttachment() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPendingFile(null);
    setPreviewUrl(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const error = validateFileForUpload(file);
    if (error) {
      setFileError(error);
      setPendingFile(null);
      setPreviewUrl(null);
      e.target.value = "";
      return;
    }
    setFileError(null);
    setPendingFile(file);
    setPreviewUrl(isImageAttachment(file.name, file.type) ? URL.createObjectURL(file) : null);
  }

  async function submit() {
    if (disabled || uploading) return;
    const trimmed = text.trim();

    if (pendingFile) {
      setUploading(true);
      setFileError(null);
      try {
        const attachment = await onUploadFile(pendingFile);
        const dispatched = onSend(trimmed, attachment);
        if (dispatched) {
          setText("");
          clearAttachment();
          stopTypingNow();
        }
      } catch {
        setFileError("Upload failed. Try again.");
      } finally {
        setUploading(false);
      }
      return;
    }

    if (!trimmed) return;
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
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // Intentionally run only on unmount — onTypingStop is stable enough for
    // this instance's lifetime (bound to one conversation via the `key` prop).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canSend = (Boolean(text.trim()) || Boolean(pendingFile)) && !disabled && !uploading;

  return (
    <div className="border-t border-border bg-background">
      {(pendingFile || fileError) && (
        <div className="flex items-center gap-3 px-4 pt-3">
          {fileError ? (
            <p className="flex-1 text-sm text-danger">{fileError}</p>
          ) : (
            pendingFile && (
              <div className="flex items-center gap-2 rounded-xl bg-muted px-3 py-2">
                {previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local object URL, not a remote image
                  <img src={previewUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
                    <FileIcon className="h-5 w-5" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block max-w-[14rem] truncate text-sm font-medium text-foreground">
                    {pendingFile.name}
                  </span>
                  <span className="block text-xs text-muted-foreground">{formatFileSize(pendingFile.size)}</span>
                </span>
                <button
                  type="button"
                  onClick={clearAttachment}
                  disabled={uploading}
                  aria-label="Remove attachment"
                  className="ml-1 shrink-0 rounded-full p-1 text-muted-foreground hover:bg-surface-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
            )
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 px-4 py-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.txt,.doc,.docx,.zip"
          onChange={handleFileSelected}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          aria-label="Attach file"
          title="Attach"
          className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-surface-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <AttachIcon className="h-5 w-5" />
        </button>

        <textarea
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? (connectionState && DISCONNECTED_PLACEHOLDER[connectionState]) || "Connecting…"
              : pendingFile
                ? "Add a caption (optional)"
                : "Write a message"
          }
          rows={1}
          disabled={disabled}
          className="max-h-32 flex-1 resize-none overflow-y-auto rounded-3xl border border-transparent bg-input px-4 py-2 text-[14.5px] text-input-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
        />

        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send message"
          className="shrink-0 rounded-full bg-primary p-2.5 text-primary-foreground transition-colors hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-40"
        >
          {uploading ? <Spinner className="h-5 w-5" /> : <SendIcon className="h-5 w-5" />}
        </button>
      </form>
    </div>
  );
}
