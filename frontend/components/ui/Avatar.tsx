interface AvatarProps {
  name: string;
  imageUrl?: string | null;
  online?: boolean;
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
}

export function Avatar({ name, imageUrl, online }: AvatarProps) {
  return (
    <span className="relative inline-flex h-10 w-10 shrink-0">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary external avatar URLs, not a next/image-friendly fixed set of domains
        <img src={imageUrl} alt="" className="h-10 w-10 rounded-full object-cover" />
      ) : (
        <span
          className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-sm font-semibold text-white"
          aria-hidden="true"
        >
          {initialsFrom(name)}
        </span>
      )}
      {online && (
        <span
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-green-500"
          aria-hidden="true"
        />
      )}
    </span>
  );
}
