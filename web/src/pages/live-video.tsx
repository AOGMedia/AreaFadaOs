import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { TierGuard } from "@/components/TierGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Radio, Calendar, Settings, MessageSquare, Bell, Scissors, DollarSign, Copy,
  Plus, Play, Square, Zap, CheckCircle, Clock, Users, Eye, TrendingUp,
  Pin, Ban, HelpCircle, Trash2, Send, RefreshCw, ShieldCheck, AlertCircle,
  Wifi, WifiOff, MonitorPlay, StopCircle, Youtube, ExternalLink, Circle,
} from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { credentials: "include", ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

interface LiveSession {
  id: number; userId: number; title: string; description?: string;
  thumbnailUrl?: string; scheduledAt: string; endedAt?: string;
  status: string; platforms: string[]; rtmpUrl?: string; streamKey?: string;
  peakViewers: number; totalViewers: number; countdownPostsEnabled: boolean;
  replayUrl?: string; totalRevenue: string; createdAt: string;
}

interface PlatformConfig {
  id: number; sessionId: number; platform: string; streamKey?: string;
  rtmpEndpoint?: string; broadcastUrl?: string; status: string;
  validatedAt?: string; currentViewers?: number; restreamChannelId?: string;
}

interface ViewerCountData {
  sessionId: number; totalViewers: number; peakViewers: number;
  platforms: Record<string, { viewers: number; source: string }>;
  apiKeysConfigured: { youtube: boolean; instagram: boolean; restream: boolean };
  note?: string;
}

interface ValidationResult {
  allValid: boolean; message: string;
  validationType: "restream_api" | "format_only";
  results: Array<{ platform: string; configId: number; valid: boolean; message: string; newStatus: string }>;
}

interface RestreamChannel {
  id: number; displayName: string; enabled: boolean; platform: string; active?: boolean;
}

interface RestreamChannelsResult {
  ok: boolean; configured: boolean; invalid?: boolean; error?: string;
  channels: Array<{ id: number; displayName: string; platform: string; active: boolean }>;
}

interface GoLiveResult {
  message: string; session: LiveSession;
  streamConfigs: Array<{ platform: string; rtmpEndpoint?: string; streamKey?: string; status: string; obsSetup: string; included: boolean }>;
  restream: { connected: boolean; message: string; obsServer?: string; obsStreamKey?: string; channels?: RestreamChannel[] };
  obsInstructions: {
    mode: "restream" | "direct_multi_rtmp";
    summary: string;
    server?: string;
    streamKey?: string;
    pluginUrl?: string;
    targets?: Array<{ platform: string; server?: string; key?: string }>;
  };
}

interface ChatMessage {
  id: number; sessionId: number; platform: string; authorName: string;
  authorHandle?: string; message: string; isPinned: boolean; isBanned: boolean;
  isQuestion: boolean; isModerated: boolean; sentAt: string;
}

interface RevenueEvent {
  id: number; sessionId: number; platform: string; eventType: string;
  senderName: string; amount: string; currency: string; message?: string; occurredAt: string;
}

interface RevenueData {
  events: RevenueEvent[]; totalRevenue: number;
  byType: Record<string, number>; byPlatform: Record<string, number>;
}

interface Clip {
  id: number; sessionId: number; label: string; startSeconds: number;
  endSeconds: number; aiCaption?: string; platform?: string; status: string;
}

interface ReminderSignup {
  id: number; fanName: string; fanEmail?: string; fanPhone?: string;
  channel: string; reminded: boolean; remindedAt?: string; createdAt: string;
}

interface DripPost { platform: string; content: string; scheduledDate: string; hoursBeforeLive: number; }

const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E1306C", youtube: "#FF0000", facebook: "#1877F2", x: "#000000", tiktok: "#010101",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram Live", youtube: "YouTube Live", facebook: "Facebook Live", x: "X Spaces",
};

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸", youtube: "▶️", facebook: "👤", x: "𝕏", tiktok: "🎵",
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: "bg-blue-100 text-blue-700", live: "bg-red-100 text-red-700 animate-pulse",
  ended: "bg-gray-100 text-gray-600", cancelled: "bg-orange-100 text-orange-700",
};

const EVENT_ICONS: Record<string, string> = {
  super_chat: "💬", donation: "💰", badge: "🏅", product_sale: "🛍️",
};

const PIE_COLORS = ["#16a34a", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];

