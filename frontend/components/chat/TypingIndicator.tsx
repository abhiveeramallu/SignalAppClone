import type { TypingUser } from "@/lib/ws";

function typingText(users: TypingUser[]): string {
  const names = users.map((u) => u.display_name);
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}

export function TypingIndicator({ users }: { users: TypingUser[] }) {
  if (users.length === 0) return null;

  return (
    <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-1.5 sm:px-6">
      <p className="text-xs italic text-neutral-500">{typingText(users)}</p>
    </div>
  );
}
