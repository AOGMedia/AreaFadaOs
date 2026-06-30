/**
 * One-off script: Send a personal welcome + 999 Book Launch invitation email
 * from Charly Boy to Madam Doris (Royalheritageinc@gmail.com).
 * Also upserts her account to enterprise tier in the DB.
 *
 * Run: pnpm --filter @workspace/api-server tsx scripts/welcome-madam-doris.ts
 *   or: pnpm --filter @workspace/api-server welcome:doris
 */
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { Resend } from "resend";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "AreaFada OS <no-reply@areafada.com>";
const RECIPIENT = "Royalheritageinc@gmail.com";

if (!RESEND_API_KEY) {
  console.error("❌  RESEND_API_KEY not set — aborting.");
  process.exit(1);
}

const resend = new Resend(RESEND_API_KEY);

// ─── Ensure Madam Doris exists as enterprise ───────────────────────────────
async function ensureEnterpriseUser(email: string) {
  const existing = await db
    .select({ id: usersTable.id, tier: usersTable.tier })
    .from(usersTable)
    .where(eq(usersTable.email, email.toLowerCase()))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(usersTable).values({
      clerkId: `manual_${email.replace(/[^a-z0-9]/gi, "_")}`,
      email: email.toLowerCase(),
      tier: "enterprise",
      displayName: "Madam Doris",
    });
    console.log(`✅  Inserted enterprise user: ${email}`);
  } else if (existing[0].tier !== "enterprise") {
    await db
      .update(usersTable)
      .set({ tier: "enterprise", updatedAt: new Date() })
      .where(eq(usersTable.email, email.toLowerCase()));
    console.log(`✅  Upgraded ${email} to enterprise (was ${existing[0].tier})`);
  } else {
    console.log(`ℹ️   ${email} is already enterprise — no DB change needed`);
  }
}

