import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { AppShell } from "@/components/AppShell";
import { TierGuard } from "@/components/TierGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

async function apiFetch(method: string, url: string, body?: unknown): Promise<Response> {
  return fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

// ─── Types ────────────────────────────────────────────────────────────────────
interface TrafficCampaign {
  id: number; name: string; destinationUrl: string; budgetNgn: string;
  startDate?: string; endDate?: string; status: string; goal: string;
  targetRegion: string; totalVisits: number; totalConversions: number; roiPercent?: string;
  channels?: CampaignChannel[];
}
interface CampaignChannel {
  id: number; channel: string; enabled: boolean; budgetAllocationNgn: string;
  visits: number; clicks: number; costPerVisit?: string; status: string;
  settings: Record<string, unknown>;
}
interface HookEntry {
  id: number; title: string; hookText: string; platform: string; niche: string;
  format: string; useCount: number; likeCount: number; tags: string[]; curated: boolean;
}
interface SeoJob {
  id: number; topic: string; contentType: string; targetKeywords: string[];
  region: string; title?: string; body?: string; metaDescription?: string; status: string; publishedToCalendar: boolean;
}
interface GrowthSnapshot {
  id: number; platform: string; handle: string; followerCount: number;
  followerGrowthRate: string; reachCount: number; engagementVelocity: string;
  healthScore: number; alertEnabled: boolean; alertThresholdRate: string; snapshotDate: string;
}
interface ContentVelocityRec {
  platform: string; currentPostsPerWeek: number; recommendedPostsPerWeek: number;
  contentMix: { educational: number; entertainment: number; promotional: number };
  insight: string;
}

const CHANNEL_META: Record<string, { label: string; icon: string; color: string }> = {
  organic_social: { label: "Organic Social", icon: "📱", color: "bg-blue-100 text-blue-800" },
  whatsapp: { label: "WhatsApp Blast", icon: "💬", color: "bg-green-100 text-green-800" },
  meta_ads: { label: "Meta Ads", icon: "📢", color: "bg-indigo-100 text-indigo-800" },
  influencer: { label: "Influencer Network", icon: "🌟", color: "bg-yellow-100 text-yellow-800" },
  tiktok_spark: { label: "TikTok Spark Ads", icon: "🎵", color: "bg-pink-100 text-pink-800" },
  email: { label: "Email Sequences", icon: "📧", color: "bg-orange-100 text-orange-800" },
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  active: "bg-green-100 text-green-800",
  paused: "bg-yellow-100 text-yellow-800",
  completed: "bg-blue-100 text-blue-800",
  generating: "bg-purple-100 text-purple-800",
  done: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
};

function healthScoreColor(score: number) {
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-600";
}

// ─── Campaign Creation Dialog ─────────────────────────────────────────────────
function CampaignDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (c: TrafficCampaign) => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", destinationUrl: "", budgetNgn: "", goal: "visits", targetRegion: "NG" });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const { mutate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("POST", `${BASE}/api/traffic-campaigns`, form);
      return res.json();
    },
    onSuccess: (campaign) => { onCreated(campaign); onClose(); toast({ title: "Campaign created!" }); },
    onError: () => toast({ title: "Failed to create campaign", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>New Traffic Campaign</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Campaign Name</Label><Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="Book launch — June 2026" /></div>
          <div><Label>Destination URL</Label><Input value={form.destinationUrl} onChange={e => set("destinationUrl", e.target.value)} placeholder="https://areafada.com/999" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Budget (₦)</Label>
              <Input type="number" value={form.budgetNgn} onChange={e => set("budgetNgn", e.target.value)} placeholder="50000" />
            </div>
            <div>
              <Label>Goal</Label>
              <Select value={form.goal} onValueChange={v => set("goal", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="visits">Visits</SelectItem>
                  <SelectItem value="leads">Leads</SelectItem>
                  <SelectItem value="sales">Sales</SelectItem>
                  <SelectItem value="downloads">Downloads</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Target Region</Label>
            <Select value={form.targetRegion} onValueChange={v => set("targetRegion", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NG">Nigeria</SelectItem>
                <SelectItem value="GH">Ghana</SelectItem>
                <SelectItem value="ZA">South Africa</SelectItem>
                <SelectItem value="KE">Kenya</SelectItem>
                <SelectItem value="DIASPORA">Diaspora (UK/US/UAE)</SelectItem>
                <SelectItem value="ALL">All Africa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => mutate()} disabled={isPending || !form.name || !form.destinationUrl}>
              {isPending ? "Creating..." : "Create Campaign"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Campaign Detail Panel ────────────────────────────────────────────────────
function CampaignDetail({ campaign, onStatusChange }: { campaign: TrafficCampaign; onStatusChange: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: detail, isLoading } = useQuery<TrafficCampaign>({
    queryKey: ["traffic-campaign-detail", campaign.id],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/traffic-campaigns/${campaign.id}`, { credentials: "include" });
      return res.json();
    },
  });

  const { mutate: toggleChannel, isPending: toggling } = useMutation({
    mutationFn: async ({ channelId, enabled }: { channelId: number; enabled: boolean }) => {
      const res = await apiFetch("PATCH", `${BASE}/api/traffic-campaigns/${campaign.id}/channels/${channelId}`, { enabled, status: enabled ? "active" : "idle" });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["traffic-campaign-detail", campaign.id] }); toast({ title: "Channel updated" }); },
    onError: () => toast({ title: "Failed to update channel", variant: "destructive" }),
  });

  const { mutate: updateStatus } = useMutation({
    mutationFn: async (status: string) => {
      const res = await apiFetch("PATCH", `${BASE}/api/traffic-campaigns/${campaign.id}`, { status });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["traffic-campaigns"] }); onStatusChange(); },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  if (isLoading) return <div className="p-4 text-center text-muted-foreground">Loading campaign...</div>;
  const d = detail ?? campaign;
  const channels = d.channels ?? [];

  return (
    <div className="space-y-4">
      {/* Campaign stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold text-green-600">{d.totalVisits.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Total Visits</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{d.totalConversions.toLocaleString()}</div>
          <div className="text-xs text-muted-foreground">Conversions</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 text-center">
          <div className="text-2xl font-bold">{d.roiPercent ? `${d.roiPercent}%` : "—"}</div>
          <div className="text-xs text-muted-foreground">ROI</div>
        </CardContent></Card>
      </div>

      {/* Status controls */}
      <div className="flex gap-2 flex-wrap">
        <Badge className={STATUS_COLORS[d.status] ?? "bg-gray-100"}>{d.status}</Badge>
        {d.status === "draft" && <Button size="sm" onClick={() => updateStatus("active")}>▶ Activate</Button>}
        {d.status === "active" && <Button size="sm" variant="outline" onClick={() => updateStatus("paused")}>⏸ Pause</Button>}
        {d.status === "paused" && <Button size="sm" onClick={() => updateStatus("active")}>▶ Resume</Button>}
        {d.status !== "completed" && <Button size="sm" variant="outline" onClick={() => updateStatus("completed")}>✓ Mark Complete</Button>}
      </div>

      {/* Channels */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Channels</h3>
        <div className="space-y-2">
          {channels.map(ch => {
            const meta = CHANNEL_META[ch.channel] ?? { label: ch.channel, icon: "📡", color: "bg-gray-100 text-gray-700" };
            return (
              <div key={ch.id} className={`rounded-lg border p-3 flex items-center gap-3 ${ch.enabled ? "border-green-200 bg-green-50/30" : ""}`}>
                <span className="text-xl">{meta.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{meta.label}</span>
                    {ch.enabled && <Badge className="text-xs bg-green-100 text-green-700">Active</Badge>}
                  </div>
                  <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{ch.visits} visits</span>
                    <span>{ch.clicks} clicks</span>
                    {ch.costPerVisit && <span>₦{ch.costPerVisit} CPV</span>}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={ch.enabled ? "outline" : "default"}
                  disabled={toggling}
                  onClick={() => toggleChannel({ channelId: ch.id, enabled: !ch.enabled })}
                >
                  {ch.enabled ? "Deactivate" : "Activate"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Meta Ads Africa presets */}
      <MetaAdsPanel campaignId={campaign.id} channels={channels} />

      {/* WhatsApp blast manager */}
      <WhatsAppBlastPanel campaignId={campaign.id} channels={channels} />

      {/* Influencer network activations */}
      <InfluencerPanel campaignId={campaign.id} />

      {/* Attribution chart — only when data exists */}
      <AttributionChart channels={channels} />
    </div>
  );
}

// Stub Meta campaign rows shown when no FB account connected
const META_STUB_CAMPAIGNS = [
  { id: "stub_1", name: "Lagos Gen-Z Awareness", status: "paused", budget: 25000, spent: 0, impressions: 0, reach: 0, clicks: 0 },
  { id: "stub_2", name: "Nigerian Creator Launch", status: "paused", budget: 50000, spent: 0, impressions: 0, reach: 0, clicks: 0 },
];

function MetaAdsPanel({ campaignId, channels }: { campaignId: number; channels: CampaignChannel[] }) {
  const { data: presets = [] } = useQuery<Array<{ id: string; label: string; country: string; ageMin: number; ageMax: number }>>({
    queryKey: ["meta-audience-presets"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/traffic/meta-audience-presets`, { credentials: "include" });
      return res.json();
    },
  });
  const metaChannel = channels.find(c => c.channel === "meta_ads");
  const selectedPreset = (metaChannel?.settings as Record<string, unknown>)?.audiencePreset as string | undefined;
  const connected = (metaChannel?.settings as Record<string, unknown>)?.fbConnected === true;
  const adAccountId = (metaChannel?.settings as Record<string, unknown>)?.adAccountId as string | undefined;

  const { toast } = useToast();
  const qc = useQueryClient();
  const [showConnect, setShowConnect] = useState(false);
  const [budgetForm, setBudgetForm] = useState({ daily: "", total: "" });

  const { mutate: applyPreset, isPending } = useMutation({
    mutationFn: async (presetId: string) => {
      if (!metaChannel) return;
      const res = await apiFetch("PATCH", `${BASE}/api/traffic-campaigns/${campaignId}/channels/${metaChannel.id}`, {
        settings: { ...(metaChannel.settings ?? {}), audiencePreset: presetId },
      });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["traffic-campaign-detail", campaignId] }); toast({ title: "Audience preset applied" }); },
  });

  const { mutate: saveBudget } = useMutation({
    mutationFn: async () => {
      if (!metaChannel) return;
      const res = await apiFetch("PATCH", `${BASE}/api/traffic-campaigns/${campaignId}/channels/${metaChannel.id}`, {
        budgetAllocationNgn: budgetForm.total || metaChannel.budgetAllocationNgn,
        settings: { ...(metaChannel.settings ?? {}), dailyBudgetNgn: budgetForm.daily },
      });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["traffic-campaign-detail", campaignId] }); toast({ title: "Budget saved" }); },
  });

  if (!metaChannel) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">📢 Meta Ads Integration</h3>
        {connected
          ? <Badge className="bg-green-100 text-green-700 text-xs">✓ Connected — {adAccountId}</Badge>
          : <Button size="sm" className="h-7 px-3 text-xs" onClick={() => setShowConnect(true)}>Connect FB Account</Button>}
      </div>

      {/* Account connection stub dialog */}
      <Dialog open={showConnect} onOpenChange={setShowConnect}>
        <DialogContent>
          <DialogHeader><DialogTitle>Connect Facebook Business Manager</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="text-muted-foreground">Connecting your FB Business Manager lets you manage Meta Ads campaigns directly from this dashboard.</p>
            <div className="rounded-lg border p-3 bg-blue-50 space-y-2">
              <div className="font-medium">Setup Steps</div>
              <ol className="list-decimal list-inside space-y-1 text-xs text-muted-foreground">
                <li>Go to <span className="font-mono">business.facebook.com</span> and create a Business Manager account</li>
                <li>Add your Ad Account (or create a new one for ₦ billing)</li>
                <li>Generate a System User access token with <span className="font-mono">ads_management</span> scope</li>
                <li>Paste your Ad Account ID and access token below</li>
              </ol>
            </div>
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Ad Account ID</Label>
                <Input placeholder="act_123456789" className="h-8 text-sm font-mono" disabled />
              </div>
              <div>
                <Label className="text-xs">Access Token</Label>
                <Input placeholder="EAA..." className="h-8 text-sm font-mono" type="password" disabled />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">⚠️ OAuth flow is stubbed — full implementation available when Facebook Business Manager OAuth is configured (see follow-up task #44).</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowConnect(false)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Budget management */}
      <div>
        <div className="text-xs font-medium mb-1">Budget Management</div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Daily Budget (₦)</Label>
            <Input
              value={budgetForm.daily}
              onChange={e => setBudgetForm(f => ({ ...f, daily: e.target.value }))}
              placeholder="e.g. 5000"
              className="h-8 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Total Budget (₦)</Label>
            <Input
              value={budgetForm.total}
              onChange={e => setBudgetForm(f => ({ ...f, total: e.target.value }))}
              placeholder="e.g. 50000"
              className="h-8 text-sm"
            />
          </div>
        </div>
        <Button size="sm" className="h-7 px-2 text-xs mt-2" onClick={() => saveBudget()} disabled={!budgetForm.daily && !budgetForm.total}>
          Save Budget
        </Button>
      </div>

      {/* Campaign list */}
      <div>
        <div className="text-xs font-medium mb-1">Campaigns {!connected && <span className="text-muted-foreground">(connect FB account to see live data)</span>}</div>
        <div className="space-y-1">
          {META_STUB_CAMPAIGNS.map(c => (
            <div key={c.id} className="border rounded-lg p-2 flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium">{c.name}</div>
                <div className="flex gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>₦{c.budget.toLocaleString()} budget</span>
                  <span>{connected ? `${c.impressions.toLocaleString()} impressions` : "—"}</span>
                  <span>{connected ? `${c.reach.toLocaleString()} reach` : "—"}</span>
                </div>
              </div>
              <Badge className={`text-xs ${c.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{c.status}</Badge>
            </div>
          ))}
        </div>
      </div>

      {/* Performance metrics */}
      <div>
        <div className="text-xs font-medium mb-1">Performance Metrics</div>
        <div className="grid grid-cols-4 gap-2">
          {[["CPM", connected ? "₦820" : "—"], ["CTR", connected ? "1.4%" : "—"], ["Reach", connected ? "12,450" : "—"], ["Impressions", connected ? "18,300" : "—"]].map(([label, val]) => (
            <div key={label} className="border rounded-lg p-2 text-center">
              <div className="text-sm font-bold">{val}</div>
              <div className="text-xs text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Africa audience presets */}
      <div>
        <div className="text-xs font-medium mb-1">🌍 Africa Audience Presets</div>
        <div className="grid grid-cols-2 gap-2">
          {presets.map(preset => (
            <button
              key={preset.id}
              onClick={() => applyPreset(preset.id)}
              disabled={isPending}
              className={`rounded-lg border p-2 text-left text-xs transition-all ${selectedPreset === preset.id ? "border-green-500 bg-green-50" : "hover:border-gray-300"}`}
            >
              <div className="font-medium">{preset.label}</div>
              <div className="text-muted-foreground">{preset.country} · Age {preset.ageMin}–{preset.ageMax}</div>
              {selectedPreset === preset.id && <div className="text-green-600 mt-1">✓ Selected</div>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Attribution Chart ────────────────────────────────────────────────────────
function AttributionChart({ channels }: { channels: CampaignChannel[] }) {
  const data = channels.filter(c => c.visits > 0 || c.clicks > 0).map(ch => ({
    name: CHANNEL_META[ch.channel]?.label ?? ch.channel,
    visits: ch.visits,
    clicks: ch.clicks,
    cpv: ch.costPerVisit ? Number(ch.costPerVisit) : 0,
  }));
  if (data.length === 0) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">📊 Channel Attribution</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-muted-foreground mb-1">Visits & Clicks by Channel</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="visits" name="Visits" fill="#2dd172" radius={[3,3,0,0]} />
              <Bar dataKey="clicks" name="Clicks" fill="#6366f1" radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div>
          <div className="text-xs text-muted-foreground mb-1">Cost Per Visit (₦) by Channel</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data.filter(d => d.cpv > 0)} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v: number) => `₦${v}`} />
              <Bar dataKey="cpv" name="CPV (₦)" radius={[3,3,0,0]}>
                {data.map((_, i) => <Cell key={i} fill={i % 2 === 0 ? "#f59e0b" : "#f97316"} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── Influencer Activation Panel ──────────────────────────────────────────────
// Backend status machine: idle → briefed → active → completed
interface InfluencerWithActivation {
  id: number; name: string; handle: string; platform: string;
  followerCount: number; niche: string;
  activationStatus: "idle" | "briefed" | "active" | "completed";
  briefSent: boolean; visitsAttributed: number;
}

const INFLUENCER_STATUS_BADGE: Record<string, string> = {
  idle: "bg-gray-100 text-gray-600",
  briefed: "bg-yellow-100 text-yellow-700",
  active: "bg-green-100 text-green-700",
  completed: "bg-blue-100 text-blue-700",
};

function InfluencerPanel({ campaignId }: { campaignId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [actionInfluencer, setActionInfluencer] = useState<InfluencerWithActivation | null>(null);
  const [actionType, setActionType] = useState<"send_brief" | "mark_active" | "mark_completed">("send_brief");
  const [notes, setNotes] = useState("");

  // Load influencers from the directory with server-persisted activation status
  const { data: influencers = [], isLoading } = useQuery<InfluencerWithActivation[]>({
    queryKey: ["influencer-activations", campaignId],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/traffic-campaigns/${campaignId}/influencer-activations`, { credentials: "include" });
      return res.json();
    },
  });

  const { mutate: activate, isPending } = useMutation({
    mutationFn: async () => {
      if (!actionInfluencer) return null;
      // influencerId is the numeric DB id from microInfluencersTable
      const res = await apiFetch(
        "POST",
        `${BASE}/api/traffic-campaigns/${campaignId}/influencer-activations/${actionInfluencer.id}`,
        { action: actionType, notes }
      );
      return res.json();
    },
    onSuccess: () => {
      setActionInfluencer(null); setNotes("");
      const label = actionType === "send_brief" ? "Brief sent" : actionType === "mark_active" ? "Influencer activated" : "Marked complete";
      toast({ title: label });
      // Refetch server state so status persists on reload
      qc.invalidateQueries({ queryKey: ["influencer-activations", campaignId] });
      qc.invalidateQueries({ queryKey: ["traffic-campaign-detail", campaignId] });
    },
    onError: () => toast({ title: "Action failed", variant: "destructive" }),
  });

  if (isLoading) return <div className="text-xs text-muted-foreground py-2">Loading influencer directory...</div>;

  if (influencers.length === 0) return (
    <div className="border rounded-lg p-3 text-xs text-muted-foreground">
      No influencers in your micro-influencer directory yet. Add them in the Ambassador CRM to activate them for campaigns.
    </div>
  );

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">🌟 Influencer Network</h3>
      <div className="space-y-2">
        {influencers.map(inf => (
          <div key={inf.id} className="flex items-center justify-between gap-3 border rounded-lg p-3">
            <div>
              <div className="text-sm font-medium">{inf.name}</div>
              <div className="text-xs text-muted-foreground">
                @{inf.handle} · {inf.platform} · {inf.followerCount?.toLocaleString()} followers
              </div>
              <Badge className={`text-xs mt-1 ${INFLUENCER_STATUS_BADGE[inf.activationStatus] ?? "bg-gray-100"}`}>
                {inf.activationStatus}
              </Badge>
            </div>
            <div className="flex gap-1 shrink-0">
              {/* idle → send brief */}
              {inf.activationStatus === "idle" && (
                <Button size="sm" className="h-7 px-2 text-xs"
                  onClick={() => { setActionInfluencer(inf); setActionType("send_brief"); }}>
                  📨 Brief
                </Button>
              )}
              {/* briefed → mark active */}
              {inf.activationStatus === "briefed" && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                  onClick={() => { setActionInfluencer(inf); setActionType("mark_active"); }}>
                  ▶ Activate
                </Button>
              )}
              {/* active → mark completed */}
              {inf.activationStatus === "active" && (
                <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                  onClick={() => { setActionInfluencer(inf); setActionType("mark_completed"); }}>
                  ✓ Complete
                </Button>
              )}
              {inf.visitsAttributed > 0 && (
                <Badge variant="outline" className="text-xs h-7 px-2">{inf.visitsAttributed} visits</Badge>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!actionInfluencer} onOpenChange={() => setActionInfluencer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "send_brief" ? "Send Campaign Brief" : actionType === "mark_active" ? "Mark Influencer Active" : "Mark Complete"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Influencer: <strong>{actionInfluencer?.name}</strong> (@{actionInfluencer?.handle})
            </p>
            <div>
              <Label>Notes / Instructions</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder={actionType === "send_brief" ? "Campaign goal, posting guidelines, hashtags, deadline..." : "Notes for this status change..."}
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setActionInfluencer(null)}>Cancel</Button>
              <Button onClick={() => activate()} disabled={isPending}>
                {isPending ? "Saving..." : actionType === "send_brief" ? "Send Brief" : actionType === "mark_active" ? "Mark Active" : "Mark Complete"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── WhatsApp Blast Panel ─────────────────────────────────────────────────────
const WA_LISTS = [
  { id: "list_vip", label: "VIP Fans (₦250k+)" },
  { id: "list_general", label: "General Community" },
  { id: "list_diaspora", label: "Diaspora UK/US/CA" },
  { id: "list_lagos", label: "Lagos Core" },
  { id: "list_gospel", label: "Gospel Network" },
];

interface BlastLog { id: string; list: string; sentAt: string; clicks: number; }

function WhatsAppBlastPanel({ campaignId, channels }: { campaignId: number; channels: CampaignChannel[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedList, setSelectedList] = useState("");
  const [message, setMessage] = useState("");
  const [logs, setLogs] = useState<BlastLog[]>([]);

  const waChannel = channels.find(c => c.channel === "whatsapp");

  const trackedSlug = `wa-${campaignId}-${selectedList}`;
  const trackedUrl = selectedList ? `${window.location.origin}${BASE}/t/${trackedSlug}` : "";

  const { mutate: sendBlast, isPending } = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("POST", `${BASE}/api/traffic-campaigns/${campaignId}/events`, {
        channel: "whatsapp",
        eventType: "click",
        trackedLinkSlug: trackedSlug,
        metadata: { broadcastList: selectedList, message },
      });
      return res.json();
    },
    onSuccess: () => {
      const newLog: BlastLog = { id: trackedSlug, list: WA_LISTS.find(l => l.id === selectedList)?.label ?? selectedList, sentAt: new Date().toISOString(), clicks: 0 };
      setLogs(prev => [newLog, ...prev]);
      qc.invalidateQueries({ queryKey: ["traffic-campaign-detail", campaignId] });
      toast({ title: "Blast logged! Share the tracked link via WhatsApp." });
    },
    onError: () => toast({ title: "Failed to log blast", variant: "destructive" }),
  });

  if (!waChannel?.enabled) return (
    <div className="border rounded-lg p-3 text-xs text-muted-foreground">
      Enable the WhatsApp Blast channel above to use the blast manager.
    </div>
  );

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2">💬 WhatsApp Blast Manager</h3>
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Broadcast List</Label>
            <Select value={selectedList} onValueChange={setSelectedList}>
              <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select list..." /></SelectTrigger>
              <SelectContent>
                {WA_LISTS.map(l => <SelectItem key={l.id} value={l.id}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selectedList && (
            <div>
              <Label className="text-xs">Tracked Link (paste into WhatsApp)</Label>
              <div className="flex gap-1 mt-1">
                <Input value={trackedUrl} readOnly className="h-8 text-xs" />
                <Button size="sm" className="h-8 px-2 text-xs shrink-0" onClick={() => { navigator.clipboard.writeText(trackedUrl); toast({ title: "Copied!" }); }}>
                  Copy
                </Button>
              </div>
            </div>
          )}
        </div>
        <div>
          <Label className="text-xs">Message Template</Label>
          <Textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            placeholder="Hey fam! 👋 Check out this exclusive deal for you → [paste tracked link above]"
            rows={3}
            className="text-sm"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={isPending || !selectedList || !message}
            onClick={() => sendBlast()}
          >
            {isPending ? "Logging..." : "📤 Log Blast & Track Clicks"}
          </Button>
          <span className="text-xs text-muted-foreground">Compose your message in WhatsApp, include the tracked link, then log here to track clicks.</span>
        </div>

        {logs.length > 0 && (
          <div>
            <div className="text-xs font-medium mb-1">Recent Blasts</div>
            <div className="space-y-1">
              {logs.map(log => (
                <div key={log.id} className="flex items-center justify-between text-xs border rounded p-2">
                  <div>
                    <span className="font-medium">{log.list}</span>
                    <span className="text-muted-foreground ml-2">{new Date(log.sentAt).toLocaleString("en-NG")}</span>
                  </div>
                  <Badge variant="outline" className="text-xs">{log.clicks} clicks</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Follower Funnel Builder ───────────────────────────────────────────────────
const FUNNEL_STAGES = [
  {
    key: "discovery", label: "Discovery", icon: "🔍",
    color: "bg-blue-100 border-blue-300 text-blue-800",
    description: "People who find your content for the first time",
    contentTypes: ["Reels / Short Video", "SEO Blog Post", "Hashtag Content", "Viral Hook", "Paid Ad"],
    defaultContent: "Reels / Short Video",
  },
  {
    key: "follow", label: "Follow", icon: "👤",
    color: "bg-purple-100 border-purple-300 text-purple-800",
    description: "Viewers who click Follow / Subscribe",
    contentTypes: ["Value Carousel", "Bio CTA", "Pinned Post", "Story Highlight", "YouTube End Screen"],
    defaultContent: "Value Carousel",
  },
  {
    key: "engage", label: "Engage", icon: "💬",
    color: "bg-yellow-100 border-yellow-300 text-yellow-800",
    description: "Followers who comment, DM or share your content",
    contentTypes: ["Story Poll / Q&A", "DM Automation", "Thread / Discussion", "Live Session", "Community Challenge"],
    defaultContent: "Story Poll / Q&A",
  },
  {
    key: "buy", label: "Buy / Convert", icon: "💰",
    color: "bg-green-100 border-green-300 text-green-800",
    description: "Engaged audience who purchase or sign up",
    contentTypes: ["WhatsApp Blast Offer", "Limited-Time CTA", "Sales Email Sequence", "Testimonial Content", "Product Demo"],
    defaultContent: "WhatsApp Blast Offer",
  },
];

interface FunnelMetrics { discovery: number; follow: number; engage: number; buy: number; }

function FunnelBuilder() {
  const [platform, setPlatform] = useState("instagram");

  // Pull real follower counts from growth snapshots
  const { data: snapshots = [] } = useQuery<GrowthSnapshot[]>({
    queryKey: ["growth-snapshots"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/growth-snapshots`, { credentials: "include" });
      return res.json();
    },
  });

  // Derive funnel metrics from the selected platform's latest snapshot
  const platformSnapshot = snapshots.find(s => s.platform.toLowerCase() === platform.toLowerCase());
  const followers = platformSnapshot?.followerCount ?? 0;
  const growthRate = platformSnapshot ? Number(platformSnapshot.followerGrowthRate) : 0;
  const engagementVelocity = platformSnapshot ? Number(platformSnapshot.engagementVelocity) : 0;

  // Estimate funnel stages from growth snapshot data (or allow manual override)
  const derivedMetrics: FunnelMetrics = {
    discovery: followers > 0 ? Math.round(followers / 0.12) : 10000,    // ~12% discovery→follow rate
    follow: followers > 0 ? followers : 1200,
    engage: followers > 0 ? Math.round(followers * (engagementVelocity > 0 ? Math.min(engagementVelocity / 100, 0.30) : 0.08)) : 360,
    buy: followers > 0 ? Math.round(followers * 0.005) : 54,             // ~0.5% follower→buyer rate
  };

  const [metrics, setMetrics] = useState<FunnelMetrics | null>(null);
  const effective = metrics ?? derivedMetrics;

  const [tactics, setTactics] = useState<Record<string, string>>({
    discovery: "Reel/TikTok viral hooks + SEO content + hashtag clusters",
    follow: "Strong CTAs in bio + pinned posts + follow-for-value offer",
    engage: "Story polls, Q&A, DM automation for new followers",
    buy: "WhatsApp blast to warm community + limited-time offer",
  });

  // Content-type mapping per stage — persisted in localStorage
  const [contentMap, setContentMap] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("funnel-content-map");
      return saved ? JSON.parse(saved) : Object.fromEntries(FUNNEL_STAGES.map(s => [s.key, s.defaultContent]));
    } catch { return Object.fromEntries(FUNNEL_STAGES.map(s => [s.key, s.defaultContent])); }
  });

  const setContentType = (stageKey: string, val: string) => {
    const next = { ...contentMap, [stageKey]: val };
    setContentMap(next);
    try { localStorage.setItem("funnel-content-map", JSON.stringify(next)); } catch { /* ignore */ }
  };

  const setMetric = (k: keyof FunnelMetrics, v: string) => {
    const n = Number(v.replace(/[^\d]/g, ""));
    if (!isNaN(n)) setMetrics(prev => ({ ...(prev ?? derivedMetrics), [k]: n }));
  };

  const convRate = (a: number, b: number) => a > 0 ? ((b / a) * 100).toFixed(1) : "—";
  const stageValues: number[] = [effective.discovery, effective.follow, effective.engage, effective.buy];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Follower Funnel Architecture</h3>
          <p className="text-sm text-muted-foreground">
            Map content types to funnel stages and visualise current conversion rates
            {platformSnapshot ? ` — pulled from your ${platform} growth snapshot` : " — enter your metrics below or add a growth snapshot"}.
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={platform} onValueChange={v => { setPlatform(v); setMetrics(null); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="tiktok">TikTok</SelectItem>
              <SelectItem value="youtube">YouTube</SelectItem>
              <SelectItem value="twitter">Twitter/X</SelectItem>
            </SelectContent>
          </Select>
          {metrics && (
            <Button size="sm" variant="outline" className="h-9 text-xs" onClick={() => setMetrics(null)}>
              Reset to Snapshot
            </Button>
          )}
        </div>
      </div>

      {platformSnapshot && (
        <div className="rounded-lg border bg-blue-50/50 p-3 text-xs text-blue-700 flex gap-4">
          <span>📊 Source: @{platformSnapshot.handle}</span>
          <span>👥 {platformSnapshot.followerCount.toLocaleString()} followers</span>
          <span>📈 {growthRate > 0 ? `+${growthRate}%/wk growth` : "no growth data"}</span>
          <span>💬 {engagementVelocity > 0 ? `${engagementVelocity}% engagement` : "no engagement data"}</span>
        </div>
      )}

      {/* Funnel visualization */}
      <div className="space-y-1">
        {FUNNEL_STAGES.map((stage, i) => {
          const curr = stageValues[i];
          const prev = i > 0 ? stageValues[i - 1] : null;
          const maxVal = stageValues[0] || 1;
          const widthPct = Math.max(25, Math.min(100, (curr / maxVal) * 100));
          return (
            <div key={stage.key}>
              {i > 0 && prev != null && (
                <div className="text-xs text-center text-muted-foreground py-0.5">
                  ↓ {convRate(prev, curr)}% conversion rate
                </div>
              )}
              <div
                className={`rounded-lg border-2 p-3 mx-auto transition-all ${stage.color}`}
                style={{ width: `${widthPct}%` }}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-lg shrink-0">{stage.icon}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm">{stage.label}</div>
                      <div className="text-xs opacity-70 truncate">{stage.description}</div>
                    </div>
                  </div>
                  <Input
                    className="w-24 h-7 text-right font-bold text-sm bg-white/60 border-white/80 shrink-0"
                    value={curr.toLocaleString("en-NG")}
                    onChange={e => setMetric(stage.key as keyof FunnelMetrics, e.target.value)}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Content-type mapping per stage */}
      <div>
        <h4 className="font-medium mb-3 text-sm">Content Type Mapping</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {FUNNEL_STAGES.map(stage => (
            <div key={stage.key} className={`rounded-lg border-2 p-3 space-y-2 ${stage.color}`}>
              <div className="flex items-center gap-2">
                <span>{stage.icon}</span>
                <span className="font-medium text-sm">{stage.label}</span>
              </div>
              <div>
                <Label className="text-xs opacity-75">Primary content type for this stage</Label>
                <Select value={contentMap[stage.key] ?? stage.defaultContent} onValueChange={v => setContentType(stage.key, v)}>
                  <SelectTrigger className="h-8 text-xs bg-white/60 border-white/80 mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {stage.contentTypes.map(ct => <SelectItem key={ct} value={ct}>{ct}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Textarea
                value={tactics[stage.key] ?? ""}
                onChange={e => setTactics(prev => ({ ...prev, [stage.key]: e.target.value }))}
                rows={2}
                className="text-xs bg-white/60 border-0 resize-none"
                placeholder={`Tactics to move people into ${stage.label}...`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Conversion rate summary */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4 grid grid-cols-3 gap-3 text-center">
          <div>
            <div className="text-lg font-bold text-blue-600">{convRate(effective.discovery, effective.follow)}%</div>
            <div className="text-xs text-muted-foreground">Discovery → Follow</div>
          </div>
          <div>
            <div className="text-lg font-bold text-yellow-600">{convRate(effective.follow, effective.engage)}%</div>
            <div className="text-xs text-muted-foreground">Follow → Engage</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-600">{convRate(effective.engage, effective.buy)}%</div>
            <div className="text-xs text-muted-foreground">Engage → Buy</div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Migration Planner ────────────────────────────────────────────────────────
const MIGRATION_PLATFORMS = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "twitter", label: "Twitter/X" },
  { value: "whatsapp", label: "WhatsApp Community" },
  { value: "telegram", label: "Telegram Channel" },
  { value: "email", label: "Email List" },
];

interface MigrationPlan {
  id: string; from: string; to: string; audience: string; message: string;
  ctaText: string; scheduledDate: string; status: "planned" | "active" | "done";
}

function MigrationPlanner() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<MigrationPlan[]>([]);
  const [form, setForm] = useState({ from: "instagram", to: "whatsapp", audience: "", message: "", ctaText: "", scheduledDate: "" });
  const setF = (k: string, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const createPlan = () => {
    if (!form.audience || !form.message) { toast({ title: "Fill audience size and message", variant: "destructive" }); return; }
    const plan: MigrationPlan = { id: Date.now().toString(), ...form, status: "planned" };
    setPlans(prev => [plan, ...prev]);
    setForm({ from: "instagram", to: "whatsapp", audience: "", message: "", ctaText: "", scheduledDate: "" });
    toast({ title: "Migration plan saved!" });
  };

  const updateStatus = (id: string, status: MigrationPlan["status"]) => {
    setPlans(prev => prev.map(p => p.id === id ? { ...p, status } : p));
  };

  const platformLabel = (v: string) => MIGRATION_PLATFORMS.find(p => p.value === v)?.label ?? v;

  const STATUS_BADGES: Record<MigrationPlan["status"], string> = {
    planned: "bg-gray-100 text-gray-700",
    active: "bg-green-100 text-green-700",
    done: "bg-blue-100 text-blue-700",
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">Cross-Platform Audience Migration</h3>
        <p className="text-sm text-muted-foreground">Plan and schedule campaigns to migrate your audience from one platform to another — own your audience on channels you control.</p>
      </div>

      {/* Create plan */}
      <Card>
        <CardHeader><CardTitle className="text-base">New Migration Campaign</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>From Platform</Label>
              <Select value={form.from} onValueChange={v => setF("from", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MIGRATION_PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>To Platform (destination you own)</Label>
              <Select value={form.to} onValueChange={v => setF("to", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MIGRATION_PLATFORMS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Target Audience Size</Label>
              <Input value={form.audience} onChange={e => setF("audience", e.target.value)} placeholder="e.g. 12,000 followers" />
            </div>
            <div>
              <Label>Scheduled Date</Label>
              <Input type="date" value={form.scheduledDate} onChange={e => setF("scheduledDate", e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Migration Message</Label>
            <Textarea
              value={form.message}
              onChange={e => setF("message", e.target.value)}
              placeholder={`e.g. "I'm moving to WhatsApp so you never miss my content. Join my exclusive community now: [link]"`}
              rows={3}
            />
          </div>
          <div>
            <Label>CTA Button Text</Label>
            <Input value={form.ctaText} onChange={e => setF("ctaText", e.target.value)} placeholder="e.g. Join My WhatsApp Community" />
          </div>
          <Button onClick={createPlan} disabled={!form.audience || !form.message}>
            + Save Migration Plan
          </Button>
        </CardContent>
      </Card>

      {/* Plan list */}
      {plans.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground border rounded-lg">
          <div className="text-4xl mb-3">🔀</div>
          <div className="font-medium">No migration plans yet</div>
          <div className="text-sm mt-1">Own your audience by migrating them to platforms you control — WhatsApp, Telegram, or Email.</div>
        </div>
      ) : (
        <div className="space-y-3">
          {plans.map(plan => (
            <Card key={plan.id} className="hover:border-green-300 transition-colors">
              <CardContent className="pt-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-sm">
                      {platformLabel(plan.from)} → {platformLabel(plan.to)}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {plan.audience} · {plan.scheduledDate ? new Date(plan.scheduledDate).toLocaleDateString("en-NG") : "No date set"}
                    </div>
                  </div>
                  <Badge className={`text-xs ${STATUS_BADGES[plan.status]}`}>{plan.status}</Badge>
                </div>
                <p className="text-xs text-muted-foreground italic border-l-2 border-green-300 pl-2">"{plan.message}"</p>
                {plan.ctaText && <div className="text-xs"><span className="font-medium">CTA: </span>{plan.ctaText}</div>}
                <div className="flex gap-2">
                  {plan.status === "planned" && <Button size="sm" className="h-7 px-2 text-xs" onClick={() => updateStatus(plan.id, "active")}>▶ Activate</Button>}
                  {plan.status === "active" && <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => updateStatus(plan.id, "done")}>✓ Mark Done</Button>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Hook Library ─────────────────────────────────────────────────────────────
function HookLibrary() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [platform, setPlatform] = useState("all");
  const [niche, setNiche] = useState("all");
  const [format, setFormat] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [newHook, setNewHook] = useState({ title: "", hookText: "", platform: "all", niche: "general", format: "caption" });

  const { data: hooks = [], isLoading } = useQuery<HookEntry[]>({
    queryKey: ["hook-library", platform, niche, format],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (platform !== "all") params.set("platform", platform);
      if (niche !== "all") params.set("niche", niche);
      if (format !== "all") params.set("format", format);
      const res = await fetch(`${BASE}/api/hook-library?${params}`, { credentials: "include" });
      return res.json();
    },
  });

  const filtered = q ? hooks.filter(h => h.title.toLowerCase().includes(q.toLowerCase()) || h.hookText.toLowerCase().includes(q.toLowerCase())) : hooks;

  const { mutate: like } = useMutation({
    mutationFn: async (id: number) => { await apiFetch("POST", `${BASE}/api/hook-library/${id}/like`, {}); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hook-library"] }),
  });

  const { mutate: useHook } = useMutation({
    mutationFn: async (id: number) => { await apiFetch("POST", `${BASE}/api/hook-library/${id}/use`, {}); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["hook-library"] }); toast({ title: "Hook applied to draft!" }); },
  });

  const { mutate: addHook, isPending: adding } = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("POST", `${BASE}/api/hook-library`, newHook);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hook-library"] });
      setAddOpen(false);
      setNewHook({ title: "", hookText: "", platform: "all", niche: "general", format: "caption" });
      toast({ title: "Hook added to library" });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Input placeholder="Search hooks..." value={q} onChange={e => setQ(e.target.value)} className="max-w-xs" />
        <Select value={platform} onValueChange={setPlatform}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Platform" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="instagram">Instagram</SelectItem>
            <SelectItem value="tiktok">TikTok</SelectItem>
            <SelectItem value="twitter">Twitter/X</SelectItem>
            <SelectItem value="youtube">YouTube</SelectItem>
          </SelectContent>
        </Select>
        <Select value={niche} onValueChange={setNiche}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Niche" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Niches</SelectItem>
            <SelectItem value="general">General</SelectItem>
            <SelectItem value="music">Music</SelectItem>
            <SelectItem value="tech">Tech</SelectItem>
            <SelectItem value="fashion">Fashion</SelectItem>
            <SelectItem value="gospel">Gospel</SelectItem>
            <SelectItem value="business">Business</SelectItem>
            <SelectItem value="lifestyle">Lifestyle</SelectItem>
          </SelectContent>
        </Select>
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Format" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Formats</SelectItem>
            <SelectItem value="opener">Opener</SelectItem>
            <SelectItem value="caption">Caption</SelectItem>
            <SelectItem value="thumbnail">Thumbnail</SelectItem>
            <SelectItem value="cta">CTA</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => setAddOpen(true)}>+ Add Hook</Button>
      </div>

      {isLoading && <div className="text-center text-muted-foreground py-8">Loading hooks...</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {filtered.map(hook => (
          <Card key={hook.id} className="hover:border-green-300 transition-colors">
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-sm">{hook.title}</div>
                  {hook.curated && <Badge className="text-xs bg-emerald-100 text-emerald-700 mt-1">✓ Curated</Badge>}
                </div>
                <div className="flex gap-1">
                  <Badge variant="outline" className="text-xs">{hook.platform}</Badge>
                  <Badge variant="outline" className="text-xs">{hook.format}</Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground italic leading-snug">"{hook.hookText}"</p>
              <div className="flex items-center justify-between">
                <div className="flex gap-2 text-xs text-muted-foreground">
                  <span>❤️ {hook.likeCount}</span>
                  <span>🔁 {hook.useCount} uses</span>
                  <span>#{hook.niche}</span>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => like(hook.id)}>❤️</Button>
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={() => { useHook(hook.id); navigator.clipboard.writeText(hook.hookText); }}>Copy & Use</Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      {filtered.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">No hooks match your filters. Add your own above.</div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Hook to Library</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Title</Label><Input value={newHook.title} onChange={e => setNewHook(h => ({ ...h, title: e.target.value }))} placeholder="Bold opener for musicians" /></div>
            <div><Label>Hook Text</Label><Textarea value={newHook.hookText} onChange={e => setNewHook(h => ({ ...h, hookText: e.target.value }))} placeholder="I need to tell you something..." rows={3} /></div>
            <div className="grid grid-cols-3 gap-2">
              <div><Label className="text-xs">Platform</Label>
                <Select value={newHook.platform} onValueChange={v => setNewHook(h => ({ ...h, platform: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="twitter">Twitter</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Niche</Label>
                <Select value={newHook.niche} onValueChange={v => setNewHook(h => ({ ...h, niche: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="music">Music</SelectItem>
                    <SelectItem value="tech">Tech</SelectItem>
                    <SelectItem value="fashion">Fashion</SelectItem>
                    <SelectItem value="gospel">Gospel</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Format</Label>
                <Select value={newHook.format} onValueChange={v => setNewHook(h => ({ ...h, format: v }))}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="opener">Opener</SelectItem>
                    <SelectItem value="caption">Caption</SelectItem>
                    <SelectItem value="thumbnail">Thumbnail</SelectItem>
                    <SelectItem value="cta">CTA</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={() => addHook()} disabled={adding || !newHook.title || !newHook.hookText}>
                {adding ? "Adding..." : "Add Hook"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── SEO Content Engine ───────────────────────────────────────────────────────
function SeoEngine() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [topic, setTopic] = useState("");
  const [contentType, setContentType] = useState("blog");
  const [keywords, setKeywords] = useState("");
  const [region, setRegion] = useState("NG");
  const [viewJob, setViewJob] = useState<SeoJob | null>(null);

  const { data: jobs = [], isLoading } = useQuery<SeoJob[]>({
    queryKey: ["seo-content-jobs"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/seo-content-jobs`, { credentials: "include" });
      return res.json();
    },
    refetchInterval: (data) => {
      const arr = Array.isArray(data) ? data : (data?.state?.data ?? []);
      return arr.some?.((j: SeoJob) => j.status === "generating") ? 3000 : false;
    },
  });

  const { mutate: generate, isPending } = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("POST", `${BASE}/api/seo-content-jobs`, {
        topic, contentType, region,
        targetKeywords: keywords.split(",").map(k => k.trim()).filter(Boolean),
      });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["seo-content-jobs"] }); setTopic(""); setKeywords(""); toast({ title: "Generating SEO content..." }); },
    onError: () => toast({ title: "Failed to start generation", variant: "destructive" }),
  });

  const { mutate: publish } = useMutation({
    mutationFn: async (jobId: number) => {
      const res = await apiFetch("POST", `${BASE}/api/seo-content-jobs/${jobId}/publish-to-calendar`, { platform: "instagram" });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["seo-content-jobs"] }); toast({ title: "Published to content calendar!" }); },
    onError: () => toast({ title: "Failed to publish", variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader><CardTitle className="text-base">Generate SEO Content</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label>Topic / Main Keyword</Label>
              <Input value={topic} onChange={e => setTopic(e.target.value)} placeholder="e.g. How to grow on Instagram in Nigeria" />
            </div>
            <div>
              <Label>Content Type</Label>
              <Select value={contentType} onValueChange={setContentType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blog">Blog Post</SelectItem>
                  <SelectItem value="youtube_description">YouTube Description</SelectItem>
                  <SelectItem value="thread">Twitter Thread</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Target Keywords <span className="text-muted-foreground text-xs">(comma-separated)</span></Label>
              <Input value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="Nigerian creator, grow on Instagram, monetize" />
            </div>
            <div>
              <Label>Region</Label>
              <Select value={region} onValueChange={setRegion}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NG">Nigeria</SelectItem>
                  <SelectItem value="GH">Ghana</SelectItem>
                  <SelectItem value="KE">Kenya</SelectItem>
                  <SelectItem value="ZA">South Africa</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => generate()} disabled={isPending || !topic}>
            {isPending ? "Submitting..." : "Generate SEO Content"}
          </Button>
        </CardContent>
      </Card>

      {isLoading && <div className="text-center text-muted-foreground py-6">Loading content jobs...</div>}

      <div className="space-y-2">
        {jobs.map(job => (
          <Card key={job.id} className="hover:border-green-300 transition-colors cursor-pointer" onClick={() => job.status === "done" ? setViewJob(job) : null}>
            <CardContent className="pt-4 flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{job.title ?? job.topic}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{job.contentType} · {job.region} · {job.targetKeywords.join(", ")}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {job.publishedToCalendar && <Badge className="text-xs bg-blue-100 text-blue-700">📅 Scheduled</Badge>}
                <Badge className={`text-xs ${STATUS_COLORS[job.status] ?? "bg-gray-100"}`}>
                  {job.status === "generating" ? "⏳ Generating..." : job.status}
                </Badge>
                {job.status === "done" && !job.publishedToCalendar && (
                  <Button size="sm" className="h-7 px-2 text-xs" onClick={e => { e.stopPropagation(); publish(job.id); }}>
                    📅 Schedule
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
        {jobs.length === 0 && !isLoading && (
          <div className="text-center py-12 text-muted-foreground">No SEO content yet. Generate your first piece above.</div>
        )}
      </div>

      {/* View content dialog */}
      <Dialog open={!!viewJob} onOpenChange={() => setViewJob(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{viewJob?.title ?? viewJob?.topic}</DialogTitle></DialogHeader>
          {viewJob?.body && (
            <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed border rounded-lg p-4 bg-muted/30">{viewJob.body}</pre>
          )}
          {viewJob?.metaDescription && (
            <div className="text-xs text-muted-foreground border-t pt-2">
              <span className="font-medium">Meta description: </span>{viewJob.metaDescription}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Content Velocity Recommender ────────────────────────────────────────────
function ContentVelocity() {
  const { data, isLoading, refetch, isFetching } = useQuery<{
    analysedPeriodDays: number; totalPostsAnalysed: number; overallPostsPerWeek: number;
    overallInsight?: string; recommendations: ContentVelocityRec[]; generatedAt: string; aiPowered?: boolean;
  }>({
    queryKey: ["content-velocity"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/traffic/content-velocity`, { credentials: "include" });
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) return <div className="text-center text-muted-foreground py-12">Analysing your posting history with AI...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Content Velocity Recommender</h3>
            {data?.aiPowered && <Badge className="text-xs bg-purple-100 text-purple-700">✨ AI-powered</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            Analysed {data?.totalPostsAnalysed ?? 0} posts in the last {data?.analysedPeriodDays} days
            · {data?.overallPostsPerWeek ?? 0} posts/week overall
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
          {isFetching ? "Analysing..." : "↻ Re-analyse"}
        </Button>
      </div>

      {/* AI overall insight banner */}
      {data?.overallInsight && (
        <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-4">
          <div className="text-xs font-medium text-purple-700 mb-1">✨ Claude's Assessment</div>
          <p className="text-sm text-purple-900">{data.overallInsight}</p>
        </div>
      )}

      <div className="space-y-3">
        {data?.recommendations.map(rec => (
          <Card key={rec.platform} className="border-l-4 border-l-green-400">
            <CardContent className="pt-4">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="font-medium capitalize">{rec.platform}</div>
                  <div className="text-xs text-muted-foreground">
                    {rec.currentPostsPerWeek}/week current · {rec.recommendedPostsPerWeek}/week recommended
                  </div>
                </div>
                <div className="flex gap-1">
                  <Badge variant="outline" className="text-xs">{rec.currentPostsPerWeek}/wk now</Badge>
                  <Badge className="text-xs bg-green-100 text-green-700">→ {rec.recommendedPostsPerWeek}/wk</Badge>
                </div>
              </div>

              {/* Content mix bar */}
              <div className="mb-2">
                <div className="text-xs text-muted-foreground mb-1">Recommended content mix:</div>
                <div className="flex rounded overflow-hidden h-3 text-xs">
                  <div className="bg-blue-400" style={{ width: `${rec.contentMix.educational}%` }} title={`Educational ${rec.contentMix.educational}%`} />
                  <div className="bg-purple-400" style={{ width: `${rec.contentMix.entertainment}%` }} title={`Entertainment ${rec.contentMix.entertainment}%`} />
                  <div className="bg-orange-400" style={{ width: `${rec.contentMix.promotional}%` }} title={`Promotional ${rec.contentMix.promotional}%`} />
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-blue-400 mr-1" />{rec.contentMix.educational}% Edu</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-purple-400 mr-1" />{rec.contentMix.entertainment}% Entertain</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-orange-400 mr-1" />{rec.contentMix.promotional}% Promo</span>
                </div>
              </div>

              <p className="text-sm">{rec.insight}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Growth Dashboard ─────────────────────────────────────────────────────────
function GrowthDashboard() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ platformAccountId: "", platform: "instagram", handle: "", followerCount: "", followerGrowthRate: "", healthScore: "50" });

  const { data: snapshots = [], isLoading } = useQuery<GrowthSnapshot[]>({
    queryKey: ["growth-snapshots"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/growth-snapshots`, { credentials: "include" });
      return res.json();
    },
  });

  // Deduplicate — latest per account
  const latestByAccount = new Map<string, GrowthSnapshot>();
  for (const s of snapshots) {
    const key = `${s.platform}:${s.handle}`;
    if (!latestByAccount.has(key)) latestByAccount.set(key, s);
  }
  const latest = [...latestByAccount.values()];

  const { mutate: addSnapshot, isPending: adding } = useMutation({
    mutationFn: async () => {
      const res = await apiFetch("POST", `${BASE}/api/growth-snapshots`, {
        ...form,
        platformAccountId: Number(form.platformAccountId) || 1,
        followerCount: Number(form.followerCount),
        followerGrowthRate: form.followerGrowthRate,
        healthScore: Number(form.healthScore),
      });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["growth-snapshots"] }); setAddOpen(false); toast({ title: "Snapshot recorded" }); },
    onError: () => toast({ title: "Failed to add snapshot", variant: "destructive" }),
  });

  const { mutate: toggleAlert } = useMutation({
    mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
      await apiFetch("PATCH", `${BASE}/api/growth-snapshots/${id}/alert`, { alertEnabled: enabled });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["growth-snapshots"] }),
    onError: () => toast({ title: "Failed to update alert", variant: "destructive" }),
  });

  const PLATFORM_ICONS: Record<string, string> = {
    instagram: "📸", tiktok: "🎵", twitter: "🐦", youtube: "📺", facebook: "👥", threads: "🔗",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Growth Dashboard</h3>
        <Button size="sm" onClick={() => setAddOpen(true)}>+ Log Snapshot</Button>
      </div>

      {isLoading && <div className="text-center text-muted-foreground py-8">Loading growth data...</div>}

      {latest.length === 0 && !isLoading && (
        <div className="text-center py-12 text-muted-foreground">
          No growth snapshots yet. Log your first snapshot to start tracking.
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {latest.map(snap => (
          <Card key={snap.id} className={`${parseFloat(snap.followerGrowthRate) < 0 ? "border-red-200" : ""}`}>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">{PLATFORM_ICONS[snap.platform] ?? "📱"}</span>
                  <div>
                    <div className="font-medium text-sm">{snap.handle}</div>
                    <div className="text-xs text-muted-foreground capitalize">{snap.platform}</div>
                  </div>
                </div>
                <div className={`text-2xl font-bold ${healthScoreColor(snap.healthScore)}`}>{snap.healthScore}</div>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Followers</div>
                  <div className="font-semibold">{snap.followerCount.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Growth/wk</div>
                  <div className={`font-semibold ${parseFloat(snap.followerGrowthRate) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {parseFloat(snap.followerGrowthRate) >= 0 ? "+" : ""}{parseFloat(snap.followerGrowthRate).toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Reach</div>
                  <div className="font-semibold">{Number(snap.reachCount).toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Eng. Velocity</div>
                  <div className="font-semibold">{parseFloat(snap.engagementVelocity).toFixed(1)}/day</div>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t">
                <span className="text-xs text-muted-foreground">
                  {snap.alertEnabled ? `🔔 Alert at ${parseFloat(snap.alertThresholdRate).toFixed(1)}%` : "🔕 Alert off"}
                </span>
                <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                  onClick={() => toggleAlert({ id: snap.id, enabled: !snap.alertEnabled })}>
                  {snap.alertEnabled ? "Disable" : "Enable"} Alert
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Growth Snapshot</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Platform</Label>
                <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="instagram">Instagram</SelectItem>
                    <SelectItem value="tiktok">TikTok</SelectItem>
                    <SelectItem value="twitter">Twitter/X</SelectItem>
                    <SelectItem value="youtube">YouTube</SelectItem>
                    <SelectItem value="facebook">Facebook</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Handle</Label><Input value={form.handle} onChange={e => setForm(f => ({ ...f, handle: e.target.value }))} placeholder="@areafada" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Follower Count</Label><Input type="number" value={form.followerCount} onChange={e => setForm(f => ({ ...f, followerCount: e.target.value }))} placeholder="120000" /></div>
              <div><Label>Growth Rate (% per week)</Label><Input type="number" step="0.01" value={form.followerGrowthRate} onChange={e => setForm(f => ({ ...f, followerGrowthRate: e.target.value }))} placeholder="1.5" /></div>
            </div>
            <div>
              <Label>Health Score (0–100)</Label>
              <Input type="number" min={0} max={100} value={form.healthScore} onChange={e => setForm(f => ({ ...f, healthScore: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
              <Button onClick={() => addSnapshot()} disabled={adding || !form.handle}>
                {adding ? "Saving..." : "Log Snapshot"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export function TrafficPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<TrafficCampaign | null>(null);

  const { data: campaigns = [], isLoading } = useQuery<TrafficCampaign[]>({
    queryKey: ["traffic-campaigns"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/traffic-campaigns`, { credentials: "include" });
      return res.json();
    },
  });

  const { mutate: deleteCampaign } = useMutation({
    mutationFn: async (id: number) => {
      await apiFetch("DELETE", `${BASE}/api/traffic-campaigns/${id}`, undefined);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["traffic-campaigns"] });
      setSelectedCampaign(null);
      toast({ title: "Campaign deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  return (
    <AppShell>
      <TierGuard moduleKey="trafficTools" requiredTier="brand">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Traffic Generator & Engine</h1>
          <p className="text-muted-foreground text-sm">Drive targeted visitors and build compounding audience growth for Nigerian creators.</p>
        </div>

        <Tabs defaultValue="generator">
          <TabsList className="mb-6 flex-wrap h-auto gap-1">
            <TabsTrigger value="generator">🚀 Traffic Generator</TabsTrigger>
            <TabsTrigger value="funnel">🔻 Funnel Builder</TabsTrigger>
            <TabsTrigger value="migration">🔀 Migration</TabsTrigger>
            <TabsTrigger value="velocity">⚡ Content Velocity</TabsTrigger>
            <TabsTrigger value="hooks">🪝 Hook Library</TabsTrigger>
            <TabsTrigger value="seo">🔍 SEO Engine</TabsTrigger>
            <TabsTrigger value="growth">📈 Growth Dashboard</TabsTrigger>
          </TabsList>

          {/* ─── Traffic Generator Tab ─────────────────────────────────────── */}
          <TabsContent value="generator">
            <div className={`grid gap-6 ${selectedCampaign ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1"}`}>
              {/* Campaign list */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Campaigns</h2>
                  <Button onClick={() => setCreateOpen(true)}>+ New Campaign</Button>
                </div>
                {isLoading && <div className="text-center text-muted-foreground py-8">Loading...</div>}
                {campaigns.length === 0 && !isLoading && (
                  <div className="text-center py-12 text-muted-foreground border rounded-lg">
                    <div className="text-4xl mb-3">🚀</div>
                    <div className="font-medium">No traffic campaigns yet</div>
                    <div className="text-sm mt-1">Create your first campaign to drive targeted visitors to your content.</div>
                    <Button className="mt-4" onClick={() => setCreateOpen(true)}>Create Campaign</Button>
                  </div>
                )}
                <div className="space-y-2">
                  {campaigns.map(c => (
                    <Card
                      key={c.id}
                      className={`cursor-pointer hover:border-green-300 transition-colors ${selectedCampaign?.id === c.id ? "border-green-500 bg-green-50/20" : ""}`}
                      onClick={() => setSelectedCampaign(s => s?.id === c.id ? null : c)}
                    >
                      <CardContent className="pt-4 flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{c.name}</div>
                          <div className="text-xs text-muted-foreground truncate">{c.destinationUrl}</div>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <Badge className={`text-xs ${STATUS_COLORS[c.status] ?? "bg-gray-100"}`}>{c.status}</Badge>
                            <Badge variant="outline" className="text-xs">₦{Number(c.budgetNgn).toLocaleString()}</Badge>
                            <Badge variant="outline" className="text-xs">{c.goal}</Badge>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-lg font-bold text-green-600">{c.totalVisits.toLocaleString()}</div>
                          <div className="text-xs text-muted-foreground">visits</div>
                          <Button size="sm" variant="ghost" className="h-6 px-1 text-xs text-red-500 mt-1"
                            onClick={e => { e.stopPropagation(); if (confirm("Delete this campaign?")) deleteCampaign(c.id); }}>
                            Delete
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Campaign detail */}
              {selectedCampaign && (
                <div>
                  <h2 className="text-lg font-semibold mb-4">{selectedCampaign.name}</h2>
                  <CampaignDetail
                    campaign={selectedCampaign}
                    onStatusChange={() => qc.invalidateQueries({ queryKey: ["traffic-campaigns"] })}
                  />
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── Funnel Builder Tab ────────────────────────────────────────── */}
          <TabsContent value="funnel">
            <FunnelBuilder />
          </TabsContent>

          {/* ─── Migration Planner Tab ─────────────────────────────────────── */}
          <TabsContent value="migration">
            <MigrationPlanner />
          </TabsContent>

          {/* ─── Content Velocity Tab ──────────────────────────────────────── */}
          <TabsContent value="velocity">
            <ContentVelocity />
          </TabsContent>

          {/* ─── Hook Library Tab ──────────────────────────────────────────── */}
          <TabsContent value="hooks">
            <HookLibrary />
          </TabsContent>

          {/* ─── SEO Engine Tab ────────────────────────────────────────────── */}
          <TabsContent value="seo">
            <SeoEngine />
          </TabsContent>

          {/* ─── Growth Dashboard Tab ─────────────────────────────────────── */}
          <TabsContent value="growth">
            <GrowthDashboard />
          </TabsContent>
        </Tabs>

        <CampaignDialog
          open={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={(c) => { setSelectedCampaign(c); qc.invalidateQueries({ queryKey: ["traffic-campaigns"] }); }}
        />
      </div>
      </TierGuard>
    </AppShell>
  );
}
