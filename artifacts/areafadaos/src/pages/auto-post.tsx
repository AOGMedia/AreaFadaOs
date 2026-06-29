import { useState, useCallback, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { TierGuard } from "@/components/TierGuard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";
function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${API}${path}`, { credentials: "include", ...opts }).then(async r => {
    if (!r.ok) { const e = await r.json().catch(() => ({ error: r.statusText })); throw new Error(e.error ?? r.statusText); }
    if (r.status === 204) return null;
    return r.json();
  });
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#e1306c", tiktok: "#010101", x: "#1da1f2",
  facebook: "#1877f2", youtube: "#ff0000", threads: "#000000",
};
const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸", tiktok: "🎵", x: "🐦", facebook: "📘", youtube: "📺", threads: "🧵",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700", pending: "bg-yellow-100 text-yellow-700",
  pending_approval: "bg-orange-100 text-orange-700", approved: "bg-blue-100 text-blue-700",
  published: "bg-green-100 text-green-700", failed: "bg-red-100 text-red-700",
  rejected: "bg-red-100 text-red-700", scheduled: "bg-purple-100 text-purple-700",
  cancelled: "bg-gray-100 text-gray-500",
};

interface PostDraft {
  id: number; userId: number; title?: string; sourceCaption: string;
  mediaUrls: string[]; selectedPlatforms: string[]; selectedAccountIds: number[];
  platformVariants: Record<string, string>; platformHashtags: Record<string, string[]>;
  scheduledAt?: string; status: string; approvalRequired: boolean;
  complianceChecked: boolean; complianceScore?: number; createdAt: string; updatedAt: string;
}

interface PublishJob {
  id: number; draftId: number; platform: string; caption: string;
  status: string; attemptCount: number; maxAttempts: number;
  errorMessage?: string; errorCode?: string; scheduledAt?: string; publishedAt?: string; createdAt: string;
}

interface AccountGroup {
  id: number; name: string; description?: string; color: string;
  members: Array<{ id: number; platform: string; handle: string; displayName?: string }>;
}

interface ApprovalRequest {
  id: number; draftId: number; status: string; reviewNote?: string;
  reviewedAt?: string; createdAt: string;
  draft: PostDraft | null;
}

const ALL_PLATFORMS = ["instagram", "x", "tiktok", "facebook", "youtube", "threads"];

// Aspect ratios each platform crops to (width/height expressed as CSS aspect-ratio)
const PLATFORM_CROP_RATIOS: Record<string, string> = {
  instagram: "4/5", x: "16/9", tiktok: "9/16",
  facebook: "16/9", youtube: "16/9", threads: "1/1",
};
const PLATFORM_CROP_LABELS: Record<string, string> = {
  instagram: "4:5 portrait", x: "16:9 landscape", tiktok: "9:16 vertical",
  facebook: "16:9 landscape", youtube: "16:9 landscape", threads: "1:1 square",
};

export function AutoPostPage() {
  return (
    <AppShell>
      <TierGuard moduleKey="autoPost" requiredTier="brand">
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold">Auto-Post Engine</h1>
            <p className="text-muted-foreground text-sm mt-1">Write once. Distribute everywhere — AI-adapted per platform, per audience, per brand voice.</p>
          </div>
          <Tabs defaultValue="composer">
            <TabsList className="flex flex-wrap h-auto gap-1">
              <TabsTrigger value="composer">Composer</TabsTrigger>
              <TabsTrigger value="jobs">Job Status</TabsTrigger>
              <TabsTrigger value="groups">Account Groups</TabsTrigger>
              <TabsTrigger value="hashtags">Hashtag Engine</TabsTrigger>
              <TabsTrigger value="times">Posting Times</TabsTrigger>
              <TabsTrigger value="approvals">Approval Queue</TabsTrigger>
            </TabsList>
            <TabsContent value="composer" className="mt-4"><ComposerTab /></TabsContent>
            <TabsContent value="jobs" className="mt-4"><JobStatusTab /></TabsContent>
            <TabsContent value="groups" className="mt-4"><AccountGroupsTab /></TabsContent>
            <TabsContent value="hashtags" className="mt-4"><HashtagEngineTab /></TabsContent>
            <TabsContent value="times" className="mt-4"><PostingTimesTab /></TabsContent>
            <TabsContent value="approvals" className="mt-4"><ApprovalQueueTab /></TabsContent>
          </Tabs>
        </div>
      </TierGuard>
    </AppShell>
  );
}

// ─── Composer Tab ──────────────────────────────────────────────────────────────
function ComposerTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedDraftId, setSelectedDraftId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [sourceCaption, setSourceCaption] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["instagram", "x", "tiktok"]);
  const [scheduledAt, setScheduledAt] = useState("");
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [variants, setVariants] = useState<Record<string, { caption: string; hashtags: string[]; charCount: number }>>({});
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [mediaDataUrl, setMediaDataUrl] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: drafts = [] } = useQuery<PostDraft[]>({
    queryKey: ["auto-post-drafts"],
    queryFn: () => apiFetch("/auto-post/drafts"),
  });

  const selectedDraft = drafts.find(d => d.id === selectedDraftId);

  function loadDraft(draft: PostDraft) {
    setSelectedDraftId(draft.id);
    setTitle(draft.title ?? "");
    setSourceCaption(draft.sourceCaption);
    setSelectedPlatforms(draft.selectedPlatforms);
    setScheduledAt(draft.scheduledAt ? draft.scheduledAt.slice(0, 16) : "");
    setApprovalRequired(draft.approvalRequired);
    const v: Record<string, { caption: string; hashtags: string[]; charCount: number }> = {};
    for (const [p, cap] of Object.entries(draft.platformVariants ?? {})) {
      v[p] = { caption: cap as string, hashtags: (draft.platformHashtags?.[p] as string[]) ?? [], charCount: (cap as string).length };
    }
    setVariants(v);
  }

  function resetForm() {
    setSelectedDraftId(null); setTitle(""); setSourceCaption("");
    setSelectedPlatforms(["instagram", "x", "tiktok"]); setScheduledAt("");
    setApprovalRequired(false); setVariants({}); setMediaDataUrl(null);
  }

  function handleImageFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = e => setMediaDataUrl(e.target?.result as string);
    reader.readAsDataURL(file);
  }

  const saveDraft = useMutation({
    mutationFn: (body: Record<string, unknown>) => selectedDraftId
      ? apiFetch(`/auto-post/drafts/${selectedDraftId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : apiFetch("/auto-post/drafts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: (draft: PostDraft) => {
      qc.invalidateQueries({ queryKey: ["auto-post-drafts"] });
      if (!selectedDraftId) setSelectedDraftId(draft.id);
      toast({ title: "Draft saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const generateVariants = useMutation({
    mutationFn: () => {
      const id = selectedDraftId;
      if (!id) throw new Error("Save draft first");
      return apiFetch(`/auto-post/drafts/${id}/generate-variants`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platforms: selectedPlatforms }),
      });
    },
    onSuccess: (r: { variants: Record<string, { caption: string; hashtags: string[]; charCount: number }> }) => {
      setVariants(r.variants);
      qc.invalidateQueries({ queryKey: ["auto-post-drafts"] });
      toast({ title: "AI variants generated", description: `${Object.keys(r.variants).length} platform captions created` });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const checkCompliance = useMutation({
    mutationFn: () => {
      if (!selectedDraftId) throw new Error("Save draft first");
      return apiFetch(`/auto-post/drafts/${selectedDraftId}/compliance-check`, { method: "POST" });
    },
    onSuccess: (r: { overallScore: number; flags: Array<{ severity: string; message: string }>; recommendation: string }) => {
      qc.invalidateQueries({ queryKey: ["auto-post-drafts"] });
      const color = r.overallScore >= 90 ? "default" : "destructive";
      toast({ title: `Compliance score: ${r.overallScore}/100`, description: r.recommendation, variant: color });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const publish = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      // Pass current edited variants so the server persists them before creating jobs
      const editedVariants: Record<string, string> = {};
      const editedHashtags: Record<string, string[]> = {};
      for (const [platform, v] of Object.entries(variants)) {
        editedVariants[platform] = v.caption;
        if (v.hashtags?.length) editedHashtags[platform] = v.hashtags;
      }
      return apiFetch(`/auto-post/drafts/${selectedDraftId}/publish`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          ...(Object.keys(editedVariants).length > 0 ? { platformVariants: editedVariants } : {}),
          ...(Object.keys(editedHashtags).length > 0 ? { platformHashtags: editedHashtags } : {}),
        }),
      });
    },
    onSuccess: (r: { message: string; jobs: PublishJob[] }) => {
      qc.invalidateQueries({ queryKey: ["auto-post-drafts", "auto-post-jobs"] });
      setShowPublishDialog(false);
      toast({ title: "Published!", description: r.message });
    },
    onError: (e: Error) => { setShowPublishDialog(false); toast({ title: "Error", description: e.message, variant: "destructive" }); },
  });

  const PLATFORM_CHAR_LIMITS: Record<string, number> = { x: 280, instagram: 2200, tiktok: 300, facebook: 63206, youtube: 5000, threads: 500 };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      {/* Draft sidebar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Drafts</p>
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={resetForm}>+ New</Button>
        </div>
        {drafts.length === 0 && <p className="text-xs text-muted-foreground">No drafts yet.</p>}
        {drafts.map(d => (
          <button key={d.id} onClick={() => loadDraft(d)}
            className={`w-full text-left p-3 rounded-lg border transition-all ${selectedDraftId === d.id ? "ring-2 ring-primary bg-muted" : "hover:bg-muted/50"}`}>
            <p className="text-sm font-medium truncate">{d.title || "Untitled Draft"}</p>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={`text-xs ${STATUS_COLORS[d.status] ?? ""}`}>{d.status}</Badge>
              <span className="text-xs text-muted-foreground">{d.selectedPlatforms.length} platforms</span>
            </div>
            {d.complianceChecked && (
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs text-muted-foreground">Compliance:</span>
                <span className={`text-xs font-medium ${(d.complianceScore ?? 0) >= 90 ? "text-green-600" : "text-red-600"}`}>{d.complianceScore}/100</span>
              </div>
            )}
          </button>
        ))}
      </div>

      {/* Main composer */}
      <div className="xl:col-span-2 space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Content Composer</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Title (optional)</Label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Newsletter Launch, Monday Motivation…" />
            </div>
            <div className="space-y-1">
              <Label>Source Caption <span className="text-muted-foreground font-normal text-xs">— AI will adapt this per platform</span></Label>
              <Textarea value={sourceCaption} onChange={e => setSourceCaption(e.target.value)}
                placeholder="Write your core message here. Be authentic. AI will handle the platform-specific adaptation — tone, length, hashtags, and CTA."
                className="min-h-28 resize-none" />
              <p className="text-xs text-muted-foreground text-right">{sourceCaption.length} chars</p>
            </div>

            {/* Image Upload with per-platform crop preview */}
            <div className="space-y-2">
              <Label>Media <span className="text-muted-foreground font-normal text-xs">— optional image attachment</span></Label>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageFile(f); }} />
              {!mediaDataUrl ? (
                <div
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${isDraggingFile ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"}`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); setIsDraggingFile(true); }}
                  onDragLeave={() => setIsDraggingFile(false)}
                  onDrop={e => { e.preventDefault(); setIsDraggingFile(false); const f = e.dataTransfer.files[0]; if (f) handleImageFile(f); }}>
                  <p className="text-2xl mb-1">🖼️</p>
                  <p className="text-sm font-medium">Drop an image here or click to upload</p>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG, GIF, WebP — crop previews shown per platform below</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative inline-block">
                    <img src={mediaDataUrl} alt="Uploaded" className="h-24 w-auto rounded-lg object-cover border" />
                    <button onClick={() => setMediaDataUrl(null)}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center font-bold shadow">×</button>
                  </div>
                  <p className="text-xs text-muted-foreground">Click × to remove. CSS crop previews (aspect-ratio simulation) appear in each platform variant card below. Actual image resize happens at publish time when platform accounts are connected.</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Target Platforms</Label>
              <div className="flex flex-wrap gap-2">
                {ALL_PLATFORMS.map(p => (
                  <button key={p} onClick={() => setSelectedPlatforms(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border-2 transition-all ${selectedPlatforms.includes(p) ? "text-white border-transparent" : "border-current opacity-50"}`}
                    style={{ backgroundColor: selectedPlatforms.includes(p) ? PLATFORM_COLORS[p] : undefined, color: selectedPlatforms.includes(p) ? "white" : PLATFORM_COLORS[p] }}>
                    {PLATFORM_ICONS[p]} {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Schedule (optional)</Label>
                <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={approvalRequired} onChange={e => setApprovalRequired(e.target.checked)} className="rounded" />
                  <span className="text-sm">Require approval before publish</span>
                </label>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => saveDraft.mutate({ title: title || undefined, sourceCaption, selectedPlatforms, scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined, approvalRequired, mediaUrls: mediaDataUrl ? [mediaDataUrl] : [] })}
                disabled={saveDraft.isPending || !sourceCaption.trim()} size="sm">
                {saveDraft.isPending ? "Saving…" : "Save Draft"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => generateVariants.mutate()}
                disabled={generateVariants.isPending || !selectedDraftId || selectedPlatforms.length === 0}>
                {generateVariants.isPending ? "Generating…" : "✨ Generate AI Variants"}
              </Button>
              <Button variant="outline" size="sm" onClick={() => checkCompliance.mutate()}
                disabled={checkCompliance.isPending || !selectedDraftId}>
                {checkCompliance.isPending ? "Checking…" : "🛡 Compliance Check"}
              </Button>
              <Button variant="default" size="sm" className="ml-auto"
                onClick={() => setShowPublishDialog(true)}
                disabled={!selectedDraftId || selectedPlatforms.length === 0}>
                🚀 Publish
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Platform variant cards */}
        {Object.keys(variants).length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Platform Variants</p>
            {selectedPlatforms.filter(p => variants[p]).map(platform => {
              const v = variants[platform];
              const limit = PLATFORM_CHAR_LIMITS[platform] ?? 500;
              const overLimit = v.caption.length > limit;
              return (
                <Card key={platform}>
                  <CardContent className="py-3 px-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{PLATFORM_ICONS[platform]}</span>
                      <span className="text-sm font-medium capitalize">{platform}</span>
                      <span className={`text-xs ml-auto font-mono ${overLimit ? "text-red-500 font-bold" : "text-muted-foreground"}`}>
                        {v.caption.length}/{limit}
                        {overLimit && <span className="ml-1 text-red-500">⚠ over limit</span>}
                      </span>
                    </div>
                    {/* Per-platform crop preview */}
                    {mediaDataUrl && (
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0">
                          <div
                            className="overflow-hidden rounded-md border bg-muted"
                            style={{
                              aspectRatio: PLATFORM_CROP_RATIOS[platform] ?? "1/1",
                              width: platform === "tiktok" ? 48 : 80,
                              maxHeight: 120,
                            }}>
                            <img src={mediaDataUrl} alt={`${platform} crop`}
                              className="w-full h-full object-cover" />
                          </div>
                          <p className="text-[10px] text-muted-foreground text-center mt-0.5">{PLATFORM_CROP_LABELS[platform]}</p>
                        </div>
                        <Textarea value={v.caption}
                          onChange={e => setVariants(prev => ({ ...prev, [platform]: { ...prev[platform], caption: e.target.value, charCount: e.target.value.length } }))}
                          className="text-sm min-h-20 resize-none flex-1" />
                      </div>
                    )}
                    {!mediaDataUrl && (
                      <Textarea value={v.caption}
                        onChange={e => setVariants(prev => ({ ...prev, [platform]: { ...prev[platform], caption: e.target.value, charCount: e.target.value.length } }))}
                        className="text-sm min-h-20 resize-none" />
                    )}
                    {v.hashtags?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {v.hashtags.map(h => (
                          <Badge key={h} variant="outline" className="text-xs">{h}</Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {selectedDraft && Object.keys(variants).length === 0 && selectedDraft.platformVariants && Object.keys(selectedDraft.platformVariants).length > 0 && (
          <div className="space-y-3">
            <p className="text-sm font-medium">Saved Platform Variants</p>
            {Object.entries(selectedDraft.platformVariants).map(([platform, caption]) => (
              <Card key={platform}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span>{PLATFORM_ICONS[platform]}</span>
                    <span className="text-sm font-medium capitalize">{platform}</span>
                    <span className="text-xs text-muted-foreground ml-auto">{(caption as string).length} chars</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{caption as string}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {showPublishDialog && selectedDraftId && (
        <Dialog open onOpenChange={() => setShowPublishDialog(false)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Confirm Publish</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Publish <strong>{title || "this draft"}</strong> to {selectedPlatforms.length} platform(s).</p>
              <div className="flex flex-wrap gap-1.5">
                {selectedPlatforms.map(p => (
                  <span key={p} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white" style={{ backgroundColor: PLATFORM_COLORS[p] }}>
                    {PLATFORM_ICONS[p]} {p}
                  </span>
                ))}
              </div>
              {scheduledAt && <p className="text-xs text-muted-foreground">Scheduled: {new Date(scheduledAt).toLocaleString("en-NG")}</p>}
              <div className="p-2.5 rounded-lg bg-amber-50 text-amber-800 text-xs">
                Actual platform push is <strong>stubbed</strong> — connect platform accounts via the Scheduling tab to enable live posting.
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => setShowPublishDialog(false)}>Cancel</Button>
                <Button size="sm" onClick={() => publish.mutate({ scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : undefined })}
                  disabled={publish.isPending}>
                  {publish.isPending ? "Publishing…" : "Confirm Publish"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Job Status Tab ────────────────────────────────────────────────────────────
function JobStatusTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [filterStatus, setFilterStatus] = useState("all");
  const [dismissedAuthBanners, setDismissedAuthBanners] = useState<Set<number>>(new Set());
  const prevStatusRef = useRef<Record<number, string>>({});

  const { data: jobs = [], dataUpdatedAt } = useQuery<PublishJob[]>({
    queryKey: ["auto-post-jobs", filterStatus],
    queryFn: () => apiFetch(`/auto-post/publish-jobs${filterStatus !== "all" ? `?status=${filterStatus}` : ""}`),
    refetchInterval: 5000,
  });

  useEffect(() => {
    const prev = prevStatusRef.current;
    jobs.forEach(job => {
      const oldStatus = prev[job.id];
      if (oldStatus !== undefined && oldStatus !== job.status) {
        if (job.status === "published") {
          toast({
            title: "Post published! 🎉",
            description: `${PLATFORM_ICONS[job.platform] ?? "📱"} ${job.platform} — draft #${job.draftId} went live successfully.`,
          });
        } else if (job.status === "failed") {
          toast({
            title: "Publish failed",
            description: `${PLATFORM_ICONS[job.platform] ?? "📱"} ${job.platform} — ${job.errorMessage ?? "Unknown error"}`,
            variant: "destructive",
          });
        }
      }
    });
    prevStatusRef.current = Object.fromEntries(jobs.map(j => [j.id, j.status]));
  }, [dataUpdatedAt]);

  const retry = useMutation({
    mutationFn: (id: number) => apiFetch(`/auto-post/publish-jobs/${id}/retry`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["auto-post-jobs"] }); toast({ title: "Job queued for retry" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const allJobs: PublishJob[] = useQuery<PublishJob[]>({
    queryKey: ["auto-post-jobs", "all"],
    queryFn: () => apiFetch("/auto-post/publish-jobs"),
    refetchInterval: 5000,
  }).data ?? [];

  const failedJobs = allJobs.filter(j => j.status === "failed");
  const authFailureJobs = failedJobs.filter(j => j.errorCode === "auth_failure");
  const visibleAuthFailures = authFailureJobs.filter(j => !dismissedAuthBanners.has(j.id));
  const otherFailedJobs = failedJobs.filter(
    j => !authFailureJobs.find(a => a.id === j.id) && !dismissedAuthBanners.has(j.id)
  );

  return (
    <div className="space-y-4">
      {/* Auth failure reconnect banners */}
      {visibleAuthFailures.map(job => (
        <div key={job.id} className="flex items-start gap-3 p-4 rounded-lg border border-amber-200 bg-amber-50">
          <span className="text-xl mt-0.5">🔑</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900">Account reconnection required</p>
            <p className="text-xs text-amber-800 mt-0.5">
              {PLATFORM_ICONS[job.platform] ?? "📱"} <span className="capitalize">{job.platform}</span> — your access token has expired or been revoked.
              Reconnect your account to resume posting.
            </p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" className="h-7 text-xs bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => navigate("/scheduling")}>
              Reconnect Account
            </Button>
            <button className="text-amber-600 hover:text-amber-800 text-xs"
              onClick={() => setDismissedAuthBanners(prev => new Set([...prev, job.id]))}>✕</button>
          </div>
        </div>
      ))}

      {/* General failure banners */}
      {otherFailedJobs.map(job => (
        <div key={job.id} className="flex items-start gap-3 p-4 rounded-lg border border-red-200 bg-red-50">
          <span className="text-xl mt-0.5">❌</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-900">
              {PLATFORM_ICONS[job.platform] ?? "📱"} <span className="capitalize">{job.platform}</span> publish failed
              <span className="font-normal text-red-700 ml-1">— draft #{job.draftId}</span>
            </p>
            <p className="text-xs text-red-700 mt-0.5 break-words">{job.errorMessage ?? "Unknown error"}</p>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {job.attemptCount < job.maxAttempts && (
              <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => retry.mutate(job.id)} disabled={retry.isPending}>
                Retry
              </Button>
            )}
            <button className="text-red-400 hover:text-red-600 text-xs"
              onClick={() => setDismissedAuthBanners(prev => new Set([...prev, job.id]))}>✕</button>
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all", "pending", "published", "failed", "cancelled"].map(s => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {failedJobs.length > 0 && (
          <Badge className="bg-red-100 text-red-700">{failedJobs.length} failed — retry available</Badge>
        )}
        <span className="text-xs text-muted-foreground ml-auto">Auto-refreshing every 5s</span>
      </div>

      {jobs.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No publish jobs yet. Publish a draft from the Composer tab.</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b">
              <th className="text-left pb-2 pr-4">Platform</th>
              <th className="text-left pb-2 pr-4">Draft ID</th>
              <th className="text-left pb-2 pr-4">Status</th>
              <th className="text-left pb-2 pr-4">Attempts</th>
              <th className="text-left pb-2 pr-4">When</th>
              <th className="text-left pb-2 pr-4">Error</th>
              <th className="text-left pb-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map(job => (
              <tr key={job.id} className={`border-b last:border-0 ${job.status === "failed" ? "bg-red-50/40" : job.status === "published" ? "bg-green-50/40" : ""}`}>
                <td className="py-2 pr-4">
                  <span className="flex items-center gap-1.5">
                    <span>{PLATFORM_ICONS[job.platform] ?? "📱"}</span>
                    <span className="capitalize">{job.platform}</span>
                  </span>
                </td>
                <td className="py-2 pr-4 text-muted-foreground">#{job.draftId}</td>
                <td className="py-2 pr-4">
                  <Badge className={`text-xs ${STATUS_COLORS[job.status] ?? ""}`}>{job.status}</Badge>
                </td>
                <td className="py-2 pr-4 text-center">{job.attemptCount}/{job.maxAttempts}</td>
                <td className="py-2 pr-4 text-xs text-muted-foreground">
                  {job.publishedAt
                    ? <span className="text-green-700 font-medium">✅ {new Date(job.publishedAt).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" })}</span>
                    : job.scheduledAt
                    ? new Date(job.scheduledAt).toLocaleString("en-NG", { dateStyle: "short", timeStyle: "short" })
                    : "—"}
                </td>
                <td className="py-2 pr-4 text-xs text-red-600 max-w-48">
                  {job.errorMessage
                    ? <span className="break-words line-clamp-2" title={job.errorMessage}>{job.errorMessage}</span>
                    : <span className="text-muted-foreground">—</span>}
                </td>
                <td className="py-2">
                  {job.status === "failed" && job.attemptCount < job.maxAttempts && (
                    <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => retry.mutate(job.id)} disabled={retry.isPending}>
                      Retry
                    </Button>
                  )}
                  {job.status === "failed" && job.attemptCount >= job.maxAttempts && (
                    <span className="text-xs text-muted-foreground">Max retries</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Account Groups Tab ────────────────────────────────────────────────────────
function AccountGroupsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ name: "", description: "", color: "#e11d48" });
  const [members, setMembers] = useState<Array<{ platform: string; handle: string; displayName: string }>>([]);
  const [newMember, setNewMember] = useState({ platform: "instagram", handle: "", displayName: "" });
  const [publishGroupId, setPublishGroupId] = useState<number | null>(null);
  const [publishCaption, setPublishCaption] = useState("");
  const [publishDraftId, setPublishDraftId] = useState<number | null>(null);
  const [memberCaptions, setMemberCaptions] = useState<Record<number, string>>({});
  const [showPerMemberCustomize, setShowPerMemberCustomize] = useState(false);

  const { data: groups = [] } = useQuery<AccountGroup[]>({
    queryKey: ["account-groups"],
    queryFn: () => apiFetch("/auto-post/account-groups"),
  });

  const { data: drafts = [] } = useQuery<PostDraft[]>({
    queryKey: ["auto-post-drafts"],
    queryFn: () => apiFetch("/auto-post/drafts"),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => editingId
      ? apiFetch(`/auto-post/account-groups/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : apiFetch("/auto-post/account-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["account-groups"] });
      toast({ title: editingId ? "Group updated" : "Group created" });
      setOpen(false); setEditingId(null); setForm({ name: "", description: "", color: "#e11d48" }); setMembers([]);
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/auto-post/account-groups/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["account-groups"] }); toast({ title: "Group deleted" }); },
  });

  const publishGroup = useMutation({
    mutationFn: ({ groupId, body }: { groupId: number; body: Record<string, unknown> }) =>
      apiFetch(`/auto-post/account-groups/${groupId}/publish`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: (r: { message: string }) => {
      qc.invalidateQueries({ queryKey: ["auto-post-jobs"] });
      toast({ title: "Group published!", description: r.message });
      setPublishGroupId(null); setPublishCaption("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function openAdd() { setEditingId(null); setForm({ name: "", description: "", color: "#e11d48" }); setMembers([]); setOpen(true); }
  function openEdit(g: AccountGroup) {
    setEditingId(g.id); setForm({ name: g.name, description: g.description ?? "", color: g.color });
    setMembers(g.members.map(m => ({ platform: m.platform, handle: m.handle, displayName: m.displayName ?? "" })));
    setOpen(true);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Create named groups of accounts for one-click group publishing.</p>
        <Button size="sm" onClick={openAdd}>+ New Group</Button>
      </div>

      {groups.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No groups yet.</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map(g => (
          <Card key={g.id}>
            <CardContent className="py-3 px-4 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }} />
                <span className="font-medium text-sm">{g.name}</span>
                <Button size="sm" variant="ghost" className="h-6 text-xs ml-auto" onClick={() => openEdit(g)}>Edit</Button>
                <Button size="sm" variant="ghost" className="h-6 text-xs text-red-600 hover:text-red-700" onClick={() => del.mutate(g.id)}>Delete</Button>
              </div>
              {g.description && <p className="text-xs text-muted-foreground">{g.description}</p>}
              <div className="flex flex-wrap gap-1.5">
                {g.members.map(m => (
                  <span key={m.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: `${PLATFORM_COLORS[m.platform]}20`, color: PLATFORM_COLORS[m.platform] }}>
                    {PLATFORM_ICONS[m.platform]} {m.handle}
                  </span>
                ))}
              </div>
              <Button size="sm" className="w-full mt-1" onClick={() => setPublishGroupId(g.id)}>
                🚀 Publish to Group
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? "Edit" : "New"} Account Group</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-1"><Label>Group Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="All Charly Boy Accounts" /></div>
              <div className="space-y-1"><Label>Color</Label><Input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} /></div>
            </div>
            <div className="space-y-1"><Label>Description (optional)</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>

            <div className="space-y-2">
              <Label>Members</Label>
              {members.map((m, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-muted/40">
                  <span>{PLATFORM_ICONS[m.platform]}</span>
                  <span className="text-sm flex-1">{m.handle}</span>
                  <span className="text-xs text-muted-foreground">{m.displayName}</span>
                  <button onClick={() => setMembers(prev => prev.filter((_, j) => j !== i))} className="text-xs text-red-500 hover:text-red-700">×</button>
                </div>
              ))}
              <div className="flex gap-2">
                <Select value={newMember.platform} onValueChange={v => setNewMember(m => ({ ...m, platform: v }))}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>{ALL_PLATFORMS.map(p => <SelectItem key={p} value={p}>{PLATFORM_ICONS[p]} {p}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="flex-1" value={newMember.handle} onChange={e => setNewMember(m => ({ ...m, handle: e.target.value }))} placeholder="@handle" />
                <Input className="flex-1" value={newMember.displayName} onChange={e => setNewMember(m => ({ ...m, displayName: e.target.value }))} placeholder="Display name" />
                <Button size="sm" variant="outline" onClick={() => { if (newMember.handle) { setMembers(prev => [...prev, { ...newMember }]); setNewMember({ platform: "instagram", handle: "", displayName: "" }); } }}>Add</Button>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={() => save.mutate({ ...form, members })} disabled={save.isPending || !form.name}>
                {save.isPending ? "Saving…" : "Save Group"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {publishGroupId !== null && (() => {
        const grp = groups.find(g => g.id === publishGroupId);
        return (
          <Dialog open onOpenChange={() => { setPublishGroupId(null); setPublishDraftId(null); setPublishCaption(""); setMemberCaptions({}); setShowPerMemberCustomize(false); }}>
            <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Publish to Group: {grp?.name}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Use existing draft</Label>
                  <Select value={publishDraftId ? String(publishDraftId) : ""} onValueChange={v => {
                    const d = drafts.find(d => d.id === Number(v));
                    if (d) { setPublishDraftId(d.id); setPublishCaption(d.sourceCaption); }
                  }}>
                    <SelectTrigger><SelectValue placeholder="Select a draft (uses its variants + media)…" /></SelectTrigger>
                    <SelectContent>
                      {drafts.filter(d => d.status === "draft" || d.status === "approved" || d.status === "published").map(d => (
                        <SelectItem key={d.id} value={String(d.id)}>{d.title || "Untitled"} — {d.selectedPlatforms.join(", ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {publishDraftId && <p className="text-xs text-green-600">✓ Draft selected — platform variants and media will be used automatically.</p>}
                </div>

                <div className="space-y-1">
                  <Label>Caption {publishDraftId ? "(overrides draft source caption)" : ""}</Label>
                  <Textarea value={publishCaption} onChange={e => setPublishCaption(e.target.value)} placeholder="Caption for all accounts (platform variants from draft take priority)…" className="min-h-16 resize-none text-sm" />
                </div>

                {/* Per-account caption customization */}
                {grp && grp.members.length > 0 && (
                  <div className="space-y-2">
                    <button className="flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
                      onClick={() => setShowPerMemberCustomize(v => !v)}>
                      {showPerMemberCustomize ? "▼" : "▶"} Per-account caption customization ({grp.members.length} accounts)
                    </button>
                    {showPerMemberCustomize && (
                      <div className="space-y-2 pl-2 border-l-2 border-muted">
                        {grp.members.map(m => (
                          <div key={m.id} className="space-y-1">
                            <Label className="text-xs flex items-center gap-1">
                              <span>{PLATFORM_ICONS[m.platform]}</span>
                              <span className="font-medium">{m.handle}</span>
                              <span className="text-muted-foreground font-normal">— leave blank to use group caption</span>
                            </Label>
                            <Textarea
                              value={memberCaptions[m.id] ?? ""}
                              onChange={e => setMemberCaptions(prev => ({ ...prev, [m.id]: e.target.value }))}
                              placeholder={`Custom caption for ${m.handle}…`}
                              className="text-xs min-h-14 resize-none" />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => { setPublishGroupId(null); setPublishDraftId(null); setPublishCaption(""); setMemberCaptions({}); setShowPerMemberCustomize(false); }}>Cancel</Button>
                  <Button size="sm" disabled={(!publishCaption.trim() && !publishDraftId) || publishGroup.isPending}
                    onClick={() => publishGroup.mutate({
                      groupId: publishGroupId!,
                      body: {
                        ...(publishDraftId ? { draftId: publishDraftId } : {}),
                        sourceCaption: publishCaption || undefined,
                        memberCaptions: Object.keys(memberCaptions).length > 0 ? memberCaptions : undefined,
                      }
                    })}>
                    {publishGroup.isPending ? "Publishing…" : `Publish to ${grp?.members.length ?? 0} accounts`}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

// ─── Hashtag Engine Tab ────────────────────────────────────────────────────────
function HashtagEngineTab() {
  const [platform, setPlatform] = useState("instagram");
  const [region, setRegion] = useState("NG");
  const [niche, setNiche] = useState("general");
  const [copiedTags, setCopiedTags] = useState<string[]>([]);

  const { data, isFetching } = useQuery<{ allSuggestions: string[]; dbTags: Array<{ hashtag: string; trendScore: number }>; curatedTags: string[] }>({
    queryKey: ["hashtag-engine", platform, region, niche],
    queryFn: () => apiFetch(`/auto-post/hashtag-engine?platform=${platform}&region=${region}&niche=${niche !== "general" ? niche : ""}`),
  });

  function toggleTag(tag: string) {
    setCopiedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  const copyTags = useCallback(() => {
    navigator.clipboard.writeText(copiedTags.join(" "));
  }, [copiedTags]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Hashtag Suggestion Engine — Nigeria / Ghana / Diaspora</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label>Platform</Label>
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_PLATFORMS.map(p => <SelectItem key={p} value={p}>{PLATFORM_ICONS[p]} {p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Region</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NG">🇳🇬 Nigeria</SelectItem>
                  <SelectItem value="GH">🇬🇭 Ghana</SelectItem>
                  <SelectItem value="diaspora">🌍 Diaspora</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Niche</Label>
              <Select value={niche} onValueChange={setNiche}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["general", "music", "culture", "lifestyle", "creator", "brand"].map(n => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Trending (DB Cache)</CardTitle></CardHeader>
          <CardContent>
            {isFetching ? <p className="text-xs text-muted-foreground">Loading…</p> : (
              <div className="flex flex-wrap gap-1.5">
                {(data?.dbTags ?? []).map(t => (
                  <button key={t.hashtag} onClick={() => toggleTag(t.hashtag)}
                    className={`px-2 py-0.5 rounded-full text-xs border transition-all ${copiedTags.includes(t.hashtag) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary"}`}>
                    {t.hashtag} <span className="opacity-60">{t.trendScore}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Curated — {region} {niche}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {(data?.curatedTags ?? []).map(t => (
                <button key={t} onClick={() => toggleTag(t)}
                  className={`px-2 py-0.5 rounded-full text-xs border transition-all ${copiedTags.includes(t) ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary"}`}>
                  {t}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {copiedTags.length > 0 && (
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium">Selected Tags ({copiedTags.length})</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCopiedTags([])}>Clear</Button>
                <Button size="sm" className="h-7 text-xs" onClick={copyTags}>Copy All</Button>
              </div>
            </div>
            <p className="text-xs font-mono text-muted-foreground break-all">{copiedTags.join(" ")}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Posting Times Tab ─────────────────────────────────────────────────────────
function PostingTimesTab() {
  const { data } = useQuery<{ recommendations: Record<string, { slots: string[]; timezone: string; explanation: string }>; note: string }>({
    queryKey: ["posting-times"],
    queryFn: () => apiFetch("/auto-post/posting-time-recommendations"),
  });

  const HOURS = Array.from({ length: 18 }, (_, i) => i + 5); // 5am-10pm WAT

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-muted text-xs text-muted-foreground">
        {data?.note ?? "Times are in WAT (West Africa Time, UTC+1)."}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Object.entries(data?.recommendations ?? {}).map(([platform, info]) => (
          <Card key={platform}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <span>{PLATFORM_ICONS[platform]}</span>
                <span className="capitalize">{platform}</span>
                <Badge variant="outline" className="ml-auto text-xs">{info.timezone}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Simple heatmap */}
              <div className="flex gap-0.5">
                {HOURS.map(h => {
                  const isOpt = info.slots.some(s => parseInt(s) === h);
                  return (
                    <div key={h} className={`flex-1 h-8 rounded-sm flex items-center justify-center text-[9px] font-medium transition-all ${isOpt ? "text-white" : "bg-muted text-muted-foreground"}`}
                      style={{ backgroundColor: isOpt ? PLATFORM_COLORS[platform] : undefined }}
                      title={`${h}:00 WAT${isOpt ? " — peak" : ""}`}>
                      {h % 6 === 0 ? `${h > 12 ? h - 12 : h}${h >= 12 ? "p" : "a"}` : ""}
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {info.slots.map(slot => (
                  <Badge key={slot} className="text-xs" style={{ backgroundColor: PLATFORM_COLORS[platform], color: "white" }}>
                    ⭐ {slot} WAT
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{info.explanation}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Approval Queue Tab ────────────────────────────────────────────────────────
function ApprovalQueueTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filterStatus, setFilterStatus] = useState("pending");
  const [reviewNote, setReviewNote] = useState("");
  const [reviewingId, setReviewingId] = useState<number | null>(null);

  const { data: requests = [] } = useQuery<ApprovalRequest[]>({
    queryKey: ["approval-requests", filterStatus],
    queryFn: () => apiFetch(`/auto-post/approval-requests${filterStatus !== "all" ? `?status=${filterStatus}` : ""}`),
  });

  const review = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/auto-post/approval-requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reviewNote }) }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ["approval-requests", "auto-post-drafts"] });
      toast({ title: `Request ${vars.status}` });
      setReviewingId(null); setReviewNote("");
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            {["all", "pending", "approved", "rejected", "edited"].map(s => (
              <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {requests.filter(r => r.status === "pending").length > 0 && (
          <Badge className="bg-orange-100 text-orange-700">{requests.filter(r => r.status === "pending").length} pending review</Badge>
        )}
      </div>

      {requests.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">No approval requests.</p>}

      <div className="space-y-3">
        {requests.map(req => (
          <Card key={req.id}>
            <CardContent className="py-3 px-4 space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{req.draft?.title || `Draft #${req.draftId}`}</span>
                    <Badge className={`text-xs ${STATUS_COLORS[req.status] ?? ""}`}>{req.status}</Badge>
                    <span className="text-xs text-muted-foreground ml-auto">{new Date(req.createdAt).toLocaleDateString("en-NG")}</span>
                  </div>
                  {req.draft?.sourceCaption && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{req.draft.sourceCaption}</p>
                  )}
                  {req.draft?.selectedPlatforms && (
                    <div className="flex gap-1 mt-1">
                      {(req.draft.selectedPlatforms as string[]).map(p => (
                        <span key={p} className="text-xs">{PLATFORM_ICONS[p]}</span>
                      ))}
                    </div>
                  )}
                  {req.reviewNote && <p className="text-xs text-muted-foreground mt-1 italic">Note: {req.reviewNote}</p>}
                </div>
                {req.status === "pending" && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => { setReviewingId(req.id); }}>Review</Button>
                  </div>
                )}
              </div>

              {reviewingId === req.id && (
                <div className="pt-2 border-t space-y-2">
                  <Textarea value={reviewNote} onChange={e => setReviewNote(e.target.value)} placeholder="Optional review note…" className="text-sm min-h-16 resize-none" />
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700" onClick={() => review.mutate({ id: req.id, status: "approved" })} disabled={review.isPending}>✅ Approve</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-orange-700 border-orange-300" onClick={() => review.mutate({ id: req.id, status: "edited" })} disabled={review.isPending}>✏️ Request Edit</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs text-red-700 border-red-300" onClick={() => review.mutate({ id: req.id, status: "rejected" })} disabled={review.isPending}>❌ Reject</Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs ml-auto" onClick={() => { setReviewingId(null); setReviewNote(""); }}>Cancel</Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
