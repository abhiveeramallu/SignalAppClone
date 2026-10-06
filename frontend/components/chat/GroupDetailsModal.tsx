"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { useWebSocket } from "@/lib/ws";
import type { ConversationDetail, Participant } from "@/lib/types";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { AddMemberModal } from "@/components/chat/AddMemberModal";

interface GroupDetailsModalProps {
  open: boolean;
  conversationId: number;
  currentUserId: number;
  onClose: () => void;
  /** This client's own successful rename — lets the header/list update
   * immediately rather than waiting on the group_updated round trip. */
  onRenamed: (conversationId: number, name: string) => void;
  /** This client's own admin action removed THEMSELF from the group (the
   * one self-removal case that's actually possible — Part C). The parent
   * owns closing the conversation/chat; this modal just reports it. */
  onSelfRemoved: (conversationId: number) => void;
  onToast: (message: string) => void;
}

export function GroupDetailsModal({
  open,
  conversationId,
  currentUserId,
  onClose,
  onRenamed,
  onSelfRemoved,
  onToast,
}: GroupDetailsModalProps) {
  const { token } = useAuth();
  const { client } = useWebSocket();

  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameSaving, setRenameSaving] = useState(false);
  const [pendingRemoval, setPendingRemoval] = useState<{ userId: number; displayName: string } | null>(null);
  const [busyUserId, setBusyUserId] = useState<number | null>(null);

  const loadDetail = useCallback(() => {
    if (!token) return;
    // Deferred behind a microtask boundary (rather than a bare setState at
    // the top of this function) so nothing runs synchronously when called
    // directly from an effect — matches the same pattern AppShell's
    // loadMessages uses for the same reason (react-hooks/set-state-in-effect).
    Promise.resolve()
      .then(() => {
        setLoading(true);
        return api.getConversation(token, conversationId);
      })
      .then((data) => {
        setDetail(data);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof ApiError ? err.message : "Failed to load group details.");
      })
      .finally(() => setLoading(false));
  }, [token, conversationId]);

  useEffect(() => {
    if (!open) return;
    // Deferred behind a microtask so nothing here runs synchronously within
    // the effect body itself (react-hooks/set-state-in-effect).
    Promise.resolve().then(() => {
      setRenaming(false);
      setPendingRemoval(null);
    });
    loadDetail();
  }, [open, loadDetail]);

  // Another member's action (add/remove/role/rename) — refetch so this
  // panel never shows stale membership. REST stays the one source of truth;
  // nothing here is inferred from the event itself.
  useEffect(() => {
    if (!open) return;
    return client.onGroupUpdated((event) => {
      if (event.conversation_id === conversationId) loadDetail();
    });
  }, [open, client, conversationId, loadDetail]);

  useEffect(() => {
    if (!open) return;
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open, onClose]);

  if (!open) return null;

  const participants = detail?.participants ?? [];
  const isAdmin = participants.some((p) => p.user.id === currentUserId && p.role === "admin");
  const memberIds = participants.map((p) => p.user.id);

  function startRename() {
    setRenameValue(detail?.name ?? "");
    setRenaming(true);
  }

  async function saveRename() {
    if (!token || !detail) return;
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setRenameSaving(true);
    try {
      const updated = await api.updateConversation(token, conversationId, { name: trimmed });
      setDetail(updated);
      onRenamed(conversationId, updated.name ?? trimmed);
      setRenaming(false);
      onToast("Group name updated.");
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : "Could not rename group.");
    } finally {
      setRenameSaving(false);
    }
  }

  async function confirmRemoval() {
    if (!token || !pendingRemoval) return;
    const { userId, displayName } = pendingRemoval;
    setBusyUserId(userId);
    try {
      await api.removeGroupMember(token, conversationId, userId);
      setPendingRemoval(null);
      if (userId === currentUserId) {
        onSelfRemoved(conversationId);
        return;
      }
      setDetail((prev) => (prev ? { ...prev, participants: prev.participants?.filter((p) => p.user.id !== userId) ?? null, member_count: (prev.member_count ?? 1) - 1 } : prev));
      onToast(`${displayName} removed from the group.`);
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : "Could not remove member.");
    } finally {
      setBusyUserId(null);
    }
  }

  async function toggleRole(participant: Participant) {
    if (!token) return;
    const nextRole = participant.role === "admin" ? "member" : "admin";
    setBusyUserId(participant.user.id);
    try {
      const updated = await api.updateMemberRole(token, conversationId, participant.user.id, nextRole);
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              participants: prev.participants?.map((p) => (p.user.id === updated.user.id ? updated : p)) ?? null,
            }
          : prev,
      );
      onToast(nextRole === "admin" ? `${participant.user.display_name} is now an admin.` : `${participant.user.display_name} is no longer an admin.`);
    } catch (err) {
      onToast(err instanceof ApiError ? err.message : "Could not update role.");
    } finally {
      setBusyUserId(null);
    }
  }

  function handleMemberAdded(participant: Participant) {
    setDetail((prev) =>
      prev
        ? {
            ...prev,
            participants: [...(prev.participants ?? []), participant],
            member_count: (prev.member_count ?? 0) + 1,
          }
        : prev,
    );
    onToast(`${participant.user.display_name} added to the group.`);
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 px-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Group details"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[32rem] w-full max-w-sm flex-col rounded-2xl border border-neutral-200 bg-white shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-900">Group details</h2>
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

        <div className="flex-1 overflow-y-auto">
          {loading && !detail && <p className="px-4 py-6 text-center text-sm text-neutral-500">Loading…</p>}
          {error && !detail && (
            <p role="alert" className="mx-4 mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          {detail && (
            <>
              <div className="flex flex-col items-center gap-2 border-b border-neutral-100 px-4 py-5">
                <Avatar name={detail.name ?? "Group"} imageUrl={detail.avatar_url} />
                {renaming ? (
                  <div className="flex w-full items-center gap-2">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      maxLength={255}
                      className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-center text-sm font-semibold text-neutral-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                    <Button onClick={saveRename} loading={renameSaving} disabled={!renameValue.trim()} className="px-3 py-1.5 text-xs">
                      Save
                    </Button>
                    <button
                      type="button"
                      onClick={() => setRenaming(false)}
                      className="rounded-lg px-2 py-1.5 text-xs font-semibold text-neutral-500 hover:bg-neutral-100"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-neutral-900">{detail.name}</p>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={startRename}
                        aria-label="Edit group name"
                        className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                      >
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
                <p className="text-xs text-neutral-500">{detail.member_count ?? participants.length} members</p>
              </div>

              {isAdmin && (
                <div className="border-b border-neutral-100 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setAddMemberOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-blue-300 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" />
                    </svg>
                    Add member
                  </button>
                </div>
              )}

              {pendingRemoval && (
                <div className="border-b border-neutral-100 bg-amber-50 px-4 py-3">
                  <p className="mb-2 text-sm text-neutral-800">
                    Remove <span className="font-semibold">{pendingRemoval.displayName}</span> from{" "}
                    <span className="font-semibold">{detail.name}</span>?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={confirmRemoval}
                      loading={busyUserId === pendingRemoval.userId}
                      className="bg-red-600 px-3 py-1.5 text-xs hover:bg-red-700"
                    >
                      Remove
                    </Button>
                    <button
                      type="button"
                      onClick={() => setPendingRemoval(null)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <ul>
                {participants.map((p) => (
                  <li key={p.user.id} className="flex items-center gap-3 px-4 py-2.5">
                    <Avatar name={p.user.display_name} imageUrl={p.user.avatar_url} online={p.user.is_online} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-neutral-900">
                        {p.user.display_name}
                        {p.user.id === currentUserId && <span className="text-neutral-400"> (you)</span>}
                      </p>
                      <p className="truncate text-xs text-neutral-500">@{p.user.username}</p>
                    </div>
                    {p.role === "admin" && (
                      <span className="shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                        Admin
                      </span>
                    )}
                    {isAdmin && (
                      <div className="flex shrink-0 items-center gap-1">
                        {busyUserId === p.user.id ? (
                          <Spinner className="h-4 w-4 text-neutral-400" />
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleRole(p)}
                              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-neutral-500 hover:bg-neutral-100"
                            >
                              {p.role === "admin" ? "Remove admin" : "Make admin"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingRemoval({ userId: p.user.id, displayName: p.user.display_name })}
                              aria-label={`Remove ${p.user.display_name}`}
                              className="rounded-lg p-1.5 text-neutral-400 hover:bg-red-50 hover:text-red-600"
                            >
                              <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path
                                  fillRule="evenodd"
                                  d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      {detail && (
        <AddMemberModal
          open={addMemberOpen}
          conversationId={conversationId}
          existingMemberIds={memberIds}
          onClose={() => setAddMemberOpen(false)}
          onMemberAdded={handleMemberAdded}
        />
      )}
    </div>
  );
}
