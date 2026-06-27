import { Router } from "express";
import { db } from "@workspace/db";
import {
  partnerInvitesTable,
  partnerProfilesTable,
  outreachEmailLogsTable,
  partnerDirectoryEntriesTable,
  usersTable,
} from "@workspace/db";
import { eq, and, desc, ilike, or, sql, count } from "drizzle-orm";
import { requireAuth } from "./users";
import { requireTier } from "../middlewares/tierGuard";
import { randomBytes } from "crypto";
import { Resend } from "resend";

const router = Router();
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const requireAgency = [requireAuth, requireTier("agency")];

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function getDbUser(clerkId: string) {
  const rows = await db.select().from(usersTable).where(eq(usersTable.clerkId, clerkId)).limit(1);
  return rows[0] ?? null;
}

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

function expiresAt30Days(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  return d;
}

const TIER_FOR_TYPE: Record<string, string> = {
  creator_partner: "creator",
  brand_partner: "brand",
  agency_reseller: "agency",
  media_house: "enterprise",
  political_campaign: "enterprise",
};

const PARTNER_TYPE_LABELS: Record<string, string> = {
  creator_partner: "Creator Partner",
  brand_partner: "Brand Partner",
  agency_reseller: "Agency Reseller (White-Label)",
  media_house: "Media House Partner (API Access)",
  political_campaign: "Political Campaign Partner",
};

// ─── Email Templates ──────────────────────────────────────────────────────────

const EMAIL_TEMPLATES: Record<string, (vars: { orgName: string; contactName: string; inviteUrl: string; partnerTypeLabel: string }) => { subject: string; html: string }> = {
  creator_partner: ({ orgName, contactName, inviteUrl, partnerTypeLabel }) => ({
    subject: `Grow your creator network on AreaFada OS — exclusive invite for ${orgName}`,
    html: `<p>Hi ${contactName},</p>
<p>We'd love to welcome <strong>${orgName}</strong> as a <strong>${partnerTypeLabel}</strong> on AreaFada OS — the leading social media management platform built for African creators.</p>
<p>Your exclusive invite link: <a href="${inviteUrl}">${inviteUrl}</a></p>
<p>This link is valid for 30 days and pre-configures your team for the Creator partner path. Click it to see what's in it for you.</p>
<p>Best,<br/>The AreaFada OS Team</p>`,
  }),
  brand_partner: ({ orgName, contactName, inviteUrl, partnerTypeLabel }) => ({
    subject: `Partner with AreaFada OS to reach African creators — ${orgName}`,
    html: `<p>Hi ${contactName},</p>
<p>We're inviting <strong>${orgName}</strong> as a <strong>${partnerTypeLabel}</strong> on AreaFada OS. Connect with top Nigerian and African creators, manage brand deals, and measure real campaign ROI.</p>
<p>Your exclusive invite: <a href="${inviteUrl}">${inviteUrl}</a></p>
<p>Valid 30 days. No setup fee for brand partners onboarded this cycle.</p>
<p>Best,<br/>The AreaFada OS Team</p>`,
  }),
  agency_reseller: ({ orgName, contactName, inviteUrl, partnerTypeLabel }) => ({
    subject: `White-label AreaFada OS for your agency — ${orgName}`,
    html: `<p>Hi ${contactName},</p>
<p>We're opening our agency reseller programme to <strong>${orgName}</strong>. As an <strong>${partnerTypeLabel}</strong> you get a white-labelled platform, revenue share, and a dedicated account manager.</p>
<p>Claim your spot: <a href="${inviteUrl}">${inviteUrl}</a></p>
<p>This link is valid for 30 days and sets up your agency tier immediately.</p>
<p>Best,<br/>The AreaFada OS Team</p>`,
  }),
  media_house: ({ orgName, contactName, inviteUrl, partnerTypeLabel }) => ({
    subject: `API partner access to AreaFada OS — ${orgName}`,
    html: `<p>Hi ${contactName},</p>
<p><strong>${orgName}</strong> is invited to join AreaFada OS as a <strong>${partnerTypeLabel}</strong>. Power your editorial and broadcast workflows with our creator data API.</p>
<p>Access your partner portal: <a href="${inviteUrl}">${inviteUrl}</a></p>
<p>Enterprise-grade API access, SLA support, and co-marketing opportunities included.</p>
<p>Best,<br/>The AreaFada OS Team</p>`,
  }),
  political_campaign: ({ orgName, contactName, inviteUrl, partnerTypeLabel }) => ({
    subject: `Campaign Intelligence partnership — ${orgName}`,
    html: `<p>Hi ${contactName},</p>
<p>We're inviting <strong>${orgName}</strong> to partner as a <strong>${partnerTypeLabel}</strong> on AreaFada OS. Access real-time voter sentiment, LGA-level political maps, and AI-driven crisis alerts.</p>
<p>Your partner link: <a href="${inviteUrl}">${inviteUrl}</a></p>
<p>Strictly for registered campaign entities. Expires in 30 days.</p>
<p>Best,<br/>The AreaFada OS Team</p>`,
  }),
};