function fmtSecs(s: number) {
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function SessionForm({ session, onSaved }: { session?: LiveSession; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    title: session?.title ?? "",
    description: session?.description ?? "",
    scheduledAt: session?.scheduledAt ? session.scheduledAt.slice(0, 16) : "",
    platforms: session?.platforms ?? ([] as string[]),
    countdownPostsEnabled: session?.countdownPostsEnabled ?? true,
  });

  const togglePlatform = (p: string) =>
    setForm(f => ({ ...f, platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p] }));

  const save = useMutation({
    mutationFn: (body: object) => session
      ? apiFetch(`/live-sessions/${session.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : apiFetch("/live-sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: session ? "Session updated!" : "Session created!" }); onSaved(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const ALL_PLATFORMS = ["instagram", "youtube", "facebook", "x"];

  return (
    <div className="space-y-4">
      <div>
        <Label>Session Title</Label>
        <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. 999 Book Launch Live Q&A" />
      </div>
      <div>
        <Label>Description</Label>
        <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="What will you cover?" />
      </div>
      <div>
        <Label>Go-Live Date & Time</Label>
        <Input type="datetime-local" value={form.scheduledAt} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} />
      </div>
      <div>
        <Label className="mb-2 block">Broadcast Platforms</Label>
        <div className="flex flex-wrap gap-2">
          {ALL_PLATFORMS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => togglePlatform(p)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all ${form.platforms.includes(p) ? "border-primary bg-primary/10 text-primary font-medium" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
            >
              {PLATFORM_ICONS[p]} {PLATFORM_LABELS[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="countdown" checked={form.countdownPostsEnabled} onChange={e => setForm(f => ({ ...f, countdownPostsEnabled: e.target.checked }))} className="w-4 h-4 rounded" />
        <Label htmlFor="countdown" className="cursor-pointer">Auto-schedule countdown posts (7d, 24h, 1h, 15min)</Label>
      </div>
      <Button
        disabled={!form.title || !form.scheduledAt || save.isPending}
        onClick={() => save.mutate({ ...form, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined })}
        className="w-full"
      >
        {save.isPending ? "Saving…" : session ? "Save Changes" : "Schedule Session"}
      </Button>
    </div>
  );
}

function CalendarTab({ sessions, onSelect }: { sessions: LiveSession[]; onSelect: (s: LiveSession) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);

  const deleteSession = useMutation({
    mutationFn: (id: number) => apiFetch(`/live-sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["live-sessions"] }); toast({ title: "Session deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const upcoming = sessions.filter(s => s.status !== "ended" && s.status !== "cancelled");
  const past = sessions.filter(s => s.status === "ended" || s.status === "cancelled");

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Plan and manage your live sessions across all platforms</p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> Schedule Session</Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Schedule Live Session</DialogTitle></DialogHeader>
            <SessionForm onSaved={() => { qc.invalidateQueries({ queryKey: ["live-sessions"] }); setCreateOpen(false); }} />
          </DialogContent>
        </Dialog>
      </div>

      {upcoming.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm">Upcoming</h3>
          {upcoming.map(s => (
            <Card key={s.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onSelect(s)}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-red-100 flex items-center justify-center shrink-0">
                    <Radio className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm truncate">{s.title}</p>
                      <Badge className={`text-xs ${STATUS_COLORS[s.status] ?? ""}`}>{s.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      🗓 {new Date(s.scheduledAt).toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <div className="flex gap-1 mt-1">
                      {s.platforms.map(p => <span key={p} className="text-xs">{PLATFORM_ICONS[p]}</span>)}
                    </div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                    onClick={e => { e.stopPropagation(); deleteSession.mutate(s.id); }}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-semibold text-sm text-muted-foreground">Past Sessions</h3>
          {past.map(s => (
            <Card key={s.id} className="cursor-pointer hover:shadow-sm transition-shadow opacity-75" onClick={() => onSelect(s)}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{s.title}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-muted-foreground"><Eye className="w-3 h-3 inline mr-1" />{s.totalViewers.toLocaleString()} views</span>
                      <span className="text-xs text-emerald-600 font-medium">₦{Number(s.totalRevenue).toLocaleString()}</span>
                    </div>
                  </div>
                  <Badge className={`text-xs ${STATUS_COLORS[s.status] ?? ""}`}>{s.status}</Badge>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sessions.length === 0 && (
        <div className="text-center py-16">
          <Radio className="w-12 h-12 mx-auto mb-4 opacity-20" />
          <h2 className="font-bold text-lg mb-2">No live sessions yet</h2>
          <p className="text-muted-foreground text-sm mb-4">Schedule your first session to start building your live audience</p>
          <Button onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Schedule Session</Button>
        </div>
      )}
    </div>
  );
}

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pending",   cls: "bg-gray-100 text-gray-600" },
  ready:     { label: "Ready",     cls: "bg-blue-100 text-blue-700" },
  validated: { label: "Validated", cls: "bg-emerald-100 text-emerald-700" },
  invalid:   { label: "Invalid",   cls: "bg-red-100 text-red-700" },
  armed:     { label: "⚡ Armed",  cls: "bg-amber-100 text-amber-800 animate-pulse" },
  live:      { label: "🔴 Live",   cls: "bg-red-100 text-red-700 animate-pulse" },
  ended:     { label: "Ended",     cls: "bg-gray-100 text-gray-500" },
};

const PLACEHOLDER_KEY_PATTERN = /^(INSTAGRAM|YOUTUBE|FACEBOOK|X|TIKTOK)-[A-Z0-9]{6}$/i;

function isPlaceholderKey(key: string | null | undefined): boolean {
  if (!key || key.trim() === "") return true;
  const k = key.trim();
  if (k.startsWith("DEMO-")) return true;
  if (PLACEHOLDER_KEY_PATTERN.test(k)) return true;
  return false;
}

function BroadcastTab({ session, onSessionUpdate }: { session: LiveSession; onSessionUpdate: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showOBSGuide, setShowOBSGuide] = useState(false);
  const [showStreamKeys, setShowStreamKeys] = useState<Record<string, boolean>>({});
  const [editableStreamKeys, setEditableStreamKeys] = useState<Record<string, string>>({});
  const [dirtyStreamKeys, setDirtyStreamKeys] = useState<Record<string, boolean>>({});
  const [validationResults, setValidationResults] = useState<ValidationResult | null>(null);
  const [goLiveResult, setGoLiveResult] = useState<GoLiveResult | null>(null);
  const [obsWebSocketUrl, setObsWebSocketUrl] = useState("");
  const [obsWebSocketPassword, setObsWebSocketPassword] = useState("");

  const { data: configs = [] } = useQuery<PlatformConfig[]>({
    queryKey: ["live-platform-configs", session.id],
    queryFn: () => apiFetch(`/live-sessions/${session.id}/platform-configs`),
  });

  const { data: viewerData, refetch: refetchViewers } = useQuery<ViewerCountData>({
    queryKey: ["live-viewer-count", session.id],
    queryFn: () => apiFetch(`/live-sessions/${session.id}/viewer-count`),
    enabled: session.status === "live",
    refetchInterval: session.status === "live" ? 15000 : false,
  });

  const { data: preLiveApiStatus } = useQuery<ViewerCountData>({
    queryKey: ["live-viewer-api-status", session.id],
    queryFn: () => apiFetch(`/live-sessions/${session.id}/viewer-count`),
    enabled: session.status !== "live" && session.status !== "ended",
    staleTime: 60000,
  });

  const { data: restreamChannels, isLoading: restreamChannelsLoading } = useQuery<RestreamChannelsResult>({
    queryKey: ["restream-channels-preview"],
    queryFn: () => apiFetch("/settings/live-api-keys/restream-channels"),
    enabled: session.status !== "live" && session.status !== "ended",
    staleTime: 120000,
  });

  const { data: liveRestreamChannels } = useQuery<RestreamChannelsResult>({
    queryKey: ["live-restream-channels", session.id],
    queryFn: () => apiFetch(`/live-sessions/${session.id}/restream-channels`),
    enabled: session.status === "live",
    refetchInterval: session.status === "live" ? 30000 : false,
    staleTime: 25000,
  });

  const RESTREAM_CHECK_INTERVAL_MS = 5 * 60 * 1000;

  const { data: restreamKeyHealth } = useQuery<{ ok: boolean; expired: boolean; lastVerified: string; error: string | null } | null>({
    queryKey: ["restream-key-health", session.id],
    queryFn: async () => {
      const res = await fetch(`${API}/settings/live-api-keys/check-restream`, {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 422) return null;
      if (!res.ok) return null;
      return res.json() as Promise<{ ok: boolean; expired: boolean; lastVerified: string; error: string | null }>;
    },
    enabled: session.status !== "ended",
    refetchInterval: session.status === "live" ? RESTREAM_CHECK_INTERVAL_MS : false,
    staleTime: RESTREAM_CHECK_INTERVAL_MS - 60000,
  });

  const updateConfig = useMutation({
    mutationFn: ({ platform, body }: { platform: string; body: object }) =>
      apiFetch(`/live-sessions/${session.id}/platform-configs/${platform}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: (_data, { platform: p }) => {
      setDirtyStreamKeys(s => { const n = { ...s }; delete n[p]; return n; });
      qc.invalidateQueries({ queryKey: ["live-platform-configs", session.id] });
      toast({ title: "Config updated!" });
    },
    onError: (e: Error, { platform: p }) => {
      setDirtyStreamKeys(s => { const n = { ...s }; delete n[p]; return n; });
      toast({ title: e.message, variant: "destructive" });
    },
  });

  const toggleRestreamChannel = useMutation({
    mutationFn: ({ channelId, enabled }: { channelId: number; enabled: boolean }) =>
      apiFetch(`/live-sessions/${session.id}/restream-channel/${channelId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      }),
    onMutate: async ({ channelId, enabled }) => {
      await qc.cancelQueries({ queryKey: ["restream-channels-preview"] });
      await qc.cancelQueries({ queryKey: ["live-restream-channels", session.id] });
      const prevPreview = qc.getQueryData<RestreamChannelsResult>(["restream-channels-preview"]);
      const prevLive = qc.getQueryData<RestreamChannelsResult>(["live-restream-channels", session.id]);
      const patch = (data: RestreamChannelsResult | undefined) =>
        data ? { ...data, channels: data.channels.map(ch => ch.id === channelId ? { ...ch, active: enabled } : ch) } : data;
      qc.setQueryData(["restream-channels-preview"], patch);
      qc.setQueryData(["live-restream-channels", session.id], patch);
      return { prevPreview, prevLive };
    },
    onError: (e: Error, _vars, ctx: any) => {
      if (ctx?.prevPreview) qc.setQueryData(["restream-channels-preview"], ctx.prevPreview);
      if (ctx?.prevLive) qc.setQueryData(["live-restream-channels", session.id], ctx.prevLive);
      toast({ title: "Failed to update channel", description: e.message, variant: "destructive" });
    },
    onSuccess: (_data, { enabled }) => {
      qc.invalidateQueries({ queryKey: ["restream-channels-preview"] });
      qc.invalidateQueries({ queryKey: ["live-restream-channels", session.id] });
      toast({ title: enabled ? "Channel enabled" : "Channel disabled" });
    },
  });

  const validateKeys = useMutation({
    mutationFn: () => apiFetch(`/live-sessions/${session.id}/validate-stream-keys`, { method: "POST" }),
    onSuccess: (data: ValidationResult) => {
      setValidationResults(data);
      qc.invalidateQueries({ queryKey: ["live-platform-configs", session.id] });
      toast({ title: data.allValid ? "✅ All stream keys valid!" : "⚠️ Some keys need fixing", description: data.message });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const goLive = useMutation({
    mutationFn: () => apiFetch(`/live-sessions/${session.id}/go-live`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(obsWebSocketUrl ? { obsWebSocketUrl, ...(obsWebSocketPassword ? { obsWebSocketPassword } : {}) } : {}),
      }),
    }),
    onSuccess: (data: GoLiveResult) => {
      setGoLiveResult(data);
      qc.invalidateQueries({ queryKey: ["live-sessions"] });
      qc.invalidateQueries({ queryKey: ["live-platform-configs", session.id] });
      onSessionUpdate();
      toast({ title: "🔴 You're LIVE!", description: `${session.platforms.length} platform(s) broadcasting` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const confirmLive = useMutation({
    mutationFn: () => apiFetch(`/live-sessions/${session.id}/confirm-live`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["live-sessions"] });
      qc.invalidateQueries({ queryKey: ["live-platform-configs", session.id] });
      onSessionUpdate();
      toast({ title: "🔴 You're LIVE!", description: "Session confirmed live — broadcast is active." });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const endStream = useMutation({
    mutationFn: () => apiFetch(`/live-sessions/${session.id}/end-stream`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ totalViewers: viewerData?.totalViewers, peakViewers: viewerData?.peakViewers }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["live-sessions"] });
      qc.invalidateQueries({ queryKey: ["live-platform-configs", session.id] });
      onSessionUpdate();
      toast({ title: "Stream ended", description: "Your session has been marked as ended." });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const configByPlatform = Object.fromEntries(configs.map(c => [c.platform, c]));
  const platforms = session.platforms as string[];

  const allValidated = configs.length > 0 && configs.every(c => (c.status === "validated" || c.status === "live") && !dirtyStreamKeys[c.platform]);
  const isLive = session.status === "live";
  const isArmed = session.status === "armed";
  const isEnded = session.status === "ended";
  const restreamKeyExpired = restreamKeyHealth != null && restreamKeyHealth.expired === true;

  const platformsWithMissingKeys = platforms.filter(p => {
    const cfg = configByPlatform[p];
    const displayedKey = editableStreamKeys[p] ?? cfg?.streamKey ?? "";
    return isPlaceholderKey(displayedKey);
  });
  const hasMissingKeys = platformsWithMissingKeys.length > 0;

  const platformsWithPendingStatus = Array.from(new Set([
    ...configs.filter(c => c.status === "pending").map(c => c.platform),
    ...Object.entries(dirtyStreamKeys).filter(([, dirty]) => dirty).map(([p]) => p),
  ]));
  const hasPendingConfigs = platformsWithPendingStatus.length > 0;

  return (
    <div className="space-y-4">
      {/* ─── Live viewer count panel (only when live) ─── */}
      {isLive && (
        <Card className="border-red-300 bg-red-50/40">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                <p className="text-sm font-bold text-red-800">LIVE NOW</p>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => refetchViewers()}>
                  <RefreshCw className="w-3 h-3 mr-1" /> Refresh
                </Button>
                <Button size="sm" variant="destructive" onClick={() => endStream.mutate()} disabled={endStream.isPending}>
                  <StopCircle className="w-3.5 h-3.5 mr-1.5" />{endStream.isPending ? "Ending…" : "End Stream"}
                </Button>
              </div>
            </div>
            {/* ─── Restream key health warning banner ─── */}
            {restreamKeyHealth != null && (!restreamKeyHealth.ok || restreamKeyHealth.expired) && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 mb-2 text-xs text-amber-900">
                <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                <div className="flex-1">
                  <span className="font-semibold">⚠ Restream key {restreamKeyHealth.expired ? "revoked or expired" : "unreachable"}.</span>{" "}
                  {restreamKeyHealth.expired
                    ? "Your API key was revoked or expired mid-session — your broadcast may have dropped."
                    : `Check failed: ${restreamKeyHealth.error ?? "unknown error"} — Restream may be unreachable.`}{" "}
                  <a
                    href={`${import.meta.env.BASE_URL}settings#live-viewer-api-keys`}
                    className="underline font-semibold hover:text-amber-700"
                  >
                    Update key in Settings →
                  </a>
                </div>
              </div>
            )}

            {/* ─── Live Restream channel status (polls every 30 s) ─── */}
            {liveRestreamChannels?.ok && liveRestreamChannels.channels.length > 0 && (
              <div className="mb-2 space-y-1.5">
                {liveRestreamChannels.channels.some(ch => !ch.active) && (
                  <div className="flex items-start gap-2 rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-xs text-red-900">
                    <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
                    <div className="flex-1">
                      <span className="font-semibold">⚠ Destination dropped mid-stream.</span>{" "}
                      <span>
                        {liveRestreamChannels.channels.filter(ch => !ch.active).map(ch => ch.displayName).join(", ")}{" "}
                        {liveRestreamChannels.channels.filter(ch => !ch.active).length === 1 ? "has" : "have"} gone offline.
                      </span>{" "}
                      <a
                        href="https://restream.io/dashboard"
                        target="_blank"
                        rel="noreferrer"
                        className="underline font-semibold hover:text-red-700"
                      >
                        Fix in Restream dashboard →
                      </a>
                    </div>
                  </div>
                )}
                <div className="rounded-md border border-gray-200 bg-white/60 px-2.5 py-2 space-y-1.5">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Live Channel Status</p>
                  {liveRestreamChannels.channels.map(ch => {
                    const isPending = toggleRestreamChannel.isPending && (toggleRestreamChannel.variables as any)?.channelId === ch.id;
                    return (
                      <div key={ch.id} className="flex items-center gap-1.5 text-xs">
                        {ch.active ? (
                          <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3 h-3 text-red-500 shrink-0 animate-pulse" />
                        )}
                        <span className={`flex-1 ${ch.active ? "text-emerald-700" : "text-red-700 font-medium"}`}>
                          {ch.displayName}
                          <span className="ml-1 opacity-60 font-normal">({ch.platform})</span>
                          {!ch.active && <span className="ml-1 text-red-600">— dropped</span>}
                        </span>
                        <button
                          disabled={isPending}
                          onClick={() => toggleRestreamChannel.mutate({ channelId: ch.id, enabled: !ch.active })}
                          className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors disabled:opacity-50 ${
                            ch.active
                              ? "border-gray-300 text-gray-600 hover:bg-gray-100 hover:border-gray-400"
                              : "border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {isPending ? "…" : ch.active ? "Disable" : "Enable"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-3 gap-3">
              <div className="text-center">
                <p className="font-black text-2xl text-red-700">{(viewerData?.totalViewers ?? session.totalViewers).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Live Viewers</p>
              </div>
              <div className="text-center">
                <p className="font-black text-2xl text-purple-700">{(viewerData?.peakViewers ?? session.peakViewers).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Peak</p>
              </div>
              <div className="text-center">
                <p className="font-black text-2xl text-blue-700">{platforms.length}</p>
                <p className="text-xs text-muted-foreground">Platforms</p>
              </div>
            </div>
            {viewerData && (
              <div className="mt-2 pt-2 border-t border-red-200">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(viewerData.platforms).map(([p, d]) => (
                    <div key={p} className="flex items-center gap-1 text-xs">
                      <span>{PLATFORM_ICONS[p] ?? "📡"}</span>
                      <span className="font-semibold">{d.viewers.toLocaleString()}</span>
                      <span className="text-muted-foreground">{d.source === "youtube_api" || d.source === "instagram_api" ? "● live" : "● last known"}</span>
                    </div>
                  ))}
                </div>
                {/* ─── API connection status chips (mirrored from pre-live card) ─── */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] text-red-700/70 font-medium mr-0.5">Viewer count API:</span>
                  <a
                    href={`${import.meta.env.BASE_URL}settings#live-viewer-api-keys`}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-opacity hover:opacity-75 ${
                      viewerData.apiKeysConfigured.youtube
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                    title={viewerData.apiKeysConfigured.youtube ? "YouTube Data API connected — counts are real-time" : "YouTube API key not set — showing last-known count. Click to configure."}
                  >
                    <Youtube className="w-3 h-3" />
                    YouTube {viewerData.apiKeysConfigured.youtube ? "✓" : "✗"}
                    {!viewerData.apiKeysConfigured.youtube && <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-60" />}
                  </a>
                  <a
                    href={`${import.meta.env.BASE_URL}settings#live-viewer-api-keys`}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-opacity hover:opacity-75 ${
                      viewerData.apiKeysConfigured.instagram
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-amber-50 text-amber-700 border-amber-200"
                    }`}
                    title={viewerData.apiKeysConfigured.instagram ? "Instagram Graph API connected — counts are real-time" : "Instagram access token not set — showing last-known count. Click to configure."}
                  >
                    <span className="text-[10px] leading-none">📸</span>
                    Instagram {viewerData.apiKeysConfigured.instagram ? "✓" : "✗"}
                    {!viewerData.apiKeysConfigured.instagram && <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-60" />}
                  </a>
                </div>
                {viewerData.note && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    <AlertCircle className="w-3 h-3 inline mr-1" />{viewerData.note}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Armed state card: OBS credentials issued, waiting for push ─── */}
      {isArmed && !isLive && !isEnded && goLiveResult && (
        <Card className="border-amber-400 bg-amber-50/40">
          <CardContent className="py-4 px-4">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">⚡</span>
              <div className="flex-1">
                <p className="font-bold text-amber-800">Session Armed — Start OBS Now</p>
                <p className="text-xs text-amber-700 mt-0.5">RTMP credentials are ready. Open OBS, enter the server and stream key below, then click Start Streaming. Once OBS is live, confirm below.</p>
              </div>
            </div>
            {goLiveResult.obsInstructions && (
              <div className="text-xs bg-amber-100 rounded p-2 mb-3 space-y-1 font-mono">
                {goLiveResult.obsInstructions.server && (
                  <div className="flex items-center gap-2">
                    <span className="text-amber-700 font-semibold w-20 shrink-0">Server:</span>
                    <code>{goLiveResult.obsInstructions.server}</code>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => { navigator.clipboard.writeText(goLiveResult.obsInstructions.server ?? ""); toast({ title: "Server URL copied" }); }}><Copy className="w-3 h-3" /></Button>
                  </div>
                )}
                {goLiveResult.obsInstructions.streamKey && (
                  <div className="flex items-center gap-2">
                    <span className="text-amber-700 font-semibold w-20 shrink-0">Key:</span>
                    <code>••••••••</code>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => { navigator.clipboard.writeText(goLiveResult.obsInstructions.streamKey ?? ""); toast({ title: "Stream key copied" }); }}><Copy className="w-3 h-3" /></Button>
                  </div>
                )}
              </div>
            )}
            <Button className="bg-red-600 hover:bg-red-700 text-white w-full" onClick={() => confirmLive.mutate()} disabled={confirmLive.isPending}>
              <MonitorPlay className="w-4 h-4 mr-2" />{confirmLive.isPending ? "Confirming…" : "✅ I've Started OBS — Confirm Live"}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ─── Go Live action card (only when not live, not armed, and not ended) ─── */}
      {!isLive && !isArmed && !isEnded && (
        <Card className={`border-2 ${allValidated ? "border-emerald-400 bg-emerald-50/30" : "border-dashed border-gray-300"}`}>
          <CardContent className="py-4 px-4">
            <div className="flex items-start gap-4">
              <div className="text-4xl">{allValidated ? "🟢" : "🔴"}</div>
              <div className="flex-1">
                <p className="font-bold text-sm">{allValidated ? "Ready to go live!" : "Validate stream keys first"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {allValidated
                    ? "All platforms validated. Configure a broadcast trigger below, then hit Go Live."
                    : "Run Validate Keys to confirm RTMP connectivity before going live."}
                </p>
              </div>
            </div>

            {/* ─── Viewer count API status chips ─── */}
            {preLiveApiStatus && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-muted-foreground font-medium mr-0.5">Viewer count API:</span>
                <a
                  href={`${import.meta.env.BASE_URL}settings#live-viewer-api-keys`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-opacity hover:opacity-75 ${
                    preLiveApiStatus.apiKeysConfigured.youtube
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                  title={preLiveApiStatus.apiKeysConfigured.youtube ? "YouTube Data API connected — counts will be real-time" : "YouTube API key not set — will show last-known count. Click to configure."}
                >
                  <Youtube className="w-3 h-3" />
                  YouTube {preLiveApiStatus.apiKeysConfigured.youtube ? "✓" : "✗"}
                  {!preLiveApiStatus.apiKeysConfigured.youtube && <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-60" />}
                </a>
                <a
                  href={`${import.meta.env.BASE_URL}settings#live-viewer-api-keys`}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border transition-opacity hover:opacity-75 ${
                    preLiveApiStatus.apiKeysConfigured.instagram
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                  title={preLiveApiStatus.apiKeysConfigured.instagram ? "Instagram Graph API connected — counts will be real-time" : "Instagram access token not set — will show last-known count. Click to configure."}
                >
                  <span className="text-[10px] leading-none">📸</span>
                  Instagram {preLiveApiStatus.apiKeysConfigured.instagram ? "✓" : "✗"}
                  {!preLiveApiStatus.apiKeysConfigured.instagram && <ExternalLink className="w-2.5 h-2.5 ml-0.5 opacity-60" />}
                </a>
              </div>
            )}

            {/* ─── Restream channel preview ─── */}
            <div className="mt-3 rounded-lg border border-gray-200 bg-white/60 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-gray-500" />
                  Restream Destination Channels
                </p>
                {restreamChannels?.configured && (
                  <a
                    href={`${import.meta.env.BASE_URL}settings#live-viewer-api-keys`}
                    className="text-[11px] text-muted-foreground hover:underline"
                  >
                    Manage in Settings →
                  </a>
                )}
              </div>

              {restreamChannelsLoading && (
                <p className="text-xs text-muted-foreground">Checking Restream channels…</p>
              )}

              {!restreamChannelsLoading && restreamChannels && !restreamChannels.configured && (
                <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    No Restream API key configured. Add one in{" "}
                    <a href={`${import.meta.env.BASE_URL}settings#live-viewer-api-keys`} className="underline font-medium">
                      Settings → Live API Keys
                    </a>{" "}
                    to confirm which destinations are active before going live.
                  </span>
                </div>
              )}

              {!restreamChannelsLoading && restreamChannels?.invalid && (
                <div className="flex items-start gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                  <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    Restream API key is invalid or expired. Update it in{" "}
                    <a href={`${import.meta.env.BASE_URL}settings#live-viewer-api-keys`} className="underline font-medium">
                      Settings → Live API Keys
                    </a>{" "}
                    before going live.
                  </span>
                </div>
              )}

              {!restreamChannelsLoading && restreamChannels?.error && !restreamChannels.invalid && (
                <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Could not reach Restream: {restreamChannels.error}</span>
                </div>
              )}

              {!restreamChannelsLoading && restreamChannels?.ok && restreamChannels.channels.length === 0 && (
                <div className="flex items-start gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>Restream key is valid but no destination channels are configured yet. Add destinations at restream.io before going live.</span>
                </div>
              )}

              {!restreamChannelsLoading && restreamChannels?.ok && restreamChannels.channels.length > 0 && (
                <ul className="space-y-1.5">
                  {restreamChannels.channels.map(ch => {
                    const isPending = toggleRestreamChannel.isPending && (toggleRestreamChannel.variables as any)?.channelId === ch.id;
                    return (
                      <li key={ch.id} className="flex items-center gap-1.5 text-xs">
                        {ch.active ? (
                          <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                        ) : (
                          <Circle className="w-3 h-3 text-amber-500 shrink-0" />
                        )}
                        <span className={`flex-1 ${ch.active ? "text-emerald-700" : "text-amber-700"}`}>
                          {ch.displayName}
                          <span className="ml-1 opacity-60 font-normal">({ch.platform})</span>
                          {!ch.active && <span className="ml-1 text-amber-600 font-medium">— disabled</span>}
                        </span>
                        <button
                          disabled={isPending}
                          onClick={() => toggleRestreamChannel.mutate({ channelId: ch.id, enabled: !ch.active })}
                          className={`shrink-0 px-2 py-0.5 rounded text-[10px] font-semibold border transition-colors disabled:opacity-50 ${
                            ch.active
                              ? "border-gray-300 text-gray-600 hover:bg-gray-100 hover:border-gray-400"
                              : "border-emerald-400 text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {isPending ? "…" : ch.active ? "Disable" : "Enable"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Broadcast trigger: Restream (env-based) or OBS WebSocket */}
            <div className="mt-3 space-y-2 border border-gray-200 rounded-lg p-3 bg-white/60">
              <p className="text-xs font-semibold text-gray-700">Broadcast Trigger (required to go live)</p>
              <p className="text-xs text-muted-foreground">
                <strong>Restream:</strong> Set <code className="bg-muted px-1 rounded">RESTREAM_API_KEY</code> on the server to use Restream for automatic multi-platform fan-out. No extra config needed here.
              </p>
              <p className="text-xs text-muted-foreground font-medium">— or trigger OBS directly:</p>
              <div className="space-y-1.5">
                <div>
                  <Label className="text-xs text-muted-foreground">OBS WebSocket URL <span className="text-gray-400">(e.g. ws://your-ip:4455)</span></Label>
                  <Input
                    value={obsWebSocketUrl}
                    onChange={e => setObsWebSocketUrl(e.target.value)}
                    placeholder="ws://192.168.1.100:4455"
                    className="text-xs font-mono mt-0.5 h-8"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">OBS WebSocket Password <span className="text-gray-400">(if set)</span></Label>
                  <Input
                    type="password"
                    value={obsWebSocketPassword}
                    onChange={e => setObsWebSocketPassword(e.target.value)}
                    placeholder="optional"
                    className="text-xs mt-0.5 h-8"
                  />
                </div>
              </div>
            </div>

            {hasMissingKeys && (
              <div className="mt-3 rounded-lg p-3 text-xs bg-red-50 border border-red-200 text-red-800">
                <div className="flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-0.5">Real stream keys required before going live</p>
                    <p className="text-red-700 mb-1">The following platforms still have auto-generated placeholder keys. Paste your real stream keys from each platform's dashboard into the fields below, then validate.</p>
                    <ul className="space-y-0.5">
                      {platformsWithMissingKeys.map(p => (
                        <li key={p} className="flex items-center gap-1">
                          <span>{PLATFORM_ICONS[p]}</span>
                          <span className="capitalize font-medium">{PLATFORM_LABELS[p] ?? p}</span>
                          <span className="text-red-600">— stream key not set</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {!hasMissingKeys && hasPendingConfigs && (
              <div className="mt-3 rounded-lg p-3 text-xs bg-amber-50 border border-amber-200 text-amber-800">
                <div className="flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold mb-0.5">Validation required before going live</p>
                    <p className="text-amber-700 mb-1">The following platforms have a stream key that hasn't been validated yet. Click <strong>Validate Keys</strong> to confirm your keys are working before starting the broadcast.</p>
                    <ul className="space-y-0.5">
                      {platformsWithPendingStatus.map(p => (
                        <li key={p} className="flex items-center gap-1">
                          <span>{PLATFORM_ICONS[p]}</span>
                          <span className="capitalize font-medium">{PLATFORM_LABELS[p] ?? p}</span>
                          <span className="text-amber-600">— pending validation</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* ─── Restream expired-key warning (pre-live) ─── */}
            {restreamKeyExpired && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-400 bg-red-50 px-3 py-2.5 text-xs text-red-900">
                <WifiOff className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
                <div className="flex-1">
                  <span className="font-semibold">⚠ Restream API key is expired or revoked.</span>{" "}
                  Going live will fail until the key is refreshed. Please update it before proceeding.{" "}
                  <a
                    href={`${import.meta.env.BASE_URL}settings#live-viewer-api-keys`}
                    className="underline font-semibold hover:text-red-700"
                  >
                    Update key in Settings →
                  </a>
                </div>
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <Button size="sm" variant="outline" onClick={() => validateKeys.mutate()} disabled={validateKeys.isPending || configs.length === 0 || hasMissingKeys}>
                <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />{validateKeys.isPending ? "Validating…" : "Validate Keys"}
              </Button>
              <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => goLive.mutate()}
                disabled={goLive.isPending || !allValidated || hasMissingKeys || hasPendingConfigs || restreamKeyExpired}
              >
                <MonitorPlay className="w-3.5 h-3.5 mr-1.5" />{goLive.isPending ? "Going Live…" : "🔴 Go Live"}
              </Button>
            </div>

            {/* Validation result banner */}
            {validationResults && (
              <div className={`mt-3 rounded-lg p-3 text-xs ${validationResults.allValid ? "bg-emerald-50 border border-emerald-200 text-emerald-800" : "bg-amber-50 border border-amber-200 text-amber-800"}`}>
                <p className="font-semibold mb-1">{validationResults.allValid ? "✅" : "⚠️"} {validationResults.message}</p>
                <p className="text-muted-foreground mb-1.5">
                  {validationResults.validationType === "restream_api"
                    ? "Validated via Restream API — destination channels confirmed active."
                    : "Validated via format check + TCP RTMP connectivity. Platform-level key auth requires per-platform OAuth (not supported in this mode)."}
                </p>
                {validationResults.results.map(r => (
                  <div key={r.platform} className="flex items-start gap-1.5 mt-0.5">
                    <span>{PLATFORM_ICONS[r.platform]}</span>
                    <span>{r.valid ? "✓" : "✗"} <strong className="capitalize">{r.platform}</strong>: {r.message}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── Go Live result / OBS setup guide ─── */}
      {(goLiveResult || isLive) && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-blue-900">📡 OBS / StreamYard Setup</p>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowOBSGuide(v => !v)}>
                {showOBSGuide ? "Hide" : "Show"} Guide
              </Button>
            </div>
            {goLiveResult && (
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-xs">
                  {goLiveResult.restream.connected ? (
                    <>
                      <Wifi className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="text-emerald-700 font-semibold">Restream: broadcast started</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-amber-700 font-medium">Restream not active</span>
                    </>
                  )}
                </div>
                {goLiveResult.restream.connected && goLiveResult.restream.channels && goLiveResult.restream.channels.length > 0 && (
                  <div className="mt-1.5 rounded-md border border-emerald-200 bg-emerald-50/60 px-2.5 py-2 space-y-1">
                    <p className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide mb-1">Destination Channels</p>
                    {goLiveResult.restream.channels.map(ch => (
                      <div key={ch.id} className="flex items-center gap-2 text-xs">
                        <span>{PLATFORM_ICONS[ch.platform] ?? "📡"}</span>
                        <span className="flex-1 font-medium text-emerald-900 truncate">{ch.displayName}</span>
                        {ch.enabled ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold">
                            <CheckCircle className="w-2.5 h-2.5" /> active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold">
                            <AlertCircle className="w-2.5 h-2.5" /> disabled
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {goLiveResult.restream.connected && goLiveResult.restream.obsServer && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                    <span className="font-medium shrink-0">OBS Server:</span>
                    <code className="bg-emerald-100 px-1.5 py-0.5 rounded font-mono text-emerald-800">{goLiveResult.restream.obsServer}</code>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => { navigator.clipboard.writeText(goLiveResult.restream.obsServer ?? ""); toast({ title: "RTMP server copied" }); }}>
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                )}
                {!goLiveResult.restream.connected && (
                  <p className="text-xs text-amber-600">{goLiveResult.restream.message}</p>
                )}
              </div>
            )}
            {showOBSGuide && goLiveResult && (
              <div className="text-xs text-blue-800 space-y-2 mt-2 border-t border-blue-200 pt-2">
                <p className="font-semibold">{goLiveResult.obsInstructions.mode === "restream" ? "Single-feed via Restream (recommended)" : "Direct multi-platform via obs-multi-rtmp"}</p>
                <p>{goLiveResult.obsInstructions.summary}</p>
                {goLiveResult.obsInstructions.mode === "restream" && goLiveResult.obsInstructions.server && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1">
                      <span className="font-medium w-20 shrink-0">Server:</span>
                      <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">{goLiveResult.obsInstructions.server}</code>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(goLiveResult.obsInstructions.server ?? ""); toast({ title: "Server URL copied" }); }}>
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                    {goLiveResult.obsInstructions.streamKey && (
                      <div className="flex items-center gap-1">
                        <span className="font-medium w-20 shrink-0">Stream Key:</span>
                        <code className="bg-blue-100 px-1.5 py-0.5 rounded font-mono">••••••••</code>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(goLiveResult.obsInstructions.streamKey ?? ""); toast({ title: "Stream key copied" }); }}>
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
                {goLiveResult.obsInstructions.mode === "direct_multi_rtmp" && goLiveResult.obsInstructions.pluginUrl && (
                  <p>Plugin: <a href={goLiveResult.obsInstructions.pluginUrl} target="_blank" rel="noreferrer" className="underline">{goLiveResult.obsInstructions.pluginUrl}</a></p>
                )}
              </div>
            )}
            {showOBSGuide && !goLiveResult && (
              <div className="text-xs text-blue-800 space-y-2 mt-2 border-t border-blue-200 pt-2">
                <p><strong>OBS Studio:</strong> Settings → Stream → Service: Custom… → Enter RTMP Server & Stream Key → Start Streaming.</p>
                <p><strong>Restream.io (recommended):</strong> One OBS output to rtmp://live.restream.io/live fans out to all platforms automatically. Set RESTREAM_API_KEY to enable.</p>
                <p><strong>Direct multi-platform:</strong> Install the <em>obs-multi-rtmp</em> plugin and add one output per platform using the keys below.</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ─── RTMP info panel (when no active broadcast setup) ─── */}
      {!goLiveResult && !isLive && (
        <Card className="border-blue-200 bg-blue-50/40">
          <CardContent className="py-3 px-4">
            <p className="text-sm font-medium text-blue-800">📡 RTMP Multi-Stream Setup</p>
            <p className="text-xs text-blue-600 mt-0.5">Copy each platform's stream key and RTMP endpoint into OBS, StreamYard, or Restream. All platforms receive the same feed simultaneously.</p>
          </CardContent>
        </Card>
      )}

      {/* ─── Per-platform stream key cards ─── */}
      <div className="space-y-3">
        {platforms.map(platform => {
          const cfg = configByPlatform[platform];
          const isDirty = dirtyStreamKeys[platform] ?? false;
          const effectiveStatus = isDirty ? "pending" : (cfg?.status ?? "pending");
          const statusCfg = STATUS_CONFIG[effectiveStatus];
          const validResult = validationResults?.results.find(r => r.platform === platform);
          const showKey = showStreamKeys[platform] ?? false;

          return (
            <Card key={platform} className={effectiveStatus === "live" ? "border-red-300" : effectiveStatus === "validated" ? "border-emerald-300" : effectiveStatus === "invalid" ? "border-red-200" : ""}>
              <CardContent className="py-4 px-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-xl">{PLATFORM_ICONS[platform]}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-sm">{PLATFORM_LABELS[platform] ?? platform}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge className={`${statusCfg?.cls ?? "bg-gray-100 text-gray-600"} text-xs`}>
                        {statusCfg?.label ?? cfg?.status ?? "pending"}
                      </Badge>
                      {cfg?.validatedAt && !isDirty && (
                        <span className="text-xs text-muted-foreground">validated {new Date(cfg.validatedAt).toLocaleTimeString()}</span>
                      )}
                    </div>
                  </div>
                  {/* "Mark Ready" removed — use Validate Keys to set platform status */}
                  {isLive && cfg?.currentViewers !== undefined && (
                    <div className="text-right">
                      <p className="font-bold text-sm text-red-600">{(cfg.currentViewers ?? 0).toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">viewers</p>
                    </div>
                  )}
                </div>

                {/* Validation message inline */}
                {validResult && (
                  <div className={`text-xs rounded px-2 py-1 mb-2 ${validResult.valid ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {validResult.valid ? <CheckCircle className="w-3 h-3 inline mr-1" /> : <AlertCircle className="w-3 h-3 inline mr-1" />}
                    {validResult.message}
                  </div>
                )}

                {/* Inline warning when key is still a placeholder */}
                {isPlaceholderKey(editableStreamKeys[platform] ?? cfg?.streamKey) && (
                  <div className="text-xs rounded px-2 py-1 mb-2 bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-1.5">
                    <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />
                    <span>Paste your real stream key from {PLATFORM_LABELS[platform] ?? platform} before validating.</span>
                  </div>
                )}

                <div className="space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">RTMP Endpoint</Label>
                    <div className="flex gap-1 mt-0.5">
                      <Input value={cfg?.rtmpEndpoint ?? ""} readOnly className="text-xs font-mono bg-muted" />
                      <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => { navigator.clipboard.writeText(cfg?.rtmpEndpoint ?? ""); toast({ title: "Copied!" }); }}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-0.5">
                      <Label className="text-xs text-muted-foreground">Stream Key</Label>
                      <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowStreamKeys(s => ({ ...s, [platform]: !s[platform] }))}>
                        {showKey ? "Hide" : "Reveal"}
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <Input
                        value={editableStreamKeys[platform] ?? cfg?.streamKey ?? ""}
                        onChange={e => {
                          setEditableStreamKeys(s => ({ ...s, [platform]: e.target.value }));
                          setDirtyStreamKeys(s => ({ ...s, [platform]: true }));
                        }}
                        onBlur={e => {
                          const newKey = e.target.value.trim();
                          const currentKey = cfg?.streamKey ?? "";
                          if (newKey !== currentKey && newKey !== "") {
                            updateConfig.mutate({ platform, body: { streamKey: newKey, status: "pending" } });
                            setValidationResults(null);
                          } else {
                            setDirtyStreamKeys(s => { const n = { ...s }; delete n[platform]; return n; });
                          }
                        }}
                        placeholder="Paste stream key from platform dashboard…"
                        className={`text-xs font-mono ${isPlaceholderKey(editableStreamKeys[platform] ?? cfg?.streamKey) ? "border-amber-300 bg-amber-50/40" : ""}`}
                        type={showKey ? "text" : "password"}
                      />
                      <Button size="icon" variant="ghost" className="h-9 w-9 shrink-0" onClick={() => { navigator.clipboard.writeText(editableStreamKeys[platform] ?? cfg?.streamKey ?? ""); toast({ title: "Copied!" }); }}>
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Broadcast URL (optional — for viewer count)</Label>
                    <Input
                      defaultValue={cfg?.broadcastUrl ?? ""}
                      className="text-xs mt-0.5"
                      placeholder={platform === "youtube" ? "https://youtube.com/watch?v=..." : platform === "instagram" ? "https://instagram.com/..." : "Paste live URL after going live"}
                      onBlur={e => {
                        if (e.target.value !== cfg?.broadcastUrl) {
                          updateConfig.mutate({ platform, body: { broadcastUrl: e.target.value } });
                        }
                      }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ─── Go-Live Checklist ─── */}
      <Card className="border-emerald-200 bg-emerald-50/40">
        <CardContent className="py-3 px-4">
          <p className="text-sm font-semibold mb-2">Go-Live Checklist</p>
          <div className="space-y-1.5">
            {[
              "Stream keys validated (click Validate Keys above)",
              "RTMP endpoints entered in OBS / StreamYard / Restream",
              "30-second test stream confirmed before going live",
              "Lighting and audio checked",
              "Countdown posts scheduled and reminder notifications sent",
              "Moderators briefed and ready on the Chat tab",
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ─── API key setup notice ─── */}
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="py-3 px-4">
          <p className="text-xs font-semibold text-amber-800 mb-1">🔧 Optional: Wire up live APIs for real viewer counts</p>
          <div className="text-xs text-amber-700 space-y-0.5">
            <p><strong>YOUTUBE_API_KEY</strong> — pulls live concurrent viewer count from YouTube Studio API</p>
            <p><strong>INSTAGRAM_ACCESS_TOKEN</strong> — pulls viewer count from Instagram Graph API</p>
            <p><strong>RESTREAM_API_KEY</strong> — connects Restream.io for single-feed multi-platform broadcast management</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function HypeTab({ session }: { session: LiveSession }) {
  const { toast } = useToast();
  const [posts, setPosts] = useState<DripPost[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadHype = useMutation({
    mutationFn: () => apiFetch(`/live-sessions/${session.id}/hype-schedule`, { method: "POST" }),
    onSuccess: (data: { posts: DripPost[] }) => { setPosts(data.posts); setLoaded(true); toast({ title: `${data.posts.length} hype posts generated!` }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const timeLabel = (hours: number) => {
    if (hours >= 168) return "7 days before";
    if (hours >= 72) return "3 days before";
    if (hours >= 48) return "48 hours before";
    if (hours >= 24) return "24 hours before";
    if (hours >= 6) return "6 hours before";
    if (hours >= 1) return "1 hour before";
    return "15 min before";
  };

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-4">
            <div className="text-3xl">🔥</div>
            <div className="flex-1">
              <h3 className="font-bold text-sm">48-Hour Pre-Live Hype Schedule</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Generate a full countdown sequence — 7 days out to 15 minutes before go-live. Posts auto-formatted for each platform with your session details.
              </p>
              {session.scheduledAt && (
                <p className="text-xs font-semibold mt-2 text-amber-700">
                  Go-Live: {new Date(session.scheduledAt).toLocaleDateString("en-NG", { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
            </div>
            <Button onClick={() => loadHype.mutate()} disabled={loadHype.isPending} size="sm">
              <Zap className="w-4 h-4 mr-1.5" />{loadHype.isPending ? "Generating…" : "Generate Hype"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loaded && posts.map((post, i) => (
        <Card key={i} className="hover:shadow-sm transition-shadow">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-3">
              <span className="text-xl mt-0.5">{PLATFORM_ICONS[post.platform] ?? "📢"}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="outline" className="text-xs capitalize">{post.platform}</Badge>
                  <span className="text-xs text-amber-600 font-medium">{timeLabel(post.hoursBeforeLive)}</span>
                  <span className="text-xs text-muted-foreground">{new Date(post.scheduledDate).toLocaleDateString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{post.content}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ChatTab({ session }: { session: LiveSession }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filterPlatform, setFilterPlatform] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [newMsg, setNewMsg] = useState({ platform: "youtube", authorName: "", message: "", isQuestion: false });

  const { data: messages = [], isLoading } = useQuery<ChatMessage[]>({
    queryKey: ["live-chat", session.id],
    queryFn: () => apiFetch(`/live-sessions/${session.id}/chat`),
    refetchInterval: session.status === "live" ? 5000 : false,
  });

  const addMsg = useMutation({
    mutationFn: (body: object) => apiFetch(`/live-sessions/${session.id}/chat`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["live-chat", session.id] }); setNewMsg(f => ({ ...f, authorName: "", message: "" })); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMsg = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/live-chat/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live-chat", session.id] }),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const filtered = messages.filter(m => {
    if (filterPlatform !== "all" && m.platform !== filterPlatform) return false;
    if (filterType === "questions" && !m.isQuestion) return false;
    if (filterType === "pinned" && !m.isPinned) return false;
    if (filterType === "banned" && !m.isBanned) return false;
    if (m.isBanned && filterType !== "banned") return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <select className="text-sm border rounded-lg px-2 py-1.5 bg-background" value={filterPlatform} onChange={e => setFilterPlatform(e.target.value)}>
          <option value="all">All Platforms</option>
          {["instagram", "youtube", "facebook", "x"].map(p => <option key={p} value={p}>{PLATFORM_LABELS[p]}</option>)}
        </select>
        <select className="text-sm border rounded-lg px-2 py-1.5 bg-background" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All Messages</option>
          <option value="questions">Questions Only</option>
          <option value="pinned">Pinned</option>
          <option value="banned">Banned</option>
        </select>
        <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
          <MessageSquare className="w-3.5 h-3.5" />
          <span>{messages.filter(m => !m.isBanned).length} messages</span>
          {messages.filter(m => m.isQuestion).length > 0 && (
            <span className="ml-2 text-blue-600">{messages.filter(m => m.isQuestion).length} questions</span>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading chat…</div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filtered.map(msg => (
            <div key={msg.id} className={`flex items-start gap-2 px-3 py-2 rounded-lg ${msg.isPinned ? "bg-yellow-50 border border-yellow-200" : msg.isQuestion ? "bg-blue-50 border border-blue-100" : msg.isBanned ? "bg-red-50 opacity-50" : "bg-muted/30"}`}>
              <div className="text-xs shrink-0 mt-0.5">{PLATFORM_ICONS[msg.platform]}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold">{msg.authorName}</span>
                  {msg.authorHandle && <span className="text-xs text-muted-foreground">{msg.authorHandle}</span>}
                  {msg.isPinned && <Pin className="w-3 h-3 text-yellow-600" />}
                  {msg.isQuestion && <HelpCircle className="w-3 h-3 text-blue-500" />}
                </div>
                <p className="text-xs text-gray-700 mt-0.5 break-words">{msg.message}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <button title="Pin" onClick={() => updateMsg.mutate({ id: msg.id, body: { isPinned: !msg.isPinned } })} className="p-1 hover:bg-yellow-100 rounded">
                  <Pin className="w-3 h-3 text-muted-foreground" />
                </button>
                <button title="Question" onClick={() => updateMsg.mutate({ id: msg.id, body: { isQuestion: !msg.isQuestion } })} className="p-1 hover:bg-blue-100 rounded">
                  <HelpCircle className="w-3 h-3 text-muted-foreground" />
                </button>
                <button title="Ban" onClick={() => updateMsg.mutate({ id: msg.id, body: { isBanned: !msg.isBanned } })} className="p-1 hover:bg-red-100 rounded">
                  <Ban className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-6">No messages match this filter</p>}
        </div>
      )}

      <div className="border-t pt-3">
        <p className="text-xs font-semibold text-muted-foreground mb-2">Add message manually</p>
        <div className="flex gap-2 flex-wrap">
          <select className="text-sm border rounded-lg px-2 py-1.5 bg-background" value={newMsg.platform} onChange={e => setNewMsg(f => ({ ...f, platform: e.target.value }))}>
            {["instagram", "youtube", "facebook", "x"].map(p => <option key={p} value={p}>{PLATFORM_ICONS[p]} {p}</option>)}
          </select>
          <Input className="flex-1 text-sm" placeholder="Author name" value={newMsg.authorName} onChange={e => setNewMsg(f => ({ ...f, authorName: e.target.value }))} />
          <Input className="flex-1 text-sm" placeholder="Message" value={newMsg.message} onChange={e => setNewMsg(f => ({ ...f, message: e.target.value }))} />
          <Button size="sm" onClick={() => addMsg.mutate(newMsg)} disabled={!newMsg.authorName || !newMsg.message || addMsg.isPending}>
            <Send className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function RemindersTab({ session }: { session: LiveSession }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: signups = [], isLoading } = useQuery<ReminderSignup[]>({
    queryKey: ["live-reminders", session.id],
    queryFn: () => apiFetch(`/live-sessions/${session.id}/reminders`),
  });

  const sendReminders = useMutation({
    mutationFn: () => apiFetch(`/live-sessions/${session.id}/send-reminders`, { method: "POST" }),
    onSuccess: (data: { message: string }) => { qc.invalidateQueries({ queryKey: ["live-reminders", session.id] }); toast({ title: data.message }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const reminded = signups.filter(s => s.reminded).length;
  const pending = signups.filter(s => !s.reminded).length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="py-3 text-center"><p className="font-black text-2xl text-blue-600">{signups.length}</p><p className="text-xs text-muted-foreground">Total Sign-ups</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="font-black text-2xl text-amber-600">{pending}</p><p className="text-xs text-muted-foreground">Pending</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="font-black text-2xl text-emerald-600">{reminded}</p><p className="text-xs text-muted-foreground">Notified</p></CardContent></Card>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Fan reminder opt-ins for this session</p>
        <Button size="sm" onClick={() => sendReminders.mutate()} disabled={sendReminders.isPending || pending === 0}>
          <Bell className="w-4 h-4 mr-1.5" />{sendReminders.isPending ? "Sending…" : `Send to ${pending} Fans`}
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="space-y-2">
          {signups.map(s => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-card">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-primary font-bold text-xs">{s.fanName[0].toUpperCase()}</span>
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{s.fanName}</p>
                <p className="text-xs text-muted-foreground">{s.fanEmail ?? s.fanPhone} · {s.channel === "email" ? "📧" : "💬"} {s.channel}</p>
              </div>
              {s.reminded ? (
                <Badge className="bg-emerald-100 text-emerald-700 text-xs">Notified</Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-700 text-xs">Pending</Badge>
              )}
            </div>
          ))}
          {signups.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No fan sign-ups yet</p>
              <p className="text-xs mt-1">Fans can opt in on your public session page</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PostLiveTab({ session }: { session: LiveSession }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [clipForm, setClipForm] = useState({ label: "", startSeconds: "", endSeconds: "", platform: "instagram" });

  const { data: clips = [], isLoading: clipsLoading } = useQuery<Clip[]>({
    queryKey: ["live-clips", session.id],
    queryFn: () => apiFetch(`/live-sessions/${session.id}/clips`),
  });

  const { data: revenue } = useQuery<RevenueData>({
    queryKey: ["live-revenue", session.id],
    queryFn: () => apiFetch(`/live-sessions/${session.id}/revenue`),
  });

  const addClip = useMutation({
    mutationFn: (body: object) => apiFetch(`/live-sessions/${session.id}/clips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["live-clips", session.id] }); setClipForm({ label: "", startSeconds: "", endSeconds: "", platform: "instagram" }); toast({ title: "Clip added!" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteClip = useMutation({
    mutationFn: (id: number) => apiFetch(`/live-clips/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["live-clips", session.id] }); toast({ title: "Clip deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const byTypeData = Object.entries(revenue?.byType ?? {}).map(([name, value]) => ({ name, value }));
  const byPlatformData = Object.entries(revenue?.byPlatform ?? {}).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-5">
      {/* Revenue Summary */}
      <div>
        <h3 className="font-semibold text-sm mb-3"><DollarSign className="w-4 h-4 inline mr-1" /> Live Revenue Tracker</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <Card><CardContent className="py-3 text-center"><p className="font-black text-xl text-emerald-600">₦{(revenue?.totalRevenue ?? 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Revenue</p></CardContent></Card>
          <Card><CardContent className="py-3 text-center"><p className="font-black text-xl">{revenue?.events.length ?? 0}</p><p className="text-xs text-muted-foreground">Events</p></CardContent></Card>
          <Card><CardContent className="py-3 text-center"><p className="font-black text-xl text-blue-600">{session.peakViewers.toLocaleString()}</p><p className="text-xs text-muted-foreground">Peak Viewers</p></CardContent></Card>
          <Card><CardContent className="py-3 text-center"><p className="font-black text-xl">{session.totalViewers.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Views</p></CardContent></Card>
        </div>

        {byTypeData.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">By Event Type</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart><Pie data={byTypeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, value }) => `${EVENT_ICONS[name] ?? "💰"} ₦${Number(value).toLocaleString()}`}>
                  {byTypeData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie><Tooltip formatter={(v: number) => `₦${v.toLocaleString()}`} /></PieChart>
              </ResponsiveContainer>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">By Platform</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={byPlatformData} margin={{ left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => `₦${v.toLocaleString()}`} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {byPlatformData.map((entry, i) => <Cell key={i} fill={PLATFORM_COLORS[entry.name] ?? "#16a34a"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* Clip Generator */}
      <div>
        <h3 className="font-semibold text-sm mb-3"><Scissors className="w-4 h-4 inline mr-1" /> Post-Live Clip Generator</h3>

        <Card className="mb-3">
          <CardContent className="py-3 px-4">
            <p className="text-xs font-semibold mb-2">Mark a top moment</p>
            <div className="flex flex-wrap gap-2">
              <Input className="w-40 text-sm" placeholder="Label" value={clipForm.label} onChange={e => setClipForm(f => ({ ...f, label: e.target.value }))} />
              <Input className="w-24 text-sm" placeholder="Start (sec)" type="number" value={clipForm.startSeconds} onChange={e => setClipForm(f => ({ ...f, startSeconds: e.target.value }))} />
              <Input className="w-24 text-sm" placeholder="End (sec)" type="number" value={clipForm.endSeconds} onChange={e => setClipForm(f => ({ ...f, endSeconds: e.target.value }))} />
              <select className="text-sm border rounded-lg px-2 py-1.5 bg-background" value={clipForm.platform} onChange={e => setClipForm(f => ({ ...f, platform: e.target.value }))}>
                {["instagram", "youtube", "tiktok", "facebook"].map(p => <option key={p} value={p}>{PLATFORM_ICONS[p]} {p}</option>)}
              </select>
              <Button size="sm" onClick={() => addClip.mutate({ ...clipForm, startSeconds: Number(clipForm.startSeconds), endSeconds: Number(clipForm.endSeconds) })}
                disabled={!clipForm.label || !clipForm.startSeconds || !clipForm.endSeconds || addClip.isPending}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Clip
              </Button>
            </div>
          </CardContent>
        </Card>

        {clipsLoading ? (
          <div className="text-center py-6 text-muted-foreground text-sm">Loading clips…</div>
        ) : (
          <div className="space-y-2">
            {clips.map(clip => (
              <Card key={clip.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Scissors className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="font-semibold text-sm">{clip.label}</p>
                        <Badge variant="outline" className="text-xs">{fmtSecs(clip.startSeconds)} → {fmtSecs(clip.endSeconds)}</Badge>
                        {clip.platform && <span className="text-xs">{PLATFORM_ICONS[clip.platform]}</span>}
                        <Badge className={clip.status === "ready" ? "bg-emerald-100 text-emerald-700 text-xs" : "bg-blue-100 text-blue-700 text-xs"}>{clip.status}</Badge>
                      </div>
                      {clip.aiCaption && <p className="text-xs text-gray-600 leading-relaxed italic">"{clip.aiCaption}"</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { navigator.clipboard.writeText(clip.aiCaption ?? ""); toast({ title: "Caption copied!" }); }} title="Copy caption">
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteClip.mutate(clip.id)} disabled={deleteClip.isPending}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {clips.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <Scissors className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No clips marked yet</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LiveVideoInner() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("calendar");
  const [sessionTab, setSessionTab] = useState("broadcast");

  const { data: sessions = [], isLoading } = useQuery<LiveSession[]>({
    queryKey: ["live-sessions"],
    queryFn: () => apiFetch("/live-sessions"),
    onSuccess: (data: LiveSession[]) => { if (data.length > 0 && !selectedId) setSelectedId(data[0].id); },
  } as any);

  const selectedSession = sessions.find(s => s.id === selectedId) ?? sessions[0] ?? null;

  const totalRevenue = sessions.reduce((s, sess) => s + Number(sess.totalRevenue), 0);
  const totalViewers = sessions.reduce((s, sess) => s + sess.totalViewers, 0);
  const liveNow = sessions.filter(s => s.status === "live").length;

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-black">🎬 Live Video Command Center</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Schedule, broadcast, moderate, and monetise your live sessions across every platform</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Live Now", value: liveNow, icon: "🔴", color: liveNow > 0 ? "text-red-600" : "text-muted-foreground" },
          { label: "Sessions", value: sessions.length, icon: "📅", color: "text-blue-600" },
          { label: "Total Viewers", value: totalViewers.toLocaleString(), icon: "👥", color: "text-purple-600" },
          { label: "Live Revenue", value: `₦${totalRevenue.toLocaleString()}`, icon: "💰", color: "text-emerald-600" },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="py-3 px-4 text-center">
              <p className="text-2xl mb-1">{stat.icon}</p>
              <p className={`font-black text-xl ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground">Loading sessions…</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Sessions</p>
            {sessions.map(s => (
              <button
                key={s.id}
                onClick={() => { setSelectedId(s.id); setActiveTab("session"); }}
                className={`w-full text-left p-2.5 rounded-lg border transition-all ${selectedSession?.id === s.id && activeTab === "session" ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/40"}`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full shrink-0 ${s.status === "live" ? "bg-red-500 animate-pulse" : s.status === "scheduled" ? "bg-blue-400" : "bg-gray-300"}`} />
                  <p className="font-medium text-xs truncate">{s.title}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 pl-4">{new Date(s.scheduledAt).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}</p>
              </button>
            ))}
            <button
              onClick={() => setActiveTab("calendar")}
              className={`w-full text-left p-2.5 rounded-lg border transition-all mt-2 ${activeTab === "calendar" ? "border-primary bg-primary/5" : "border-dashed border-border hover:bg-muted/40"}`}
            >
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Plus className="w-3.5 h-3.5" /> Schedule New
              </div>
            </button>
          </div>

          <div className="lg:col-span-3">
            {activeTab === "calendar" ? (
              <CalendarTab sessions={sessions} onSelect={s => { setSelectedId(s.id); setActiveTab("session"); }} />
            ) : selectedSession ? (
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-bold text-lg">{selectedSession.title}</h2>
                      <Badge className={`text-xs ${STATUS_COLORS[selectedSession.status] ?? ""}`}>{selectedSession.status}</Badge>
                    </div>
                    <div className="flex gap-1 mt-1">
                      {(selectedSession.platforms as string[]).map(p => <span key={p} title={PLATFORM_LABELS[p]} className="text-sm">{PLATFORM_ICONS[p]}</span>)}
                      <span className="text-xs text-muted-foreground ml-2">
                        {new Date(selectedSession.scheduledAt).toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                </div>

                <Tabs value={sessionTab} onValueChange={setSessionTab}>
                  <TabsList className="mb-4 flex-wrap h-auto gap-1">
                    <TabsTrigger value="broadcast" className="flex items-center gap-1.5 text-xs"><Settings className="w-3.5 h-3.5" /> Broadcast</TabsTrigger>
                    <TabsTrigger value="hype" className="flex items-center gap-1.5 text-xs"><Zap className="w-3.5 h-3.5" /> Hype</TabsTrigger>
                    <TabsTrigger value="chat" className="flex items-center gap-1.5 text-xs"><MessageSquare className="w-3.5 h-3.5" /> Chat</TabsTrigger>
                    <TabsTrigger value="reminders" className="flex items-center gap-1.5 text-xs"><Bell className="w-3.5 h-3.5" /> Reminders</TabsTrigger>
                    <TabsTrigger value="post-live" className="flex items-center gap-1.5 text-xs"><Scissors className="w-3.5 h-3.5" /> Post-Live</TabsTrigger>
                  </TabsList>
                  <TabsContent value="broadcast"><BroadcastTab session={selectedSession} onSessionUpdate={() => window.location.reload()} /></TabsContent>
                  <TabsContent value="hype"><HypeTab session={selectedSession} /></TabsContent>
                  <TabsContent value="chat"><ChatTab session={selectedSession} /></TabsContent>
                  <TabsContent value="reminders"><RemindersTab session={selectedSession} /></TabsContent>
                  <TabsContent value="post-live"><PostLiveTab session={selectedSession} /></TabsContent>
                </Tabs>
              </div>
            ) : (
              <CalendarTab sessions={sessions} onSelect={s => { setSelectedId(s.id); setActiveTab("session"); }} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function LiveVideoPage() {
  return (
    <AppShell title="Live Video">
      <TierGuard moduleKey="liveVideo" requiredTier="brand" moduleName="Live Video Command Center">
        <LiveVideoInner />
      </TierGuard>
    </AppShell>
  );
}
