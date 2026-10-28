"use client";

import { useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { isValidImageURI } from "@/lib/image";
import { Cover } from "./Cover";
import { Button } from "./ui";

type UploadInfo = { enabled: boolean; maxBytes: number };

/**
 * Campaign cover image: upload to IPFS (via /api/upload → Pinata) when configured, or paste an
 * ipfs:// / https:// link. Only the link is stored onchain. Optional — the generated cover is the fallback.
 */
export function ImageField({
  value,
  onChange,
  seed,
  locked = false,
}: {
  value: string;
  onChange: (uri: string) => void;
  seed: string;
  locked?: boolean;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string>();
  const [link, setLink] = useState("");

  const { data: info } = useQuery({
    queryKey: ["upload-info"],
    staleTime: Infinity,
    queryFn: async (): Promise<UploadInfo> => {
      const r = await fetch("/api/upload");
      return r.ok ? r.json() : { enabled: false, maxBytes: 0 };
    },
  });

  if (locked) {
    return (
      <div className="rounded-xl bg-rust-bg p-4 text-sm text-rust">
        <strong>Image locked by the platform admin.</strong> This campaign&apos;s image was removed during moderation and can&apos;t
        be replaced. The generated cover is shown instead.
      </div>
    );
  }

  async function upload(file: File) {
    setError(undefined);
    if (info && file.size > info.maxBytes) {
      setError(`Image must be ${Math.round(info.maxBytes / 1024 / 1024)} MB or smaller.`);
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body });
      const json = (await r.json().catch(() => ({}))) as { uri?: string; error?: string };
      if (!r.ok || !json.uri) throw new Error(json.error ?? `Upload failed (${r.status}).`);
      onChange(json.uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function useLink() {
    const v = link.trim();
    if (!isValidImageURI(v) || v === "") {
      setError("Use an ipfs:// link or an https:// image URL (max 256 characters).");
      return;
    }
    setError(undefined);
    onChange(v);
    setLink("");
  }

  return (
    <div className="space-y-3">
      <Cover seed={seed} image={value} className="h-40 rounded-2xl border border-line">
        {!value && (
          <span className="absolute bottom-3 left-3 rounded-full bg-paper/90 px-3 py-1 text-xs font-semibold text-ink-2">
            Generated cover (no image yet)
          </span>
        )}
      </Cover>

      {value && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-wash px-3.5 py-2.5">
          <span className="min-w-0 truncate font-mono text-xs text-ink-2" title={value}>{value}</span>
          <button type="button" onClick={() => onChange("")} className="text-xs font-semibold text-rust underline">
            Remove image
          </button>
        </div>
      )}

      {info?.enabled ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            id={`${id}-file`}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
          />
          <Button variant="soft" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? "Uploading to IPFS…" : value ? "Replace image" : "Upload image"}
          </Button>
          <span className="text-xs text-muted">PNG, JPEG, WebP or GIF · up to 3 MB · pinned to public IPFS</span>
        </div>
      ) : (
        <p className="text-xs text-muted">
          File upload is off (no <span className="font-mono">PINATA_JWT</span> on the server). Paste a link to an image instead.
        </p>
      )}

      <div>
        <label htmlFor={`${id}-link`} className="mb-1 block text-xs font-semibold text-ink-2">
          {info?.enabled ? "…or paste a link" : "Image link"}
        </label>
        <div className="flex gap-2">
          <input
            id={`${id}-link`}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="ipfs://… or https://…"
            className="h-11 min-w-0 flex-1 rounded-xl border border-[#C9D2CE] bg-paper px-3.5 font-mono text-sm outline-none focus:border-forest"
          />
          <Button variant="outline" onClick={useLink} disabled={!link.trim()}>
            Use link
          </Button>
        </div>
      </div>
      {error && <p role="alert" className="text-[13px] text-rust">{error}</p>}
      <p className="text-xs text-muted">Images are public and permanent on IPFS. Don&apos;t upload anything private.</p>
    </div>
  );
}
