import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@clerk/react";
import { AppShell } from "@/components/AppShell";
import { TierGuard } from "@/components/TierGuard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

type Currency = "NGN" | "GHS" | "KES" | "ZAR" | "USD";
type DealStatus = "inbound" | "negotiating" | "agreed" | "deliverable_due" | "invoiced" | "paid" | "cancelled";
type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";
type PaymentGateway = "paystack" | "flutterwave";

interface BrandDeal {
  id: number; brandName: string; contactName?: string; contactEmail?: string;
  dealValue: number; currency: Currency; status: DealStatus; deliverables?: string;
  platforms: string[]; startDate?: string; endDate?: string; notes?: string;
  createdAt: string; updatedAt: string;
}

interface Invoice {
  id: number; invoiceNumber: string; clientName: string; clientEmail: string;
  currency: Currency; subtotal: number; taxRate: number; taxAmount: number; total: number;
  status: InvoiceStatus; dueDate?: string; paidAt?: string; paymentGateway?: string;
  paymentLink?: string; paymentRef?: string; notes?: string;
  createdAt: string; updatedAt: string;
}

interface AffiliateLink {
  id: number; name: string; destinationUrl: string; slug: string;
  platform?: string; campaignTag?: string; clickCount: number;
  conversionCount: number; revenueGenerated: number; isActive: boolean;
  createdAt: string; updatedAt: string;
}

interface RevenueMonth { month: string; brandDeals: number; invoices: number; affiliates: number; total: number; }
interface RevenueWaterfall {
  currency: Currency; months: RevenueMonth[];
  totalRevenue: number; totalBrandDeals: number; totalInvoices: number; totalAffiliates: number;
}

const CURRENCIES: Currency[] = ["NGN", "GHS", "KES", "ZAR", "USD"];
const PIPELINE_STAGES: DealStatus[] = ["inbound", "negotiating", "agreed", "deliverable_due", "invoiced", "paid"];
const STAGE_LABELS: Record<DealStatus, string> = {
  inbound: "Inbound", negotiating: "Negotiating", agreed: "Agreed",
  deliverable_due: "Deliverable Due", invoiced: "Invoiced", paid: "Paid", cancelled: "Cancelled",
};
const STAGE_COLORS: Record<DealStatus, string> = {
  inbound: "bg-blue-100 text-blue-700", negotiating: "bg-amber-100 text-amber-700",
  agreed: "bg-purple-100 text-purple-700", deliverable_due: "bg-orange-100 text-orange-700",
  invoiced: "bg-cyan-100 text-cyan-700", paid: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-gray-100 text-gray-500",
};
const INVOICE_STATUS_COLORS: Record<InvoiceStatus, string> = {
  draft: "bg-gray-100 text-gray-600", sent: "bg-blue-100 text-blue-700",
  paid: "bg-emerald-100 text-emerald-700", overdue: "bg-red-100 text-red-700",
  cancelled: "bg-gray-100 text-gray-500",
};

const fmt = (amount: number, currency: Currency) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);

