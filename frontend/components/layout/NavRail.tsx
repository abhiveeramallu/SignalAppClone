"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/ui/Avatar";
import { ChatsIcon, CallsIcon, StoriesIcon, SettingsIcon, MenuIcon } from "@/components/ui/icons";

interface NavItem {
  href: string;
  label: string;
  Icon: typeof ChatsIcon;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Chats", Icon: ChatsIcon },
  { href: "/calls", label: "Calls", Icon: CallsIcon },
  { href: "/stories", label: "Stories", Icon: StoriesIcon },
];

export function NavRail() {
  const pathname = usePathname();
  const { currentUser, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [menuOpen]);

  if (!currentUser) return null;

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-16 shrink-0 flex-col items-center border-r border-border bg-background py-3"
    >
      <div ref={menuRef} className="relative mb-4">
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Menu"
          title="Menu"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-sidebar-hover hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <MenuIcon className="h-5 w-5" />
        </button>

        {menuOpen && (
          <div
            role="menu"
            className="absolute left-12 top-0 z-20 w-56 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-xl"
          >
            <div className="flex items-center gap-3 border-b border-border px-3 py-3">
              <Avatar name={currentUser.display_name} imageUrl={currentUser.avatar_url} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-surface-foreground">
                  {currentUser.display_name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">@{currentUser.username}</span>
              </span>
            </div>
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setMenuOpen(false)}
              className="block w-full px-3 py-2 text-left text-sm text-surface-foreground hover:bg-surface-hover"
            >
              Settings
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={logout}
              className="block w-full px-3 py-2 text-left text-sm text-danger hover:bg-surface-hover"
            >
              Logout
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col items-center gap-1">
        {NAV_ITEMS.map(({ href, label, Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              aria-label={label}
              aria-current={active ? "page" : undefined}
              title={label}
              className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                active
                  ? "bg-sidebar-active text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
              }`}
            >
              <Icon active={active} className="h-5 w-5" />
            </Link>
          );
        })}
      </div>

      <div className="mt-auto">
        <Link
          href="/settings"
          aria-label="Settings"
          aria-current={pathname === "/settings" ? "page" : undefined}
          title="Settings"
          className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
            pathname === "/settings"
              ? "bg-sidebar-active text-foreground"
              : "text-muted-foreground hover:bg-sidebar-hover hover:text-foreground"
          }`}
        >
          <SettingsIcon active={pathname === "/settings"} className="h-5 w-5" />
        </Link>
      </div>
    </nav>
  );
}
