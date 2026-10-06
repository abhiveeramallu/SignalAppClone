"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { ConversationPreview, UserSummary } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { SearchInput } from "@/components/ui/SearchInput";
import { Spinner } from "@/components/ui/Spinner";

interface NewConversationModalProps {
  open: boolean;
  onClose: () => void;
  onConversationReady: (conversation: ConversationPreview) => void;
  onToast: (message: string) => void;
}

type Mode = "direct" | "group";

const SEARCH_DEBOUNCE_MS = 300;

export function NewConversationModal({ open, onClose, onConversationReady, onToast }: NewConversationModalProps) {
  const { token } = useAuth();
  const [mode, setMode] = useState<Mode>("direct");
  const [contacts, setContacts] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creatingId, setCreatingId] = useState<number | null>(null);

  // Registered-user search (Message mode, non-empty query) — separate from
  // `contacts` below, which is the user's already-loaded contact list shown
  // when the query is empty. Debounced so we don't hit the backend on every
  // keystroke.
  const [searchResults, setSearchResults] = useState<UserSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingContactId, setAddingContactId] = useState<number | null>(null);

  const [groupName, setGroupName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [creatingGroup, setCreatingGroup] = useState(false);

  useEffect(() => {
    if (!open || !token) return;
    const activeToken = token;
    let cancelled = false;

    // Deferred behind a microtask so nothing here runs synchronously within
    // the effect body itself (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      if (cancelled) return;
      setMode("direct");
      setQuery("");
      setError(null);
      setGroupName("");
      setSelectedIds(new Set());
      setSearchResults([]);
      setSearching(false);
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

  // Debounced registered-user search — only in Message mode, only once the
  // query is non-empty (an empty query skips the network call entirely, same
  // policy as the backend's own guard against an unbounded query).
  useEffect(() => {
    if (!open || !token || mode !== "direct") return;
    const trimmed = query.trim();
    const activeToken = token;
    let cancelled = false;

    if (!trimmed) {
      Promise.resolve().then(() => {
        if (cancelled) return;
        setSearchResults([]);
        setSearching(false);
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
  }, [open, token, mode, query]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const normalizedQuery = query.trim().toLowerCase();
  // Message mode: an empty query shows the already-loaded contact list
  // (client-side filtered, though it's never actually filtered since the
  // query is empty here — kept for clarity); a non-empty query shows
  // debounced registered-user search results instead, which already come
  // back from the backend pre-filtered.
  const filtered = normalizedQuery
    ? contacts.filter(
        (c) =>
          c.username.toLowerCase().includes(normalizedQuery) ||
          c.display_name.toLowerCase().includes(normalizedQuery),
      )
    : contacts;
  const isSearchingPeople = mode === "direct" && normalizedQuery.length > 0;
  const contactIds = new Set(contacts.map((c) => c.id));
  const isContact = (userId: number) => contactIds.has(userId);

  async function handleSelectDirect(contact: UserSummary) {
    if (!token || creatingId !== null) return;
    setCreatingId(contact.id);
    setError(null);
    try {
      const conversation = await api.createDirectConversation(token, contact.id);
      onConversationReady(conversation);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start conversation.");
    } finally {
      setCreatingId(null);
    }
  }

  async function handleAddContact(user: UserSummary) {
    if (!token || addingContactId !== null) return;
    setAddingContactId(user.id);
    setError(null);
    try {
      await api.addContact(token, user.id);
      // Reflected locally only after backend success — this is what flips
      // isContact(user.id) to true, turning the row into a start-conversation
      // row on the next render without needing a full contacts refetch.
      setContacts((prev) => (prev.some((c) => c.id === user.id) ? prev : [...prev, user]));
      onToast("Contact added");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add contact.");
    } finally {
      setAddingContactId(null);
    }
  }

  function toggleSelected(contactId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(contactId)) next.delete(contactId);
      else next.add(contactId);
      return next;
    });
  }

  async function handleCreateGroup() {
    const trimmedName = groupName.trim();
    if (!token || !trimmedName || creatingGroup) return;
    setCreatingGroup(true);
    setError(null);
    try {
      const conversation = await api.createGroupConversation(token, trimmedName, [...selectedIds]);
      onConversationReady(conversation);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create group.");
    } finally {
      setCreatingGroup(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === "direct" ? "New message" : "New group"}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[32rem] w-full max-w-sm flex-col rounded-2xl border border-neutral-200 bg-white shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <div className="flex gap-1 rounded-lg bg-neutral-100 p-0.5">
            <button
              type="button"
              onClick={() => setMode("direct")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                mode === "direct" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              }`}
            >
              Message
            </button>
            <button
              type="button"
              onClick={() => setMode("group")}
              className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                mode === "group" ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-500"
              }`}
            >
              Group
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>

        {mode === "group" && (
          <div className="border-b border-neutral-200 p-3">
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="Group name"
              maxLength={255}
              aria-label="Group name"
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        )}

        <div className="p-3 pb-0">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={mode === "direct" ? "Search people by name or username" : "Search contacts"}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && <p className="px-2 py-4 text-center text-sm text-neutral-500">Loading contacts…</p>}
          {error && (
            <p role="alert" className="mx-2 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {mode === "direct" && isSearchingPeople ? (
            <>
              {searching && <p className="px-2 py-4 text-center text-sm text-neutral-500">Searching…</p>}
              {!searching && searchResults.length === 0 && (
                <p className="px-2 py-4 text-center text-sm text-neutral-500">No people found.</p>
              )}
              {searchResults.map((user) =>
                isContact(user.id) ? (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => handleSelectDirect(user)}
                    disabled={creatingId !== null}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Avatar name={user.display_name} imageUrl={user.avatar_url} online={user.is_online} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-900">
                        {user.display_name}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">@{user.username}</span>
                    </span>
                    {creatingId === user.id && <Spinner className="h-4 w-4 text-blue-600" />}
                  </button>
                ) : (
                  <div key={user.id} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5">
                    <Avatar name={user.display_name} imageUrl={user.avatar_url} online={user.is_online} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-900">
                        {user.display_name}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">@{user.username}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => handleAddContact(user)}
                      disabled={addingContactId !== null}
                      className="shrink-0 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {addingContactId === user.id ? <Spinner className="h-4 w-4 text-blue-600" /> : "Add contact"}
                    </button>
                  </div>
                ),
              )}
            </>
          ) : (
            <>
              {!loading && filtered.length === 0 && (
                <p className="px-2 py-4 text-center text-sm text-neutral-500">
                  {contacts.length === 0
                    ? mode === "direct"
                      ? "You don't have any contacts yet. Search for people above to add one."
                      : "You don't have any contacts yet."
                    : "No contacts found."}
                </p>
              )}
              {filtered.map((contact) =>
                mode === "direct" ? (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => handleSelectDirect(contact)}
                    disabled={creatingId !== null}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Avatar name={contact.display_name} imageUrl={contact.avatar_url} online={contact.is_online} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-900">
                        {contact.display_name}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">@{contact.username}</span>
                    </span>
                    {creatingId === contact.id && <Spinner className="h-4 w-4 text-blue-600" />}
                  </button>
                ) : (
                  <label
                    key={contact.id}
                    className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-100"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(contact.id)}
                      onChange={() => toggleSelected(contact.id)}
                      className="h-4 w-4 shrink-0 rounded border-neutral-300 text-blue-600 focus:ring-blue-500/30"
                    />
                    <Avatar name={contact.display_name} imageUrl={contact.avatar_url} online={contact.is_online} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-neutral-900">
                        {contact.display_name}
                      </span>
                      <span className="block truncate text-xs text-neutral-500">@{contact.username}</span>
                    </span>
                  </label>
                ),
              )}
            </>
          )}
        </div>

        {mode === "group" && (
          <div className="border-t border-neutral-200 p-3">
            <Button
              onClick={handleCreateGroup}
              loading={creatingGroup}
              disabled={!groupName.trim()}
              className="w-full"
            >
              {creatingGroup ? "Creating…" : `Create group${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
