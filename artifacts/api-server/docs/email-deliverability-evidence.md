# AreaFada OS — Email Deliverability Evidence

This file records the results of deliverability validation for areafada.com email.
Update it each time you run the check scripts after a DNS change.

## How to run the checks

```bash
# 1. DNS pre-checks (supply CNAME values from Replit Publishing panel)
CLERK_CNAME_HOST_1=<host1>   CLERK_CNAME_TARGET_1=<target1> \
CLERK_CNAME_HOST_2=<host2>   CLERK_CNAME_TARGET_2=<target2> \
pnpm --filter api-server check:dns

# 2. Send a real Clerk verification email to a mail-tester address
TEST_EMAIL=<address@mail-tester.com> \
pnpm --filter api-server test:clerk-email

# 3. Send a real Resend transactional email to a mail-tester address
SMOKE_RECIPIENT=<address@mail-tester.com> \
pnpm --filter api-server smoke:email
```

---

## Run 1 — Baseline (2026-06-29)  ← DNS not yet configured

### DNS Pre-check Results

Run:
```
CLERK_CNAME_HOST_1=clerk.areafada.com   CLERK_CNAME_TARGET_1=<from-publishing-panel> \
CLERK_CNAME_HOST_2=accounts.areafada.com CLERK_CNAME_TARGET_2=<from-publishing-panel> \
pnpm --filter api-server check:dns
```

| Check | Status | Notes |
|-------|--------|-------|
| Clerk CNAME 1 (`clerk.areafada.com`) | ❌ FAIL | CNAME not found in DNS — record not yet added |
| Clerk CNAME 2 (`accounts.areafada.com`) | ❌ FAIL | CNAME not found in DNS — record not yet added |
| Resend SPF (`include:_spf.resend.com`) | ❌ FAIL | Existing SPF: `v=spf1 include:spf.efwd.registrar-servers.com ~all` — missing `include:_spf.resend.com` |
| Resend DKIM CNAME (`resend._domainkey.areafada.com`) | ❌ FAIL | CNAME not found — not yet added from Resend dashboard |
| DMARC TXT (`_dmarc.areafada.com`) | ❌ FAIL | No DMARC record found |
| `RESEND_FROM_EMAIL` env var | ✅ FIXED | Updated to `AreaFada OS <no-reply@areafada.com>` (was `onboarding@resend.dev`) |

**`check:dns` summary**: 6 checks — 5 failed, 1 passed (env var)

### Required DNS changes (to apply at domain registrar)

1. **Edit SPF TXT on `areafada.com`**  
   Current: `v=spf1 include:spf.efwd.registrar-servers.com ~all`  
   Required: `v=spf1 include:spf.efwd.registrar-servers.com include:_spf.resend.com ~all`

2. **Add Resend DKIM CNAME**  
   Host: `resend._domainkey.areafada.com`  
   Target: *(get from https://resend.com/domains → Verify areafada.com)*

3. **Add DMARC TXT**  
   Host: `_dmarc.areafada.com`  
   Value: `v=DMARC1; p=none; rua=mailto:dmarc@areafada.com`

4. **Add Clerk CNAME records (both)**  
   Source: Replit → Publishing → Domains → areafada.com → Manage → "Authentication DNS setup required"

### Clerk Verification-Email Test (Baseline)

A real Clerk invitation was sent via `pnpm --filter api-server test:clerk-email`
to confirm the Clerk Backend API path is exercised and operational.

| Field | Value |
|-------|-------|
| Run date | 2026-06-29 |
| Test address | `areafada-deliverability-test-1782738579@yopmail.com` |
| Clerk invitation ID | `inv_3FoPj8mmvPCTJn85L1SoAWur1GJ` |
| Clerk API response | ✅ HTTP 200 — `status: pending` |
| Expected from address before DNS fix | `noreply@clerk.com` (Clerk's own domain — "via clerk.com" in Gmail) |
| Expected from address after DNS fix | `*@areafada.com` (no "via clerk.com") |

> **Note:** At baseline the invitation email is sent through Clerk's own domain because  
> the areafada.com CNAME records are not yet in place. After DNS propagates, Clerk  
> routes verification emails through @areafada.com automatically.

### mail-tester.com Score (Baseline — pre-DNS)

*Not yet captured — requires mail-tester.com one-shot address.*  
*Expected outcome before DNS fix: score ≈ 3–5/10 (SPF/DKIM/DMARC fail, "via clerk.com" shown)*

Expected once DNS is fully configured:

| Check | Expected |
|-------|----------|
| SPF | pass |
| DKIM | pass |
| DMARC | pass |
| From address | `*@areafada.com` |
| Score | ≥ 9/10 |

### Gmail Header Check (Baseline — pre-DNS)

*Not yet captured — requires DNS records to be in place first.*

Expected outcome after DNS is fixed:

| Header field | Expected |
|--------------|----------|
| `mailed-by` | `areafada.com` |
| `signed-by` | `areafada.com` |
| "via clerk.com" line | absent |
| Landed in | Inbox (not Spam) |

---

## Run 2 — Post-DNS (fill in after DNS propagates)

*Complete this section after applying all four DNS changes above.*

### DNS Pre-check Results

Run date: _not yet run_

| Check | Status | Notes |
|-------|--------|-------|
| Clerk CNAME 1 | ⬜ PENDING | |
| Clerk CNAME 2 | ⬜ PENDING | |
| Resend SPF | ⬜ PENDING | |
| Resend DKIM | ⬜ PENDING | |
| DMARC | ⬜ PENDING | |
| `RESEND_FROM_EMAIL` | ✅ Already set to `no-reply@areafada.com` | |

### Clerk Verification-Email Test

| Field | Value |
|-------|-------|
| Run date | ⬜ PENDING |
| Test address (mail-tester.com) | ⬜ PENDING |
| Clerk invitation ID | ⬜ PENDING |
| mail-tester.com score | ⬜ PENDING / 10 |
| SPF result | ⬜ PENDING |
| DKIM result | ⬜ PENDING |
| DMARC result | ⬜ PENDING |
| From address (mail-tester) | ⬜ PENDING |
| Gmail `mailed-by` | ⬜ PENDING |
| Gmail `signed-by` | ⬜ PENDING |
| "via clerk.com" in Gmail | ⬜ PENDING (must be absent) |
| Landed in Inbox | ⬜ PENDING |

### Resend Transactional-Email Test

| Field | Value |
|-------|-------|
| Run date | ⬜ PENDING |
| Test address (mail-tester.com) | ⬜ PENDING |
| Resend message ID | ⬜ PENDING |
| mail-tester.com score | ⬜ PENDING / 10 |
| SPF result | ⬜ PENDING |
| DKIM result | ⬜ PENDING |
| DMARC result | ⬜ PENDING |
| From address | ⬜ PENDING (`no-reply@areafada.com`) |
| Landed in Inbox | ⬜ PENDING |

### MXToolbox Spot Checks

| Tool | URL | Result |
|------|-----|--------|
| SPF | https://mxtoolbox.com/spf.aspx | ⬜ PENDING |
| DKIM (selector: resend) | https://mxtoolbox.com/dkim.aspx | ⬜ PENDING |
| DMARC | https://mxtoolbox.com/dmarc.aspx | ⬜ PENDING |

---

## Sign-off

Fill in Run 2 and sign off once all rows above show ✅ PASS.

| Sign-off | Date | Notes |
|----------|------|-------|
| ⬜ Pending | | Apply DNS changes → wait 48 h propagation → re-run scripts → fill in Run 2 |
