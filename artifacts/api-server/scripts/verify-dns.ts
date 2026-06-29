#!/usr/bin/env tsx
/**
 * AreaFada OS — Email Deliverability DNS Pre-Check
 *
 * Validates that the DNS records required for email deliverability are in place
 * for areafada.com.  Covers two independent email paths:
 *
 *   A) Clerk verification emails (signup / password-reset)
 *      These are sent via Replit-managed Clerk using CNAME records copied from
 *      Publishing → Domains → areafada.com → Manage → "Authentication DNS setup required".
 *      The exact CNAME hostnames and targets are tenant-specific; supply them via
 *      env vars (see below) so checks reflect the actual records Replit shows you.
 *
 *   B) Resend transactional emails (clip schedule reports, analytics)
 *      These require an SPF TXT record, a DKIM CNAME, and a DMARC TXT record.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * Usage (from workspace root):
 *   pnpm --filter api-server check:dns
 *
 * Supply Clerk CNAME values from the Replit Publishing panel:
 *   CLERK_CNAME_HOST_1=clerk.areafada.com \
 *   CLERK_CNAME_TARGET_1=<value-from-publishing-panel> \
 *   CLERK_CNAME_HOST_2=accounts.areafada.com \
 *   CLERK_CNAME_TARGET_2=<value-from-publishing-panel> \
 *   pnpm --filter api-server check:dns
 *
 * No secrets or API keys required.
 *
 * Exit codes:
 *   0 — all configured checks passed (DNS prechecks green; see "Next steps" below
 *       for the required manual inbox-placement validation)
 *   1 — one or more checks failed
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * NOTE: This script validates DNS *records only*.  Passing all checks here means
 * the DNS layer is correctly configured.  It does NOT guarantee inbox placement.
 * After all checks are green, complete the manual validation described in the
 * "Next: validate inbox placement" section printed at the end.
 */

import dns from "dns/promises";

const DOMAIN = "areafada.com";

let passed = 0;
let failed = 0;
let warned = 0;

function ok(label: string, detail?: string) {
  passed++;
  console.log(`  ✅  ${label}${detail ? `  —  ${detail}` : ""}`);
}

function fail(label: string, fix: string) {
  failed++;
  console.log(`  ❌  ${label}`);
  console.log(`       → Fix: ${fix}`);
}

function warn(label: string, detail: string) {
  warned++;
  console.log(`  ⚠️   ${label}`);
  console.log(`       → ${detail}`);
}

function section(title: string) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
}

// ─── A. Clerk verification-email CNAMEs ─────────────────────────────────────
//
// Clerk needs CNAME records that Replit generates per tenant.  Find the exact
// hostnames and targets in:
//   Replit → Publishing → Domains → areafada.com → Manage
//   → "Authentication DNS setup required"
//
// Pass them via env vars so this script checks the real values, not guesses.
//
section("A. Clerk verification-email DNS (signup / password-reset)");

const clerkPairs: Array<{ host: string; expectedTarget: string | null }> = [];

const h1 = process.env.CLERK_CNAME_HOST_1?.trim();
const t1 = process.env.CLERK_CNAME_TARGET_1?.trim() || null;
const h2 = process.env.CLERK_CNAME_HOST_2?.trim();
const t2 = process.env.CLERK_CNAME_TARGET_2?.trim() || null;

if (!h1 && !h2) {
  fail(
    "Clerk CNAME hostnames not supplied — cannot validate verification-email DNS",
    "Re-run with the CNAME values shown in Replit Publishing:\n" +
    "         1. Open Replit → Publishing → Domains → areafada.com → Manage\n" +
    "         2. Copy BOTH rows under \"Authentication DNS setup required\"\n" +
    "         3. Re-run:\n" +
    "            CLERK_CNAME_HOST_1=<host1>  CLERK_CNAME_TARGET_1=<target1> \\\n" +
    "            CLERK_CNAME_HOST_2=<host2>  CLERK_CNAME_TARGET_2=<target2> \\\n" +
    "            pnpm --filter api-server check:dns",
  );
} else {
  if (h1) clerkPairs.push({ host: h1, expectedTarget: t1 });
  if (h2) clerkPairs.push({ host: h2, expectedTarget: t2 });

  for (const { host, expectedTarget } of clerkPairs) {
    try {
      const cnames = await dns.resolveCname(host);
      if (cnames.length === 0) {
        fail(
          `Clerk CNAME resolves to nothing: ${host}`,
          `Add the CNAME record at your DNS provider: ${host} → ${expectedTarget ?? "<target from Publishing panel>"}`,
        );
      } else {
        const actual = cnames[0];
        const looksLikeClerk = actual.includes("clerk") ||
          actual.includes("lcl.dev") ||
          actual.includes("clerkstage") ||
          actual.includes("replit");
        if (expectedTarget && actual !== expectedTarget) {
          fail(
            `CNAME target mismatch for ${host}`,
            `Expected: ${expectedTarget}\n` +
            `       Found:    ${actual}\n` +
            "       Update the CNAME record at your DNS provider to match the Publishing panel exactly",
          );
        } else if (!looksLikeClerk && !expectedTarget) {
          warn(
            `CNAME at ${host} → ${actual} (unrecognised Clerk target)`,
            "Confirm this matches the value shown in Replit Publishing → Domains → areafada.com → Manage",
          );
        } else {
          ok(`Clerk CNAME present`, `${host} → ${actual}`);
        }
      }
    } catch (e: any) {
      if (e.code === "ENOTFOUND" || e.code === "ENODATA") {
        fail(
          `Clerk CNAME not found in DNS: ${host}`,
          `Add CNAME at your DNS provider: ${host} → ${expectedTarget ?? "<target from Publishing panel>"}\n` +
          "       DNS changes can take up to 48 h to propagate",
        );
      } else {
        warn(
          `DNS lookup error for ${host}: ${e.message}`,
          "DNS may still be propagating — retry in 15–30 minutes",
        );
      }
    }
  }
}