async function sendOutreachEmail(userId: number, inviteId: number | null, params: {
  toEmail: string; toName: string; orgName: string;
  partnerType: string; templateKey: string; inviteUrl: string;
}) {
  const partnerTypeLabel = PARTNER_TYPE_LABELS[params.partnerType] ?? params.partnerType;
  const templateFn = EMAIL_TEMPLATES[params.templateKey] ?? EMAIL_TEMPLATES["creator_partner"];
  const { subject, html } = templateFn({ orgName: params.orgName, contactName: params.toName, inviteUrl: params.inviteUrl, partnerTypeLabel });

  const logRow = await db.insert(outreachEmailLogsTable).values({
    userId,
    inviteId,
    toEmail: params.toEmail,
    toName: params.toName,
    orgName: params.orgName,
    partnerType: params.partnerType,
    templateKey: params.templateKey,
    subject,
    bodyHtml: html,
    status: "pending",
  }).returning();

  const logId = logRow[0].id;

  if (resend) {
    try {
      const { data, error } = await resend.emails.send({
        from: "partners@areafada.com",
        to: params.toEmail,
        subject,
        html,
      });
      if (error) throw new Error(error.message);
      await db.update(outreachEmailLogsTable).set({
        status: "sent",
        resendMessageId: data?.id ?? null,
        sentAt: new Date(),
      }).where(eq(outreachEmailLogsTable.id, logId));
    } catch (err: any) {
      await db.update(outreachEmailLogsTable).set({
        status: "bounced",
        errorMessage: err?.message ?? "Unknown error",
      }).where(eq(outreachEmailLogsTable.id, logId));
    }
  } else {
    await db.update(outreachEmailLogsTable).set({
      status: "simulated",
      sentAt: new Date(),
    }).where(eq(outreachEmailLogsTable.id, logId));
  }

  return logId;
}

// ─── Seed demo directory ──────────────────────────────────────────────────────

