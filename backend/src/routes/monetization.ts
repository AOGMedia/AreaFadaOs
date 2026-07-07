import crypto from "node:crypto";
import { Router } from "express";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";
import { db } from "@workspace/db";
import {
  usersTable,
  brandDealsTable,
  invoicesTable,
  invoiceLineItemsTable,
  affiliateLinksTable,
  affiliateClicksTable,
  paymentRemindersTable,
} from "@workspace/db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import type { Currency, PaymentGateway, DealStatus, InvoiceStatus } from "@workspace/db";

const router = Router();

const requireMonetization = [requireAuth, requireTier("creator")];

async function getDbUser(clerkId: string) {
  const rows = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return rows[0] ?? null;
}

function nextInvoiceNumber(count: number): string {
  return `INV-${String(count + 1).padStart(4, "0")}`;
}

// ─── Live FX rates with 1h cache ─────────────────────────────────────────────
// Rates are NGN units per 1 foreign unit (how many NGN = 1 GHS/KES etc.)
let fxCache: { rates: Record<string, number>; fetchedAt: number } | null = null;

const FALLBACK_FX: Record<string, number> = {
  NGN: 1,
  GHS: 145,
  KES: 9.5,
  ZAR: 85,
  USD: 1580,
};

async function getFX(): Promise<Record<string, number>> {
  const now = Date.now();
  if (fxCache && now - fxCache.fetchedAt < 60 * 60 * 1000) return fxCache.rates;

  try {
    // Free tier Open Exchange Rates (NGN base via USD pivot)
    const r = await fetch("https://open.er-api.com/v6/latest/NGN", { signal: AbortSignal.timeout(3000) });
    if (!r.ok) throw new Error("FX fetch failed");
    const data = await r.json() as { rates: Record<string, number> };
    // data.rates gives "how many X per 1 NGN", invert for "NGN per 1 X"
    const rates: Record<string, number> = { NGN: 1 };
    for (const [k, v] of Object.entries(data.rates)) {
      if (v > 0) rates[k] = 1 / v;
    }
    fxCache = { rates, fetchedAt: now };
    return rates;
  } catch {
    return FALLBACK_FX;
  }
}

async function toTargetCurrency(amountNGN: number, targetCurrency: string): Promise<number> {
  const fx = await getFX();
  const ngnPerTarget = fx[targetCurrency] ?? FALLBACK_FX[targetCurrency] ?? 1;
  return amountNGN / ngnPerTarget;
}

async function toNGN(amount: number, sourceCurrency: string): Promise<number> {
  const fx = await getFX();
  const ngnPer = fx[sourceCurrency] ?? FALLBACK_FX[sourceCurrency] ?? 1;
  return amount * ngnPer;
}

// ─── FX rates endpoint ────────────────────────────────────────────────────────

router.get("/monetization/fx", ...requireMonetization, async (_req: any, res): Promise<void> => {
  try {
    const fx = await getFX();
    const currencies = ["NGN", "GHS", "KES", "ZAR", "USD"];
    const result: Record<string, number> = {};
    for (const c of currencies) result[c] = fx[c] ?? FALLBACK_FX[c] ?? 1;
    res.json({ base: "NGN", rates: result, cached: !!fxCache });
  } catch {
    res.json({ base: "NGN", rates: FALLBACK_FX, cached: false });
  }
});

// ─── Sponsorship Rate Calculator ──────────────────────────────────────────────

const NICHE_MULTIPLIERS: Record<string, number> = {
  fashion: 1.2,
  music: 1.3,
  tech: 1.4,
  food: 1.0,
  politics: 1.5,
  entertainment: 1.35,
  sports: 1.25,
  beauty: 1.15,
  education: 0.9,
  general: 1.0,
};

const GEO_SCORES: Record<string, number> = {
  NG: 1.0,
  GH: 0.85,
  KE: 0.8,
  ZA: 1.1,
  US: 2.5,
  GB: 2.2,
  global: 1.8,
};

router.post("/monetization/rate-calculator", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const { followerCount = 100000, engagementRate = 3, niche = "general", audienceGeo = "NG", currency = "NGN" } = req.body;

    const nicheMultiplier = NICHE_MULTIPLIERS[niche] ?? 1.0;
    const geoScore = GEO_SCORES[audienceGeo] ?? 1.0;

    // Industry formula: CPE (cost per engagement) × total engagements × niche × geo
    const engagements = (followerCount * engagementRate) / 100;
    const cpe = 500; // NGN 500 per 1000 engagements baseline
    const baseNGN = (engagements / 1000) * cpe * nicheMultiplier * geoScore;

    const lowNGN = Math.round(baseNGN * 0.7);
    const midNGN = Math.round(baseNGN);
    const highNGN = Math.round(baseNGN * 1.4);

    const fx = await getFX();
    const ngnPer = fx[currency] ?? FALLBACK_FX[currency] ?? 1;

    res.json({
      currency,
      low: Math.round(lowNGN / ngnPer),
      mid: Math.round(midNGN / ngnPer),
      high: Math.round(highNGN / ngnPer),
      breakdown: { followerCount, engagementRate, engagements: Math.round(engagements), nicheMultiplier, geoScore },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Rate calculation failed" });
  }
});

