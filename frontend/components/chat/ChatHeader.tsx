import { Avatar } from "@/components/ui/Avatar";
import type { ConversationPreview } from "@/lib/types";

interface ChatHeaderProps {
  conversation: ConversationPreview;
  onBack: () => void;
  onNotImplemented: (feature: string) => void;
  onOpenGroupDetails?: () => void;
}

export function ChatHeader({ conversation, onBack, onNotImplemented, onOpenGroupDetails }: ChatHeaderProps) {
  const name = conversation.name ?? conversation.other_user?.display_name ?? "Conversation";
  const statusLabel =
    conversation.type === "group"
      ? `${conversation.member_count ?? 0} members`
      : conversation.other_user?.is_online
        ? "Online"
        : "Offline";
  const isGroup = conversation.type === "group";

  return (
    <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to conversations"
        className="-ml-1 rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 md:hidden"
      >
        <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M12.78 15.78a.75.75 0 01-1.06 0l-5-5a.75.75 0 010-1.06l5-5a.75.75 0 111.06 1.06L8.31 10l4.47 4.47a.75.75 0 010 1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      <button
        type="button"
        onClick={isGroup ? onOpenGroupDetails : () => onNotImplemented("Contact profile")}
        aria-label={isGroup ? "Group details" : "Contact profile"}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg text-left hover:bg-neutral-50"
      >
        <Avatar name={name} imageUrl={conversation.avatar_url} online={conversation.other_user?.is_online} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">{name}</p>
          <p className="truncate text-xs text-neutral-500">{statusLabel}</p>
        </div>
      </button>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onNotImplemented("Voice calls")}
          aria-label="Voice call (not implemented)"
          className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M2 3.5A1.5 1.5 0 013.5 2h1.148a1.5 1.5 0 011.465 1.175l.716 3.223a1.5 1.5 0 01-1.052 1.767l-.933.267c-.41.117-.643.555-.48.95a11.542 11.542 0 006.254 6.254c.395.163.833-.07.95-.48l.267-.933a1.5 1.5 0 011.767-1.052l3.223.716A1.5 1.5 0 0118 15.352V16.5a1.5 1.5 0 01-1.5 1.5H15c-1.149 0-2.263-.15-3.326-.43A13.022 13.022 0 012.43 8.326 13.019 13.019 0 012 5V3.5z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => onNotImplemented("Video calls")}
          aria-label="Video call (not implemented)"
          className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M3.25 4A2.25 2.25 0 001 6.25v7.5A2.25 2.25 0 003.25 16h7.5A2.25 2.25 0 0013 13.75V6.25A2.25 2.25 0 0010.75 4h-7.5zM19 6.75v6.5a.75.75 0 01-1.142.638l-3.75-2.25a.75.75 0 01-.358-.638v-2.25a.75.75 0 01.358-.638l3.75-2.25A.75.75 0 0119 6.75z" />
          </svg>
        </button>
      </div>
    </header>
  );
}