const DEMO_DIRECTORY = [
  { name: "TechCabal", orgType: "digital_publisher", region: "West Africa", country: "NG", website: "https://techcabal.com", email: "partnerships@techcabal.com", description: "Africa's leading tech media platform covering startups and innovation." },
  { name: "Pulse Nigeria", orgType: "digital_publisher", region: "West Africa", country: "NG", website: "https://pulse.ng", email: "advertising@pulse.ng", description: "Nigeria's biggest entertainment and lifestyle digital publisher." },
  { name: "Afrobeats TV", orgType: "broadcast_network", region: "West Africa", country: "NG", website: "https://afrobeats.tv", email: "partnerships@afrobeats.tv", description: "24/7 Afrobeats music television network." },
  { name: "BellaNaija", orgType: "digital_publisher", region: "West Africa", country: "NG", website: "https://bellanaija.com", email: "brand@bellanaija.com", description: "Nigeria's premier lifestyle and culture media brand." },
  { name: "Channels Television", orgType: "broadcast_network", region: "West Africa", country: "NG", website: "https://channelstv.com", email: "digital@channelstv.com", description: "Nigeria's leading 24-hour news television network." },
  { name: "Guardian Nigeria", orgType: "media_house", region: "West Africa", country: "NG", website: "https://guardian.ng", email: "digital@guardian.ng", description: "Nigeria's flagship newspaper and digital news brand." },
  { name: "The Nation Nigeria", orgType: "media_house", region: "West Africa", country: "NG", website: "https://thenationonlineng.net", email: "marketing@thenation.ng", description: "Major Nigerian newspaper and news website." },
  { name: "Vanguard Media", orgType: "media_house", region: "West Africa", country: "NG", website: "https://vanguardngr.com", email: "digital@vanguardngr.com", description: "One of Nigeria's largest daily newspapers." },
  { name: "Legit.ng", orgType: "digital_publisher", region: "West Africa", country: "NG", website: "https://legit.ng", email: "partnerships@legit.ng", description: "Nigeria's top news and entertainment digital publisher." },
  { name: "Arise News", orgType: "broadcast_network", region: "West Africa", country: "NG", website: "https://arise.tv", email: "partnerships@arise.tv", description: "Pan-African television news network." },
  { name: "MTV Africa", orgType: "broadcast_network", region: "Africa", country: "ZA", website: "https://mtvbase.com", email: "africa@mtv.com", description: "MTV Base Africa music television network." },
  { name: "Trace Africa", orgType: "broadcast_network", region: "Africa", country: "FR", website: "https://trace.tv", email: "partnerships@trace.tv", description: "Pan-African urban music and entertainment channel." },
  { name: "Africa No Filter", orgType: "media_house", region: "Africa", country: "ZA", website: "https://africanofilter.org", email: "hello@africanofilter.org", description: "Organisation challenging stereotypical narratives about Africa." },
  { name: "Y! Africa", orgType: "digital_publisher", region: "Africa", country: "NG", website: "https://yarnafrica.com", email: "partnerships@yarnafrica.com", description: "Pan-African youth culture and business media." },
  { name: "This Day Live", orgType: "media_house", region: "West Africa", country: "NG", website: "https://thisdaylive.com", email: "digital@thisdaylive.com", description: "Flagship Nigerian business and politics newspaper." },
  { name: "Premium Times Nigeria", orgType: "digital_publisher", region: "West Africa", country: "NG", website: "https://premiumtimesng.com", email: "partnerships@premiumtimesng.com", description: "Award-winning investigative journalism platform." },
  { name: "Daily Trust", orgType: "media_house", region: "West Africa", country: "NG", website: "https://dailytrust.com", email: "digital@dailytrust.com", description: "Major Nigerian newspaper with strong Northern Nigeria coverage." },
  { name: "Kwese TV", orgType: "broadcast_network", region: "East Africa", country: "ZW", website: "https://kwese.econet.com", email: "partnerships@kwese.com", description: "Pan-African sports and entertainment broadcaster." },
  { name: "Mediacraft Associates", orgType: "pr_firm", region: "West Africa", country: "NG", website: "https://mediacraftng.com", email: "hello@mediacraftng.com", description: "Nigeria's largest integrated marketing communications group." },
  { name: "Noah's Ark Communications", orgType: "pr_firm", region: "West Africa", country: "NG", website: "https://noahsark.ng", email: "connect@noahsark.ng", description: "Leading Nigerian advertising and PR agency." },
  { name: "X3M Ideas", orgType: "pr_firm", region: "West Africa", country: "NG", website: "https://x3mideas.com", email: "hello@x3mideas.com", description: "Award-winning integrated marketing agency." },
  { name: "Insight Publicis", orgType: "pr_firm", region: "West Africa", country: "NG", website: "https://insightpublicis.com", email: "contact@insightpublicis.com", description: "Full-service advertising agency, Publicis Africa network." },
  { name: "Temple Management Co", orgType: "talent_agency", region: "West Africa", country: "NG", website: "https://templemgt.com", email: "info@templemgt.com", description: "Premier Nigerian talent management and entertainment company." },
  { name: "DVRS Agency", orgType: "talent_agency", region: "West Africa", country: "NG", website: "https://dvrsagency.com", email: "info@dvrsagency.com", description: "Talent representation and digital strategy for African creators." },
  { name: "Craze Management", orgType: "talent_agency", region: "West Africa", country: "NG", website: "https://crazemanagement.com", email: "hello@crazemanagement.com", description: "Nigerian talent management company for musicians and influencers." },
  { name: "Def Jam Africa", orgType: "record_label", region: "Africa", country: "ZA", website: "https://defjamamafrica.com", email: "africa@defjam.com", description: "Def Jam Records African operations." },
  { name: "Mavin Records", orgType: "record_label", region: "West Africa", country: "NG", website: "https://mavinrecords.com", email: "digital@mavinrecords.com", description: "Leading Nigerian record label (Don Jazzy)." },
  { name: "Chocolate City Group", orgType: "record_label", region: "West Africa", country: "NG", website: "https://chocolatecitymusic.com", email: "partnerships@chocolatecitymusic.com", description: "Pan-African entertainment and record label group." },
  { name: "Sony Music Africa", orgType: "record_label", region: "Africa", country: "ZA", website: "https://sonymusicafrica.com", email: "africa@sonymusic.com", description: "Sony Music's Africa operations covering Afrobeats and more." },
  { name: "Universal Music Africa", orgType: "record_label", region: "Africa", country: "ZA", website: "https://universalmusicgroup.com", email: "africa@umusic.com", description: "Universal Music Group Africa operations." },
  { name: "YNaija", orgType: "digital_publisher", region: "West Africa", country: "NG", website: "https://ynaija.com", email: "ads@ynaija.com", description: "Nigerian youth culture, politics, and entertainment publisher." },
  { name: "Nairametrics", orgType: "digital_publisher", region: "West Africa", country: "NG", website: "https://nairametrics.com", email: "partnerships@nairametrics.com", description: "Nigeria's leading financial news and analytics platform." },
  { name: "Stears Business", orgType: "digital_publisher", region: "West Africa", country: "NG", website: "https://stears.co", email: "team@stears.co", description: "African business intelligence and data platform." },
  { name: "Zikoko", orgType: "digital_publisher", region: "West Africa", country: "NG", website: "https://zikoko.com", email: "partnerships@zikoko.com", description: "Nigerian pop-culture and humour digital media brand." },
  { name: "GhanaWeb", orgType: "digital_publisher", region: "West Africa", country: "GH", website: "https://ghanaweb.com", email: "ads@ghanaweb.com", description: "Ghana's most visited news and information website." },
  { name: "Graphic Online", orgType: "media_house", region: "West Africa", country: "GH", website: "https://graphic.com.gh", email: "digital@graphic.com.gh", description: "Ghana's flagship state-owned newspaper." },
  { name: "Joy Online", orgType: "broadcast_network", region: "West Africa", country: "GH", website: "https://myjoyonline.com", email: "partnerships@myjoyonline.com", description: "Ghana's leading multimedia news platform." },
  { name: "Nation Media Group", orgType: "media_house", region: "East Africa", country: "KE", website: "https://nation.africa", email: "digital@nationmedia.com", description: "East Africa's largest media company." },
  { name: "Standard Media Group Kenya", orgType: "media_house", region: "East Africa", country: "KE", website: "https://standardmedia.co.ke", email: "digital@standardmedia.co.ke", description: "Kenya's Standard Group media company." },
  { name: "Citizen TV Kenya", orgType: "broadcast_network", region: "East Africa", country: "KE", website: "https://citizentv.co.ke", email: "partnerships@citizentv.co.ke", description: "Kenya's most-watched television station." },
  { name: "Punch Nigeria", orgType: "media_house", region: "West Africa", country: "NG", website: "https://punchng.com", email: "digital@punchng.com", description: "Nigeria's highest-circulation newspaper." },
  { name: "BusinessDay Nigeria", orgType: "media_house", region: "West Africa", country: "NG", website: "https://businessday.ng", email: "partnerships@businessday.ng", description: "Nigeria's leading business newspaper." },
  { name: "Quartz Africa", orgType: "digital_publisher", region: "Africa", country: "NG", website: "https://qz.com/africa", email: "africa@qz.com", description: "Quartz's dedicated Africa edition for business news." },
  { name: "Rest of World Africa", orgType: "digital_publisher", region: "Africa", country: "NG", website: "https://restofworld.org", email: "africa@restofworld.org", description: "Technology and global majority reporting platform." },
  { name: "Africa Report", orgType: "media_house", region: "Africa", country: "FR", website: "https://theafricareport.com", email: "partnerships@theafricareport.com", description: "Pan-African political and economic affairs magazine." },
  { name: "New African Magazine", orgType: "media_house", region: "Africa", country: "GB", website: "https://newafricanmagazine.com", email: "ads@newafricanmagazine.com", description: "Pan-African magazine based in London." },
  { name: "Ebonylife Media", orgType: "broadcast_network", region: "West Africa", country: "NG", website: "https://ebonylifetv.com", email: "partnerships@ebonylifetv.com", description: "Premium lifestyle and entertainment network by Mo Abudu." },
  { name: "The Will Nigeria", orgType: "digital_publisher", region: "West Africa", country: "NG", website: "https://thewillnigeria.com", email: "digital@thewillnigeria.com", description: "Nigerian politics and social affairs online publication." },
  { name: "Konga Media", orgType: "digital_publisher", region: "West Africa", country: "NG", website: "https://konga.com", email: "media@konga.com", description: "E-commerce and retail media brand Nigeria." },
  { name: "African Independent Television", orgType: "broadcast_network", region: "West Africa", country: "NG", website: "https://ait.live", email: "digital@ait.live", description: "AIT — independent broadcast television Nigeria." },
];

