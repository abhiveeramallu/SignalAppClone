/** Signal-style list timestamp: time today, "Yesterday", weekday within a week, else a short date. */
export function formatConversationTimestamp(iso: string, reference: Date = new Date()): string {
  const date = new Date(iso);
  if (date.toDateString() === reference.toDateString()) {
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  const yesterday = new Date(reference);
  yesterday.setDate(reference.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return "Yesterday";
  }

  const diffMs = reference.getTime() - date.getTime();
  if (diffMs < 7 * 24 * 60 * 60 * 1000) {
    return date.toLocaleDateString([], { weekday: "long" });
  }

  return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
