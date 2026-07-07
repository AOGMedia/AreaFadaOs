import { useState, useRef, useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { TierGuard } from "@/components/TierGuard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Globe, Users, Building2, Mail, Plus, Upload, Download, RefreshCw,
  CheckCircle2, Clock, XCircle, TrendingUp, BarChart3, Send, Eye,
  ExternalLink, Copy, Ban, Search, Filter, ChevronRight, Edit3, RotateCcw,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${apiBase}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    ...opts,
  });
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(d.error ?? r.statusText);
  }
  return r.json();
}

const PARTNER_TYPE_LABELS: Record<string, string> = {
  creator_partner: "Creator Partner",
  brand_partner: "Brand Partner",
  agency_reseller: "Agency Reseller",
  media_house: "Media House",
  political_campaign: "Political Campaign",
};

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  sent: { label: "Sent", class: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  opened: { label: "Opened", class: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  signed_up: { label: "Signed Up", class: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  converted: { label: "Converted", class: "bg-purple-500/20 text-purple-400 border-purple-500/30" },
  expired: { label: "Expired", class: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  revoked: { label: "Revoked", class: "bg-red-500/20 text-red-400 border-red-500/30" },
};

const OUTREACH_STATUS: Record<string, { label: string; class: string }> = {
  not_contacted: { label: "Not Contacted", class: "bg-gray-500/20 text-gray-400" },
  invited: { label: "Invited", class: "bg-blue-500/20 text-blue-400" },
  in_talks: { label: "In Talks", class: "bg-amber-500/20 text-amber-400" },
  onboarded: { label: "Onboarded", class: "bg-emerald-500/20 text-emerald-400" },
  declined: { label: "Declined", class: "bg-red-500/20 text-red-400" },
};

const ORG_TYPE_LABELS: Record<string, string> = {
  media_house: "Media House", digital_publisher: "Digital Publisher",
  broadcast_network: "Broadcast Network", pr_firm: "PR Firm",
  talent_agency: "Talent Agency", record_label: "Record Label",
  political_media: "Political Media",
};

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon }: { label: string; value: string | number; sub?: string; icon: React.ReactNode }) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-gray-400 text-xs uppercase tracking-wide mb-1">{label}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
            {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
          </div>
          <div className="text-gray-600">{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── CSV Parser ───────────────────────────────────────────────────────────────
function parseCSV(text: string): Array<{ orgName: string; contactName: string; email: string; partnerType?: string }> {
  const lines = text.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim().toLowerCase().replace(/\s+/g, "_"));
  return lines.slice(1).map(line => {
    const vals = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return {
      orgName: row["org_name"] ?? row["organisation"] ?? row["organization"] ?? row["company"] ?? "",
      contactName: row["contact_name"] ?? row["name"] ?? row["full_name"] ?? "",
      email: row["email"] ?? row["email_address"] ?? "",
      partnerType: row["partner_type"] ?? row["type"] ?? "creator_partner",
    };
  }).filter(r => r.orgName && r.email);
}

// ─── Tab: Bulk Invite Generator ───────────────────────────────────────────────
function BulkInviteTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows] = useState<Array<{ orgName: string; contactName: string; email: string; partnerType: string }>>([]);
  const [sendEmails, setSendEmails] = useState(false);
  const [singleForm, setSingleForm] = useState({ orgName: "", contactName: "", email: "", partnerType: "creator_partner" });

  const bulkMut = useMutation({
    mutationFn: (rows: any[]) => apiFetch("/partner-invites/bulk", { method: "POST", body: JSON.stringify({ rows, sendEmails }) }),
    onSuccess: (d) => {
      toast({ title: `Bulk invite complete: ${d.successCount} created, ${d.errorCount} failed` });
      qc.invalidateQueries({ queryKey: ["partner-invites"] });
      qc.invalidateQueries({ queryKey: ["partner-analytics"] });
      setCsvRows([]);
      downloadCSV(d.invites.filter((i: any) => i.token), "invite_links");
    },
    onError: (e: any) => toast({ title: "Bulk invite failed", description: e.message, variant: "destructive" }),
  });

  const singleMut = useMutation({
    mutationFn: (data: any) => apiFetch("/partner-invites", { method: "POST", body: JSON.stringify(data) }),
    onSuccess: (d) => {
      toast({ title: "Invite created!" });
      qc.invalidateQueries({ queryKey: ["partner-invites"] });
      qc.invalidateQueries({ queryKey: ["partner-analytics"] });
      setSingleForm({ orgName: "", contactName: "", email: "", partnerType: "creator_partner" });
      if (d.inviteUrl) { navigator.clipboard.writeText(d.inviteUrl).catch(() => {}); toast({ title: "Invite link copied to clipboard" }); }
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  function downloadCSV(rows: any[], name: string) {
    const headers = ["orgName", "email", "token", "inviteUrl", "error"];
    const csv = [headers.join(","), ...rows.map(r => headers.map(h => `"${r[h] ?? ""}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${name}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseCSV(ev.target?.result as string);
      setCsvRows(rows.map(r => ({ ...r, partnerType: r.partnerType ?? "creator_partner" })));
    };
    reader.readAsText(file);
  }

  return (
    <div className="space-y-6">
      {/* Single Invite */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader><CardTitle className="text-white text-base">Create Single Invite</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Organisation name" value={singleForm.orgName} onChange={e => setSingleForm(p => ({ ...p, orgName: e.target.value }))} className="bg-gray-800 border-gray-700 text-white" />
            <Input placeholder="Contact name" value={singleForm.contactName} onChange={e => setSingleForm(p => ({ ...p, contactName: e.target.value }))} className="bg-gray-800 border-gray-700 text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Email address" type="email" value={singleForm.email} onChange={e => setSingleForm(p => ({ ...p, email: e.target.value }))} className="bg-gray-800 border-gray-700 text-white" />
            <Select value={singleForm.partnerType} onValueChange={v => setSingleForm(p => ({ ...p, partnerType: v }))}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PARTNER_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => singleMut.mutate({ ...singleForm, sendEmail: true })} disabled={singleMut.isPending || !singleForm.orgName || !singleForm.email || !singleForm.contactName} className="bg-emerald-600 hover:bg-emerald-700">
            <Plus className="w-4 h-4 mr-2" /> Generate Invite Link
          </Button>
        </CardContent>
      </Card>

      {/* CSV Bulk Upload */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-base">Bulk Invite via CSV</CardTitle>
          <p className="text-gray-400 text-sm">CSV must have columns: org_name, contact_name, email, partner_type (optional)</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            className="border-2 border-dashed border-gray-700 rounded-xl p-8 text-center cursor-pointer hover:border-emerald-600/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="w-8 h-8 text-gray-500 mx-auto mb-2" />
            <p className="text-gray-400">Click to upload CSV file</p>
            <p className="text-gray-600 text-sm mt-1">Supports up to 500 partners per upload</p>
          </div>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFile} />

          {csvRows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-300 text-sm font-medium">{csvRows.length} partners parsed</span>
                <label className="flex items-center gap-2 text-gray-400 text-sm cursor-pointer">
                  <input type="checkbox" checked={sendEmails} onChange={e => setSendEmails(e.target.checked)} className="rounded" />
                  Send outreach emails immediately
                </label>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-800">
                <table className="w-full text-sm">
                  <thead className="bg-gray-800/50 sticky top-0">
                    <tr>
                      <th className="text-left text-gray-400 px-3 py-2">Organisation</th>
                      <th className="text-left text-gray-400 px-3 py-2">Contact</th>
                      <th className="text-left text-gray-400 px-3 py-2">Email</th>
                      <th className="text-left text-gray-400 px-3 py-2">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvRows.map((r, i) => (
                      <tr key={i} className="border-t border-gray-800">
                        <td className="text-white px-3 py-2">{r.orgName}</td>
                        <td className="text-gray-300 px-3 py-2">{r.contactName}</td>
                        <td className="text-gray-400 px-3 py-2">{r.email}</td>
                        <td className="px-3 py-2"><Badge variant="outline" className="text-xs">{PARTNER_TYPE_LABELS[r.partnerType] ?? r.partnerType}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => bulkMut.mutate(csvRows)} disabled={bulkMut.isPending} className="bg-emerald-600 hover:bg-emerald-700">
                  <Send className="w-4 h-4 mr-2" /> {bulkMut.isPending ? "Generating…" : `Generate ${csvRows.length} Invite Links`}
                </Button>
                <Button variant="outline" onClick={() => setCsvRows([])} className="border-gray-700">Clear</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Tab: Outreach Dashboard ──────────────────────────────────────────────────
function OutreachDashboardTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<number[]>([]);

  const params = new URLSearchParams();
  if (statusFilter !== "all") params.set("status", statusFilter);
  if (typeFilter !== "all") params.set("partnerType", typeFilter);
  if (search) params.set("search", search);

  const { data: invites = [], isLoading } = useQuery<any[]>({
    queryKey: ["partner-invites", statusFilter, typeFilter, search],
    queryFn: () => apiFetch(`/partner-invites?${params}`),
  });

  const convertMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/partner-invites/${id}/convert`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Invite marked as Converted" }); qc.invalidateQueries({ queryKey: ["partner-invites"] }); qc.invalidateQueries({ queryKey: ["partner-analytics"] }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const resendMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/partner-invites/${id}/resend`, { method: "POST" }),
    onSuccess: (d) => {
      toast({ title: "Invite re-sent!" });
      if (d.inviteUrl) { navigator.clipboard.writeText(d.inviteUrl).catch(() => {}); }
      qc.invalidateQueries({ queryKey: ["partner-invites"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const revokeMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/partner-invites/${id}/revoke`, { method: "POST" }),
    onSuccess: () => { toast({ title: "Invite revoked" }); qc.invalidateQueries({ queryKey: ["partner-invites"] }); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const bulkResendMut = useMutation({
    mutationFn: (ids: number[]) => apiFetch("/partner-invites/bulk-resend", { method: "POST", body: JSON.stringify({ ids }) }),
    onSuccess: (d) => { toast({ title: `Re-sent ${d.resentCount} invites` }); qc.invalidateQueries({ queryKey: ["partner-invites"] }); setSelected([]); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleSelect = (id: number) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const unconverted = invites.filter(i => ["sent", "opened", "expired"].includes(i.status));

  function copyLink(invite: any) {
    const baseUrl = window.location.origin + (import.meta.env.BASE_URL.replace(/\/$/, "") || "");
    navigator.clipboard.writeText(`${baseUrl}/invite/${invite.token}`).then(() => toast({ title: "Link copied!" }));
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input placeholder="Search org or email…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-gray-800 border-gray-700 text-white" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {Object.entries(STATUS_BADGE).map(([v, { label }]) => <SelectItem key={v} value={v}>{label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(PARTNER_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        {selected.length > 0 && (
          <Button onClick={() => bulkResendMut.mutate(selected)} disabled={bulkResendMut.isPending} className="bg-blue-600 hover:bg-blue-700">
            <RefreshCw className="w-4 h-4 mr-2" /> Re-send {selected.length}
          </Button>
        )}
        {unconverted.length > 0 && selected.length === 0 && (
          <Button variant="outline" onClick={() => setSelected(unconverted.map(i => i.id))} className="border-gray-700 text-gray-300">
            Select Unconverted ({unconverted.length})
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-8">Loading invites…</div>
      ) : invites.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <Mail className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No invites yet. Generate your first invite above.</p>
        </div>
      ) : (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-800/60">
              <tr>
                <th className="w-8 px-3 py-3"></th>
                <th className="text-left text-gray-400 px-3 py-3">Organisation</th>
                <th className="text-left text-gray-400 px-3 py-3">Type</th>
                <th className="text-left text-gray-400 px-3 py-3">Status</th>
                <th className="text-left text-gray-400 px-3 py-3">Sent</th>
                <th className="text-left text-gray-400 px-3 py-3">Last Activity</th>
                <th className="text-left text-gray-400 px-3 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map(invite => {
                const s = STATUS_BADGE[invite.status] ?? STATUS_BADGE["sent"];
                const isChecked = selected.includes(invite.id);
                return (
                  <tr key={invite.id} className={`border-t border-gray-800 hover:bg-gray-800/30 transition-colors ${isChecked ? "bg-blue-950/20" : ""}`}>
                    <td className="px-3 py-3">
                      <input type="checkbox" checked={isChecked} onChange={() => toggleSelect(invite.id)} className="rounded" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="text-white font-medium">{invite.orgName}</div>
                      <div className="text-gray-500 text-xs">{invite.email}</div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="outline" className="text-xs">{PARTNER_TYPE_LABELS[invite.partnerType] ?? invite.partnerType}</Badge>
                    </td>
                    <td className="px-3 py-3">
                      <Badge className={`text-xs border ${s.class}`}>{s.label}</Badge>
                    </td>
                    <td className="px-3 py-3 text-gray-400">{invite.sentCount}×</td>
                    <td className="px-3 py-3 text-gray-500 text-xs">
                      {invite.openedAt ? `Opened ${new Date(invite.openedAt).toLocaleDateString()}` :
                        `Sent ${new Date(invite.lastSentAt).toLocaleDateString()}`}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => copyLink(invite)} className="h-7 w-7 p-0 text-gray-400 hover:text-white" title="Copy invite link">
                          <Copy className="w-3.5 h-3.5" />
                        </Button>
                        {invite.status !== "revoked" && invite.status !== "converted" && (
                          <Button size="sm" variant="ghost" onClick={() => resendMut.mutate(invite.id)} disabled={resendMut.isPending} className="h-7 w-7 p-0 text-blue-400 hover:text-blue-300" title="Resend">
                            <RefreshCw className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {invite.status === "signed_up" && (
                          <Button size="sm" variant="ghost" onClick={() => convertMut.mutate(invite.id)} disabled={convertMut.isPending} className="h-7 w-7 p-0 text-emerald-400 hover:text-emerald-300" title="Mark as Converted">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {invite.status !== "revoked" && (
                          <Button size="sm" variant="ghost" onClick={() => revokeMut.mutate(invite.id)} disabled={revokeMut.isPending} className="h-7 w-7 p-0 text-red-400 hover:text-red-300" title="Revoke">
                            <Ban className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Tab: Global Media Directory ──────────────────────────────────────────────
function MediaDirectoryTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [orgType, setOrgType] = useState("all");
  const [region, setRegion] = useState("all");
  const [search, setSearch] = useState("");

  const params = new URLSearchParams();
  if (orgType !== "all") params.set("orgType", orgType);
  if (region !== "all") params.set("region", region);
  if (search) params.set("search", search);

  const { data: entries = [], isLoading } = useQuery<any[]>({
    queryKey: ["partner-directory", orgType, region, search],
    queryFn: () => apiFetch(`/partner-directory?${params}`),
  });

  const inviteMut = useMutation({
    mutationFn: (entry: any) => apiFetch("/partner-invites", {
      method: "POST",
      body: JSON.stringify({ orgName: entry.name, contactName: "Partnership Team", email: entry.email ?? `partnerships@${entry.website?.replace("https://", "") ?? "unknown.com"}`, partnerType: entry.orgType === "record_label" || entry.orgType === "talent_agency" ? "brand_partner" : entry.orgType === "broadcast_network" || entry.orgType === "media_house" || entry.orgType === "digital_publisher" ? "media_house" : "creator_partner", sendEmail: true }),
    }),
    onSuccess: async (d, entry) => {
      toast({ title: `Invite sent to ${entry.name}` });
      await apiFetch(`/partner-directory/${entry.id}`, { method: "PATCH", body: JSON.stringify({ outreachStatus: "invited", inviteId: d.id }) });
      qc.invalidateQueries({ queryKey: ["partner-directory"] });
      qc.invalidateQueries({ queryKey: ["partner-invites"] });
      qc.invalidateQueries({ queryKey: ["partner-analytics"] });
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const regions = ["West Africa", "East Africa", "Africa", "North Africa", "Southern Africa"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <Input placeholder="Search media partners…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9 bg-gray-800 border-gray-700 text-white" />
        </div>
        <Select value={orgType} onValueChange={setOrgType}>
          <SelectTrigger className="w-44 bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Org Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {Object.entries(ORG_TYPE_LABELS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={region} onValueChange={setRegion}>
          <SelectTrigger className="w-40 bg-gray-800 border-gray-700 text-white"><SelectValue placeholder="Region" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Regions</SelectItem>
            {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="text-gray-500 text-sm">{entries.length} media partner{entries.length !== 1 ? "s" : ""} found</div>

      {isLoading ? (
        <div className="text-center text-gray-400 py-8">Loading directory…</div>
      ) : (
        <div className="grid gap-3">
          {entries.map(entry => {
            const os = OUTREACH_STATUS[entry.outreachStatus] ?? OUTREACH_STATUS["not_contacted"];
            return (
              <Card key={entry.id} className="bg-gray-900 border-gray-800 hover:border-gray-700 transition-colors">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-white font-semibold">{entry.name}</h3>
                        {entry.isFeatured && <Badge className="bg-amber-500/20 text-amber-400 text-xs border-amber-500/30">Featured</Badge>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge variant="outline" className="text-xs">{ORG_TYPE_LABELS[entry.orgType] ?? entry.orgType}</Badge>
                        <span className="text-gray-500 text-xs">{entry.region} · {entry.country}</span>
                        <Badge className={`text-xs ${os.class}`}>{os.label}</Badge>
                      </div>
                      {entry.description && <p className="text-gray-400 text-sm line-clamp-2">{entry.description}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {entry.website && (
                        <a href={entry.website} target="_blank" rel="noopener noreferrer">
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-gray-400 hover:text-white">
                            <ExternalLink className="w-3.5 h-3.5" />
                          </Button>
                        </a>
                      )}
                      {entry.outreachStatus !== "onboarded" && entry.outreachStatus !== "declined" && (
                        <Button size="sm" onClick={() => inviteMut.mutate(entry)} disabled={inviteMut.isPending} className="h-8 bg-emerald-600 hover:bg-emerald-700 text-xs">
                          <Send className="w-3 h-3 mr-1.5" /> Invite
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
    </div>
  );
}

// ─── Tab: Partner Profiles ────────────────────────────────────────────────────
function PartnerProfilesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<any | null>(null);
  const [noteText, setNoteText] = useState("");

  const { data: profiles = [], isLoading } = useQuery<any[]>({
    queryKey: ["partner-profiles"],
    queryFn: () => apiFetch("/partner-profiles"),
  });

  const noteMut = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => apiFetch(`/partner-profiles/${id}`, { method: "PATCH", body: JSON.stringify({ note }) }),
    onSuccess: (d) => { toast({ title: "Note saved" }); qc.invalidateQueries({ queryKey: ["partner-profiles"] }); setSelected(d); setNoteText(""); },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  if (selected) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" onClick={() => setSelected(null)} className="text-gray-400 hover:text-white -ml-2">
          ← Back to profiles
        </Button>
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white">{selected.orgName}</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{PARTNER_TYPE_LABELS[selected.partnerType] ?? selected.partnerType}</Badge>
              <Badge variant="outline">{selected.tier} tier</Badge>
              {selected.region && <Badge variant="outline">{selected.region}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><p className="text-gray-500">Contact</p><p className="text-white">{selected.contactName}</p></div>
              <div><p className="text-gray-500">Email</p><p className="text-white">{selected.email}</p></div>
              {selected.phone && <div><p className="text-gray-500">Phone</p><p className="text-white">{selected.phone}</p></div>}
              {selected.website && <div><p className="text-gray-500">Website</p><a href={selected.website} className="text-emerald-400 hover:underline" target="_blank" rel="noopener noreferrer">{selected.website}</a></div>}
              {selected.accountManagerName && <div><p className="text-gray-500">Account Manager</p><p className="text-white">{selected.accountManagerName}</p></div>}
              {selected.dealValue && <div><p className="text-gray-500">Deal Value</p><p className="text-emerald-400 font-semibold">₦{Number(selected.dealValue).toLocaleString()}</p></div>}
            </div>
            {selected.dealNotes && <div><p className="text-gray-500 text-sm">Deal Notes</p><p className="text-gray-300 text-sm">{selected.dealNotes}</p></div>}

            <div>
              <p className="text-gray-500 text-sm mb-2 font-medium">Activity Log</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {(selected.activityLog ?? []).map((log: any, i: number) => (
                  <div key={i} className="flex gap-3 text-sm">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <div>
                      <span className="text-gray-300">{log.note}</span>
                      <span className="text-gray-600 ml-2 text-xs">{new Date(log.at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Textarea placeholder="Add a note…" value={noteText} onChange={e => setNoteText(e.target.value)} className="bg-gray-800 border-gray-700 text-white resize-none" rows={2} />
              <Button onClick={() => noteMut.mutate({ id: selected.id, note: noteText })} disabled={!noteText || noteMut.isPending} className="bg-emerald-600 hover:bg-emerald-700 self-end">Save</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {isLoading ? (
        <div className="text-center text-gray-400 py-8">Loading profiles…</div>
      ) : profiles.length === 0 ? (
        <div className="text-center text-gray-500 py-12">
          <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>No partner profiles yet. Profiles are created when partners sign up.</p>
        </div>
      ) : (
        profiles.map(p => (
          <Card key={p.id} className="bg-gray-900 border-gray-800 cursor-pointer hover:border-gray-700 transition-colors" onClick={() => setSelected(p)}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-white font-medium">{p.orgName}</h3>
                    <Badge variant="outline" className="text-xs">{PARTNER_TYPE_LABELS[p.partnerType] ?? p.partnerType}</Badge>
                  </div>
                  <p className="text-gray-400 text-sm">{p.contactName} · {p.email}</p>
                </div>
                <div className="flex items-center gap-3">
                  {p.dealValue && <span className="text-emerald-400 font-semibold text-sm">₦{Number(p.dealValue).toLocaleString()}</span>}
                  <ChevronRight className="w-4 h-4 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

// ─── Tab: Partner Analytics ───────────────────────────────────────────────────
function PartnerAnalyticsTab() {
  const qc = useQueryClient();
  const { data: analytics, isLoading } = useQuery<any>({
    queryKey: ["partner-analytics"],
    queryFn: () => apiFetch("/partner-analytics"),
  });

  const { data: emailLogs = [] } = useQuery<any[]>({
    queryKey: ["partner-outreach-emails"],
    queryFn: () => apiFetch("/partner-outreach-emails"),
  });

  if (isLoading) return <div className="text-center text-gray-400 py-8">Loading analytics…</div>;
  if (!analytics) return null;

  const byType = Object.entries(analytics.byType ?? {}).map(([type, d]: any) => ({
    type, label: PARTNER_TYPE_LABELS[type] ?? type, ...d,
    openRate: d.sent > 0 ? Math.round((d.opened / d.sent) * 100) : 0,
    convRate: d.sent > 0 ? Math.round((d.converted / d.sent) * 100) : 0,
  })).sort((a, b) => b.sent - a.sent);

  // Compact 30-day trend — only show days with labels every 5 days
  const trend = (analytics.trend ?? []).map((d: any, i: number) => ({
    ...d,
    label: i % 5 === 0 ? d.date.slice(5) : "",
  }));
  const hasTrendData = trend.some((d: any) => d.sent > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total Invites" value={analytics.totalInvites} icon={<Mail className="w-5 h-5" />} />
        <StatCard label="Open Rate" value={`${analytics.openRate}%`} sub={`${analytics.opened} opened`} icon={<Eye className="w-5 h-5" />} />
        <StatCard label="Sign-up Rate" value={`${analytics.signUpRate}%`} sub={`${analytics.signedUp} signed up`} icon={<Users className="w-5 h-5" />} />
        <StatCard label="Conversion Rate" value={`${analytics.conversionRate}%`} sub={`${analytics.converted} converted`} icon={<TrendingUp className="w-5 h-5" />} />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <StatCard label="Emails Sent" value={analytics.emailsSent} icon={<Send className="w-5 h-5" />} />
        <StatCard label="Revenue Attributed" value={analytics.totalRevenue > 0 ? `₦${Number(analytics.totalRevenue).toLocaleString()}` : "—"} icon={<BarChart3 className="w-5 h-5" />} />
        <StatCard label="Last 30 Days" value={analytics.recentInvites} sub="invites sent" icon={<Clock className="w-5 h-5" />} />
      </div>

      {/* 30-day trend chart */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader><CardTitle className="text-white text-base">30-Day Invite Trend</CardTitle></CardHeader>
        <CardContent>
          {hasTrendData ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={trend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: "#9ca3af", fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8, color: "#f9fafb" }} />
                <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af" }} />
                <Bar dataKey="sent" name="Sent" fill="#6366f1" radius={[2, 2, 0, 0]} />
                <Bar dataKey="opened" name="Opened" fill="#f59e0b" radius={[2, 2, 0, 0]} />
                <Bar dataKey="signedUp" name="Signed Up" fill="#10b981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="converted" name="Converted" fill="#a78bfa" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center text-gray-500 py-8 text-sm">No invite activity in the last 30 days yet.</div>
          )}
        </CardContent>
      </Card>

      {byType.length > 0 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader><CardTitle className="text-white text-base">Performance by Partner Type</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 border-b border-gray-800">
                    <th className="text-left pb-2">Partner Type</th>
                    <th className="text-right pb-2">Sent</th>
                    <th className="text-right pb-2">Opened</th>
                    <th className="text-right pb-2">Converted</th>
                    <th className="text-right pb-2">Open Rate</th>
                    <th className="text-right pb-2">Conv. Rate</th>
                  </tr>
                </thead>
                <tbody className="space-y-1">
                  {byType.map(row => (
                    <tr key={row.type} className="border-t border-gray-800">
                      <td className="text-white py-2">{row.label}</td>
                      <td className="text-gray-300 py-2 text-right">{row.sent}</td>
                      <td className="text-gray-300 py-2 text-right">{row.opened}</td>
                      <td className="text-emerald-400 py-2 text-right font-medium">{row.converted}</td>
                      <td className="text-amber-400 py-2 text-right">{row.openRate}%</td>
                      <td className="text-purple-400 py-2 text-right">{row.convRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {emailLogs.length > 0 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader><CardTitle className="text-white text-base">Recent Email Delivery Log</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {emailLogs.slice(0, 50).map((log: any) => (
                <div key={log.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-800/50 last:border-0">
                  <div>
                    <span className="text-white">{log.orgName}</span>
                    <span className="text-gray-500 ml-2">{log.toEmail}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {log.openedAt && <Badge className="text-xs bg-amber-500/20 text-amber-400">opened</Badge>}
                    <Badge className={`text-xs ${log.status === "sent" || log.status === "delivered" ? "bg-emerald-500/20 text-emerald-400" : log.status === "simulated" ? "bg-blue-500/20 text-blue-400" : "bg-red-500/20 text-red-400"}`}>
                      {log.status}
                    </Badge>
                    <span className="text-gray-600 text-xs">{new Date(log.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Template Editor Tab ──────────────────────────────────────────────────────

const PARTNER_TYPE_KEYS = ["creator_partner", "brand_partner", "agency_reseller", "media_house", "political_campaign"];

function EmailTemplateEditorTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [selectedKey, setSelectedKey] = useState(PARTNER_TYPE_KEYS[0]);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");

  const { data: templates = [] } = useQuery<any[]>({
    queryKey: ["partner-email-templates"],
    queryFn: () => apiFetch("/partner-email-templates"),
  });

  const currentTpl = templates.find((t: any) => t.templateKey === selectedKey);

  useEffect(() => {
    if (currentTpl) {
      setEditSubject(currentTpl.subject);
      setEditBody(currentTpl.bodyHtml);
    }
  }, [currentTpl?.templateKey, currentTpl?.subject]);

  const saveMut = useMutation({
    mutationFn: () => apiFetch("/partner-email-templates", { method: "POST", body: JSON.stringify({ templateKey: selectedKey, subject: editSubject, bodyHtml: editBody }) }),
    onSuccess: () => { toast({ title: "Template saved" }); qc.invalidateQueries({ queryKey: ["partner-email-templates"] }); },
    onError: (e: any) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  const resetMut = useMutation({
    mutationFn: () => apiFetch(`/partner-email-templates/${selectedKey}`, { method: "DELETE" }),
    onSuccess: () => { toast({ title: "Reset to default" }); qc.invalidateQueries({ queryKey: ["partner-email-templates"] }); },
    onError: (e: any) => toast({ title: "Reset failed", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-white font-semibold text-lg">Email Template Editor</h2>
          <p className="text-gray-400 text-sm mt-0.5">Customise outreach emails per partner type. Use <code className="bg-gray-800 px-1 rounded text-xs">{"{{orgName}}"}</code>, <code className="bg-gray-800 px-1 rounded text-xs">{"{{contactName}}"}</code>, <code className="bg-gray-800 px-1 rounded text-xs">{"{{inviteUrl}}"}</code>, <code className="bg-gray-800 px-1 rounded text-xs">{"{{partnerTypeLabel}}"}</code> as placeholders.</p>
        </div>
      </div>

      {/* Partner type selector */}
      <div className="flex flex-wrap gap-2">
        {PARTNER_TYPE_KEYS.map(key => {
          const tpl = templates.find((t: any) => t.templateKey === key);
          return (
            <button
              key={key}
              onClick={() => setSelectedKey(key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${selectedKey === key ? "bg-emerald-600 border-emerald-500 text-white" : "bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700"}`}
            >
              {PARTNER_TYPE_LABELS[key]}
              {tpl?.isCustom && <span className="ml-1.5 text-xs text-amber-400">✎</span>}
            </button>
          );
        })}
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="pt-5 space-y-4">
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Subject Line</label>
            <Input
              value={editSubject}
              onChange={e => setEditSubject(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white"
              placeholder="Email subject…"
            />
          </div>
          <div>
            <label className="text-gray-400 text-sm mb-1 block">Body HTML</label>
            <Textarea
              value={editBody}
              onChange={e => setEditBody(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white font-mono text-xs min-h-[260px]"
              placeholder="<p>Hi {{contactName}},</p>…"
            />
          </div>
          {editBody && (
            <div>
              <label className="text-gray-400 text-sm mb-1 block">Preview</label>
              <div
                className="bg-white rounded p-4 text-sm text-gray-900 max-h-48 overflow-y-auto"
                dangerouslySetInnerHTML={{ __html: editBody }}
              />
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !editSubject || !editBody} className="bg-emerald-600 hover:bg-emerald-700">
              <Edit3 className="w-4 h-4 mr-1.5" /> {saveMut.isPending ? "Saving…" : "Save Template"}
            </Button>
            {currentTpl?.isCustom && (
              <Button variant="outline" onClick={() => resetMut.mutate()} disabled={resetMut.isPending} className="border-gray-600 text-gray-300 hover:bg-gray-800">
                <RotateCcw className="w-4 h-4 mr-1.5" /> Reset to Default
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
const TABS = [
  { key: "bulk-invite", label: "Bulk Invite Generator", icon: <Upload className="w-4 h-4" /> },
  { key: "outreach", label: "Outreach Dashboard", icon: <Mail className="w-4 h-4" /> },
  { key: "directory", label: "Media Directory", icon: <Globe className="w-4 h-4" /> },
  { key: "profiles", label: "Partner Profiles", icon: <Building2 className="w-4 h-4" /> },
  { key: "analytics", label: "Analytics", icon: <BarChart3 className="w-4 h-4" /> },
  { key: "templates", label: "Email Templates", icon: <Edit3 className="w-4 h-4" /> },
];

export function MediaPartnersPage() {
  const [activeTab, setActiveTab] = useState("bulk-invite");

  return (
    <AppShell>
      <TierGuard moduleKey="ambassadorCrm" requiredTier="agency" moduleName="Media Partners">
        <div className="p-6 max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-emerald-900/30 rounded-xl">
                <Globe className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Global Media Partners</h1>
                <p className="text-gray-400 text-sm">Bulk outreach and invite management for African and global media partners</p>
              </div>
            </div>
          </div>

          {/* Tab Bar */}
          <div className="flex flex-wrap gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 mb-6">
            {TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === tab.key ? "bg-gray-800 text-white" : "text-gray-400 hover:text-white hover:bg-gray-800/50"}`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          {activeTab === "bulk-invite" && <BulkInviteTab />}
          {activeTab === "outreach" && <OutreachDashboardTab />}
          {activeTab === "directory" && <MediaDirectoryTab />}
          {activeTab === "profiles" && <PartnerProfilesTab />}
          {activeTab === "analytics" && <PartnerAnalyticsTab />}
          {activeTab === "templates" && <EmailTemplateEditorTab />}
        </div>
      </TierGuard>
    </AppShell>
  );
}
