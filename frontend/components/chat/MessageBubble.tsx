"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";
import { formatFileSize, formatMessageTime } from "@/lib/format";
import { isImageAttachment } from "@/lib/attachments";
import { FileIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import type { Message, MessageStatusValue } from "@/lib/types";

function SingleCheck({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-3.5 w-3.5 ${className}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DoubleCheck({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-3.5 w-3.5 ${className}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M1 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 8.5l3 3 7-7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const STATUS_LABEL: Record<MessageStatusValue, string> = {
  sent: "Sent",
  delivered: "Delivered",
  read: "Read",
};

/** Lazily fetches the attachment bytes (an authenticated request — a plain
 * <img>/<a> can't carry the bearer token) and renders an inline preview for
 * images or a file card with a download action for everything else. */
function Attachment({ message, isOutgoing }: { message: Message; isOutgoing: boolean }) {
  const { token } = useAuth();
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const isImage = isImageAttachment(message.attachment_filename ?? "", message.attachment_mime_type);

  useEffect(() => {
    if (!isImage || !token) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    api
      .fetchAttachmentBlob(token, message.id)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isImage, token, message.id]);

  async function handleDownload() {
    if (!token || downloading) return;
    setDownloading(true);
    try {
      const blob = await api.fetchAttachmentBlob(token, message.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = message.attachment_filename ?? "download";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError(true);
    } finally {
      setDownloading(false);
    }
  }

  if (isImage) {
    return (
      <button
        type="button"
        onClick={handleDownload}
        disabled={!blobUrl}
        className="block max-w-full overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        title={message.attachment_filename ?? undefined}
      >
        {blobUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated blob URL, not a static asset
          <img src={blobUrl} alt={message.attachment_filename ?? "Image attachment"} className="max-h-72 w-full object-cover" />
        ) : (
          <span className="flex h-40 w-56 max-w-full items-center justify-center bg-black/10">
            {error ? (
              <span className="text-xs text-danger">Couldn&apos;t load image</span>
            ) : (
              <Spinner className="h-5 w-5" />
            )}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleDownload}
      className={`flex w-full min-w-[12rem] items-center gap-3 rounded-xl px-3 py-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        isOutgoing ? "bg-black/10 hover:bg-black/15" : "bg-black/5 hover:bg-black/10"
      }`}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted-foreground">
        <FileIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{message.attachment_filename}</span>
        <span className="block text-xs opacity-70">
          {message.attachment_size != null ? formatFileSize(message.attachment_size) : ""}
          {error ? " · Download failed" : ""}
        </span>
      </span>
      {downloading && <Spinner className="h-4 w-4 shrink-0" />}
    </button>
  );
}

interface MessageBubbleProps {
  message: Message;
  currentUserId: number;
  showSenderName?: boolean;
}

export function MessageBubble({ message, currentUserId, showSenderName }: MessageBubbleProps) {
  const isOutgoing = message.sender.id === currentUserId;
  const isFile = message.message_type === "file";

  return (
    <div className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3 py-1.5 sm:max-w-[65%] ${
          isOutgoing
            ? "rounded-br-md bg-message-outgoing text-message-outgoing-foreground"
            : "rounded-bl-md bg-message-incoming text-message-incoming-foreground"
        } ${isFile ? "p-1.5" : ""}`}
      >
        {showSenderName && (
          <p className={`mb-0.5 text-xs font-semibold text-primary ${isFile ? "px-1.5 pt-1" : ""}`}>
            {message.sender.display_name}
          </p>
        )}
        {isFile && (
          <div className={showSenderName ? "" : "mt-0.5"}>
            <Attachment message={message} isOutgoing={isOutgoing} />
          </div>
        )}
        {message.content && (
          <p className={`whitespace-pre-wrap break-words text-[14.5px] leading-snug ${isFile ? "px-1.5 pt-1.5" : ""}`}>
            {message.content}
          </p>
        )}
        <div
          className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${isFile ? "px-1.5 pb-0.5" : ""} ${
            isOutgoing ? "text-message-outgoing-foreground/70" : "text-muted-foreground"
          }`}
        >
          <span>{formatMessageTime(message.created_at)}</span>
          {isOutgoing && (
            <span aria-label={STATUS_LABEL[message.status]}>
              {message.status === "sent" ? (
                <SingleCheck />
              ) : (
                <DoubleCheck className={message.status === "read" ? "text-primary" : undefined} />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
