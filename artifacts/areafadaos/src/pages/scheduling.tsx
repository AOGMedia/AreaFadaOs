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
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isToday, addMonths, subMonths, parseISO } from "date-fns";

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
      {/* Input */}
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

      {/* Tone selector */}
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

      {/* Platform selector */}
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

      {/* Results */}
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
  const [platform, setPlatform] = useState<string>("");
  const [region, setRegion] = useState("NG");
  const [search, setSearch] = useState("");

  const { data: hashtags, isLoading } = useGetTrendingHashtags({
    platform: platform || undefined,
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
            <SelectItem value="">All platforms</SelectItem>
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

// ── Post Compose Dialog ──────────────────────────────────────────────────

interface ComposeDialogProps {
  open: boolean;
  onClose: () => void;
  editPost?: any;
  campaigns: any[];
  defaultDate?: Date;
}

function ComposeDialog({ open, onClose, editPost, campaigns, defaultDate }: ComposeDialogProps) {
  const [tab, setTab] = useState<"compose" | "captions" | "hashtags">("compose");
  const [caption, setCaption] = useState(editPost?.caption || "");
  const [platforms, setPlatforms] = useState<Platform[]>(editPost?.platforms || ["instagram"]);
  const [scheduledAt, setScheduledAt] = useState(
    editPost?.scheduledAt ? format(new Date(editPost.scheduledAt), "yyyy-MM-dd'T'HH:mm") :
    defaultDate ? format(defaultDate, "yyyy-MM-dd'T'10:00") : ""
  );
  const [campaignId, setCampaignId] = useState<string>(editPost?.campaignId?.toString() || "");
  const [hashtags, setHashtags] = useState<string[]>(editPost?.hashtags || []);
  const [hashtagInput, setHashtagInput] = useState("");
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
      scheduledAt: scheduledAt || undefined,
      campaignId: campaignId ? parseInt(campaignId) : undefined,
    };

    try {
      if (editPost) {
        await updatePost({ id: editPost.id, data: { ...data, status } });
        toast({ title: "Post updated" });
      } else {
        await createPost({ data: { ...data, status } });
        toast({ title: status === "draft" ? "Saved as draft" : "Post scheduled!" });
      }
      qc.invalidateQueries({ queryKey: ["/api/posts"] });
      onClose();
    } catch {
      toast({ title: "Failed to save post", variant: "destructive" });
    }
  };

  return (
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
            {/* Caption */}
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

            {/* Platforms */}
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

            {/* Hashtags */}
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
              {/* Schedule date */}
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
              {/* Campaign */}
              <div>
                <Label className="text-xs font-medium mb-1.5 block">Campaign tag</Label>
                <Select value={campaignId} onValueChange={setCampaignId}>
                  <SelectTrigger className="text-sm h-9">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {campaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
  );
}

// ── Calendar View ────────────────────────────────────────────────────────

function CalendarView({ posts, campaigns, onDayClick }: {
  posts: any[];
  campaigns: any[];
  onDayClick: (date: Date) => void;
}) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const campaignMap = Object.fromEntries((campaigns || []).map((c) => [c.id, c]));

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });
  const startDow = startOfMonth(currentMonth).getDay();

  const getPostsForDay = (day: Date) =>
    posts.filter((p) => p.scheduledAt && isSameDay(new Date(p.scheduledAt), day));

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <button onClick={() => setCurrentMonth((m) => subMonths(m, 1))} className="p-1 rounded hover:bg-muted">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h3 className="font-bold text-sm">{format(currentMonth, "MMMM yyyy")}</h3>
        <button onClick={() => setCurrentMonth((m) => addMonths(m, 1))} className="p-1 rounded hover:bg-muted">
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
      <div className="grid grid-cols-7 min-h-[360px]">
        {[...Array(startDow)].map((_, i) => (
          <div key={`empty-${i}`} className="border-b border-r border-border bg-muted/10 min-h-[72px]" />
        ))}
        {days.map((day) => {
          const dayPosts = getPostsForDay(day);
          const today = isToday(day);
          return (
            <div
              key={day.toISOString()}
              className={`border-b border-r border-border min-h-[72px] p-1.5 cursor-pointer hover:bg-muted/30 transition-colors ${today ? "bg-primary/5" : ""}`}
              onClick={() => onDayClick(day)}
              data-testid={`calendar-day-${format(day, "yyyy-MM-dd")}`}
            >
              <div className={`text-xs font-medium mb-1 w-6 h-6 flex items-center justify-center rounded-full ${today ? "bg-primary text-white" : "text-muted-foreground"}`}>
                {format(day, "d")}
              </div>
              <div className="space-y-0.5">
                {dayPosts.slice(0, 3).map((p) => {
                  const campaign = campaignMap[p.campaignId];
                  return (
                    <div
                      key={p.id}
                      className="text-[10px] px-1.5 py-0.5 rounded truncate font-medium"
                      style={{ backgroundColor: campaign?.color + "22" || "#2dd17222", color: campaign?.color || "#2dd172" }}
                    >
                      {p.caption.slice(0, 20)}…
                    </div>
                  );
                })}
                {dayPosts.length > 3 && (
                  <div className="text-[10px] text-muted-foreground px-1">+{dayPosts.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Draft Library ────────────────────────────────────────────────────────

function DraftLibrary({ posts, campaigns, onEdit, onDelete, onRecycle }: {
  posts: any[];
  campaigns: any[];
  onEdit: (post: any) => void;
  onDelete: (id: number) => void;
  onRecycle: (post: any) => void;
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
      {/* Filters */}
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

// ── Connect Account Banner ───────────────────────────────────────────────

function ConnectBanner({ accounts }: { accounts: any[] }) {
  const connected = accounts.filter((a) => a.connected).length;
  if (connected > 0) return null;
  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-sm mb-4">
      <Link className="w-4 h-4 text-amber-600 shrink-0" />
      <div className="flex-1">
        <span className="font-medium text-amber-800">Connect your social accounts</span>
        <span className="text-amber-700 ml-1">to start publishing. Platform OAuth integration coming soon.</span>
      </div>
      <Button size="sm" variant="outline" className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100">
        Connect accounts
      </Button>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function SchedulingPage() {
  const [view, setView] = useState<"calendar" | "queue" | "bulk">("calendar");
  const [composeOpen, setComposeOpen] = useState(false);
  const [editPost, setEditPost] = useState<any>(null);
  const [recyclePost, setRecyclePost] = useState<any>(null);
  const [defaultDate, setDefaultDate] = useState<Date | undefined>(undefined);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: posts = [], isLoading: postsLoading } = useListPosts();
  const { data: campaigns = [] } = useListCampaigns();
  const { data: accounts = [] } = useListPlatformAccounts();
  const { mutateAsync: deletePost } = useDeletePost();

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
              <TabsTrigger value="bulk" data-testid="tab-bulk">📥 Bulk Upload</TabsTrigger>
            </TabsList>

            <TabsContent value="calendar">
              {postsLoading ? (
                <Skeleton className="h-96 w-full rounded-xl" />
              ) : (
                <CalendarView posts={posts} campaigns={campaigns} onDayClick={handleDayClick} />
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
                />
              )}
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
      </TierGuard>
    </AppShell>
  );
}