// ─── Email ─────────────────────────────────────────────────────────────────
const subject = "🔥 Madam Doris — Your Time Is NOW. Charly Boy Needs You In The Room.";

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
      <table width="620" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.12);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#15803d 0%,#166534 100%);padding:36px 40px 28px;">
            <h1 style="margin:0;color:#ffffff;font-size:28px;font-weight:900;letter-spacing:-0.5px;">AreaFada OS</h1>
            <p style="margin:6px 0 0;color:#bbf7d0;font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">A Personal Message from The Area Fada · Enterprise Tier</p>
          </td>
        </tr>

        <!-- Personal Salutation Banner -->
        <tr>
          <td style="background:#dcfce7;padding:28px 40px 24px;border-bottom:2px solid #15803d;">
            <p style="margin:0 0 8px;color:#15803d;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;">Direct from the Desk of Charly Boy</p>
            <h2 style="margin:0;color:#14532d;font-size:28px;font-weight:900;line-height:1.25;">
              Madam Doris,<br/>
              <span style="color:#15803d;">The Engine Is Running.</span><br/>
              Are You Ready?
            </h2>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px 20px;">

            <!-- Personal Greeting -->
            <p style="margin:0 0 20px;color:#111827;font-size:16px;line-height:1.8;font-weight:600;">
              Madam Doris — my person, my ally, my OG!
            </p>
            <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.8;">
              It's me, <strong style="color:#15803d;">Charly Boy — The Area Fada</strong>. I'm not sending you a newsletter. I'm not copying you on a blast. I am writing to you, personally, because what I'm about to tell you is too important to leave to chance.
            </p>
            <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.8;">
              The <strong>AreaFada OS Social Media Monetization Engine</strong> is <em>alive</em>. It is powered up. It is firing on all cylinders. And right now, your seat at the table is waiting.
            </p>

            <!-- Section Divider -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0;">
              <tr>
                <td style="border-top:2px dashed #bbf7d0;"></td>
              </tr>
            </table>

            <!-- Monetization Engine Section -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-left:5px solid #15803d;border-radius:0 10px 10px 0;margin:0 0 28px;">
              <tr>
                <td style="padding:22px 26px;">
                  <p style="margin:0 0 8px;color:#15803d;font-weight:800;font-size:15px;text-transform:uppercase;letter-spacing:0.8px;">⚡ Section 1 — Activate Your Monetization Engine</p>
                  <p style="margin:0 0 14px;color:#374151;font-size:14px;line-height:1.75;">
                    Madam Doris, we built <strong>AreaFada OS</strong> for people like you — creators, visionaries, cultural architects who understand that social media is not just about clout. It is about <strong>cash</strong>. It is about <strong>community</strong>. It is about <strong>legacy</strong>.
                  </p>
                  <p style="margin:0 0 14px;color:#374151;font-size:14px;line-height:1.75;">
                    Inside AreaFada OS right now, you have:
                  </p>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:8px 0 8px 10px;color:#374151;font-size:14px;line-height:1.6;">
                        💰 <strong>Monetization Hub</strong> — invoicing, affiliate links, revenue dashboards. Your money moves made simple.
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0 8px 10px;color:#374151;font-size:14px;line-height:1.6;">
                        📅 <strong>Content Scheduler</strong> — post to every platform from one place, timed to perfection, while you sleep.
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0 8px 10px;color:#374151;font-size:14px;line-height:1.6;">
                        🎬 <strong>Clip Engine</strong> — turn your best moments into viral content distributed across dozens of accounts automatically.
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0 8px 10px;color:#374151;font-size:14px;line-height:1.6;">
                        👥 <strong>Ambassador CRM</strong> — manage your tribe, your network, your inner circle like a CEO.
                      </td>
                    </tr>
                    <tr>
                      <td style="padding:8px 0 8px 10px;color:#374151;font-size:14px;line-height:1.6;">
                        🌟 <strong>Fan Hub</strong> — build loyalty tiers, reward your die-hards, and grow an army that converts.
                      </td>
                    </tr>
                  </table>
                  <p style="margin:16px 0 0;color:#14532d;font-size:14px;line-height:1.75;font-weight:700;">
                    This is not theory. This is not a demo. This is LIVE. Log in today, Madam Doris. Your engine is waiting and it will not start itself.
                  </p>
                </td>
              </tr>
            </table>

            <!-- 999 Book Launch Section Divider -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:28px 0 24px;">
              <tr>
                <td style="border-top:2px dashed #bbf7d0;"></td>
              </tr>
            </table>

            <!-- 999 Book Launch Section -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(135deg,#14532d 0%,#166534 100%);border-radius:12px;margin:0 0 28px;overflow:hidden;">
              <tr>
                <td style="padding:28px 28px 24px;">
                  <p style="margin:0 0 6px;color:#bbf7d0;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1.5px;">📖 Section 2 — The Event of the Generation</p>
                  <h3 style="margin:0 0 16px;color:#ffffff;font-size:26px;font-weight:900;line-height:1.2;">
                    The Charly Boy <em style="color:#86efac;">999</em> Book Launch
                  </h3>
                  <p style="margin:0 0 16px;color:#d1fae5;font-size:14px;line-height:1.8;">
                    Madam Doris — I am personally inviting you to be in the room for one of the most electric, most anticipated, most <em>necessary</em> cultural events this continent has seen in years. My book, <strong style="color:#ffffff;">999</strong>, is not just a book. It is a declaration. It is a war cry. It is a love letter to every African soul who ever refused to be put in a box.
                  </p>
                  <p style="margin:0 0 20px;color:#d1fae5;font-size:14px;line-height:1.8;">
                    <em>999</em> is Charly Boy's most raw, most visionary manifesto yet — on African identity, on resilience, on reinvention, on the audacity to live life on your own terms no matter who claps or who hisses. And the launch? It is going to be nothing short of a movement.
                  </p>

                  <!-- Who Will Be There -->
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(255,255,255,0.10);border-radius:8px;margin:0 0 18px;">
                    <tr>
                      <td style="padding:18px 20px;">
                        <p style="margin:0 0 12px;color:#86efac;font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:1px;">Who Will Be In That Room:</p>
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td style="padding:5px 0;color:#d1fae5;font-size:13px;line-height:1.6;">
                              🎙️ <strong style="color:#ffffff;">Media Gurus</strong> — the kingmakers of African narrative, the tastemakers who decide what the continent talks about
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:5px 0;color:#d1fae5;font-size:13px;line-height:1.6;">
                              💻 <strong style="color:#ffffff;">Tech Cabals</strong> — the builders, the disruptors, the engineers of Africa's digital future
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:5px 0;color:#d1fae5;font-size:13px;line-height:1.6;">
                              📱 <strong style="color:#ffffff;">Top Social Media Influencers</strong> — local heavyweights and diaspora voices with millions of combined followers across every platform
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:5px 0;color:#d1fae5;font-size:13px;line-height:1.6;">
                              🔥 <strong style="color:#ffffff;">Die-Hard Fans</strong> — the real ones, the day-ones, the people who carried this movement before it had a name
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:5px 0;color:#d1fae5;font-size:13px;line-height:1.6;">
                              🏢 <strong style="color:#ffffff;">Entrepreneurs &amp; Visionaries</strong> — Africa's boldest founders and business minds who understand that culture is the ultimate currency
                            </td>
                          </tr>
                          <tr>
                            <td style="padding:5px 0;color:#d1fae5;font-size:13px;line-height:1.6;">
                              🏛️ <strong style="color:#ffffff;">Government Officials</strong> — policymakers and public servants who cannot afford to ignore what this moment represents
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                  </table>

                  <p style="margin:0;color:#bbf7d0;font-size:14px;line-height:1.8;font-style:italic;">
                    "Date to be announced — but Madam Doris, when I call, you will want to be ready to move. Watch this space. Watch AreaFada OS. This is where the signal comes first."
                  </p>
                </td>
              </tr>
            </table>

            <!-- Personal Close -->
            <p style="margin:0 0 18px;color:#374151;font-size:15px;line-height:1.8;">
              Madam Doris, you and I both know that the people who win are not the ones who wait. They are the ones who show up. They are the ones who activate. They are the ones who say <em>yes</em> before the crowd catches on.
            </p>
            <p style="margin:0 0 28px;color:#374151;font-size:15px;line-height:1.8;">
              Today, I am asking you — <strong>show up</strong>. Log in to AreaFada OS. Get your monetization engine running. And stay close, because the 999 wave is coming and I want you on it, not watching from the shore.
            </p>

            <!-- CTA Button -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 32px;">
              <tr>
                <td align="center">
                  <a href="https://www.areafadaos.com"
                     style="display:inline-block;background:#15803d;color:#ffffff;font-size:17px;font-weight:800;
                            text-decoration:none;padding:18px 56px;border-radius:12px;letter-spacing:-0.2px;
                            box-shadow:0 4px 14px rgba(21,128,61,0.40);">
                    Activate My Monetization Engine →
                  </a>
                </td>
              </tr>
              <tr>
                <td align="center" style="padding-top:12px;">
                  <a href="https://www.areafadaos.com" style="color:#6b7280;font-size:12px;text-decoration:none;">
                    https://www.areafadaos.com
                  </a>
                </td>
              </tr>
            </table>

            <!-- Sign-off -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0fdf4;border-radius:10px;margin:0 0 8px;">
              <tr>
                <td style="padding:22px 26px;">
                  <p style="margin:0 0 6px;color:#374151;font-size:15px;line-height:1.7;">
                    With mad love, big energy, and zero apology —
                  </p>
                  <p style="margin:0;color:#15803d;font-size:17px;font-weight:900;letter-spacing:-0.3px;">
                    Charly Boy<br/>
                    <span style="font-size:13px;font-weight:600;color:#166534;letter-spacing:0.5px;">The Area Fada · Founder, AreaFada OS</span>
                  </p>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:24px 40px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;line-height:1.7;">
              AreaFada OS · Enterprise Tier · A Personal Message from Charly Boy<br/>
              You received this personal invitation because you are part of the AreaFada OS enterprise inner circle.<br/>
              <a href="https://www.areafadaos.com" style="color:#16a34a;text-decoration:none;">www.areafadaos.com</a>
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
  console.log("── Step 1: Upserting Madam Doris as enterprise user ──");
  await ensureEnterpriseUser(RECIPIENT);

  console.log("\n── Step 2: Sending personal welcome + 999 Book Launch email ──");
  console.log(`   To      : ${RECIPIENT}`);
  console.log(`   From    : ${FROM_EMAIL}`);
  console.log(`   Subject : ${subject}`);

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: RECIPIENT,
    subject,
    html: htmlBody,
  });

  if (error) {
    console.error(`\n❌  Resend error: ${JSON.stringify(error)}`);
    process.exit(1);
  }

  console.log(`\n✅  Email sent successfully — messageId: ${data?.id}`);
  console.log(`   Delivered to ${RECIPIENT}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
