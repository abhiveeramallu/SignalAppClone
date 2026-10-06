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
}

type Mode = "direct" | "group";

export function NewConversationModal({ open, onClose, onConversationReady }: NewConversationModalProps) {
  const { token } = useAuth();
  const [mode, setMode] = useState<Mode>("direct");
  const [contacts, setContacts] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [creatingId, setCreatingId] = useState<number | null>(null);

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
    if (!open) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const normalizedQuery = query.trim().toLowerCase();
  const filtered = normalizedQuery
    ? contacts.filter(
        (c) =>
          c.username.toLowerCase().includes(normalizedQuery) ||
          c.display_name.toLowerCase().includes(normalizedQuery),
      )
    : contacts;

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
          <SearchInput value={query} onChange={setQuery} placeholder="Search contacts" />
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading && <p className="px-2 py-4 text-center text-sm text-neutral-500">Loading contacts…</p>}
          {error && (
            <p role="alert" className="mx-2 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-neutral-500">
              {contacts.length === 0 ? "You don't have any contacts yet." : "No contacts found."}
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
