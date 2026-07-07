#!/usr/bin/env tsx
/**
 * AreaFada OS — Clerk Verification-Email Deliverability Test
 *
 * Sends a real Clerk invitation to a specified test email address using Clerk's
 * Backend REST API.  Clerk routes the email through the custom domain (areafada.com)
 * once DNS is configured — so this directly exercises the verification-email path
 * that signup / password-reset users will see.
 *
 * After this script sends the invitation, open the test inbox and verify:
 *   ✅  From address shows no-reply@areafada.com (not noreply@clerk.com)
 *   ✅  No "via clerk.com" mismatch in Gmail sender header
 *   ✅  SPF / DKIM / DMARC all pass in mail-tester.com report
 *   ✅  Email lands in inbox (not Spam)
 *
 * Usage (from workspace root):
 *   TEST_EMAIL=<mail-tester-address@mail-tester.com> \
 *     pnpm --filter api-server test:clerk-email
 *
 * Get a test address from https://www.mail-tester.com — it gives you a unique
 * single-use address and then scores the email after it arrives (target: ≥ 9/10).
 *
 * Required env vars:
 *   CLERK_SECRET_KEY   — Replit-managed Clerk secret (set as a Replit secret)
 *   TEST_EMAIL         — recipient address (must be unique; Clerk rejects duplicate invitations)
 *
 * Optional env vars:
 *   CLERK_API_BASE_URL — override Clerk API base (default: https://api.clerk.com)
 */

const clerkSecretKey = process.env.CLERK_SECRET_KEY;
if (!clerkSecretKey) {
  console.error("❌ CLERK_SECRET_KEY is not set.");
  console.error("   This secret is managed by Replit — ensure the app has been configured via the Auth pane.");
  process.exit(1);
}

const testEmail = process.env.TEST_EMAIL;
if (!testEmail) {
  console.error("❌ TEST_EMAIL is not set.");
  console.error("   1. Go to https://www.mail-tester.com and copy the unique test address shown.");
  console.error("   2. Re-run:");
  console.error("      TEST_EMAIL=test-xyz123@mail-tester.com pnpm --filter api-server test:clerk-email");
  process.exit(1);
}

const clerkApiBase = process.env.CLERK_API_BASE_URL ?? "https://api.clerk.com";

console.log("\n🔬 AreaFada OS — Clerk Verification-Email Deliverability Test");
console.log(`   Sending Clerk invitation to: ${testEmail}`);
console.log(`   Clerk API:                   ${clerkApiBase}\n`);

// ── Send Clerk invitation ─────────────────────────────────────────────────────
// POST /v1/invitations sends a Clerk-branded invitation email from the configured
// sender domain. Once areafada.com CNAME records are in place, Clerk routes this
// through @areafada.com rather than @clerk.com.
const body = JSON.stringify({
  email_address: testEmail,
  redirect_url: "https://areafada.com/sign-up",
  public_metadata: { deliverability_test: true },
});

let response: Response;
try {
  response = await fetch(`${clerkApiBase}/v1/invitations`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${clerkSecretKey}`,
      "Content-Type": "application/json",
      "Clerk-API-Version": "2024-10-01",
    },
    body,
  });
} catch (networkError: any) {
  console.error("❌ Network error reaching Clerk API:", networkError.message);
  process.exit(1);
}

const responseText = await response.text();
let responseJson: any;
try {
  responseJson = JSON.parse(responseText);
} catch {
  responseJson = { raw: responseText };
}

if (!response.ok) {
  const errMsg: string = responseJson?.errors?.[0]?.long_message
    ?? responseJson?.errors?.[0]?.message
    ?? responseJson?.error
    ?? responseText;

  if (errMsg.toLowerCase().includes("already been invited") || errMsg.toLowerCase().includes("duplicate")) {
    console.error("❌ Clerk rejected the invitation — this address was already invited.");
    console.error("   Clerk prevents duplicate invitations to the same address.");
    console.error("   Use a fresh test address from https://www.mail-tester.com and retry.");
    console.error(`   (Clerk response: ${errMsg})`);
  } else if (response.status === 401 || response.status === 403) {
    console.error("❌ Clerk rejected the request — invalid or missing secret key.");
    console.error("   Verify CLERK_SECRET_KEY is set correctly in Replit Secrets.");
    console.error(`   (HTTP ${response.status}: ${errMsg})`);
  } else {
    console.error(`❌ Clerk API returned HTTP ${response.status}:`);
    console.error(`   ${errMsg}`);
  }
  process.exit(1);
}

const invitationId: string = responseJson?.id ?? "(unknown)";
console.log("✅ Clerk invitation sent successfully.");
console.log(`   Invitation ID : ${invitationId}`);
console.log(`   To            : ${testEmail}`);
console.log(`   Status        : ${responseJson?.status ?? "pending"}`);

// ── Post-send validation checklist ──────────────────────────────────────────
console.log(`
────────────────────────────────────────────────────────────────
NEXT: Validate inbox placement + sender alignment
────────────────────────────────────────────────────────────────

The invitation email is now in transit.  Complete these steps:

  1. Open https://www.mail-tester.com in a browser
     Click "Check your score" (the email address you supplied is
     already registered as the test target)

  2. In the mail-tester report, verify ALL of the following:
       ✅  SPF          : pass
       ✅  DKIM         : pass  (selector: resend or clerk)
       ✅  DMARC        : pass
       ✅  From address : *@areafada.com  (not *@clerk.com)
       ✅  Score        : ≥ 9 / 10

  3. Open the same email in a real Gmail account:
       a. Click the dropdown arrow next to "to me" in the header
       b. Confirm "mailed-by" shows areafada.com
       c. Confirm "signed-by" shows areafada.com
       d. Confirm there is NO "via clerk.com" line in the sender info
       e. Confirm the email landed in Inbox (not Spam / Promotions)

  4. Record results in:
       artifacts/api-server/docs/email-deliverability-evidence.md

  5. If any check fails:
       a. Run: pnpm --filter api-server check:dns
          (supply CLERK_CNAME_HOST_1/2 + CLERK_CNAME_TARGET_1/2)
       b. Fix the failing DNS record at your provider
       c. Wait up to 48 h for propagation, then retry this script
          with a fresh mail-tester address

────────────────────────────────────────────────────────────────
`);
