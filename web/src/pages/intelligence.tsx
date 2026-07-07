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
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import {
  AlertTriangle, TrendingUp, TrendingDown, Users, Target, Zap, Shield,
  Plus, Trash2, CheckCircle, RefreshCw, MapPin, BarChart3, Star, Calendar,
  Trophy, Radio, ChevronRight, Eye, Globe,
} from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", ...opts });
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return null;
  return r.json();
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface WardData { ward: string; lga: string; reach: number; postsPublished: number; engagementRate: number; sentimentScore: number; topContent: string; }
interface LgaRecord { lga: string; state: string; totalReach: number; engagementRate: number; sentimentScore: number; topContent: string; postsPublished: number; }
interface CompetitorWithSnapshot extends Competitor { latestSnapshot: CompetitorSnapshot | null; followerDelta: number | null; }
interface IntelligenceConfig {
  id: number;
  name: string;
  mode: string;
  politicalParty: string | null;
  politicalCandidateName: string | null;
  targetStates: string[];
  alertEmail: string | null;
  active: boolean;
}
interface SentimentMonitor { id: number; keyword: string; type: string; platform: string; active: boolean; }
interface SentimentEvent { id: number; keyword: string; sentimentScore: string; sentimentLabel: string; volume: number; platform: string; aiAnalysis: string | null; occurredAt: string; }
interface Competitor { id: number; handle: string; platform: string; displayName: string | null; category: string; }
interface CompetitorSnapshot { id: number; followerCount: number; postsPerWeek: string; avgEngagementRate: string; topPostEngagement: number; topPostCaption: string | null; snapshotDate: string; }
interface CrisisAlert { id: number; type: string; severity: string; title: string; description: string; triggeredValue: string | null; thresholdValue: string | null; platform: string | null; acknowledged: boolean; createdAt: string; }
interface RoiEvent { id: number; contentAction: string; contentRef: string | null; outcomeType: string; outcomeCount: number; estimatedRevenueNgn: string; manualTag: string | null; platform: string | null; occurredAt: string; }
interface LgaData { state: string; lgas: number; totalReach: number; engagementRate: number; sentimentScore: number; topContent: string; postsPublished: number; }
interface EventMode { id: number; eventName: string; hashtags: string[]; votingLinks: { label: string; url: string }[]; totalVoteCount: number; phase: string; hypeSeriesEnabled: boolean; hypeSeriesDays: number; contentSchedule: { day: number; type: string; caption: string; platform: string }[]; recapGenerated: boolean; recapText: string | null; eventDate: string | null; }

// ─── Severity badge helpers ───────────────────────────────────────────────────
function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-100 text-red-800 border-red-300",
    high: "bg-orange-100 text-orange-800 border-orange-300",
    medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
    low: "bg-blue-100 text-blue-800 border-blue-300",
  };
  return <Badge className={`text-xs ${map[severity] ?? "bg-gray-100 text-gray-700"}`}>{severity.toUpperCase()}</Badge>;
}

function SentimentBadge({ label }: { label: string }) {
  const map: Record<string, string> = {
    positive: "bg-emerald-100 text-emerald-700",
    neutral: "bg-gray-100 text-gray-600",
    negative: "bg-red-100 text-red-700",
  };
  return <Badge className={`text-xs ${map[label] ?? ""}`}>{label}</Badge>;
}

// ─── Config Selector ──────────────────────────────────────────────────────────
function useConfig() {
  const { data: configs = [], isLoading } = useQuery<IntelligenceConfig[]>({
    queryKey: ["intel-configs"],
    queryFn: () => apiFetch("/intelligence/configs"),
  });
  const [configId, setConfigId] = useState<number | null>(null);
  const activeId = configId ?? (configs[0]?.id ?? null);
  const activeConfig = configs.find(c => c.id === activeId) ?? null;
  return { configs, isLoading, activeId, activeConfig, setConfigId };
}