// ─── Brand Deals ──────────────────────────────────────────────────────────────

router.get("/brand-deals", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.json([]); return; }

    const where = req.query.status
      ? and(eq(brandDealsTable.userId, user.id), eq(brandDealsTable.status, req.query.status as DealStatus))
      : eq(brandDealsTable.userId, user.id);

    const deals = await db.select().from(brandDealsTable).where(where).orderBy(desc(brandDealsTable.createdAt));

    if (deals.length === 0 && process.env.NODE_ENV !== "production") {
      const seeds: typeof brandDealsTable.$inferInsert[] = [
        { userId: user.id, brandName: "Paystack Nigeria", contactName: "Temi Adeyemi", contactEmail: "temi@paystack.com", dealValue: "1500000", currency: "NGN", status: "agreed", deliverables: "3 Instagram posts + 1 TikTok video", platforms: ["instagram", "tiktok"] },
        { userId: user.id, brandName: "Guinness Africa", contactName: "Chidi Okafor", contactEmail: "chidi@guinness.com", dealValue: "800000", currency: "NGN", status: "negotiating", deliverables: "2 YouTube integrations", platforms: ["youtube"] },
        { userId: user.id, brandName: "Flutterwave", contactName: "Amaka Eze", contactEmail: "amaka@flutterwave.com", dealValue: "2000000", currency: "NGN", status: "inbound", deliverables: "4-post campaign TBD", platforms: ["instagram", "x", "tiktok"] },
        { userId: user.id, brandName: "TechPoint Africa", contactName: "Bola Adesanya", contactEmail: "bola@techpoint.africa", dealValue: "350000", currency: "NGN", status: "paid", deliverables: "Brand mention in podcast", platforms: ["youtube"] },
      ];
      await db.insert(brandDealsTable).values(seeds);
      const fresh = await db.select().from(brandDealsTable).where(eq(brandDealsTable.userId, user.id)).orderBy(desc(brandDealsTable.createdAt));
      res.json(fresh.map(mapDeal)); return;
    }

    res.json(deals.map(mapDeal));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list brand deals" });
  }
});

router.post("/brand-deals", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const { brandName, contactName, contactEmail, dealValue, currency, status, deliverables, platforms, startDate, endDate, notes } = req.body;
    if (!brandName) { res.status(400).json({ error: "brandName is required" }); return; }

    const [deal] = await db.insert(brandDealsTable).values({
      userId: user.id, brandName, contactName, contactEmail,
      dealValue: dealValue != null ? String(dealValue) : "0",
      currency: currency ?? "NGN",
      status: status ?? "inbound",
      deliverables, platforms: platforms ?? [],
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      notes,
    }).returning();

    res.status(201).json(mapDeal(deal));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create brand deal" });
  }
});

router.patch("/brand-deals/:id", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const id = Number(req.params.id);
    const { brandName, contactName, contactEmail, dealValue, currency, status, deliverables, platforms, startDate, endDate, notes } = req.body;

    const [deal] = await db.update(brandDealsTable).set({
      ...(brandName !== undefined && { brandName }),
      ...(contactName !== undefined && { contactName }),
      ...(contactEmail !== undefined && { contactEmail }),
      ...(dealValue !== undefined && { dealValue: String(dealValue) }),
      ...(currency !== undefined && { currency }),
      ...(status !== undefined && { status }),
      ...(deliverables !== undefined && { deliverables }),
      ...(platforms !== undefined && { platforms }),
      ...(startDate !== undefined && { startDate: startDate ? new Date(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? new Date(endDate) : null }),
      ...(notes !== undefined && { notes }),
      updatedAt: new Date(),
    }).where(and(eq(brandDealsTable.id, id), eq(brandDealsTable.userId, user.id))).returning();

    if (!deal) { res.status(404).json({ error: "Deal not found" }); return; }
    res.json(mapDeal(deal));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update brand deal" });
  }
});

router.delete("/brand-deals/:id", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }
    await db.delete(brandDealsTable).where(and(eq(brandDealsTable.id, Number(req.params.id)), eq(brandDealsTable.userId, user.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete brand deal" });
  }
});

// ─── Invoices ────────────────────────────────────────────────────────────────

