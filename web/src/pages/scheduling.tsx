import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { TierGuard } from "@/components/TierGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  useListPosts,
  useCreatePost,
  useUpdatePost,
  useDeletePost,
  useListCampaigns,
  useCreateCampaign,
  useListPlatformAccounts,
  useGetTrendingHashtags,
  useGenerateCaptions,
  useRecyclePost,
  useBulkUploadPosts,
} from "@workspace/api-client-react";
import {
  Calendar,
  Plus,
  Sparkles,
  Hash,
  Upload,
  RefreshCw,
  Instagram,
  Youtube,
  Trash2,
  Clock,
  CheckCircle2,
  XCircle,
  FileText,
  ChevronLeft,
  ChevronRight,
  Copy,
  Loader2,
  Tag,
  Link,
  History,
  LayoutGrid,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameDay,
  isToday,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  parseISO,
} from "date-fns";

// ── types ──────────────────────────────────────────────────────────────────

type Platform = "instagram" | "tiktok" | "x" | "youtube" | "facebook" | "threads";
type CaptionTone = "pidgin" | "yoruba" | "igbo" | "hausa" | "formal";
type PostStatus = "draft" | "scheduled" | "published" | "failed";

const PLATFORMS: { key: Platform; label: string; color: string; icon: React.ReactNode }[] = [
  { key: "instagram", label: "Instagram", color: "bg-pink-500", icon: <Instagram className="w-3 h-3" /> },
  { key: "tiktok", label: "TikTok", color: "bg-black", icon: <span className="text-[10px] font-black">TT</span> },
  { key: "x", label: "X", color: "bg-gray-900", icon: <span className="text-[10px] font-black">𝕏</span> },
  { key: "youtube", label: "YouTube", color: "bg-red-600", icon: <Youtube className="w-3 h-3" /> },
  { key: "facebook", label: "Facebook", color: "bg-blue-600", icon: <span className="text-[10px] font-black">f</span> },
  { key: "threads", label: "Threads", color: "bg-gray-700", icon: <span className="text-[10px] font-black">@</span> },
];

const TONES: { key: CaptionTone; label: string; flag: string }[] = [
  { key: "pidgin", label: "Nigerian Pidgin", flag: "🇳🇬" },
  { key: "yoruba", label: "Yoruba", flag: "🌿" },
  { key: "igbo", label: "Igbo", flag: "🦅" },
  { key: "hausa", label: "Hausa", flag: "🌙" },
  { key: "formal", label: "Formal English", flag: "💼" },
];

const STATUS_CONFIG: Record<PostStatus, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: "Draft", color: "bg-gray-100 text-gray-600", icon: <FileText className="w-3 h-3" /> },
  scheduled: { label: "Scheduled", color: "bg-blue-100 text-blue-700", icon: <Clock className="w-3 h-3" /> },
  published: { label: "Published", color: "bg-emerald-100 text-emerald-700", icon: <CheckCircle2 className="w-3 h-3" /> },
  failed: { label: "Failed", color: "bg-red-100 text-red-700", icon: <XCircle className="w-3 h-3" /> },
};

const CAMPAIGN_COLORS = ["#2dd172", "#6366f1", "#f59e0b", "#ef4444", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981"];

// ── helpers ──────────────────────────────────────────────────────────────

function PlatformBadge({ platform }: { platform: Platform }) {
  const p = PLATFORMS.find((x) => x.key === platform);
  if (!p) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-white text-[10px] font-medium ${p.color}`}>
      {p.icon} {p.label}
    </span>
  );
}

function StatusBadge({ status }: { status: PostStatus }) {
  const s = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${s.color}`}>
      {s.icon} {s.label}
    </span>
  );
}

// ── AI Caption Generator ─────────────────────────────────────────────────