async function seedDemoDirectory() {
  const existing = await db.select({ id: partnerDirectoryEntriesTable.id })
    .from(partnerDirectoryEntriesTable).limit(1);
  if (existing.length > 0) return;
  await db.insert(partnerDirectoryEntriesTable).values(
    DEMO_DIRECTORY.map((d, i) => ({ ...d, isFeatured: i < 5 }))
  );
}

// ─── Public: Complete Signup (marks invite signed_up) ───────────────────────
// Called post-signup by the frontend when localStorage has a partnerInviteToken.

router.post("/partner-invites/complete-signup", async (req: any, res) => {
  const { token } = req.body;
  if (!token || typeof token !== "string") { res.status(400).json({ error: "token required" }); return; }
  const rows = await db.select().from(partnerInvitesTable)
    .where(eq(partnerInvitesTable.token, token)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Invite not found" }); return; }
  const invite = rows[0];
  if (invite.status === "revoked") { res.status(410).json({ error: "Invite revoked" }); return; }
  if (new Date(invite.expiresAt) < new Date()) { res.status(410).json({ error: "Invite expired" }); return; }
  if (["signed_up", "converted"].includes(invite.status)) {
    res.json({ status: invite.status, tierPreset: invite.tierPreset }); return;
  }
  const [updated] = await db.update(partnerInvitesTable).set({
    status: "signed_up", signedUpAt: new Date(), updatedAt: new Date(),
  }).where(eq(partnerInvitesTable.id, invite.id)).returning();
  res.json({ status: updated.status, tierPreset: updated.tierPreset });
});

// ─── Public: Validate Invite Token ────────────────────────────────────────────

router.get("/partner-invites/public/:token", async (req: any, res) => {
  const { token } = req.params;
  const rows = await db.select().from(partnerInvitesTable)
    .where(eq(partnerInvitesTable.token, token)).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Invite not found" }); return; }
  const invite = rows[0];
  if (invite.status === "revoked") { res.status(410).json({ error: "This invite has been revoked" }); return; }
  if (invite.status === "expired" || new Date(invite.expiresAt) < new Date()) {
    if (invite.status !== "expired") {
      await db.update(partnerInvitesTable).set({ status: "expired", updatedAt: new Date() })
        .where(eq(partnerInvitesTable.id, invite.id));
    }
    res.status(410).json({ error: "This invite has expired" }); return;
  }
  if (invite.status === "sent") {
    await db.update(partnerInvitesTable).set({
      status: "opened", openedAt: new Date(), updatedAt: new Date()
    }).where(eq(partnerInvitesTable.id, invite.id));
  }
  res.json({
    orgName: invite.orgName,
    contactName: invite.contactName,
    partnerType: invite.partnerType,
    partnerTypeLabel: PARTNER_TYPE_LABELS[invite.partnerType] ?? invite.partnerType,
    tierPreset: invite.tierPreset,
    expiresAt: invite.expiresAt,
    token: invite.token,
  });
});

// ─── List Invites ─────────────────────────────────────────────────────────────

router.get("/partner-invites", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  await seedDemoDirectory();

  const { status, partnerType, search } = req.query as Record<string, string>;
  let conditions: any[] = [eq(partnerInvitesTable.userId, user.id)];
  if (status) conditions.push(eq(partnerInvitesTable.status, status));
  if (partnerType) conditions.push(eq(partnerInvitesTable.partnerType, partnerType));
  if (search) conditions.push(or(
    ilike(partnerInvitesTable.orgName, `%${search}%`),
    ilike(partnerInvitesTable.email, `%${search}%`),
  ));

  const invites = await db.select().from(partnerInvitesTable)
    .where(and(...conditions))
    .orderBy(desc(partnerInvitesTable.createdAt))
    .limit(200);
  res.json(invites);
});