// ─── B. Resend transactional-email records ───────────────────────────────────
section("B. Resend transactional-email DNS (clip reports, analytics)");

// B1. SPF
try {
  const txtRecords = await dns.resolveTxt(DOMAIN);
  const spfRecord = txtRecords
    .map((parts) => parts.join(""))
    .find((r) => r.startsWith("v=spf1"));

  if (!spfRecord) {
    fail(
      `No SPF TXT record on ${DOMAIN}`,
      `Add a TXT record:\n` +
      `         Name: @  (or ${DOMAIN})\n` +
      `         Value: v=spf1 include:_spf.resend.com ~all\n` +
      `         If an SPF record already exists, append include:_spf.resend.com instead`,
    );
  } else if (!spfRecord.includes("_spf.resend.com")) {
    fail(
      `SPF record exists but does not include Resend: "${spfRecord}"`,
      `Edit your SPF TXT record — insert include:_spf.resend.com before the trailing ~all or -all`,
    );
  } else {
    ok(`SPF includes Resend sender pool`, spfRecord);
  }
} catch (e: any) {
  fail(
    `DNS lookup failed for ${DOMAIN} TXT: ${e.message}`,
    "Ensure the domain is active and DNS has propagated",
  );
}

// B2. Resend DKIM
const resendDkimHost = `resend._domainkey.${DOMAIN}`;
try {
  const cnames = await dns.resolveCname(resendDkimHost);
  if (cnames.length === 0) {
    fail(
      `Resend DKIM CNAME not found at ${resendDkimHost}`,
      "Open https://resend.com/domains → click Verify on areafada.com → add the DKIM CNAME shown",
    );
  } else {
    const target = cnames[0];
    const looksLikeResend = target.includes("resend.com") || target.includes("dkim.resend");
    if (looksLikeResend) {
      ok(`Resend DKIM CNAME present`, `${resendDkimHost} → ${target}`);
    } else {
      warn(
        `Resend DKIM CNAME resolves to an unexpected target: ${target}`,
        "Confirm this matches the value shown in your Resend domain dashboard",
      );
    }
  }
} catch (e: any) {
  if (e.code === "ENOTFOUND" || e.code === "ENODATA") {
    fail(
      `Resend DKIM CNAME not found: ${resendDkimHost}`,
      `Open https://resend.com/domains → Verify areafada.com → add the CNAME record shown`,
    );
  } else {
    fail(`DNS lookup error for ${resendDkimHost}: ${e.message}`, "Check DNS propagation");
  }
}

