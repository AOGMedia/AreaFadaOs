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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  FunnelChart, Funnel, Cell, PieChart, Pie, LabelList,
} from "recharts";
import {
  Link2, QrCode, BarChart2, Calendar, ShieldCheck, Users,
  Copy, Download, Plus, ExternalLink, CheckCircle, XCircle, Clock,
  Zap, ChevronRight, Trash2,
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

interface Campaign {
  id: number; name: string; slug: string; bookTitle: string; synopsis?: string;
  chapterPreview?: string; destinationUrl: string; paystackLink?: string;
  coverImageUrl?: string; launchDate?: string; primaryColor: string;
  description?: string; active: boolean; createdAt: string;
}

interface PromoLink {
  id: number; campaignId: number; channel: string; label: string;
  clickCount: number; conversionCount: number; createdAt: string;
}

interface FunnelStep { step: string; value: number; }

interface FunnelData {
  campaign: Campaign; funnelSteps: FunnelStep[];
  channelBreakdown: Array<{ channel: string; label: string; clicks: number; conversions: number; conversionRate: string }>;
  totalClicks: number; totalConversions: number; pendingVerifications: number;
}

interface Verification {
  id: number; campaignId: number; fanName: string; fanEmail: string; fanPhone?: string;
  paymentRef?: string; receiptNote?: string; status: string; bonusCode?: string;
  reviewNote?: string; reviewedAt?: string; createdAt: string;
}

interface Commission {
  id: number; promoLinkId: number; campaignId: number; ambassadorName: string;
  ambassadorEmail: string; commissionRate: string; totalClicks: number;
  totalConversions: number; totalEarned: string; paidAmount: string;
  payoutStatus: string; createdAt: string;
}

interface DripPost { platform: string; content: string; scheduledDate: string; }

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸", twitter: "🐦", tiktok: "🎵", youtube: "▶️", facebook: "👤",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

const PAYOUT_COLORS: Record<string, string> = {
  pending: "bg-gray-100 text-gray-600",
  processing: "bg-blue-100 text-blue-700",
  paid: "bg-emerald-100 text-emerald-700",
};

const FUNNEL_COLORS = ["#16a34a", "#22c55e", "#86efac", "#bbf7d0"];

function CampaignBuilder({ campaign, onSaved }: { campaign?: Campaign; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: campaign?.name ?? "",
    bookTitle: campaign?.bookTitle ?? "999 — The Charly Boy Manifesto",
    synopsis: campaign?.synopsis ?? "",
    chapterPreview: campaign?.chapterPreview ?? "",
    destinationUrl: campaign?.destinationUrl ?? "",
    paystackLink: campaign?.paystackLink ?? "",
    launchDate: campaign?.launchDate ? campaign.launchDate.slice(0, 16) : "",
    primaryColor: campaign?.primaryColor ?? "#16a34a",
    description: campaign?.description ?? "",
  });

  const save = useMutation({
    mutationFn: (body: object) => campaign
      ? apiFetch(`/promo-campaigns/${campaign.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : apiFetch("/promo-campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { toast({ title: campaign ? "Campaign updated!" : "Campaign created!" }); onSaved(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>Campaign Name</Label>
          <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 999 Book Launch" />
        </div>
        <div>
          <Label>Book Title</Label>
          <Input value={form.bookTitle} onChange={e => setForm(f => ({ ...f, bookTitle: e.target.value }))} placeholder="e.g. 999 — The Manifesto" />
        </div>
        <div className="md:col-span-2">
          <Label>Destination URL (book landing page)</Label>
          <Input value={form.destinationUrl} onChange={e => setForm(f => ({ ...f, destinationUrl: e.target.value }))} placeholder="https://charlyboy.com/999" />
        </div>
        <div className="md:col-span-2">
          <Label>Paystack Checkout Link</Label>
          <Input value={form.paystackLink} onChange={e => setForm(f => ({ ...f, paystackLink: e.target.value }))} placeholder="https://paystack.com/pay/999-book" />
        </div>
        <div>
          <Label>Launch Date</Label>
          <Input type="datetime-local" value={form.launchDate} onChange={e => setForm(f => ({ ...f, launchDate: e.target.value }))} />
        </div>
        <div>
          <Label>Brand Colour</Label>
          <div className="flex gap-2 items-center">
            <Input type="color" value={form.primaryColor} onChange={e => setForm(f => ({ ...f, primaryColor: e.target.value }))} className="w-14 h-9 px-1 py-1" />
            <span className="text-sm text-muted-foreground">{form.primaryColor}</span>
          </div>
        </div>
        <div className="md:col-span-2">
          <Label>Synopsis</Label>
          <Textarea value={form.synopsis} onChange={e => setForm(f => ({ ...f, synopsis: e.target.value }))} rows={3} placeholder="One-paragraph description shown on the landing page" />
        </div>
        <div className="md:col-span-2">
          <Label>Chapter Preview (shown on landing page)</Label>
          <Textarea value={form.chapterPreview} onChange={e => setForm(f => ({ ...f, chapterPreview: e.target.value }))} rows={4} placeholder="Paste an excerpt from the first chapter..." />
        </div>
      </div>
      <Button
        disabled={!form.name || !form.destinationUrl || save.isPending}
        onClick={() => save.mutate({ ...form, launchDate: form.launchDate || undefined })}
      >
        {save.isPending ? "Saving…" : campaign ? "Save Changes" : "Create Campaign"}
      </Button>
    </div>
  );
}

function PromoLinksTab({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ channel: "", label: "" });

  const { data: links = [], isLoading } = useQuery<PromoLink[]>({
    queryKey: ["promo-links", campaign.id],
    queryFn: () => apiFetch(`/promo-campaigns/${campaign.id}/links`),
  });

  const createLink = useMutation({
    mutationFn: (body: object) => apiFetch(`/promo-campaigns/${campaign.id}/links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["promo-links", campaign.id] }); setAddOpen(false); setForm({ channel: "", label: "" }); toast({ title: "Link created!" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteLink = useMutation({
    mutationFn: (id: number) => apiFetch(`/promo-links/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["promo-links", campaign.id] }); toast({ title: "Link deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const baseUrl = `${window.location.protocol}//${window.location.host}${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/p/${campaign.slug}`;

  function copyLink(channel: string) {
    navigator.clipboard.writeText(`${baseUrl}/${channel}`);
    toast({ title: "Link copied!" });
  }

  function downloadQr(channel: string, format: "png" | "svg") {
    window.open(`${API}/promo-campaigns/${campaign.id}/qr/${channel}?format=${format}`, "_blank");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Tracked links for <strong>{campaign.name}</strong></p>
          <p className="text-xs text-muted-foreground mt-0.5">Base URL: <code className="bg-muted px-1 rounded text-xs">{baseUrl}/[channel]</code></p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> Add Link</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Promo Link</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Channel Slug</Label>
                <Input value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") }))} placeholder="e.g. ig, wa, fan-alex" />
                <p className="text-xs text-muted-foreground mt-1">Final URL: {baseUrl}/{form.channel || "[channel]"}</p>
              </div>
              <div>
                <Label>Label</Label>
                <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Instagram, WhatsApp Broadcast" />
              </div>
              <Button className="w-full" disabled={!form.channel || !form.label || createLink.isPending} onClick={() => createLink.mutate(form)}>
                {createLink.isPending ? "Creating…" : "Create Link"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="space-y-2">
          {links.map(link => (
            <Card key={link.id}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm">{link.label}</p>
                      <Badge variant="outline" className="text-xs">{link.channel}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{baseUrl}/{link.channel}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="font-bold text-sm">{link.clickCount.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">clicks</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-sm text-emerald-600">{link.conversionCount}</p>
                      <p className="text-xs text-muted-foreground">buys</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => copyLink(link.channel)} title="Copy link">
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadQr(link.channel, "png")} title="Download QR PNG">
                        <QrCode className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => downloadQr(link.channel, "svg")} title="Download QR SVG">
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteLink.mutate(link.id)} disabled={deleteLink.isPending}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function LandingPageTab({ campaign }: { campaign: Campaign }) {
  const launchDate = campaign.launchDate ? new Date(campaign.launchDate) : null;
  const daysLeft = launchDate ? Math.max(0, Math.ceil((launchDate.getTime() - Date.now()) / 86400000)) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Live preview of your mobile landing page</p>
        <Button variant="outline" size="sm" onClick={() => window.open(`${API}/p/${campaign.slug}/preview`, "_blank")}>
          <ExternalLink className="w-4 h-4 mr-1.5" /> Open Full Page
        </Button>
      </div>

      <div className="flex justify-center">
        <div className="w-80 rounded-3xl border-4 border-gray-800 overflow-hidden shadow-2xl bg-white">
          <div className="h-6 bg-gray-800 flex items-center justify-center">
            <div className="w-16 h-2 bg-gray-600 rounded-full" />
          </div>
          <div className="overflow-y-auto max-h-[600px]" style={{ scrollbarWidth: "none" }}>
            <div style={{ backgroundColor: campaign.primaryColor }} className="px-6 py-8 text-white text-center">
              {campaign.coverImageUrl ? (
                <img src={campaign.coverImageUrl} alt="cover" className="w-24 h-32 object-cover mx-auto rounded-lg shadow-lg mb-4" />
              ) : (
                <div className="w-24 h-32 bg-white/20 rounded-lg mx-auto mb-4 flex items-center justify-center">
                  <span className="text-4xl">📖</span>
                </div>
              )}
              <h1 className="text-lg font-black leading-tight">{campaign.bookTitle}</h1>
              <p className="text-xs opacity-80 mt-1">by Charly Boy — Area Fada</p>
            </div>

            {daysLeft !== null && daysLeft > 0 && (
              <div className="bg-gray-900 text-white px-4 py-3 text-center">
                <p className="text-xs uppercase tracking-wider opacity-60">Launching in</p>
                <p className="text-3xl font-black mt-0.5">{daysLeft}<span className="text-lg font-normal ml-1">days</span></p>
              </div>
            )}

            {daysLeft === 0 && (
              <div className="bg-emerald-600 text-white px-4 py-2 text-center">
                <p className="font-black text-sm">🎉 AVAILABLE NOW!</p>
              </div>
            )}

            <div className="px-4 py-5 space-y-4">
              {campaign.synopsis && (
                <div>
                  <h2 className="font-bold text-sm mb-1.5">About The Book</h2>
                  <p className="text-xs text-gray-600 leading-relaxed">{campaign.synopsis.slice(0, 200)}{campaign.synopsis.length > 200 ? "…" : ""}</p>
                </div>
              )}

              {campaign.chapterPreview && (
                <div className="bg-gray-50 rounded-xl p-3 border-l-4" style={{ borderColor: campaign.primaryColor }}>
                  <p className="text-xs font-semibold mb-1" style={{ color: campaign.primaryColor }}>📖 Chapter Preview</p>
                  <p className="text-xs text-gray-600 leading-relaxed italic">{campaign.chapterPreview.slice(0, 200)}{campaign.chapterPreview.length > 200 ? "…" : ""}</p>
                </div>
              )}

              <div className="space-y-2">
                {campaign.paystackLink && (
                  <a href={campaign.paystackLink} target="_blank" rel="noreferrer" className="block w-full text-center font-black py-3.5 rounded-xl text-white text-sm" style={{ backgroundColor: campaign.primaryColor }}>
                    Buy Now — Pay with Paystack
                  </a>
                )}
                <a href={campaign.destinationUrl} target="_blank" rel="noreferrer" className="block w-full text-center font-semibold py-3 rounded-xl border-2 text-sm" style={{ borderColor: campaign.primaryColor, color: campaign.primaryColor }}>
                  Learn More
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function FunnelTab({ campaign }: { campaign: Campaign }) {
  const { data, isLoading } = useQuery<FunnelData>({
    queryKey: ["promo-funnel", campaign.id],
    queryFn: () => apiFetch(`/promo-campaigns/${campaign.id}/funnel`),
    refetchInterval: 30000,
  });

  if (isLoading) return <div className="text-center py-12 text-muted-foreground text-sm">Loading funnel data…</div>;

  const steps = data?.funnelSteps ?? [];
  const channels = data?.channelBreakdown ?? [];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Clicks", value: data?.totalClicks ?? 0, icon: "👆", color: "text-blue-600" },
          { label: "Conversions", value: data?.totalConversions ?? 0, icon: "✅", color: "text-emerald-600" },
          { label: "Pending Reviews", value: data?.pendingVerifications ?? 0, icon: "⏳", color: "text-amber-600" },
          { label: "Conv. Rate", value: data?.totalClicks ? `${((( data.totalConversions / data.totalClicks) * 100)).toFixed(1)}%` : "0%", icon: "📊", color: "text-purple-600" },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="py-3 px-4 text-center">
              <p className="text-2xl mb-1">{stat.icon}</p>
              <p className={`font-black text-xl ${stat.color}`}>{typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3">Conversion Funnel</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={steps} layout="vertical" margin={{ left: 20, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="step" tick={{ fontSize: 11 }} width={100} />
            <Tooltip />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {steps.map((_, i) => <Cell key={i} fill={FUNNEL_COLORS[i] ?? "#16a34a"} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h3 className="font-semibold text-sm mb-3">Channel Breakdown</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="text-left py-2 font-medium">Channel</th>
                <th className="text-right py-2 font-medium">Clicks</th>
                <th className="text-right py-2 font-medium">Buys</th>
                <th className="text-right py-2 font-medium">Conv. Rate</th>
              </tr>
            </thead>
            <tbody>
              {channels.map(ch => (
                <tr key={ch.channel} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-2.5">
                    <div className="font-medium">{ch.label}</div>
                    <div className="text-xs text-muted-foreground">{ch.channel}</div>
                  </td>
                  <td className="py-2.5 text-right font-bold">{ch.clicks.toLocaleString()}</td>
                  <td className="py-2.5 text-right font-bold text-emerald-600">{ch.conversions}</td>
                  <td className="py-2.5 text-right">
                    <Badge variant="secondary" className="text-xs">{ch.conversionRate}%</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function DripTab({ campaign }: { campaign: Campaign }) {
  const { toast } = useToast();
  const [dripPosts, setDripPosts] = useState<DripPost[]>([]);
  const [loaded, setLoaded] = useState(false);

  const loadDrip = useMutation({
    mutationFn: () => apiFetch(`/promo-campaigns/${campaign.id}/drip-schedule`, { method: "POST" }),
    onSuccess: (data: { posts: DripPost[] }) => { setDripPosts(data.posts); setLoaded(true); toast({ title: `${data.posts.length} drip posts loaded!` }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card className="border-amber-200 bg-amber-50/40">
        <CardContent className="py-4 px-5">
          <div className="flex items-start gap-4">
            <div className="text-3xl">🗓</div>
            <div className="flex-1">
              <h3 className="font-bold text-sm">30-Day Launch Drip Schedule</h3>
              <p className="text-xs text-muted-foreground mt-1">Generate a full 30-day content drip for <strong>{campaign.bookTitle}</strong> — countdowns, chapter previews, testimonials, and launch-day posts — pre-formatted for your content calendar.</p>
              {campaign.launchDate && (
                <p className="text-xs font-semibold mt-2 text-amber-700">
                  Launch: {new Date(campaign.launchDate).toLocaleDateString("en-NG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
                </p>
              )}
            </div>
            <Button onClick={() => loadDrip.mutate()} disabled={loadDrip.isPending} size="sm">
              <Zap className="w-4 h-4 mr-1.5" /> {loadDrip.isPending ? "Generating…" : "Load Schedule"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {loaded && dripPosts.length > 0 && (
        <div className="space-y-2">
          {dripPosts.map((post, i) => (
            <Card key={i} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <span className="text-xl mt-0.5">{PLATFORM_ICONS[post.platform] ?? "📢"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="outline" className="text-xs capitalize">{post.platform}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(post.scheduledDate).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}
                      </span>
                    </div>
                    <p className="text-xs text-gray-700 leading-relaxed">{post.content}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function VerificationsTab({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: verifications = [], isLoading } = useQuery<Verification[]>({
    queryKey: ["verifications", campaign.id],
    queryFn: () => apiFetch(`/purchase-verifications?campaignId=${campaign.id}`),
  });

  const review = useMutation({
    mutationFn: ({ id, status, reviewNote }: { id: number; status: string; reviewNote?: string }) =>
      apiFetch(`/purchase-verifications/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reviewNote }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["verifications", campaign.id] }); toast({ title: "Review saved!" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const pending = verifications.filter(v => v.status === "pending");
  const reviewed = verifications.filter(v => v.status !== "pending");

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pending", count: verifications.filter(v => v.status === "pending").length, color: "text-amber-600" },
          { label: "Approved", count: verifications.filter(v => v.status === "approved").length, color: "text-emerald-600" },
          { label: "Rejected", count: verifications.filter(v => v.status === "rejected").length, color: "text-red-500" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="py-3 text-center">
              <p className={`font-black text-2xl ${s.color}`}>{s.count}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <>
          {pending.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm flex items-center gap-2"><Clock className="w-4 h-4 text-amber-500" /> Pending Review</h3>
              {pending.map(v => (
                <Card key={v.id} className="border-amber-200">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <p className="font-semibold text-sm">{v.fanName}</p>
                        <p className="text-xs text-muted-foreground">{v.fanEmail}{v.fanPhone && ` · ${v.fanPhone}`}</p>
                        {v.paymentRef && <p className="text-xs mt-1">Ref: <code className="bg-muted px-1 rounded">{v.paymentRef}</code></p>}
                        {v.receiptNote && <p className="text-xs text-muted-foreground mt-1 italic">{v.receiptNote}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{new Date(v.createdAt).toLocaleDateString("en-NG")}</p>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50 h-8" onClick={() => review.mutate({ id: v.id, status: "approved" })}>
                          <CheckCircle className="w-3.5 h-3.5 mr-1" /> Approve
                        </Button>
                        <Button size="sm" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 h-8" onClick={() => review.mutate({ id: v.id, status: "rejected", reviewNote: "Could not verify payment" })}>
                          <XCircle className="w-3.5 h-3.5 mr-1" /> Reject
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {reviewed.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-semibold text-sm text-muted-foreground">Reviewed</h3>
              {reviewed.map(v => (
                <Card key={v.id} className="opacity-75">
                  <CardContent className="py-2.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{v.fanName} <span className="text-xs text-muted-foreground">{v.fanEmail}</span></p>
                        {v.bonusCode && <p className="text-xs text-emerald-600 font-mono mt-0.5">Bonus: {v.bonusCode}</p>}
                      </div>
                      <Badge className={STATUS_COLORS[v.status] ?? ""}>{v.status}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {verifications.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No purchase verifications yet</p>
              <p className="text-xs mt-1">Fan submissions will appear here for review</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AffiliatesTab({ campaign }: { campaign: Campaign }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ ambassadorName: "", ambassadorEmail: "", commissionRate: "10" });

  const { data: commissions = [], isLoading } = useQuery<Commission[]>({
    queryKey: ["commissions", campaign.id],
    queryFn: () => apiFetch(`/affiliate-commissions?campaignId=${campaign.id}`),
  });

  const addAffiliate = useMutation({
    mutationFn: (body: object) => apiFetch("/affiliate-commissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, campaignId: campaign.id }) }),
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["commissions", campaign.id] });
      qc.invalidateQueries({ queryKey: ["promo-links", campaign.id] });
      setAddOpen(false); setForm({ ambassadorName: "", ambassadorEmail: "", commissionRate: "10" });
      toast({ title: `Affiliate added! Referral link: ${data.referralUrl}` });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const payout = useMutation({
    mutationFn: (id: number) => apiFetch(`/affiliate-commissions/${id}/payout`, { method: "PATCH" }),
    onSuccess: (data: any) => { qc.invalidateQueries({ queryKey: ["commissions", campaign.id] }); toast({ title: data.message }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const totalEarned = commissions.reduce((s, c) => s + Number(c.totalEarned), 0);
  const totalPaid = commissions.reduce((s, c) => s + Number(c.paidAmount), 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="py-3 text-center"><p className="font-black text-xl text-purple-600">{commissions.length}</p><p className="text-xs text-muted-foreground">Affiliates</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="font-black text-xl">{commissions.reduce((s, c) => s + c.totalClicks, 0).toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Clicks</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="font-black text-xl text-emerald-600">₦{totalEarned.toLocaleString()}</p><p className="text-xs text-muted-foreground">Total Earned</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="font-black text-xl text-blue-600">₦{(totalEarned - totalPaid).toLocaleString()}</p><p className="text-xs text-muted-foreground">Due for Payout</p></CardContent></Card>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm">Ambassador Referrals</h3>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1.5" /> Add Affiliate</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>New Affiliate Referral</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Ambassador Name</Label>
                <Input value={form.ambassadorName} onChange={e => setForm(f => ({ ...f, ambassadorName: e.target.value }))} placeholder="e.g. Alex Martins" />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={form.ambassadorEmail} onChange={e => setForm(f => ({ ...f, ambassadorEmail: e.target.value }))} placeholder="alex@example.com" />
              </div>
              <div>
                <Label>Commission Rate (%)</Label>
                <Input type="number" value={form.commissionRate} onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))} min="1" max="50" />
              </div>
              <Button className="w-full" disabled={!form.ambassadorName || !form.ambassadorEmail || addAffiliate.isPending} onClick={() => addAffiliate.mutate(form)}>
                {addAffiliate.isPending ? "Creating…" : "Create Affiliate Link"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="space-y-2">
          {commissions.map(c => {
            const due = Number(c.totalEarned) - Number(c.paidAmount);
            return (
              <Card key={c.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{c.ambassadorName}</p>
                      <p className="text-xs text-muted-foreground">{c.ambassadorEmail} · {c.commissionRate}% commission</p>
                      <div className="flex gap-3 mt-1.5">
                        <span className="text-xs text-muted-foreground">{c.totalClicks} clicks</span>
                        <span className="text-xs text-muted-foreground">{c.totalConversions} conversions</span>
                        <span className="text-xs font-medium text-emerald-600">₦{Number(c.totalEarned).toLocaleString()} earned</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge className={PAYOUT_COLORS[c.payoutStatus] ?? ""}>{c.payoutStatus}</Badge>
                      {c.payoutStatus !== "paid" && due > 0 && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => payout.mutate(c.id)} disabled={payout.isPending}>
                          Pay ₦{due.toLocaleString()}
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {commissions.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No affiliates yet</p>
              <p className="text-xs mt-1">Add fan ambassadors to give them their own referral links</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BookPromoInner() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);
  const [campaignFormOpen, setCampaignFormOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("links");

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["promo-campaigns"],
    queryFn: () => apiFetch("/promo-campaigns"),
    onSuccess: (data: Campaign[]) => { if (data.length > 0 && !selectedCampaignId) setSelectedCampaignId(data[0].id); },
  } as any);

  const deleteCampaign = useMutation({
    mutationFn: (id: number) => apiFetch(`/promo-campaigns/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["promo-campaigns"] }); setSelectedCampaignId(null); toast({ title: "Campaign deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId) ?? campaigns[0] ?? null;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black">📖 Book Promo Engine</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Track every click, conversion, and commission for your book launch</p>
        </div>
        <Dialog open={campaignFormOpen} onOpenChange={setCampaignFormOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1.5" /> New Campaign</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Create Campaign</DialogTitle></DialogHeader>
            <CampaignBuilder onSaved={() => { qc.invalidateQueries({ queryKey: ["promo-campaigns"] }); setCampaignFormOpen(false); }} />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-20 text-muted-foreground">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-4xl mb-4">📖</p>
          <h2 className="font-bold text-lg mb-2">No campaigns yet</h2>
          <p className="text-muted-foreground text-sm mb-4">Create your first campaign to start generating tracked promo links</p>
          <Button onClick={() => setCampaignFormOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Create Campaign</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Campaigns</p>
            {campaigns.map(c => (
              <button
                key={c.id}
                onClick={() => setSelectedCampaignId(c.id)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${selectedCampaign?.id === c.id ? "border-primary bg-primary/5" : "border-transparent hover:border-border hover:bg-muted/40"}`}
              >
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: c.primaryColor }} />
                  <p className="font-semibold text-sm truncate">{c.name}</p>
                </div>
                {c.launchDate && <p className="text-xs text-muted-foreground mt-0.5 pl-4">🗓 {new Date(c.launchDate).toLocaleDateString("en-NG", { month: "short", day: "numeric", year: "numeric" })}</p>}
              </button>
            ))}
          </div>

          {selectedCampaign && (
            <div className="lg:col-span-3">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-lg">{selectedCampaign.name}</h2>
                  <p className="text-xs text-muted-foreground">{selectedCampaign.description}</p>
                </div>
                <div className="flex gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm">Edit Campaign</Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader><DialogTitle>Edit Campaign</DialogTitle></DialogHeader>
                      <CampaignBuilder campaign={selectedCampaign} onSaved={() => qc.invalidateQueries({ queryKey: ["promo-campaigns"] })} />
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="mb-4 flex-wrap h-auto gap-1">
                  <TabsTrigger value="links" className="flex items-center gap-1.5"><Link2 className="w-3.5 h-3.5" /> Links & QR</TabsTrigger>
                  <TabsTrigger value="landing" className="flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Landing Page</TabsTrigger>
                  <TabsTrigger value="funnel" className="flex items-center gap-1.5"><BarChart2 className="w-3.5 h-3.5" /> Funnel</TabsTrigger>
                  <TabsTrigger value="drip" className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Drip</TabsTrigger>
                  <TabsTrigger value="verify" className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5" /> Verify</TabsTrigger>
                  <TabsTrigger value="affiliates" className="flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> Affiliates</TabsTrigger>
                </TabsList>
                <TabsContent value="links"><PromoLinksTab campaign={selectedCampaign} /></TabsContent>
                <TabsContent value="landing"><LandingPageTab campaign={selectedCampaign} /></TabsContent>
                <TabsContent value="funnel"><FunnelTab campaign={selectedCampaign} /></TabsContent>
                <TabsContent value="drip"><DripTab campaign={selectedCampaign} /></TabsContent>
                <TabsContent value="verify"><VerificationsTab campaign={selectedCampaign} /></TabsContent>
                <TabsContent value="affiliates"><AffiliatesTab campaign={selectedCampaign} /></TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BookPromoPage() {
  return (
    <AppShell>
      <TierGuard moduleKey="bookPromo" requiredTier="creator" moduleName="Book Promo Engine">
        <BookPromoInner />
      </TierGuard>
    </AppShell>
  );
}
