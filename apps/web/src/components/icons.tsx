/**
 * Icônes SVG minimales (inline, outline, 2px) — UI/UX Master Spec §12.
 * Style : géométrique, cohérent, 1.5–2 px. Aucune lib externe.
 */
type IconProps = { className?: string };

function Svg({ className = "", children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function Mic({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10a7 7 0 0 0 14 0" />
      <path d="M12 19v3" />
    </Svg>
  );
}

export function CheckIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M20 6 9 17l-5-5" />
    </Svg>
  );
}

export function AlertIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </Svg>
  );
}

export function CloseIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  );
}

export function ArrowRightIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </Svg>
  );
}

export function ArrowLeftIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M19 12H5" />
      <path d="m11 18-6-6 6-6" />
    </Svg>
  );
}

export function UploadIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 16V4" />
      <path d="m6 10 6-6 6 6" />
      <path d="M4 20h16" />
    </Svg>
  );
}

export function HomeIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M9 21v-6a3 3 0 0 1 6 0v6" />
    </Svg>
  );
}

export function ChatIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M21 12a8 8 0 0 1-8 8H4l2.6-2.9A8 8 0 1 1 21 12z" />
    </Svg>
  );
}

export function MemoryIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 4h6M9 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2M9 4h6" />
      <path d="M9 9h6M9 13h6" />
    </Svg>
  );
}

export function FileIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </Svg>
  );
}

export function ActionIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M16 4h4v4" />
      <path d="M14 10 20 4" />
      <path d="m4 20 6-6" />
      <path d="M12 8a4 4 0 0 0-4 4" />
      <path d="M8 16a4 4 0 0 0 4 4" />
    </Svg>
  );
}

export function UserIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </Svg>
  );
}

export function SearchIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </Svg>
  );
}

export function PlusIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function SendIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m3 11 18-8-8 18-2.5-7.5z" />
      <path d="M3 11l.6 4.2L10.5 13" />
    </Svg>
  );
}

export function VolumeIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </Svg>
  );
}

export function VolumeOffIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M11 5 6 9H2v6h4l5 4z" />
      <path d="m16 9 6 6M22 9l-6 6" />
    </Svg>
  );
}

export function InfoIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </Svg>
  );
}

export function SettingsIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
    </Svg>
  );
}

export function MoreIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <circle cx="12" cy="5" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="12" cy="19" r="1.4" />
    </Svg>
  );
}

export function PauseIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </Svg>
  );
}

export function RefreshIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 3v6h-6" />
    </Svg>
  );
}

export function TrashIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    </Svg>
  );
}

export function ChevronRightIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="m9 18 6-6-6-6" />
    </Svg>
  );
}

export function LogOutIcon({ className = "" }: IconProps) {
  return (
    <Svg className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </Svg>
  );
}