function apiHeaders(token: string | null) {
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

function useApiToken() {
  const { getToken } = useAuth();
  return () => getToken();
}

// ─── Revenue Overview ─────────────────────────────────────────────────────────

function RevenueOverview({ currency }: { currency: Currency }) {
  const getToken = useApiToken();
  const { data } = useQuery<RevenueWaterfall>({
    queryKey: ["revenue-waterfall", currency],
    queryFn: async () => {
      const token = await getToken();
      const r = await fetch(`${API}/monetization/revenue?currency=${currency}&months=6`, { headers: apiHeaders(token) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
  });

  if (!data) return <div className="h-64 flex items-center justify-center text-gray-400 text-sm">Loading revenue…</div>;

  const cards = [
    { label: "Total Revenue", value: data.totalRevenue, color: "text-emerald-600" },
    { label: "Brand Deals", value: data.totalBrandDeals, color: "text-blue-600" },
    { label: "Invoices Paid", value: data.totalInvoices, color: "text-purple-600" },
    { label: "Affiliate Income", value: data.totalAffiliates, color: "text-amber-600" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-xl font-bold ${c.color}`}>{fmt(c.value, data.currency)}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-100 p-4">
        <p className="text-sm font-semibold text-gray-700 mb-4">Revenue Waterfall — Last 6 Months</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data.months} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
            <Tooltip formatter={(v: number) => fmt(v, data.currency)} />
            <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="brandDeals" name="Brand Deals" stackId="a" fill="#3b82f6" />
            <Bar dataKey="invoices" name="Invoices" stackId="a" fill="#a855f7" />
            <Bar dataKey="affiliates" name="Affiliates" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Sponsorship Rate Calculator ──────────────────────────────────────────────

function RateCalculator({ currency }: { currency: Currency }) {
  const getToken = useApiToken();
  const [followers, setFollowers] = useState(100000);
  const [engagement, setEngagement] = useState(3);
  const [niche, setNiche] = useState("entertainment");
  const [geo, setGeo] = useState("NG");

  const { data, refetch, isFetching } = useQuery<{ currency: Currency; low: number; mid: number; high: number; breakdown: any }>({
    queryKey: ["rate-calc", followers, engagement, niche, geo, currency],
    queryFn: async () => {
      const token = await getToken();
      const r = await fetch(`${API}/monetization/rate-calculator`, {
        method: "POST",
        headers: apiHeaders(token),
        body: JSON.stringify({ followerCount: followers, engagementRate: engagement, niche, audienceGeo: geo, currency }),
      });
      return r.json();
    },
    enabled: false,
  });

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-6 space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-gray-800">Sponsorship Rate Calculator</h3>
        <p className="text-xs text-gray-500 mt-0.5">Formula: (engagements ÷ 1000) × CPE × niche multiplier × geo score</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="space-y-4">
          <div>
            <Label className="text-xs">Followers: <span className="font-bold text-gray-900">{followers.toLocaleString()}</span></Label>
            <Slider value={[followers]} min={1000} max={5000000} step={1000} onValueChange={([v]) => setFollowers(v)} className="mt-2" />
          </div>
          <div>
            <Label className="text-xs">Engagement Rate: <span className="font-bold text-gray-900">{engagement}%</span></Label>
            <Slider value={[engagement]} min={0.1} max={20} step={0.1} onValueChange={([v]) => setEngagement(v)} className="mt-2" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Niche</Label>
              <Select value={niche} onValueChange={setNiche}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["entertainment", "music", "politics", "tech", "fashion", "beauty", "sports", "food", "education", "general"].map(n => (
                    <SelectItem key={n} value={n} className="capitalize text-xs">{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Audience Geography</Label>
              <Select value={geo} onValueChange={setGeo}>
                <SelectTrigger className="h-8 text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[["NG", "Nigeria"], ["GH", "Ghana"], ["KE", "Kenya"], ["ZA", "South Africa"], ["US", "United States"], ["GB", "United Kingdom"], ["global", "Global"]].map(([v, l]) => (
                    <SelectItem key={v} value={v} className="text-xs">{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => refetch()} disabled={isFetching} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white text-sm">
            {isFetching ? "Calculating…" : "Calculate Rate"}
          </Button>
        </div>

        <div className="flex flex-col justify-center">
          {data ? (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 font-medium">Recommended Rate Range</p>
              <div className="space-y-2">
                {[
                  { label: "Conservative", value: data.low, color: "bg-blue-50 border-blue-200", text: "text-blue-700" },
                  { label: "Market Rate", value: data.mid, color: "bg-emerald-50 border-emerald-300", text: "text-emerald-700" },
                  { label: "Premium", value: data.high, color: "bg-purple-50 border-purple-200", text: "text-purple-700" },
                ].map(r => (
                  <div key={r.label} className={`rounded-lg border p-3 ${r.color}`}>
                    <p className="text-xs text-gray-500">{r.label}</p>
                    <p className={`text-xl font-bold ${r.text}`}>{fmt(r.value, currency)}</p>
                  </div>
                ))}
              </div>
              {data.breakdown && (
                <p className="text-xs text-gray-400">
                  {data.breakdown.engagements.toLocaleString()} engagements · ×{data.breakdown.nicheMultiplier} niche · ×{data.breakdown.geoScore} geo
                </p>
              )}
            </div>
          ) : (
            <div className="text-center text-gray-400 text-sm">
              <p className="text-3xl mb-2">💰</p>
              <p>Set your parameters and calculate your fair market rate</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Brand Deals Kanban ───────────────────────────────────────────────────────

function BrandDealsPanel({ currency }: { currency: Currency }) {
  const qc = useQueryClient();
  const getToken = useApiToken();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editDeal, setEditDeal] = useState<BrandDeal | null>(null);
  const [form, setForm] = useState({
    brandName: "", contactName: "", contactEmail: "", dealValue: "",
    currency: "NGN" as Currency, status: "inbound" as DealStatus, deliverables: "", notes: "",
  });
  const dragRef = useRef<{ id: number; status: DealStatus } | null>(null);

  const { data: deals = [] } = useQuery<BrandDeal[]>({
    queryKey: ["brand-deals"],
    queryFn: async () => {
      const token = await getToken();
      return fetch(`${API}/brand-deals`, { headers: apiHeaders(token) }).then(r => r.json());
    },
  });

  const moveMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: DealStatus }) => {
      const token = await getToken();
      const r = await fetch(`${API}/brand-deals/${id}`, { method: "PATCH", headers: apiHeaders(token), body: JSON.stringify({ status }) });
      if (!r.ok) throw new Error("Move failed");
      return r.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["brand-deals"] }),
    onError: () => toast({ title: "Failed to move deal", variant: "destructive" }),
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const url = editDeal ? `${API}/brand-deals/${editDeal.id}` : `${API}/brand-deals`;
      const method = editDeal ? "PATCH" : "POST";
      const r = await fetch(url, { method, headers: apiHeaders(token), body: JSON.stringify({ ...form, dealValue: Number(form.dealValue) }) });
      if (!r.ok) throw new Error("Save failed");
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["brand-deals"] }); qc.invalidateQueries({ queryKey: ["revenue-waterfall"] }); setOpen(false); toast({ title: editDeal ? "Deal updated" : "Deal created" }); },
    onError: () => toast({ title: "Failed to save deal", variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken();
      await fetch(`${API}/brand-deals/${id}`, { method: "DELETE", headers: apiHeaders(token) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["brand-deals"] }); toast({ title: "Deal deleted" }); },
  });

  function openNew() {
    setEditDeal(null);
    setForm({ brandName: "", contactName: "", contactEmail: "", dealValue: "", currency: "NGN", status: "inbound", deliverables: "", notes: "" });
    setOpen(true);
  }

  function openEdit(d: BrandDeal) {
    setEditDeal(d);
    setForm({ brandName: d.brandName, contactName: d.contactName ?? "", contactEmail: d.contactEmail ?? "", dealValue: String(d.dealValue), currency: d.currency, status: d.status, deliverables: d.deliverables ?? "", notes: d.notes ?? "" });
    setOpen(true);
  }

  function onDragStart(id: number, status: DealStatus) {
    dragRef.current = { id, status };
  }

  function onDrop(targetStatus: DealStatus) {
    if (!dragRef.current || dragRef.current.status === targetStatus) return;
    moveMut.mutate({ id: dragRef.current.id, status: targetStatus });
    dragRef.current = null;
  }

  const totalActive = deals.filter(d => ["agreed", "deliverable_due", "invoiced"].includes(d.status)).reduce((a, d) => a + d.dealValue, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{deals.length} deals · {fmt(totalActive, currency)} in active pipeline</p>
        <Button size="sm" onClick={openNew} className="bg-emerald-500 hover:bg-emerald-600 text-white">+ New Deal</Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 overflow-x-auto pb-2">
        {PIPELINE_STAGES.map(stage => (
          <div
            key={stage}
            className="bg-gray-50 rounded-xl p-2 min-w-[140px]"
            onDragOver={e => e.preventDefault()}
            onDrop={() => onDrop(stage)}
          >
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{STAGE_LABELS[stage]}</p>
              <span className="text-[10px] bg-gray-200 text-gray-600 rounded-full px-1.5">{deals.filter(d => d.status === stage).length}</span>
            </div>
            <div className="space-y-1.5">
              {deals.filter(d => d.status === stage).map(deal => (
                <div
                  key={deal.id}
                  draggable
                  onDragStart={() => onDragStart(deal.id, deal.status)}
                  className="bg-white rounded-lg p-2 border border-gray-100 shadow-sm cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                  onClick={() => openEdit(deal)}
                >
                  <p className="text-xs font-semibold text-gray-800 truncate leading-tight">{deal.brandName}</p>
                  <p className="text-[11px] text-emerald-600 font-medium mt-0.5">{fmt(deal.dealValue, deal.currency)}</p>
                  {deal.platforms.length > 0 && (
                    <div className="flex flex-wrap gap-0.5 mt-1">
                      {deal.platforms.slice(0, 2).map(p => (
                        <span key={p} className="text-[9px] bg-gray-100 text-gray-500 px-1 py-0.5 rounded">{p}</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {deals.filter(d => d.status === stage).length === 0 && (
                <div className="border-2 border-dashed border-gray-200 rounded-lg h-16 flex items-center justify-center">
                  <p className="text-[10px] text-gray-300">Drop here</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editDeal ? "Edit Deal" : "New Brand Deal"}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Brand Name *</Label><Input value={form.brandName} onChange={e => setForm(f => ({ ...f, brandName: e.target.value }))} placeholder="e.g. Paystack Nigeria" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Contact Name</Label><Input value={form.contactName} onChange={e => setForm(f => ({ ...f, contactName: e.target.value }))} /></div>
              <div><Label>Contact Email</Label><Input value={form.contactEmail} onChange={e => setForm(f => ({ ...f, contactEmail: e.target.value }))} type="email" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Deal Value</Label><Input value={form.dealValue} onChange={e => setForm(f => ({ ...f, dealValue: e.target.value }))} type="number" placeholder="0" /></div>
              <div><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v as Currency }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Stage</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v as DealStatus }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[...PIPELINE_STAGES, "cancelled" as DealStatus].map(s => (
                    <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Deliverables</Label><Textarea value={form.deliverables} onChange={e => setForm(f => ({ ...f, deliverables: e.target.value }))} rows={2} placeholder="e.g. 3 Instagram posts + TikTok reel" /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter className="gap-2">
            {editDeal && <Button variant="destructive" size="sm" onClick={() => { deleteMut.mutate(editDeal.id); setOpen(false); }}>Delete</Button>}
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !form.brandName}>
              {saveMut.isPending ? "Saving…" : "Save Deal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Invoices ─────────────────────────────────────────────────────────────────

function InvoicesPanel() {
  const qc = useQueryClient();
  const getToken = useApiToken();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [gateway, setGateway] = useState<PaymentGateway>("paystack");
  const [form, setForm] = useState({
    clientName: "", clientEmail: "", currency: "NGN" as Currency, taxRate: "7.5", dueDate: "", notes: "",
    lines: [{ description: "", quantity: "1", unitPrice: "" }],
  });

  const { data: invoices = [] } = useQuery<Invoice[]>({
    queryKey: ["invoices"],
    queryFn: async () => {
      const token = await getToken();
      return fetch(`${API}/invoices`, { headers: apiHeaders(token) }).then(r => r.json());
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const body = {
        clientName: form.clientName, clientEmail: form.clientEmail,
        currency: form.currency, taxRate: Number(form.taxRate),
        dueDate: form.dueDate || undefined, notes: form.notes || undefined,
        lineItems: form.lines.map(l => ({ description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice) })),
      };
      const r = await fetch(`${API}/invoices`, { method: "POST", headers: apiHeaders(token), body: JSON.stringify(body) });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); setOpen(false); toast({ title: "Invoice created" }); },
    onError: () => toast({ title: "Failed to create invoice", variant: "destructive" }),
  });

  const payLinkMut = useMutation({
    mutationFn: async ({ id, gw }: { id: number; gw: PaymentGateway }) => {
      const token = await getToken();
      const r = await fetch(`${API}/invoices/${id}/payment-link`, { method: "POST", headers: apiHeaders(token), body: JSON.stringify({ gateway: gw }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error); }
      return r.json() as Promise<{ paymentLink: string }>;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      setPayOpen(false);
      navigator.clipboard.writeText(data.paymentLink).catch(() => {});
      window.open(data.paymentLink, "_blank");
      toast({ title: "Payment link generated", description: "Opened in new tab and copied to clipboard" });
    },
    onError: (e: Error) => toast({ title: "Failed to generate link", description: e.message, variant: "destructive" }),
  });

  const remindMut = useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken();
      await fetch(`${API}/invoices/${id}/remind`, { method: "POST", headers: apiHeaders(token) });
    },
    onSuccess: () => toast({ title: "Reminder logged", description: "Payment reminder recorded for 3/7/14-day follow-up" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken();
      await fetch(`${API}/invoices/${id}`, { method: "DELETE", headers: apiHeaders(token) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invoices"] }); toast({ title: "Invoice deleted" }); },
  });

  function openNew() {
    setForm({ clientName: "", clientEmail: "", currency: "NGN", taxRate: "7.5", dueDate: "", notes: "", lines: [{ description: "", quantity: "1", unitPrice: "" }] });
    setOpen(true);
  }

  function addLine() { setForm(f => ({ ...f, lines: [...f.lines, { description: "", quantity: "1", unitPrice: "" }] })); }
  function removeLine(i: number) { setForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) })); }
  function updateLine(i: number, field: string, value: string) { setForm(f => ({ ...f, lines: f.lines.map((l, j) => j === i ? { ...l, [field]: value } : l) })); }

  const subtotal = form.lines.reduce((a, l) => a + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0);
  const taxAmt = subtotal * (Number(form.taxRate) / 100);
  const total = subtotal + taxAmt;

  const overdueCount = invoices.filter(i => i.status === "overdue").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-sm text-gray-500">{invoices.length} invoices</p>
          {overdueCount > 0 && <Badge className="bg-red-100 text-red-700 border-red-200">{overdueCount} overdue · auto-reminders at 3/7/14 days</Badge>}
        </div>
        <Button size="sm" onClick={openNew} className="bg-emerald-500 hover:bg-emerald-600 text-white">+ New Invoice</Button>
      </div>

      <div className="space-y-2">
        {invoices.map(inv => (
          <div key={inv.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">{inv.invoiceNumber}</span>
                <Badge className={`text-xs ${INVOICE_STATUS_COLORS[inv.status]}`}>{inv.status}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-0.5 truncate">{inv.clientName} · {inv.clientEmail}</p>
              {inv.dueDate && <p className="text-xs text-gray-400 mt-0.5">Due {new Date(inv.dueDate).toLocaleDateString("en-NG")}</p>}
            </div>
            <div className="text-right mr-2">
              <p className="text-base font-bold text-gray-900">{fmt(inv.total, inv.currency)}</p>
              <p className="text-xs text-gray-400">{inv.currency}</p>
            </div>
            <div className="flex gap-1 flex-shrink-0">
              {inv.status !== "paid" && inv.status !== "cancelled" && (
                <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => { setSelectedInvoice(inv); setPayOpen(true); }}>Pay Link</Button>
              )}
              {(inv.status === "sent" || inv.status === "overdue") && (
                <Button size="sm" variant="outline" className="text-xs h-7 px-2 text-amber-600 border-amber-200" onClick={() => remindMut.mutate(inv.id)}>Remind</Button>
              )}
              <Button size="sm" variant="ghost" className="text-xs h-7 px-2 text-red-500" onClick={() => deleteMut.mutate(inv.id)}>✕</Button>
            </div>
          </div>
        ))}
        {invoices.length === 0 && <p className="text-center text-sm text-gray-400 py-8">No invoices yet</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>New Invoice</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Client Name *</Label><Input value={form.clientName} onChange={e => setForm(f => ({ ...f, clientName: e.target.value }))} /></div>
              <div><Label>Client Email *</Label><Input value={form.clientEmail} onChange={e => setForm(f => ({ ...f, clientEmail: e.target.value }))} type="email" /></div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Currency</Label>
                <Select value={form.currency} onValueChange={v => setForm(f => ({ ...f, currency: v as Currency }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tax Rate (%)</Label><Input value={form.taxRate} onChange={e => setForm(f => ({ ...f, taxRate: e.target.value }))} type="number" /></div>
              <div><Label>Due Date</Label><Input value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} type="date" /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Line Items</Label>
                <Button type="button" size="sm" variant="outline" onClick={addLine} className="text-xs h-7">+ Add Line</Button>
              </div>
              <div className="space-y-2">
                {form.lines.map((line, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6"><Input value={line.description} onChange={e => updateLine(i, "description", e.target.value)} placeholder="Description" /></div>
                    <div className="col-span-2"><Input value={line.quantity} onChange={e => updateLine(i, "quantity", e.target.value)} type="number" placeholder="Qty" /></div>
                    <div className="col-span-3"><Input value={line.unitPrice} onChange={e => updateLine(i, "unitPrice", e.target.value)} type="number" placeholder="Unit price" /></div>
                    <div className="col-span-1 flex justify-center">
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeLine(i)} className="text-red-400 h-7 w-7 p-0">✕</Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
              <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{fmt(subtotal, form.currency)}</span></div>
              <div className="flex justify-between text-gray-600"><span>Tax ({form.taxRate}%)</span><span>{fmt(taxAmt, form.currency)}</span></div>
              <div className="flex justify-between font-bold text-gray-900 pt-1 border-t border-gray-200"><span>Total</span><span>{fmt(total, form.currency)}</span></div>
            </div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.clientName}>
              {createMut.isPending ? "Creating…" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Generate Payment Link</DialogTitle></DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4 py-2">
              <div className="bg-gray-50 rounded-lg p-3 text-sm">
                <p className="font-semibold">{selectedInvoice.invoiceNumber}</p>
                <p className="text-gray-600">{selectedInvoice.clientName}</p>
                <p className="text-lg font-bold text-gray-900 mt-1">{fmt(selectedInvoice.total, selectedInvoice.currency)}</p>
              </div>
              <div><Label>Payment Gateway</Label>
                <Select value={gateway} onValueChange={v => setGateway(v as PaymentGateway)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paystack">Paystack (NGN — Nigeria)</SelectItem>
                    <SelectItem value="flutterwave">Flutterwave (GHS/KES/ZAR multi-currency)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="text-xs text-gray-400">A payment link is generated, the invoice updates to "sent", and the link opens in a new tab. When the client pays, the webhook auto-marks it as paid.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white"
              onClick={() => selectedInvoice && payLinkMut.mutate({ id: selectedInvoice.id, gw: gateway })}
              disabled={payLinkMut.isPending}>
              {payLinkMut.isPending ? "Generating…" : "Generate Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Affiliate Links ──────────────────────────────────────────────────────────

function AffiliateLinksPanel() {
  const qc = useQueryClient();
  const getToken = useApiToken();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [slugError, setSlugError] = useState("");
  const [form, setForm] = useState({ name: "", destinationUrl: "", slug: "", platform: "__none__", campaignTag: "" });

  const { data: links = [] } = useQuery<AffiliateLink[]>({
    queryKey: ["affiliate-links"],
    queryFn: async () => {
      const token = await getToken();
      return fetch(`${API}/affiliate-links`, { headers: apiHeaders(token) }).then(r => r.json());
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const token = await getToken();
      const body = { ...form, platform: form.platform === "__none__" ? undefined : form.platform };
      const r = await fetch(`${API}/affiliate-links`, { method: "POST", headers: apiHeaders(token), body: JSON.stringify(body) });
      if (r.status === 409) { const e = await r.json(); throw new Error(e.error); }
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["affiliate-links"] }); setOpen(false); setSlugError(""); toast({ title: "Affiliate link created" }); },
    onError: (e: Error) => {
      if (e.message.includes("Slug")) setSlugError(e.message);
      else toast({ title: "Failed to create link", description: e.message, variant: "destructive" });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const token = await getToken();
      await fetch(`${API}/affiliate-links/${id}`, { method: "DELETE", headers: apiHeaders(token) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["affiliate-links"] }); toast({ title: "Link deleted" }); },
  });

  const totalClicks = links.reduce((a, l) => a + l.clickCount, 0);
  const totalConversions = links.reduce((a, l) => a + l.conversionCount, 0);
  const totalRevenue = links.reduce((a, l) => a + l.revenueGenerated, 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Clicks", value: totalClicks.toLocaleString(), color: "text-blue-600" },
          { label: "Conversions", value: totalConversions.toLocaleString(), color: "text-purple-600" },
          { label: "Revenue Generated", value: fmt(totalRevenue, "NGN"), color: "text-emerald-600" },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
            <p className="text-xs text-gray-500">{s.label}</p>
            <p className={`text-lg font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => { setForm({ name: "", destinationUrl: "", slug: "", platform: "__none__", campaignTag: "" }); setSlugError(""); setOpen(true); }} className="bg-emerald-500 hover:bg-emerald-600 text-white">+ New Link</Button>
      </div>

      <div className="space-y-2">
        {links.map(link => {
          const ctr = link.clickCount > 0 ? ((link.conversionCount / link.clickCount) * 100).toFixed(1) : "0.0";
          return (
            <div key={link.id} className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-gray-800 truncate">{link.name}</p>
                  {!link.isActive && <Badge className="text-[10px] bg-gray-100 text-gray-500">Inactive</Badge>}
                  {link.platform && <Badge className="text-[10px] bg-blue-50 text-blue-600">{link.platform}</Badge>}
                </div>
                <p className="text-xs text-gray-400 mt-0.5 truncate font-mono">/r/{link.slug}</p>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center text-xs mr-2">
                <div><p className="text-gray-400">Clicks</p><p className="font-bold text-gray-700">{link.clickCount.toLocaleString()}</p></div>
                <div><p className="text-gray-400">CVR</p><p className="font-bold text-purple-600">{ctr}%</p></div>
                <div><p className="text-gray-400">Revenue</p><p className="font-bold text-emerald-600">{fmt(link.revenueGenerated, "NGN")}</p></div>
              </div>
              <Button size="sm" variant="ghost" className="text-red-400 h-7 w-7 p-0 flex-shrink-0" onClick={() => deleteMut.mutate(link.id)}>✕</Button>
            </div>
          );
        })}
        {links.length === 0 && <p className="text-center text-sm text-gray-400 py-8">No affiliate links yet</p>}
      </div>

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setSlugError(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Affiliate Link</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Link Name *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. 999 Book — Instagram Bio" /></div>
            <div><Label>Destination URL *</Label><Input value={form.destinationUrl} onChange={e => setForm(f => ({ ...f, destinationUrl: e.target.value }))} placeholder="https://charlyboy.com/999" /></div>
            <div>
              <Label>Slug * <span className="text-gray-400 font-normal">(must be unique)</span></Label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-gray-400">/r/</span>
                <Input value={form.slug} onChange={e => { setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })); setSlugError(""); }} placeholder="999-ig" className={slugError ? "border-red-400" : ""} />
              </div>
              {slugError && <p className="text-xs text-red-500 mt-1">{slugError}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Platform</Label>
                <Select value={form.platform} onValueChange={v => setForm(f => ({ ...f, platform: v }))}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Any</SelectItem>
                    {["instagram", "tiktok", "x", "youtube", "facebook", "threads"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Campaign Tag</Label><Input value={form.campaignTag} onChange={e => setForm(f => ({ ...f, campaignTag: e.target.value }))} placeholder="book-launch" /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="bg-emerald-500 hover:bg-emerald-600 text-white" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name || !form.destinationUrl || !form.slug}>
              {createMut.isPending ? "Creating…" : "Create Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MonetizationPage() {
  const [currency, setCurrency] = useState<Currency>("NGN");

  return (
    <AppShell>
      <TierGuard requiredTier="creator" moduleKey="monetization">
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Monetization Hub</h1>
              <p className="text-sm text-gray-500 mt-1">Brand deals · Invoices · Rate calculator · Affiliate tracking · Revenue analytics</p>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-gray-500">Display Currency</Label>
              <Select value={currency} onValueChange={v => setCurrency(v as Currency)}>
                <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <RevenueOverview currency={currency} />

          <Tabs defaultValue="deals">
            <TabsList className="bg-gray-100">
              <TabsTrigger value="deals">Brand Deals</TabsTrigger>
              <TabsTrigger value="calculator">Rate Calculator</TabsTrigger>
              <TabsTrigger value="invoices">Invoices</TabsTrigger>
              <TabsTrigger value="affiliate">Affiliate Links</TabsTrigger>
            </TabsList>

            <TabsContent value="deals" className="mt-4">
              <BrandDealsPanel currency={currency} />
            </TabsContent>
            <TabsContent value="calculator" className="mt-4">
              <RateCalculator currency={currency} />
            </TabsContent>
            <TabsContent value="invoices" className="mt-4">
              <InvoicesPanel />
            </TabsContent>
            <TabsContent value="affiliate" className="mt-4">
              <AffiliateLinksPanel />
            </TabsContent>
          </Tabs>
        </div>
      </TierGuard>
    </AppShell>
  );
}
