import type { SVGProps } from "react";

/** Shared chrome icon set — every navigation/action/chat icon in the app
 * draws from here so stroke weight, viewBox, and corner style stay
 * identical everywhere rather than drifting per hand-drawn SVG. All are
 * outline/stroke icons on a 24x24 grid at strokeWidth 1.75 with round caps;
 * callers control size via className (h-5 w-5 is the chrome-icon default)
 * and color via currentColor (text-*). */

type IconProps = SVGProps<SVGSVGElement>;

function Base({ children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
    </Base>
  );
}

export function ChatsIcon({ active, ...props }: IconProps & { active?: boolean }) {
  return (
    <Base fill={active ? "currentColor" : "none"} {...props}>
      <path d="M3.5 12c0-4.56 3.86-8 8.5-8s8.5 3.44 8.5 8-3.86 8-8.5 8a9.9 9.9 0 01-2.74-.38c-1.13.74-2.42 1.2-3.9 1.33a.35.35 0 01-.33-.56c.63-.85.98-1.72 1.1-2.56C4.46 16.37 3.5 14.3 3.5 12z" />
    </Base>
  );
}

export function CallsIcon({ active, ...props }: IconProps & { active?: boolean }) {
  return (
    <Base fill={active ? "currentColor" : "none"} {...props}>
      <path d="M4.5 5.5c0-.66.54-1.2 1.2-1.2h1.33c.6 0 1.1.42 1.23 1l.6 2.7a1.2 1.2 0 01-.63 1.33l-1.1.56a10.8 10.8 0 005.5 5.5l.56-1.1a1.2 1.2 0 011.33-.63l2.7.6c.58.13 1 .63 1 1.23v1.33c0 .66-.54 1.2-1.2 1.2h-.96C9.4 18.02 5.98 14.6 4.96 9.96A6.9 6.9 0 014.5 6.5v-1z" />
    </Base>
  );
}

export function StoriesIcon({ active, ...props }: IconProps & { active?: boolean }) {
  return (
    <Base fill={active ? "currentColor" : "none"} {...props}>
      <rect x="6" y="3" width="12" height="18" rx="2.5" />
      <path d="M9.5 21h5" />
    </Base>
  );
}

export function SettingsIcon({ active, ...props }: IconProps & { active?: boolean }) {
  return (
    <Base fill={active ? "currentColor" : "none"} {...props}>
      <path d="M10 2.75h4l.55 2.4c.56.2 1.08.47 1.56.8l2.33-.76 2 3.46-1.83 1.63a6.6 6.6 0 010 1.84l1.83 1.63-2 3.46-2.33-.76c-.48.33-1 .6-1.56.8l-.55 2.4h-4l-.55-2.4a6.4 6.4 0 01-1.56-.8l-2.33.76-2-3.46 1.83-1.63a6.6 6.6 0 010-1.84L3.56 8.55l2-3.46 2.33.76c.48-.33 1-.6 1.56-.8l.55-2.4z" />
      <circle cx="12" cy="12" r="2.75" />
    </Base>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M20 20l-4.3-4.3" />
    </Base>
  );
}

export function FilterIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M3.5 5h17l-6.5 7.5V19l-4-2v-4.5z" />
    </Base>
  );
}

export function ComposeIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M14.5 5.5l4 4L8 20H4v-4l10.5-10.5z" />
      <path d="M12.5 7.5l4 4" />
    </Base>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <Base fill="currentColor" stroke="none" {...props}>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </Base>
  );
}

export function PhoneCallIcon(props: IconProps) {
  return <CallsIcon {...props} />;
}

export function VideoIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="M21 8.2v7.6a.7.7 0 01-1.07.6l-4.43-2.68V10.3l4.43-2.68A.7.7 0 0121 8.2z" />
    </Base>
  );
}

export function BackIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M15 5l-7 7 7 7" />
    </Base>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </Base>
  );
}

