/**
 * Upgrades specified users to their new tiers and sends them sign-in notification emails.
 * Enterprise: sakariyauabdullateef993@gmail.com, kingsleygracious16@gmail.com
 * Creator:    jjnyame23@gmail.com
 *
 * Run: pnpm --filter @workspace/api-server tsx scripts/upgrade-tiers-and-notify.ts
 */
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "AreaFada OS <no-reply@mails.areafadaos.com>";

if (!RESEND_API_KEY) {
  console.error("❌  RESEND_API_KEY not set — aborting.");
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);

type Tier = "enterprise" | "creator" | "free";

const UPGRADES: { email: string; tier: Tier }[] = [
  { email: "sakariyauabdullateef993@gmail.com", tier: "enterprise" },
  { email: "kingsleygracious16@gmail.com",      tier: "enterprise" },
  { email: "jjnyame23@gmail.com",               tier: "creator" },
];

// ─── Upsert tier ─────────────────────────────────────────────────────────────
async function upsertTier(email: string, tier: Tier) {
  const existing = await db
    .select({ id: usersTable.id, tier: usersTable.tier })
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(usersTable).values({
      clerkId: `manual_${email.replace(/[^a-z0-9]/gi, "_")}`,
      email,
      tier,
      displayName: email.split("@")[0],
    });
    console.log(`  ✅  Inserted ${email} as ${tier}`);
  } else if (existing[0].tier !== tier) {
    await db
      .update(usersTable)
      .set({ tier, updatedAt: new Date() })
      .where(eq(usersTable.email, email));
    console.log(`  ✅  Upgraded ${email} → ${tier} (was ${existing[0].tier})`);
  } else {
    console.log(`  ℹ️   ${email} already ${tier} — no change`);
  }
}

