/**
 * One-off script: notify all enterprise users about the Charly Boy 999 book launch.
 * Also ensures royalheritageinc@gmail.com is in the DB as enterprise tier.
 * Run: pnpm --filter @workspace/api-server tsx scripts/notify-enterprise-charlyboy.ts
 */
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "AreaFada OS <no-reply@areafada.com>";

if (!RESEND_API_KEY) {
  console.error("❌  RESEND_API_KEY not set — aborting.");
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);

// ─── Ensure royalheritageinc@gmail.com exists as enterprise ────────────────
async function ensureEnterpriseUser(email: string) {
  const existing = await db
    .select({ id: usersTable.id, tier: usersTable.tier })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing.length === 0) {
    // Insert a stub row — they'll get full data from Clerk on first login
    await db.insert(usersTable).values({
      clerkId: `manual_${email.replace(/[^a-z0-9]/gi, "_")}`,
      email,
      tier: "enterprise",
      displayName: email.split("@")[0],
    });
    console.log(`✅  Inserted enterprise user: ${email}`);
  } else if (existing[0].tier !== "enterprise") {
    await db
      .update(usersTable)
      .set({ tier: "enterprise", updatedAt: new Date() })
      .where(eq(usersTable.email, email));
    console.log(`✅  Upgraded ${email} to enterprise (was ${existing[0].tier})`);
  } else {
    console.log(`ℹ️   ${email} is already enterprise — no DB change needed`);
  }
}

// ─── Email HTML ────────────────────────────────────────────────────────────
const subject = "🚀 Charly Boy Global Social Media Monetization Campaign — Log In Now";

const htmlBody = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;padding:40px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#15803d 0%,#166534 100%);padding:36px 40px 28px;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">AreaFada OS</h1>
            <p style="margin:6px 0 0;color:#bbf7d0;font-size:13px;font-weight:500;letter-spacing:0.5px;">ENTERPRISE · EXCLUSIVE UPDATE</p>
          </td>
        </tr>

        <!-- Hero -->
        <tr>
          <td style="background:#dcfce7;padding:28px 40px 24px;border-bottom:1px solid #bbf7d0;">
            <p style="margin:0;color:#166534;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Global Media Outreach · 999 Book Launch</p>
            <h2 style="margin:10px 0 0;color:#14532d;font-size:24px;font-weight:800;line-height:1.3;">
              Charly Boy Is Going Global —<br/>Your Moment to Lead.
            </h2>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7;">
              As an <strong style="color:#15803d;">AreaFada OS Enterprise</strong> member, you are part of the inner circle
              for one of Africa's most anticipated global campaigns — the <strong>Charly Boy 999 Book Launch</strong>
              and its accompanying massive global social media monetization push.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 8px 8px 0;padding:0;margin:24px 0;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 6px;color:#15803d;font-weight:700;font-size:14px;">📖 What is 999?</p>
                  <p style="margin:0;color:#374151;font-size:14px;line-height:1.6;">
                    <em>999</em> is Charly Boy's landmark book — a raw, visionary manifesto on African identity,
                    resilience, and reinvention. The global launch is being supported by a coordinated,
                    multi-platform social media monetization campaign built right here on AreaFada OS.
                  </p>
                </td>
              </tr>
            </table>

            <h3 style="margin:28px 0 14px;color:#111827;font-size:16px;font-weight:700;">What This Means for You</h3>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="36" valign="top"><span style="font-size:20px;">🌍</span></td>
                      <td style="color:#374151;font-size:14px;line-height:1.6;padding-left:10px;">
                        <strong>Global media reach</strong> — your content and campaigns will be amplified through
                        Charly Boy's international media network across Africa, the UK, and the US.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="36" valign="top"><span style="font-size:20px;">💰</span></td>
                      <td style="color:#374151;font-size:14px;line-height:1.6;padding-left:10px;">
                        <strong>Social media monetization</strong> — leverage AreaFada OS tools to convert
                        campaign traffic directly into revenue through our monetization dashboard, invoicing, and affiliate systems.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;border-bottom:1px solid #f3f4f6;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="36" valign="top"><span style="font-size:20px;">📅</span></td>
                      <td style="color:#374151;font-size:14px;line-height:1.6;padding-left:10px;">
                        <strong>Coordinated scheduling</strong> — cross-platform posts, live video sessions,
                        and clip engine outputs all timed to hit peak global windows around the launch.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:10px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td width="36" valign="top"><span style="font-size:20px;">🏆</span></td>
                      <td style="color:#374151;font-size:14px;line-height:1.6;padding-left:10px;">
                        <strong>Enterprise exclusives</strong> — dedicated campaign intelligence, media partner
                        integrations, and ambassador CRM tools activated specifically for this launch.
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:36px 0 24px;">
              <tr>
                <td align="center">
                  <a href="https://areafadaos.replit.app"
                     style="display:inline-block;background:#15803d;color:#ffffff;font-size:16px;font-weight:700;
                            text-decoration:none;padding:16px 48px;border-radius:10px;letter-spacing:-0.2px;">
                    Log In to AreaFada OS →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 8px;color:#6b7280;font-size:13px;line-height:1.6;text-align:center;">
              More detailed campaign briefs and coordination materials will be shared inside your dashboard.
            </p>
            <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;text-align:center;">
              <strong>Get ready. This is big.</strong>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.6;">
              AreaFada OS · Enterprise Tier<br/>
              You received this because you are an enterprise member of AreaFada OS.<br/>
              <a href="https://areafadaos.replit.app" style="color:#16a34a;text-decoration:none;">areafadaos.replit.app</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>
