import { ConversationListItem } from "./ConversationListItem";
import { Spinner } from "@/components/ui/Spinner";
import type { ConversationPreview } from "@/lib/types";

interface ConversationListProps {
  conversations: ConversationPreview[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  selectedId: number | null;
  onSelect: (id: number) => void;
}

function conversationLabel(conversation: ConversationPreview): string {
  return conversation.name ?? conversation.other_user?.display_name ?? "Conversation";
}

/** Matches on group/display name, username (direct conversations), and the
 * last-message preview — everything visibly shown in a list row. Purely a
 * derived view over the already-loaded list; never mutates it. */
function matchesSearch(conversation: ConversationPreview, query: string): boolean {
  const haystacks = [
    conversationLabel(conversation),
    conversation.other_user?.username,
    conversation.last_message?.content,
  ];
  return haystacks.some((text) => text?.toLowerCase().includes(query));
}

export function ConversationList({
  conversations,
  loading,
  error,
  searchQuery,
  selectedId,
  onSelect,
}: ConversationListProps) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-5 w-5 text-neutral-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-red-600">{error}</div>
    );
  }

  // Usernames are always shown with a leading "@" (e.g. "@carol"), so a
  // search typed the same way should still match the stored, @-less value.
  const query = searchQuery.trim().toLowerCase().replace(/^@/, "");
  const filtered = query ? conversations.filter((c) => matchesSearch(c, query)) : conversations;

  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-500">
        Your conversations will appear here.
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-neutral-500">
        No conversations found.
      </div>
    );
  }

  return (
    <nav aria-label="Conversations" className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
      {filtered.map((conversation) => (
        <ConversationListItem
          key={conversation.id}
          conversation={conversation}
          selected={conversation.id === selectedId}
          onSelect={() => onSelect(conversation.id)}
        />
      ))}
    </nav>
  );
}
