import type { TypingUser } from "@/lib/ws";

function typingText(users: TypingUser[]): string {
  const names = users.map((u) => u.display_name);
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names.length} people are typing…`;
}

function TypingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground"
          style={{ animationDelay: `${i * 120}ms`, animationDuration: "900ms" }}
        />
      ))}
    </span>
  );
}

export function TypingIndicator({ users }: { users: TypingUser[] }) {
  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-2 border-t border-border bg-background px-4 py-1.5 sm:px-6">
      <TypingDots />
      <p className="text-xs text-muted-foreground">{typingText(users)}</p>
    </div>
  );
}