`;

// ─── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log("── Step 1: Ensuring royalheritageinc@gmail.com is enterprise ──");
  await ensureEnterpriseUser("royalheritageinc@gmail.com");

  console.log("\n── Step 2: Fetching all enterprise users from DB ──");
  const enterpriseUsers = await db
    .select({ id: usersTable.id, email: usersTable.email, displayName: usersTable.displayName })
    .from(usersTable)
    .where(eq(usersTable.tier, "enterprise"));

  console.log(`Found ${enterpriseUsers.length} enterprise user(s):`, enterpriseUsers.map(u => u.email));

  // Also ensure osejialexander77@gmail.com is in the list even if not in DB yet
  const allTargets = new Set(enterpriseUsers.map(u => u.email?.toLowerCase()).filter(Boolean));
  allTargets.add("osejialexander77@gmail.com");
  allTargets.add("royalheritageinc@gmail.com");

  console.log(`\n── Step 3: Sending announcement to ${allTargets.size} recipient(s) ──`);

  const results: { email: string; status: string; detail?: string }[] = [];

  for (const email of allTargets) {
    if (!email || email.includes("@areafadaos.app")) {
      console.log(`  ⚠️  Skipping placeholder: ${email}`);
      results.push({ email: email ?? "(none)", status: "skipped", detail: "placeholder email" });
      continue;
    }

    try {
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject,
        html: htmlBody,
      });

      if (error) {
        console.error(`  ❌  ${email}: Resend error — ${JSON.stringify(error)}`);
        results.push({ email, status: "error", detail: JSON.stringify(error) });
      } else {
        console.log(`  ✅  ${email}: sent (id=${data?.id})`);
        results.push({ email, status: "sent" });
      }
    } catch (err: any) {
      console.error(`  ❌  ${email}: exception — ${err?.message ?? err}`);
      results.push({ email, status: "error", detail: err?.message ?? String(err) });
    }
  }

  console.log("\n── Summary ──");
  const sent = results.filter(r => r.status === "sent").length;
  const failed = results.filter(r => r.status === "error").length;
  const skipped = results.filter(r => r.status === "skipped").length;
  console.log(`Sent: ${sent}  |  Failed: ${failed}  |  Skipped: ${skipped}`);

  if (failed > 0) {
    console.warn("⚠️  Some emails failed — check output above.");
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