// ─── Create Single Invite ─────────────────────────────────────────────────────

router.post("/partner-invites", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { orgName, contactName, email, partnerType = "creator_partner", customMessage, sendEmail = true } = req.body;
  if (!orgName || !contactName || !email) { res.status(400).json({ error: "orgName, contactName, and email are required" }); return; }
  const token = generateToken();
  const tierPreset = TIER_FOR_TYPE[partnerType] ?? "pro";
  const [invite] = await db.insert(partnerInvitesTable).values({
    userId: user.id, token, partnerType, orgName, contactName, email,
    tierPreset, expiresAt: expiresAt30Days(), customMessage,
  }).returning();

  const baseUrl = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "areafada.com"}`;
  const inviteUrl = `${baseUrl}/invite/${token}`;

  if (sendEmail) {
    await sendOutreachEmail(user.id, invite.id, {
      toEmail: email, toName: contactName, orgName, partnerType,
      templateKey: partnerType, inviteUrl,
    });
  }
  res.status(201).json({ ...invite, inviteUrl });
});

// ─── Bulk Create Invites from CSV rows ────────────────────────────────────────

router.post("/partner-invites/bulk", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { rows, sendEmails = false } = req.body as {
    rows: Array<{ orgName: string; contactName: string; email: string; partnerType?: string }>;
    sendEmails?: boolean;
  };
  if (!Array.isArray(rows) || rows.length === 0) { res.status(400).json({ error: "rows array required" }); return; }
  if (rows.length > 500) { res.status(400).json({ error: "Max 500 invites per bulk call" }); return; }

  const baseUrl = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "areafada.com"}`;
  const created: Array<{ orgName: string; email: string; token: string; inviteUrl: string; error?: string }> = [];
  let successCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    if (!row.orgName || !row.email || !row.contactName) { errorCount++; created.push({ orgName: row.orgName ?? "", email: row.email ?? "", token: "", inviteUrl: "", error: "Missing required fields" }); continue; }
    const token = generateToken();
    const partnerType = row.partnerType ?? "creator_partner";
    const tierPreset = TIER_FOR_TYPE[partnerType] ?? "pro";
    try {
      const [invite] = await db.insert(partnerInvitesTable).values({
        userId: user.id, token, partnerType, orgName: row.orgName, contactName: row.contactName,
        email: row.email, tierPreset, expiresAt: expiresAt30Days(),
      }).returning();
      const inviteUrl = `${baseUrl}/invite/${token}`;
      if (sendEmails) {
        await sendOutreachEmail(user.id, invite.id, {
          toEmail: row.email, toName: row.contactName, orgName: row.orgName,
          partnerType, templateKey: partnerType, inviteUrl,
        });
      }
      created.push({ orgName: row.orgName, email: row.email, token, inviteUrl });
      successCount++;
    } catch {
      errorCount++;
      created.push({ orgName: row.orgName, email: row.email, token: "", inviteUrl: "", error: "Insert failed" });
    }
  }
  res.json({ successCount, errorCount, invites: created });
});