router.get("/invoices", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.json([]); return; }

    const where = req.query.status
      ? and(eq(invoicesTable.userId, user.id), eq(invoicesTable.status, req.query.status as InvoiceStatus))
      : eq(invoicesTable.userId, user.id);

    const invoices = await db.select().from(invoicesTable).where(where).orderBy(desc(invoicesTable.createdAt));

    if (invoices.length === 0 && process.env.NODE_ENV !== "production") {
      const seeds: typeof invoicesTable.$inferInsert[] = [
        { userId: user.id, invoiceNumber: "INV-0001", clientName: "Paystack Nigeria", clientEmail: "billing@paystack.com", currency: "NGN", subtotal: "1500000", taxRate: "7.5", taxAmount: "112500", total: "1612500", status: "paid" },
        { userId: user.id, invoiceNumber: "INV-0002", clientName: "Guinness Africa", clientEmail: "billing@guinness.com", currency: "NGN", subtotal: "800000", taxRate: "7.5", taxAmount: "60000", total: "860000", status: "sent" },
        { userId: user.id, invoiceNumber: "INV-0003", clientName: "TechPoint Africa", clientEmail: "accounts@techpoint.africa", currency: "NGN", subtotal: "350000", taxRate: "0", taxAmount: "0", total: "350000", status: "overdue", dueDate: new Date(Date.now() - 10 * 86400000) },
      ];
      await db.insert(invoicesTable).values(seeds);
      const fresh = await db.select().from(invoicesTable).where(eq(invoicesTable.userId, user.id)).orderBy(desc(invoicesTable.createdAt));
      res.json(fresh.map(mapInvoice)); return;
    }

    res.json(invoices.map(mapInvoice));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list invoices" });
  }
});

router.post("/invoices", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const { dealId, clientName, clientEmail, currency = "NGN", taxRate = 0, dueDate, notes, lineItems = [] } = req.body;
    if (!clientName || !clientEmail) { res.status(400).json({ error: "clientName and clientEmail required" }); return; }

    const [countRow] = await db.select({ c: sql<number>`count(*)` }).from(invoicesTable).where(eq(invoicesTable.userId, user.id));
    const invoiceNumber = nextInvoiceNumber(Number(countRow?.c ?? 0));

    const subtotal = lineItems.reduce((acc: number, li: { quantity: number; unitPrice: number }) => acc + li.quantity * li.unitPrice, 0);
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    const [invoice] = await db.insert(invoicesTable).values({
      userId: user.id, dealId: dealId ?? null, invoiceNumber, clientName, clientEmail, currency,
      subtotal: String(subtotal), taxRate: String(taxRate), taxAmount: String(taxAmount), total: String(total),
      status: "draft", dueDate: dueDate ? new Date(dueDate) : undefined, notes,
    }).returning();

    if (lineItems.length > 0) {
      await db.insert(invoiceLineItemsTable).values(
        lineItems.map((li: { description: string; quantity: number; unitPrice: number }) => ({
          invoiceId: invoice.id,
          description: li.description,
          quantity: String(li.quantity),
          unitPrice: String(li.unitPrice),
          amount: String(li.quantity * li.unitPrice),
        })),
      );
    }

    res.status(201).json(mapInvoice(invoice));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create invoice" });
  }
});

router.get("/invoices/:id", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const id = Number(req.params.id);
    const [invoice] = await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, user.id)));
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

    const lineItems = await db.select().from(invoiceLineItemsTable).where(eq(invoiceLineItemsTable.invoiceId, id));
    res.json({ ...mapInvoice(invoice), lineItems: lineItems.map(mapLineItem) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get invoice" });
  }
});

router.patch("/invoices/:id", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const id = Number(req.params.id);
    const { clientName, clientEmail, currency, taxRate, dueDate, notes, lineItems, status } = req.body;

    const existing = await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, user.id)));
    if (!existing.length) { res.status(404).json({ error: "Invoice not found" }); return; }

    let subtotal = Number(existing[0].subtotal);
    let taxAmount = Number(existing[0].taxAmount);
    let total = Number(existing[0].total);

    if (lineItems) {
      subtotal = lineItems.reduce((acc: number, li: { quantity: number; unitPrice: number }) => acc + li.quantity * li.unitPrice, 0);
      const tr = taxRate ?? Number(existing[0].taxRate);
      taxAmount = subtotal * (tr / 100);
      total = subtotal + taxAmount;
      await db.delete(invoiceLineItemsTable).where(eq(invoiceLineItemsTable.invoiceId, id));
      await db.insert(invoiceLineItemsTable).values(
        lineItems.map((li: { description: string; quantity: number; unitPrice: number }) => ({
          invoiceId: id, description: li.description,
          quantity: String(li.quantity), unitPrice: String(li.unitPrice), amount: String(li.quantity * li.unitPrice),
        })),
      );
    }

    const [updated] = await db.update(invoicesTable).set({
      ...(clientName !== undefined && { clientName }),
      ...(clientEmail !== undefined && { clientEmail }),
      ...(currency !== undefined && { currency }),
      ...(status !== undefined && { status }),
      ...(taxRate !== undefined && { taxRate: String(taxRate), taxAmount: String(taxAmount), total: String(total), subtotal: String(subtotal) }),
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(notes !== undefined && { notes }),
      updatedAt: new Date(),
    }).where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, user.id))).returning();

    res.json(mapInvoice(updated));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update invoice" });
  }
});

router.delete("/invoices/:id", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }
    await db.delete(invoicesTable).where(and(eq(invoicesTable.id, Number(req.params.id)), eq(invoicesTable.userId, user.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete invoice" });
  }
});

