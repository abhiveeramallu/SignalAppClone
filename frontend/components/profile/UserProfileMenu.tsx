"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/ui/Avatar";

export function UserProfileMenu() {
  const { currentUser, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  if (!currentUser) return null;

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
      >
        <Avatar name={currentUser.display_name} imageUrl={currentUser.avatar_url} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-neutral-900">
            {currentUser.display_name}
          </span>
          <span className="block truncate text-xs text-neutral-500">@{currentUser.username}</span>
        </span>
        <svg
          className="h-4 w-4 shrink-0 text-neutral-400"
          viewBox="0 0 20 20"
          fill="currentColor"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="absolute left-0 right-0 z-10 mt-1 overflow-hidden rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        >
          <Link
            href="/settings"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
          >
            Settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={logout}
            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
