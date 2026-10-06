"use client";

import { useState } from "react";
import { UserProfileMenu } from "@/components/profile/UserProfileMenu";
import { SearchInput } from "@/components/ui/SearchInput";
import { ConversationList } from "@/components/conversation-list/ConversationList";
import type { ConnectionState } from "@/lib/ws";
import type { ConversationPreview } from "@/lib/types";

interface SidebarProps {
  conversations: ConversationPreview[];
  conversationsLoading: boolean;
  conversationsError: string | null;
  selectedId: number | null;
  onSelect: (id: number) => void;
  onNewConversation: () => void;
  connectionState: ConnectionState;
  hidden?: boolean;
}

const CONNECTION_LABEL: Partial<Record<ConnectionState, string>> = {
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  // "error" is the brief instant right after a drop, before the next retry
  // kicks in and moves to "reconnecting" — both read as "Offline" to the user.
  error: "Offline",
  disconnected: "Offline",
};

export function Sidebar({
  conversations,
  conversationsLoading,
  conversationsError,
  selectedId,
  onSelect,
  onNewConversation,
  connectionState,
  hidden,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const connectionLabel = CONNECTION_LABEL[connectionState];

  return (
    <aside
      className={`${hidden ? "hidden" : "flex"} w-full flex-col border-r border-neutral-200 bg-white md:flex md:w-[360px] md:shrink-0`}
    >
      <div className="flex items-center gap-2 border-b border-neutral-200 p-3">
        <div className="min-w-0 flex-1">
          <UserProfileMenu />
        </div>
        <button
          type="button"
          onClick={onNewConversation}
          aria-label="New message"
          title="New message"
          className="shrink-0 rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
            <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
          </svg>
        </button>
      </div>

      {connectionLabel && (
        <p className="border-b border-neutral-200 bg-amber-50 px-3 py-1.5 text-center text-xs font-medium text-amber-700">
          {connectionLabel}
        </p>
      )}

      <div className="border-b border-neutral-200 p-3">
        <SearchInput value={searchQuery} onChange={setSearchQuery} />
      </div>

      <ConversationList
        conversations={conversations}
        loading={conversationsLoading}
        error={conversationsError}
        searchQuery={searchQuery}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </aside>
  );
}
