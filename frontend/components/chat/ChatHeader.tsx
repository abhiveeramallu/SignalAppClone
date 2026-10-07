import { Avatar } from "@/components/ui/Avatar";
import { BackIcon, PhoneCallIcon, VideoIcon } from "@/components/ui/icons";
import type { ConversationPreview } from "@/lib/types";

interface ChatHeaderProps {
  conversation: ConversationPreview;
  onBack: () => void;
  onNotImplemented: (feature: string) => void;
  onOpenGroupDetails?: () => void;
}

export function ChatHeader({ conversation, onBack, onNotImplemented, onOpenGroupDetails }: ChatHeaderProps) {
  const name = conversation.name ?? conversation.other_user?.display_name ?? "Conversation";
  const isGroup = conversation.type === "group";
  const isOnline = !isGroup && conversation.other_user?.is_online;
  const statusLabel = isGroup ? `${conversation.member_count ?? 0} members` : isOnline ? "online" : "offline";

  return (
    <header className="flex h-16 items-center gap-2 border-b border-border bg-background px-3">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to conversations"
        className="shrink-0 rounded-full p-1.5 text-muted-foreground hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:hidden"
      >
        <BackIcon className="h-5 w-5" />
      </button>

      <button
        type="button"
        onClick={isGroup ? onOpenGroupDetails : () => onNotImplemented("Contact profile")}
        aria-label={isGroup ? "Group details" : "Contact profile"}
        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 rounded-lg px-1 py-1 text-left hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      >
        <Avatar name={name} imageUrl={conversation.avatar_url} online={conversation.other_user?.is_online} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-foreground">{name}</p>
          <p className="flex items-center gap-1.5 truncate text-xs leading-tight text-muted-foreground">
            {isOnline && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />}
            {statusLabel}
          </p>
        </div>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          onClick={() => onNotImplemented("Voice calls")}
          aria-label="Voice call (not implemented)"
          title="Voice call"
          className="rounded-full p-2 text-muted-foreground hover:bg-surface-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <PhoneCallIcon className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => onNotImplemented("Video calls")}
          aria-label="Video call (not implemented)"
          title="Video call"
          className="rounded-full p-2 text-muted-foreground hover:bg-surface-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <VideoIcon className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
