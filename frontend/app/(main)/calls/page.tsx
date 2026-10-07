"use client";

import { useState } from "react";
import { SearchInput } from "@/components/ui/SearchInput";
import { Toast } from "@/components/ui/Toast";
import { NewCallIcon, MoreIcon, LinkIcon, PhoneCallIcon } from "@/components/ui/icons";

export default function CallsPage() {
  const [query, setQuery] = useState("");
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  function notImplemented(feature: string) {
    setToastMessage(`${feature}: not available yet.`);
    setTimeout(() => setToastMessage(null), 2500);
  }

  return (
    <>
      <aside className="flex w-full flex-col border-r border-border bg-sidebar md:flex md:w-[360px] md:shrink-0">
        <div className="flex h-16 items-center gap-1 px-4">
          <h1 className="min-w-0 flex-1 truncate text-xl font-bold text-sidebar-foreground">Calls</h1>
          <button
            type="button"
            onClick={() => notImplemented("New call")}
            aria-label="New call"
            title="New call"
            className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <NewCallIcon className="h-5 w-5" />
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
            onClick={() => notImplemented("Call links")}
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left hover:bg-sidebar-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <LinkIcon className="h-[18px] w-[18px]" />
            </span>
            <span className="text-sm font-medium text-sidebar-foreground">Create a Call Link</span>
          </button>
        </div>

        {query.trim() === "" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center">
            <p className="text-sm font-semibold text-muted-foreground">No calls</p>
            <p className="text-sm text-muted-foreground">Recent calls will appear here.</p>
          </div>
        )}
      </aside>

      <section className="hidden min-w-0 flex-1 flex-col items-center justify-center gap-3 bg-background px-6 text-center md:flex">
        <PhoneCallIcon className="h-9 w-9 text-muted-foreground" strokeWidth={1.4} />
        <p className="text-sm text-muted-foreground">
          Click <NewCallIcon className="inline h-4 w-4 align-text-bottom" /> to start a new voice or video call.
        </p>
      </section>

      {toastMessage && <Toast message={toastMessage} />}
    </>
  );
}
