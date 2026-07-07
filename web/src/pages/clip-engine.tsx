import { useState, useEffect } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(API + path, { credentials: "include", ...opts });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return null;
  return res.json();
}

const PLATFORMS = ["instagram", "youtube", "tiktok", "x", "facebook", "snapchat"];
const TONES = ["african_english", "pidgin", "yoruba", "hausa"];
const TONE_LABELS: Record<string, string> = { african_english: "African English", pidgin: "Pidgin", yoruba: "Yoruba", hausa: "Hausa" };
const FORMATS = ["9:16", "1:1", "16:9"];
const STATUS_COLORS: Record<string, string> = { draft: "bg-gray-100 text-gray-700", ready: "bg-green-100 text-green-700", scheduled: "bg-blue-100 text-blue-700", published: "bg-purple-100 text-purple-700", failed: "bg-red-100 text-red-700" };
const PLATFORM_COLORS: Record<string, string> = { instagram: "#e11d48", youtube: "#dc2626", tiktok: "#0ea5e9", x: "#1d1d1d", facebook: "#1d4ed8", snapchat: "#ca8a04" };

function fmtSeconds(s: number) {
  const m = Math.floor(s / 60), sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

function AccountCard({ account, onEdit, onDelete }: { account: ClipAccount; onEdit: (a: ClipAccount) => void; onDelete: (id: number) => void }) {
  return (
    <Card className="relative group">
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ backgroundColor: account.color }} />
      <CardContent className="pl-5 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-semibold text-sm truncate">{account.name}</span>
              <Badge className="text-xs shrink-0" variant="outline">{account.platform}</Badge>
            </div>
            <p className="text-xs text-muted-foreground truncate">{account.handle}</p>
            <p className="text-xs text-muted-foreground mt-1">
              <span className="font-medium">{account.personaLabel}</span>
              {(account.personaProfile as Record<string, string>)?.tone && (
                <> · {TONE_LABELS[(account.personaProfile as Record<string, string>).tone] ?? (account.personaProfile as Record<string, string>).tone}</>
              )}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-bold tabular-nums">{account.queueCount}</p>
            <p className="text-xs text-muted-foreground">in queue</p>
          </div>
        </div>
        <div className="flex gap-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onEdit(account)}>Edit</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => onDelete(account.id)}>Remove</Button>
        </div>
      </CardContent>
    </Card>
  );
}

interface ClipAccount { id: number; name: string; platform: string; handle: string; personaLabel: string; personaProfile: unknown; color: string; queueCount: number; status: string; }
interface SourceVideo { id: number; title: string; description?: string; url: string; durationSeconds?: number; analysisStatus: string; }
interface Moment { label: string; startSeconds: number; endSeconds: number; retentionScore: number; suggestedFormats: string[]; suggestedCaption: string; }
interface ClipJob { id: number; sourceVideoId: number; status: string; momentsDetected: Moment[]; completedAt?: string; }
interface Clip { id: number; accountId?: number; sourceVideoId: number; label: string; startSeconds: number; endSeconds: number; format: string; captionTone: string; captionText?: string; hashtags: string[]; status: string; performanceScore?: string; collabEnabled: boolean; watermarkApplied: boolean; coverFrameTime: number; }
interface ClipSchedule { id: number; clipId: number; accountId: number; scheduledAt: string; status: string; clip?: Clip; account?: ClipAccount; }
interface OverlayConfig { id: number; accountId: number; watermarkUrl?: string; watermarkPosition: string; watermarkOpacity: string; introBumperUrl?: string; endCardTemplate: string; endCardText?: string; }

function AccountsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ClipAccount | null>(null);
  const [form, setForm] = useState({ name: "", platform: "instagram", handle: "", personaLabel: "", color: "#3b82f6", tone: "african_english", region: "", ageRange: "", interests: "" });

  const { data: accounts = [], isLoading } = useQuery<ClipAccount[]>({ queryKey: ["clip-accounts"], queryFn: () => apiFetch("/clip-accounts") });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => editing
      ? apiFetch(`/clip-accounts/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : apiFetch("/clip-accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clip-accounts"] }); setOpen(false); setEditing(null); toast({ title: editing ? "Account updated" : "Account added" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const del = useMutation({
    mutationFn: (id: number) => apiFetch(`/clip-accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clip-accounts"] }); toast({ title: "Account removed" }); },
  });

  function openAdd() { setEditing(null); setForm({ name: "", platform: "instagram", handle: "", personaLabel: "", color: "#3b82f6", tone: "african_english", region: "", ageRange: "", interests: "" }); setOpen(true); }
  function openEdit(a: ClipAccount) {
    const p = a.personaProfile as Record<string, string>;
    setEditing(a); setForm({ name: a.name, platform: a.platform, handle: a.handle, personaLabel: a.personaLabel, color: a.color, tone: p?.tone ?? "african_english", region: p?.region ?? "", ageRange: p?.ageRange ?? "", interests: (p?.interests as unknown as string[])?.join(", ") ?? "" });
    setOpen(true);
  }

  function submit() {
    save.mutate({ name: form.name, platform: form.platform, handle: form.handle, personaLabel: form.personaLabel || "General", color: form.color, personaProfile: { tone: form.tone, region: form.region || undefined, ageRange: form.ageRange || undefined, interests: form.interests ? form.interests.split(",").map(s => s.trim()) : undefined } });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{accounts.length} / 50 accounts</p>
        </div>
        <Button onClick={openAdd} disabled={accounts.length >= 50}>+ Add Account</Button>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Loading accounts…</p> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {accounts.map(a => <AccountCard key={a.id} account={a} onEdit={openEdit} onDelete={(id) => del.mutate(id)} />)}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? "Edit Account" : "Add Clip Account"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="CharlyBoy IG (Lagos)" /></div>
              <div className="space-y-1"><Label>Platform</Label>
                <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Handle</Label><Input value={form.handle} onChange={e => setForm(f => ({ ...f, handle: e.target.value }))} placeholder="@handle" /></div>
              <div className="space-y-1"><Label>Persona Label</Label><Input value={form.personaLabel} onChange={e => setForm(f => ({ ...f, personaLabel: e.target.value }))} placeholder="Street Audience" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Caption Tone</Label>
                <Select value={form.tone} onValueChange={v => setForm(f => ({ ...f, tone: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TONES.map(t => <SelectItem key={t} value={t}>{TONE_LABELS[t]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1"><Label>Region</Label><Input value={form.region} onChange={e => setForm(f => ({ ...f, region: e.target.value }))} placeholder="Lagos, Abuja…" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Age Range</Label><Input value={form.ageRange} onChange={e => setForm(f => ({ ...f, ageRange: e.target.value }))} placeholder="18-30" /></div>
              <div className="space-y-1"><Label>Colour</Label><Input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="h-9 cursor-pointer" /></div>
            </div>
            <div className="space-y-1"><Label>Interests (comma-separated)</Label><Input value={form.interests} onChange={e => setForm(f => ({ ...f, interests: e.target.value }))} placeholder="music, culture, politics" /></div>
            <Button className="w-full" onClick={submit} disabled={save.isPending}>
              {save.isPending ? "Saving…" : (editing ? "Update Account" : "Add Account")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PipelineTab({ accounts }: { accounts: ClipAccount[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState({ title: "", description: "", url: "", durationSeconds: "", transcript: "" });
  const [selectedVideo, setSelectedVideo] = useState<SourceVideo | null>(null);
  const [job, setJob] = useState<ClipJob | null>(null);
  const [distribAccounts, setDistribAccounts] = useState<number[]>([]);

  const { data: videos = [] } = useQuery<SourceVideo[]>({ queryKey: ["source-videos"], queryFn: () => apiFetch("/source-videos") });

  const addVideo = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/source-videos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: (v: SourceVideo) => { qc.invalidateQueries({ queryKey: ["source-videos"] }); setSelectedVideo(v); setForm({ title: "", description: "", url: "", durationSeconds: "", transcript: "" }); toast({ title: "Video added" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const analyze = useMutation({
    mutationFn: (id: number) => apiFetch(`/source-videos/${id}/analyze`, { method: "POST" }),
    onSuccess: (j: ClipJob) => { setJob(j); toast({ title: `${j.momentsDetected.length} moments detected!` }); },
    onError: (e: Error) => toast({ title: "Analysis failed", description: e.message, variant: "destructive" }),
  });

  const distribute = useMutation({
    mutationFn: ({ videoId, accountIds }: { videoId: number; accountIds: number[] }) =>
      apiFetch(`/source-videos/${videoId}/distribute`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accountIds }) }),
    onSuccess: (r: { distributed: Array<{ accountName: string; momentLabel: string; format: string; tone: string }> }) => {
      qc.invalidateQueries({ queryKey: ["clips"] });
      qc.invalidateQueries({ queryKey: ["clip-accounts"] });
      toast({ title: `Distributed to ${r.distributed.length} accounts`, description: "Unique clip+tone combinations assigned" });
    },
    onError: (e: Error) => toast({ title: "Distribution failed", description: e.message, variant: "destructive" }),
  });

  function toggleAccount(id: number) { setDistribAccounts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]); }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Add Source Video</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1"><Label>Title</Label><Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Area Fada Podcast Ep. 12" /></div>
            <div className="space-y-1"><Label>Video URL</Label><Input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://…" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Duration (seconds)</Label><Input type="number" value={form.durationSeconds} onChange={e => setForm(f => ({ ...f, durationSeconds: e.target.value }))} placeholder="5400" /></div>
            </div>
            <div className="space-y-1"><Label>Description / Context</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} placeholder="What is this video about?" /></div>
            <div className="space-y-1"><Label>Transcript (optional — improves AI accuracy)</Label><Textarea value={form.transcript} onChange={e => setForm(f => ({ ...f, transcript: e.target.value }))} rows={3} placeholder="Paste transcript excerpt…" /></div>
            <Button className="w-full" onClick={() => addVideo.mutate({ ...form, durationSeconds: form.durationSeconds ? Number(form.durationSeconds) : undefined })} disabled={addVideo.isPending || !form.title || !form.url}>
              {addVideo.isPending ? "Adding…" : "Add Video"}
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <p className="text-sm font-medium">Source Videos ({videos.length})</p>
          {videos.map(v => (
            <Card key={v.id} className={`cursor-pointer transition-all ${selectedVideo?.id === v.id ? "ring-2 ring-primary" : "hover:bg-muted/50"}`} onClick={() => { setSelectedVideo(v); setJob(null); }}>
              <CardContent className="py-3 px-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{v.title}</p>
                  <p className="text-xs text-muted-foreground">{v.durationSeconds ? `${Math.floor(v.durationSeconds / 60)}min` : "–"}</p>
                </div>
                <Badge className={v.analysisStatus === "analyzed" ? "bg-green-100 text-green-700" : v.analysisStatus === "analyzing" ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-700"}>
                  {v.analysisStatus}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {selectedVideo && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">AI Moment Detection — {selectedVideo.title}</CardTitle>
              <Button onClick={() => analyze.mutate(selectedVideo.id)} disabled={analyze.isPending}>
                {analyze.isPending ? "Analysing with AI…" : "Detect Moments"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {job && job.momentsDetected.length > 0 ? (
              <div className="space-y-3">
                {job.momentsDetected.map((m, i) => (
                  <div key={i} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium">{m.label}</span>
                        <span className="text-xs text-muted-foreground">{fmtSeconds(m.startSeconds)} – {fmtSeconds(m.endSeconds)}</span>
                        {m.suggestedFormats.map(f => <Badge key={f} variant="outline" className="text-xs">{f}</Badge>)}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2">{m.suggestedCaption}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-green-600">{m.retentionScore}</p>
                      <p className="text-xs text-muted-foreground">score</p>
                    </div>
                  </div>
                ))}

                <div className="mt-4 space-y-3 border-t pt-4">
                  <p className="text-sm font-medium">Distribute to accounts (unique clips per account):</p>
                  <div className="flex flex-wrap gap-2">
                    {accounts.map(a => (
                      <button key={a.id} onClick={() => toggleAccount(a.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border-2 ${distribAccounts.includes(a.id) ? "text-white" : "bg-background text-foreground"}`}
                        style={{ borderColor: a.color, backgroundColor: distribAccounts.includes(a.id) ? a.color : undefined }}>
                        {a.name}
                      </button>
                    ))}
                  </div>
                  <Button onClick={() => distribute.mutate({ videoId: selectedVideo.id, accountIds: distribAccounts })} disabled={distribute.isPending || distribAccounts.length === 0}>
                    {distribute.isPending ? "Distributing…" : `Distribute to ${distribAccounts.length} account${distribAccounts.length !== 1 ? "s" : ""}`}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Click "Detect Moments" to run AI analysis. Identified moments will appear here as clip cards.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ClipsTab({ accounts }: { accounts: ClipAccount[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filterAccount, setFilterAccount] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [genCaptions, setGenCaptions] = useState<{ clipId: number; captions: Record<string, { caption: string; hashtags: string[]; cta: string }> } | null>(null);

  const { data: clips = [] } = useQuery<Clip[]>({
    queryKey: ["clips", filterAccount, filterStatus],
    queryFn: () => {
      const params = new URLSearchParams();
      if (filterAccount !== "all") params.set("accountId", filterAccount);
      if (filterStatus !== "all") params.set("status", filterStatus);
      return apiFetch(`/clips${params.size ? "?" + params : ""}`);
    },
  });

  const generateCaption = useMutation({
    mutationFn: (clipId: number) => apiFetch(`/clips/${clipId}/generate-caption`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tones: TONES }) }),
    onSuccess: (r: { clipId: number; captions: Record<string, { caption: string; hashtags: string[]; cta: string }> }) => { setGenCaptions(r); },
    onError: (e: Error) => toast({ title: "Caption generation failed", description: e.message, variant: "destructive" }),
  });

  const applyCaption = useMutation({
    mutationFn: ({ id, captionText, captionTone, hashtags }: { id: number; captionText: string; captionTone: string; hashtags: string[] }) =>
      apiFetch(`/clips/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ captionText, captionTone, hashtags }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clips"] }); setGenCaptions(null); toast({ title: "Caption applied" }); },
  });

  const setCollab = useMutation({
    mutationFn: ({ id, collabAccountId }: { id: number; collabAccountId: number }) =>
      apiFetch(`/clips/${id}/collab`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ collabAccountId }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clips"] }); toast({ title: "Collab clip queued from both accounts" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));
  const [collabTarget, setCollabTarget] = useState<{ clipId: number; accountId: string; scheduledAt: string } | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={filterAccount} onValueChange={setFilterAccount}>
          <SelectTrigger className="w-44"><SelectValue placeholder="All accounts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            {["all", "draft", "ready", "scheduled", "published"].map(s => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {clips.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No clips yet. Use the Pipeline tab to generate clips from a source video.</CardContent></Card>
      ) : (
        <div className="space-y-2">
          {clips.map(clip => {
            const acct = clip.accountId ? accountMap[clip.accountId] : null;
            return (
              <Card key={clip.id}>
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    {acct && <div className="w-1 h-12 rounded-full shrink-0 mt-0.5" style={{ backgroundColor: acct.color }} />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-sm font-medium truncate">{clip.label}</span>
                        <Badge className="text-xs" variant="outline">{clip.format}</Badge>
                        <Badge className={`text-xs ${STATUS_COLORS[clip.status] ?? ""}`}>{clip.status}</Badge>
                        {clip.collabEnabled && <Badge className="text-xs bg-amber-100 text-amber-700">collab</Badge>}
                        {clip.watermarkApplied && <Badge className="text-xs bg-teal-100 text-teal-700">watermarked</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>{fmtSeconds(clip.startSeconds)} – {fmtSeconds(clip.endSeconds)}</span>
                        <span>{TONE_LABELS[clip.captionTone] ?? clip.captionTone}</span>
                        {acct && <span style={{ color: acct.color }}>{acct.name}</span>}
                      </div>
                      {clip.captionText && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{clip.captionText}</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => generateCaption.mutate(clip.id)} disabled={generateCaption.isPending}>
                        AI Caption
                      </Button>
                      {!clip.collabEnabled && (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-amber-700 border-amber-300 hover:bg-amber-50"
                          onClick={() => setCollabTarget({ clipId: clip.id, accountId: "", scheduledAt: "" })}>
                          🤝 Collab
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {collabTarget && (
        <Dialog open onOpenChange={() => setCollabTarget(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Enable Collab Mode</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">Select a second account to post this clip simultaneously. The collaborating account's handle will be auto-tagged in both captions.</p>
            <div className="space-y-1 mt-2">
              <Label>Collab Account</Label>
              <Select value={collabTarget.accountId} onValueChange={v => setCollabTarget(t => t ? { ...t, accountId: v } : null)}>
                <SelectTrigger><SelectValue placeholder="Pick an account…" /></SelectTrigger>
                <SelectContent>
                  {accounts.filter(a => a.id !== clips.find(c => c.id === collabTarget.clipId)?.accountId).map(a => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: a.color }} />{a.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Schedule At <span className="text-muted-foreground font-normal">(optional — defaults to 1 hour from now)</span></Label>
              <Input type="datetime-local" value={collabTarget.scheduledAt} onChange={e => setCollabTarget(t => t ? { ...t, scheduledAt: e.target.value } : null)} />
            </div>
            <div className="flex gap-2 mt-3 justify-end">
              <Button variant="outline" size="sm" onClick={() => setCollabTarget(null)}>Cancel</Button>
              <Button size="sm" disabled={!collabTarget.accountId || setCollab.isPending}
                onClick={() => setCollab.mutate({ id: collabTarget.clipId, collabAccountId: Number(collabTarget.accountId), ...(collabTarget.scheduledAt ? { scheduledAt: new Date(collabTarget.scheduledAt).toISOString() } : {}) }, { onSuccess: () => setCollabTarget(null) })}>
                {setCollab.isPending ? "Setting up…" : "Enable Collab"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {genCaptions && (
        <Dialog open onOpenChange={() => setGenCaptions(null)}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>AI-Generated Captions</DialogTitle></DialogHeader>
            <div className="space-y-4">
              {Object.entries(genCaptions.captions).map(([tone, cap]) => (
                <Card key={tone}>
                  <CardContent className="py-3 px-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">{TONE_LABELS[tone] ?? tone}</Badge>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => applyCaption.mutate({ id: genCaptions.clipId, captionText: cap.caption, captionTone: tone, hashtags: cap.hashtags })}>Apply</Button>
                    </div>
                    <p className="text-sm">{cap.caption}</p>
                    <p className="text-xs text-muted-foreground">{cap.cta}</p>
                    <div className="flex flex-wrap gap-1">{cap.hashtags.map(h => <Badge key={h} variant="outline" className="text-xs">{h}</Badge>)}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function CalendarTab({ accounts }: { accounts: ClipAccount[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { data: calData = [], isLoading: calLoading } = useQuery<Array<{ schedule: ClipSchedule; clip: Clip | null; account: ClipAccount | null }>>({
    queryKey: ["clip-schedules-calendar"],
    queryFn: () => apiFetch(`/clip-schedules/calendar?from=${today.toISOString()}`),
  });

  const { data: clips = [] } = useQuery<Clip[]>({ queryKey: ["clips"], queryFn: () => apiFetch("/clips") });

  const [schedForm, setSchedForm] = useState({ clipId: "", accountId: "", scheduledAt: "" });
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkClips, setBulkClips] = useState<number[]>([]);
  const [bulkAccounts, setBulkAccounts] = useState<number[]>([]);
  const [bulkStartDate, setBulkStartDate] = useState("");
  const [bulkTime, setBulkTime] = useState("10:00");
  const [bulkIntervalDays, setBulkIntervalDays] = useState("1");

  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [emailList, setEmailList] = useState<string[]>([]);

  const addSchedule = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/clip-schedules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clip-schedules-calendar"] }); toast({ title: "Clip scheduled" }); setSchedForm({ clipId: "", accountId: "", scheduledAt: "" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bulkSchedule = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/clip-schedules/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: (r: { count: number }) => {
      qc.invalidateQueries({ queryKey: ["clip-schedules-calendar"] });
      toast({ title: `${r.count} clips scheduled`, description: "Your 30-day content calendar has been populated." });
      setBulkClips([]); setBulkAccounts([]); setBulkStartDate(""); setBulkMode(false);
    },
    onError: (e: Error) => toast({ title: "Bulk schedule failed", description: e.message, variant: "destructive" }),
  });

  const delSchedule = useMutation({
    mutationFn: (id: number) => apiFetch(`/clip-schedules/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clip-schedules-calendar"] }); toast({ title: "Removed from schedule" }); },
  });

  const sendScheduleEmail = useMutation({
    mutationFn: (recipients: string[]) => apiFetch("/clip-schedules/export-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients }),
    }),
    onSuccess: (r: { status: string; recipients: number; scheduleCount: number }) => {
      setSendModalOpen(false);
      setEmailList([]);
      setEmailInput("");
      if (r.status === "simulated") {
        toast({
          title: "⚠️ Email simulated (dev mode)",
          description: `No email was actually delivered. Set RESEND_API_KEY to enable real delivery. Would have sent ${r.scheduleCount} clip${r.scheduleCount !== 1 ? "s" : ""} to ${r.recipients} recipient${r.recipients !== 1 ? "s" : ""}.`,
          variant: "destructive",
        });
      } else {
        toast({ title: "Schedule emailed!", description: `${r.scheduleCount} clip${r.scheduleCount !== 1 ? "s" : ""} sent to ${r.recipients} recipient${r.recipients !== 1 ? "s" : ""}` });
      }
    },
    onError: (e: Error) => toast({ title: "Failed to send", description: e.message, variant: "destructive" }),
  });

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function addEmail() {
    const trimmed = emailInput.trim();
    if (!trimmed) return;
    const raw = trimmed.split(/[,;\s]+/).map(e => e.trim()).filter(Boolean);
    const valid: string[] = [];
    const bad: string[] = [];
    for (const e of raw) {
      if (!EMAIL_RE.test(e)) { bad.push(e); continue; }
      if (!emailList.includes(e)) valid.push(e);
    }
    if (bad.length > 0) toast({ title: "Invalid email(s)", description: bad.join(", "), variant: "destructive" });
    if (valid.length > 0) setEmailList(prev => [...prev, ...valid]);
    setEmailInput("");
  }

  function removeEmail(email: string) {
    setEmailList(prev => prev.filter(e => e !== email));
  }

  function buildBulkPayload() {
    if (!bulkStartDate || bulkClips.length === 0 || bulkAccounts.length === 0) return null;
    const interval = Math.max(1, Number(bulkIntervalDays));
    const schedules: Array<{ clipId: number; accountId: number; scheduledAt: string }> = [];
    let dayOffset = 0;
    for (let ai = 0; ai < bulkAccounts.length; ai++) {
      for (let ci = 0; ci < bulkClips.length; ci++) {
        const dt = new Date(`${bulkStartDate}T${bulkTime}:00`);
        dt.setDate(dt.getDate() + dayOffset * interval);
        schedules.push({ clipId: bulkClips[ci], accountId: bulkAccounts[ai], scheduledAt: dt.toISOString() });
        dayOffset++;
      }
    }
    return schedules;
  }

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));
  const days: Date[] = Array.from({ length: 30 }, (_, i) => new Date(today.getTime() + i * 86400000));

  function exportCSV() {
    const header = ["Date", "Time", "Account", "Account Color", "Platform", "Clip Label", "Format", "Status"];
    const rows = calData
      .slice()
      .sort((a, b) => a.schedule.scheduledAt.localeCompare(b.schedule.scheduledAt))
      .map(item => {
        const dt = new Date(item.schedule.scheduledAt);
        return [
          dt.toLocaleDateString("en-NG", { year: "numeric", month: "2-digit", day: "2-digit" }),
          dt.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: false }),
          item.account?.name ?? "",
          item.account?.color ?? "",
          item.account?.platform ?? "",
          item.clip?.label ?? "",
          item.clip?.format ?? "",
          item.schedule.status,
        ].map(v => `"${String(v).replace(/"/g, '""')}"`);
      });

    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fromDate = new Date().toISOString().slice(0, 10);
    a.download = `clip-schedule-${fromDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportICS() {
    const escapeICS = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//AreaFada OS//Clip Schedule//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
    ];

    calData
      .slice()
      .sort((a, b) => a.schedule.scheduledAt.localeCompare(b.schedule.scheduledAt))
      .forEach(item => {
        const start = new Date(item.schedule.scheduledAt);
        const end = new Date(start.getTime() + 60 * 60 * 1000);

        const toICSDate = (d: Date) =>
          d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

        const uid = `clip-schedule-${item.schedule.id}@areafada.os`;
        const summary = [item.clip?.label ?? "Clip", item.account?.name ? `— ${item.account.name}` : ""].filter(Boolean).join(" ");
        const description = [
          `Format: ${item.clip?.format ?? ""}`,
          `Platform: ${item.account?.platform ?? ""}`,
          `Status: ${item.schedule.status}`,
          item.clip?.captionText ? `Caption: ${item.clip.captionText}` : "",
        ].filter(Boolean).join("\\n");

        lines.push(
          "BEGIN:VEVENT",
          `UID:${uid}`,
          `DTSTART:${toICSDate(start)}`,
          `DTEND:${toICSDate(end)}`,
          `SUMMARY:${escapeICS(summary)}`,
          `DESCRIPTION:${escapeICS(description)}`,
          `CATEGORIES:${escapeICS(item.account?.platform ?? "clip")}`,
          "END:VEVENT",
        );
      });

    lines.push("END:VCALENDAR");

    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const fromDate = new Date().toISOString().slice(0, 10);
    a.download = `clip-schedule-${fromDate}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant={!bulkMode ? "default" : "outline"} size="sm" onClick={() => setBulkMode(false)}>Single Schedule</Button>
        <Button variant={bulkMode ? "default" : "outline"} size="sm" onClick={() => setBulkMode(true)}>Bulk Schedule (30-day)</Button>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={calLoading || calData.length === 0} title={calLoading ? "Loading schedule…" : "Download a CSV of the next 30 days"}>
          {calLoading ? "⏳ Loading…" : "⬇ Export CSV"}
        </Button>
        <Button variant="outline" size="sm" onClick={exportICS} disabled={calLoading || calData.length === 0} title={calLoading ? "Loading schedule…" : "Download .ics for Google Calendar or Apple Calendar"}>
          {calLoading ? "⏳ Loading…" : "📅 Add to Google Calendar"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setSendModalOpen(true); setEmailList([]); setEmailInput(""); }} title="Email the 30-day schedule to your team">
          ✉ Send to Team
        </Button>
      </div>

      <Dialog open={sendModalOpen} onOpenChange={setSendModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send Schedule to Team</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Your 30-day clip schedule will be emailed as a CSV attachment with a branded AreaFada OS summary. Add up to 20 recipients.
            </p>
            <div className="space-y-2">
              <Label>Recipient email addresses</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="editor@team.com"
                  value={emailInput}
                  onChange={e => setEmailInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addEmail(); } }}
                  className="flex-1"
                />
                <Button type="button" variant="outline" size="sm" onClick={addEmail} disabled={!emailInput.trim()}>Add</Button>
              </div>
              <p className="text-xs text-muted-foreground">Press Enter or comma to add. You can paste multiple addresses separated by commas.</p>
            </div>

            {emailList.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 rounded-lg border bg-muted/30">
                {emailList.map(email => (
                  <span key={email} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                    {email}
                    <button onClick={() => removeEmail(email)} className="ml-0.5 opacity-60 hover:opacity-100 text-base leading-none">×</button>
                  </span>
                ))}
              </div>
            )}

            <div className="p-3 rounded-lg bg-muted text-xs space-y-1">
              <p className="font-medium">What gets sent</p>
              <p className="text-muted-foreground">A branded email with a summary table of your next {calData.length} scheduled clip{calData.length !== 1 ? "s" : ""}, plus the full CSV attached.</p>
            </div>

            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={() => setSendModalOpen(false)}>Cancel</Button>
              <Button
                onClick={() => sendScheduleEmail.mutate(emailList)}
                disabled={sendScheduleEmail.isPending || emailList.length === 0}
              >
                {sendScheduleEmail.isPending ? "Sending…" : `Send to ${emailList.length} recipient${emailList.length !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {!bulkMode ? (
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Schedule a Clip</CardTitle></CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-end">
              <div className="space-y-1 flex-1 min-w-40">
                <Label>Clip</Label>
                <Select value={schedForm.clipId} onValueChange={v => setSchedForm(f => ({ ...f, clipId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select clip" /></SelectTrigger>
                  <SelectContent>{clips.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.label} ({c.format})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1 flex-1 min-w-40">
                <Label>Account</Label>
                <Select value={schedForm.accountId} onValueChange={v => setSchedForm(f => ({ ...f, accountId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                  <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Date & Time</Label>
                <Input type="datetime-local" value={schedForm.scheduledAt} onChange={e => setSchedForm(f => ({ ...f, scheduledAt: e.target.value }))} />
              </div>
              <Button onClick={() => addSchedule.mutate({ clipId: Number(schedForm.clipId), accountId: Number(schedForm.accountId), scheduledAt: new Date(schedForm.scheduledAt).toISOString() })} disabled={addSchedule.isPending || !schedForm.clipId || !schedForm.accountId || !schedForm.scheduledAt}>
                Schedule
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Bulk Schedule — Populate 30 Days</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Select clips and accounts. Each clip×account combination is assigned one slot, spaced by the interval you set, starting from your chosen date.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Select Clips</Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30">
                {clips.length === 0 && <p className="text-xs text-muted-foreground">No clips available. Generate some from the Pipeline tab first.</p>}
                {clips.map(c => (
                  <button key={c.id} onClick={() => setBulkClips(prev => prev.includes(c.id) ? prev.filter(x => x !== c.id) : [...prev, c.id])}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${bulkClips.includes(c.id) ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary"}`}>
                    {c.label} <span className="opacity-60">({c.format})</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Select Accounts</Label>
              <div className="flex flex-wrap gap-2 p-3 border rounded-lg bg-muted/30">
                {accounts.map(a => (
                  <button key={a.id} onClick={() => setBulkAccounts(prev => prev.includes(a.id) ? prev.filter(x => x !== a.id) : [...prev, a.id])}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border-2`}
                    style={{ borderColor: a.color, backgroundColor: bulkAccounts.includes(a.id) ? a.color : undefined, color: bulkAccounts.includes(a.id) ? "white" : undefined }}>
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input type="date" value={bulkStartDate} onChange={e => setBulkStartDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Post Time</Label>
                <Input type="time" value={bulkTime} onChange={e => setBulkTime(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Interval (days)</Label>
                <Input type="number" min="1" max="7" value={bulkIntervalDays} onChange={e => setBulkIntervalDays(e.target.value)} />
              </div>
            </div>
            {bulkClips.length > 0 && bulkAccounts.length > 0 && bulkStartDate && (
              <div className="p-3 rounded-lg bg-muted text-xs space-y-1">
                <p className="font-medium">Preview: {bulkClips.length} clips × {bulkAccounts.length} accounts = <strong>{bulkClips.length * bulkAccounts.length} scheduled posts</strong></p>
                <p className="text-muted-foreground">Starting {bulkStartDate} at {bulkTime}, one post every {bulkIntervalDays} day(s) per account.</p>
              </div>
            )}
            <Button className="w-full" onClick={() => { const s = buildBulkPayload(); if (s) bulkSchedule.mutate({ schedules: s }); }}
              disabled={bulkSchedule.isPending || !bulkStartDate || bulkClips.length === 0 || bulkAccounts.length === 0}>
              {bulkSchedule.isPending ? "Scheduling…" : `Schedule ${bulkClips.length * bulkAccounts.length || 0} Posts`}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">30-Day Content Calendar</p>
        <p className="text-xs text-muted-foreground">Drag a clip from the left panel onto any day to schedule it instantly.</p>
        <div className="flex gap-4">
          {/* Draggable clip pool */}
          <div className="w-44 shrink-0 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Clips</p>
            {clips.length === 0 && <p className="text-xs text-muted-foreground">No clips yet.</p>}
            {clips.map(c => {
              const acct = c.accountId ? accountMap[c.accountId] : null;
              return (
                <div key={c.id} draggable
                  onDragStart={e => { e.dataTransfer.setData("clipId", String(c.id)); e.dataTransfer.setData("accountId", String(c.accountId ?? "")); e.dataTransfer.effectAllowed = "copy"; }}
                  className="px-2 py-1.5 rounded-lg border text-xs font-medium cursor-grab active:cursor-grabbing select-none flex items-center gap-1.5"
                  style={{ borderColor: acct?.color ?? "#e2e8f0", backgroundColor: acct ? `${acct.color}18` : undefined }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: acct?.color ?? "#94a3b8" }} />
                  <span className="truncate">{c.label}</span>
                </div>
              );
            })}
          </div>

          {/* Calendar days with drop zones */}
          <div className="flex-1 overflow-x-auto">
            <div className="min-w-[500px] space-y-0">
              {days.map(day => {
                const dayKey = day.toISOString().slice(0, 10);
                const dayItems = calData.filter(c => c.schedule.scheduledAt.slice(0, 10) === dayKey);
                return (
                  <div key={dayKey}
                    className="flex items-start gap-2 py-1.5 border-b last:border-0 min-h-[36px] transition-colors"
                    onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("bg-primary/5"); }}
                    onDragLeave={e => e.currentTarget.classList.remove("bg-primary/5")}
                    onDrop={e => {
                      e.preventDefault();
                      e.currentTarget.classList.remove("bg-primary/5");
                      const clipId = Number(e.dataTransfer.getData("clipId"));
                      const rawAcctId = e.dataTransfer.getData("accountId");
                      const accountId = rawAcctId ? Number(rawAcctId) : (accounts[0]?.id ?? 0);
                      if (!clipId || !accountId) return;
                      const scheduledAt = new Date(`${dayKey}T10:00:00`).toISOString();
                      addSchedule.mutate({ clipId, accountId, scheduledAt });
                    }}>
                    <div className="w-20 shrink-0 text-xs font-medium text-muted-foreground pt-0.5">
                      {day.toLocaleDateString("en-NG", { weekday: "short", month: "short", day: "numeric" })}
                    </div>
                    <div className="flex flex-wrap gap-1.5 flex-1">
                      {dayItems.length === 0 && <span className="text-xs text-muted-foreground/40 italic">drop here</span>}
                      {dayItems.map(item => (
                        <div key={item.schedule.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs text-white font-medium" style={{ backgroundColor: item.account?.color ?? "#6b7280" }}>
                          <span>{item.clip?.label ?? "Clip"}</span>
                          <span className="opacity-75">·</span>
                          <span className="opacity-75">{item.schedule.scheduledAt.slice(11, 16)}</span>
                          <button onClick={() => delSchedule.mutate(item.schedule.id)} className="ml-0.5 opacity-75 hover:opacity-100">×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function OverlayTab({ accounts }: { accounts: ClipAccount[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [selectedAccount, setSelectedAccount] = useState<number | null>(accounts[0]?.id ?? null);
  const [form, setForm] = useState({ watermarkUrl: "", watermarkPosition: "bottom_right", watermarkOpacity: "0.80", introBumperUrl: "", endCardTemplate: "minimal", endCardText: "" });
  const [editingId, setEditingId] = useState<number | null>(null);

  const { data: configs = [] } = useQuery<OverlayConfig[]>({
    queryKey: ["brand-overlay-configs", selectedAccount],
    queryFn: () => apiFetch(`/brand-overlay-configs${selectedAccount ? "?accountId=" + selectedAccount : ""}`),
  });

  const existing = configs.find(c => c.accountId === selectedAccount);

  // Reliably hydrate form whenever configs refetches after account switch
  useEffect(() => {
    const cfg = configs.find(c => c.accountId === selectedAccount);
    if (cfg) {
      setEditingId(cfg.id);
      setForm({ watermarkUrl: cfg.watermarkUrl ?? "", watermarkPosition: cfg.watermarkPosition, watermarkOpacity: cfg.watermarkOpacity, introBumperUrl: cfg.introBumperUrl ?? "", endCardTemplate: cfg.endCardTemplate, endCardText: cfg.endCardText ?? "" });
    } else {
      setEditingId(null);
      setForm({ watermarkUrl: "", watermarkPosition: "bottom_right", watermarkOpacity: "0.80", introBumperUrl: "", endCardTemplate: "minimal", endCardText: "" });
    }
  }, [configs, selectedAccount]);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => editingId
      ? apiFetch(`/brand-overlay-configs/${editingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : apiFetch("/brand-overlay-configs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["brand-overlay-configs"] }); toast({ title: "Overlay config saved" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function selectAccount(id: number) {
    setSelectedAccount(id);
    // Form state will hydrate via useEffect once configs refetches for the new account
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="space-y-2">
        <p className="text-sm font-medium">Select Account</p>
        {accounts.map(a => (
          <button key={a.id} onClick={() => selectAccount(a.id)} className={`w-full text-left p-3 rounded-lg border transition-all flex items-center gap-2 ${selectedAccount === a.id ? "ring-2 ring-primary bg-muted" : "hover:bg-muted/50"}`}>
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{a.name}</p>
              <p className="text-xs text-muted-foreground">{a.handle}</p>
            </div>
            {configs.some(c => c.accountId === a.id) && <Badge className="ml-auto text-xs bg-green-100 text-green-700 shrink-0">configured</Badge>}
          </button>
        ))}
      </div>

      <div className="lg:col-span-2">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Brand Overlay Settings{selectedAccount && accounts.find(a => a.id === selectedAccount) ? ` — ${accounts.find(a => a.id === selectedAccount)?.name}` : ""}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Watermark URL</Label><Input value={form.watermarkUrl} onChange={e => setForm(f => ({ ...f, watermarkUrl: e.target.value }))} placeholder="https://…/logo.png" /></div>
              <div className="space-y-1"><Label>Position</Label>
                <Select value={form.watermarkPosition} onValueChange={v => setForm(f => ({ ...f, watermarkPosition: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["top_left", "top_right", "bottom_left", "bottom_right", "center"].map(p => <SelectItem key={p} value={p}>{p.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1"><Label>Opacity (0–1)</Label><Input type="number" min="0" max="1" step="0.05" value={form.watermarkOpacity} onChange={e => setForm(f => ({ ...f, watermarkOpacity: e.target.value }))} /></div>
              <div className="space-y-1"><Label>End-Card Template</Label>
                <Select value={form.endCardTemplate} onValueChange={v => setForm(f => ({ ...f, endCardTemplate: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["minimal", "branded", "cta", "subscribe"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1"><Label>Intro Bumper Video URL</Label><Input value={form.introBumperUrl} onChange={e => setForm(f => ({ ...f, introBumperUrl: e.target.value }))} placeholder="https://…/intro.mp4" /></div>
            <div className="space-y-1"><Label>End-Card Text</Label><Input value={form.endCardText} onChange={e => setForm(f => ({ ...f, endCardText: e.target.value }))} placeholder="Follow @AreaFada for more 🔥" /></div>

            <div className="p-3 rounded-lg bg-muted text-xs space-y-1">
              <p className="font-medium">Preview</p>
              <p>Watermark: {form.watermarkPosition.replace("_", " ")} · {(Number(form.watermarkOpacity) * 100).toFixed(0)}% opacity</p>
              <p>End card: {form.endCardTemplate} — "{form.endCardText || "–"}"</p>
              <p className="text-muted-foreground">Video transcoding (FFmpeg watermark burn) queued via processing job stub on publish.</p>
            </div>

            <Button className="w-full" onClick={() => save.mutate({ accountId: selectedAccount, ...form, watermarkUrl: form.watermarkUrl || undefined, introBumperUrl: form.introBumperUrl || undefined })} disabled={save.isPending || !selectedAccount}>
              {save.isPending ? "Saving…" : (existing ? "Update Overlay Config" : "Save Overlay Config")}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PerformanceTab({ accounts }: { accounts: ClipAccount[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [logForm, setLogForm] = useState({ clipId: "", accountId: "", views: "", shares: "", comments: "", saves: "", watchTimeSeconds: "" });

  const { data: clips = [] } = useQuery<Clip[]>({ queryKey: ["clips"], queryFn: () => apiFetch("/clips") });
  const { data: summary } = useQuery<{ totals: Record<string, number>; topClips: Clip[]; byFormat: Record<string, { count: number; avgScore: number }> }>({
    queryKey: ["clip-performance-summary"],
    queryFn: () => apiFetch("/clip-performance/summary"),
  });

  const logPerf = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiFetch("/clip-performance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clip-performance-summary"] }); toast({ title: "Performance logged" }); setLogForm({ clipId: "", accountId: "", views: "", shares: "", comments: "", saves: "", watchTimeSeconds: "" }); },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));

  return (
    <div className="space-y-6">
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[["Views", summary.totals.views], ["Shares", summary.totals.shares], ["Saves", summary.totals.saves], ["Comments", summary.totals.comments]].map(([label, val]) => (
            <Card key={label as string}><CardContent className="py-4 text-center"><p className="text-2xl font-bold">{(val as number).toLocaleString()}</p><p className="text-xs text-muted-foreground">{label as string}</p></CardContent></Card>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {summary && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Top Clips by Score</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {summary.topClips.length === 0 ? <p className="text-sm text-muted-foreground">No performance data yet.</p> : summary.topClips.slice(0, 8).map((c, i) => {
                const acct = c.accountId ? accountMap[c.accountId] : null;
                return (
                  <div key={c.id} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                    {acct && <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: acct.color }} />}
                    <span className="text-sm flex-1 truncate">{c.label}</span>
                    <Badge variant="outline" className="text-xs">{c.format}</Badge>
                    <span className="text-sm font-bold tabular-nums">{Number(c.performanceScore ?? 0).toFixed(1)}</span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {summary && Object.keys(summary.byFormat).length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Format Performance</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(summary.byFormat).map(([fmt, data]) => (
                <div key={fmt} className="space-y-1">
                  <div className="flex justify-between text-sm"><span className="font-medium">{fmt}</span><span>{data.count} clips · avg {data.avgScore.toFixed(1)}</span></div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, data.avgScore)}%` }} /></div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Log Performance Data</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Clip</Label>
              <Select value={logForm.clipId} onValueChange={v => setLogForm(f => ({ ...f, clipId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select clip" /></SelectTrigger>
                <SelectContent>{clips.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Account</Label>
              <Select value={logForm.accountId} onValueChange={v => setLogForm(f => ({ ...f, accountId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>{accounts.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {[["Views", "views"], ["Shares", "shares"], ["Comments", "comments"], ["Saves", "saves"], ["Watch Time (s)", "watchTimeSeconds"]].map(([label, key]) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                <Input type="number" min="0" value={logForm[key as keyof typeof logForm]} onChange={e => setLogForm(f => ({ ...f, [key]: e.target.value }))} placeholder="0" />
              </div>
            ))}
          </div>
          <Button className="mt-4" onClick={() => logPerf.mutate({ clipId: Number(logForm.clipId), accountId: Number(logForm.accountId), views: Number(logForm.views) || 0, shares: Number(logForm.shares) || 0, comments: Number(logForm.comments) || 0, saves: Number(logForm.saves) || 0, watchTimeSeconds: Number(logForm.watchTimeSeconds) || 0 })} disabled={logPerf.isPending || !logForm.clipId || !logForm.accountId}>
            {logPerf.isPending ? "Logging…" : "Log Performance"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function ClipEnginePage() {
  const { data: accounts = [] } = useQuery<ClipAccount[]>({ queryKey: ["clip-accounts"], queryFn: () => apiFetch("/clip-accounts") });

  return (
    <AppShell>
      <TierGuard moduleKey="clipEngine" requiredTier="brand" moduleName="Clip Content Engine">
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Clip Content Engine</h1>
            <p className="text-muted-foreground text-sm mt-1">Upload long-form video → AI detects moments → distribute unique clips across {accounts.length} account{accounts.length !== 1 ? "s" : ""}</p>
          </div>

          <Tabs defaultValue="accounts">
            <TabsList className="flex-wrap h-auto gap-1">
              <TabsTrigger value="accounts">Accounts ({accounts.length})</TabsTrigger>
              <TabsTrigger value="pipeline">Source Pipeline</TabsTrigger>
              <TabsTrigger value="clips">Clips</TabsTrigger>
              <TabsTrigger value="calendar">Calendar</TabsTrigger>
              <TabsTrigger value="overlay">Brand Overlay</TabsTrigger>
              <TabsTrigger value="performance">Performance</TabsTrigger>
            </TabsList>

            <TabsContent value="accounts"><AccountsTab /></TabsContent>
            <TabsContent value="pipeline"><PipelineTab accounts={accounts} /></TabsContent>
            <TabsContent value="clips"><ClipsTab accounts={accounts} /></TabsContent>
            <TabsContent value="calendar"><CalendarTab accounts={accounts} /></TabsContent>
            <TabsContent value="overlay"><OverlayTab accounts={accounts} /></TabsContent>
            <TabsContent value="performance"><PerformanceTab accounts={accounts} /></TabsContent>
          </Tabs>
        </div>
      </TierGuard>
    </AppShell>
  );
}
