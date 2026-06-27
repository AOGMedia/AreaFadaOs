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
import { eq, and, desc, gte, sql } from "drizzle-orm";
import type { Currency, PaymentGateway } from "@workspace/db";

const router = Router();

const requireMonetization = [requireAuth, requireTier("creator")];

async function getDbUser(clerkId: string) {
  const rows = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return rows[0] ?? null;
}

function nextInvoiceNumber(count: number): string {
  return `INV-${String(count + 1).padStart(4, "0")}`;
}

// FX rates relative to NGN (approximate mid-market)
const FX: Record<string, number> = {
  NGN: 1,
  GHS: 145,
  KES: 9.5,
  ZAR: 85,
  USD: 1580,
};

function toNGN(amount: number, currency: string): number {
  return amount * (FX[currency] ?? 1);
}

// ─── Brand Deals ─────────────────────────────────────────────────────────────

router.get("/brand-deals", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.json([]); return; }

    let query = db.select().from(brandDealsTable).where(eq(brandDealsTable.userId, user.id)).$dynamic();
    if (req.query.status) {
      query = query.where(and(eq(brandDealsTable.userId, user.id), eq(brandDealsTable.status, req.query.status)));
    }

    const deals = await query.orderBy(desc(brandDealsTable.createdAt));

    if (deals.length === 0) {
      const seeds = [
        { brandName: "Paystack Nigeria", contactName: "Temi Adeyemi", contactEmail: "temi@paystack.com", dealValue: "1500000", currency: "NGN" as Currency, status: "active" as const, deliverables: "3 Instagram posts + 1 TikTok video", platforms: ["instagram", "tiktok"] },
        { brandName: "Guinness Africa", contactName: "Chidi Okafor", contactEmail: "chidi@guinness.com", dealValue: "800000", currency: "NGN" as Currency, status: "negotiating" as const, deliverables: "2 YouTube integrations", platforms: ["youtube"] },
        { brandName: "Flutterwave", contactName: "Amaka Eze", contactEmail: "amaka@flutterwave.com", dealValue: "2000000", currency: "NGN" as Currency, status: "prospecting" as const, deliverables: "4-post campaign TBD", platforms: ["instagram", "x", "tiktok"] },
        { brandName: "Techpoint Africa", contactName: "Bola Adesanya", contactEmail: "bola@techpoint.africa", dealValue: "350000", currency: "NGN" as Currency, status: "completed" as const, deliverables: "Brand mention in podcast", platforms: ["youtube"] },
      ] satisfies typeof brandDealsTable.$inferInsert[];

      await db.insert(brandDealsTable).values(seeds.map(s => ({ ...s, userId: user.id })));
      const fresh = await db.select().from(brandDealsTable).where(eq(brandDealsTable.userId, user.id)).orderBy(desc(brandDealsTable.createdAt));
      res.json(fresh.map(mapDeal));
      return;
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
      userId: user.id,
      brandName,
      contactName,
      contactEmail,
      dealValue: dealValue != null ? String(dealValue) : "0",
      currency: currency ?? "NGN",
      status: status ?? "prospecting",
      deliverables,
      platforms: platforms ?? [],
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

    const invoices = await db.select().from(invoicesTable)
      .where(eq(invoicesTable.userId, user.id))
      .orderBy(desc(invoicesTable.createdAt));

    if (invoices.length === 0) {
      const seedInvoices = [
        { invoiceNumber: "INV-0001", clientName: "Paystack Nigeria", clientEmail: "billing@paystack.com", currency: "NGN" as Currency, subtotal: "1500000", taxRate: "7.5", taxAmount: "112500", total: "1612500", status: "paid" as const },
        { invoiceNumber: "INV-0002", clientName: "Guinness Africa", clientEmail: "billing@guinness.com", currency: "NGN" as Currency, subtotal: "800000", taxRate: "7.5", taxAmount: "60000", total: "860000", status: "sent" as const },
        { invoiceNumber: "INV-0003", clientName: "TechPoint Africa", clientEmail: "accounts@techpoint.africa", currency: "NGN" as Currency, subtotal: "350000", taxRate: "0", taxAmount: "0", total: "350000", status: "overdue" as const },
      ] satisfies typeof invoicesTable.$inferInsert[];

      await db.insert(invoicesTable).values(seedInvoices.map(s => ({ ...s, userId: user.id })));
      const fresh = await db.select().from(invoicesTable).where(eq(invoicesTable.userId, user.id)).orderBy(desc(invoicesTable.createdAt));
      res.json(fresh.map(mapInvoice));
      return;
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
      userId: user.id,
      dealId: dealId ?? null,
      invoiceNumber,
      clientName,
      clientEmail,
      currency,
      subtotal: String(subtotal),
      taxRate: String(taxRate),
      taxAmount: String(taxAmount),
      total: String(total),
      status: "draft",
      dueDate: dueDate ? new Date(dueDate) : undefined,
      notes,
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
    const { clientName, clientEmail, currency, taxRate, dueDate, notes, lineItems } = req.body;

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
          invoiceId: id,
          description: li.description,
          quantity: String(li.quantity),
          unitPrice: String(li.unitPrice),
          amount: String(li.quantity * li.unitPrice),
        })),
      );
    }

    const [updated] = await db.update(invoicesTable).set({
      ...(clientName !== undefined && { clientName }),
      ...(clientEmail !== undefined && { clientEmail }),
      ...(currency !== undefined && { currency }),
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

    const amountKobo = Math.round(Number(invoice.total) * 100);
    const reference = `AF-${invoice.invoiceNumber}-${Date.now()}`;
    let paymentLink = "";

    if (gateway === "paystack") {
      const psKey = process.env.PAYSTACK_SECRET_KEY;
      if (!psKey) { res.status(500).json({ error: "Paystack not configured" }); return; }

      const body = {
        email: invoice.clientEmail,
        amount: amountKobo,
        currency: invoice.currency === "NGN" ? "NGN" : "NGN",
        reference,
        metadata: { invoice_number: invoice.invoiceNumber, client: invoice.clientName },
        callback_url: `${process.env.APP_URL ?? "https://areafadaos.app"}/monetization?paid=1`,
      };

      const psRes = await fetch("https://api.paystack.co/transaction/initialize", {
        method: "POST",
        headers: { Authorization: `Bearer ${psKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const psData = await psRes.json() as any;
      if (!psData.status) { res.status(502).json({ error: psData.message ?? "Paystack error" }); return; }
      paymentLink = psData.data.authorization_url;

    } else if (gateway === "flutterwave") {
      const fwKey = process.env.FLUTTERWAVE_SECRET_KEY;
      if (!fwKey) { res.status(500).json({ error: "Flutterwave not configured" }); return; }

      const fwBody = {
        tx_ref: reference,
        amount: Number(invoice.total),
        currency: invoice.currency,
        redirect_url: `${process.env.APP_URL ?? "https://areafadaos.app"}/monetization?paid=1`,
        customer: { email: invoice.clientEmail, name: invoice.clientName },
        meta: { invoice_number: invoice.invoiceNumber },
        customizations: { title: "AreaFada OS Invoice", logo: "https://areafadaos.app/logo.svg" },
      };

      const fwRes = await fetch("https://api.flutterwave.com/v3/payments", {
        method: "POST",
        headers: { Authorization: `Bearer ${fwKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(fwBody),
      });
      const fwData = await fwRes.json() as any;
      if (fwData.status !== "success") { res.status(502).json({ error: fwData.message ?? "Flutterwave error" }); return; }
      paymentLink = fwData.data.link;

    } else {
      res.status(400).json({ error: "Unsupported gateway" }); return;
    }

    await db.update(invoicesTable).set({
      status: "sent",
      paymentGateway: gateway,
      paymentLink,
      paymentRef: reference,
      updatedAt: new Date(),
    }).where(eq(invoicesTable.id, id));

    res.json({ paymentLink, gateway, invoiceId: id, reference });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate payment link" });
  }
});

// ─── Payment Reminders ────────────────────────────────────────────────────────

router.post("/invoices/:id/remind", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const id = Number(req.params.id);
    const [invoice] = await db.select().from(invoicesTable).where(and(eq(invoicesTable.id, id), eq(invoicesTable.userId, user.id)));
    if (!invoice) { res.status(404).json({ error: "Invoice not found" }); return; }

    const message = `Reminder: Invoice ${invoice.invoiceNumber} for ${invoice.currency} ${Number(invoice.total).toLocaleString()} is due. ${invoice.paymentLink ? `Pay here: ${invoice.paymentLink}` : "Please arrange payment at your earliest convenience."}`;

    const [reminder] = await db.insert(paymentRemindersTable).values({
      invoiceId: id,
      userId: user.id,
      channel: "email",
      status: "sent",
      message,
      sentAt: new Date(),
    }).returning();

    res.json({
      id: reminder.id,
      invoiceId: reminder.invoiceId,
      userId: reminder.userId,
      channel: reminder.channel,
      sentAt: reminder.sentAt,
      status: reminder.status,
      message: reminder.message,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send reminder" });
  }
});

// ─── Affiliate Links ──────────────────────────────────────────────────────────

router.get("/affiliate-links", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.json([]); return; }

    const links = await db.select().from(affiliateLinksTable).where(eq(affiliateLinksTable.userId, user.id)).orderBy(desc(affiliateLinksTable.createdAt));

    if (links.length === 0) {
      const seeds = [
        { name: "999 Book — Instagram Bio", destinationUrl: "https://charlyboy.com/999", slug: "999-ig", platform: "instagram", campaignTag: "book-launch", clickCount: 1847, conversionCount: 312, revenueGenerated: "468000" },
        { name: "999 Book — TikTok Bio", destinationUrl: "https://charlyboy.com/999", slug: "999-tk", platform: "tiktok", campaignTag: "book-launch", clickCount: 2340, conversionCount: 478, revenueGenerated: "717000" },
        { name: "Paystack Referral", destinationUrl: "https://paystack.com/refer/areafada", slug: "ps-ref", platform: null, campaignTag: "partnership", clickCount: 567, conversionCount: 89, revenueGenerated: "133500" },
      ] satisfies typeof affiliateLinksTable.$inferInsert[];

      await db.insert(affiliateLinksTable).values(seeds.map(s => ({ ...s, userId: user.id })));
      const fresh = await db.select().from(affiliateLinksTable).where(eq(affiliateLinksTable.userId, user.id)).orderBy(desc(affiliateLinksTable.createdAt));
      res.json(fresh.map(mapLink));
      return;
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

    const [link] = await db.insert(affiliateLinksTable).values({
      userId: user.id, name, destinationUrl, slug, platform, campaignTag, isActive: isActive ?? true,
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

// ─── Revenue Waterfall ────────────────────────────────────────────────────────

router.get("/monetization/revenue", ...requireMonetization, async (req: any, res): Promise<void> => {
  try {
    const user = await getDbUser(req.clerkUserId);
    if (!user) { res.status(401).json({ error: "User not found" }); return; }

    const targetCurrency = (req.query.currency as Currency) ?? "NGN";
    const months = Math.min(Number(req.query.months ?? 6), 12);

    const monthLabels: string[] = [];
    const now = new Date();
    for (let i = months - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthLabels.push(d.toLocaleString("en-NG", { month: "short", year: "2-digit" }));
    }

    const deals = await db.select().from(brandDealsTable)
      .where(and(eq(brandDealsTable.userId, user.id), gte(brandDealsTable.createdAt, new Date(now.getFullYear(), now.getMonth() - months + 1, 1))));

    const invoices = await db.select().from(invoicesTable)
      .where(and(eq(invoicesTable.userId, user.id), gte(invoicesTable.createdAt, new Date(now.getFullYear(), now.getMonth() - months + 1, 1))));

    const links = await db.select().from(affiliateLinksTable).where(eq(affiliateLinksTable.userId, user.id));

    const waterfallMonths = monthLabels.map((label, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
      const nextD = new Date(now.getFullYear(), now.getMonth() - (months - 2 - i), 1);

      const dealTotal = deals
        .filter(d2 => d2.createdAt >= d && d2.createdAt < nextD)
        .reduce((acc, d2) => acc + toNGN(Number(d2.dealValue), d2.currency) / FX[targetCurrency], 0);

      const invoiceTotal = invoices
        .filter(inv => inv.status === "paid" && inv.createdAt >= d && inv.createdAt < nextD)
        .reduce((acc, inv) => acc + toNGN(Number(inv.total), inv.currency) / FX[targetCurrency], 0);

      const affiliateTotal = links.reduce((acc, l) => acc + Number(l.revenueGenerated) / FX[targetCurrency], 0) / months;

      return {
        month: label,
        brandDeals: Math.round(dealTotal),
        invoices: Math.round(invoiceTotal),
        affiliates: Math.round(affiliateTotal),
        total: Math.round(dealTotal + invoiceTotal + affiliateTotal),
      };
    });

    const totalBrandDeals = waterfallMonths.reduce((a, m) => a + m.brandDeals, 0);
    const totalInvoices = waterfallMonths.reduce((a, m) => a + m.invoices, 0);
    const totalAffiliates = waterfallMonths.reduce((a, m) => a + m.affiliates, 0);

    res.json({
      currency: targetCurrency,
      months: waterfallMonths,
      totalRevenue: totalBrandDeals + totalInvoices + totalAffiliates,
      totalBrandDeals,
      totalInvoices,
      totalAffiliates,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to load revenue data" });
  }
});

// ─── Mappers ──────────────────────────────────────────────────────────────────

function mapDeal(d: typeof brandDealsTable.$inferSelect) {
  return {
    id: d.id, userId: d.userId, brandName: d.brandName,
    contactName: d.contactName, contactEmail: d.contactEmail,
    dealValue: Number(d.dealValue), currency: d.currency, status: d.status,
    deliverables: d.deliverables, platforms: d.platforms,
    startDate: d.startDate, endDate: d.endDate, notes: d.notes,
    createdAt: d.createdAt, updatedAt: d.updatedAt,
  };
}

function mapInvoice(inv: typeof invoicesTable.$inferSelect) {
  return {
    id: inv.id, userId: inv.userId, dealId: inv.dealId,
    invoiceNumber: inv.invoiceNumber, clientName: inv.clientName, clientEmail: inv.clientEmail,
    currency: inv.currency, subtotal: Number(inv.subtotal), taxRate: Number(inv.taxRate),
    taxAmount: Number(inv.taxAmount), total: Number(inv.total), status: inv.status,
    dueDate: inv.dueDate, paidAt: inv.paidAt, paymentGateway: inv.paymentGateway,
    paymentLink: inv.paymentLink, paymentRef: inv.paymentRef, notes: inv.notes,
    createdAt: inv.createdAt, updatedAt: inv.updatedAt,
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
