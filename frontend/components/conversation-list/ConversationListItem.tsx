import { Avatar } from "@/components/ui/Avatar";
import { formatConversationTimestamp } from "@/lib/format";
import type { ConversationPreview } from "@/lib/types";

interface ConversationListItemProps {
  conversation: ConversationPreview;
  selected: boolean;
  onSelect: () => void;
}

export function ConversationListItem({ conversation, selected, onSelect }: ConversationListItemProps) {
  const name = conversation.name ?? conversation.other_user?.display_name ?? "Conversation";
  const preview = conversation.last_message?.content ?? "No messages yet";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 ${
        selected ? "bg-blue-50" : "hover:bg-neutral-100"
      }`}
    >
      <Avatar name={name} imageUrl={conversation.avatar_url} online={conversation.other_user?.is_online} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-neutral-900">{name}</span>
          {conversation.last_message && (
            <span className="shrink-0 text-xs text-neutral-500">
              {formatConversationTimestamp(conversation.last_message.created_at)}
            </span>
          )}
        </span>
        <span className="flex items-center justify-between gap-2">
          <span className="truncate text-sm text-neutral-500">{preview}</span>
          {conversation.unread_count > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-blue-600 px-1.5 text-xs font-semibold text-white">
              {conversation.unread_count}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
