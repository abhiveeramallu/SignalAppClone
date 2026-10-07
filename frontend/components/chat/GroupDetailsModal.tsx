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
import { CloseIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";

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
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Group details"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[32rem] w-full max-w-sm flex-col rounded-2xl border border-border bg-surface shadow-lg"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-surface-foreground">Group details</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1 text-muted-foreground hover:bg-surface-hover hover:text-surface-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading && !detail && <p className="px-4 py-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {error && !detail && (
            <p role="alert" className="mx-4 mt-3 rounded-lg bg-danger-muted px-3 py-2 text-sm text-danger">
              {error}
            </p>
          )}

          {detail && (
            <>
              <div className="flex flex-col items-center gap-2 border-b border-border px-4 py-6">
                <Avatar name={detail.name ?? "Group"} imageUrl={detail.avatar_url} size="lg" />
                {renaming ? (
                  <div className="flex w-full items-center gap-2">
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      maxLength={255}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-input px-2.5 py-1.5 text-center text-sm font-semibold text-input-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                    <Button onClick={saveRename} loading={renameSaving} disabled={!renameValue.trim()} className="px-3 py-1.5 text-xs">
                      Save
                    </Button>
                    <button
                      type="button"
                      onClick={() => setRenaming(false)}
                      className="rounded-lg px-2 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-surface-hover"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <p className="text-base font-semibold text-surface-foreground">{detail.name}</p>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={startRename}
                        aria-label="Edit group name"
                        className="rounded-lg p-1 text-muted-foreground hover:bg-surface-hover hover:text-surface-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">{detail.member_count ?? participants.length} members</p>
              </div>

              {isAdmin && (
                <div className="border-b border-border px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setAddMemberOpen(true)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 py-2 text-sm font-semibold text-primary hover:bg-primary/10"
                  >
                    <PlusIcon className="h-4 w-4" />
                    Add member
                  </button>
                </div>
              )}

              {pendingRemoval && (
                <div className="border-b border-border bg-danger-muted px-4 py-3">
                  <p className="mb-2 text-sm text-surface-foreground">
                    Remove <span className="font-semibold">{pendingRemoval.displayName}</span> from{" "}
                    <span className="font-semibold">{detail.name}</span>?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      onClick={confirmRemoval}
                      loading={busyUserId === pendingRemoval.userId}
                      className="bg-danger px-3 py-1.5 text-xs text-danger-foreground hover:opacity-90"
                    >
                      Remove
                    </Button>
                    <button
                      type="button"
                      onClick={() => setPendingRemoval(null)}
                      className="rounded-lg px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-surface-hover"
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
                      <p className="truncate text-sm font-medium text-surface-foreground">
                        {p.user.display_name}
                        {p.user.id === currentUserId && <span className="text-muted-foreground"> (you)</span>}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">@{p.user.username}</p>
                    </div>
                    {p.role === "admin" && (
                      <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        Admin
                      </span>
                    )}
                    {isAdmin && (
                      <div className="flex shrink-0 items-center gap-1">
                        {busyUserId === p.user.id ? (
                          <Spinner className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleRole(p)}
                              className="rounded-lg px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-surface-hover"
                            >
                              {p.role === "admin" ? "Remove admin" : "Make admin"}
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingRemoval({ userId: p.user.id, displayName: p.user.display_name })}
                              aria-label={`Remove ${p.user.display_name}`}
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-danger-muted hover:text-danger"
                            >
                              <TrashIcon className="h-4 w-4" />
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