// ─── Convert Invite ───────────────────────────────────────────────────────────

router.post("/partner-invites/:id/convert", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(partnerInvitesTable)
    .where(and(eq(partnerInvitesTable.id, Number(req.params.id)), eq(partnerInvitesTable.userId, user.id))).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
  const [updated] = await db.update(partnerInvitesTable).set({
    status: "converted", convertedAt: new Date(), updatedAt: new Date(),
  }).where(eq(partnerInvitesTable.id, Number(req.params.id))).returning();
  res.json(updated);
});

// ─── Re-send Invite ───────────────────────────────────────────────────────────

router.post("/partner-invites/:id/resend", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(partnerInvitesTable)
    .where(and(eq(partnerInvitesTable.id, Number(req.params.id)), eq(partnerInvitesTable.userId, user.id))).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
  const invite = rows[0];

  const newToken = generateToken();
  const [updated] = await db.update(partnerInvitesTable).set({
    token: newToken, status: "sent", expiresAt: expiresAt30Days(),
    sentCount: invite.sentCount + 1, lastSentAt: new Date(), updatedAt: new Date(),
    openedAt: null, signedUpAt: null,
  }).where(eq(partnerInvitesTable.id, invite.id)).returning();

  const baseUrl = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "areafada.com"}`;
  const inviteUrl = `${baseUrl}/invite/${newToken}`;
  await sendOutreachEmail(user.id, invite.id, {
    toEmail: invite.email, toName: invite.contactName, orgName: invite.orgName,
    partnerType: invite.partnerType, templateKey: invite.partnerType, inviteUrl,
  });
  res.json({ ...updated, inviteUrl });
});

// ─── Revoke Invite ────────────────────────────────────────────────────────────

router.post("/partner-invites/:id/revoke", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const [updated] = await db.update(partnerInvitesTable).set({ status: "revoked", updatedAt: new Date() })
    .where(and(eq(partnerInvitesTable.id, Number(req.params.id)), eq(partnerInvitesTable.userId, user.id)))
    .returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ─── Bulk Resend (to all sent/expired) ────────────────────────────────────────

router.post("/partner-invites/bulk-resend", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { ids } = req.body as { ids: number[] };
  if (!Array.isArray(ids) || ids.length === 0) { res.status(400).json({ error: "ids array required" }); return; }

  const baseUrl = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "areafada.com"}`;
  let count = 0;
  for (const id of ids) {
    const rows = await db.select().from(partnerInvitesTable)
      .where(and(eq(partnerInvitesTable.id, id), eq(partnerInvitesTable.userId, user.id))).limit(1);
    if (!rows.length) continue;
    const invite = rows[0];
    const newToken = generateToken();
    await db.update(partnerInvitesTable).set({
      token: newToken, status: "sent", expiresAt: expiresAt30Days(),
      sentCount: invite.sentCount + 1, lastSentAt: new Date(), updatedAt: new Date(),
      openedAt: null,
    }).where(eq(partnerInvitesTable.id, id));
    const inviteUrl = `${baseUrl}/invite/${newToken}`;
    await sendOutreachEmail(user.id, id, {
      toEmail: invite.email, toName: invite.contactName, orgName: invite.orgName,
      partnerType: invite.partnerType, templateKey: invite.partnerType, inviteUrl,
    });
    count++;
  }
  res.json({ resentCount: count });
});