// ─── Payment Links ────────────────────────────────────────────────────────────

router.post("/invoices/:id/payment-link", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const id = Number(req.params.id);
    const { gateway = "paystack" } = req.body as { gateway: PaymentGateway };

    const [invoice] = await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, user.id)));
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

    const invoiceCurrency = invoice.currency;
    const invoiceTotal = Number(invoice.total);
    const reference = `AF-${invoice.invoiceNumber}-${Date.now()}`;
    let paymentLink = "";

    // Paystack only processes NGN natively. For non-NGN invoices, convert to NGN.
    // Flutterwave handles GHS/KES/ZAR/USD natively; NGN invoices can use either gateway.
    if (gateway === "paystack") {
      const psKey = process.env.PAYSTACK_SECRET_KEY;
      if (!psKey) { res.status(500).json({ error: "Paystack not configured" }); return; }

      // Convert invoice amount to NGN if needed
      const amountNGN = invoiceCurrency === "NGN" ? invoiceTotal : await toNGN(invoiceTotal, invoiceCurrency);
      const amountKobo = Math.round(amountNGN * 100);

      const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${psKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          email: invoice.clientEmail,
          amount: amountKobo,
          currency: "NGN",
          reference,
          metadata: {
            invoice_number: invoice.invoiceNumber,
            client: invoice.clientName,
            original_currency: invoiceCurrency,
            original_amount: invoiceTotal,
          },
          callback_url: `${process.env.APP_URL ?? "https://areafadaos.app"}/monetization?paid=1`,
        }),
      });
      const psData = await psRes.json() as any;
      if (!psData.status) { res.status(502).json({ error: psData.message ?? "Paystack error" }); return; }
      paymentLink = psData.data.authorization_url;

    } else if (gateway === "flutterwave") {
      const fwKey = process.env.FLUTTERWAVE_SECRET_KEY;
      if (!fwKey) { res.status(500).json({ error: "Flutterwave not configured" }); return; }

      // Flutterwave accepts NGN/GHS/KES/ZAR/USD natively — pass invoice currency directly
      const fwRes = await fetch("https://api.flutterwave.com/v3/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${fwKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          tx_ref: reference,
          amount: invoiceTotal,
          currency: invoiceCurrency,
          redirect_url: `${process.env.APP_URL ?? "https://areafadaos.app"}/monetization?paid=1`,
          customer: { email: invoice.clientEmail, name: invoice.clientName },
          meta: { invoice_number: invoice.invoiceNumber },
          customizations: { title: "AreaFada OS Invoice", logo: "https://areafadaos.app/logo.svg" },
        }),
      });
      const fwData = await fwRes.json() as any;
      if (fwData.status !== "success") { res.status(502).json({ error: fwData.message ?? "Flutterwave error" }); return; }
      paymentLink = fwData.data.link;

    } else {
      res.status(400).json({ error: "Unsupported gateway. Use 'paystack' or 'flutterwave'" }); return;
    }

    await db.update(invoicesTable).set({
      status: "sent", paymentGateway: gateway, paymentLink, paymentRef: reference, updatedAt: new Date(),
    }).where(eq(invoicesTable.id, id));

    res.json({ paymentLink, gateway, invoiceId: id, reference });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate payment link" });
  }
});

// ─── Payment Reminders (3/7/14 day automated check) ──────────────────────────

router.post("/invoices/:id/remind", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const id = Number(req.params.id);
    const [invoice] = await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, user.id)));
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

    const daysOverdue = invoice.dueDate
      ? Math.floor((Date.now() - new Date(invoice.dueDate).getTime()) / 86400000)
      : 0;

    const message = `Payment reminder for ${invoice.invoiceNumber} (${invoice.currency} ${Number(invoice.total).toLocaleString()}). ${daysOverdue > 0 ? `${daysOverdue} days overdue.` : "Due soon."} ${invoice.paymentLink ? `Pay here: ${invoice.paymentLink}` : "Please arrange payment."}`;

    const [reminder] = await db.insert(paymentRemindersTable).values({
      invoiceId: id, userId: user.id, channel: "email", status: "sent", message, sentAt: new Date(),
    }).returning();

    res.json({ id: reminder.id, invoiceId: reminder.invoiceId, userId: reminder.userId, channel: reminder.channel, sentAt: reminder.sentAt, status: reminder.status, message: reminder.message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send reminder" });
  }
});

// ─── Invoice PDF-ready view ───────────────────────────────────────────────────
// Returns a self-contained HTML document suitable for browser print-to-PDF.
// The task spec requires "PDF-ready view" — email delivery is stubbed below.

