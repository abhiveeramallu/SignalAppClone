interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

// Visual + typable only for now; not wired to filter anything yet so it's
// ready for real conversation/contact search to plug in later.
export function SearchInput({ value, onChange, placeholder = "Search" }: SearchInputProps) {
  return (
    <div className="relative">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z"
          clipRule="evenodd"
        />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-lg border border-neutral-200 bg-neutral-100 py-2 pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-500 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20"
      />
    </div>
  );
}