// ─── Email builders ───────────────────────────────────────────────────────────
function enterpriseEmail(email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to AreaFada OS Enterprise</title>
</head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;padding:40px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#15803d 0%,#166534 100%);padding:36px 40px 28px;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">AreaFada OS</h1>
            <p style="margin:6px 0 0;color:#bbf7d0;font-size:13px;font-weight:500;letter-spacing:0.5px;">ENTERPRISE · ACCOUNT ACTIVATED</p>
          </td>
        </tr>

        <!-- Hero -->
        <tr>
          <td style="background:#dcfce7;padding:28px 40px 24px;border-bottom:1px solid #bbf7d0;">
            <p style="margin:0;color:#166534;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Welcome to the Inner Circle</p>
            <h2 style="margin:10px 0 0;color:#14532d;font-size:24px;font-weight:800;line-height:1.3;">
              Your Enterprise Account<br/>Is Ready. Sign In Now.
            </h2>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7;">
              You've been upgraded to <strong style="color:#15803d;">AreaFada OS Enterprise</strong> — the highest tier
              on the platform, built for agencies and serious creators driving real results at scale.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 8px 8px 0;padding:0;margin:24px 0;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 10px;color:#15803d;font-weight:700;font-size:14px;">🏆 What you unlock at Enterprise</p>
                  <ul style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:1.8;">
                    <li>Full Ambassador CRM — manage creators, campaigns &amp; deals</li>
                    <li>Unified Customer Support Inbox across all platforms</li>
                    <li>Revenue analytics, affiliate tracking &amp; invoicing</li>
                    <li>Priority campaign scheduling &amp; media amplification</li>
                    <li>Exclusive campaign briefings &amp; partner integrations</li>
                  </ul>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7;">
              Sign in with the email address this was sent to — <strong>${email}</strong> — to access your dashboard.
            </p>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 24px;">
              <tr>
                <td align="center">
                  <a href="https://www.areafadaos.com"
                     style="display:inline-block;background:#15803d;color:#ffffff;font-size:16px;font-weight:700;
                            text-decoration:none;padding:16px 48px;border-radius:10px;letter-spacing:-0.2px;">
                    Sign In to AreaFada OS →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;text-align:center;">
              <strong>Welcome to the team. Let's build something big.</strong>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.6;">
              AreaFada OS · Enterprise Tier<br/>
              You received this because your account has been upgraded on AreaFada OS.<br/>
              <a href="https://www.areafadaos.com" style="color:#16a34a;text-decoration:none;">www.areafadaos.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function creatorEmail(email: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to AreaFada OS Creator</title>
</head>
<body style="margin:0;padding:0;background:#f0fdf4;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;padding:40px 16px;">
    <tr><td align="center">
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#15803d 0%,#166534 100%);padding:36px 40px 28px;">
            <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">AreaFada OS</h1>
            <p style="margin:6px 0 0;color:#bbf7d0;font-size:13px;font-weight:500;letter-spacing:0.5px;">CREATOR · ACCOUNT ACTIVATED</p>
          </td>
        </tr>

        <!-- Hero -->
        <tr>
          <td style="background:#dcfce7;padding:28px 40px 24px;border-bottom:1px solid #bbf7d0;">
            <p style="margin:0;color:#166534;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">Your Creator Tools Are Live</p>
            <h2 style="margin:10px 0 0;color:#14532d;font-size:24px;font-weight:800;line-height:1.3;">
              Your Creator Account<br/>Is Ready. Sign In Now.
            </h2>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7;">
              You've been upgraded to <strong style="color:#15803d;">AreaFada OS Creator</strong> — powerful tools
              built for creators who are serious about growing their audience and monetising their content.
            </p>

            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 8px 8px 0;padding:0;margin:24px 0;">
              <tr>
                <td style="padding:20px 24px;">
                  <p style="margin:0 0 10px;color:#15803d;font-weight:700;font-size:14px;">✨ What you unlock at Creator</p>
                  <ul style="margin:0;padding-left:18px;color:#374151;font-size:14px;line-height:1.8;">
                    <li>Content scheduling across Instagram, TikTok, X &amp; more</li>
                    <li>Unified Customer Support Inbox</li>
                    <li>AI-powered caption &amp; hashtag suggestions</li>
                    <li>Analytics dashboard &amp; post performance tracking</li>
                    <li>Campaign management &amp; audience growth tools</li>
                  </ul>
                </td>
              </tr>
            </table>

            <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.7;">
              Sign in with the email address this was sent to — <strong>${email}</strong> — to access your dashboard.
            </p>

            <!-- CTA -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:32px 0 24px;">
              <tr>
                <td align="center">
                  <a href="https://www.areafadaos.com"
                     style="display:inline-block;background:#15803d;color:#ffffff;font-size:16px;font-weight:700;
                            text-decoration:none;padding:16px 48px;border-radius:10px;letter-spacing:-0.2px;">
                    Sign In to AreaFada OS →
                  </a>
                </td>
              </tr>
            </table>

            <p style="margin:0;color:#6b7280;font-size:13px;line-height:1.6;text-align:center;">
              <strong>Your creator journey starts here. Welcome aboard.</strong>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.6;">
              AreaFada OS · Creator Tier<br/>
              You received this because your account has been upgraded on AreaFada OS.<br/>
              <a href="https://www.areafadaos.com" style="color:#16a34a;text-decoration:none;">www.areafadaos.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("── Step 1: Upgrading tiers in DB ──");
  for (const { email, tier } of UPGRADES) {
    await upsertTier(email, tier);
  }

  console.log("\n── Step 2: Sending sign-in notification emails ──");
  const results: { email: string; tier: Tier; status: string; detail?: string }[] = [];

  for (const { email, tier } of UPGRADES) {
    const subject =
      tier === "enterprise"
        ? "🏆 Your AreaFada OS Enterprise Account Is Ready — Sign In Now"
        : "✨ Your AreaFada OS Creator Account Is Ready — Sign In Now";

    const html = tier === "enterprise" ? enterpriseEmail(email) : creatorEmail(email);

    try {
      const { data, error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: email,
        subject,
        html,
      });

      if (error) {
        console.error(`  ❌  ${email} (${tier}): Resend error — ${JSON.stringify(error)}`);
        results.push({ email, tier, status: "error", detail: JSON.stringify(error) });
      } else {
        console.log(`  ✅  ${email} (${tier}): sent (id=${data?.id})`);
        results.push({ email, tier, status: "sent" });
      }
    } catch (err: any) {
      console.error(`  ❌  ${email} (${tier}): exception — ${err?.message ?? err}`);
      results.push({ email, tier, status: "error", detail: err?.message ?? String(err) });
    }
  }

  console.log("\n── Summary ──");
  const sent = results.filter(r => r.status === "sent").length;
  const failed = results.filter(r => r.status === "error").length;
  console.log(`Sent: ${sent}  |  Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