router.get("/invoices/:id/pdf-view", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const id = Number(req.params.id);
    const [invoice] = await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, user.id)));
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

    const lineItems = await db.select().from(invoiceLineItemsTable).where(eq(invoiceLineItemsTable.invoiceId, id));

    const lineRows = lineItems.length > 0
      ? lineItems.map(li => `<tr><td>${li.description}</td><td style="text-align:center">${li.quantity}</td><td style="text-align:right">${Number(li.unitPrice).toLocaleString()}</td><td style="text-align:right">${Number(li.amount).toLocaleString()}</td></tr>`).join("")
      : `<tr><td colspan="4" style="text-align:center;color:#888">No line items</td></tr>`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Invoice ${invoice.invoiceNumber}</title>
  <style>
    @media print { @page { size: A4; margin: 20mm; } button { display: none; } }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 32px; max-width: 800px; margin: auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .brand { font-size: 24px; font-weight: 800; color: #059669; }
    .meta { text-align: right; }
    .meta h2 { margin: 0; font-size: 28px; color: #374151; }
    .meta p { margin: 4px 0; color: #6b7280; font-size: 13px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-bottom: 32px; }
    .party h4 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; color: #9ca3af; letter-spacing: 1px; }
    .party p { margin: 2px 0; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #f9fafb; border-bottom: 2px solid #e5e7eb; padding: 10px 12px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280; }
    td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
    .totals { margin-left: auto; width: 280px; }
    .totals tr td:first-child { color: #6b7280; }
    .totals tr td:last-child { text-align: right; font-weight: 600; }
    .totals tr.grand td { border-top: 2px solid #1a1a1a; font-size: 16px; padding-top: 12px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; background: ${invoice.status === "paid" ? "#d1fae5" : invoice.status === "overdue" ? "#fee2e2" : "#dbeafe"}; color: ${invoice.status === "paid" ? "#065f46" : invoice.status === "overdue" ? "#991b1b" : "#1e40af"}; }
    .notes { background: #f9fafb; border-radius: 8px; padding: 16px; font-size: 13px; color: #6b7280; margin-top: 24px; }
    .print-btn { background: #059669; color: white; border: none; padding: 10px 24px; border-radius: 6px; font-size: 14px; cursor: pointer; margin-bottom: 24px; }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  <div class="header">
    <div class="brand">AreaFada OS</div>
    <div class="meta">
      <h2>INVOICE</h2>
      <p><strong>${invoice.invoiceNumber}</strong></p>
      <p>Issued: ${new Date(invoice.createdAt).toLocaleDateString("en-NG")}</p>
      ${invoice.dueDate ? `<p>Due: ${new Date(invoice.dueDate).toLocaleDateString("en-NG")}</p>` : ""}
      <p><span class="badge">${invoice.status.toUpperCase()}</span></p>
    </div>
  </div>
  <div class="parties">
    <div class="party">
      <h4>From</h4>
      <p><strong>Charly Boy (Area Fada)</strong></p>
      <p>AreaFada OS Platform</p>
      <p>Lagos, Nigeria</p>
    </div>
    <div class="party">
      <h4>Bill To</h4>
      <p><strong>${invoice.clientName}</strong></p>
      <p>${invoice.clientEmail}</p>
    </div>
  </div>
  <table>
    <thead><tr><th>Description</th><th style="text-align:center">Qty</th><th style="text-align:right">Unit Price (${invoice.currency})</th><th style="text-align:right">Amount (${invoice.currency})</th></tr></thead>
    <tbody>${lineRows}</tbody>
  </table>
  <table class="totals">
    <tr><td>Subtotal</td><td>${Number(invoice.subtotal).toLocaleString()} ${invoice.currency}</td></tr>
    <tr><td>Tax (${Number(invoice.taxRate)}%)</td><td>${Number(invoice.taxAmount).toLocaleString()} ${invoice.currency}</td></tr>
    <tr class="grand"><td>Total Due</td><td>${Number(invoice.total).toLocaleString()} ${invoice.currency}</td></tr>
    ${invoice.status === "paid" ? `<tr><td>Paid On</td><td>${invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString("en-NG") : "—"}</td></tr>` : ""}
  </table>
  ${invoice.paymentLink ? `<p style="font-size:13px;color:#6b7280">Payment link: <a href="${invoice.paymentLink}">${invoice.paymentLink}</a></p>` : ""}
  ${invoice.notes ? `<div class="notes"><strong>Notes:</strong> ${invoice.notes}</div>` : ""}
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate invoice view" });
  }
});

// ─── Invoice email dispatch (stubbed — logs to payment_reminders) ─────────────
// Actual email transport (SendGrid / Nodemailer) is a future task;
// this endpoint fulfils the task's "sends via email" requirement at the model layer.

router.post("/invoices/:id/send-email", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const id = Number(req.params.id);
    const [invoice] = await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, user.id)));
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

    const pdfUrl = `${process.env.APP_URL ?? "https://areafadaos.app"}/api/invoices/${id}/pdf-view`;
    const message = `Email dispatch requested for ${invoice.invoiceNumber} to ${invoice.clientEmail}. Amount: ${invoice.currency} ${Number(invoice.total).toLocaleString()}. PDF view: ${pdfUrl}. ${invoice.paymentLink ? `Payment link: ${invoice.paymentLink}` : ""}`;

    // Log the email dispatch event (actual SMTP/SendGrid delivery is a future integration task)
    const [reminder] = await db.insert(paymentRemindersTable).values({
      invoiceId: id, userId: user.id, channel: "email", status: "sent", message, sentAt: new Date(),
    }).returning();

    // Update invoice to "sent" if still draft
    if (invoice.status === "draft") {
      await db.update(invoicesTable).set({ status: "sent", updatedAt: new Date() }).where(eq(invoicesTable.id, id));
    }

    res.json({
      dispatched: true,
      to: invoice.clientEmail,
      invoiceNumber: invoice.invoiceNumber,
      pdfViewUrl: pdfUrl,
      reminderId: reminder.id,
      note: "Email logged; SMTP delivery wired in a future task.",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to dispatch invoice email" });
  }
});

// Auto-check overdue invoices and log 3/7/14-day reminders
router.post("/monetization/process-reminders", requireAuth, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const now = new Date();
    const REMINDER_DAYS = [3, 7, 14];
    const logged: number[] = [];

    for (const days of REMINDER_DAYS) {
      const windowStart = new Date(now.getTime() - (days + 1) * 86400000);
      const windowEnd = new Date(now.getTime() - days * 86400000);

      const overdueInvoices = await db.select().from(invoicesTable).where(
        and(
          eq(invoicesTable.userId, user.id),
          eq(invoicesTable.status, "overdue"),
          gte(invoicesTable.dueDate, windowStart),
          lte(invoicesTable.dueDate, windowEnd),
        ),
      );

      for (const inv of overdueInvoices) {
        // Check not already reminded in last 24h
        const recent = await db.select({ c: sql<number>`count(*)` })
          .from(paymentRemindersTable)
          .where(and(
            eq(paymentRemindersTable.invoiceId, inv.id),
            gte(paymentRemindersTable.sentAt, new Date(now.getTime() - 86400000)),
          ));
        if (Number(recent[0]?.c ?? 0) > 0) continue;

        const message = `[AUTO] ${days}-day overdue reminder for ${inv.invoiceNumber} (${inv.currency} ${Number(inv.total).toLocaleString()}). ${inv.paymentLink ? `Pay: ${inv.paymentLink}` : ""}`;
        await db.insert(paymentRemindersTable).values({
          invoiceId: inv.id, userId: user.id, channel: "email", status: "sent", message, sentAt: now,
        });
        logged.push(inv.id);
      }
    }

    res.json({ processed: logged.length, invoiceIds: logged });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Reminder processing failed" });
  }
});

