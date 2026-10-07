"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useTheme, type Theme } from "@/lib/theme-context";
import { Avatar } from "@/components/ui/Avatar";
import {
  PersonIcon,
  HeartIcon,
  SettingsIcon,
  AppearanceIcon,
  ChatsIcon,
  CallsIcon,
  BellIcon,
  LockIcon,
  ActivityIcon,
  ArchiveIcon,
  BackIcon,
  PencilIcon,
  AtIcon,
  LogoutIcon,
} from "@/components/ui/icons";

type SectionId =
  | "account"
  | "donate"
  | "general"
  | "appearance"
  | "chats"
  | "calls"
  | "notifications"
  | "privacy"
  | "data-usage"
  | "backups";

interface SectionDef {
  id: SectionId;
  label: string;
  icon: React.ReactNode;
}

const ICON_CLASS = "h-[18px] w-[18px]";

const PRIMARY_SECTIONS: SectionDef[] = [
  { id: "account", label: "Account", icon: <PersonIcon className={ICON_CLASS} /> },
  { id: "donate", label: "Donate to Signal", icon: <HeartIcon className={ICON_CLASS} /> },
];

const GENERAL_SECTIONS: SectionDef[] = [
  { id: "general", label: "General", icon: <SettingsIcon className={ICON_CLASS} /> },
  { id: "appearance", label: "Appearance", icon: <AppearanceIcon className={ICON_CLASS} /> },
  { id: "chats", label: "Chats", icon: <ChatsIcon className={ICON_CLASS} /> },
  { id: "calls", label: "Calls", icon: <CallsIcon className={ICON_CLASS} /> },
  { id: "notifications", label: "Notifications", icon: <BellIcon className={ICON_CLASS} /> },
  { id: "privacy", label: "Privacy", icon: <LockIcon className={ICON_CLASS} /> },
  { id: "data-usage", label: "Data usage", icon: <ActivityIcon className={ICON_CLASS} /> },
  { id: "backups", label: "Backups", icon: <ArchiveIcon className={ICON_CLASS} /> },
];

const THEME_OPTIONS: { value: Theme; label: string; description: string }[] = [
  { value: "light", label: "Light", description: "A bright, high-contrast appearance." },
  { value: "dark", label: "Dark", description: "A dim, low-glare appearance." },
  { value: "system", label: "System", description: "Match your device's appearance setting." },
];

function Placeholder({ label }: { label: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <p className="max-w-xs text-sm text-muted-foreground">This section isn&apos;t available in this build yet.</p>
    </div>
  );
}

