import { useState } from "react";
import { useUser } from "@clerk/react";
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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line,
} from "recharts";
import {
  Users, Trophy, CheckSquare, Star, MessageCircle, Zap, Download, Plus,
  MapPin, Phone, Mail, Send, Copy, ChevronRight, Search, Filter, X, FileText,
} from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", ...opts });
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return null;
  const ct = r.headers.get("content-type") ?? "";
  if (ct.includes("text/csv")) return r.text();
  return r.json();
}

const ZONES = ["South West", "South East", "South South", "North West", "North East", "North Central"];
const ZONE_COLORS: Record<string, string> = {
  "South West": "bg-emerald-500",
  "South East": "bg-blue-500",
  "South South": "bg-cyan-500",
  "North West": "bg-orange-500",
  "North East": "bg-red-500",
  "North Central": "bg-purple-500",
};
const ZONE_LIGHT: Record<string, string> = {
  "South West": "bg-emerald-50 border-emerald-200",
  "South East": "bg-blue-50 border-blue-200",
  "South South": "bg-cyan-50 border-cyan-200",
  "North West": "bg-orange-50 border-orange-200",
  "North East": "bg-red-50 border-red-200",
  "North Central": "bg-purple-50 border-purple-200",
};

const TIER_BADGE: Record<string, string> = {
  gold: "bg-yellow-100 text-yellow-800 border-yellow-300",
  silver: "bg-gray-100 text-gray-700 border-gray-300",
  bronze: "bg-amber-100 text-amber-800 border-amber-300",
  member: "bg-slate-100 text-slate-600 border-slate-300",
};

const NICHES = ["music", "fashion", "lifestyle", "politics", "comedy", "sports", "beauty", "food", "tech", "culture"];
const PLATFORMS = ["instagram", "tiktok", "x", "youtube"];

type Ambassador = {
  id: number; name: string; email: string; phone?: string; state: string; zone: string;
  city?: string; tier: string; status: string; avatarInitials?: string; platform?: string;
  handle?: string; followerCount: number; totalPoints: number; tasksCompleted: number;
  referrals: number; rank?: number; bio?: string; portalToken?: string; joinedAt: string; createdAt: string;
};
type AmbassadorTask = {
  id: number; title: string; description?: string; deadline?: string; targetGroup: string;
  targetStates: string[]; pointReward: number; status: string; totalAssigned: number;
  completedCount: number; createdAt: string;
};
type GamificationConfig = {
  id: number; actionKey: string; label: string; description?: string; pointValue: number; active: boolean;
};
type RewardTier = { id: number; name: string; minPoints: number; maxPoints?: number; badgeColor: string; rewardDescription?: string; };
type MicroInfluencer = {
  id: number; name: string; handle: string; platform: string; state: string; zone?: string;
  niche: string; followerCount: number; engagementRate: string; contactEmail?: string;
  contactPhone?: string; status: string; notes?: string;
};
type WhatsappBroadcast = {
  id: number; listName: string; message: string; sentCount: number; deliveryCount: number;
  linkClicks: number; responseCount: number; broadcastDate: string; notes?: string;
};

function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="text-muted-foreground opacity-70">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

const NIGERIA_STATES_ALL = [
  "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta",
  "Ebonyi","Edo","Ekiti","Enugu","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi",
  "Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto",
  "Taraba","Yobe","Zamfara","FCT (Abuja)"
];
const STATE_ZONE_MAP: Record<string, string> = {
  Lagos: "South West", Ogun: "South West", Oyo: "South West", Osun: "South West", Ondo: "South West", Ekiti: "South West",
  Delta: "South South", Edo: "South South", Rivers: "South South", Bayelsa: "South South", "Cross River": "South South", "Akwa Ibom": "South South",
  Anambra: "South East", Imo: "South East", Abia: "South East", Enugu: "South East", Ebonyi: "South East",
  Kano: "North West", Katsina: "North West", Kaduna: "North West", Jigawa: "North West", Kebbi: "North West", Sokoto: "North West", Zamfara: "North West",
  Borno: "North East", Adamawa: "North East", Gombe: "North East", Taraba: "North East", Yobe: "North East", Bauchi: "North East",
  Benue: "North Central", Kogi: "North Central", Kwara: "North Central", Nasarawa: "North Central", Niger: "North Central", Plateau: "North Central", "FCT (Abuja)": "North Central",
};

