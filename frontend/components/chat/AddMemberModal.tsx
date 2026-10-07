"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Participant, UserSummary } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Spinner } from "@/components/ui/Spinner";
import { CloseIcon } from "@/components/ui/icons";

interface AddMemberModalProps {
  open: boolean;
  conversationId: number;
  existingMemberIds: number[];
  onClose: () => void;
  onMemberAdded: (participant: Participant) => void;
}

const SEARCH_DEBOUNCE_MS = 300;

export function AddMemberModal({ open, conversationId, existingMemberIds, onClose, onMemberAdded }: AddMemberModalProps) {
  const { token } = useAuth();
  const [contacts, setContacts] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState<number | null>(null);

  // A group admin may add ANY registered user, not just existing contacts —
  // the backend has never required a contact relationship for this (see
  // conversations.py's add_group_member). Searching reuses the same
  // GET /users/search endpoint New Message search already uses.
  const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open || !token) return;
    const activeToken = token;
    let cancelled = false;

    // Deferred behind a microtask so nothing here runs synchronously within
    // the effect body itself (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      if (cancelled) return;
      setQuery("");
      setError(null);
      setSearchResults([]);
    });

    async function loadContacts() {
      setLoading(true);
      try {
        const data = await api.getContacts(activeToken);
        if (!cancelled) setContacts(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load contacts.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadContacts();
    return () => {
      cancelled = true;
    };
  }, [open, token]);

  useEffect(() => {
    if (!open || !token) return;
    const trimmed = query.trim();
    const activeToken = token;
    let cancelled = false;

    if (!trimmed) {
      Promise.resolve().then(() => {
        if (!cancelled) setSearchResults([]);
      });
      return () => {
        cancelled = true;
      };
    }

    Promise.resolve().then(() => {
      if (!cancelled) setSearching(true);
    });

    const timer = setTimeout(() => {
      api
        .searchUsers(activeToken, trimmed)
        .then((data) => {
          if (!cancelled) setSearchResults(data);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Search failed.");
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, token, query]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const existingIdSet = new Set(existingMemberIds);
  const normalizedQuery = query.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;
  const available = contacts.filter((c) => !existingIdSet.has(c.id));
  const filteredContacts = normalizedQuery
    ? available.filter(
        (c) =>
          c.username.toLowerCase().includes(normalizedQuery) ||
          c.display_name.toLowerCase().includes(normalizedQuery),
      )
    : available;
  const filteredSearchResults = searchResults.filter((u) => !existingIdSet.has(u.id));

  async function handleSelect(user: UserSummary) {
    if (!token || addingId !== null) return;
    setAddingId(user.id);
    setError(null);
    try {
      // Only reflected in the member list once the backend confirms it —
      // never added optimistically ahead of success (Part K).
      const participant = await api.addGroupMember(token, conversationId, user.id);
      onMemberAdded(participant);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add member.");
    } finally {
      setAddingId(null);
    }
  }

  const rows = isSearching ? filteredSearchResults : filteredContacts;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add members"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[28rem] w-full max-w-sm flex-col rounded-2xl border border-border bg-surface shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-surface-foreground">Add members</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted-foreground hover:bg-surface-hover hover:text-surface-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search contacts or username" />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {loading && <p className="px-2 py-4 text-center text-sm text-muted-foreground">Loading contacts…</p>}
          {error && (
            <p role="alert" className="mx-2 mb-2 rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}
          {isSearching && searching && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">Searching…</p>
          )}
          {!loading && !searching && rows.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              {isSearching
                ? "No people found."
                : available.length === 0
                  ? "All your contacts are already in this group."
                  : "No contacts found."}
            </p>
          )}
          {rows.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => handleSelect(user)}
              disabled={addingId !== null}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-surface-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Avatar name={user.display_name} imageUrl={user.avatar_url} online={user.is_online} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-surface-foreground">
                  {user.display_name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">@{user.username}</span>
              </span>
              {addingId === user.id && <Spinner className="h-4 w-4 text-primary" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
