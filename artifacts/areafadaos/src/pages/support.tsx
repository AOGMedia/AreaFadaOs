import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { TierGuard } from "@/components/TierGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  MessageSquare, Search, Send, CheckCircle2, Clock, AlertCircle,
  Instagram, Mail, Linkedin, Phone, MoreHorizontal, RefreshCw,
  ChevronDown, X, Plus, Filter, Inbox, Users, Zap, Globe,
  ArrowLeft,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", ...opts });
  if (!r.ok) throw new Error(await r.text());
  if (r.status === 204) return null;
  return r.json();
}

// ─── Platform config ───────────────────────────────────────────────────────
const PLATFORMS: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ReactNode }> = {
  all: { label: "All", color: "text-gray-700", bg: "bg-gray-100", border: "border-gray-200", icon: <Inbox className="w-3.5 h-3.5" /> },
  whatsapp: { label: "WhatsApp", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", icon: <Phone className="w-3.5 h-3.5" /> },
  instagram: { label: "Instagram", color: "text-pink-700", bg: "bg-pink-50", border: "border-pink-200", icon: <Instagram className="w-3.5 h-3.5" /> },
  tiktok: { label: "TikTok", color: "text-slate-800", bg: "bg-slate-100", border: "border-slate-200", icon: <Zap className="w-3.5 h-3.5" /> },
  x: { label: "X / Twitter", color: "text-gray-900", bg: "bg-gray-100", border: "border-gray-200", icon: <X className="w-3.5 h-3.5" /> },
  email: { label: "Email", color: "text-blue-700", bg: "bg-blue-50", border: "border-blue-200", icon: <Mail className="w-3.5 h-3.5" /> },
  linkedin: { label: "LinkedIn", color: "text-sky-700", bg: "bg-sky-50", border: "border-sky-200", icon: <Linkedin className="w-3.5 h-3.5" /> },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  open: { label: "Open", color: "bg-emerald-100 text-emerald-700 border-emerald-200", icon: <AlertCircle className="w-3 h-3" /> },
  pending: { label: "Pending", color: "bg-amber-100 text-amber-700 border-amber-200", icon: <Clock className="w-3 h-3" /> },
  resolved: { label: "Resolved", color: "bg-blue-100 text-blue-700 border-blue-200", icon: <CheckCircle2 className="w-3 h-3" /> },
  closed: { label: "Closed", color: "bg-gray-100 text-gray-600 border-gray-200", icon: <CheckCircle2 className="w-3 h-3" /> },
};

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-gray-200",
  normal: "bg-blue-400",
  high: "bg-amber-400",
  urgent: "bg-red-500",
};

function timeAgo(date: string) {
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function PlatformBadge({ platform }: { platform: string }) {
  const p = PLATFORMS[platform] ?? PLATFORMS.all;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium border ${p.bg} ${p.color} ${p.border}`}>
      {p.icon}
      {p.label}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status] ?? STATUS_CONFIG.open;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium border ${s.color}`}>
      {s.icon}
      {s.label}
    </span>
  );
}

