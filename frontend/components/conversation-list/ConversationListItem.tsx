import { Avatar } from "@/components/ui/Avatar";
import { formatConversationTimestamp } from "@/lib/format";
import { isImageAttachment } from "@/lib/attachments";
import type { ConversationPreview } from "@/lib/types";

interface ConversationListItemProps {
  conversation: ConversationPreview;
  selected: boolean;
  onSelect: () => void;
}

function previewText(conversation: ConversationPreview): string {
  const last = conversation.last_message;
  if (!last) return "No messages yet";
  if (last.message_type === "file") {
    const filename = last.attachment_filename ?? "File";
    return isImageAttachment(filename) ? `📷 ${filename}` : `📎 ${filename}`;
  }
  return last.content;
}

export function ConversationListItem({ conversation, selected, onSelect }: ConversationListItemProps) {
  const name = conversation.name ?? conversation.other_user?.display_name ?? "Conversation";
  const preview = previewText(conversation);
  const isUnread = conversation.unread_count > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
        selected ? "bg-sidebar-active" : "hover:bg-sidebar-hover"
      }`}
    >
      <Avatar name={name} imageUrl={conversation.avatar_url} online={conversation.other_user?.is_online} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15px] font-semibold text-sidebar-foreground">{name}</span>
          {conversation.last_message && (
            <span className={`shrink-0 text-xs ${isUnread ? "font-semibold text-primary" : "text-muted-foreground"}`}>
              {formatConversationTimestamp(conversation.last_message.created_at)}
            </span>
          )}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span
            className={`truncate text-[13px] ${isUnread ? "font-medium text-sidebar-foreground" : "text-muted-foreground"}`}
          >
            {preview}
          </span>
          {isUnread && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
              {conversation.unread_count}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