// B3. DMARC (covers both Clerk and Resend sends)
section("C. DMARC policy (covers both Clerk + Resend sends)");
const dmarcHost = `_dmarc.${DOMAIN}`;
try {
  const txtRecords = await dns.resolveTxt(dmarcHost);
  const dmarcRecord = txtRecords
    .map((parts) => parts.join(""))
    .find((r) => r.startsWith("v=DMARC1"));

  if (!dmarcRecord) {
    fail(
      `No DMARC TXT record at ${dmarcHost}`,
      `Add a TXT record:\n` +
      `         Name: _dmarc  (or _dmarc.${DOMAIN})\n` +
      `         Value: v=DMARC1; p=quarantine; rua=mailto:dmarc@${DOMAIN}\n` +
      `         Use p=quarantine to move spoofed mail to spam (set after SPF+DKIM pass consistently)`,
    );
  } else if (dmarcRecord.includes("p=reject")) {
    ok(`DMARC record found`, dmarcRecord.slice(0, 80));
    warn(
      "DMARC policy is p=reject — unauthenticated mail will be silently dropped",
      "p=reject is the strictest policy; confirm SPF and DKIM have been passing for several weeks before using it. Consider p=quarantine if you are not yet certain.",
    );
  } else if (dmarcRecord.includes("p=quarantine")) {
    ok(`DMARC record found with enforcement policy`, dmarcRecord.slice(0, 80));
  } else if (dmarcRecord.includes("p=none")) {
    ok(`DMARC record found`, dmarcRecord.slice(0, 80));
    warn(
      "DMARC policy is p=none — spoofed mail is only reported, not blocked",
      `Tighten to p=quarantine once SPF and DKIM have been passing consistently for 2–4 weeks.\n` +
      `         Update your DNS TXT record at _dmarc.${DOMAIN}:\n` +
      `           v=DMARC1; p=quarantine; rua=mailto:dmarc@${DOMAIN}`,
    );
  } else {
    ok(`DMARC record found`, dmarcRecord.slice(0, 80));
  }
} catch (e: any) {
  if (e.code === "ENOTFOUND" || e.code === "ENODATA") {
    fail(
      `DMARC TXT record not found at ${dmarcHost}`,
      `Add TXT at _dmarc.${DOMAIN}: v=DMARC1; p=quarantine; rua=mailto:dmarc@${DOMAIN}`,
    );
  } else {
    fail(`DNS lookup error for ${dmarcHost}: ${e.message}`, "Check DNS propagation");
  }
}

// B4. RESEND_FROM_EMAIL env var
section("D. RESEND_FROM_EMAIL environment variable");
const fromEmail = process.env.RESEND_FROM_EMAIL ?? "";
if (!fromEmail) {
  warn(
    "RESEND_FROM_EMAIL is not set — transactional emails will use the branded default no-reply@areafada.com",
    `Set RESEND_FROM_EMAIL="AreaFada OS <no-reply@${DOMAIN}>" in Replit Secrets after verifying the domain in Resend`,
  );
} else if (fromEmail.includes("resend.dev")) {
  fail(
    `RESEND_FROM_EMAIL is still using the Resend sandbox: "${fromEmail}"`,
    `Once areafada.com is verified in Resend, update Replit Secrets:\n` +
    `         Value: AreaFada OS <no-reply@${DOMAIN}>`,
  );
} else if (fromEmail.includes(`@${DOMAIN}`)) {
  ok(`RESEND_FROM_EMAIL uses branded domain`, fromEmail);
} else {
  warn(
    `RESEND_FROM_EMAIL uses an unexpected domain: "${fromEmail}"`,
    `Expected an @${DOMAIN} address — verify this is intentional`,
  );
}

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(62));

if (failed === 0 && warned === 0) {
  console.log(`✅  All ${passed} DNS pre-checks passed.`);
} else if (failed === 0) {
  console.log(`⚠️   DNS pre-checks complete: ${passed} passed, ${warned} warning(s).`);
} else {
  console.log(`❌  DNS pre-checks: ${failed} failed, ${passed} passed, ${warned} warning(s).`);
  console.log(`    Fix the issues above, wait for propagation (up to 48 h), then re-run:`);
  console.log(`      pnpm --filter api-server check:dns`);
}

console.log(`
────────────────────────────────────────────────────────────
IMPORTANT: Passing all DNS checks does NOT guarantee inbox
placement.  DNS correctness is necessary but not sufficient.
After all checks are green, do the manual inbox validation:

  1. Go to https://www.mail-tester.com and copy the test address
  2. Trigger a real signup via your app (or send a test clip
     schedule email with: SMOKE_RECIPIENT=<test-address>
     pnpm --filter api-server smoke:email)
  3. For Clerk verification emails: create a new account with
     the mail-tester address and complete the signup flow
  4. Click "Check your score" — target is 9–10/10
  5. In the mail-tester report, confirm:
       • SPF: pass
       • DKIM: pass
       • DMARC: pass
       • From address: no-reply@areafada.com  (not via clerk.com)
  6. Open the email in Gmail — confirm no "via clerk.com" or
     "via resend.dev" mismatch appears next to the sender name

Additional DNS tools:
  • MXToolbox SPF   → https://mxtoolbox.com/spf.aspx
  • MXToolbox DKIM  → https://mxtoolbox.com/dkim.aspx  (selector: resend)
  • MXToolbox DMARC → https://mxtoolbox.com/dmarc.aspx
`);
console.log("═".repeat(62) + "\n");

process.exit(failed > 0 ? 1 : 0);