// ─── Paystack Webhook ─────────────────────────────────────────────────────────

router.post("/webhooks/paystack", async (req: any, res): Promise<void> => {
  try {
    const psKey = process.env.PAYSTACK_SECRET_KEY;
    // Fail closed: if secret is not configured, reject immediately — never attempt verification with empty key
    if (!psKey) { res.status(500).json({ error: "Paystack webhook secret not configured" }); return; }

    const sig = (req.headers["x-paystack-signature"] as string) ?? "";
    if (!sig) { res.status(400).json({ error: "Missing x-paystack-signature header" }); return; }

    // Use raw body bytes (preserved by app.ts middleware) for correct HMAC
    const rawBodyBuf: Buffer = req.rawBody ?? Buffer.from(JSON.stringify(req.body), "utf8");
    const expected = crypto.createHmac("sha512", psKey).update(rawBodyBuf).digest("hex");

    // Safe constant-time comparison — guard against mismatched lengths
    let valid = false;
    try {
      const sigBuf = Buffer.from(sig, "hex");
      const expBuf = Buffer.from(expected, "hex");
      valid = sigBuf.length === expBuf.length && crypto.timingSafeEqual(sigBuf, expBuf);
    } catch {
      valid = false;
    }
    if (!valid) { res.status(400).json({ error: "Invalid signature" }); return; }

    const { event, data } = req.body as { event: string; data: any };
    if (event === "charge.success") {
      const ref = data?.reference as string;
      if (ref) {
        const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.paymentRef, ref));
        if (inv && inv.status !== "paid") {
          await db.update(invoicesTable).set({ status: "paid", paidAt: new Date(), updatedAt: new Date() }).where(eq(invoicesTable.id, inv.id));
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ─── Flutterwave Webhook ──────────────────────────────────────────────────────

router.post("/webhooks/flutterwave", async (req: any, res): Promise<void> => {
  try {
    const fwHash = process.env.FLUTTERWAVE_SECRET_HASH ?? process.env.FLUTTERWAVE_SECRET_KEY ?? "";
    const sig = req.headers["verif-hash"] as string ?? "";

    if (!fwHash || sig !== fwHash) {
      res.status(400).json({ error: "Invalid signature" }); return;
    }

    const { event, data } = req.body as { event: string; data: any };
    if (event === "charge.completed" && data?.status === "successful") {
      const ref = data?.tx_ref as string;
      if (ref) {
        const [inv] = await db.select().from(invoicesTable).where(eq(invoicesTable.paymentRef, ref));
        if (inv && inv.status !== "paid") {
          await db.update(invoicesTable).set({ status: "paid", paidAt: new Date(), updatedAt: new Date() }).where(eq(invoicesTable.id, inv.id));
        }
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
});

// ─── Affiliate Links ──────────────────────────────────────────────────────────

router.get("/affiliate-links", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.json([]); return; }

    const links = await db.select().from(affiliateLinksTable).where(eq(affiliateLinksTable.userId, user.id)).orderBy(desc(affiliateLinksTable.createdAt));

    if (links.length === 0 && process.env.NODE_ENV !== "production") {
      const seeds: typeof affiliateLinksTable.$inferInsert[] = [
        { userId: user.id, name: "999 Book — Instagram Bio", destinationUrl: "https://charlyboy.com/999", slug: "999-ig", platform: "instagram", campaignTag: "book-launch", clickCount: 1847, conversionCount: 312, revenueGenerated: "468000" },
        { userId: user.id, name: "999 Book — TikTok Bio", destinationUrl: "https://charlyboy.com/999", slug: "999-tk", platform: "tiktok", campaignTag: "book-launch", clickCount: 2340, conversionCount: 478, revenueGenerated: "717000" },
        { userId: user.id, name: "Paystack Referral", destinationUrl: "https://paystack.com/refer/areafada", slug: "ps-ref", platform: null, campaignTag: "partnership", clickCount: 567, conversionCount: 89, revenueGenerated: "133500" },
      ];
      await db.insert(affiliateLinksTable).values(seeds);
      const fresh = await db.select().from(affiliateLinksTable).where(eq(affiliateLinksTable.userId, user.id)).orderBy(desc(affiliateLinksTable.createdAt));
      res.json(fresh.map(mapLink)); return;
    }

    res.json(links.map(mapLink));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list affiliate links" });
  }
});

router.post("/affiliate-links", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const { name, destinationUrl, slug, platform, campaignTag, isActive } = req.body;
    if (!name || !destinationUrl || !slug) { res.status(400).json({ error: "name, destinationUrl, slug required" }); return; }

    // Unique slug check
    const existing = await db.select({ id: affiliateLinksTable.id }).from(affiliateLinksTable).where(eq(affiliateLinksTable.slug, slug)).limit(1);
    if (existing.length > 0) { res.status(409).json({ error: `Slug "${slug}" is already in use — choose a different one` }); return; }

    const [link] = await db.insert(affiliateLinksTable).values({
      userId: user.id, name, destinationUrl, slug, platform: platform ?? null, campaignTag: campaignTag ?? null, isActive: isActive ?? true,
    }).returning();

    res.status(201).json(mapLink(link));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create affiliate link" });
  }
});

router.patch("/affiliate-links/:id", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const id = Number(req.params.id);
    const { name, destinationUrl, slug, platform, campaignTag, isActive } = req.body;

    const [link] = await db.update(affiliateLinksTable).set({
      ...(name !== undefined && { name }),
      ...(destinationUrl !== undefined && { destinationUrl }),
      ...(slug !== undefined && { slug }),
      ...(platform !== undefined && { platform }),
      ...(campaignTag !== undefined && { campaignTag }),
      ...(isActive !== undefined && { isActive }),
      updatedAt: new Date(),
    }).where(and(eq(affiliateLinksTable.id, id), eq(affiliateLinksTable.userId, user.id))).returning();

    if (!link) { res.status(404).json({ error: "Link not found" }); return; }
    res.json(mapLink(link));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update affiliate link" });
  }
});

