"use client";

import { useState } from "react";
import { imageSrc } from "@/lib/image";
import { initials } from "@/lib/format";

// Palette drawn from the design's greens, lime and sand. Covers are generated, so no image hosting is needed.
const TONES = [
  { bg: "#DCEFD3", fg: "#1E4D2B", accent: "#A9C79C" },
  { bg: "#E9F2DF", fg: "#1E4D2B", accent: "#6E9A63" },
  { bg: "#F3E6D8", fg: "#7A3E12", accent: "#E8C3A3" },
  { bg: "#2C5137", fg: "#CFE8C4", accent: "#4F7A57" },
  { bg: "#E6EEE2", fg: "#123320", accent: "#E9F86B" },
  { bg: "#F1F4F0", fg: "#2B332C", accent: "#CFE8C4" },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function tone(seed: string) {
  return TONES[hash(seed) % TONES.length];
}

/** Deterministic illustrated cover for a campaign: dotted panel with layered shapes. */
export function Cover({
  seed,
  image,
  className = "",
  children,
}: {
  seed: string;
  /** Onchain imageURI (ipfs:// or https://). Falls back to the generated art if missing, unsafe or broken. */
  image?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const src = imageSrc(image);
  const [failed, setFailed] = useState<string | null>(null);
  const t = tone(seed);
  const h = hash(seed);
  const cx = 30 + (h % 40);
  const cy = 30 + ((h >> 8) % 40);
  return (
    <div className={`relative overflow-hidden ${className}`} style={{ background: t.bg }}>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <defs>
          <pattern id={`d${h}`} width="5" height="5" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="0.45" fill={t.fg} opacity="0.14" />
          </pattern>
        </defs>
        <rect width="100" height="100" fill={`url(#d${h})`} />
        <circle cx={cx} cy={cy} r={22 + (h % 10)} fill={t.accent} opacity="0.75" />
        <rect x={cx - 6} y={cy + 6} width="44" height="26" rx="6" fill={t.fg} opacity="0.12" transform={`rotate(${(h % 30) - 15} ${cx} ${cy})`} />
      </svg>
      {src && failed !== src && (
        // Plain <img>: arbitrary user-chosen hosts, so next/image remotePatterns can't be enumerated.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(src)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {children}
    </div>
  );
}

export function Avatar({ name, seed, size = 40 }: { name: string; seed: string; size?: number }) {
  const t = tone(seed + "avatar");
  return (
    <span
      className="inline-grid shrink-0 place-items-center rounded-full border-2 border-white font-bold"
      style={{ width: size, height: size, background: t.bg, color: t.fg, fontSize: size * 0.34 }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}
