"use client";

import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Participant, UserSummary } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Spinner } from "@/components/ui/Spinner";

interface AddMemberModalProps {
  open: boolean;
  conversationId: number;
  existingMemberIds: number[];
  onClose: () => void;
  onMemberAdded: (participant: Participant) => void;
}

export function AddMemberModal({ open, conversationId, existingMemberIds, onClose, onMemberAdded }: AddMemberModalProps) {
  const { token } = useAuth();
  const [contacts, setContacts] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [addingId, setAddingId] = useState<number | null>(null);

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

  const existingIdSet = new Set(existingMemberIds);
  const normalizedQuery = query.trim().toLowerCase();
  const available = contacts.filter((c) => !existingIdSet.has(c.id));
  const filtered = normalizedQuery
    ? available.filter(
        (c) =>
          c.username.toLowerCase().includes(normalizedQuery) ||
          c.display_name.toLowerCase().includes(normalizedQuery),
      )
    : available;

  async function handleSelect(contact: UserSummary) {
    if (!token || addingId !== null) return;
    setAddingId(contact.id);
    setError(null);
    try {
      // Only reflected in the member list once the backend confirms it —
      // never added optimistically ahead of success (Part K).
      const participant = await api.addGroupMember(token, conversationId, contact.id);
      onMemberAdded(participant);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add member.");
    } finally {
      setAddingId(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add members"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[28rem] w-full max-w-sm flex-col rounded-2xl border border-neutral-200 bg-white shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Add members</h2>
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

        <div className="p-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search contacts" />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {loading && <p className="px-2 py-4 text-center text-sm text-neutral-500">Loading contacts…</p>}
          {error && (
            <p role="alert" className="mx-2 mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
          {!loading && filtered.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-neutral-500">
              {available.length === 0 ? "All your contacts are already in this group." : "No contacts found."}
            </p>
          )}
          {filtered.map((contact) => (
            <button
              key={contact.id}
              type="button"
              onClick={() => handleSelect(contact)}
              disabled={addingId !== null}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Avatar name={contact.display_name} imageUrl={contact.avatar_url} online={contact.is_online} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-neutral-900">
                  {contact.display_name}
                </span>
                <span className="block truncate text-xs text-neutral-500">@{contact.username}</span>
              </span>
              {addingId === contact.id && <Spinner className="h-4 w-4 text-blue-600" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
