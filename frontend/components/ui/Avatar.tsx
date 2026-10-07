interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  online?: boolean;
  size?: "sm" | "md" | "lg";
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
}

// A small fixed palette, picked once per identity (not per render) so a
// given person's avatar color never flickers between renders — real
// messaging apps give each contact a distinct, stable color so names are
// scannable in a list at a glance, rather than one flat brand color for
// everyone. Deliberately muted/desaturated, not a neon dashboard palette.
const PALETTE = [
  "bg-blue-600",
  "bg-violet-600",
  "bg-rose-500",
  "bg-amber-600",
  "bg-teal-600",
  "bg-emerald-600",
  "bg-indigo-600",
  "bg-pink-600",
];

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

const SIZE_CLASSES: Record<NonNullable<AvatarProps["size"]>, string> = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
};

export function Avatar({ name, imageUrl, online, size = "md" }: AvatarProps) {
  const sizeClass = SIZE_CLASSES[size];
  return (
    <span className={`relative inline-flex shrink-0 ${sizeClass}`}>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external avatar URLs, not a next/image-friendly fixed set of domains
        <img src={imageUrl} alt="" className={`rounded-full object-cover ${sizeClass}`} />
      ) : (
        <span
          className={`flex items-center justify-center rounded-full font-semibold text-white ${sizeClass} ${colorFor(name)}`}
          aria-hidden="true"
        >
          {initialsFrom(name)}
        </span>
      )}
      {online && (
        <span
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-background bg-success"
          aria-hidden="true"
        />
      )}
    </span>
  );
}
