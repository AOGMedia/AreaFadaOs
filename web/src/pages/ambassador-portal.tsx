import { useState, useEffect } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Users, Trophy, CheckSquare, Star, Clock, ChevronRight,
  Copy, CheckCircle, AlertCircle, Loader2, MapPin, Zap,
} from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

const NIGERIA_STATES = [
  { state: "Lagos", zone: "South West" }, { state: "Ogun", zone: "South West" },
  { state: "Oyo", zone: "South West" }, { state: "Osun", zone: "South West" },
  { state: "Ondo", zone: "South West" }, { state: "Ekiti", zone: "South West" },
  { state: "Delta", zone: "South South" }, { state: "Edo", zone: "South South" },
  { state: "Rivers", zone: "South South" }, { state: "Bayelsa", zone: "South South" },
  { state: "Cross River", zone: "South South" }, { state: "Akwa Ibom", zone: "South South" },
  { state: "Anambra", zone: "South East" }, { state: "Imo", zone: "South East" },
  { state: "Abia", zone: "South East" }, { state: "Enugu", zone: "South East" },
  { state: "Ebonyi", zone: "South East" }, { state: "Kano", zone: "North West" },
  { state: "Katsina", zone: "North West" }, { state: "Kaduna", zone: "North West" },
  { state: "Jigawa", zone: "North West" }, { state: "Kebbi", zone: "North West" },
  { state: "Sokoto", zone: "North West" }, { state: "Zamfara", zone: "North West" },
  { state: "Borno", zone: "North East" }, { state: "Adamawa", zone: "North East" },
  { state: "Gombe", zone: "North East" }, { state: "Taraba", zone: "North East" },
  { state: "Yobe", zone: "North East" }, { state: "Bauchi", zone: "North East" },
  { state: "Benue", zone: "North Central" }, { state: "Kogi", zone: "North Central" },
  { state: "Kwara", zone: "North Central" }, { state: "Nasarawa", zone: "North Central" },
  { state: "Niger", zone: "North Central" }, { state: "Plateau", zone: "North Central" },
  { state: "FCT (Abuja)", zone: "North Central" },
];
const PLATFORMS = ["instagram", "tiktok", "x", "youtube", "facebook"];

const TOKEN_KEY = "ambassador_portal_token";

const TIER_COLORS: Record<string, string> = {
  gold: "bg-yellow-400 text-yellow-900",
  silver: "bg-gray-300 text-gray-800",
  bronze: "bg-amber-700 text-amber-50",
  member: "bg-slate-200 text-slate-700",
};
const TIER_ICONS: Record<string, string> = { gold: "🥇", silver: "🥈", bronze: "🥉", member: "⭐" };

interface Ambassador {
  id: number; name: string; email: string; state: string; zone: string;
  tier: string; status: string; platform?: string; handle?: string;
  followerCount: number; totalPoints: number; tasksCompleted: number;
  referrals: number; portalToken: string; avatarInitials?: string; joinedAt: string;
}

interface PointRow {
  id: number; action: string; points: number; description?: string; createdAt: string;
}

interface Task {
  id: number; title: string; description?: string; deadline?: string;
  pointReward: number; status: string; completed: boolean;
}

interface Tier {
  id: number; name: string; minPoints: number; maxPoints?: number;
  badgeColor: string; rewardDescription?: string;
}

interface LeaderboardEntry {
  id: number; name: string; state: string; tier: string;
  totalPoints: number; avatarInitials?: string; rank: number;
}

function getTenantFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("tenant");
}

function copyToClipboard(text: string) {
  navigator.clipboard?.writeText(text).catch(() => {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  });
}

