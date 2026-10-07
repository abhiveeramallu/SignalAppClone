"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Avatar } from "@/components/ui/Avatar";
import { SearchInput } from "@/components/ui/SearchInput";
import { Toast } from "@/components/ui/Toast";
import { PlusIcon, MoreIcon, StoriesIcon } from "@/components/ui/icons";

export default function StoriesPage() {
  const { currentUser } = useAuth();
  const [query, setQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function notImplemented(feature: string) {
    setToastMessage(`${feature}: not available yet.`);
    setTimeout(() => setToastMessage(null), 2500);
  }

  if (!currentUser) return null;

  return (
    <>
      <aside className="flex w-full flex-col border-r border-border bg-sidebar md:flex md:w-[360px] md:shrink-0">
        <div className="flex h-16 items-center gap-1 px-4">
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-sidebar-foreground">Stories</h1>
          <button
            type="button"
            onClick={() => notImplemented("Add a story")}
            aria-label="Add a story"
            title="Add a story"
            className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <PlusIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => notImplemented("More options")}
            aria-label="More options"
            title="More options"
            className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <MoreIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-3 pb-3">
          <SearchInput value={query} onChange={setQuery} />
        </div>

        <div className="px-3">
          <button
            type="button"
            onClick={() => notImplemented("Add a story")}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-sidebar-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className="relative shrink-0">
              <Avatar name={currentUser.display_name} imageUrl={currentUser.avatar_url} />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full border-2 border-sidebar bg-primary text-primary-foreground">
                <PlusIcon className="h-2.5 w-2.5" strokeWidth={2.5} />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-sidebar-foreground">My Story</span>
              <span className="block truncate text-xs text-muted-foreground">Add a story</span>
            </span>
          </button>
        </div>

        {query.trim() === "" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-sm font-semibold text-muted-foreground">No stories</p>
            <p className="text-sm text-muted-foreground">New updates will appear here.</p>
          </div>
        )}
      </aside>

      <section className="hidden min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-background px-6 text-center md:flex">
        <StoriesIcon className="h-9 w-9 text-muted-foreground" strokeWidth={1.4} />
        <p className="text-sm text-muted-foreground">
          Click <PlusIcon className="inline h-4 w-4 align-text-bottom" /> to add an update.
        </p>
      </section>

      {toastMessage && <Toast message={toastMessage} />}
    </>
  );
}
