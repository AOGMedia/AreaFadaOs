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
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Star, Trophy, Users, Lock, Unlock, Copy, CheckCircle, XCircle, Plus,
  Search, Crown, Zap, BookOpen, Music, Video, FileText, Image as ImageIcon,
  Tag, Shield, BarChart3, ChevronRight, Ticket,
} from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", ...opts });
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return null;
  return r.json();
}

const FAN_TIER_NAMES: Record<number, string> = {
  1: "Area Fada Curious",
  2: "Area Fada Fan",
  3: "Area Fada Soldier",
  4: "Area Fada OG",
};

const FAN_TIER_COLORS: Record<number, string> = {
  1: "bg-slate-100 text-slate-700 border-slate-200",
  2: "bg-emerald-100 text-emerald-700 border-emerald-300",
  3: "bg-purple-100 text-purple-700 border-purple-300",
  4: "bg-amber-100 text-amber-800 border-amber-300",
};

const FAN_TIER_DOT: Record<number, string> = {
  1: "bg-slate-400",
  2: "bg-emerald-500",
  3: "bg-purple-500",
  4: "bg-amber-500",
};

const CONTENT_TYPE_ICONS: Record<string, React.ReactNode> = {
  chapter: <BookOpen className="w-4 h-4" />,
  audio: <Music className="w-4 h-4" />,
  video: <Video className="w-4 h-4" />,
  doc: <FileText className="w-4 h-4" />,
  image: <ImageIcon className="w-4 h-4" />,
};