export function AmbassadorPortalPage() {
  const { toast } = useToast();
  const tenant = getTenantFromUrl();
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [view, setView] = useState<"apply" | "lookup" | "dashboard">(token ? "dashboard" : "apply");
  const [copied, setCopied] = useState(false);
  const [lookupToken, setLookupToken] = useState("");
  const [activeTab, setActiveTab] = useState<"overview" | "points" | "tasks" | "leaderboard">("overview");

  const [form, setForm] = useState({
    name: "", email: "", phone: "", state: "", zone: "", platform: "", handle: "", followerCount: "",
  });

  function handleStateChange(state: string) {
    const match = NIGERIA_STATES.find(s => s.state === state);
    setForm(f => ({ ...f, state, zone: match?.zone ?? "" }));
  }

  const apply = useMutation({
    mutationFn: (body: object) =>
      apiFetch("/ambassador-portal/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      if (data.alreadyApplied) {
        toast({ title: "Already applied", description: data.message });
      } else if (data.token) {
        localStorage.setItem(TOKEN_KEY, data.token);
        setToken(data.token);
        setView("dashboard");
        toast({ title: "Application submitted!", description: data.message });
      }
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const { data: ambassador, isLoading: ambLoading } = useQuery<Ambassador>({
    queryKey: ["portal-me", token],
    queryFn: () => apiFetch(`/ambassador-portal/me?token=${encodeURIComponent(token!)}`),
    enabled: !!token && view === "dashboard",
    retry: false,
  });

  const { data: points } = useQuery<PointRow[]>({
    queryKey: ["portal-points", token],
    queryFn: () => apiFetch(`/ambassador-portal/points?token=${encodeURIComponent(token!)}`),
    enabled: !!token && !!ambassador && ambassador.status === "active" && activeTab === "points",
    retry: false,
  });

  const { data: tasks } = useQuery<Task[]>({
    queryKey: ["portal-tasks", token],
    queryFn: () => apiFetch(`/ambassador-portal/tasks?token=${encodeURIComponent(token!)}`),
    enabled: !!token && !!ambassador && ambassador.status === "active" && activeTab === "tasks",
    retry: false,
  });

  const { data: tiers } = useQuery<Tier[]>({
    queryKey: ["portal-tiers", token],
    queryFn: () => apiFetch(`/ambassador-portal/tiers?token=${encodeURIComponent(token!)}`),
    enabled: !!token && !!ambassador && ambassador.status === "active",
    retry: false,
  });

  const { data: leaderboard } = useQuery<LeaderboardEntry[]>({
    queryKey: ["portal-leaderboard", token],
    queryFn: () => apiFetch(`/ambassador-portal/leaderboard?token=${encodeURIComponent(token!)}`),
    enabled: !!token && !!ambassador && ambassador.status === "active" && activeTab === "leaderboard",
    retry: false,
  });

  function handleCopyToken() {
    if (!token) return;
    copyToClipboard(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleLookup() {
    if (!lookupToken.trim()) return;
    localStorage.setItem(TOKEN_KEY, lookupToken.trim());
    setToken(lookupToken.trim());
    setView("dashboard");
    setLookupToken("");
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setView("apply");
  }

  if (!tenant && view === "apply") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-8 pb-6">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">Invalid Portal Link</h2>
            <p className="text-muted-foreground text-sm">
              This portal link is missing a tenant token. Please use the link provided by your Area Fada ambassador coordinator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (view === "dashboard") {
    if (ambLoading) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!ambassador) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <Card className="w-full max-w-md text-center">
            <CardContent className="pt-8 pb-6">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h2 className="text-xl font-bold mb-2">Token not found</h2>
              <p className="text-muted-foreground text-sm mb-4">
                We couldn't find an account linked to this token.
              </p>
              <Button onClick={handleLogout} variant="outline" size="sm">Try a different token</Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    const isPending = ambassador.status === "pending";
    const nextTier = tiers?.find(t => t.minPoints > ambassador.totalPoints);
    const pointsToNext = nextTier ? nextTier.minPoints - ambassador.totalPoints : 0;
    const currentTierInfo = tiers?.find(t =>
      ambassador.totalPoints >= t.minPoints && (!t.maxPoints || ambassador.totalPoints <= t.maxPoints)
    );
    const progressPct = nextTier && currentTierInfo
      ? Math.min(100, Math.round(((ambassador.totalPoints - currentTierInfo.minPoints) / (nextTier.minPoints - currentTierInfo.minPoints)) * 100))
      : 100;

    return (
      <div className="min-h-screen bg-background">
        <div className="bg-slate-900 text-white px-4 py-4">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center font-bold text-slate-900 text-sm">
                {ambassador.avatarInitials ?? ambassador.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-sm">{ambassador.name}</div>
                <div className="text-slate-400 text-xs">{ambassador.state} · {ambassador.zone}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={TIER_COLORS[ambassador.tier]}>
                {TIER_ICONS[ambassador.tier]} {ambassador.tier.charAt(0).toUpperCase() + ambassador.tier.slice(1)}
              </Badge>
              <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white text-xs" onClick={handleLogout}>
                Exit
              </Button>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-4">
          {isPending ? (
            <Card className="border-amber-200 bg-amber-50 mb-4">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-amber-900 text-sm">Application Under Review</p>
                    <p className="text-amber-700 text-xs mt-1">
                      Your application has been received and is being reviewed by the coordinator. You'll gain full access to your points dashboard and tasks once approved.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex items-center gap-2 mb-4 bg-slate-50 border rounded-lg px-3 py-2">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Your access token (save this)</p>
              <p className="font-mono text-xs text-slate-700 truncate">{token}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={handleCopyToken} className="flex-shrink-0">
              {copied ? <CheckCircle className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>

          {!isPending && (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <div className="text-2xl font-bold text-primary">{ambassador.totalPoints.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground mt-1">Total Points</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <div className="text-2xl font-bold">{ambassador.tasksCompleted}</div>
                    <div className="text-xs text-muted-foreground mt-1">Tasks Done</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-4 pb-3 text-center">
                    <div className="text-2xl font-bold">{ambassador.referrals}</div>
                    <div className="text-xs text-muted-foreground mt-1">Referrals</div>
                  </CardContent>
                </Card>
              </div>

              {nextTier && (
                <Card className="mb-4">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-muted-foreground">Progress to {nextTier.name}</span>
                      <span className="text-xs font-bold">{pointsToNext.toLocaleString()} pts to go</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    {currentTierInfo?.rewardDescription && (
                      <p className="text-xs text-muted-foreground mt-2">{currentTierInfo.rewardDescription}</p>
                    )}
                  </CardContent>
                </Card>
              )}

              {tiers && tiers.length > 0 && (
                <Card className="mb-4">
                  <CardHeader className="pb-2 pt-4">
                    <CardTitle className="text-sm">Tier Rewards</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-3">
                    <div className="space-y-2">
                      {tiers.map(t => {
                        const isCurrentTier = ambassador.totalPoints >= t.minPoints && (!t.maxPoints || ambassador.totalPoints <= t.maxPoints);
                        return (
                          <div key={t.id} className={`flex items-start gap-3 p-2 rounded-lg ${isCurrentTier ? "bg-primary/10 border border-primary/20" : "bg-slate-50"}`}>
                            <div className="w-3 h-3 rounded-full mt-0.5 flex-shrink-0" style={{ backgroundColor: t.badgeColor }} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold">{t.name}</span>
                                {isCurrentTier && <Badge className="text-[10px] py-0 px-1.5 bg-primary text-primary-foreground">Current</Badge>}
                              </div>
                              <p className="text-xs text-muted-foreground">{t.minPoints.toLocaleString()}{t.maxPoints ? `–${t.maxPoints.toLocaleString()}` : "+"} pts</p>
                              {t.rewardDescription && <p className="text-xs text-muted-foreground mt-0.5">{t.rewardDescription}</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {!isPending && (
            <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
              {(["overview", "points", "tasks", "leaderboard"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab
                      ? "bg-primary text-primary-foreground"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {tab === "overview" && "Overview"}
                  {tab === "points" && "Points History"}
                  {tab === "tasks" && "My Tasks"}
                  {tab === "leaderboard" && "Leaderboard"}
                </button>
              ))}
            </div>
          )}

          {!isPending && activeTab === "overview" && (
            <Card>
              <CardHeader className="pb-2 pt-4">
                <CardTitle className="text-sm">Your Profile</CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-muted-foreground" />
                    <span>{ambassador.state}, {ambassador.zone}</span>
                  </div>
                  {ambassador.platform && (
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-muted-foreground" />
                      <span>{ambassador.platform.charAt(0).toUpperCase() + ambassador.platform.slice(1)}{ambassador.handle ? ` · ${ambassador.handle}` : ""}</span>
                    </div>
                  )}
                  {ambassador.followerCount > 0 && (
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span>{ambassador.followerCount.toLocaleString()} followers</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4 text-muted-foreground" />
                    <span>{ambassador.tasksCompleted} tasks completed</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {!isPending && activeTab === "points" && (
            <div className="space-y-2">
              {!points ? (
                <div className="text-center py-8 text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading…</div>
              ) : points.length === 0 ? (
                <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">No points activity yet. Complete tasks to earn points!</CardContent></Card>
              ) : (
                points.map(p => (
                  <Card key={p.id}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{p.description ?? p.action}</p>
                          <p className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}</p>
                        </div>
                        <Badge className="bg-primary/10 text-primary font-bold">+{p.points} pts</Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {!isPending && activeTab === "tasks" && (
            <div className="space-y-2">
              {!tasks ? (
                <div className="text-center py-8 text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading…</div>
              ) : tasks.length === 0 ? (
                <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">No tasks assigned yet.</CardContent></Card>
              ) : (
                tasks.map(t => (
                  <Card key={t.id} className={t.completed ? "opacity-60" : ""}>
                    <CardContent className="pt-3 pb-3">
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${t.completed ? "bg-green-500" : "bg-slate-200"}`}>
                          {t.completed
                            ? <CheckCircle className="w-3 h-3 text-white" />
                            : <Zap className="w-3 h-3 text-slate-500" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium leading-snug">{t.title}</p>
                            <Badge variant="outline" className="text-xs flex-shrink-0">{t.pointReward} pts</Badge>
                          </div>
                          {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
                          {t.deadline && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Deadline: {new Date(t.deadline).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}
                            </p>
                          )}
                          {t.completed && <p className="text-xs text-green-600 mt-1 font-medium">Completed ✓</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          )}

          {!isPending && activeTab === "leaderboard" && (
            <div className="space-y-2">
              {!leaderboard ? (
                <div className="text-center py-8 text-muted-foreground text-sm"><Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />Loading…</div>
              ) : leaderboard.length === 0 ? (
                <Card><CardContent className="pt-6 pb-6 text-center text-sm text-muted-foreground">Leaderboard coming soon.</CardContent></Card>
              ) : (
                leaderboard.map(entry => {
                  const isSelf = ambassador && entry.id === ambassador.id;
                  return (
                    <Card key={entry.id} className={isSelf ? "border-primary bg-primary/5" : ""}>
                      <CardContent className="pt-3 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 flex items-center justify-center font-bold text-sm flex-shrink-0">
                            {entry.rank <= 3 ? ["🥇", "🥈", "🥉"][entry.rank - 1] : <span className="text-muted-foreground text-xs font-mono">{entry.rank}</span>}
                          </div>
                          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-xs font-bold flex-shrink-0">
                            {entry.avatarInitials ?? entry.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{entry.name}{isSelf ? " (You)" : ""}</p>
                            <p className="text-xs text-muted-foreground">{entry.state}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-bold">{entry.totalPoints.toLocaleString()}</p>
                            <p className="text-xs text-muted-foreground">pts</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="bg-slate-900 text-white px-4 py-8 text-center">
        <div className="max-w-md mx-auto">
          <div className="text-3xl mb-2">🏆</div>
          <h1 className="text-2xl font-black mb-1">Area Fada Ambassador Network</h1>
          <p className="text-slate-400 text-sm">
            Join Nigeria's most active creator ambassador programme. Earn points, climb tiers, and get rewarded.
          </p>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6">
        {view === "lookup" ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Access Your Dashboard</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Enter the access token you received after submitting your application.
              </p>
              <div className="space-y-3">
                <Input
                  placeholder="Paste your access token…"
                  value={lookupToken}
                  onChange={e => setLookupToken(e.target.value)}
                  className="font-mono text-sm"
                />
                <Button className="w-full" onClick={handleLookup} disabled={!lookupToken.trim()}>
                  Open Dashboard
                </Button>
                <Button variant="ghost" className="w-full text-sm" onClick={() => setView("apply")}>
                  ← Back to application form
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Apply to Join</CardTitle>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={e => {
                  e.preventDefault();
                  if (!tenant) return;
                  apply.mutate({ ...form, tenant, followerCount: Number(form.followerCount) || 0 });
                }}
                className="space-y-3"
              >
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-xs">Full Name *</Label>
                    <Input
                      required
                      placeholder="Chukwuemeka Obi"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">Email Address *</Label>
                    <Input
                      required
                      type="email"
                      placeholder="you@email.com"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Phone (optional)</Label>
                    <Input
                      placeholder="+234…"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Followers (approx)</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="5000"
                      value={form.followerCount}
                      onChange={e => setForm(f => ({ ...f, followerCount: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">State *</Label>
                    <select
                      required
                      value={form.state}
                      onChange={e => handleStateChange(e.target.value)}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Select state</option>
                      {NIGERIA_STATES.map(s => (
                        <option key={s.state} value={s.state}>{s.state}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Zone</Label>
                    <Input value={form.zone} readOnly className="bg-slate-50 text-muted-foreground" />
                  </div>
                  <div>
                    <Label className="text-xs">Main Platform</Label>
                    <select
                      value={form.platform}
                      onChange={e => setForm(f => ({ ...f, platform: e.target.value }))}
                      className="w-full border rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="">Select platform</option>
                      {PLATFORMS.map(p => (
                        <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Handle / Username</Label>
                    <Input
                      placeholder="@yourhandle"
                      value={form.handle}
                      onChange={e => setForm(f => ({ ...f, handle: e.target.value }))}
                    />
                  </div>
                </div>

                <Button type="submit" className="w-full" disabled={apply.isPending}>
                  {apply.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Submit Application
                </Button>
              </form>

              <div className="mt-4 pt-4 border-t text-center">
                <p className="text-xs text-muted-foreground mb-2">Already applied?</p>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => setView("lookup")}>
                  Enter your access token <ChevronRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-lg">🥇</div>
            <div className="text-xs font-medium mt-1">Earn Points</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Complete tasks & referrals</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-lg">📈</div>
            <div className="text-xs font-medium mt-1">Climb Tiers</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">From Member to Gold</div>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <div className="text-lg">💰</div>
            <div className="text-xs font-medium mt-1">Get Rewarded</div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Airtime, merch & cash</div>
          </div>
        </div>
      </div>
    </div>
  );
}