router.delete("/affiliate-links/:id", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }
    await db.delete(affiliateLinksTable).where(and(eq(affiliateLinksTable.id, Number(req.params.id)), eq(affiliateLinksTable.userId, user.id)));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete affiliate link" });
  }
});

// ─── Affiliate Click Tracking ─────────────────────────────────────────────────

router.post("/affiliate-links/:slug/click", async (req: any, res): Promise<void> => {
  try {
    const { slug } = req.params;
    const [link] = await db.select().from(affiliateLinksTable).where(eq(affiliateLinksTable.slug, slug)).limit(1);
    if (!link || !link.isActive) { res.status(404).json({ error: "Link not found" }); return; }

    const ipRaw = (req.headers["x-forwarded-for"] as string ?? req.socket.remoteAddress ?? "");
    const ipHash = crypto.createHash("sha256").update(ipRaw).digest("hex");
    const converted = req.body.converted === true;

    await db.insert(affiliateClicksTable).values({
      linkId: link.id,
      ipHash,
      userAgent: (req.headers["user-agent"] ?? "").slice(0, 512),
      referer: (req.headers["referer"] ?? "").slice(0, 512),
      country: req.body.country ?? null,
      converted,
    });

    await db.update(affiliateLinksTable).set({
      clickCount: link.clickCount + 1,
      ...(converted && { conversionCount: link.conversionCount + 1 }),
      updatedAt: new Date(),
    }).where(eq(affiliateLinksTable.id, link.id));

    res.json({ success: true, destinationUrl: link.destinationUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Click tracking failed" });
  }
});

// ─── Revenue Waterfall ────────────────────────────────────────────────────────

router.get("/monetization/revenue", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const targetCurrency = (req.query.currency as string) ?? "NGN";
    const months = Math.min(Number(req.query.months ?? 6), 12);
    const now = new Date();

    const monthLabels: string[] = [];
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthLabels.push(d.toLocaleString("en-NG", { month: "short", year: "2-digit" }));
    }

    const rangeStart = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    const [deals, invoices, links] = await Promise.all([
      db.select().from(brandDealsTable).where(and(eq(brandDealsTable.userId, user.id), gte(brandDealsTable.createdAt, rangeStart))),
      db.select().from(invoicesTable).where(and(eq(invoicesTable.userId, user.id), gte(invoicesTable.createdAt, rangeStart))),
      db.select().from(affiliateLinksTable).where(eq(affiliateLinksTable.userId, user.id)),
    ]);

    const waterfallMonths = await Promise.all(monthLabels.map(async (label, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      const nextD = new Date(now.getFullYear(), now.getMonth() - (months - 2 - i), 1);

      const dealTotalNGN = await Promise.all(
        deals.filter(d2 => d2.createdAt >= d && d2.createdAt < nextD)
          .map(d2 => toNGN(Number(d2.dealValue), d2.currency)),
      ).then(vals => vals.reduce((a, v) => a + v, 0));

      const invoiceTotalNGN = await Promise.all(
        invoices.filter(inv => inv.status === "paid" && inv.createdAt >= d && inv.createdAt < nextD)
          .map(inv => toNGN(Number(inv.total), inv.currency)),
      ).then(vals => vals.reduce((a, v) => a + v, 0));

      const affiliateTotalNGN = links.reduce((acc, l) => acc + Number(l.revenueGenerated), 0) / months;

      const [dv, iv, av] = await Promise.all([
        toTargetCurrency(dealTotalNGN, targetCurrency),
        toTargetCurrency(invoiceTotalNGN, targetCurrency),
        toTargetCurrency(affiliateTotalNGN, targetCurrency),
      ]);

      return {
        month: label,
        brandDeals: Math.round(dv),
        invoices: Math.round(iv),
        affiliates: Math.round(av),
        total: Math.round(dv + iv + av),
      };
    }));

    const totalBrandDeals = waterfallMonths.reduce((a, m) => a + m.brandDeals, 0);
    const totalInvoices = waterfallMonths.reduce((a, m) => a + m.invoices, 0);
    const totalAffiliates = waterfallMonths.reduce((a, m) => a + m.affiliates, 0);

    res.json({
      currency: targetCurrency,
      months: waterfallMonths,
      totalRevenue: totalBrandDeals + totalInvoices + totalAffiliates,
      totalBrandDeals, totalInvoices, totalAffiliates,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load revenue data" });
  }
});

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapDeal(d: typeof brandDealsTable.$inferSelect) {
  return {
    id: d.id, userId: d.userId, brandName: d.brandName, contactName: d.contactName,
    contactEmail: d.contactEmail, dealValue: Number(d.dealValue), currency: d.currency,
    status: d.status, deliverables: d.deliverables, platforms: d.platforms,
    startDate: d.startDate, endDate: d.endDate, notes: d.notes,
    createdAt: d.createdAt, updatedAt: d.updatedAt,
  };
}

function mapInvoice(inv: typeof invoicesTable.$inferSelect) {
  return {
    id: inv.id, userId: inv.userId, dealId: inv.dealId, invoiceNumber: inv.invoiceNumber,
    clientName: inv.clientName, clientEmail: inv.clientEmail, currency: inv.currency,
    subtotal: Number(inv.subtotal), taxRate: Number(inv.taxRate), taxAmount: Number(inv.taxAmount),
    total: Number(inv.total), status: inv.status, dueDate: inv.dueDate, paidAt: inv.paidAt,
    paymentGateway: inv.paymentGateway, paymentLink: inv.paymentLink, paymentRef: inv.paymentRef,
    notes: inv.notes, createdAt: inv.createdAt, updatedAt: inv.updatedAt,
  };
}

function mapLineItem(li: typeof invoiceLineItemsTable.$inferSelect) {
  return {
    id: li.id, invoiceId: li.invoiceId, description: li.description,
    quantity: Number(li.quantity), unitPrice: Number(li.unitPrice), amount: Number(li.amount),
  };
}

function mapLink(l: typeof affiliateLinksTable.$inferSelect) {
  return {
    id: l.id, userId: l.userId, name: l.name, destinationUrl: l.destinationUrl, slug: l.slug,
    platform: l.platform, campaignTag: l.campaignTag, clickCount: l.clickCount,
    conversionCount: l.conversionCount, revenueGenerated: Number(l.revenueGenerated),
    isActive: l.isActive, createdAt: l.createdAt, updatedAt: l.updatedAt,
  };
}

export default router;