function TierBadge({ tier }: { tier: number }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${FAN_TIER_COLORS[tier] ?? FAN_TIER_COLORS[1]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${FAN_TIER_DOT[tier] ?? FAN_TIER_DOT[1]}`} />
      {FAN_TIER_NAMES[tier] ?? `Tier ${tier}`}
    </span>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className="p-1 rounded hover:bg-muted text-muted-foreground"
      title="Copy"
    >
      {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Fan Profiles Tab ──────────────────────────────────────────────────────────

function FanProfilesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ email: "", displayName: "", phone: "", state: "", instagramHandle: "", twitterHandle: "", tiktokHandle: "", referredByCode: "" });

  const { data: fans = [], isLoading } = useQuery({ queryKey: ["fan-profiles"], queryFn: () => apiFetch("/fan-hub/profiles") });

  const addMutation = useMutation({
    mutationFn: (body: typeof form) => apiFetch("/fan-hub/profiles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fan-profiles"] }); setAddOpen(false); toast({ title: "Fan registered!" }); },
    onError: () => toast({ title: "Failed to register fan", variant: "destructive" }),
  });

  const verifyMutation = useMutation({
    mutationFn: ({ id, purchaseVerified, fanTier }: { id: number; purchaseVerified: boolean; fanTier?: number }) =>
      apiFetch(`/fan-hub/profiles/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purchaseVerified, fanTier }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fan-profiles"] }); toast({ title: "Fan updated!" }); },
  });

  const filtered = (fans as any[]).filter(f =>
    (tierFilter === "all" || f.fanTier === Number(tierFilter)) &&
    (search === "" || f.displayName.toLowerCase().includes(search.toLowerCase()) || f.email.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search fans…" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="All tiers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tiers</SelectItem>
              <SelectItem value="1">Tier 1 — Curious</SelectItem>
              <SelectItem value="2">Tier 2 — Fan</SelectItem>
              <SelectItem value="3">Tier 3 — Soldier</SelectItem>
              <SelectItem value="4">Tier 4 — OG</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Fan</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Register New Fan</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Display Name *</Label><Input value={form.displayName} onChange={e => setForm(f => ({ ...f, displayName: e.target.value }))} /></div>
                <div><Label>Email *</Label><Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div><Label>State</Label><Input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} /></div>
                <div><Label>Instagram Handle</Label><Input value={form.instagramHandle} onChange={e => setForm(f => ({ ...f, instagramHandle: e.target.value }))} /></div>
                <div><Label>Twitter Handle</Label><Input value={form.twitterHandle} onChange={e => setForm(f => ({ ...f, twitterHandle: e.target.value }))} /></div>
                <div><Label>TikTok Handle</Label><Input value={form.tiktokHandle} onChange={e => setForm(f => ({ ...f, tiktokHandle: e.target.value }))} /></div>
                <div><Label>Referred by Code</Label><Input value={form.referredByCode} onChange={e => setForm(f => ({ ...f, referredByCode: e.target.value }))} /></div>
              </div>
              <Button className="w-full" disabled={addMutation.isPending} onClick={() => addMutation.mutate(form)}>
                {addMutation.isPending ? "Registering…" : "Register Fan"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading fans…</div>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Fan</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tier</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Points</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Referrals</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Referral Code</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Verified</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-muted-foreground">No fans found</td></tr>
              ) : filtered.map((fan: any) => (
                <tr key={fan.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{fan.displayName}</div>
                    <div className="text-xs text-muted-foreground">{fan.email}</div>
                    {fan.state && <div className="text-xs text-muted-foreground">{fan.state}</div>}
                  </td>
                  <td className="px-4 py-3"><TierBadge tier={fan.fanTier} /></td>
                  <td className="px-4 py-3 font-mono font-medium">{fan.totalPoints.toLocaleString()}</td>
                  <td className="px-4 py-3">{fan.referralCount}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs">{fan.referralCode}</span>
                      <CopyButton value={fan.referralCode} />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {fan.purchaseVerified
                      ? <span className="text-emerald-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" />Yes</span>
                      : <span className="text-muted-foreground flex items-center gap-1"><XCircle className="w-4 h-4" />No</span>}
                  </td>
                  <td className="px-4 py-3">
                    {!fan.purchaseVerified && (
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => verifyMutation.mutate({ id: fan.id, purchaseVerified: true, fanTier: fan.fanTier < 2 ? 2 : fan.fanTier })}>
                        Verify Purchase
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Leaderboard Tab ───────────────────────────────────────────────────────────

function LeaderboardTab() {
  const { data: board = [] } = useQuery({ queryKey: ["fan-leaderboard"], queryFn: () => apiFetch("/fan-hub/leaderboard") });

  const top10 = (board as any[]).slice(0, 10);
  const rest = (board as any[]).slice(10);

  return (
    <div className="space-y-6">
      {top10.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-amber-500" />
            <h3 className="font-semibold">Weekly Top 10 — Featured on CB Instagram Stories</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {top10.map((entry: any) => (
              <div key={entry.fanProfileId} className={`rounded-lg border p-4 flex items-center gap-3 ${entry.rank <= 3 ? "bg-amber-50 border-amber-200 dark:bg-amber-950/20" : ""}`}>
                <div className={`text-2xl font-black w-10 text-center ${entry.rank === 1 ? "text-amber-500" : entry.rank === 2 ? "text-slate-400" : entry.rank === 3 ? "text-amber-700" : "text-muted-foreground"}`}>
                  {entry.rank === 1 ? "🥇" : entry.rank === 2 ? "🥈" : entry.rank === 3 ? "🥉" : `#${entry.rank}`}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{entry.displayName}</div>
                  <div className="text-xs text-muted-foreground">{entry.state ?? "Nigeria"}</div>
                  <div className="mt-1 flex items-center gap-2">
                    <TierBadge tier={entry.fanTier} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-lg text-primary">{entry.totalPoints.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">pts</div>
                  <div className="text-xs text-muted-foreground">{entry.referralCount} refs</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {rest.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 text-muted-foreground">Positions 11–{board.length}</h3>
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Rank</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Fan</th>
                  <th className="text-left px-4 py-2 font-medium text-muted-foreground">Tier</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Points</th>
                  <th className="text-right px-4 py-2 font-medium text-muted-foreground">Referrals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rest.map((entry: any) => (
                  <tr key={entry.fanProfileId} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-2.5 text-muted-foreground font-mono">#{entry.rank}</td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium">{entry.displayName}</div>
                      <div className="text-xs text-muted-foreground">{entry.state}</div>
                    </td>
                    <td className="px-4 py-2.5"><TierBadge tier={entry.fanTier} /></td>
                    <td className="px-4 py-2.5 text-right font-mono">{entry.totalPoints.toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right">{entry.referralCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {board.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">No fans registered yet.</div>
      )}
    </div>
  );
}

// ── Challenges Tab ────────────────────────────────────────────────────────────

function ChallengesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [submissionsFilter, setSubmissionsFilter] = useState("pending");
  const [form, setForm] = useState({ title: "", description: "", pointValue: "100", deadline: "", proofType: "screenshot" });

  const { data: challenges = [] } = useQuery({ queryKey: ["fan-challenges"], queryFn: () => apiFetch("/fan-hub/challenges") });
  const { data: submissions = [] } = useQuery({ queryKey: ["fan-submissions", submissionsFilter], queryFn: () => apiFetch(`/fan-hub/submissions?status=${submissionsFilter}`) });

  const createMutation = useMutation({
    mutationFn: (body: any) => apiFetch("/fan-hub/challenges", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fan-challenges"] }); setCreateOpen(false); toast({ title: "Challenge created!" }); },
    onError: () => toast({ title: "Failed to create challenge", variant: "destructive" }),
  });

  const reviewMutation = useMutation({
    mutationFn: ({ id, status, reviewNote }: { id: number; status: string; reviewNote?: string }) =>
      apiFetch(`/fan-hub/submissions/${id}/review`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, reviewNote }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fan-submissions", submissionsFilter] }); toast({ title: "Submission reviewed!" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/fan-hub/challenges/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["fan-challenges"] }); toast({ title: "Challenge deleted" }); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Fan Missions</h3>
          <p className="text-sm text-muted-foreground">Create challenges for fans to earn points</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" />New Challenge</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Create Fan Challenge</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Share our teaser and tag 3 friends" /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Points</Label><Input type="number" value={form.pointValue} onChange={e => setForm(f => ({ ...f, pointValue: e.target.value }))} /></div>
                <div>
                  <Label>Proof Type</Label>
                  <Select value={form.proofType} onValueChange={v => setForm(f => ({ ...f, proofType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="screenshot">Screenshot</SelectItem>
                      <SelectItem value="link">Link</SelectItem>
                      <SelectItem value="text">Text</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2"><Label>Deadline (optional)</Label><Input type="datetime-local" value={form.deadline} onChange={e => setForm(f => ({ ...f, deadline: e.target.value }))} /></div>
              </div>
              <Button className="w-full" disabled={createMutation.isPending}
                onClick={() => createMutation.mutate({ ...form, pointValue: Number(form.pointValue), deadline: form.deadline || undefined })}>
                {createMutation.isPending ? "Creating…" : "Create Challenge"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(challenges as any[]).map((c: any) => (
          <div key={c.id} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium">{c.title}</div>
                {c.description && <div className="text-sm text-muted-foreground mt-0.5">{c.description}</div>}
              </div>
              <Badge variant={c.status === "active" ? "default" : "secondary"}>{c.status}</Badge>
            </div>
            <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-amber-500" />{c.pointValue} pts</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{c.participantCount} fans</span>
              <span className="capitalize">{c.proofType}</span>
              {c.deadline && <span>Due {new Date(c.deadline).toLocaleDateString()}</span>}
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="destructive" className="h-6 text-xs px-2" onClick={() => deleteMutation.mutate(c.id)}>Delete</Button>
            </div>
          </div>
        ))}
        {(challenges as any[]).length === 0 && (
          <div className="col-span-2 text-center py-8 text-muted-foreground">No challenges created yet.</div>
        )}
      </div>

      {/* Submission approval queue */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="font-semibold">Submission Queue</h3>
          <Select value={submissionsFilter} onValueChange={setSubmissionsFilter}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Fan</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Challenge</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Proof</th>
                <th className="text-left px-4 py-2 font-medium text-muted-foreground">Status</th>
                {submissionsFilter === "pending" && <th className="text-left px-4 py-2 font-medium text-muted-foreground">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(submissions as any[]).length === 0 ? (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No submissions</td></tr>
              ) : (submissions as any[]).map((s: any) => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-4 py-2.5 font-medium">{s.fanDisplayName ?? `Fan #${s.fanProfileId}`}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{s.challengeTitle ?? `Challenge #${s.challengeId}`}</td>
                  <td className="px-4 py-2.5">
                    {s.proofText && <p className="max-w-xs truncate text-xs">{s.proofText}</p>}
                    {s.proofUrl && <a href={s.proofUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">View proof</a>}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant={s.status === "approved" ? "default" : s.status === "rejected" ? "destructive" : "secondary"}>{s.status}</Badge>
                  </td>
                  {submissionsFilter === "pending" && (
                    <td className="px-4 py-2.5">
                      <div className="flex gap-1">
                        <Button size="sm" className="h-6 text-xs px-2 bg-emerald-600 hover:bg-emerald-700" onClick={() => reviewMutation.mutate({ id: s.id, status: "approved" })}>Approve</Button>
                        <Button size="sm" variant="destructive" className="h-6 text-xs px-2" onClick={() => reviewMutation.mutate({ id: s.id, status: "rejected" })}>Reject</Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Content Vault Tab ─────────────────────────────────────────────────────────

function ContentVaultTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", contentType: "chapter", accessTier: "1", contentUrl: "", fileSize: "" });

  const { data: items = [] } = useQuery({ queryKey: ["vault-items"], queryFn: () => apiFetch("/fan-hub/vault") });

  const addMutation = useMutation({
    mutationFn: (body: any) => apiFetch("/fan-hub/vault", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vault-items"] }); setAddOpen(false); toast({ title: "Content added to vault!" }); },
    onError: () => toast({ title: "Failed to add content", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/fan-hub/vault/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["vault-items"] }); toast({ title: "Item removed from vault" }); },
  });

  const tierGroups = [1, 2, 3, 4].map(t => ({
    tier: t,
    items: (items as any[]).filter(i => i.accessTier === t),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Exclusive Content Vault</h3>
          <p className="text-sm text-muted-foreground">Gated content unlocked by fan tier level</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Plus className="w-4 h-4 mr-1" />Add Content</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Add to Content Vault</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div><Label>Title *</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
              <div><Label>Description</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Content Type</Label>
                  <Select value={form.contentType} onValueChange={v => setForm(f => ({ ...f, contentType: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chapter">Chapter</SelectItem>
                      <SelectItem value="audio">Audio</SelectItem>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="image">Image</SelectItem>
                      <SelectItem value="doc">Document</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Access Tier</Label>
                  <Select value={form.accessTier} onValueChange={v => setForm(f => ({ ...f, accessTier: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Tier 1 — Curious</SelectItem>
                      <SelectItem value="2">Tier 2 — Fan</SelectItem>
                      <SelectItem value="3">Tier 3 — Soldier</SelectItem>
                      <SelectItem value="4">Tier 4 — OG</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Content URL</Label><Input value={form.contentUrl} onChange={e => setForm(f => ({ ...f, contentUrl: e.target.value }))} placeholder="https://…" /></div>
              <div><Label>File Size (optional)</Label><Input value={form.fileSize} onChange={e => setForm(f => ({ ...f, fileSize: e.target.value }))} placeholder="2.4 MB" /></div>
              <Button className="w-full" disabled={addMutation.isPending}
                onClick={() => addMutation.mutate({ ...form, accessTier: Number(form.accessTier) })}>
                {addMutation.isPending ? "Adding…" : "Add to Vault"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {tierGroups.map(({ tier, items: tierItems }) => (
        <div key={tier}>
          <div className="flex items-center gap-2 mb-3">
            {tier <= 1 ? <Unlock className="w-4 h-4 text-slate-500" /> : <Lock className="w-4 h-4 text-purple-500" />}
            <TierBadge tier={tier} />
            <span className="text-sm text-muted-foreground">({tierItems.length} items)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tierItems.map((item: any) => (
              <div key={item.id} className="rounded-lg border p-4 flex flex-col gap-2">
                <div className="flex items-start gap-2">
                  <div className="p-2 rounded-md bg-muted text-muted-foreground shrink-0">
                    {CONTENT_TYPE_ICONS[item.contentType] ?? <FileText className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{item.title}</div>
                    {item.description && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.description}</div>}
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <span className="capitalize">{item.contentType}</span>
                    {item.fileSize && <span>{item.fileSize}</span>}
                    <span>{item.downloadCount} downloads</span>
                  </div>
                  <div className="flex gap-1">
                    {item.contentUrl && (
                      <a href={item.contentUrl} target="_blank" rel="noopener noreferrer">
                        <Button size="sm" variant="outline" className="h-6 text-xs px-2">View</Button>
                      </a>
                    )}
                    <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-destructive hover:text-destructive"
                      onClick={() => deleteMutation.mutate(item.id)}>Delete</Button>
                  </div>
                </div>
              </div>
            ))}
            {tierItems.length === 0 && (
              <div className="col-span-3 text-sm text-muted-foreground py-2 pl-1">No content for this tier yet.</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Merch Codes Tab ───────────────────────────────────────────────────────────

function MerchCodesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [genOpen, setGenOpen] = useState(false);
  const [fanProfileId, setFanProfileId] = useState("");
  const [discountPercent, setDiscountPercent] = useState("15");

  const { data: codes = [] } = useQuery({ queryKey: ["merch-codes"], queryFn: () => apiFetch("/fan-hub/merch-codes") });
  const { data: fans = [] } = useQuery({ queryKey: ["fan-profiles"], queryFn: () => apiFetch("/fan-hub/profiles") });
  const tier3Fans = (fans as any[]).filter(f => f.fanTier >= 3);

  const genMutation = useMutation({
    mutationFn: (body: any) => apiFetch("/fan-hub/merch-codes/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["merch-codes"] }); setGenOpen(false); toast({ title: "Merch code generated!" }); },
    onError: (e: any) => toast({ title: e.message ?? "Failed to generate code", variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Merch Discount Codes</h3>
          <p className="text-sm text-muted-foreground">Auto-generated for Tier 3+ fans on qualification</p>
        </div>
        <Dialog open={genOpen} onOpenChange={setGenOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Tag className="w-4 h-4 mr-1" />Generate Code</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Generate Merch Code</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label>Fan (Tier 3+)</Label>
                <Select value={fanProfileId} onValueChange={setFanProfileId}>
                  <SelectTrigger><SelectValue placeholder="Select fan…" /></SelectTrigger>
                  <SelectContent>
                    {tier3Fans.map((f: any) => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.displayName} — {FAN_TIER_NAMES[f.fanTier]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Discount Percent</Label>
                <Input type="number" value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} min={5} max={50} />
              </div>
              <Button className="w-full" disabled={genMutation.isPending || !fanProfileId}
                onClick={() => genMutation.mutate({ fanProfileId: Number(fanProfileId), discountPercent: Number(discountPercent) })}>
                {genMutation.isPending ? "Generating…" : "Generate Code"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Fan</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Code</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Discount</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Generated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(codes as any[]).length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-muted-foreground">No codes generated yet</td></tr>
            ) : (codes as any[]).map((c: any) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{c.fanDisplayName ?? `Fan #${c.fanProfileId}`}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{c.code}</span>
                    <CopyButton value={c.code} />
                  </div>
                </td>
                <td className="px-4 py-3 font-medium">{c.discountPercent}% off</td>
                <td className="px-4 py-3">
                  {c.used
                    ? <Badge variant="secondary">Used {c.usedAt ? `on ${new Date(c.usedAt).toLocaleDateString()}` : ""}</Badge>
                    : <Badge variant="default" className="bg-emerald-600">Active</Badge>}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── OG Members Tab ────────────────────────────────────────────────────────────

function OGMembersTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedFanId, setSelectedFanId] = useState("");
  const [notes, setNotes] = useState("");

  const { data: ogList = [] } = useQuery({ queryKey: ["og-list"], queryFn: () => apiFetch("/fan-hub/og-list") });
  const { data: fans = [] } = useQuery({ queryKey: ["fan-profiles"], queryFn: () => apiFetch("/fan-hub/profiles") });
  const top50Fans = (fans as any[]).slice(0, 50);

  const inviteMutation = useMutation({
    mutationFn: (body: any) => apiFetch("/fan-hub/og-list/invite", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["og-list"] }); setInviteOpen(false); toast({ title: "OG invite generated!" }); },
    onError: () => toast({ title: "Failed to generate invite", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/fan-hub/og-list/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["og-list"] }); toast({ title: "Status updated" }); },
  });

  const STATUS_COLORS: Record<string, string> = {
    waitlist: "bg-slate-100 text-slate-700",
    invited: "bg-blue-100 text-blue-700",
    accepted: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold">Area Fada OG Private Group</h3>
          <p className="text-sm text-muted-foreground">Manage VIP WhatsApp invites for top fans</p>
        </div>
        <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><Crown className="w-4 h-4 mr-1" />Invite Fan</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Generate OG Invite</DialogTitle></DialogHeader>
            <div className="space-y-3 mt-2">
              <div>
                <Label>Select Fan (Top 50 by points)</Label>
                <Select value={selectedFanId} onValueChange={setSelectedFanId}>
                  <SelectTrigger><SelectValue placeholder="Select fan…" /></SelectTrigger>
                  <SelectContent>
                    {top50Fans.map((f: any) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.displayName} — {f.totalPoints.toLocaleString()} pts
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Notes</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes…" /></div>
              <Button className="w-full" disabled={inviteMutation.isPending || !selectedFanId}
                onClick={() => inviteMutation.mutate({ fanProfileId: Number(selectedFanId), notes })}>
                {inviteMutation.isPending ? "Generating…" : "Generate Invite Link"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Fan</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Points</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Invite Link</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Invited</th>
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {(ogList as any[]).length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">No OG invites yet. Invite your top fans!</td></tr>
            ) : (ogList as any[]).map((og: any) => (
              <tr key={og.id} className="hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="font-medium">{og.fanDisplayName ?? `Fan #${og.fanProfileId}`}</div>
                  {og.fanTier && <TierBadge tier={og.fanTier} />}
                </td>
                <td className="px-4 py-3 font-mono">{(og.totalPoints ?? 0).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_COLORS[og.status] ?? ""}`}>{og.status}</span>
                </td>
                <td className="px-4 py-3">
                  {og.inviteLink && (
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs max-w-[180px] truncate">{og.inviteLink}</span>
                      <CopyButton value={og.inviteLink} />
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{og.invitedAt ? new Date(og.invitedAt).toLocaleDateString() : "—"}</td>
                <td className="px-4 py-3">
                  {og.status === "invited" && (
                    <Button size="sm" variant="outline" className="h-6 text-xs px-2"
                      onClick={() => updateMutation.mutate({ id: og.id, status: "accepted" })}>
                      Mark Accepted
                    </Button>
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

// ── Analytics Tab ─────────────────────────────────────────────────────────────

function AnalyticsTab() {
  const { data: analytics } = useQuery({ queryKey: ["fan-hub-analytics"], queryFn: () => apiFetch("/fan-hub/analytics") });

  if (!analytics) return <div className="text-center py-12 text-muted-foreground">Loading analytics…</div>;

  const a = analytics as any;
  const tierData = [
    { name: "Curious (T1)", count: a.fansByTier?.["1"] ?? 0, fill: "#94a3b8" },
    { name: "Fan (T2)", count: a.fansByTier?.["2"] ?? 0, fill: "#10b981" },
    { name: "Soldier (T3)", count: a.fansByTier?.["3"] ?? 0, fill: "#a855f7" },
    { name: "OG (T4)", count: a.fansByTier?.["4"] ?? 0, fill: "#f59e0b" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{a.totalFans.toLocaleString()}</div>
            <div className="text-sm text-muted-foreground">Total Fans</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{a.fansByTier?.["4"] ?? 0}</div>
            <div className="text-sm text-muted-foreground">Area Fada OGs</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{a.fansByTier?.["2"] ?? 0}</div>
            <div className="text-sm text-muted-foreground">Verified Buyers</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-2xl font-bold">{a.referralConversionRate}</div>
            <div className="text-sm text-muted-foreground">Purchase Rate</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tier distribution */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Fans by Tier</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={tierData}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Fans" fill="#2dd172" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Weekly signups */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Weekly Signups (last 6 weeks)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={a.weeklySignups}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis dataKey="week" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="count" name="Signups" fill="#2dd172" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top challenges */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Top Challenges by Participation</CardTitle>
          </CardHeader>
          <CardContent>
            {a.topChallenges.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No challenges yet</p>
            ) : (
              <div className="space-y-3">
                {a.topChallenges.map((c: any, i: number) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="text-muted-foreground text-sm w-5">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.title}</div>
                    </div>
                    <span className="text-sm font-bold">{c.participantCount}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Popular vault items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Most Accessed Vault Content</CardTitle>
          </CardHeader>
          <CardContent>
            {a.popularVaultItems.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No vault items yet</p>
            ) : (
              <div className="space-y-3">
                {a.popularVaultItems.map((v: any, i: number) => (
                  <div key={v.id} className="flex items-center gap-3">
                    <span className="text-muted-foreground text-sm w-5">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{v.title}</div>
                    </div>
                    <span className="text-sm font-bold">{v.downloadCount}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function FanHubContent() {
  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Star className="w-6 h-6 text-amber-500" />
            Area Fada Fan Hub
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Charly Boy's '999' fan community — tier system, missions, and exclusive content</p>
        </div>
      </div>

      <Tabs defaultValue="profiles" className="w-full">
        <TabsList className="flex-wrap h-auto gap-1">
          <TabsTrigger value="profiles" className="text-xs sm:text-sm"><Users className="w-3.5 h-3.5 mr-1" />Fans</TabsTrigger>
          <TabsTrigger value="leaderboard" className="text-xs sm:text-sm"><Trophy className="w-3.5 h-3.5 mr-1" />Leaderboard</TabsTrigger>
          <TabsTrigger value="challenges" className="text-xs sm:text-sm"><Zap className="w-3.5 h-3.5 mr-1" />Challenges</TabsTrigger>
          <TabsTrigger value="vault" className="text-xs sm:text-sm"><Lock className="w-3.5 h-3.5 mr-1" />Content Vault</TabsTrigger>
          <TabsTrigger value="merch" className="text-xs sm:text-sm"><Ticket className="w-3.5 h-3.5 mr-1" />Merch Codes</TabsTrigger>
          <TabsTrigger value="og" className="text-xs sm:text-sm"><Crown className="w-3.5 h-3.5 mr-1" />OG Members</TabsTrigger>
          <TabsTrigger value="analytics" className="text-xs sm:text-sm"><BarChart3 className="w-3.5 h-3.5 mr-1" />Analytics</TabsTrigger>
        </TabsList>

        <div className="mt-4">
          <TabsContent value="profiles"><FanProfilesTab /></TabsContent>
          <TabsContent value="leaderboard"><LeaderboardTab /></TabsContent>
          <TabsContent value="challenges"><ChallengesTab /></TabsContent>
          <TabsContent value="vault"><ContentVaultTab /></TabsContent>
          <TabsContent value="merch"><MerchCodesTab /></TabsContent>
          <TabsContent value="og"><OGMembersTab /></TabsContent>
          <TabsContent value="analytics"><AnalyticsTab /></TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

export function FanHubPage() {
  return (
    <AppShell title="Fan Hub">
      <TierGuard requiredTier="agency" moduleKey="fanHub">
        <FanHubContent />
      </TierGuard>
    </AppShell>
  );
}
