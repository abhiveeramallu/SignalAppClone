import { ConversationListItem } from "./ConversationListItem";
import { Spinner } from "@/components/ui/Spinner";
import type { ConversationPreview } from "@/lib/types";

export type ConversationFilter = "all" | "unread" | "groups";

interface ConversationListProps {
  conversations: ConversationPreview[];
  loading: boolean;
  error: string | null;
  searchQuery: string;
  filter: ConversationFilter;
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

function matchesFilter(conversation: ConversationPreview, filter: ConversationFilter): boolean {
  if (filter === "unread") return conversation.unread_count > 0;
  if (filter === "groups") return conversation.type === "group";
  return true;
}

export function ConversationList({
  conversations,
  loading,
  error,
  searchQuery,
  filter,
  selectedId,
  onSelect,
}: ConversationListProps) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner className="h-5 w-5 text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-danger">{error}</div>
    );
  }

  // Usernames are always shown with a leading "@" (e.g. "@carol"), so a
  // search typed the same way should still match the stored, @-less value.
  const query = searchQuery.trim().toLowerCase().replace(/^@/, "");
  const filtered = conversations
    .filter((c) => matchesFilter(c, filter))
    .filter((c) => (query ? matchesSearch(c, query) : true));

  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
        <p className="text-sm font-semibold text-muted-foreground">No chats</p>
        <p className="text-sm text-muted-foreground">Recent chats will appear here.</p>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
        {query ? "No conversations found." : "No conversations match this filter."}
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