// ─── New conversation dialog ───────────────────────────────────────────────
function NewConversationDialog({ onCreated }: { onCreated: () => void }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ platform: "whatsapp", contactName: "", contactHandle: "", contactEmail: "", firstMessage: "" });

  const mutation = useMutation({
    mutationFn: () => apiFetch("/support/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    }),
    onSuccess: () => {
      toast({ title: "Conversation created" });
      setOpen(false);
      setForm({ platform: "whatsapp", contactName: "", contactHandle: "", contactEmail: "", firstMessage: "" });
      onCreated();
    },
    onError: () => toast({ title: "Failed to create conversation", variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5">
          <Plus className="w-4 h-4" /> New
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Conversation</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div>
            <Label>Platform</Label>
            <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PLATFORMS).filter(([k]) => k !== "all").map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    <span className="flex items-center gap-2">{v.icon} {v.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Contact Name *</Label>
            <Input className="mt-1" value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} placeholder="e.g. Chioma Okafor" />
          </div>
          <div>
            <Label>Handle / Phone</Label>
            <Input className="mt-1" value={form.contactHandle} onChange={e => setForm(f => ({ ...f, contactHandle: e.target.value }))} placeholder="@handle or +234..." />
          </div>
          <div>
            <Label>First Message</Label>
            <Textarea className="mt-1 resize-none" rows={3} value={form.firstMessage} onChange={e => setForm(f => ({ ...f, firstMessage: e.target.value }))} placeholder="Paste the customer's first message..." />
          </div>
          <Button className="w-full" onClick={() => mutation.mutate()} disabled={!form.contactName.trim() || mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Create Conversation"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Platform connect info ─────────────────────────────────────────────────
const PLATFORM_CONNECT_INFO: Record<string, { steps: string[]; note: string }> = {
  whatsapp: {
    steps: ["Set up WhatsApp Business API via Meta", "Add webhook URL to your Meta app", "Save access token in Settings → Integrations"],
    note: "WhatsApp Business API requires Meta Business verification.",
  },
  instagram: {
    steps: ["Connect Instagram Business account to your Meta app", "Enable Messaging & Comments webhooks", "Authenticate in Settings → Integrations"],
    note: "Requires an Instagram Professional account.",
  },
  tiktok: {
    steps: ["Apply for TikTok Developer API access", "Enable Comment Management scope", "Connect via Settings → Integrations"],
    note: "TikTok API access requires developer program approval.",
  },
  x: {
    steps: ["Create a Twitter/X Developer app", "Enable Direct Messages & Mentions read/write", "Authenticate via OAuth 2.0 in Settings → Integrations"],
    note: "Requires X Developer account (Basic access or higher).",
  },
  email: {
    steps: ["Add your domain or email to Resend", "Set up inbound email parsing (MX records)", "Configure RESEND_API_KEY in your environment"],
    note: "Outbound email is already set up — add inbound parsing to receive emails here.",
  },
  linkedin: {
    steps: ["Create a LinkedIn App and request Messaging API access", "LinkedIn Messaging API access requires company page association", "Authenticate in Settings → Integrations"],
    note: "LinkedIn restricts Messaging API to approved partners.",
  },
};

// ─── Main page ─────────────────────────────────────────────────────────────
export function SupportPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [activePlatform, setActivePlatform] = useState("all");
  const [activeStatus, setActiveStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");
  const [showConnect, setShowConnect] = useState<string | null>(null);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const statsQ = useQuery({
    queryKey: ["support-stats"],
    queryFn: () => apiFetch("/support/stats"),
    refetchInterval: 30000,
  });

  const convsQ = useQuery({
    queryKey: ["support-conversations", activePlatform, activeStatus, search],
    queryFn: () => {
      const p = new URLSearchParams();
      if (activePlatform !== "all") p.set("platform", activePlatform);
      if (activeStatus !== "all") p.set("status", activeStatus);
      if (search) p.set("search", search);
      return apiFetch(`/support/conversations?${p}`);
    },
    refetchInterval: 15000,
  });

  const threadQ = useQuery({
    queryKey: ["support-thread", selectedId],
    queryFn: () => apiFetch(`/support/conversations/${selectedId}/messages`),
    enabled: selectedId !== null,
    refetchInterval: 10000,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadQ.data?.messages]);

  const replyMutation = useMutation({
    mutationFn: (content: string) =>
      apiFetch(`/support/conversations/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    onSuccess: () => {
      setReplyText("");
      qc.invalidateQueries({ queryKey: ["support-thread", selectedId] });
      qc.invalidateQueries({ queryKey: ["support-conversations"] });
    },
    onError: () => toast({ title: "Failed to send reply", variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/support/conversations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-conversations"] });
      qc.invalidateQueries({ queryKey: ["support-thread", selectedId] });
      qc.invalidateQueries({ queryKey: ["support-stats"] });
    },
  });

  const conversations = convsQ.data?.conversations ?? [];
  const stats = statsQ.data ?? { open: 0, pending: 0, resolved: 0, closed: 0, total: 0, todayNew: 0 };
  const thread = threadQ.data;

  const handleSelectConv = (id: number) => {
    setSelectedId(id);
    setMobileShowThread(true);
  };

  const sendReply = () => {
    if (!replyText.trim() || replyMutation.isPending) return;
    replyMutation.mutate(replyText.trim());
  };

  return (
    <AppShell>
      <TierGuard moduleKey="customerSupport" requiredTier="creator">
        <div className="flex flex-col h-[calc(100vh-0px)] overflow-hidden">

          {/* ── Top stats bar ── */}
          <div className="border-b border-border bg-background px-4 py-3 flex-none">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h1 className="text-lg font-bold tracking-tight">Support Inbox</h1>
                <p className="text-xs text-muted-foreground">Manage all customer messages from one place</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => { qc.invalidateQueries({ queryKey: ["support-conversations"] }); qc.invalidateQueries({ queryKey: ["support-stats"] }); }}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <NewConversationDialog onCreated={() => qc.invalidateQueries({ queryKey: ["support-conversations"] })} />
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { label: "Open", value: stats.open, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
                { label: "Pending", value: stats.pending, color: "text-amber-600", bg: "bg-amber-50 border-amber-100" },
                { label: "Today New", value: stats.todayNew, color: "text-blue-600", bg: "bg-blue-50 border-blue-100" },
                { label: "Resolved", value: stats.resolved + stats.closed, color: "text-gray-600", bg: "bg-gray-50 border-gray-100" },
              ].map(s => (
                <div key={s.label} className={`flex flex-col items-center py-2 rounded-lg border ${s.bg}`}>
                  <span className={`text-xl font-bold tabular-nums ${s.color}`}>{s.value}</span>
                  <span className="text-xs text-muted-foreground">{s.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── Main panels ── */}
          <div className="flex flex-1 min-h-0">

            {/* LEFT: Conversation list */}
            <div className={`flex flex-col w-full sm:w-80 lg:w-96 border-r border-border flex-none ${mobileShowThread ? "hidden sm:flex" : "flex"}`}>
              {/* Filters */}
              <div className="px-3 py-2 border-b border-border space-y-2 flex-none">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    className="pl-8 h-8 text-sm"
                    placeholder="Search contacts..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
                {/* Platform tabs — scrollable */}
                <div className="flex gap-1 overflow-x-auto pb-1 no-scrollbar">
                  {Object.entries(PLATFORMS).map(([key, p]) => (
                    <button
                      key={key}
                      onClick={() => setActivePlatform(key)}
                      className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium whitespace-nowrap border transition-colors flex-none
                        ${activePlatform === key ? `${p.bg} ${p.color} ${p.border}` : "bg-transparent text-muted-foreground border-transparent hover:bg-muted"}`}
                    >
                      {p.icon}
                      {p.label}
                    </button>
                  ))}
                </div>
                {/* Status filter */}
                <div className="flex gap-1">
                  {["all", "open", "pending", "resolved", "closed"].map(s => (
                    <button
                      key={s}
                      onClick={() => setActiveStatus(s)}
                      className={`px-2 py-0.5 rounded text-xs font-medium capitalize border transition-colors
                        ${activeStatus === s ? "bg-primary/10 text-primary border-primary/20" : "text-muted-foreground border-transparent hover:bg-muted"}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conversation cards */}
              <div className="flex-1 overflow-y-auto divide-y divide-border">
                {convsQ.isLoading && (
                  <div className="flex items-center justify-center p-8 text-muted-foreground text-sm">
                    <RefreshCw className="w-4 h-4 animate-spin mr-2" /> Loading…
                  </div>
                )}
                {!convsQ.isLoading && conversations.length === 0 && (
                  <div className="flex flex-col items-center justify-center p-8 text-center">
                    <MessageSquare className="w-8 h-8 text-muted-foreground mb-2" />
                    <p className="text-sm font-medium">No conversations</p>
                    <p className="text-xs text-muted-foreground mt-1">Try adjusting your filters</p>
                  </div>
                )}
                {conversations.map((conv: any) => (
                  <button
                    key={conv.id}
                    onClick={() => handleSelectConv(conv.id)}
                    className={`w-full text-left p-3 hover:bg-muted transition-colors ${selectedId === conv.id ? "bg-primary/5 border-l-2 border-l-primary" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {conv.contactName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-semibold truncate">{conv.contactName}</span>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{timeAgo(conv.lastMessageAt)}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          <PlatformBadge platform={conv.platform} />
                          {conv.unreadCount > 0 && (
                            <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full">{conv.unreadCount}</span>
                          )}
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_COLOR[conv.priority] ?? "bg-gray-300"}`} title={`Priority: ${conv.priority}`} />
                        </div>
                        <div className="flex items-center justify-between gap-1 mt-1">
                          <StatusBadge status={conv.status} />
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* RIGHT: Thread view */}
            <div className={`flex-1 flex flex-col min-h-0 ${mobileShowThread ? "flex" : "hidden sm:flex"}`}>
              {!selectedId ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                  <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                    <MessageSquare className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-semibold text-lg mb-1">Select a conversation</h3>
                  <p className="text-sm text-muted-foreground max-w-xs">
                    Pick any conversation from the left to view the thread and reply from one place.
                  </p>
                  {/* Platform connect grid */}
                  <div className="mt-8 w-full max-w-lg">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Connect Platforms</p>
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(PLATFORMS).filter(([k]) => k !== "all").map(([key, p]) => (
                        <button
                          key={key}
                          onClick={() => setShowConnect(showConnect === key ? null : key)}
                          className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all hover:shadow-sm ${p.bg} ${p.border} ${showConnect === key ? "ring-2 ring-primary" : ""}`}
                        >
                          <span className={`${p.color}`}>{p.icon}</span>
                          <span className={`text-xs font-medium ${p.color}`}>{p.label}</span>
                          <span className="text-[10px] text-muted-foreground px-1.5 py-0.5 rounded-full bg-white/60 border">Setup</span>
                        </button>
                      ))}
                    </div>
                    {showConnect && PLATFORM_CONNECT_INFO[showConnect] && (
                      <div className="mt-3 p-4 rounded-xl border bg-white text-left space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold">Connect {PLATFORMS[showConnect]?.label}</span>
                          <button onClick={() => setShowConnect(null)} className="text-muted-foreground hover:text-foreground"><X className="w-4 h-4" /></button>
                        </div>
                        <ol className="space-y-1">
                          {PLATFORM_CONNECT_INFO[showConnect].steps.map((step, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex gap-2">
                              <span className="shrink-0 w-4 h-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">{i + 1}</span>
                              {step}
                            </li>
                          ))}
                        </ol>
                        <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded p-2">{PLATFORM_CONNECT_INFO[showConnect].note}</p>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  {/* Thread header */}
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-border flex-none bg-background">
                    <button className="sm:hidden p-1 rounded hover:bg-muted" onClick={() => { setMobileShowThread(false); setSelectedId(null); }}>
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    {thread?.conversation && (
                      <>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {thread.conversation.contactName.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm">{thread.conversation.contactName}</span>
                            <PlatformBadge platform={thread.conversation.platform} />
                          </div>
                          {thread.conversation.contactHandle && (
                            <p className="text-xs text-muted-foreground truncate">{thread.conversation.contactHandle}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusBadge status={thread.conversation.status} />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {["open", "pending", "resolved", "closed"].map(s => (
                                <DropdownMenuItem
                                  key={s}
                                  onClick={() => statusMutation.mutate({ id: thread.conversation.id, status: s })}
                                  disabled={thread.conversation.status === s}
                                >
                                  Mark as {s}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </>
                    )}
                    {threadQ.isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
                  </div>

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {(thread?.messages ?? []).map((msg: any) => (
                      <div key={msg.id} className={`flex ${msg.direction === "outbound" ? "justify-end" : "justify-start"}`}>
                        {msg.direction === "inbound" && (
                          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mr-2 mt-1">
                            {(thread?.conversation?.contactName ?? "?").charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div
                          className={`max-w-[75%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                            msg.direction === "outbound"
                              ? "bg-primary text-primary-foreground rounded-tr-sm"
                              : "bg-muted text-foreground rounded-tl-sm"
                          }`}
                        >
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                          <p className={`text-[10px] mt-1 ${msg.direction === "outbound" ? "text-primary-foreground/70 text-right" : "text-muted-foreground"}`}>
                            {timeAgo(msg.sentAt)} · {msg.senderName ?? ""}
                          </p>
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>

                  {/* Reply composer */}
                  <div className="border-t border-border px-4 py-3 flex-none bg-background">
                    {thread?.conversation?.platform && thread.conversation.platform !== "email" && (
                      <div className="flex items-center gap-1.5 mb-2 text-[11px] text-muted-foreground">
                        <Globe className="w-3 h-3" />
                        Replying via {PLATFORMS[thread.conversation.platform]?.label ?? thread.conversation.platform}
                        <span className="text-amber-600 ml-1">· Connect platform to send live</span>
                      </div>
                    )}
                    <div className="flex gap-2 items-end">
                      <Textarea
                        className="flex-1 resize-none min-h-[60px] max-h-40 text-sm"
                        placeholder="Type your reply…"
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) sendReply();
                        }}
                        rows={2}
                      />
                      <Button
                        size="sm"
                        className="h-10 px-4 gap-1.5 shrink-0"
                        onClick={sendReply}
                        disabled={!replyText.trim() || replyMutation.isPending}
                      >
                        <Send className="w-3.5 h-3.5" />
                        {replyMutation.isPending ? "Sending…" : "Send"}
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">Ctrl+Enter to send</p>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      </TierGuard>
    </AppShell>
  );
}
