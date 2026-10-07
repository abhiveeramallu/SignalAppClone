"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { SearchInput } from "@/components/ui/SearchInput";
import { ConversationList, type ConversationFilter } from "@/components/conversation-list/ConversationList";
import { ComposeIcon, MoreIcon, FilterIcon } from "@/components/ui/icons";
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

const FILTERS: { value: ConversationFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "groups", label: "Groups" },
];

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
  const { logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [filterOpen, setFilterOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const connectionLabel = CONNECTION_LABEL[connectionState];

  useEffect(() => {
    if (!filterOpen && !menuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (filterOpen && filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false);
      }
      if (menuOpen && menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [filterOpen, menuOpen]);

  return (
    <aside
      className={`${hidden ? "hidden" : "flex"} w-full flex-col border-r border-border bg-sidebar md:flex md:w-[360px] md:shrink-0`}
    >
      <div className="flex h-16 items-center gap-1 px-4">
        <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-sidebar-foreground">Chats</h1>
        <button
          type="button"
          onClick={onNewConversation}
          aria-label="New message"
          title="New message"
          className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <ComposeIcon className="h-5 w-5" />
        </button>
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="More options"
            title="More options"
            className="rounded-full p-2 text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <MoreIcon className="h-5 w-5" />
          </button>
          {menuOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl"
            >
              <Link
                href="/settings"
                role="menuitem"
                onClick={() => setMenuOpen(false)}
                className="block w-full px-3 py-2 text-left text-sm text-surface-foreground hover:bg-surface-hover"
              >
                Settings
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={logout}
                className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-surface-hover"
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      {connectionLabel && (
        <p className="border-b border-border bg-warning-muted px-3 py-1.5 text-center text-xs font-medium text-warning">
          {connectionLabel}
        </p>
      )}

      <div className="flex items-center gap-2 px-3 pb-3">
        <div className="min-w-0 flex-1">
          <SearchInput value={searchQuery} onChange={setSearchQuery} />
        </div>
        <div ref={filterRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setFilterOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={filterOpen}
            aria-label="Filter conversations"
            title="Filter"
            className={`flex h-9 w-9 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
              filter !== "all"
                ? "bg-sidebar-active text-primary"
                : "text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground"
            }`}
          >
            <FilterIcon className="h-5 w-5" />
          </button>
          {filterOpen && (
            <div
              role="menu"
              className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl"
            >
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={filter === f.value}
                  onClick={() => {
                    setFilter(f.value);
                    setFilterOpen(false);
                  }}
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-surface-hover ${
                    filter === f.value ? "text-primary" : "text-surface-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConversationList
        conversations={conversations}
        loading={conversationsLoading}
        error={conversationsError}
        searchQuery={searchQuery}
        filter={filter}
        selectedId={selectedId}
        onSelect={onSelect}
      />
    </aside>
  );
}
