import { formatMessageTime } from "@/lib/format";
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

interface MessageBubbleProps {
  message: Message;
  currentUserId: number;
  showSenderName?: boolean;
}

export function MessageBubble({ message, currentUserId, showSenderName }: MessageBubbleProps) {
  const isOutgoing = message.sender.id === currentUserId;

  return (
    <div className={`flex ${isOutgoing ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 sm:max-w-[65%] ${
          isOutgoing
            ? "rounded-br-md bg-blue-600 text-white"
            : "rounded-bl-md border border-neutral-200 bg-white text-neutral-900"
        }`}
      >
        {showSenderName && (
          <p className="mb-0.5 text-xs font-semibold text-blue-600">{message.sender.display_name}</p>
        )}
        <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
        <div
          className={`mt-1 flex items-center justify-end gap-1 text-[11px] ${
            isOutgoing ? "text-blue-100" : "text-neutral-400"
          }`}
        >
          <span>{formatMessageTime(message.created_at)}</span>
          {isOutgoing && (
            <span aria-label={STATUS_LABEL[message.status]}>
              {message.status === "sent" ? (
                <SingleCheck />
              ) : (
                <DoubleCheck className={message.status === "read" ? "text-sky-200" : undefined} />
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