// ─── Partner Profiles ─────────────────────────────────────────────────────────

router.get("/partner-profiles", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { partnerType, search } = req.query as Record<string, string>;
  let conditions: any[] = [eq(partnerProfilesTable.userId, user.id)];
  if (partnerType) conditions.push(eq(partnerProfilesTable.partnerType, partnerType));
  if (search) conditions.push(or(
    ilike(partnerProfilesTable.orgName, `%${search}%`),
    ilike(partnerProfilesTable.contactName, `%${search}%`),
  ));
  const profiles = await db.select().from(partnerProfilesTable)
    .where(and(...conditions)).orderBy(desc(partnerProfilesTable.createdAt)).limit(200);
  res.json(profiles);
});

router.post("/partner-profiles", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { orgName, contactName, email, phone, website, partnerType, tier, accountManagerName,
    accountManagerEmail, dealValue, dealNotes, region, country, tags, inviteId } = req.body;
  if (!orgName || !contactName || !email) { res.status(400).json({ error: "orgName, contactName, email required" }); return; }
  const [profile] = await db.insert(partnerProfilesTable).values({
    userId: user.id, orgName, contactName, email, phone, website,
    partnerType: partnerType ?? "creator_partner",
    tier: tier ?? TIER_FOR_TYPE[partnerType ?? "creator_partner"] ?? "pro",
    accountManagerName, accountManagerEmail,
    dealValue: dealValue ?? null,
    dealNotes, region: region ?? "Nigeria", country: country ?? "NG",
    tags: tags ?? [],
    activityLog: [{ action: "created", note: "Profile created", at: new Date().toISOString() }],
    inviteId: inviteId ?? null,
  }).returning();
  res.status(201).json(profile);
});

router.get("/partner-profiles/:id", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const rows = await db.select().from(partnerProfilesTable)
    .where(and(eq(partnerProfilesTable.id, Number(req.params.id)), eq(partnerProfilesTable.userId, user.id))).limit(1);
  if (!rows.length) { res.status(404).json({ error: "Not found" }); return; }
  res.json(rows[0]);
});

router.patch("/partner-profiles/:id", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const existing = await db.select().from(partnerProfilesTable)
    .where(and(eq(partnerProfilesTable.id, Number(req.params.id)), eq(partnerProfilesTable.userId, user.id))).limit(1);
  if (!existing.length) { res.status(404).json({ error: "Not found" }); return; }

  const { orgName, contactName, email, phone, website, partnerType, tier, accountManagerName,
    accountManagerEmail, dealValue, dealNotes, region, country, tags, note } = req.body;
  const newLog = note
    ? [...(existing[0].activityLog ?? []), { action: "note", note, at: new Date().toISOString() }]
    : existing[0].activityLog;

  const [updated] = await db.update(partnerProfilesTable).set({
    ...(orgName && { orgName }), ...(contactName && { contactName }),
    ...(email && { email }), ...(phone !== undefined && { phone }),
    ...(website !== undefined && { website }),
    ...(partnerType && { partnerType }),
    ...(tier && { tier }),
    ...(accountManagerName !== undefined && { accountManagerName }),
    ...(accountManagerEmail !== undefined && { accountManagerEmail }),
    ...(dealValue !== undefined && { dealValue }),
    ...(dealNotes !== undefined && { dealNotes }),
    ...(region && { region }), ...(country && { country }),
    ...(tags && { tags }),
    activityLog: newLog,
    updatedAt: new Date(),
  }).where(eq(partnerProfilesTable.id, Number(req.params.id))).returning();
  res.json(updated);
});

// ─── Partner Directory ────────────────────────────────────────────────────────

router.get("/partner-directory", ...requireAgency, async (req: any, res) => {
  await seedDemoDirectory();
  const { orgType, region, search, outreachStatus } = req.query as Record<string, string>;
  let conditions: any[] = [];
  if (orgType) conditions.push(eq(partnerDirectoryEntriesTable.orgType, orgType));
  if (region) conditions.push(eq(partnerDirectoryEntriesTable.region, region));
  if (outreachStatus) conditions.push(eq(partnerDirectoryEntriesTable.outreachStatus, outreachStatus));
  if (search) conditions.push(or(
    ilike(partnerDirectoryEntriesTable.name, `%${search}%`),
    ilike(partnerDirectoryEntriesTable.description, `%${search}%`),
  ));
  const entries = await db.select().from(partnerDirectoryEntriesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(partnerDirectoryEntriesTable.isFeatured), partnerDirectoryEntriesTable.name)
    .limit(200);
  res.json(entries);
});

