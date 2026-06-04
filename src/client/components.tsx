import type { ReactNode } from "react";

import { extractUrls, percent } from "../shared/format";

export function StatusBadge({ status }: { status: string }) {
  return <span className={`status ${status}`}>{status}</span>;
}

export function Metric({
  label,
  value,
  hint
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      {hint ? <small className="metric-hint">{hint}</small> : null}
    </div>
  );
}

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const width = percent(value, max);
  return (
    <div className="progress" aria-label={`${Math.round(width)} percent`}>
      <div style={{ width: `${width}%` }} />
    </div>
  );
}

export function EmptyOrLoading({
  loading,
  empty,
  loadingText = "Loading…",
  children
}: {
  loading: boolean;
  empty: boolean;
  loadingText?: string;
  children: ReactNode;
}) {
  if (loading) {
    return <div className="empty">{loadingText}</div>;
  }
  if (empty) {
    return children as ReactNode;
  }
  return children as ReactNode;
}

export function ReferenceLinks({
  uri,
  summary
}: {
  uri?: string | null;
  summary?: string | null;
}) {
  const urls = new Set<string>();
  const direct = safeExternalUrl(uri);
  if (direct) {
    urls.add(direct);
  }
  for (const url of extractUrls(summary)) {
    urls.add(url);
  }
  if (urls.size === 0) {
    return null;
  }
  return (
    <div className="reference-links">
      {[...urls].map((url) => (
        <a key={url} className="reference-link" href={url} target="_blank" rel="noreferrer">
          Open reference: {hostOf(url)}
        </a>
      ))}
    </div>
  );
}

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  return (
    <button
      type="button"
      className="ghost small"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
      }}
    >
      {label}
    </button>
  );
}

export function safeExternalUrl(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function hostOf(value: string): string {
  try {
    return new URL(value).host || value;
  } catch {
    return value;
  }
}

export function formatDateTime(value?: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function shortHash(value?: string | null, size = 8): string | null {
  if (!value) {
    return null;
  }
  if (value.length <= size * 2 + 3) {
    return value;
  }
  return `${value.slice(0, size)}…${value.slice(-size)}`;
}