function AccountSection({ onToast }: { onToast: (message: string) => void }) {
  const { currentUser } = useAuth();
  if (!currentUser) return null;

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-8">
      <h2 className="mb-6 text-center text-sm font-semibold text-muted-foreground">Profile</h2>
      <div className="mb-8 flex flex-col items-center gap-3">
        <Avatar name={currentUser.display_name} imageUrl={currentUser.avatar_url} size="lg" />
        <button
          type="button"
          onClick={() => onToast("Edit photo: not available yet.")}
          className="rounded-full bg-muted px-4 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          Edit photo
        </button>
      </div>

      <div className="mb-2 divide-y divide-border rounded-xl border border-border bg-surface">
        <div className="flex items-center gap-3 px-4 py-3">
          <PersonIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="text-sm text-surface-foreground">{currentUser.display_name}</span>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <PencilIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-sm text-muted-foreground">About</span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Coming soon
          </span>
        </div>
      </div>
      <p className="mb-6 px-1 text-xs text-muted-foreground">
        Your profile and changes to it will be visible to people you message, contacts and groups.
      </p>

      <div className="mb-2 rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <AtIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="flex-1 text-sm text-surface-foreground">@{currentUser.username}</span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            Coming soon
          </span>
        </div>
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        People can now message you using your optional username so you don&apos;t have to give out your phone number.
      </p>
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="mx-auto w-full max-w-lg px-6 py-8">
      <h2 className="mb-1 text-center text-base font-semibold text-foreground">Appearance</h2>
      <p className="mb-6 text-center text-sm text-muted-foreground">Choose how Signal Clone looks.</p>

      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {THEME_OPTIONS.map((option) => {
          const selected = theme === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              role="radio"
              aria-checked={selected}
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-surface-foreground">{option.label}</span>
                <span className="block text-xs text-muted-foreground">{option.description}</span>
              </span>
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? "border-primary" : "border-muted-foreground/40"
                }`}
              >
                {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsAbout() {
  return (
    <section className="mx-auto mb-2 w-full max-w-lg rounded-xl border border-border bg-surface px-4 py-3">
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">About</h2>
      <p className="text-xs leading-relaxed text-muted-foreground">
        This is a Signal-inspired messaging application built as a learning project. End-to-end encryption is
        simulated for this assignment and is not production Signal protocol encryption — messages are stored and
        transmitted without the real Signal cryptographic protocol.
      </p>
    </section>
  );
}

export default function SettingsPage() {
  const { currentUser, logout } = useAuth();
  const [activeSection, setActiveSection] = useState<SectionId>("account");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function showToast(message: string) {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2500);
  }

  if (!currentUser) return null;

  const allSections = [...PRIMARY_SECTIONS, ...GENERAL_SECTIONS];
  const activeDef = allSections.find((s) => s.id === activeSection);

  function selectSection(id: SectionId) {
    setActiveSection(id);
    setMobileDetailOpen(true);
  }

  return (
    <>
      <aside
        className={`${mobileDetailOpen ? "hidden" : "flex"} w-full flex-col border-r border-border bg-sidebar md:flex md:w-[360px] md:shrink-0`}
      >
        <div className="flex h-16 items-center px-4">
          <h1 className="text-xl font-bold text-sidebar-foreground">Settings</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-4">
          <button
            type="button"
            onClick={() => selectSection("account")}
            className={`mb-4 flex w-full items-center gap-3 rounded-xl p-3 text-left ${
              activeSection === "account" ? "bg-sidebar-active" : "hover:bg-sidebar-hover"
            }`}
          >
            <Avatar name={currentUser.display_name} imageUrl={currentUser.avatar_url} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-sidebar-foreground">
                {currentUser.display_name}
              </span>
              <span className="block truncate text-xs text-muted-foreground">@{currentUser.username}</span>
            </span>
          </button>

          <nav className="space-y-0.5">
            {PRIMARY_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => selectSection(section.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  activeSection === section.id
                    ? "bg-sidebar-active text-sidebar-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-hover"
                }`}
              >
                <span className="text-muted-foreground">{section.icon}</span>
                {section.label}
              </button>
            ))}
          </nav>

          <div className="my-3 border-t border-border" />

          <nav className="space-y-0.5">
            {GENERAL_SECTIONS.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => selectSection(section.id)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  activeSection === section.id
                    ? "bg-sidebar-active text-sidebar-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-hover"
                }`}
              >
                <span className="text-muted-foreground">{section.icon}</span>
                {section.label}
              </button>
            ))}
          </nav>

          <div className="my-3 border-t border-border" />

          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium text-danger hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
          >
            <LogoutIcon className={ICON_CLASS} />
            Logout
          </button>
        </div>
      </aside>

      <section className={`${mobileDetailOpen ? "flex" : "hidden"} min-w-0 flex-1 flex-col bg-background md:flex`}>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-4 md:justify-center">
          <button
            type="button"
            onClick={() => setMobileDetailOpen(false)}
            aria-label="Back to settings"
            className="rounded-full p-1.5 text-muted-foreground hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 md:hidden"
          >
            <BackIcon className="h-5 w-5" />
          </button>
          <h2 className="text-sm font-semibold text-foreground">{activeDef?.label}</h2>
        </header>

        <div className="flex-1 overflow-y-auto">
          {activeSection === "account" && <AccountSection onToast={showToast} />}
          {activeSection === "appearance" && <AppearanceSection />}
          {activeSection !== "account" && activeSection !== "appearance" && (
            <Placeholder label={activeDef?.label ?? ""} />
          )}
          {activeSection === "account" && (
            <div className="px-6 pb-8">
              <SettingsAbout />
            </div>
          )}
        </div>
      </section>

      {toastMessage && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
          <div className="rounded-lg bg-foreground px-4 py-2 text-sm text-background shadow-lg">{toastMessage}</div>
        </div>
      )}
    </>
  );
}