router.post("/partner-directory", ...requireAgency, async (req: any, res) => {
  const { name, orgType, region, country, website, email, description } = req.body;
  if (!name) { res.status(400).json({ error: "name required" }); return; }
  const [entry] = await db.insert(partnerDirectoryEntriesTable).values({
    name, orgType: orgType ?? "media_house", region: region ?? "West Africa",
    country: country ?? "NG", website, email, description,
  }).returning();
  res.status(201).json(entry);
});

router.patch("/partner-directory/:id", ...requireAgency, async (req: any, res) => {
  const { outreachStatus, notes, inviteId } = req.body;
  const [updated] = await db.update(partnerDirectoryEntriesTable).set({
    ...(outreachStatus && { outreachStatus }),
    ...(notes !== undefined && { notes }),
    ...(inviteId && { inviteId }),
    updatedAt: new Date(),
  }).where(eq(partnerDirectoryEntriesTable.id, Number(req.params.id))).returning();
  if (!updated) { res.status(404).json({ error: "Not found" }); return; }
  res.json(updated);
});

// ─── Outreach Email Logs ──────────────────────────────────────────────────────

router.get("/partner-outreach-emails", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const logs = await db.select().from(outreachEmailLogsTable)
    .where(eq(outreachEmailLogsTable.userId, user.id))
    .orderBy(desc(outreachEmailLogsTable.createdAt)).limit(300);
  res.json(logs);
});

router.post("/partner-outreach-emails/send", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { inviteId, toEmail, toName, orgName, partnerType, templateKey } = req.body;
  if (!toEmail || !toName || !orgName) { res.status(400).json({ error: "toEmail, toName, orgName required" }); return; }

  const baseUrl = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN ?? "areafada.com"}`;
  let inviteUrl = `${baseUrl}/sign-up`;
  if (inviteId) {
    const rows = await db.select().from(partnerInvitesTable).where(eq(partnerInvitesTable.id, Number(inviteId))).limit(1);
    if (rows[0]) inviteUrl = `${baseUrl}/invite/${rows[0].token}`;
  }
  const logId = await sendOutreachEmail(user.id, inviteId ?? null, {
    toEmail, toName, orgName, partnerType: partnerType ?? "creator_partner",
    templateKey: templateKey ?? partnerType ?? "creator_partner", inviteUrl,
  });
  res.status(201).json({ logId, status: resend ? "sent" : "simulated" });
});

// ─── Partner Analytics ────────────────────────────────────────────────────────

router.get("/partner-analytics", ...requireAgency, async (req: any, res) => {
  const user = await getDbUser(req.clerkUserId);
  if (!user) { res.status(401).json({ error: "Unauthorized" }); return; }

  const allInvites = await db.select().from(partnerInvitesTable)
    .where(eq(partnerInvitesTable.userId, user.id));

  const totalInvites = allInvites.length;
  const opened = allInvites.filter(i => ["opened", "signed_up", "converted"].includes(i.status)).length;
  const signedUp = allInvites.filter(i => ["signed_up", "converted"].includes(i.status)).length;
  const converted = allInvites.filter(i => i.status === "converted").length;
  const openRate = totalInvites > 0 ? Math.round((opened / totalInvites) * 100) : 0;
  const signUpRate = totalInvites > 0 ? Math.round((signedUp / totalInvites) * 100) : 0;
  const conversionRate = totalInvites > 0 ? Math.round((converted / totalInvites) * 100) : 0;

  const byType: Record<string, { sent: number; opened: number; converted: number }> = {};
  for (const invite of allInvites) {
    if (!byType[invite.partnerType]) byType[invite.partnerType] = { sent: 0, opened: 0, converted: 0 };
    byType[invite.partnerType].sent++;
    if (["opened", "signed_up", "converted"].includes(invite.status)) byType[invite.partnerType].opened++;
    if (invite.status === "converted") byType[invite.partnerType].converted++;
  }

  const emailLogs = await db.select().from(outreachEmailLogsTable)
    .where(eq(outreachEmailLogsTable.userId, user.id));
  const emailsSent = emailLogs.length;
  const emailsOpened = emailLogs.filter(e => e.openedAt != null).length;

  const profiles = await db.select().from(partnerProfilesTable)
    .where(eq(partnerProfilesTable.userId, user.id));
  const totalRevenue = profiles.reduce((sum, p) => sum + Number(p.dealValue ?? 0), 0);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentInvites = allInvites.filter(i => new Date(i.createdAt) > thirtyDaysAgo).length;

  res.json({
    totalInvites, opened, signedUp, converted,
    openRate, signUpRate, conversionRate,
    emailsSent, emailsOpened,
    totalRevenue, recentInvites,
    byType,
  });
});

export default router;