// ─── Political Map Tab ────────────────────────────────────────────────────────
function PoliticalMapTab({ configId }: { configId: number | null }) {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedLga, setSelectedLga] = useState<string | null>(null);
  const [lgaSearch, setLgaSearch] = useState("");

  const { data: lgaData = [] } = useQuery<LgaData[]>({
    queryKey: ["lga-data"],
    queryFn: () => apiFetch("/intelligence/lga-data"),
    staleTime: 5 * 60 * 1000,
  });

  // LGA-level records for the full explorer
  const { data: lgaRecords = [] } = useQuery<LgaRecord[]>({
    queryKey: ["lga-records"],
    queryFn: () => apiFetch("/intelligence/lga-data?granularity=lga"),
    staleTime: 5 * 60 * 1000,
  });

  // LGA records for the clicked state
  const { data: stateLgaRecords = [], isLoading: stateLgasLoading } = useQuery<LgaRecord[]>({
    queryKey: ["lga-state-records", selectedState],
    queryFn: () => apiFetch(`/intelligence/lga-data?state=${encodeURIComponent(selectedState!)}`),
    enabled: !!selectedState,
    staleTime: 5 * 60 * 1000,
  });

  const { data: wardData = [], isLoading: wardsLoading } = useQuery<WardData[]>({
    queryKey: ["ward-data", selectedState, selectedLga],
    queryFn: () => apiFetch(`/intelligence/lga-data/${encodeURIComponent(selectedState!)}/wards`),
    enabled: !!selectedState,
    staleTime: 5 * 60 * 1000,
  });

  const sorted = [...lgaData].sort((a, b) => b.engagementRate - a.engagementRate);
  const filteredLgas = lgaRecords.filter(r =>
    !lgaSearch || r.lga.toLowerCase().includes(lgaSearch.toLowerCase()) || r.state.toLowerCase().includes(lgaSearch.toLowerCase())
  );

  function heatColor(engagementRate: number) {
    if (engagementRate >= 6) return "bg-green-500 text-white";
    if (engagementRate >= 4) return "bg-green-300 text-green-900";
    if (engagementRate >= 2) return "bg-yellow-200 text-yellow-900";
    return "bg-red-100 text-red-800";
  }

  const selectedData = selectedState ? lgaData.find(d => d.state === selectedState) : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="w-4 h-4" /> Nigeria — all 36 states + FCT
        </div>
        <div className="flex gap-2 text-xs ml-auto">
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-500 inline-block" /> 6%+ engagement</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-300 inline-block" /> 4–6%</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-yellow-200 inline-block" /> 2–4%</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> &lt;2%</span>
        </div>
      </div>

      {/* State heat grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-1.5">
        {lgaData.map(d => (
          <button
            key={d.state}
            onClick={() => setSelectedState(d.state === selectedState ? null : d.state)}
            className={`rounded-md p-1.5 text-xs font-medium border-2 text-center transition-all cursor-pointer ${heatColor(d.engagementRate)} ${selectedState === d.state ? "ring-2 ring-offset-1 ring-primary border-primary" : "border-transparent hover:border-primary/50"}`}
            title={`${d.state}: ${d.engagementRate}% engagement, ${d.totalReach.toLocaleString()} reach`}
          >
            {d.state.length > 7 ? d.state.slice(0, 7) + "…" : d.state}
          </button>
        ))}
      </div>

      {/* State detail panel — LGA-level tiles + ward breakdown */}
      {selectedData && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-lg">{selectedData.state}</h3>
                <p className="text-sm text-muted-foreground">{selectedData.lgas} LGAs tracked · click an LGA for ward breakdown</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => { setSelectedState(null); setSelectedLga(null); }}>✕</Button>
            </div>

            {/* LGA-level heat tiles for this state */}
            {stateLgasLoading ? (
              <div className="text-sm text-muted-foreground py-3 text-center">Loading LGA data…</div>
            ) : stateLgaRecords.length > 0 ? (
              <div className="mb-4">
                <div className="text-xs font-semibold text-muted-foreground mb-2">LGA Performance — {selectedData.state}</div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
                  {stateLgaRecords.sort((a, b) => b.engagementRate - a.engagementRate).map(lga => (
                    <button
                      key={lga.lga}
                      onClick={() => setSelectedLga(lga.lga === selectedLga ? null : lga.lga)}
                      className={`rounded-md p-1.5 text-xs font-medium border-2 text-center transition-all ${heatColor(lga.engagementRate)} ${selectedLga === lga.lga ? "ring-2 ring-offset-1 ring-primary border-primary" : "border-transparent hover:border-primary/50"}`}
                      title={`${lga.lga}: ${lga.engagementRate}% engagement, ${lga.totalReach.toLocaleString()} reach`}
                    >
                      <div>{lga.lga.length > 10 ? lga.lga.slice(0, 10) + "…" : lga.lga}</div>
                      <div className="opacity-80 text-[10px]">{lga.engagementRate}%</div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {/* State aggregate metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-xs text-muted-foreground">Total Reach</div>
                <div className="font-bold text-lg">{selectedData.totalReach.toLocaleString()}</div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-xs text-muted-foreground">Avg Engagement</div>
                <div className="font-bold text-lg text-emerald-600">{selectedData.engagementRate}%</div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-xs text-muted-foreground">Avg Sentiment</div>
                <div className="font-bold text-lg">{(selectedData.sentimentScore * 100).toFixed(0)}%</div>
              </div>
              <div className="bg-white rounded-lg p-3 shadow-sm">
                <div className="text-xs text-muted-foreground">Top Content</div>
                <div className="font-bold text-lg">{selectedData.topContent}</div>
              </div>
            </div>

            {/* Ward-level breakdown (for selected LGA or state default) */}
            <div className="bg-white rounded-lg p-3 shadow-sm">
              <div className="text-xs font-semibold text-muted-foreground mb-2">
                Ward Breakdown — {selectedLga ?? selectedData.state}
              </div>
              {wardsLoading ? (
                <div className="text-sm text-muted-foreground py-4 text-center">Loading ward data…</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b text-muted-foreground">
                        <th className="text-left pb-1.5">Ward</th>
                        <th className="text-right pb-1.5">Reach</th>
                        <th className="text-right pb-1.5">Posts</th>
                        <th className="text-right pb-1.5">Eng.</th>
                        <th className="text-right pb-1.5">Sentiment</th>
                        <th className="text-right pb-1.5">Content</th>
                      </tr>
                    </thead>
                    <tbody>
                      {wardData.map((w, i) => (
                        <tr key={w.ward} className="border-b last:border-0">
                          <td className="py-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className="text-muted-foreground w-4">#{i + 1}</span>
                              <span className="font-medium">{w.ward}</span>
                            </div>
                          </td>
                          <td className="text-right">{(w.reach / 1000).toFixed(0)}K</td>
                          <td className="text-right">{w.postsPublished}</td>
                          <td className={`text-right font-medium ${w.engagementRate >= 6 ? "text-emerald-600" : w.engagementRate >= 3 ? "text-yellow-600" : "text-red-500"}`}>
                            {w.engagementRate}%
                          </td>
                          <td className="text-right">
                            <span className={`inline-block w-12 text-center rounded-full text-xs px-1.5 py-0.5 ${w.sentimentScore > 0.6 ? "bg-emerald-100 text-emerald-700" : w.sentimentScore < 0.4 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                              {(w.sentimentScore * 100).toFixed(0)}%
                            </span>
                          </td>
                          <td className="text-right text-muted-foreground">{w.topContent}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* LGA Explorer — all LGAs across Nigeria, searchable */}
      <Card>
        <CardHeader className="py-3 px-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold">LGA Explorer — {lgaRecords.length} Local Government Areas</CardTitle>
            <Input
              className="h-7 w-48 text-xs"
              placeholder="Search LGA or state…"
              value={lgaSearch}
              onChange={e => setLgaSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-left pb-1.5">LGA</th>
                  <th className="text-left pb-1.5">State</th>
                  <th className="text-right pb-1.5">Reach</th>
                  <th className="text-right pb-1.5">Eng.</th>
                  <th className="text-right pb-1.5">Sentiment</th>
                  <th className="text-right pb-1.5">Top Content</th>
                </tr>
              </thead>
              <tbody>
                {filteredLgas.sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 20).map(r => (
                  <tr
                    key={`${r.state}-${r.lga}`}
                    className="border-b hover:bg-muted/30 cursor-pointer"
                    onClick={() => { setSelectedState(r.state); setSelectedLga(r.lga); }}
                  >
                    <td className="py-1.5 font-medium">{r.lga}</td>
                    <td className="text-muted-foreground">{r.state}</td>
                    <td className="text-right">{(r.totalReach / 1000).toFixed(0)}K</td>
                    <td className={`text-right font-medium ${r.engagementRate >= 6 ? "text-emerald-600" : r.engagementRate >= 3 ? "text-yellow-600" : "text-red-500"}`}>
                      {r.engagementRate}%
                    </td>
                    <td className="text-right">
                      <span className={`inline-block w-10 text-center rounded-full px-1 py-0.5 ${r.sentimentScore > 0.6 ? "bg-emerald-100 text-emerald-700" : r.sentimentScore < 0.4 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                        {(r.sentimentScore * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="text-right text-muted-foreground">{r.topContent}</td>
                  </tr>
                ))}
                {filteredLgas.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No LGAs match your search.</td></tr>
                )}
              </tbody>
            </table>
            {filteredLgas.length > 20 && (
              <div className="text-xs text-muted-foreground pt-2 text-center">Showing top 20 of {filteredLgas.length} matching LGAs — refine your search to narrow.</div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Top 10 states table */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-semibold">Top States by Engagement</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <div className="space-y-2">
            {sorted.slice(0, 10).map((d, i) => (
              <div key={d.state} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-muted-foreground text-xs">#{i + 1}</span>
                <span className="w-28 font-medium">{d.state}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(d.engagementRate / 8.5) * 100}%` }} />
                </div>
                <span className="w-12 text-right font-medium text-emerald-700">{d.engagementRate}%</span>
                <span className="w-20 text-right text-muted-foreground text-xs">{(d.totalReach / 1000).toFixed(0)}K reach</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Sentiment Tracker Tab ─────────────────────────────────────────────────────
function SentimentTrackerTab({ configId }: { configId: number | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [analyseOpen, setAnalyseOpen] = useState(false);
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null);
  const [form, setForm] = useState({ keyword: "", type: "hashtag", platform: "all" });
  const [analyseForm, setAnalyseForm] = useState({ keyword: "", sampleText: "", platform: "all" });

  const { data: monitors = [] } = useQuery<SentimentMonitor[]>({
    queryKey: ["sentiment-monitors"],
    queryFn: () => apiFetch("/intelligence/sentiment-monitors"),
  });

  const { data: events = [] } = useQuery<SentimentEvent[]>({
    queryKey: ["sentiment-events", selectedMonitorId],
    queryFn: () => apiFetch(`/intelligence/sentiment-events${selectedMonitorId ? `?monitorId=${selectedMonitorId}` : ""}`),
    staleTime: 60000,
  });

  const addMonitor = useMutation({
    mutationFn: (body: object) => apiFetch("/intelligence/sentiment-monitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sentiment-monitors"] }); setAddOpen(false); toast({ title: "Monitor added" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMonitor = useMutation({
    mutationFn: (id: number) => apiFetch(`/intelligence/sentiment-monitors/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sentiment-monitors"] }),
  });

  const analyseText = useMutation({
    mutationFn: (body: object) => apiFetch("/intelligence/sentiment-events/analyse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["sentiment-events"] }); setAnalyseOpen(false); toast({ title: "Analysis complete" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // Group events by date for trend chart
  const trendData = Array.from(
    events.reduce((acc, e) => {
      const day = e.occurredAt.slice(0, 10);
      const prev = acc.get(day) ?? { date: day, score: 0, count: 0 };
      acc.set(day, { date: day, score: prev.score + Number(e.sentimentScore), count: prev.count + 1 });
      return acc;
    }, new Map<string, { date: string; score: number; count: number }>()),
  ).map(([, v]) => ({ date: v.date.slice(5), avg: +(v.score / v.count).toFixed(3) }))
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30);

  const recentEvents = events.slice(0, 20);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant={selectedMonitorId === null ? "default" : "outline"}
            onClick={() => setSelectedMonitorId(null)}
          >All</Button>
          {monitors.map(m => (
            <Button key={m.id} size="sm" variant={selectedMonitorId === m.id ? "default" : "outline"}
              onClick={() => setSelectedMonitorId(m.id)}>
              {m.keyword}
            </Button>
          ))}
        </div>
        <div className="flex gap-2">
          <Dialog open={analyseOpen} onOpenChange={setAnalyseOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline"><Zap className="w-3 h-3 mr-1" /> AI Analyse</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Analyse Text with Claude</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Keyword / Topic</Label>
                  <Input value={analyseForm.keyword} onChange={e => setAnalyseForm(p => ({ ...p, keyword: e.target.value }))} placeholder="#KOH2027" /></div>
                <div><Label>Sample Text</Label>
                  <Textarea value={analyseForm.sampleText} onChange={e => setAnalyseForm(p => ({ ...p, sampleText: e.target.value }))} placeholder="Paste a social post, comment, or news snippet..." rows={4} /></div>
                <div><Label>Platform</Label>
                  <Select value={analyseForm.platform} onValueChange={v => setAnalyseForm(p => ({ ...p, platform: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["all", "twitter", "instagram", "facebook", "tiktok"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
                <Button onClick={() => analyseText.mutate({ ...analyseForm, monitorId: selectedMonitorId ?? undefined })} disabled={analyseText.isPending} className="w-full">
                  {analyseText.isPending ? "Analysing with Claude..." : "Run Analysis"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="w-3 h-3 mr-1" /> Add Monitor</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Sentiment Monitor</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Keyword / Hashtag</Label>
                  <Input value={form.keyword} onChange={e => setForm(p => ({ ...p, keyword: e.target.value }))} placeholder="#CharlyBoy" /></div>
                <div><Label>Type</Label>
                  <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["hashtag", "keyword", "handle"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
                <div><Label>Platform</Label>
                  <Select value={form.platform} onValueChange={v => setForm(p => ({ ...p, platform: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["all", "twitter", "instagram", "tiktok", "facebook"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
                <Button onClick={() => addMonitor.mutate({ ...form, configId: configId })} disabled={addMonitor.isPending || !configId} className="w-full">
                  {addMonitor.isPending ? "Adding..." : "Add Monitor"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Trend chart */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-semibold">30-Day Sentiment Trend</CardTitle>
          </CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 1]} tick={{ fontSize: 10 }} tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
                <Tooltip formatter={(v: number) => [`${(v * 100).toFixed(1)}%`, "Sentiment"]} />
                <Line type="monotone" dataKey="avg" stroke="#10b981" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Event feed */}
      <div className="space-y-2">
        {recentEvents.map(e => (
          <Card key={e.id} className={`border-l-4 ${e.sentimentLabel === "negative" ? "border-l-red-400" : e.sentimentLabel === "positive" ? "border-l-emerald-400" : "border-l-gray-300"}`}>
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm truncate">{e.keyword}</span>
                    <SentimentBadge label={e.sentimentLabel} />
                    <Badge variant="outline" className="text-xs">{e.platform}</Badge>
                  </div>
                  {e.aiAnalysis && <p className="text-xs text-muted-foreground">{e.aiAnalysis}</p>}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-bold">{(Number(e.sentimentScore) * 100).toFixed(0)}%</div>
                  <div className="text-xs text-muted-foreground">{new Date(e.occurredAt).toLocaleDateString()}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {recentEvents.length === 0 && (
          <div className="text-center text-muted-foreground py-10">No sentiment events yet. Add a monitor and run AI analysis to start tracking.</div>
        )}
      </div>

      {/* Monitor list */}
      {monitors.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4"><CardTitle className="text-sm font-semibold">Active Monitors</CardTitle></CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {monitors.map(m => (
                <div key={m.id} className="flex items-center justify-between gap-2 py-1.5 border-b last:border-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{m.type}</Badge>
                    <span className="font-medium text-sm">{m.keyword}</span>
                    <span className="text-xs text-muted-foreground">{m.platform}</span>
                  </div>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" onClick={() => deleteMonitor.mutate(m.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Competitor Monitor Tab ───────────────────────────────────────────────────
function CompetitorMonitorTab({ configId }: { configId: number | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [snapOpen, setSnapOpen] = useState(false);
  const [selectedCompetitorId, setSelectedCompetitorId] = useState<number | null>(null);
  const [form, setForm] = useState({ handle: "", platform: "instagram", displayName: "", category: "general" });
  const [snapForm, setSnapForm] = useState({ followerCount: "", postsPerWeek: "", avgEngagementRate: "", topPostCaption: "" });

  // Load all competitors with their latest snapshot (for the comparison table)
  const { data: competitorsWithSnaps = [] } = useQuery<CompetitorWithSnapshot[]>({
    queryKey: ["competitors-with-snaps", configId],
    queryFn: () => configId ? apiFetch(`/intelligence/competitors/latest-snapshots?configId=${configId}`) : Promise.resolve([]),
    enabled: !!configId,
  });

  const competitors = competitorsWithSnaps as Competitor[];

  // Also load history snapshots for the selected competitor detail panel
  const { data: snapshots = [] } = useQuery<CompetitorSnapshot[]>({
    queryKey: ["competitor-snapshots", selectedCompetitorId],
    queryFn: () => apiFetch(`/intelligence/competitors/${selectedCompetitorId}/snapshots`),
    enabled: !!selectedCompetitorId,
  });

  const addCompetitor = useMutation({
    mutationFn: (body: object) => apiFetch("/intelligence/competitors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["competitors-with-snaps"] }); setAddOpen(false); toast({ title: "Competitor added" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addSnapshot = useMutation({
    mutationFn: (body: object) => apiFetch(`/intelligence/competitors/${selectedCompetitorId}/snapshots`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["competitor-snapshots"] }); qc.invalidateQueries({ queryKey: ["competitors-with-snaps"] }); setSnapOpen(false); toast({ title: "Snapshot saved" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteCompetitor = useMutation({
    mutationFn: (id: number) => apiFetch(`/intelligence/competitors/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["competitors-with-snaps"] }); if (selectedCompetitorId) setSelectedCompetitorId(null); },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Track up to 10 competitor accounts. Enter snapshots manually or connect live API.</p>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-3 h-3 mr-1" /> Add Competitor</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add Competitor Account</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Handle</Label><Input value={form.handle} onChange={e => setForm(p => ({ ...p, handle: e.target.value }))} placeholder="@handle" /></div>
              <div><Label>Display Name</Label><Input value={form.displayName} onChange={e => setForm(p => ({ ...p, displayName: e.target.value }))} placeholder="Competitor Name" /></div>
              <div><Label>Platform</Label>
                <Select value={form.platform} onValueChange={v => setForm(p => ({ ...p, platform: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["instagram", "twitter", "tiktok", "youtube", "facebook"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["general", "political", "music", "brand", "media"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select></div>
              <Button onClick={() => addCompetitor.mutate({ ...form, configId })} disabled={addCompetitor.isPending || !configId} className="w-full">
                {addCompetitor.isPending ? "Adding..." : "Add"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Comparison table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-xs">
              <th className="text-left pb-2">Account</th>
              <th className="text-right pb-2">Followers</th>
              <th className="text-right pb-2">Posts/wk</th>
              <th className="text-right pb-2">Avg Eng.</th>
              <th className="text-right pb-2">Top Post Eng.</th>
              <th className="text-right pb-2">Growth</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {competitorsWithSnaps.map(c => {
              const snap = c.latestSnapshot;
              return (
                <tr key={c.id} className={`border-b hover:bg-muted/30 cursor-pointer ${selectedCompetitorId === c.id ? "bg-muted/40" : ""}`}
                  onClick={() => setSelectedCompetitorId(c.id === selectedCompetitorId ? null : c.id)}>
                  <td className="py-2">
                    <div className="font-medium">{c.handle}</div>
                    <div className="text-xs text-muted-foreground">{c.platform} · {c.category}</div>
                  </td>
                  <td className="text-right">{snap ? snap.followerCount.toLocaleString() : "—"}</td>
                  <td className="text-right">{snap ? snap.postsPerWeek : "—"}</td>
                  <td className="text-right">{snap ? `${(Number(snap.avgEngagementRate) * 100).toFixed(2)}%` : "—"}</td>
                  <td className="text-right">{snap ? snap.topPostEngagement.toLocaleString() : "—"}</td>
                  <td className="text-right">
                    {c.followerDelta !== null ? (
                      <span className={`font-medium text-xs ${c.followerDelta > 0 ? "text-emerald-600" : c.followerDelta < 0 ? "text-red-500" : "text-muted-foreground"}`}>
                        {c.followerDelta > 0 ? "+" : ""}{c.followerDelta.toLocaleString()}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="text-right">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); deleteCompetitor.mutate(c.id); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {competitors.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No competitors tracked yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Snapshot panel */}
      {selectedCompetitorId !== null && (
        <Card className="border-primary/30">
          <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              {competitors.find(c => c.id === selectedCompetitorId)?.handle} — Snapshots
            </CardTitle>
            <Dialog open={snapOpen} onOpenChange={setSnapOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><Plus className="w-3 h-3 mr-1" /> Log Snapshot</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Log Competitor Snapshot</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label>Followers</Label><Input type="number" value={snapForm.followerCount} onChange={e => setSnapForm(p => ({ ...p, followerCount: e.target.value }))} /></div>
                  <div><Label>Posts/week</Label><Input type="number" step="0.1" value={snapForm.postsPerWeek} onChange={e => setSnapForm(p => ({ ...p, postsPerWeek: e.target.value }))} /></div>
                  <div><Label>Avg Engagement Rate (decimal, e.g. 0.04)</Label><Input type="number" step="0.001" value={snapForm.avgEngagementRate} onChange={e => setSnapForm(p => ({ ...p, avgEngagementRate: e.target.value }))} /></div>
                  <div><Label>Top Post Caption</Label><Textarea value={snapForm.topPostCaption} onChange={e => setSnapForm(p => ({ ...p, topPostCaption: e.target.value }))} rows={2} /></div>
                  <Button onClick={() => addSnapshot.mutate(snapForm)} disabled={addSnapshot.isPending} className="w-full">
                    {addSnapshot.isPending ? "Saving..." : "Save Snapshot"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="space-y-2">
              {snapshots.map(s => (
                <div key={s.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                  <div>
                    <div className="text-xs text-muted-foreground">{new Date(s.snapshotDate).toLocaleDateString()}</div>
                    {s.topPostCaption && <div className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{s.topPostCaption}</div>}
                  </div>
                  <div className="flex gap-4 text-right">
                    <div><div className="text-xs text-muted-foreground">Followers</div><div className="font-medium">{s.followerCount.toLocaleString()}</div></div>
                    <div><div className="text-xs text-muted-foreground">Eng.</div><div className="font-medium">{(Number(s.avgEngagementRate) * 100).toFixed(2)}%</div></div>
                  </div>
                </div>
              ))}
              {snapshots.length === 0 && <div className="text-center text-muted-foreground py-6 text-sm">No snapshots logged yet.</div>}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Crisis Alerts Tab ────────────────────────────────────────────────────────
function CrisisAlertsTab({ configId }: { configId: number | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [form, setForm] = useState({ type: "engagement_drop", severity: "high", title: "", description: "", triggeredValue: "", thresholdValue: "", platform: "" });

  const { data: alerts = [] } = useQuery<CrisisAlert[]>({
    queryKey: ["crisis-alerts", showAll],
    queryFn: () => apiFetch(`/intelligence/crisis-alerts${!showAll ? "?acknowledged=false" : ""}`),
  });

  const acknowledge = useMutation({
    mutationFn: (id: number) => apiFetch(`/intelligence/crisis-alerts/${id}/acknowledge`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crisis-alerts"] }); toast({ title: "Alert acknowledged" }); },
  });

  const createAlert = useMutation({
    mutationFn: (body: object) => apiFetch("/intelligence/crisis-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["crisis-alerts"] }); setAddOpen(false); toast({ title: "Alert created" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const unacknowledged = alerts.filter(a => !a.acknowledged).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {unacknowledged > 0 && <Badge className="bg-red-500 text-white">{unacknowledged} active</Badge>}
          <Button size="sm" variant={showAll ? "default" : "outline"} onClick={() => setShowAll(!showAll)}>
            {showAll ? "All alerts" : "Unacknowledged only"}
          </Button>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline"><Plus className="w-3 h-3 mr-1" /> Manual Alert</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Log Crisis Alert</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Alert Type</Label>
                <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["engagement_drop", "follower_loss", "negative_sentiment", "competitor_surge"].map(t => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select></div>
              <div><Label>Severity</Label>
                <Select value={form.severity} onValueChange={v => setForm(p => ({ ...p, severity: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["low", "medium", "high", "critical"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label>Title</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} rows={3} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Triggered Value (%)</Label><Input type="number" value={form.triggeredValue} onChange={e => setForm(p => ({ ...p, triggeredValue: e.target.value }))} /></div>
                <div><Label>Threshold (%)</Label><Input type="number" value={form.thresholdValue} onChange={e => setForm(p => ({ ...p, thresholdValue: e.target.value }))} /></div>
              </div>
              <div><Label>Platform</Label><Input value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))} placeholder="instagram" /></div>
              <Button onClick={() => createAlert.mutate({ ...form, configId })} disabled={createAlert.isPending || !configId} className="w-full">
                {createAlert.isPending ? "Logging..." : "Log Alert"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {alerts.map(a => (
          <Card key={a.id} className={`border-l-4 ${a.severity === "critical" ? "border-l-red-500" : a.severity === "high" ? "border-l-orange-500" : a.severity === "medium" ? "border-l-yellow-500" : "border-l-blue-400"} ${a.acknowledged ? "opacity-60" : ""}`}>
            <CardContent className="py-3 px-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <SeverityBadge severity={a.severity} />
                    <Badge variant="outline" className="text-xs">{a.type.replace(/_/g, " ")}</Badge>
                    {a.platform && <Badge variant="outline" className="text-xs">{a.platform}</Badge>}
                    {a.acknowledged && <Badge className="text-xs bg-gray-100 text-gray-500">Acknowledged</Badge>}
                  </div>
                  <div className="font-semibold text-sm mb-1">{a.title}</div>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                  {a.triggeredValue && <div className="text-xs mt-1 text-orange-700">Triggered: {a.triggeredValue}% (threshold: {a.thresholdValue}%)</div>}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <div className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString()}</div>
                  {!a.acknowledged && (
                    <Button size="sm" variant="outline" onClick={() => acknowledge.mutate(a.id)} disabled={acknowledge.isPending}>
                      <CheckCircle className="w-3 h-3 mr-1" /> Acknowledge
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {alerts.length === 0 && (
          <div className="text-center text-muted-foreground py-12">No active crisis alerts — all clear.</div>
        )}
      </div>
    </div>
  );
}

// ─── ROI Attribution Tab ──────────────────────────────────────────────────────
function RoiAttributionTab({ configId }: { configId: number | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ contentAction: "post_published", contentRef: "", outcomeType: "signup", outcomeCount: "", estimatedRevenueNgn: "", manualTag: "", platform: "", utmCampaign: "" });

  const { data: events = [] } = useQuery<RoiEvent[]>({
    queryKey: ["roi-attributions", configId],
    queryFn: () => apiFetch(`/intelligence/roi-attributions${configId ? `?configId=${configId}` : ""}`),
  });

  const addEvent = useMutation({
    mutationFn: (body: object) => apiFetch("/intelligence/roi-attributions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["roi-attributions"] }); setAddOpen(false); toast({ title: "Attribution event logged" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const totalOutcomes = events.reduce((s, e) => s + e.outcomeCount, 0);
  const totalRevenue = events.reduce((s, e) => s + Number(e.estimatedRevenueNgn), 0);

  const byAction = Array.from(
    events.reduce((acc, e) => {
      const key = e.contentAction;
      acc.set(key, (acc.get(key) ?? 0) + e.outcomeCount);
      return acc;
    }, new Map<string, number>()),
  ).map(([action, count]) => ({ action: action.replace(/_/g, " "), count }));

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-xs text-muted-foreground">Total Outcomes</div>
          <div className="text-2xl font-bold">{totalOutcomes.toLocaleString()}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-xs text-muted-foreground">Attributed Events</div>
          <div className="text-2xl font-bold">{events.length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-xs text-muted-foreground">Est. Revenue (₦)</div>
          <div className="text-2xl font-bold">{totalRevenue > 0 ? `₦${totalRevenue.toLocaleString()}` : "—"}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-4 pb-3">
          <div className="text-xs text-muted-foreground">Avg Outcomes/Event</div>
          <div className="text-2xl font-bold">{events.length > 0 ? (totalOutcomes / events.length).toFixed(1) : "—"}</div>
        </CardContent></Card>
      </div>

      {/* Chart */}
      {byAction.length > 0 && (
        <Card>
          <CardHeader className="py-3 px-4"><CardTitle className="text-sm font-semibold">Outcomes by Content Action</CardTitle></CardHeader>
          <CardContent className="px-2 pb-4">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={byAction}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="action" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#10b981" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Log button */}
      <div className="flex justify-end">
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-3 h-3 mr-1" /> Log Attribution</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Log Attribution Event</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Content Action</Label>
                <Select value={form.contentAction} onValueChange={v => setForm(p => ({ ...p, contentAction: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["post_published", "live_session", "campaign_burst", "story", "reel"].map(a => <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label>Content Reference</Label><Input value={form.contentRef} onChange={e => setForm(p => ({ ...p, contentRef: e.target.value }))} placeholder="Post ID, session name, etc." /></div>
              <div><Label>Outcome Type</Label>
                <Select value={form.outcomeType} onValueChange={v => setForm(p => ({ ...p, outcomeType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["download", "purchase", "signup", "form_fill", "click", "lead"].map(o => <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
                </Select></div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Outcome Count</Label><Input type="number" value={form.outcomeCount} onChange={e => setForm(p => ({ ...p, outcomeCount: e.target.value }))} /></div>
                <div><Label>Est. Revenue (₦)</Label><Input type="number" value={form.estimatedRevenueNgn} onChange={e => setForm(p => ({ ...p, estimatedRevenueNgn: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Platform</Label><Input value={form.platform} onChange={e => setForm(p => ({ ...p, platform: e.target.value }))} placeholder="instagram" /></div>
                <div><Label>Manual Tag</Label><Input value={form.manualTag} onChange={e => setForm(p => ({ ...p, manualTag: e.target.value }))} placeholder="campaign-name" /></div>
              </div>
              <div><Label>UTM Campaign</Label><Input value={form.utmCampaign} onChange={e => setForm(p => ({ ...p, utmCampaign: e.target.value }))} /></div>
              <Button onClick={() => addEvent.mutate({ ...form, outcomeCount: Number(form.outcomeCount) || 1, configId })} disabled={addEvent.isPending || !configId} className="w-full">
                {addEvent.isPending ? "Logging..." : "Log Event"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground text-xs">
              <th className="text-left pb-2">Content Action</th>
              <th className="text-left pb-2">Content Ref</th>
              <th className="text-right pb-2">Outcome</th>
              <th className="text-right pb-2">Count</th>
              <th className="text-right pb-2">Revenue ₦</th>
              <th className="text-right pb-2">Date</th>
            </tr>
          </thead>
          <tbody>
            {events.map(e => (
              <tr key={e.id} className="border-b">
                <td className="py-2"><Badge variant="outline" className="text-xs">{e.contentAction.replace(/_/g, " ")}</Badge></td>
                <td className="py-2 text-xs text-muted-foreground max-w-[120px] truncate">{e.contentRef ?? e.manualTag ?? "—"}</td>
                <td className="py-2 text-right text-xs">{e.outcomeType.replace(/_/g, " ")}</td>
                <td className="py-2 text-right font-medium">{e.outcomeCount.toLocaleString()}</td>
                <td className="py-2 text-right">{Number(e.estimatedRevenueNgn) > 0 ? `₦${Number(e.estimatedRevenueNgn).toLocaleString()}` : "—"}</td>
                <td className="py-2 text-right text-xs text-muted-foreground">{new Date(e.occurredAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No attribution events yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── AFRIMA Event Mode Tab ────────────────────────────────────────────────────
function EventModeTab({ configId }: { configId: number | null }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ eventName: "", eventDate: "", hashtags: "", hypeSeriesDays: "30" });

  const { data: events = [] } = useQuery<EventMode[]>({
    queryKey: ["event-modes", configId],
    queryFn: () => apiFetch(`/intelligence/event-modes${configId ? `?configId=${configId}` : ""}`),
  });

  const createEvent = useMutation({
    mutationFn: (body: object) => apiFetch("/intelligence/event-modes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["event-modes"] }); setCreateOpen(false); toast({ title: "Event mode created" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const generateSchedule = useMutation({
    mutationFn: (id: number) => apiFetch(`/intelligence/event-modes/${id}/generate-hype-schedule`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["event-modes"] }); toast({ title: "Hype schedule generated" }); },
  });

  const generateRecap = useMutation({
    mutationFn: (id: number) => apiFetch(`/intelligence/event-modes/${id}/generate-recap`, { method: "POST" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["event-modes"] }); toast({ title: "Recap generated with Claude AI" }); },
  });

  const updateVotes = useMutation({
    mutationFn: ({ id, totalVoteCount }: { id: number; totalVoteCount: number }) =>
      apiFetch(`/intelligence/event-modes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ totalVoteCount }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["event-modes"] }),
  });

  const [voteInputs, setVoteInputs] = useState<Record<number, string>>({});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">AFRIMA-level awards event management — hype builder, vote tracker, and Claude-powered recap.</p>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-3 h-3 mr-1" /> New Event</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Event Mode</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label>Event Name</Label><Input value={form.eventName} onChange={e => setForm(p => ({ ...p, eventName: e.target.value }))} placeholder="AFRIMA 2027" /></div>
              <div><Label>Event Date</Label><Input type="datetime-local" value={form.eventDate} onChange={e => setForm(p => ({ ...p, eventDate: e.target.value }))} /></div>
              <div><Label>Hashtags (comma-separated)</Label><Input value={form.hashtags} onChange={e => setForm(p => ({ ...p, hashtags: e.target.value }))} placeholder="#AFRIMA2027, #CharlyBoy" /></div>
              <div><Label>Hype Series Days</Label><Input type="number" value={form.hypeSeriesDays} onChange={e => setForm(p => ({ ...p, hypeSeriesDays: e.target.value }))} /></div>
              <Button onClick={() => createEvent.mutate({ ...form, hashtags: form.hashtags.split(",").map(h => h.trim()).filter(Boolean), configId, hypeSeriesDays: Number(form.hypeSeriesDays) })} disabled={createEvent.isPending || !configId} className="w-full">
                {createEvent.isPending ? "Creating..." : "Create Event"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {events.map(ev => (
        <Card key={ev.id} className="overflow-hidden">
          <CardHeader className="py-3 px-4 bg-gradient-to-r from-purple-50 to-amber-50">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" /> {ev.eventName}
                </CardTitle>
                {ev.eventDate && <div className="text-xs text-muted-foreground mt-0.5">{new Date(ev.eventDate).toLocaleDateString("en-NG", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>}
              </div>
              <Badge className={`text-xs ${ev.phase === "live" ? "bg-red-500 text-white" : ev.phase === "post" ? "bg-gray-500 text-white" : "bg-purple-100 text-purple-700"}`}>
                {ev.phase === "live" ? "🔴 LIVE" : ev.phase === "post" ? "✅ Post-Show" : "📅 Pre-Event"}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-4 px-4 pb-4 space-y-4">
            {/* Hashtags */}
            <div className="flex flex-wrap gap-1.5">
              {ev.hashtags.map(h => <Badge key={h} variant="outline" className="text-xs">{h}</Badge>)}
            </div>

            {/* Vote count tracker */}
            <div className="flex items-center gap-3 bg-amber-50 rounded-lg p-3">
              <div className="flex-1">
                <div className="text-xs text-muted-foreground mb-0.5">Total Votes Tracked</div>
                <div className="text-3xl font-black text-amber-600">{ev.totalVoteCount.toLocaleString()}</div>
              </div>
              <div className="flex gap-2">
                <Input
                  className="w-28"
                  type="number"
                  placeholder="Update count"
                  value={voteInputs[ev.id] ?? ""}
                  onChange={e => setVoteInputs(p => ({ ...p, [ev.id]: e.target.value }))}
                />
                <Button size="sm" onClick={() => { updateVotes.mutate({ id: ev.id, totalVoteCount: Number(voteInputs[ev.id]) || 0 }); setVoteInputs(p => ({ ...p, [ev.id]: "" })); }}>
                  Update
                </Button>
              </div>
            </div>

            {/* Voting links */}
            {ev.votingLinks.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-1.5">Voting Links</div>
                <div className="flex flex-wrap gap-2">
                  {ev.votingLinks.map((l, i) => (
                    <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">{l.label}</a>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => generateSchedule.mutate(ev.id)} disabled={generateSchedule.isPending}>
                <Calendar className="w-3 h-3 mr-1" /> {generateSchedule.isPending ? "Generating..." : "Generate Hype Schedule"}
              </Button>
              <Button size="sm" variant="outline" onClick={() => generateRecap.mutate(ev.id)} disabled={generateRecap.isPending}>
                <Zap className="w-3 h-3 mr-1 text-purple-500" /> {generateRecap.isPending ? "Claude writing..." : "Generate Recap"}
              </Button>
            </div>

            {/* Content schedule preview */}
            {ev.contentSchedule.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2">30-Day Hype Schedule ({ev.contentSchedule.length} posts)</div>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {ev.contentSchedule.slice(0, 8).map(s => (
                    <div key={s.day} className="flex items-center gap-2 text-xs border rounded p-1.5">
                      <Badge variant="outline" className="text-xs shrink-0">Day {s.day}</Badge>
                      <Badge variant="outline" className="text-xs shrink-0">{s.platform}</Badge>
                      <span className="text-muted-foreground truncate">{s.type.replace(/_/g, " ")} — {s.caption}</span>
                    </div>
                  ))}
                  {ev.contentSchedule.length > 8 && <div className="text-xs text-muted-foreground pl-1">+{ev.contentSchedule.length - 8} more posts…</div>}
                </div>
              </div>
            )}

            {/* Recap */}
            {ev.recapText && (
              <div className="rounded-lg border border-purple-200 bg-purple-50/50 p-3">
                <div className="text-xs font-semibold text-purple-700 mb-2">✨ Claude-Generated Recap</div>
                <pre className="text-xs text-purple-900 whitespace-pre-wrap font-sans">{ev.recapText}</pre>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
      {events.length === 0 && (
        <div className="text-center text-muted-foreground py-12">No event modes configured yet. Create one to start building hype.</div>
      )}
    </div>
  );
}

// ─── Main Intelligence Page ───────────────────────────────────────────────────
export function IntelligencePage() {
  const { configs, isLoading, activeId, activeConfig, setConfigId } = useConfig();

  return (
    <AppShell title="Campaign Intelligence">
      <TierGuard moduleKey="campaignIntelligence" requiredTier="enterprise" moduleName="Campaign Intelligence">
        <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <h1 className="text-2xl font-black flex items-center gap-2">
                <span className="text-2xl">📊</span> Campaign Intelligence
                <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300 font-semibold">Enterprise</Badge>
              </h1>
              <p className="text-muted-foreground text-sm mt-1">Political campaign mode · Sentiment tracking · Competitor monitoring · ROI attribution · AFRIMA event mode</p>
            </div>
            {/* Config selector */}
            {configs.length > 0 && (
              <Select value={String(activeId ?? "")} onValueChange={v => setConfigId(Number(v))}>
                <SelectTrigger className="w-52">
                  <SelectValue placeholder="Select config" />
                </SelectTrigger>
                <SelectContent>
                  {configs.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Config badge */}
          {activeConfig && (
            <div className="flex items-center gap-2 text-sm flex-wrap">
              <Badge variant="outline">{activeConfig.mode}</Badge>
              {activeConfig.politicalCandidateName && <Badge variant="outline" className="bg-blue-50 border-blue-200 text-blue-700">{activeConfig.politicalCandidateName}</Badge>}
              {activeConfig.politicalParty && <Badge variant="outline">{activeConfig.politicalParty}</Badge>}
              {activeConfig.targetStates.slice(0, 4).map(s => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
              {activeConfig.targetStates.length > 4 && <Badge variant="outline" className="text-xs">+{activeConfig.targetStates.length - 4} states</Badge>}
            </div>
          )}

          {isLoading ? (
            <div className="text-center text-muted-foreground py-16">Loading intelligence data…</div>
          ) : (
            <Tabs defaultValue="map" className="space-y-4">
              <TabsList className="flex flex-wrap h-auto gap-1">
                <TabsTrigger value="map"><MapPin className="w-3 h-3 mr-1" />Political Map</TabsTrigger>
                <TabsTrigger value="sentiment"><TrendingUp className="w-3 h-3 mr-1" />Sentiment</TabsTrigger>
                <TabsTrigger value="competitors"><Eye className="w-3 h-3 mr-1" />Competitors</TabsTrigger>
                <TabsTrigger value="crisis"><AlertTriangle className="w-3 h-3 mr-1" />Crisis Alerts</TabsTrigger>
                <TabsTrigger value="roi"><BarChart3 className="w-3 h-3 mr-1" />ROI Attribution</TabsTrigger>
                <TabsTrigger value="events"><Trophy className="w-3 h-3 mr-1" />AFRIMA Mode</TabsTrigger>
              </TabsList>

              <TabsContent value="map"><PoliticalMapTab configId={activeId} /></TabsContent>
              <TabsContent value="sentiment"><SentimentTrackerTab configId={activeId} /></TabsContent>
              <TabsContent value="competitors"><CompetitorMonitorTab configId={activeId} /></TabsContent>
              <TabsContent value="crisis"><CrisisAlertsTab configId={activeId} /></TabsContent>
              <TabsContent value="roi"><RoiAttributionTab configId={activeId} /></TabsContent>
              <TabsContent value="events"><EventModeTab configId={activeId} /></TabsContent>
            </Tabs>
          )}
        </div>
      </TierGuard>
    </AppShell>
  );
}
