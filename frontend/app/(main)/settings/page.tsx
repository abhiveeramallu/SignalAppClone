"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/ui/Avatar";

interface SettingsRowProps {
  label: string;
  description?: string;
}

/** Every control on this page is a disclosed placeholder (Part F) — the
 * assignment requires the sections to exist and look real, not to persist
 * anything yet. Each row makes that explicit rather than pretending to work. */
function SettingsRow({ label, description }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-900">{label}</p>
        {description && <p className="mt-0.5 text-xs text-neutral-500">{description}</p>}
      </div>
      <span className="shrink-0 rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-500">
        Coming soon
      </span>
    </div>
  );
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">{title}</h2>
      <div className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const { currentUser, logout } = useAuth();

  if (!currentUser) return null;

  return (
    <div className="mx-auto flex h-screen max-w-2xl flex-col overflow-y-auto bg-neutral-50">
      <header className="flex items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3">
        <Link
          href="/"
          aria-label="Back to conversations"
          className="-ml-1 rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100"
        >
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M12.78 15.78a.75.75 0 01-1.06 0l-5-5a.75.75 0 010-1.06l5-5a.75.75 0 111.06 1.06L8.31 10l4.47 4.47a.75.75 0 010 1.06z"
              clipRule="evenodd"
            />
          </svg>
        </Link>
        <h1 className="text-base font-semibold text-neutral-900">Settings</h1>
      </header>

      <div className="flex-1 px-4 py-5">
        <div className="mb-6 flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-4">
          <Avatar name={currentUser.display_name} imageUrl={currentUser.avatar_url} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-neutral-900">{currentUser.display_name}</p>
            <p className="truncate text-xs text-neutral-500">@{currentUser.username}</p>
          </div>
        </div>

        <SettingsSection title="Privacy">
          <SettingsRow label="Read receipts" description="Let others see when you've read their messages" />
          <SettingsRow label="Disappearing messages" description="Automatically remove messages after a set time" />
          <SettingsRow label="Screen security" description="Block screenshots within the app" />
        </SettingsSection>

        <SettingsSection title="Notifications">
          <SettingsRow label="Message notifications" description="Get notified about new messages" />
          <SettingsRow label="Sound" description="Play a sound for new messages" />
        </SettingsSection>

        <SettingsSection title="Appearance">
          <SettingsRow label="Theme" description="Light, dark, or system" />
          <SettingsRow label="Chat wallpaper" description="Customize your conversation background" />
        </SettingsSection>

        <section className="mb-6 rounded-xl border border-neutral-200 bg-white px-4 py-3">
          <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">About</h2>
          <p className="text-xs leading-relaxed text-neutral-500">
            This is a Signal-inspired messaging application built as a learning project. End-to-end encryption is
            simulated for this assignment and is not production Signal protocol encryption — messages are stored and
            transmitted without the real Signal cryptographic protocol.
          </p>
        </section>

        <button
          type="button"
          onClick={logout}
          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
        >
          Logout
        </button>
      </div>
    </div>
  );
}