// ─── State Map Tab ─────────────────────────────────────────────────────────────
function StateMapTab({ ambassadors, onRefetch }: { ambassadors: Ambassador[]; onRefetch: () => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [drawerMode, setDrawerMode] = useState<"add" | "edit" | null>(null);
  const [ambForm, setAmbForm] = useState({ name: "", email: "", phone: "", state: "", zone: "", city: "", platform: "", handle: "", followerCount: "" });

  const byZone = ZONES.reduce<Record<string, Ambassador[]>>((acc, z) => {
    acc[z] = ambassadors.filter(a => a.zone === z);
    return acc;
  }, {});

  const selectedAmb = selectedState ? ambassadors.find(a => a.state === selectedState) : null;
  const filtered = selectedZone === "all" ? ambassadors : ambassadors.filter(a => a.zone === selectedZone);

  const createAmb = useMutation({
    mutationFn: (body: object) => apiFetch("/ambassadors", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { onRefetch(); setDrawerMode(null); toast({ title: "Ambassador added!" }); },
    onError: () => toast({ title: "Failed to add ambassador", variant: "destructive" }),
  });

  const updateAmb = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => apiFetch(`/ambassadors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { onRefetch(); setDrawerMode(null); toast({ title: "Ambassador updated!" }); },
    onError: () => toast({ title: "Failed to update ambassador", variant: "destructive" }),
  });

  function openAdd() {
    setAmbForm({ name: "", email: "", phone: "", state: selectedAmb?.state ?? "", zone: selectedAmb?.zone ?? "", city: "", platform: "", handle: "", followerCount: "" });
    setDrawerMode("add");
  }

  function openEdit(amb: Ambassador) {
    setAmbForm({ name: amb.name, email: amb.email, phone: amb.phone ?? "", state: amb.state, zone: amb.zone, city: amb.city ?? "", platform: amb.platform ?? "", handle: amb.handle ?? "", followerCount: String(amb.followerCount) });
    setDrawerMode("edit");
  }

  return (
    <div className="space-y-4">
      {/* Add/Edit Ambassador Dialog */}
      <Dialog open={drawerMode !== null} onOpenChange={open => { if (!open) setDrawerMode(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{drawerMode === "add" ? "Add Ambassador" : "Edit Ambassador"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Full Name</Label>
              <Input value={ambForm.name} onChange={e => setAmbForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Chukwuemeka Obi" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={ambForm.email} onChange={e => setAmbForm(f => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={ambForm.phone} onChange={e => setAmbForm(f => ({ ...f, phone: e.target.value }))} placeholder="+2348..." />
            </div>
            <div>
              <Label>State</Label>
              <Select value={ambForm.state} onValueChange={v => setAmbForm(f => ({ ...f, state: v, zone: STATE_ZONE_MAP[v] ?? "" }))}>
                <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                <SelectContent>
                  {NIGERIA_STATES_ALL.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Zone</Label>
              <Input value={ambForm.zone} readOnly className="bg-muted/40" placeholder="Auto-filled from state" />
            </div>
            <div>
              <Label>City</Label>
              <Input value={ambForm.city} onChange={e => setAmbForm(f => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <Label>Platform</Label>
              <Select value={ambForm.platform || "none"} onValueChange={v => setAmbForm(f => ({ ...f, platform: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Handle</Label>
              <Input value={ambForm.handle} onChange={e => setAmbForm(f => ({ ...f, handle: e.target.value }))} placeholder="@username" />
            </div>
            <div>
              <Label>Follower Count</Label>
              <Input type="number" value={ambForm.followerCount} onChange={e => setAmbForm(f => ({ ...f, followerCount: e.target.value }))} />
            </div>
          </div>
          <Button
            className="w-full mt-2"
            disabled={!ambForm.name || !ambForm.email || !ambForm.state || createAmb.isPending || updateAmb.isPending}
            onClick={() => {
              const body = { ...ambForm, followerCount: Number(ambForm.followerCount || 0) };
              if (drawerMode === "add") {
                createAmb.mutate(body);
              } else if (drawerMode === "edit" && selectedAmb) {
                updateAmb.mutate({ id: selectedAmb.id, body });
              }
            }}
          >
            {(createAmb.isPending || updateAmb.isPending) ? "Saving…" : drawerMode === "add" ? "Add Ambassador" : "Save Changes"}
          </Button>
        </DialogContent>
      </Dialog>

      <div className="flex items-center gap-3 flex-wrap">
        <Select value={selectedZone} onValueChange={setSelectedZone}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Zones</SelectItem>
            {ZONES.map(z => <SelectItem key={z} value={z}>{z}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{filtered.length} ambassadors</p>
        <Button size="sm" className="ml-auto" onClick={openAdd}>
          <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Ambassador
        </Button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 space-y-3">
          {(selectedZone === "all" ? ZONES : [selectedZone]).map(zone => {
            const zoneAmbs = byZone[zone] ?? [];
            const visible = selectedZone === "all" ? zoneAmbs : filtered;
            return (
              <Card key={zone} className={`border ${ZONE_LIGHT[zone]}`}>
                <CardHeader className="pb-2 pt-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${ZONE_COLORS[zone]}`} />
                    <CardTitle className="text-sm font-semibold">{zone}</CardTitle>
                    <Badge variant="outline" className="text-xs ml-auto">{(selectedZone === "all" ? zoneAmbs : visible.filter(a => a.zone === zone)).length} states</Badge>
                  </div>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="flex flex-wrap gap-2">
                    {(selectedZone === "all" ? zoneAmbs : visible.filter(a => a.zone === zone)).map(a => (
                      <button
                        key={a.id}
                        onClick={() => setSelectedState(selectedState === a.state ? null : a.state)}
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                          selectedState === a.state
                            ? `${ZONE_COLORS[zone]} text-white border-transparent`
                            : "bg-white border-gray-200 hover:border-gray-400 text-gray-700"
                        }`}
                      >
                        {a.state}
                        <span className="ml-1 opacity-70">{a.tier === "gold" ? "🥇" : a.tier === "silver" ? "🥈" : a.tier === "bronze" ? "🥉" : ""}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div>
          {selectedAmb ? (
            <Card className="sticky top-4">
              <CardHeader className="pb-2">
                <div className="flex items-start gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0 ${ZONE_COLORS[selectedAmb.zone]}`}>
                    {selectedAmb.avatarInitials ?? selectedAmb.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base">{selectedAmb.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">{selectedAmb.state} · {selectedAmb.zone}</p>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => openEdit(selectedAmb)}>
                    Edit
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Badge className={`text-xs border ${TIER_BADGE[selectedAmb.tier]}`} variant="outline">
                    {selectedAmb.tier.charAt(0).toUpperCase() + selectedAmb.tier.slice(1)}
                  </Badge>
                  <Badge variant={selectedAmb.status === "active" ? "default" : "secondary"} className="text-xs">
                    {selectedAmb.status}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-muted/50 rounded-lg p-2 text-center">
                    <div className="font-bold text-lg">{selectedAmb.totalPoints.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Points</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2 text-center">
                    <div className="font-bold text-lg">{selectedAmb.tasksCompleted}</div>
                    <div className="text-xs text-muted-foreground">Tasks Done</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2 text-center">
                    <div className="font-bold text-lg">{selectedAmb.followerCount.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">Followers</div>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-2 text-center">
                    <div className="font-bold text-lg">{selectedAmb.referrals}</div>
                    <div className="text-xs text-muted-foreground">Referrals</div>
                  </div>
                </div>
                {selectedAmb.handle && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Star className="w-3.5 h-3.5" />
                    <span>{selectedAmb.handle} · {selectedAmb.platform}</span>
                  </div>
                )}
                {selectedAmb.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="w-3.5 h-3.5" />
                    <span className="truncate">{selectedAmb.email}</span>
                  </div>
                )}
                {selectedAmb.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="w-3.5 h-3.5" />
                    <span>{selectedAmb.phone}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground gap-2">
                <MapPin className="w-8 h-8 opacity-40" />
                <p className="text-sm">Click a state to view ambassador details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

type WeeklyLeader = { id: number; name: string; state: string; zone: string; tier: string; avatarInitials?: string | null; weeklyPoints: number; };

// ─── Leaderboard Tab ───────────────────────────────────────────────────────────
function LeaderboardTab({ ambassadors }: { ambassadors: Ambassador[] }) {
  const { toast } = useToast();
  const { user } = useUser();
  const [widgetOpen, setWidgetOpen] = useState(false);

  const { data: weeklyData } = useQuery<{ weekStart: string; leaders: WeeklyLeader[] }>({
    queryKey: ["ambassadors-weekly"],
    queryFn: () => apiFetch("/ambassadors/leaderboard/weekly"),
    staleTime: 5 * 60 * 1000,
  });

  const weeklyLeaders = weeklyData?.leaders ?? [];
  const weekStartLabel = weeklyData?.weekStart ? new Date(weeklyData.weekStart).toLocaleDateString("en-NG", { month: "short", day: "numeric" }) : "";

  const sorted = [...ambassadors].sort((a, b) => b.totalPoints - a.totalPoints);
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  async function downloadCsv() {
    try {
      const text = await apiFetch("/ambassadors/leaderboard/csv");
      const blob = new Blob([text as string], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `area-fada-leaderboard-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast({ title: "Download failed", variant: "destructive" });
    }
  }

  const basePath = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
  const widgetCode = `<iframe
  src="${window.location.origin}${basePath}/api/ambassadors/widget?token=${user?.id ?? ""}"
  width="100%"
  height="480"
  frameborder="0"
  style="border-radius:12px;border:1px solid #e2e8f0;"
></iframe>`;

  const medalColors = ["🥇", "🥈", "🥉"];

  return (
    <div className="space-y-4">
      {/* Weekly Top Performers */}
      {weeklyLeaders.length > 0 && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-600" />
              <CardTitle className="text-sm font-semibold text-amber-800">This Week's Top Performers</CardTitle>
              {weekStartLabel && <span className="text-xs text-amber-600 ml-auto">Week of {weekStartLabel}</span>}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-3">
            <div className="space-y-2">
              {weeklyLeaders.map((leader, i) => (
                <div key={leader.id} className="flex items-center gap-3">
                  <span className="text-base w-5">{["🥇", "🥈", "🥉", "4.", "5."][i] ?? `${i + 1}.`}</span>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${ZONE_COLORS[leader.zone] ?? "bg-gray-500"}`}>
                    {leader.avatarInitials ?? leader.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm leading-tight">{leader.name}</p>
                    <p className="text-xs text-muted-foreground">{leader.state}</p>
                  </div>
                  <Badge variant="secondary" className="text-xs font-bold">+{leader.weeklyPoints.toLocaleString()} pts</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{ambassadors.length} ambassadors ranked by total points</p>
        <div className="flex gap-2">
          <Dialog open={widgetOpen} onOpenChange={setWidgetOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Copy className="w-4 h-4 mr-2" /> Embed Widget
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Embeddable Leaderboard Widget</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">Copy this code to embed the public leaderboard on any website:</p>
              <div className="relative">
                <pre className="bg-muted rounded-lg p-4 text-xs overflow-auto">{widgetCode}</pre>
                <Button
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => { navigator.clipboard.writeText(widgetCode); toast({ title: "Copied to clipboard!" }); }}
                >
                  <Copy className="w-3 h-3 mr-1" /> Copy
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="w-4 h-4 mr-2" /> CSV
          </Button>
        </div>
      </div>

      {/* Top 3 podium */}
      <div className="grid grid-cols-3 gap-3">
        {top3.map((a, i) => (
          <Card key={a.id} className={i === 0 ? "border-yellow-300 bg-yellow-50" : "border-gray-200"}>
            <CardContent className="pt-4 pb-3 text-center">
              <div className="text-2xl mb-1">{medalColors[i]}</div>
              <div className={`w-10 h-10 rounded-full mx-auto mb-2 flex items-center justify-center text-white text-sm font-bold ${ZONE_COLORS[a.zone]}`}>
                {a.avatarInitials ?? a.name.slice(0, 2)}
              </div>
              <p className="font-semibold text-sm leading-tight">{a.name}</p>
              <p className="text-xs text-muted-foreground">{a.state}</p>
              <p className="text-lg font-bold mt-1">{a.totalPoints.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">pts</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rest of leaderboard */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y">
            {rest.map((a, i) => (
              <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30 transition-colors">
                <span className="text-muted-foreground text-sm font-mono w-6 text-right">{i + 4}</span>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${ZONE_COLORS[a.zone]}`}>
                  {a.avatarInitials ?? a.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{a.name}</p>
                  <p className="text-xs text-muted-foreground">{a.state} · {a.zone}</p>
                </div>
                <Badge className={`text-xs border ${TIER_BADGE[a.tier]}`} variant="outline">
                  {a.tier}
                </Badge>
                <span className="font-bold text-sm tabular-nums">{a.totalPoints.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground">pts</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tasks Tab ─────────────────────────────────────────────────────────────────
function TasksTab({ ambassadors }: { ambassadors: Ambassador[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", deadline: "", targetGroup: "all", pointReward: "25" });
  const [completeDialog, setCompleteDialog] = useState<AmbassadorTask | null>(null);
  const [completeAmbId, setCompleteAmbId] = useState<string>("");

  const { data: tasks = [], isLoading } = useQuery<AmbassadorTask[]>({
    queryKey: ["ambassador-tasks"],
    queryFn: () => apiFetch("/ambassador-tasks"),
  });

  const createTask = useMutation({
    mutationFn: (body: object) => apiFetch("/ambassador-tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ambassador-tasks"] }); setOpen(false); toast({ title: "Task created!" }); },
    onError: () => toast({ title: "Failed to create task", variant: "destructive" }),
  });

  const completeTask = useMutation({
    mutationFn: ({ taskId, ambassadorId }: { taskId: number; ambassadorId: number }) =>
      apiFetch(`/ambassador-tasks/${taskId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ambassadorId }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ambassador-tasks"] });
      setCompleteDialog(null);
      setCompleteAmbId("");
      toast({ title: "Task marked complete!" });
    },
    onError: (e: any) => toast({ title: e?.message ?? "Failed to mark complete", variant: "destructive" }),
  });

  const statusBadge = (s: string) => s === "active" ? "default" : s === "completed" ? "secondary" : "destructive";

  return (
    <div className="space-y-4">
      {/* Mark Complete Dialog */}
      <Dialog open={completeDialog !== null} onOpenChange={open => { if (!open) { setCompleteDialog(null); setCompleteAmbId(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Mark Task Complete</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{completeDialog?.title}</p>
          <div className="space-y-3">
            <div>
              <Label>Select Ambassador</Label>
              <Select value={completeAmbId} onValueChange={setCompleteAmbId}>
                <SelectTrigger><SelectValue placeholder="Choose ambassador…" /></SelectTrigger>
                <SelectContent>
                  {ambassadors.filter(a => a.status === "active").map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name} — {a.state} ({a.totalPoints} pts)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {completeDialog && completeDialog.pointReward > 0 && (
              <p className="text-xs text-muted-foreground">⭐ {completeDialog.pointReward} points will be awarded to this ambassador.</p>
            )}
            <Button
              className="w-full"
              disabled={!completeAmbId || completeTask.isPending}
              onClick={() => completeDialog && completeTask.mutate({ taskId: completeDialog.id, ambassadorId: Number(completeAmbId) })}
            >
              {completeTask.isPending ? "Saving…" : "Confirm Completion"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" /> New Task</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Ambassador Task</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Title</Label>
                <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Share the 999 book launch post" />
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Task instructions for ambassadors..." rows={3} />
              </div>
              <div>
                <Label>Deadline</Label>
                <Input type="datetime-local" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} />
              </div>
              <div>
                <Label>Target Group</Label>
                <Select value={form.targetGroup} onValueChange={v => setForm(f => ({ ...f, targetGroup: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Ambassadors</SelectItem>
                    {ZONES.map(z => <SelectItem key={z} value={`zone:${z}`}>{z} Zone</SelectItem>)}
                    <SelectItem value="tier:member">Tier: Member</SelectItem>
                    <SelectItem value="tier:bronze">Tier: Bronze</SelectItem>
                    <SelectItem value="tier:silver">Tier: Silver</SelectItem>
                    <SelectItem value="tier:gold">Tier: Gold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Point Reward</Label>
                <Input type="number" value={form.pointReward} onChange={e => setForm(f => ({ ...f, pointReward: e.target.value }))} />
              </div>
              <Button
                className="w-full"
                disabled={!form.title || createTask.isPending}
                onClick={() => createTask.mutate({ ...form, pointReward: Number(form.pointReward), deadline: form.deadline || undefined })}
              >
                {createTask.isPending ? "Creating…" : "Create Task"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading tasks…</div>
      ) : tasks.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground text-sm">No tasks yet. Create your first ambassador task.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => {
            const pct = task.totalAssigned > 0 ? Math.round((task.completedCount / task.totalAssigned) * 100) : 0;
            const daysLeft = task.deadline ? Math.ceil((new Date(task.deadline).getTime() - Date.now()) / 86400_000) : null;
            return (
              <Card key={task.id}>
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start gap-3">
                    <CheckSquare className="w-5 h-5 text-muted-foreground mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm">{task.title}</p>
                        <Badge variant={statusBadge(task.status)} className="text-xs shrink-0">{task.status}</Badge>
                      </div>
                      {task.description && <p className="text-xs text-muted-foreground mt-1">{task.description}</p>}
                      <div className="flex items-center gap-4 mt-2 flex-wrap">
                        <span className="text-xs text-muted-foreground">🎯 {task.targetGroup}</span>
                        <span className="text-xs text-muted-foreground">⭐ {task.pointReward} pts</span>
                        {daysLeft !== null && (
                          <span className={`text-xs ${daysLeft < 0 ? "text-red-500" : daysLeft <= 3 ? "text-orange-500" : "text-muted-foreground"}`}>
                            {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
                          </span>
                        )}
                      </div>
                      <div className="mt-3">
                        <div className="flex justify-between text-xs text-muted-foreground mb-1">
                          <span>Completion</span>
                          <span>{task.completedCount} / {task.totalAssigned} ({pct}%)</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5">
                          <div
                            className="bg-primary rounded-full h-1.5 transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                      {task.status !== "completed" && (
                        <div className="mt-3 flex justify-end">
                          <Button size="sm" variant="outline" className="text-xs h-7 px-3" onClick={() => { setCompleteDialog(task); setCompleteAmbId(""); }}>
                            <CheckSquare className="w-3 h-3 mr-1.5" /> Mark Complete
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Micro-Influencers Tab ──────────────────────────────────────────────────────
function MicroInfluencersTab() {
  const { toast } = useToast();
  const [filters, setFilters] = useState({ state: "", niche: "", platform: "", minFollowers: "" });
  const [outreach, setOutreach] = useState<{ influencer: MicroInfluencer; draft: string } | null>(null);
  const [outreachBrief, setOutreachBrief] = useState("");

  const params = new URLSearchParams();
  if (filters.state) params.set("state", filters.state);
  if (filters.niche) params.set("niche", filters.niche);
  if (filters.platform) params.set("platform", filters.platform);
  if (filters.minFollowers) params.set("minFollowers", filters.minFollowers);

  const { data: influencers = [], isLoading } = useQuery<MicroInfluencer[]>({
    queryKey: ["micro-influencers", filters],
    queryFn: () => apiFetch(`/micro-influencers?${params}`),
  });

  const generateOutreach = useMutation({
    mutationFn: ({ id, brief }: { id: number; brief: string }) =>
      apiFetch(`/micro-influencers/${id}/outreach`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campaignBrief: brief }) }),
    onSuccess: (data: any) => {
      setOutreach({ influencer: data.influencer, draft: data.outreachDraft });
    },
    onError: () => toast({ title: "Failed to generate outreach", variant: "destructive" }),
  });

  const statusColor: Record<string, string> = { available: "bg-green-100 text-green-700", engaged: "bg-yellow-100 text-yellow-700", partnered: "bg-blue-100 text-blue-700" };
  const platformIcon: Record<string, string> = { instagram: "📸", tiktok: "🎵", x: "𝕏", youtube: "▶️" };

  const NIGERIA_STATES_LIST = [
    "Abia","Adamawa","Akwa Ibom","Anambra","Bauchi","Bayelsa","Benue","Borno","Cross River","Delta",
    "Ebonyi","Edo","Ekiti","Enugu","Gombe","Imo","Jigawa","Kaduna","Kano","Katsina","Kebbi","Kogi",
    "Kwara","Lagos","Nasarawa","Niger","Ogun","Ondo","Osun","Oyo","Plateau","Rivers","Sokoto",
    "Taraba","Yobe","Zamfara","FCT (Abuja)"
  ];

  return (
    <div className="space-y-4">
      {outreach ? (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Outreach Draft — {outreach.influencer.name}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setOutreach(null)}>← Back to Directory</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <pre className="bg-muted rounded-lg p-4 text-sm whitespace-pre-wrap font-sans leading-relaxed">{outreach.draft}</pre>
              <Button
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => { navigator.clipboard.writeText(outreach.draft); toast({ title: "Copied!" }); }}
              >
                <Copy className="w-3 h-3 mr-1" /> Copy
              </Button>
            </div>
            <div className="flex gap-2 flex-wrap">
              {outreach.influencer.contactEmail && (
                <Button size="sm" variant="outline" asChild>
                  <a href={`mailto:${outreach.influencer.contactEmail}?subject=Collaboration Inquiry — Area Fada OS&body=${encodeURIComponent(outreach.draft)}`}>
                    <Mail className="w-4 h-4 mr-2" /> Send via Email
                  </a>
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <a href={`https://wa.me/?text=${encodeURIComponent(outreach.draft)}`} target="_blank" rel="noopener noreferrer">
                  <Send className="w-4 h-4 mr-2" /> WhatsApp
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <Select value={filters.state || "all"} onValueChange={v => setFilters(f => ({ ...f, state: v === "all" ? "" : v }))}>
              <SelectTrigger className="w-40"><SelectValue placeholder="State" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                {NIGERIA_STATES_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.niche || "all"} onValueChange={v => setFilters(f => ({ ...f, niche: v === "all" ? "" : v }))}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Niche" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Niches</SelectItem>
                {NICHES.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.platform || "all"} onValueChange={v => setFilters(f => ({ ...f, platform: v === "all" ? "" : v }))}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Platform" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                {PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filters.minFollowers || "all"} onValueChange={v => setFilters(f => ({ ...f, minFollowers: v === "all" ? "" : v }))}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Min Followers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any Size</SelectItem>
                <SelectItem value="1000">1K+</SelectItem>
                <SelectItem value="5000">5K+</SelectItem>
                <SelectItem value="10000">10K+</SelectItem>
                <SelectItem value="25000">25K+</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading directory…</div>
          ) : influencers.length === 0 ? (
            <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground text-sm">No creators match your filters.</CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {influencers.map(inf => (
                <Card key={inf.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div>
                        <p className="font-semibold text-sm">{inf.name}</p>
                        <p className="text-xs text-muted-foreground">{inf.handle}</p>
                      </div>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[inf.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {inf.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <Badge variant="secondary" className="text-xs">{platformIcon[inf.platform] ?? "📱"} {inf.platform}</Badge>
                      <Badge variant="secondary" className="text-xs">{inf.niche}</Badge>
                      <Badge variant="secondary" className="text-xs"><MapPin className="w-3 h-3 mr-0.5" />{inf.state}</Badge>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mb-3">
                      <span><Users className="w-3 h-3 inline mr-0.5" />{inf.followerCount.toLocaleString()}</span>
                      <span>⚡ {inf.engagementRate}% eng</span>
                    </div>
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Campaign brief (optional)…"
                        className="text-xs resize-none"
                        rows={2}
                        value={outreachBrief}
                        onChange={e => setOutreachBrief(e.target.value)}
                      />
                      <Button
                        size="sm"
                        className="w-full"
                        disabled={generateOutreach.isPending}
                        onClick={() => generateOutreach.mutate({ id: inf.id, brief: outreachBrief })}
                      >
                        <Send className="w-3 h-3 mr-2" />
                        {generateOutreach.isPending ? "Generating…" : "Generate Outreach"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── WhatsApp Broadcasts Tab ───────────────────────────────────────────────────
function WhatsAppTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ listName: "", message: "", sentCount: "", deliveryCount: "", linkClicks: "", responseCount: "", broadcastDate: "", notes: "" });

  const { data: broadcasts = [], isLoading } = useQuery<WhatsappBroadcast[]>({
    queryKey: ["whatsapp-broadcasts"],
    queryFn: () => apiFetch("/whatsapp-broadcasts"),
  });

  const logBroadcast = useMutation({
    mutationFn: (body: object) => apiFetch("/whatsapp-broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["whatsapp-broadcasts"] }); setOpen(false); setForm({ listName: "", message: "", sentCount: "", deliveryCount: "", linkClicks: "", responseCount: "", broadcastDate: "", notes: "" }); toast({ title: "Broadcast logged!" }); },
    onError: () => toast({ title: "Failed to log broadcast", variant: "destructive" }),
  });

  const chartData = [...broadcasts].reverse().slice(-8).map(b => ({
    date: new Date(b.broadcastDate).toLocaleDateString("en-NG", { month: "short", day: "numeric" }),
    Sent: b.sentCount,
    Delivered: b.deliveryCount,
    Clicks: b.linkClicks,
    Responses: b.responseCount,
  }));

  const totalSent = broadcasts.reduce((s, b) => s + b.sentCount, 0);
  const totalClicks = broadcasts.reduce((s, b) => s + b.linkClicks, 0);
  const avgDelivery = broadcasts.length ? Math.round(broadcasts.reduce((s, b) => s + (b.sentCount > 0 ? b.deliveryCount / b.sentCount * 100 : 0), 0) / broadcasts.length) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="Total Sent" value={totalSent.toLocaleString()} icon={<Send className="w-5 h-5" />} />
        <StatCard label="Total Link Clicks" value={totalClicks.toLocaleString()} icon={<Zap className="w-5 h-5" />} />
        <StatCard label="Avg Delivery Rate" value={`${avgDelivery}%`} icon={<CheckSquare className="w-5 h-5" />} />
      </div>

      {broadcasts.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Broadcast Performance</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barSize={14}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="Sent" fill="#94a3b8" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Delivered" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Clicks" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Responses" fill="#f59e0b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-2" /> Log Broadcast</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Log WhatsApp Broadcast</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Broadcast List Name</Label>
                <Input value={form.listName} onChange={e => setForm(f => ({ ...f, listName: e.target.value }))} placeholder="e.g. All Ambassadors" />
              </div>
              <div className="col-span-2">
                <Label>Message</Label>
                <Textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} placeholder="Broadcast message text…" rows={3} />
              </div>
              <div>
                <Label>Sent Count</Label>
                <Input type="number" value={form.sentCount} onChange={e => setForm(f => ({ ...f, sentCount: e.target.value }))} />
              </div>
              <div>
                <Label>Delivered</Label>
                <Input type="number" value={form.deliveryCount} onChange={e => setForm(f => ({ ...f, deliveryCount: e.target.value }))} />
              </div>
              <div>
                <Label>Link Clicks</Label>
                <Input type="number" value={form.linkClicks} onChange={e => setForm(f => ({ ...f, linkClicks: e.target.value }))} />
              </div>
              <div>
                <Label>Responses</Label>
                <Input type="number" value={form.responseCount} onChange={e => setForm(f => ({ ...f, responseCount: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Broadcast Date</Label>
                <Input type="datetime-local" value={form.broadcastDate} onChange={e => setForm(f => ({ ...f, broadcastDate: e.target.value }))} />
              </div>
              <div className="col-span-2">
                <Label>Notes (optional)</Label>
                <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
              </div>
            </div>
            <Button
              className="w-full mt-2"
              disabled={!form.listName || !form.message || !form.broadcastDate || logBroadcast.isPending}
              onClick={() => logBroadcast.mutate({
                ...form,
                sentCount: Number(form.sentCount || 0),
                deliveryCount: Number(form.deliveryCount || 0),
                linkClicks: Number(form.linkClicks || 0),
                responseCount: Number(form.responseCount || 0),
              })}
            >
              {logBroadcast.isPending ? "Logging…" : "Log Broadcast"}
            </Button>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading broadcasts…</div>
      ) : broadcasts.length === 0 ? (
        <Card className="border-dashed"><CardContent className="py-12 text-center text-muted-foreground text-sm">No broadcasts logged yet.</CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y">
              {broadcasts.map(b => {
                const deliveryPct = b.sentCount > 0 ? Math.round(b.deliveryCount / b.sentCount * 100) : 0;
                const clickPct = b.deliveryCount > 0 ? Math.round(b.linkClicks / b.deliveryCount * 100) : 0;
                return (
                  <div key={b.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">{b.listName}</p>
                        <p className="text-xs text-muted-foreground truncate">{b.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">{new Date(b.broadcastDate).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</p>
                      </div>
                      <div className="flex gap-3 text-right text-xs shrink-0">
                        <div><div className="font-semibold">{b.sentCount.toLocaleString()}</div><div className="text-muted-foreground">sent</div></div>
                        <div><div className="font-semibold">{deliveryPct}%</div><div className="text-muted-foreground">delivered</div></div>
                        <div><div className="font-semibold text-emerald-600">{b.linkClicks}</div><div className="text-muted-foreground">clicks</div></div>
                        <div><div className="font-semibold">{clickPct}%</div><div className="text-muted-foreground">CTR</div></div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Gamification Tab ──────────────────────────────────────────────────────────
function GamificationTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ actionKey: "", label: "", description: "", pointValue: "10" });
  const [editing, setEditing] = useState<GamificationConfig | null>(null);
  const [tierAddOpen, setTierAddOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<RewardTier | null>(null);
  const [tierForm, setTierForm] = useState({ name: "", minPoints: "", maxPoints: "", badgeColor: "#6b7280", rewardDescription: "" });

  const { data, isLoading } = useQuery<{ configs: GamificationConfig[]; rewardTiers: RewardTier[] }>({
    queryKey: ["gamification-configs"],
    queryFn: () => apiFetch("/gamification-configs"),
  });

  const createConfig = useMutation({
    mutationFn: (body: object) => apiFetch("/gamification-configs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gamification-configs"] }); setOpen(false); toast({ title: "Action created!" }); },
    onError: () => toast({ title: "Failed to create action", variant: "destructive" }),
  });

  const updateConfig = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => apiFetch(`/gamification-configs/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gamification-configs"] }); setEditing(null); toast({ title: "Updated!" }); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const createTier = useMutation({
    mutationFn: (body: object) => apiFetch("/reward-tiers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gamification-configs"] }); setTierAddOpen(false); setEditingTier(null); toast({ title: "Tier created!" }); },
    onError: () => toast({ title: "Failed to create tier", variant: "destructive" }),
  });

  const updateTier = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) => apiFetch(`/reward-tiers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gamification-configs"] }); setTierAddOpen(false); setEditingTier(null); toast({ title: "Tier updated!" }); },
    onError: () => toast({ title: "Failed to update tier", variant: "destructive" }),
  });

  const deleteTier = useMutation({
    mutationFn: (id: number) => apiFetch(`/reward-tiers/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["gamification-configs"] }); toast({ title: "Tier deleted" }); },
    onError: () => toast({ title: "Failed to delete tier", variant: "destructive" }),
  });

  const configs = data?.configs ?? [];
  const rewardTiers = data?.rewardTiers ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Point Actions */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Point-Earning Actions</h3>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline"><Plus className="w-3.5 h-3.5 mr-1.5" /> Add Action</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>New Point Action</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Action Key</Label>
                    <Input value={form.actionKey} onChange={e => setForm(f => ({ ...f, actionKey: e.target.value }))} placeholder="e.g. share_post" />
                  </div>
                  <div>
                    <Label>Label</Label>
                    <Input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="e.g. Share a Post" />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What qualifies for this action?" />
                  </div>
                  <div>
                    <Label>Points</Label>
                    <Input type="number" value={form.pointValue} onChange={e => setForm(f => ({ ...f, pointValue: e.target.value }))} />
                  </div>
                  <Button
                    className="w-full"
                    disabled={!form.actionKey || !form.label || createConfig.isPending}
                    onClick={() => createConfig.mutate({ ...form, pointValue: Number(form.pointValue) })}
                  >
                    {createConfig.isPending ? "Creating…" : "Create Action"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading…</div>
          ) : (
            <div className="space-y-2">
              {configs.map(c => (
                <Card key={c.id} className={c.active ? "" : "opacity-60"}>
                  <CardContent className="py-3 px-4">
                    {editing?.id === c.id ? (
                      <div className="space-y-2">
                        <Input value={editing.label} onChange={e => setEditing(ed => ed ? { ...ed, label: e.target.value } : ed)} />
                        <div className="flex gap-2">
                          <Input type="number" value={editing.pointValue} onChange={e => setEditing(ed => ed ? { ...ed, pointValue: Number(e.target.value) } : ed)} className="w-24" />
                          <Button size="sm" onClick={() => updateConfig.mutate({ id: c.id, body: { label: editing.label, pointValue: editing.pointValue } })}>Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="font-medium text-sm">{c.label}</p>
                          {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="text-sm font-bold">+{c.pointValue} pts</Badge>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(c)}>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Reward Tiers */}
        <div className="space-y-3">
          <Dialog open={tierAddOpen} onOpenChange={open => { setTierAddOpen(open); if (!open) setEditingTier(null); }}>
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm">Reward Tiers</h3>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" onClick={() => { setEditingTier(null); setTierForm({ name: "", minPoints: "", maxPoints: "", badgeColor: "#6b7280", rewardDescription: "" }); }}>
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Tier
                </Button>
              </DialogTrigger>
            </div>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingTier ? "Edit Reward Tier" : "New Reward Tier"}</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div>
                  <Label>Tier Name</Label>
                  <Input value={tierForm.name} onChange={e => setTierForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Gold" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Min Points</Label>
                    <Input type="number" value={tierForm.minPoints} onChange={e => setTierForm(f => ({ ...f, minPoints: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Max Points (optional)</Label>
                    <Input type="number" value={tierForm.maxPoints} onChange={e => setTierForm(f => ({ ...f, maxPoints: e.target.value }))} placeholder="∞" />
                  </div>
                </div>
                <div className="flex gap-3 items-center">
                  <div className="flex-1">
                    <Label>Badge Color</Label>
                    <Input type="color" value={tierForm.badgeColor} onChange={e => setTierForm(f => ({ ...f, badgeColor: e.target.value }))} className="h-9 px-2 py-1" />
                  </div>
                  <div className="w-8 h-8 rounded-full mt-5 shrink-0" style={{ backgroundColor: tierForm.badgeColor }} />
                </div>
                <div>
                  <Label>Reward Description</Label>
                  <Input value={tierForm.rewardDescription} onChange={e => setTierForm(f => ({ ...f, rewardDescription: e.target.value }))} placeholder="What do ambassadors unlock at this tier?" />
                </div>
                <Button
                  className="w-full"
                  disabled={!tierForm.name || !tierForm.minPoints || createTier.isPending || updateTier.isPending}
                  onClick={() => {
                    const body = { name: tierForm.name, minPoints: Number(tierForm.minPoints), maxPoints: tierForm.maxPoints ? Number(tierForm.maxPoints) : undefined, badgeColor: tierForm.badgeColor, rewardDescription: tierForm.rewardDescription };
                    editingTier ? updateTier.mutate({ id: editingTier.id, body }) : createTier.mutate(body);
                  }}
                >
                  {(createTier.isPending || updateTier.isPending) ? "Saving…" : editingTier ? "Save Changes" : "Create Tier"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <div className="space-y-2">
            {rewardTiers.map(tier => (
              <Card key={tier.id} style={{ borderColor: tier.badgeColor + "40" }}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="w-4 h-4 rounded-full shrink-0" style={{ backgroundColor: tier.badgeColor }} />
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{tier.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {tier.minPoints.toLocaleString()}+ pts{tier.maxPoints ? ` → ${tier.maxPoints.toLocaleString()}` : ""}
                      </p>
                      {tier.rewardDescription && <p className="text-xs text-muted-foreground mt-0.5 italic">{tier.rewardDescription}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingTier(tier); setTierForm({ name: tier.name, minPoints: String(tier.minPoints), maxPoints: tier.maxPoints ? String(tier.maxPoints) : "", badgeColor: tier.badgeColor, rewardDescription: tier.rewardDescription ?? "" }); setTierAddOpen(true); }}>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteTier.mutate(tier.id)} disabled={deleteTier.isPending}>
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Applications Tab ───────────────────────────────────────────────────────────
function ApplicationsTab({ ambassadors, onRefetch }: { ambassadors: Ambassador[]; onRefetch: () => void }) {
  const { toast } = useToast();
  const { user } = useUser();
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  const pending = ambassadors.filter(a => a.status === "pending");
  const rejected = ambassadors.filter(a => a.status === "rejected");

  const approve = useMutation({
    mutationFn: (id: number) => apiFetch(`/ambassadors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "active" }) }),
    onSuccess: () => { onRefetch(); toast({ title: "Ambassador approved!" }); },
    onError: () => toast({ title: "Failed to approve", variant: "destructive" }),
  });

  const reject = useMutation({
    mutationFn: (id: number) => apiFetch(`/ambassadors/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "rejected" }) }),
    onSuccess: () => { onRefetch(); toast({ title: "Application rejected." }); },
    onError: () => toast({ title: "Failed to reject", variant: "destructive" }),
  });

  const portalUrl = user?.id
    ? `${window.location.origin}${import.meta.env.BASE_URL}ambassador-portal?tenant=${user.id}`
    : null;

  function copyLink() {
    if (!portalUrl) return;
    navigator.clipboard?.writeText(portalUrl).catch(() => {
      const el = document.createElement("textarea");
      el.value = portalUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
    });
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
    toast({ title: "Portal link copied!" });
  }

  function copyToken(amb: Ambassador) {
    if (!amb.portalToken) return;
    navigator.clipboard?.writeText(amb.portalToken).catch(() => {});
    setCopiedId(amb.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ title: "Token copied!" });
  }

  return (
    <div className="space-y-5">
      {/* Portal Link Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">🔗</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm">Your Public Application Portal</p>
              <p className="text-xs text-muted-foreground mt-0.5 mb-2">
                Share this link with creators who want to apply as ambassadors.
              </p>
              {portalUrl ? (
                <div className="flex items-center gap-2">
                  <code className="text-xs bg-white border rounded px-2 py-1 flex-1 truncate">{portalUrl}</code>
                  <Button size="sm" variant="outline" onClick={copyLink} className="flex-shrink-0 gap-1">
                    {copiedLink ? <><CheckSquare className="w-3.5 h-3.5" />Copied</> : <><Copy className="w-3.5 h-3.5" />Copy</>}
                  </Button>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Log in to generate your portal link.</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Pending Applications */}
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />
          Pending Applications ({pending.length})
        </h3>
        {pending.length === 0 ? (
          <Card><CardContent className="pt-5 pb-5 text-center text-sm text-muted-foreground">No pending applications.</CardContent></Card>
        ) : (
          <div className="space-y-2">
            {pending.map(a => (
              <Card key={a.id}>
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center font-bold text-slate-600 text-sm flex-shrink-0">
                      {a.avatarInitials ?? a.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{a.name}</span>
                        <Badge variant="outline" className="text-xs text-amber-700 border-amber-300 bg-amber-50">Pending</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{a.email}</p>
                      <p className="text-xs text-muted-foreground">{a.state} · {a.zone}{a.platform ? ` · ${a.platform}` : ""}{a.handle ? ` ${a.handle}` : ""}</p>
                      {a.followerCount > 0 && <p className="text-xs text-muted-foreground">{a.followerCount.toLocaleString()} followers</p>}
                      {a.portalToken && (
                        <button
                          onClick={() => copyToken(a)}
                          className="text-[10px] text-muted-foreground hover:text-foreground mt-1 font-mono flex items-center gap-1"
                        >
                          {copiedId === a.id ? <><CheckSquare className="w-3 h-3" />Token copied</> : <><Copy className="w-3 h-3" />Copy access token</>}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <Button size="sm" className="h-7 text-xs" onClick={() => approve.mutate(a.id)} disabled={approve.isPending}>Approve</Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50" onClick={() => reject.mutate(a.id)} disabled={reject.isPending}>Reject</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Rejected Applications */}
      {rejected.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
            Rejected ({rejected.length})
          </h3>
          <div className="space-y-2">
            {rejected.map(a => (
              <Card key={a.id} className="opacity-60">
                <CardContent className="pt-3 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-400 text-xs flex-shrink-0">
                      {a.avatarInitials ?? a.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{a.name}</p>
                      <p className="text-xs text-muted-foreground">{a.email} · {a.state}</p>
                    </div>
                    <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => approve.mutate(a.id)} disabled={approve.isPending}>
                      Reactivate
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export function AmbassadorsPage() {
  const { data: ambassadors = [], isLoading, refetch } = useQuery<Ambassador[]>({
    queryKey: ["ambassadors"],
    queryFn: () => apiFetch("/ambassadors"),
  });

  const totalPoints = ambassadors.reduce((s, a) => s + a.totalPoints, 0);
  const activeCount = ambassadors.filter(a => a.status === "active").length;
  const goldCount = ambassadors.filter(a => a.tier === "gold").length;
  const totalFollowers = ambassadors.reduce((s, a) => s + a.followerCount, 0);

  return (
    <AppShell>
      <TierGuard requiredTier="agency" moduleKey="ambassadorCrm">
        <div className="space-y-6 p-6 max-w-7xl mx-auto">
          <div>
            <h1 className="text-2xl font-bold">Ambassador CRM</h1>
            <p className="text-muted-foreground text-sm mt-1">
              36-state ambassador network · gamification · leaderboard · micro-influencer matching
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Active Ambassadors" value={activeCount} sub={`of ${ambassadors.length} total`} icon={<Users className="w-5 h-5" />} />
            <StatCard label="Total Points Earned" value={totalPoints.toLocaleString()} sub="across all ambassadors" icon={<Star className="w-5 h-5" />} />
            <StatCard label="Gold Tier" value={goldCount} sub="top performers" icon={<Trophy className="w-5 h-5" />} />
            <StatCard label="Total Reach" value={`${(totalFollowers / 1000).toFixed(0)}K`} sub="combined followers" icon={<Users className="w-5 h-5" />} />
          </div>

          {/* Tabs */}
          <Tabs defaultValue="map">
            <TabsList className="flex-wrap h-auto">
              <TabsTrigger value="map" className="gap-1.5">
                <MapPin className="w-3.5 h-3.5" /> State Map
              </TabsTrigger>
              <TabsTrigger value="leaderboard" className="gap-1.5">
                <Trophy className="w-3.5 h-3.5" /> Leaderboard
              </TabsTrigger>
              <TabsTrigger value="tasks" className="gap-1.5">
                <CheckSquare className="w-3.5 h-3.5" /> Tasks
              </TabsTrigger>
              <TabsTrigger value="influencers" className="gap-1.5">
                <Star className="w-3.5 h-3.5" /> Micro-Influencers
              </TabsTrigger>
              <TabsTrigger value="whatsapp" className="gap-1.5">
                <MessageCircle className="w-3.5 h-3.5" /> WhatsApp
              </TabsTrigger>
              <TabsTrigger value="gamification" className="gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Gamification
              </TabsTrigger>
              <TabsTrigger value="applications" className="gap-1.5">
                <FileText className="w-3.5 h-3.5" /> Applications
                {ambassadors.filter(a => a.status === "pending").length > 0 && (
                  <span className="ml-1 w-4 h-4 rounded-full bg-amber-400 text-white text-[10px] font-bold flex items-center justify-center">
                    {ambassadors.filter(a => a.status === "pending").length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="map" className="mt-4">
              {isLoading ? (
                <div className="text-center py-16 text-muted-foreground text-sm">Loading ambassador network…</div>
              ) : (
                <StateMapTab ambassadors={ambassadors} onRefetch={() => refetch()} />
              )}
            </TabsContent>

            <TabsContent value="leaderboard" className="mt-4">
              {isLoading ? (
                <div className="text-center py-16 text-muted-foreground text-sm">Loading leaderboard…</div>
              ) : (
                <LeaderboardTab ambassadors={ambassadors} />
              )}
            </TabsContent>

            <TabsContent value="tasks" className="mt-4">
              <TasksTab ambassadors={ambassadors} />
            </TabsContent>

            <TabsContent value="influencers" className="mt-4">
              <MicroInfluencersTab />
            </TabsContent>

            <TabsContent value="whatsapp" className="mt-4">
              <WhatsAppTab />
            </TabsContent>

            <TabsContent value="gamification" className="mt-4">
              <GamificationTab />
            </TabsContent>

            <TabsContent value="applications" className="mt-4">
              <ApplicationsTab ambassadors={ambassadors} onRefetch={() => refetch()} />
            </TabsContent>
          </Tabs>
        </div>
      </TierGuard>
    </AppShell>
  );
}