function CaptionGenerator({ onUseCaption }: { onUseCaption: (text: string) => void }) {
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [selectedTones, setSelectedTones] = useState<CaptionTone[]>(["pidgin", "formal"]);
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>(["instagram", "x"]);
  const [results, setResults] = useState<{ tone: CaptionTone; variants: Record<string, string> }[]>([]);
  const { toast } = useToast();
  const { mutateAsync: generateCaptions, isPending } = useGenerateCaptions();

  const toggleTone = (tone: CaptionTone) =>
    setSelectedTones((prev) => prev.includes(tone) ? prev.filter((t) => t !== tone) : [...prev, tone]);

  const togglePlatform = (p: Platform) =>
    setSelectedPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const handleGenerate = async () => {
    if (!topic.trim()) { toast({ title: "Enter a topic first" }); return; }
    if (!selectedTones.length) { toast({ title: "Pick at least one tone" }); return; }
    if (!selectedPlatforms.length) { toast({ title: "Pick at least one platform" }); return; }
    try {
      const res = await generateCaptions({
        data: { topic, tones: selectedTones, platforms: selectedPlatforms, context: context || undefined },
      });
      setResults(res.captions as typeof results);
    } catch {
      toast({ title: "Caption generation failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label className="text-xs font-medium mb-1.5 block">Topic / Theme *</Label>
          <Input
            placeholder="e.g. 999 Book launch, Music Monday, My philosophy on Nigeria"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            data-testid="caption-topic-input"
          />
        </div>
        <div>
          <Label className="text-xs font-medium mb-1.5 block">Extra context (optional)</Label>
          <Input
            placeholder="e.g. Promoting pre-order, targeting 18-35 Lagos audience"
            value={context}
            onChange={(e) => setContext(e.target.value)}
          />
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium mb-2 block">Tone profiles</Label>
        <div className="flex flex-wrap gap-2">
          {TONES.map((t) => (
            <button
              key={t.key}
              onClick={() => toggleTone(t.key)}
              data-testid={`tone-btn-${t.key}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                selectedTones.includes(t.key)
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <span>{t.flag}</span> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium mb-2 block">Platforms</Label>
        <div className="flex flex-wrap gap-2">
          {PLATFORMS.map((p) => (
            <button
              key={p.key}
              onClick={() => togglePlatform(p.key)}
              data-testid={`platform-btn-${p.key}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                selectedPlatforms.includes(p.key)
                  ? "border-primary bg-primary/10 text-primary font-semibold"
                  : "border-border text-muted-foreground hover:border-primary/50"
              }`}
            >
              <span className={`w-4 h-4 rounded flex items-center justify-center text-white text-[9px] ${p.color}`}>{p.icon}</span>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <Button onClick={handleGenerate} disabled={isPending} data-testid="btn-generate-captions" className="gap-2">
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
        {isPending ? "Generating captions…" : "Generate Captions"}
      </Button>

      {results.length > 0 && (
        <div className="space-y-4 mt-2" data-testid="caption-results">
          {results.map((r) => {
            const tone = TONES.find((t) => t.key === r.tone);
            return (
              <div key={r.tone} className="border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-muted/50 border-b border-border flex items-center gap-2">
                  <span className="text-base">{tone?.flag}</span>
                  <span className="font-semibold text-sm">{tone?.label}</span>
                </div>
                <div className="divide-y divide-border">
                  {Object.entries(r.variants).map(([platform, text]) => {
                    const p = PLATFORMS.find((x) => x.key === platform);
                    return (
                      <div key={platform} className="px-4 py-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-white text-[10px] font-medium ${p?.color || "bg-gray-500"}`}>
                            {p?.icon} {p?.label}
                          </span>
                          <div className="flex gap-1.5">
                            <button
                              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
                              onClick={() => { navigator.clipboard.writeText(text); toast({ title: "Copied!" }); }}
                            >
                              <Copy className="w-3 h-3" /> Copy
                            </button>
                            <button
                              className="text-xs text-primary hover:underline flex items-center gap-1"
                              onClick={() => onUseCaption(text)}
                              data-testid={`btn-use-caption-${r.tone}-${platform}`}
                            >
                              Use this
                            </button>
                          </div>
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
                        <p className="text-xs text-muted-foreground mt-1">{text.length} chars</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Hashtag Panel ────────────────────────────────────────────────────────

function HashtagPanel({ onAddHashtag }: { onAddHashtag: (tag: string) => void }) {
  const [platform, setPlatform] = useState<string>("__all__");
  const [region, setRegion] = useState("NG");
  const [search, setSearch] = useState("");

  const { data: hashtags, isLoading } = useGetTrendingHashtags({
    platform: platform === "__all__" ? undefined : platform,
    region,
  });

  const filtered = (hashtags || []).filter((h) =>
    !search || h.hashtag.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="All platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All platforms</SelectItem>
            {PLATFORMS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-28 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NG">🇳🇬 Nigeria</SelectItem>
            <SelectItem value="GH">🇬🇭 Ghana</SelectItem>
            <SelectItem value="KE">🇰🇪 Kenya</SelectItem>
          </SelectContent>
        </Select>
        <Input
          className="h-8 text-xs flex-1 min-w-32"
          placeholder="Search hashtags…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex flex-wrap gap-2">
          {[...Array(12)].map((_, i) => <Skeleton key={i} className="h-7 w-24 rounded-full" />)}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto" data-testid="hashtag-list">
          {filtered.map((h) => (
            <button
              key={h.hashtag}
              onClick={() => onAddHashtag(h.hashtag)}
              data-testid={`hashtag-btn-${h.hashtag.replace("#", "")}`}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors border border-primary/20"
            >
              <Hash className="w-3 h-3" />
              {h.hashtag.replace("#", "")}
              <span className="text-[10px] text-primary/60 ml-0.5">{h.trendScore}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="text-sm text-muted-foreground">No hashtags found for these filters.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Create Campaign Dialog ───────────────────────────────────────────────

function CreateCampaignDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (campaign: any) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(CAMPAIGN_COLORS[0]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const { toast } = useToast();
  const qc = useQueryClient();
  const { mutateAsync: createCampaign, isPending } = useCreateCampaign();

  const handleCreate = async () => {
    if (!name.trim()) { toast({ title: "Campaign name required" }); return; }
    try {
      const campaign = await createCampaign({
        data: {
          name,
          description: description || undefined,
          color,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/campaigns"] });
      toast({ title: `Campaign "${name}" created` });
      onCreated(campaign);
      onClose();
    } catch {
      toast({ title: "Failed to create campaign", variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Campaign</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Campaign name *</Label>
            <Input
              placeholder="e.g. 999 Book Launch, Music Monday Series"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="campaign-name-input"
            />
          </div>
          <div>
            <Label className="text-xs font-medium mb-1.5 block">Description (optional)</Label>
            <Textarea
              placeholder="What is this campaign about?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
          <div>
            <Label className="text-xs font-medium mb-2 block">Campaign colour</Label>
            <div className="flex gap-2 flex-wrap">
              {CAMPAIGN_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
                  style={{ backgroundColor: c }}
                  data-testid={`campaign-color-${c}`}
                />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium mb-1.5 block">Start date</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="text-sm" />
            </div>
            <div>
              <Label className="text-xs font-medium mb-1.5 block">End date</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="text-sm" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleCreate} disabled={isPending} data-testid="btn-create-campaign">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            Create Campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Post Version History Dialog ──────────────────────────────────────────

function HistoryDialog({ post, open, onClose }: { post: any; open: boolean; onClose: () => void }) {
  const [revisions, setRevisions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    if (!post?.id) return;
    setLoading(true);
    try {
      const baseUrl = import.meta.env.BASE_URL?.replace(/\/$/, "") || "";
      const res = await fetch(`${baseUrl}/api/posts/${post.id}/history`, { credentials: "include" });
      if (res.ok) setRevisions(await res.json());
    } catch {
      // silently ignore
    } finally {
      setLoading(false);
    }
  }, [post?.id]);

  if (!post) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); else loadHistory(); }}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-4 h-4" /> Version History
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground mb-3">Current version: v{post.version}</p>

        {loading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
          </div>
        ) : revisions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No revision history yet.</p>
        ) : (
          <div className="space-y-3">
            {revisions.map((r) => (
              <div key={r.id} className="border border-border rounded-xl p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-primary">v{r.version}</span>
                  <span className="text-xs text-muted-foreground">{format(new Date(r.createdAt), "MMM d, yyyy HH:mm")}</span>
                </div>
                {r.changeNote && (
                  <p className="text-xs text-muted-foreground mb-1.5 italic">{r.changeNote}</p>
                )}
                <p className="text-sm line-clamp-2 text-foreground/80">{r.caption}</p>
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <StatusBadge status={r.status} />
                  {r.scheduledAt && (
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      {format(new Date(r.scheduledAt), "MMM d, HH:mm")}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Post Compose Dialog ──────────────────────────────────────────────────

interface ComposeDialogProps {
  open: boolean;
  onClose: () => void;
  editPost?: any;
  campaigns: any[];
  defaultDate?: Date;
  onCampaignCreated: (c: any) => void;
}

function ComposeDialog({ open, onClose, editPost, campaigns, defaultDate, onCampaignCreated }: ComposeDialogProps) {
  const [tab, setTab] = useState<"compose" | "captions" | "hashtags">("compose");
  const [caption, setCaption] = useState(editPost?.caption || "");
  const [platforms, setPlatforms] = useState<Platform[]>(editPost?.platforms || ["instagram"]);
  const [scheduledAt, setScheduledAt] = useState(
    editPost?.scheduledAt ? format(new Date(editPost.scheduledAt), "yyyy-MM-dd'T'HH:mm") :
    defaultDate ? format(defaultDate, "yyyy-MM-dd'T'10:00") : ""
  );
  const [campaignId, setCampaignId] = useState<string>(editPost?.campaignId?.toString() || "__none__");
  const [hashtags, setHashtags] = useState<string[]>(editPost?.hashtags || []);
  const [hashtagInput, setHashtagInput] = useState("");
  const [createCampaignOpen, setCreateCampaignOpen] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { mutateAsync: createPost, isPending: creating } = useCreatePost();
  const { mutateAsync: updatePost, isPending: updating } = useUpdatePost();

  const isPending = creating || updating;

  const togglePlatform = (p: Platform) =>
    setPlatforms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);

  const addHashtag = (tag: string) => {
    const t = tag.startsWith("#") ? tag : `#${tag}`;
    if (!hashtags.includes(t)) setHashtags((prev) => [...prev, t]);
  };

  const handleSubmit = async (status: "draft" | "scheduled") => {
    if (!caption.trim()) { toast({ title: "Caption is required" }); return; }
    if (!platforms.length) { toast({ title: "Select at least one platform" }); return; }
    if (status === "scheduled" && !scheduledAt) { toast({ title: "Set a scheduled date/time" }); return; }

    const data: any = {
      caption,
      platforms,
      hashtags,
      status,
      scheduledAt: status === "scheduled" ? scheduledAt : undefined,
      campaignId: campaignId && campaignId !== "__none__" ? parseInt(campaignId) : undefined,
    };

    try {
      if (editPost) {
        await updatePost({ id: editPost.id, data: { ...data, changeNote: "Edited in composer" } });
        toast({ title: "Post updated" });
      } else {
        await createPost({ data });
        toast({ title: status === "draft" ? "Saved as draft" : "Post scheduled!" });
      }
      qc.invalidateQueries({ queryKey: ["/api/posts"] });
      onClose();
    } catch {
      toast({ title: "Failed to save post", variant: "destructive" });
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editPost ? "Edit Post" : "Create Post"}</DialogTitle>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="grid grid-cols-3 mb-4">
              <TabsTrigger value="compose">✏️ Compose</TabsTrigger>
              <TabsTrigger value="captions" data-testid="tab-captions">✨ AI Captions</TabsTrigger>
              <TabsTrigger value="hashtags" data-testid="tab-hashtags">🔥 Hashtags</TabsTrigger>
            </TabsList>

            <TabsContent value="compose" className="space-y-4">
              <div>
                <Label className="text-xs font-medium mb-1.5 block">Caption *</Label>
                <Textarea
                  placeholder="What's the story, Fada? Write your caption here…"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  rows={5}
                  data-testid="post-caption-input"
                />
                <p className="text-xs text-muted-foreground mt-1">{caption.length} characters</p>
              </div>

              <div>
                <Label className="text-xs font-medium mb-2 block">Platforms *</Label>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.key}
                      onClick={() => togglePlatform(p.key)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all ${
                        platforms.includes(p.key)
                          ? "border-primary bg-primary/10 text-primary font-semibold"
                          : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      <span className={`w-4 h-4 rounded flex items-center justify-center text-white text-[9px] ${p.color}`}>{p.icon}</span>
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs font-medium mb-1.5 block">Hashtags</Label>
                <div className="flex gap-2 mb-2">
                  <Input
                    className="h-8 text-sm"
                    placeholder="#Nigeria"
                    value={hashtagInput}
                    onChange={(e) => setHashtagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { addHashtag(hashtagInput); setHashtagInput(""); } }}
                  />
                  <Button size="sm" variant="outline" onClick={() => { addHashtag(hashtagInput); setHashtagInput(""); }}>Add</Button>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {hashtags.map((h) => (
                    <span key={h} className="flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-xs rounded-full">
                      {h}
                      <button onClick={() => setHashtags((prev) => prev.filter((x) => x !== h))} className="text-primary/60 hover:text-primary">×</button>
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Schedule date/time</Label>
                  <Input
                    type="datetime-local"
                    value={scheduledAt}
                    onChange={(e) => setScheduledAt(e.target.value)}
                    className="text-sm"
                    data-testid="post-scheduled-at-input"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Campaign tag</Label>
                  <div className="flex gap-1.5">
                    <Select value={campaignId} onValueChange={setCampaignId}>
                      <SelectTrigger className="text-sm h-9 flex-1">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {campaigns.map((c) => (
                          <SelectItem key={c.id} value={c.id.toString()}>
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ backgroundColor: c.color }} />
                              {c.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 px-2 shrink-0"
                      onClick={() => setCreateCampaignOpen(true)}
                      title="Create new campaign"
                      data-testid="btn-new-campaign-inline"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="captions">
              <CaptionGenerator onUseCaption={(text) => { setCaption(text); setTab("compose"); }} />
            </TabsContent>

            <TabsContent value="hashtags">
              <HashtagPanel onAddHashtag={(tag) => { addHashtag(tag); setTab("compose"); }} />
            </TabsContent>
          </Tabs>

          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={isPending}>Cancel</Button>
            <Button variant="outline" onClick={() => handleSubmit("draft")} disabled={isPending} data-testid="btn-save-draft">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Save Draft
            </Button>
            <Button onClick={() => handleSubmit("scheduled")} disabled={isPending} data-testid="btn-schedule-post">
              {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Clock className="w-4 h-4 mr-1" />}
              Schedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CreateCampaignDialog
        open={createCampaignOpen}
        onClose={() => setCreateCampaignOpen(false)}
        onCreated={(c) => { onCampaignCreated(c); setCampaignId(c.id.toString()); }}
      />
    </>
  );
}

// ── Calendar View (monthly + weekly with drag-and-drop) ──────────────────

function CalendarView({ posts, campaigns, onDayClick, onReschedule }: {
  posts: any[];
  campaigns: any[];
  onDayClick: (date: Date) => void;
  onReschedule: (postId: number, newDate: Date) => void;
}) {
  const [calView, setCalView] = useState<"month" | "week">("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dragPostId, setDragPostId] = useState<number | null>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const campaignMap = Object.fromEntries((campaigns || []).map((c) => [c.id, c]));

  const monthDays = eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) });
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const displayDays = calView === "month" ? monthDays : weekDays;
  const startDow = calView === "month" ? startOfMonth(currentDate).getDay() : 0;

  const prevPeriod = () => calView === "month"
    ? setCurrentDate((d) => subMonths(d, 1))
    : setCurrentDate((d) => subWeeks(d, 1));

  const nextPeriod = () => calView === "month"
    ? setCurrentDate((d) => addMonths(d, 1))
    : setCurrentDate((d) => addWeeks(d, 1));

  const periodLabel = calView === "month"
    ? format(currentDate, "MMMM yyyy")
    : `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

  const getPostsForDay = (day: Date) =>
    posts.filter((p) => p.scheduledAt && isSameDay(new Date(p.scheduledAt), day));

  const handleDragStart = (e: React.DragEvent, postId: number) => {
    e.dataTransfer.effectAllowed = "move";
    setDragPostId(postId);
  };

  const handleDragOver = (e: React.DragEvent, dayKey: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverDay(dayKey);
  };

  const handleDrop = (e: React.DragEvent, day: Date) => {
    e.preventDefault();
    if (dragPostId != null) {
      onReschedule(dragPostId, day);
    }
    setDragPostId(null);
    setDragOverDay(null);
  };

  const handleDragEnd = () => {
    setDragPostId(null);
    setDragOverDay(null);
  };

  const cellClass = calView === "week" ? "min-h-[200px]" : "min-h-[80px]";

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <button onClick={prevPeriod} className="p-1 rounded hover:bg-muted">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <h3 className="font-bold text-sm">{periodLabel}</h3>
          <div className="flex items-center border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setCalView("month")}
              className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors ${calView === "month" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}
              data-testid="btn-calendar-month"
            >
              <LayoutGrid className="w-3 h-3" /> Month
            </button>
            <button
              onClick={() => setCalView("week")}
              className={`px-2.5 py-1 text-xs flex items-center gap-1 transition-colors ${calView === "week" ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted"}`}
              data-testid="btn-calendar-week"
            >
              <CalendarDays className="w-3 h-3" /> Week
            </button>
          </div>
        </div>
        <button onClick={nextPeriod} className="p-1 rounded hover:bg-muted">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 border-b border-border">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground py-2 font-medium">{d}</div>
        ))}
      </div>

      {/* Days grid */}
      <div className={`grid grid-cols-7 ${calView === "week" ? "" : "min-h-[360px]"}`}>
        {/* Empty cells for month view alignment */}
        {calView === "month" && [...Array(startDow)].map((_, i) => (
          <div key={`empty-${i}`} className="border-b border-r border-border bg-muted/10 min-h-[80px]" />
        ))}

        {displayDays.map((day) => {
          const dayKey = format(day, "yyyy-MM-dd");
          const dayPosts = getPostsForDay(day);
          const today = isToday(day);
          const isDragOver = dragOverDay === dayKey;

          return (
            <div
              key={dayKey}
              className={`border-b border-r border-border ${cellClass} p-1.5 transition-colors ${
                today ? "bg-primary/5" : ""
              } ${isDragOver ? "bg-primary/10 border-primary/40" : "hover:bg-muted/30"}`}
              onClick={() => onDayClick(day)}
              onDragOver={(e) => handleDragOver(e, dayKey)}
              onDrop={(e) => { e.stopPropagation(); handleDrop(e, day); }}
              onDragLeave={() => setDragOverDay(null)}
              data-testid={`calendar-day-${dayKey}`}
            >
              <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${today ? "bg-primary text-white" : "text-muted-foreground"}`}>
                {format(day, "d")}
              </div>
              <div className="space-y-0.5">
                {dayPosts.slice(0, calView === "week" ? 8 : 3).map((p) => {
                  const campaign = campaignMap[p.campaignId];
                  const isDragging = dragPostId === p.id;
                  return (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, p.id); }}
                      onDragEnd={handleDragEnd}
                      onClick={(e) => e.stopPropagation()}
                      className={`text-[10px] px-1.5 py-0.5 rounded truncate font-medium cursor-grab active:cursor-grabbing select-none transition-opacity ${isDragging ? "opacity-40" : ""}`}
                      style={{
                        backgroundColor: (campaign?.color ?? "#2dd172") + "22",
                        color: campaign?.color ?? "#2dd172",
                      }}
                      title={p.caption}
                    >
                      {calView === "week" ? p.caption.slice(0, 40) : p.caption.slice(0, 20)}…
                    </div>
                  );
                })}
                {dayPosts.length > (calView === "week" ? 8 : 3) && (
                  <div className="text-[10px] text-muted-foreground px-1">
                    +{dayPosts.length - (calView === "week" ? 8 : 3)} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {dragPostId != null && (
        <div className="px-4 py-2 bg-primary/5 border-t border-primary/20 text-xs text-primary text-center">
          Drop onto a day to reschedule
        </div>
      )}
    </div>
  );
}

// ── Draft Library ────────────────────────────────────────────────────────

function DraftLibrary({ posts, campaigns, onEdit, onDelete, onRecycle, onViewHistory }: {
  posts: any[];
  campaigns: any[];
  onEdit: (post: any) => void;
  onDelete: (id: number) => void;
  onRecycle: (post: any) => void;
  onViewHistory: (post: any) => void;
}) {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [campaignFilter, setCampaignFilter] = useState<string>("all");

  const filtered = posts.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (campaignFilter !== "all" && String(p.campaignId) !== campaignFilter) return false;
    return true;
  });

  const campaignMap = Object.fromEntries((campaigns || []).map((c) => [c.id, c]));

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={campaignFilter} onValueChange={setCampaignFilter}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="All campaigns" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campaigns</SelectItem>
            {campaigns.map((c) => <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm" data-testid="posts-empty">
          No posts yet. Create your first post!
        </div>
      ) : (
        <div className="space-y-3" data-testid="posts-list">
          {filtered.map((p) => {
            const campaign = campaignMap[p.campaignId];
            return (
              <div key={p.id} className="border border-border rounded-xl p-4 hover:border-primary/30 transition-colors" data-testid={`post-item-${p.id}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <StatusBadge status={p.status} />
                      {campaign && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: campaign.color + "22", color: campaign.color }}>
                          <Tag className="w-2.5 h-2.5 inline mr-0.5" />{campaign.name}
                        </span>
                      )}
                      {p.isRecycled && <Badge variant="outline" className="text-xs h-5">♻️ Recycled v{p.version}</Badge>}
                    </div>
                    <p className="text-sm leading-relaxed line-clamp-2 mb-2">{p.caption}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      {(p.platforms as Platform[]).map((pl) => <PlatformBadge key={pl} platform={pl} />)}
                      {p.scheduledAt && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(new Date(p.scheduledAt), "MMM d, HH:mm")}
                        </span>
                      )}
                    </div>
                    {(p.hashtags as string[])?.length > 0 && (
                      <p className="text-xs text-primary/70 mt-1.5 truncate">{(p.hashtags as string[]).join(" ")}</p>
                    )}
                  </div>
                  <div className="flex flex-col gap-1 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onEdit(p)}>Edit</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onRecycle(p)}>
                      <RefreshCw className="w-3 h-3" /> Recycle
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => onViewHistory(p)} data-testid={`btn-history-${p.id}`}>
                      <History className="w-3 h-3" /> History
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => onDelete(p.id)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Bulk Upload ──────────────────────────────────────────────────────────

function BulkUpload({ campaigns, onDone }: { campaigns: any[]; onDone: () => void }) {
  const [csvText, setCsvText] = useState("");
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);
  const { toast } = useToast();
  const { mutateAsync: bulkUpload, isPending } = useBulkUploadPosts();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const SAMPLE_CSV = `caption,platforms,scheduledAt,hashtags
"E don happen! 999 book don drop for your area — go grab am before them finish am!","instagram,tiktok",2026-08-01T10:00:00,"#999Book,#CharlyBoy,#NigeriaTwitter"
"The revolution will be televised AND monetized. Area Fada said what he said.","x,threads",2026-08-02T09:00:00,"#AreaFada,#Nigeria"
"Charly Boy has entered the building. Music Monday energy is immaculate.","instagram,facebook",2026-08-04T12:00:00,"#MusicMonday,#CharlyBoy"`;

  const parseCsv = (text: string) => {
    const lines = text.trim().split("\n");
    if (lines.length < 2) return [];
    const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, ""));
    return lines.slice(1).map((line) => {
      const vals: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (const ch of line) {
        if (ch === '"') { inQuotes = !inQuotes; }
        else if (ch === "," && !inQuotes) { vals.push(cur); cur = ""; }
        else cur += ch;
      }
      vals.push(cur);
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = (vals[i] || "").trim(); });
      return {
        caption: obj.caption || "",
        platforms: (obj.platforms || "instagram").split(",").map((p) => p.trim()) as Platform[],
        scheduledAt: obj.scheduledAt || undefined,
        hashtags: obj.hashtags ? obj.hashtags.split(",").map((h) => h.trim()) : [],
      };
    });
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string);
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    const posts = parseCsv(csvText);
    if (!posts.length) { toast({ title: "No valid posts found in CSV" }); return; }
    try {
      const res = await bulkUpload({ data: { posts } });
      setResult({ imported: res.imported, failed: res.failed });
      qc.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: `${res.imported} posts imported!` });
      onDone();
    } catch {
      toast({ title: "Bulk upload failed", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div
        className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
        onClick={() => fileRef.current?.click()}
        data-testid="bulk-upload-dropzone"
      >
        <Upload className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-sm font-medium mb-1">Drop CSV file here or click to browse</p>
        <p className="text-xs text-muted-foreground">Up to 50 posts per import</p>
        <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <Label className="text-xs font-medium">CSV content</Label>
          <button
            className="text-xs text-primary hover:underline"
            onClick={() => setCsvText(SAMPLE_CSV)}
            data-testid="btn-load-sample-csv"
          >
            Load sample
          </button>
        </div>
        <Textarea
          value={csvText}
          onChange={(e) => setCsvText(e.target.value)}
          rows={8}
          placeholder={`caption,platforms,scheduledAt,hashtags\n"My caption here","instagram,tiktok",2026-08-01T10:00,"#Naija,#CharlyBoy"`}
          className="text-xs font-mono"
          data-testid="bulk-csv-textarea"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Columns: <code>caption</code>, <code>platforms</code> (comma-separated), <code>scheduledAt</code> (ISO 8601), <code>hashtags</code> (comma-separated)
        </p>
      </div>

      <Button onClick={handleUpload} disabled={isPending || !csvText.trim()} className="gap-2" data-testid="btn-bulk-import">
        {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {isPending ? "Importing…" : "Import Posts"}
      </Button>

      {result && (
        <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm" data-testid="bulk-upload-result">
          ✅ <strong>{result.imported}</strong> posts imported
          {result.failed > 0 && <span className="text-red-600 ml-2">({result.failed} failed)</span>}
        </div>
      )}
    </div>
  );
}

// ── Recycle Dialog ───────────────────────────────────────────────────────

function RecycleDialog({ post, open, onClose }: { post: any; open: boolean; onClose: () => void }) {
  const [platforms, setPlatforms] = useState<Platform[]>(post?.platforms || ["instagram"]);
  const [tone, setTone] = useState<CaptionTone>("pidgin");
  const [scheduledAt, setScheduledAt] = useState(format(new Date(Date.now() + 7 * 86400000), "yyyy-MM-dd'T'10:00"));
  const { toast } = useToast();
  const qc = useQueryClient();
  const { mutateAsync: recyclePost, isPending } = useRecyclePost();

  const handleRecycle = async () => {
    try {
      await recyclePost({ id: post.id, data: { platforms, scheduledAt, tone, refreshCaption: true } });
      qc.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: "Post recycled with fresh AI caption! ♻️" });
      onClose();
    } catch {
      toast({ title: "Recycle failed", variant: "destructive" });
    }
  };

  if (!post) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>♻️ Recycle Post</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="p-3 rounded-lg bg-muted/50 text-sm italic line-clamp-3">{post.caption}</div>

          <div>
            <Label className="text-xs font-medium mb-2 block">New tone for AI refresh</Label>
            <div className="flex flex-wrap gap-2">
              {TONES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTone(t.key)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-all ${tone === t.key ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}
                >
                  {t.flag} {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium mb-2 block">Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPlatforms((prev) => prev.includes(p.key) ? prev.filter((x) => x !== p.key) : [...prev, p.key])}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs transition-all ${platforms.includes(p.key) ? "border-primary bg-primary/10 text-primary font-semibold" : "border-border text-muted-foreground"}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium mb-1.5 block">Schedule recycled post</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className="text-sm" data-testid="recycle-scheduled-at" />
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleRecycle} disabled={isPending} data-testid="btn-confirm-recycle" className="gap-2">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {isPending ? "Recycling…" : "Recycle with AI Refresh"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Reconnect Required Banner ────────────────────────────────────────────

// Platforms with a working /oauth/:platform/start flow
const OAUTH_SUPPORTED_PLATFORMS = ["x", "instagram", "facebook", "tiktok"] as const;
type OAuthPlatform = typeof OAUTH_SUPPORTED_PLATFORMS[number];

function ReconnectRequiredBanner({ accounts }: { accounts: any[] }) {
  const needsReconnect = accounts.filter((a) => a.errorCode === "auth_required" && a.connected);
  if (needsReconnect.length === 0) return null;

  const PLATFORM_LABELS: Record<string, string> = {
    instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok",
    x: "X / Twitter", youtube: "YouTube", threads: "Threads",
  };
  const PLATFORM_ICONS: Record<string, string> = {
    instagram: "📸", tiktok: "🎵", x: "🐦", facebook: "📘", youtube: "📺", threads: "🧵",
  };

  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

  // Split into accounts we can reconnect via OAuth vs those that need manual support
  const reconnectable = needsReconnect.filter((a) =>
    (OAUTH_SUPPORTED_PLATFORMS as readonly string[]).includes(a.platform)
  );
  const manualOnly = needsReconnect.filter((a) =>
    !(OAUTH_SUPPORTED_PLATFORMS as readonly string[]).includes(a.platform)
  );

  return (
    <div className="rounded-xl bg-red-50 border border-red-200 p-4 mb-4 space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
        <span className="font-semibold text-red-800">
          {needsReconnect.length === 1
            ? "1 account needs reconnection — token refresh failed"
            : `${needsReconnect.length} accounts need reconnection — token refresh failed`}
        </span>
      </div>
      <p className="text-xs text-red-700">
        Analytics could not be automatically refreshed for the accounts below. This happens when a token is fully revoked or the platform requires manual re-authorization.
      </p>

      {reconnectable.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {reconnectable.map((a) => (
            <a
              key={a.id}
              href={`${base}/api/oauth/${a.platform}/start`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors"
            >
              <AlertTriangle className="w-3 h-3" />
              Reconnect {PLATFORM_LABELS[a.platform] ?? a.platform}
              {PLATFORM_ICONS[a.platform] ? ` ${PLATFORM_ICONS[a.platform]}` : ""}
            </a>
          ))}
        </div>
      )}

      {manualOnly.length > 0 && (
        <p className="text-xs text-red-600">
          <span className="font-medium">Note:</span>{" "}
          {manualOnly.map((a) => `${PLATFORM_LABELS[a.platform] ?? a.platform} ${PLATFORM_ICONS[a.platform] ?? ""}`).join(", ")}{" "}
          {manualOnly.length === 1 ? "requires" : "require"} manual reconnection — disconnect and reconnect the account from your platform settings.
        </p>
      )}
    </div>
  );
}

// ── Connect Account Banner ───────────────────────────────────────────────

const PLATFORM_OAUTH: { platform: string; label: string; color: string; textColor: string }[] = [
  { platform: "x",         label: "X / Twitter", color: "bg-black hover:bg-zinc-800",       textColor: "text-white" },
  { platform: "instagram", label: "Instagram",   color: "bg-gradient-to-r from-purple-500 via-pink-500 to-orange-400 hover:opacity-90", textColor: "text-white" },
  { platform: "facebook",  label: "Facebook",    color: "bg-blue-600 hover:bg-blue-700",     textColor: "text-white" },
  { platform: "tiktok",    label: "TikTok",      color: "bg-zinc-900 hover:bg-zinc-800",     textColor: "text-white" },
];

function connectOAuthUrl(platform: string): string {
  const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api/oauth/${platform}/start`;
}

function ConnectBanner({ accounts }: { accounts: any[] }) {
  const { toast } = useToast();
  const connected = accounts.filter((a) => a.connected);
  const disconnected = PLATFORM_OAUTH.filter(
    (p) => !connected.some((a) => a.platform === p.platform)
  );

  // Show OAuth result toast when returning from OAuth redirect
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const success = params.get("oauth_success");
    const error = params.get("oauth_error");
    if (success || error) {
      // Clear params without reload
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
      if (success) {
        setTimeout(() => toast({ title: `${success} connected!`, description: "Your account is now live." }), 100);
      } else if (error) {
        setTimeout(() => toast({ title: "Connection failed", description: decodeURIComponent(error), variant: "destructive" }), 100);
      }
    }
  }

  if (disconnected.length === 0) return null;

  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 mb-4 space-y-3">
      <div className="flex items-center gap-2 text-sm">
        <Link className="w-4 h-4 text-amber-600 shrink-0" />
        <span className="font-medium text-amber-800">Connect your social accounts to start publishing</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {disconnected.map(({ platform, label, color, textColor }) => (
          <a
            key={platform}
            href={connectOAuthUrl(platform)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity ${color} ${textColor}`}
          >
            <Link className="w-3 h-3" />
            Connect {label}
          </a>
        ))}
      </div>
      {connected.length > 0 && (
        <p className="text-xs text-amber-700">{connected.length} account{connected.length > 1 ? "s" : ""} already connected.</p>
      )}
    </div>
  );
}

// ── Campaign Manager ─────────────────────────────────────────────────────

function CampaignManager({ campaigns, onCreated }: { campaigns: any[]; onCreated: () => void }) {
  const [createOpen, setCreateOpen] = useState(false);
  const qc = useQueryClient();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Organise posts into colour-coded campaigns</p>
        <Button size="sm" className="gap-1.5 h-8" onClick={() => setCreateOpen(true)} data-testid="btn-new-campaign">
          <Plus className="w-3.5 h-3.5" /> New Campaign
        </Button>
      </div>

      {campaigns.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No campaigns yet. Create one to group your posts!
        </div>
      ) : (
        <div className="space-y-2">
          {campaigns.map((c) => (
            <div key={c.id} className="flex items-center gap-3 border border-border rounded-xl p-3">
              <span className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{c.name}</p>
                {c.description && <p className="text-xs text-muted-foreground truncate">{c.description}</p>}
                {(c.startDate || c.endDate) && (
                  <p className="text-xs text-muted-foreground">
                    {c.startDate ? format(new Date(c.startDate), "MMM d") : ""}
                    {c.startDate && c.endDate ? " – " : ""}
                    {c.endDate ? format(new Date(c.endDate), "MMM d, yyyy") : ""}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <CreateCampaignDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => { qc.invalidateQueries({ queryKey: ["/api/campaigns"] }); onCreated(); }}
      />
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function SchedulingPage() {
  const [view, setView] = useState<"calendar" | "queue" | "campaigns" | "bulk">("calendar");
  const [composeOpen, setComposeOpen] = useState(false);
  const [editPost, setEditPost] = useState<any>(null);
  const [recyclePost, setRecyclePost] = useState<any>(null);
  const [historyPost, setHistoryPost] = useState<any>(null);
  const [defaultDate, setDefaultDate] = useState<Date | undefined>(undefined);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: posts = [], isLoading: postsLoading } = useListPosts();
  const { data: campaigns = [] } = useListCampaigns();
  const { data: accounts = [] } = useListPlatformAccounts();
  const { mutateAsync: deletePost } = useDeletePost();
  const { mutateAsync: updatePost } = useUpdatePost();

  const handleDelete = async (id: number) => {
    try {
      await deletePost({ id });
      qc.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: "Post deleted" });
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleDayClick = (date: Date) => {
    setDefaultDate(date);
    setEditPost(null);
    setComposeOpen(true);
  };

  const handleReschedule = async (postId: number, newDate: Date) => {
    try {
      const post = posts.find((p) => p.id === postId);
      if (!post) return;

      const existing = new Date(post.scheduledAt || Date.now());
      const rescheduled = new Date(newDate);
      rescheduled.setHours(existing.getHours(), existing.getMinutes(), 0, 0);

      await updatePost({
        id: postId,
        data: {
          scheduledAt: rescheduled.toISOString(),
          status: "scheduled",
          changeNote: `Rescheduled to ${format(rescheduled, "MMM d, yyyy")}`,
        },
      });
      qc.invalidateQueries({ queryKey: ["/api/posts"] });
      toast({ title: `Post rescheduled to ${format(rescheduled, "MMM d")}` });
    } catch {
      toast({ title: "Reschedule failed", variant: "destructive" });
    }
  };

  const stats = {
    draft: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    published: posts.filter((p) => p.status === "published").length,
  };

  return (
    <AppShell title="Scheduling">
      <TierGuard moduleKey="scheduling" requiredTier="creator" moduleName="Content Scheduling">
        <div className="p-6 max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-black" data-testid="scheduling-heading">Content Calendar</h1>
              <p className="text-muted-foreground text-sm">Schedule posts across 6 platforms with AI caption magic</p>
            </div>
            <Button onClick={() => { setEditPost(null); setDefaultDate(undefined); setComposeOpen(true); }} data-testid="btn-create-post" className="gap-2">
              <Plus className="w-4 h-4" /> New Post
            </Button>
          </div>

          {/* Reconnect required banner (token refresh failed) */}
          <ReconnectRequiredBanner accounts={accounts} />

          {/* Connect banner */}
          <ConnectBanner accounts={accounts} />

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {[
              { label: "Drafts", count: stats.draft, color: "text-gray-600", bg: "bg-gray-50" },
              { label: "Scheduled", count: stats.scheduled, color: "text-blue-700", bg: "bg-blue-50" },
              { label: "Published", count: stats.published, color: "text-emerald-700", bg: "bg-emerald-50" },
            ].map((s) => (
              <div key={s.label} className={`rounded-xl border border-border p-4 ${s.bg}`}>
                <div className={`text-2xl font-black ${s.color}`}>{postsLoading ? "—" : s.count}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>

          {/* View tabs */}
          <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
            <TabsList className="mb-5">
              <TabsTrigger value="calendar" data-testid="tab-calendar">📅 Calendar</TabsTrigger>
              <TabsTrigger value="queue" data-testid="tab-queue">📋 Post Queue</TabsTrigger>
              <TabsTrigger value="campaigns" data-testid="tab-campaigns">🏷️ Campaigns</TabsTrigger>
              <TabsTrigger value="bulk" data-testid="tab-bulk">📥 Bulk Upload</TabsTrigger>
            </TabsList>

            <TabsContent value="calendar">
              {postsLoading ? (
                <Skeleton className="h-96 w-full rounded-xl" />
              ) : (
                <CalendarView
                  posts={posts}
                  campaigns={campaigns}
                  onDayClick={handleDayClick}
                  onReschedule={handleReschedule}
                />
              )}
            </TabsContent>

            <TabsContent value="queue">
              {postsLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-28 w-full rounded-xl" />)}
                </div>
              ) : (
                <DraftLibrary
                  posts={posts}
                  campaigns={campaigns}
                  onEdit={(p) => { setEditPost(p); setComposeOpen(true); }}
                  onDelete={handleDelete}
                  onRecycle={setRecyclePost}
                  onViewHistory={setHistoryPost}
                />
              )}
            </TabsContent>

            <TabsContent value="campaigns">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Campaign Manager</CardTitle>
                </CardHeader>
                <CardContent>
                  <CampaignManager
                    campaigns={campaigns}
                    onCreated={() => qc.invalidateQueries({ queryKey: ["/api/campaigns"] })}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="bulk">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Bulk Import Posts</CardTitle>
                </CardHeader>
                <CardContent>
                  <BulkUpload campaigns={campaigns} onDone={() => setView("queue")} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Compose dialog */}
        {composeOpen && (
          <ComposeDialog
            open={composeOpen}
            onClose={() => { setComposeOpen(false); setEditPost(null); setDefaultDate(undefined); }}
            editPost={editPost}
            campaigns={campaigns}
            defaultDate={defaultDate}
            onCampaignCreated={() => qc.invalidateQueries({ queryKey: ["/api/campaigns"] })}
          />
        )}

        {/* Recycle dialog */}
        {recyclePost && (
          <RecycleDialog
            post={recyclePost}
            open={!!recyclePost}
            onClose={() => setRecyclePost(null)}
          />
        )}

        {/* History dialog */}
        {historyPost && (
          <HistoryDialog
            post={historyPost}
            open={!!historyPost}
            onClose={() => setHistoryPost(null)}
          />
        )}
      </TierGuard>
    </AppShell>
  );
}
