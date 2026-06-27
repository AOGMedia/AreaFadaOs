import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { TierGuard } from "@/components/TierGuard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Users, Eye, Heart, FileText, Clock, Globe, Zap, Download } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

const PLATFORMS = ["instagram", "tiktok", "x", "youtube", "facebook"];
const PLATFORM_COLORS: Record<string, string> = {
  instagram: "#E1306C",
  tiktok: "#010101",
  x: "#1DA1F2",
  youtube: "#FF0000",
  facebook: "#1877F2",
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

function QualityBadge({ label }: { label: string }) {
  const map: Record<string, { cls: string; text: string }> = {
    high: { cls: "bg-emerald-100 text-emerald-800", text: "High Quality" },
    medium: { cls: "bg-yellow-100 text-yellow-800", text: "Medium" },
    low: { cls: "bg-orange-100 text-orange-800", text: "Low" },
    suspicious: { cls: "bg-red-100 text-red-800", text: "Suspicious" },
  };
  const style = map[label] ?? map.medium;
  return <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${style.cls}`}>{style.text}</span>;
}

// ─── Overview Tab ────────────────────────────────────────────────────────
function OverviewTab({ platform, setTab }: { platform: string; setTab: (t: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-summary"],
    queryFn: () => apiFetch("/analytics/summary"),
  });

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Loading analytics…</div>;

  const summary = data as any;
  const plat = summary?.platforms?.find((p: any) => p.platform === platform) ?? summary?.platforms?.[0];

  const timeSeries = plat?.timeSeries?.map((t: any) => ({
    date: new Date(t.date).toLocaleDateString("en-NG", { month: "short", day: "numeric" }),
    Followers: t.followers,
    Reach: t.reach,
    Engagement: t.engagementRate,
  })) ?? [];

  return (
    <div className="space-y-6">
      {/* Top stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Users className="h-4 w-4" /> Total Followers</div>
            <div className="text-2xl font-bold">{fmt(summary?.totalFollowers ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Eye className="h-4 w-4" /> Weekly Reach</div>
            <div className="text-2xl font-bold">{fmt(summary?.totalReach ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Heart className="h-4 w-4" /> Avg Engagement</div>
            <div className="text-2xl font-bold">{summary?.avgEngagementRate?.toFixed(1)}%</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><TrendingUp className="h-4 w-4" /> Platforms</div>
            <div className="text-2xl font-bold">{summary?.platforms?.length ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Per-platform stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {summary?.platforms?.map((p: any) => (
          <Card key={p.platform} className="cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all">
            <CardContent className="p-3 text-center">
              <div className="font-semibold capitalize text-sm" style={{ color: PLATFORM_COLORS[p.platform] }}>{p.platform}</div>
              <div className="text-xl font-bold mt-1">{fmt(p.followers)}</div>
              <div className="text-xs text-muted-foreground">{p.engagementRate?.toFixed(1)}% eng.</div>
              <div className={`text-xs mt-1 font-medium ${p.followerGrowth >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                {p.followerGrowth >= 0 ? "+" : ""}{fmt(p.followerGrowth)} growth
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Line chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Followers Over Time — <span className="capitalize text-primary">{plat?.platform}</span></CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={timeSeries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} interval={6} />
              <YAxis tickFormatter={fmt} tick={{ fontSize: 11 }} width={55} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} />
              <Line type="monotone" dataKey="Followers" stroke={PLATFORM_COLORS[plat?.platform] ?? "#7c3aed"} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Reach + engagement dual chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Reach & Engagement Rate</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={timeSeries.slice(-14)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tickFormatter={fmt} tick={{ fontSize: 11 }} width={50} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} unit="%" width={40} />
              <Tooltip />
              <Legend />
              <Bar yAxisId="left" dataKey="Reach" fill="#7c3aed" opacity={0.8} />
              <Line yAxisId="right" type="monotone" dataKey="Engagement" stroke="#2dd172" strokeWidth={2} dot={false} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Audience Tab ────────────────────────────────────────────────────────
function AudienceTab({ platform }: { platform: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-audience", platform],
    queryFn: () => apiFetch(`/analytics/audience?platform=${platform}`),
  });

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Loading audience data…</div>;

  const audience = data as any;

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-2 gap-6">
        {/* Nigeria States */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4 text-green-600" /> Nigeria State Breakdown</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2">
              {audience?.nigeriaStates?.map((s: any) => (
                <div key={s.region} className="flex items-center gap-3">
                  <div className="w-28 text-sm font-medium truncate">{s.label}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                    <div
                      className="bg-green-500 h-2.5 rounded-full"
                      style={{ width: `${Math.min(100, s.percentage * 3)}%` }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground w-16 text-right">{Number(s.percentage).toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground w-16 text-right">{fmt(s.count)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Diaspora */}
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe className="h-4 w-4 text-blue-600" /> Diaspora Heatmap</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {audience?.diaspora?.map((d: any) => (
                <div key={d.region} className="flex items-center gap-3">
                  <div className="w-32 text-sm font-medium">{d.label}</div>
                  <div className="flex-1 bg-gray-100 rounded-full h-2.5">
                    <div
                      className="bg-blue-500 h-2.5 rounded-full"
                      style={{ width: `${Math.min(100, d.percentage * 15)}%` }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground w-12 text-right">{Number(d.percentage).toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground w-16 text-right">{fmt(d.count)}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg text-xs text-blue-700">
              <strong>Insight:</strong> UK diaspora peaks at 20:00 WAT. Schedule premium content to capture cross-timezone reach.
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution visual */}
      <Card>
        <CardHeader><CardTitle className="text-base">Audience Distribution — {platform}</CardTitle></CardHeader>
        <CardContent>
          <div className="flex gap-1 h-12 rounded-xl overflow-hidden">
            {audience?.nigeriaStates?.map((s: any, i: number) => (
              <div
                key={s.region}
                style={{
                  width: `${s.percentage}%`,
                  background: `hsl(${140 + i * 12}, 60%, ${45 + i * 2}%)`,
                }}
                title={`${s.label}: ${Number(s.percentage).toFixed(1)}%`}
                className="transition-all hover:opacity-80 cursor-pointer"
              />
            ))}
            {audience?.diaspora?.map((d: any, i: number) => (
              <div
                key={d.region}
                style={{
                  width: `${d.percentage}%`,
                  background: `hsl(${210 + i * 10}, 65%, ${50 + i * 3}%)`,
                }}
                title={`${d.label}: ${Number(d.percentage).toFixed(1)}%`}
                className="transition-all hover:opacity-80 cursor-pointer"
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 text-xs"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Nigeria States</span>
            <span className="inline-flex items-center gap-1 text-xs"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Diaspora</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Best Times Tab ───────────────────────────────────────────────────────
function BestTimesTab({ platform }: { platform: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-best-times", platform],
    queryFn: () => apiFetch(`/analytics/best-times?platform=${platform}`),
  });

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Loading timing data…</div>;

  const bt = data as any;
  const heatmap: { day: number; hour: number; score: number; recommended: boolean }[] = bt?.heatmap ?? [];

  function cellColor(score: number, recommended: boolean): string {
    if (recommended) return "#7c3aed";
    if (score >= 70) return "#a78bfa";
    if (score >= 50) return "#ddd6fe";
    if (score >= 30) return "#f3f4f6";
    return "#f9fafb";
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            Best Time to Post Heatmap — <span className="capitalize text-primary">{platform}</span>
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">{bt?.note}</p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[600px]">
              {/* Hour headers */}
              <div className="flex mb-1">
                <div className="w-12" />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="flex-1 text-center text-xs text-muted-foreground" style={{ minWidth: 22 }}>
                    {h % 3 === 0 ? `${h}h` : ""}
                  </div>
                ))}
              </div>
              {/* Grid rows */}
              {DAYS.map((day, dayIdx) => (
                <div key={dayIdx} className="flex items-center mb-1">
                  <div className="w-12 text-xs text-muted-foreground text-right pr-2">{day}</div>
                  {Array.from({ length: 24 }, (_, h) => {
                    const cell = heatmap.find(c => c.day === dayIdx && c.hour === h);
                    return (
                      <div
                        key={h}
                        className="flex-1 h-6 rounded-sm mx-0.5 cursor-pointer transition-opacity hover:opacity-80"
                        style={{
                          minWidth: 20,
                          background: cellColor(cell?.score ?? 0, cell?.recommended ?? false),
                        }}
                        title={`${day} ${h}:00 WAT — Score: ${cell?.score ?? 0}${cell?.recommended ? " ⭐ Recommended" : ""}`}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {/* Legend */}
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-sm bg-[#7c3aed] inline-block" /> Best window</span>
            <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-sm bg-[#a78bfa] inline-block" /> Good</span>
            <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-sm bg-[#ddd6fe] inline-block" /> Moderate</span>
            <span className="flex items-center gap-1"><span className="w-4 h-4 rounded-sm bg-[#f3f4f6] inline-block" /> Low</span>
          </div>
        </CardContent>
      </Card>

      {/* Best windows list */}
      <Card>
        <CardHeader><CardTitle className="text-base">Recommended Posting Windows</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {bt?.bestWindows?.map((w: any, i: number) => (
              <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-primary/5 border border-primary/10">
                <div className="text-2xl font-bold text-primary w-6 text-center">{i + 1}</div>
                <div>
                  <div className="text-sm font-semibold">{w.day} {w.time}</div>
                  <div className="text-xs text-muted-foreground">Score: {w.score}/100</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Engagement Quality Tab ───────────────────────────────────────────────
function EngagementTab({ platform }: { platform: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-post-performance", platform],
    queryFn: () => apiFetch(`/analytics/post-performance?platform=${platform}`),
  });

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Analysing engagement…</div>;

  const posts = (data as any[]) ?? [];
  const high = posts.filter(p => p.qualityLabel === "high").length;
  const medium = posts.filter(p => p.qualityLabel === "medium").length;
  const low = posts.filter(p => p.qualityLabel === "low").length;
  const suspicious = posts.filter(p => p.qualityLabel === "suspicious").length;

  return (
    <div className="space-y-6">
      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-emerald-600">{high}</div><div className="text-sm text-muted-foreground mt-1">High Quality</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-yellow-600">{medium}</div><div className="text-sm text-muted-foreground mt-1">Medium</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-orange-600">{low}</div><div className="text-sm text-muted-foreground mt-1">Low Engagement</div></CardContent></Card>
        <Card><CardContent className="p-4 text-center"><div className="text-3xl font-bold text-red-600">{suspicious}</div><div className="text-sm text-muted-foreground mt-1">Suspicious</div></CardContent></Card>
      </div>

      {/* Posts table */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-500" /> Post Engagement Scores</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            {posts.slice(0, 15).map((p: any) => (
              <div key={p.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/60 transition-colors">
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                  {p.engagementScore}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{p.caption ?? "No caption"}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <QualityBadge label={p.qualityLabel} />
                    <span className="text-xs text-muted-foreground capitalize">{p.platform}</span>
                    <span className="text-xs text-muted-foreground">❤️ {fmt(p.likes)}</span>
                    <span className="text-xs text-muted-foreground">💬 {fmt(p.comments)}</span>
                    <span className="text-xs text-muted-foreground">🔁 {fmt(p.shares)}</span>
                    <span className="text-xs text-muted-foreground">Reach: {fmt(p.reach)}</span>
                  </div>
                  {p.qualityReason && (
                    <div className="text-xs text-muted-foreground mt-1 italic">{p.qualityReason}</div>
                  )}
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-sm font-semibold">{p.engagementRate?.toFixed(1)}%</div>
                  <div className="text-xs text-muted-foreground">eng. rate</div>
                  {p.botRisk > 15 && (
                    <div className="text-xs text-red-500 mt-1">⚠️ {p.botRisk?.toFixed(0)}% bot risk</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Platform Comparison Tab ──────────────────────────────────────────────
function ComparisonTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["analytics-platform-comparison"],
    queryFn: () => apiFetch("/analytics/platform-comparison"),
  });

  if (isLoading) return <div className="py-20 text-center text-muted-foreground">Loading comparison…</div>;

  const platforms = (data as any[]) ?? [];

  const barData = platforms.map(p => ({
    platform: p.platform.charAt(0).toUpperCase() + p.platform.slice(1),
    Followers: p.followers,
    "Avg Reach": p.avgReach,
    "Engagement %": p.avgEngagementRate,
  }));

  return (
    <div className="space-y-6">
      {/* Rank cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {platforms.map((p: any) => (
          <Card key={p.platform} className="relative overflow-hidden">
            <div className="absolute top-0 left-0 w-1 h-full" style={{ background: PLATFORM_COLORS[p.platform] }} />
            <CardContent className="p-4 pl-5">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold capitalize text-sm">{p.platform}</span>
                <Badge variant="secondary" className="text-xs">#{p.rank}</Badge>
              </div>
              <div className="text-xl font-bold">{fmt(p.followers)}</div>
              <div className="text-xs text-muted-foreground">followers</div>
              <div className="text-sm font-semibold text-primary mt-1">{p.avgEngagementRate?.toFixed(1)}%</div>
              <div className="text-xs text-muted-foreground">avg engagement</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Follower bar chart */}
      <Card>
        <CardHeader><CardTitle className="text-base">Followers by Platform</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="platform" width={80} tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v: any) => fmt(Number(v))} />
              <Bar dataKey="Followers" fill="#7c3aed" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Engagement comparison */}
      <Card>
        <CardHeader><CardTitle className="text-base">Engagement Rate Comparison</CardTitle></CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={barData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="platform" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 11 }} unit="%" />
              <Tooltip formatter={(v: any) => `${Number(v).toFixed(1)}%`} />
              <Bar dataKey="Engagement %" fill="#2dd172" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Reports Tab ──────────────────────────────────────────────────────────
function ReportsTab() {
  const { toast } = useToast();
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [brandColor, setBrandColor] = useState("#7c3aed");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [dateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedPlats, setSelectedPlats] = useState<string[]>(["instagram", "tiktok", "x"]);
  const [lastReport, setLastReport] = useState<any>(null);

  const generate = useMutation({
    mutationFn: () => apiFetch("/analytics/reports/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientName, clientEmail, brandColor, dateFrom, dateTo, platforms: selectedPlats, title: `Performance Report — ${clientName}` }),
    }),
    onSuccess: (data) => { setLastReport(data); toast({ title: "Report generated!", description: "Click Download to view the PDF-ready report." }); },
    onError: () => toast({ title: "Failed to generate report", variant: "destructive" }),
  });

  const digest = useMutation({
    mutationFn: () => apiFetch("/analytics/digest", { method: "POST" }),
    onSuccess: (data) => toast({ title: "Weekly digest generated!", description: data.narrative.slice(0, 100) + "…" }),
    onError: () => toast({ title: "Failed to generate digest", variant: "destructive" }),
  });

  const togglePlatform = (p: string) =>
    setSelectedPlats(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  return (
    <div className="space-y-6">
      {/* White-label report builder */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> White-Label Report Generator</CardTitle>
          <p className="text-xs text-muted-foreground">Generate a branded PDF report to send to clients or sponsors.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Client Name *</Label>
              <Input placeholder="e.g. Paystack Nigeria" value={clientName} onChange={e => setClientName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Client Email</Label>
              <Input placeholder="billing@client.com" value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Report Start Date</Label>
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Brand Accent Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={brandColor} onChange={e => setBrandColor(e.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
                <Input value={brandColor} onChange={e => setBrandColor(e.target.value)} className="font-mono" />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Include Platforms</Label>
            <div className="flex flex-wrap gap-2">
              {PLATFORMS.map(p => (
                <button
                  key={p}
                  onClick={() => togglePlatform(p)}
                  className={`px-3 py-1 rounded-full text-sm font-medium border transition-all capitalize ${selectedPlats.includes(p) ? "text-white border-transparent" : "bg-white text-gray-600 border-gray-200 hover:border-primary/50"}`}
                  style={selectedPlats.includes(p) ? { background: PLATFORM_COLORS[p] } : {}}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <Button onClick={() => generate.mutate()} disabled={!clientName || generate.isPending} className="flex-1">
              {generate.isPending ? "Generating…" : "Generate Report"}
            </Button>
            {lastReport && (
              <a href={`${API}${lastReport.downloadUrl}`} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="gap-2"><Download className="h-4 w-4" /> Download PDF View</Button>
              </a>
            )}
          </div>

          {lastReport && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-sm">
              <strong className="text-emerald-700">✓ Report ready:</strong> <span className="text-emerald-700">{lastReport.title}</span>
              <div className="mt-1 text-xs text-emerald-600">Generated at {new Date(lastReport.generatedAt).toLocaleString()}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Weekly digest */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-yellow-500" /> Weekly Performance Digest</CardTitle>
          <p className="text-xs text-muted-foreground">Auto-generated narrative summary of the past 7 days. Logged as notification + WhatsApp delivery model.</p>
        </CardHeader>
        <CardContent>
          <Button onClick={() => digest.mutate()} disabled={digest.isPending} variant="outline" className="w-full">
            {digest.isPending ? "Generating digest…" : "Generate This Week's Digest"}
          </Button>
          {digest.data && (
            <div className="mt-4 p-4 rounded-xl bg-gray-50 border text-sm whitespace-pre-line font-mono leading-relaxed">
              {(digest.data as any).narrative}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [tab, setTab] = useState("overview");
  const [platform, setPlatform] = useState("instagram");

  return (
    <AppShell>
      <TierGuard requiredTier="brand" moduleKey="analytics">
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl font-bold">Analytics & Reporting</h1>
              <p className="text-muted-foreground text-sm mt-1">Africa-first insights — Nigeria state breakdown, diaspora mapping, WAT-optimised timing.</p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={platform} onValueChange={setPlatform}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLATFORMS.map(p => (
                    <SelectItem key={p} value={p}>
                      <span className="capitalize">{p}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="mb-6 flex-wrap h-auto">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="audience">Audience</TabsTrigger>
              <TabsTrigger value="timing">Best Times</TabsTrigger>
              <TabsTrigger value="engagement">Engagement Quality</TabsTrigger>
              <TabsTrigger value="comparison">Platform Comparison</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>

            <TabsContent value="overview"><OverviewTab platform={platform} setTab={setTab} /></TabsContent>
            <TabsContent value="audience"><AudienceTab platform={platform} /></TabsContent>
            <TabsContent value="timing"><BestTimesTab platform={platform} /></TabsContent>
            <TabsContent value="engagement"><EngagementTab platform={platform} /></TabsContent>
            <TabsContent value="comparison"><ComparisonTab /></TabsContent>
            <TabsContent value="reports"><ReportsTab /></TabsContent>
          </Tabs>
        </div>
      </TierGuard>
    </AppShell>
  );
}
