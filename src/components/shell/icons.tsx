/**
 * Inline stroke icons. Deliberately hand-written rather than an icon package:
 * a dozen 20×20 glyphs cost nothing, and they inherit `currentColor` so they
 * follow the theme tokens without a second colour system.
 *
 * These are UI affordances, not decorative SVG diagrams.
 */
const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function DashboardIcon() {
  return (
    <svg {...base}>
      <path d="M3 10.5 10 4l7 6.5" />
      <path d="M5 9.5V16h10V9.5" />
      <path d="M8.5 16v-3.5h3V16" />
    </svg>
  );
}

export function CustomersIcon() {
  return (
    <svg {...base}>
      <circle cx="8" cy="7" r="2.75" />
      <path d="M2.75 16.25c0-2.9 2.35-4.75 5.25-4.75s5.25 1.85 5.25 4.75" />
      <path d="M14 5.5a2.5 2.5 0 0 1 0 4.75M15.5 15.75c0-1.9-.6-3.2-1.75-4" />
    </svg>
  );
}

export function ProductsIcon() {
  return (
    <svg {...base}>
      <path d="M10 2.75 17 6.5v7L10 17.25 3 13.5v-7z" />
      <path d="M3 6.5 10 10.25 17 6.5M10 10.25v7" />
    </svg>
  );
}

export function QuotesIcon() {
  return (
    <svg {...base}>
      <path d="M5 2.75h7L15.5 6v11.25h-11z" />
      <path d="M11.75 2.75V6.25H15.5" />
      <path d="M7 10.5h6M7 13.5h4" />
    </svg>
  );
}

export function InvoicesIcon() {
  return (
    <svg {...base}>
      <path d="M4.75 2.75h10.5v14.5l-2-1.25-1.75 1.25-1.75-1.25-1.75 1.25-1.5-1.25-1.75 1.25z" />
      <path d="M7.5 7h5M7.5 10.25h5" />
    </svg>
  );
}

export function PaymentsIcon() {
  return (
    <svg {...base}>
      <rect x="2.75" y="5.25" width="14.5" height="9.5" rx="1.75" />
      <path d="M2.75 8.75h14.5" />
      <path d="M5.75 12h2.5" />
    </svg>
  );
}

export function ReportsIcon() {
  return (
    <svg {...base}>
      <path d="M3 16.5h14" />
      <path d="M5.75 16.5V9M10 16.5V4.5M14.25 16.5v-4.5" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...base}>
      <circle cx="10" cy="10" r="2.5" />
      <path d="M10 2.75v1.9M10 15.35v1.9M17.25 10h-1.9M4.65 10h-1.9M15.13 4.87l-1.34 1.34M6.21 13.79l-1.34 1.34M15.13 15.13l-1.34-1.34M6.21 6.21 4.87 4.87" />
    </svg>
  );
}

export function StampIcon() {
  return (
    <svg {...base}>
      <path d="M4.5 16.25h11" />
      <path d="M5.75 13.5h8.5v2h-8.5z" />
      <path d="M8 13.5V9.5a2 2 0 0 1-.75-1.55V6.25a2.25 2.25 0 0 1 4.5 0v1.7A2 2 0 0 1 11 9.5v4" />
    </svg>
  );
}

export function UsersIcon() {
  return (
    <svg {...base}>
      <circle cx="10" cy="6.75" r="2.75" />
      <path d="M4.5 16.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    </svg>
  );
}

export function WarningIcon() {
  return (
    <svg {...base}>
      <path d="M10 3.5 17.5 16.5h-15z" />
      <path d="M10 8.25v3.5M10 14.25h.01" />
    </svg>
  );
}

export function MenuIcon() {
  return (
    <svg {...base}>
      <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
    </svg>
  );
}

export function CloseIcon() {
  return (
    <svg {...base}>
      <path d="M5 5l10 10M15 5 5 15" />
    </svg>
  );
}