export function AttachIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M18.5 10.5l-7.6 7.6a4 4 0 01-5.66-5.66l8.3-8.3a2.7 2.7 0 013.82 3.82l-8.13 8.13a1.4 1.4 0 01-1.98-1.98l7.42-7.42" />
    </Base>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <Base fill="currentColor" stroke="none" {...props}>
      <path d="M3.4 3.3a.9.9 0 011-.1l16.5 8.7a.9.9 0 010 1.6L4.4 22.2a.9.9 0 01-1.3-1l1.9-7.2 9.3-1.5-9.3-1.5L3.1 4.8a.9.9 0 01.3-1.5z" />
    </Base>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 4.5v15M4.5 12h15" />
    </Base>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M16.5 3.5a2.1 2.1 0 013 3l-1 1-3-3 1-1z" />
      <path d="M14.5 5.5L4 16v4h4L18.5 9.5z" />
    </Base>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M5 7h14M10 3h4a1 1 0 011 1v3H9V4a1 1 0 011-1z" />
      <path d="M6.5 7l.7 12a2 2 0 002 1.9h5.6a2 2 0 002-1.9L17.5 7" />
      <path d="M10 11v6M14 11v6" />
    </Base>
  );
}

export function LinkIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9.5 14.5l5-5" />
      <path d="M11.5 6.5l1.4-1.4a3.5 3.5 0 014.95 4.95L16.4 11.4" />
      <path d="M12.5 17.5l-1.4 1.4a3.5 3.5 0 01-4.95-4.95L7.6 12.6" />
    </Base>
  );
}

export function PersonIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="8" r="3.25" />
      <path d="M5.5 19.5c0-3.3 3-5.25 6.5-5.25s6.5 1.95 6.5 5.25" />
    </Base>
  );
}

export function AtIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M16 12v1.5a2.5 2.5 0 005 0V12a9 9 0 10-3.6 7.2" />
    </Base>
  );
}

export function HeartIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 20s-7-4.35-7-9.6A4.4 4.4 0 0112 7.5a4.4 4.4 0 017 2.9c0 5.25-7 9.6-7 9.6z" />
    </Base>
  );
}

export function BellIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M18.5 16v-4.8a6.5 6.5 0 10-13 0V16L4 18v.8h16V18l-1.5-2z" />
      <path d="M10 20.5a2 2 0 004 0" />
    </Base>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5.5" y="11" width="13" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </Base>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  );
}

export function AppearanceIcon(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 3.5a8.5 8.5 0 010 17 2.3 2.3 0 01-1.6-3.9c.5-.5.5-1.3 0-1.8a2.3 2.3 0 010-3.3c.5-.5.5-1.3 0-1.8A2.3 2.3 0 0112 3.5z" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function ActivityIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4 20V11M12 20V4M20 20v-6" />
    </Base>
  );
}

export function NewCallIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M4.5 5.5c0-.66.54-1.2 1.2-1.2h1.33c.6 0 1.1.42 1.23 1l.6 2.7a1.2 1.2 0 01-.63 1.33l-1.1.56a10.8 10.8 0 005.5 5.5l.56-1.1a1.2 1.2 0 011.33-.63l2.7.6c.58.13 1 .63 1 1.23v1.33c0 .66-.54 1.2-1.2 1.2h-.96C9.4 18.02 5.98 14.6 4.96 9.96A6.9 6.9 0 014.5 6.5v-1z" />
      <path d="M18 3v4.5M20.25 5.25h-4.5" />
    </Base>
  );
}

export function LogoutIcon(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3" />
      <path d="M16 16l4-4-4-4M20 12H9" />
    </Base>
  );
}

export function ArchiveIcon(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="3.5" y="4" width="17" height="4.5" rx="1.2" />
      <path d="M5 8.5V18a2 2 0 002 2h10a2 2 0 002-2V8.5" />
      <path d="M10 13h4" />
    </Base>
  );
}
