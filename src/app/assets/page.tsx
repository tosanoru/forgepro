"use client";

import { useMemo, useRef, useState } from "react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { useBrandAssets, type BrandAsset } from "@/lib/use-assets";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Upload, FileImage, FileVideo, File as FileIcon, Download, Trash2, Loader2, FolderOpen } from "lucide-react";
import { toast } from "sonner";

function fileIconFor(mimeType: string) {
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.startsWith("video/")) return FileVideo;
  return FileIcon;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AssetsPage() {
  const { assets, loading, upload, download, remove } = useBrandAssets();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeFolder, setActiveFolder] = useState<string>("All");
  const [folderInput, setFolderInput] = useState("General");

  const folders = useMemo(() => ["All", ...Array.from(new Set(assets.map((a) => a.folder)))], [assets]);
  const visible = activeFolder === "All" ? assets : assets.filter((a) => a.folder === activeFolder);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setProgress(0);
    try {
      await upload(file, folderInput.trim() || "General", setProgress);
      toast.success("Uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <AppShell>
      <PageHeader
        eyebrow="№ 06 · BRAND ASSETS"
        title="Assets"
        subtitle="Logos, templates, footage, and anything else the team reuses."
        action={
          <div className="flex items-center gap-2">
            <Input
              value={folderInput}
              onChange={(e) => setFolderInput(e.target.value)}
              placeholder="Folder"
              className="w-32 text-xs"
            />
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFile} />
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> {progress}%
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" /> Upload
                </>
              )}
            </Button>
          </div>
        }
      />

      <div className="mb-5 flex flex-wrap gap-1.5">
        {folders.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFolder(f)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              activeFolder === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            <FolderOpen className="h-3 w-3" /> {f}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-40 items-center justify-center gap-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading assets…
        </div>
      ) : visible.length === 0 ? (
        <div className="border border-dashed border-border p-10 text-center">
          <FolderOpen className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">No assets in this folder yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {visible.map((asset: BrandAsset) => {
            const Icon = fileIconFor(asset.mimeType);
            return (
              <Card key={asset.id} className="group relative overflow-hidden">
                <CardHeader>
                  <Icon className="h-6 w-6 text-primary" />
                  <CardTitle className="mt-1 line-clamp-2 text-sm">{asset.name}</CardTitle>
                  <CardDescription className="text-[11px]">{formatSize(asset.sizeBytes)} · {asset.folder}</CardDescription>
                </CardHeader>
                <div className="flex gap-1 border-t border-border p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <Button size="sm" variant="ghost" className="flex-1" onClick={() => download(asset.id)}>
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="flex-1 text-rose-stat hover:text-rose-stat"
                    onClick={async () => {
                      await remove(asset.id);
                      toast.success("Deleted");
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
