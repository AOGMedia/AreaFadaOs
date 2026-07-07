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

### DNS Pre-check Results (`pnpm --filter api-server check:dns`)

| Check | Status | Notes |
|-------|--------|-------|
| Clerk CNAME 1 (`clerk.areafada.com`) | ❌ FAIL | Hostnames not supplied — copy from Replit Publishing → Domains → areafada.com → Manage |
| Clerk CNAME 2 (`accounts.areafada.com`) | ❌ FAIL | Hostnames not supplied — copy from Replit Publishing → Domains → areafada.com → Manage |
| Resend SPF (`include:_spf.resend.com`) | ❌ FAIL | Existing SPF: `v=spf1 include:spf.efwd.registrar-servers.com ~all` — missing `include:_spf.resend.com` |
| Resend DKIM CNAME (`resend._domainkey.areafada.com`) | ❌ FAIL | CNAME not found — not yet added from Resend dashboard |
| DMARC TXT (`_dmarc.areafada.com`) | ❌ FAIL | No DMARC record found |
| `RESEND_FROM_EMAIL` env var | ✅ PASS | Set to `AreaFada OS <no-reply@areafada.com>` |

**`check:dns` summary**: 5 failed, 1 passed

### Smoke Test Results (`pnpm --filter api-server smoke:email`)

Run date: 2026-06-29

| Step | Status | Notes |
|------|--------|-------|
| DB query (clipSchedulesTable) | ✅ PASS | Found user id=1, email=demo-free@areafadaos.app; 0 schedules in next 30 days |
| `buildClipScheduleEmailPayload()` | ✅ PASS | HTML includes "AreaFada OS" branding and empty-state copy |
| CSV attachment | ✅ PASS | 1 header row, 0 data rows (correct for empty schedule) |
| Subject | ✅ PASS | `AreaFada OS — Clip Schedule (2026-06-29 to 2026-07-29)` |
| From address | ✅ PASS | `AreaFada OS <no-reply@areafada.com>` |
| Resend API send | ❌ FAIL | `validation_error: The areafada.com domain is not verified. Please, add and verify your domain on https://resend.com/domains` |

**Conclusion**: Email pipeline (DB → builder → payload) is fully operational. The only blocker is domain verification in the Resend dashboard. Once verified with correct DNS records, the smoke test will pass.

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

Full step-by-step: `artifacts/api-server/scripts/DNS-SETUP.md`

### Resend Transactional-Email Test (Baseline — pre-DNS)

*Cannot complete — Resend rejects send because areafada.com is not yet verified in the dashboard.*

Expected once DNS + domain verification is done:

| Check | Expected |
|-------|----------|
| SPF | pass |
| DKIM | pass |
| DMARC | pass |
| From address | `AreaFada OS <no-reply@areafada.com>` |
| Resend message ID | non-null |
| Inbox placement | Inbox (not Spam) |
| Score (mail-tester.com) | ≥ 9/10 |

---

## Run 2 — Post-DNS (fill in after DNS propagates)

*Complete this section after applying all four DNS changes above and verifying areafada.com in the Resend dashboard.*

### DNS Pre-check Results

Run date: _not yet run_

```bash
CLERK_CNAME_HOST_1=clerk.areafada.com \
CLERK_CNAME_TARGET_1=<target-from-publishing-panel> \
CLERK_CNAME_HOST_2=accounts.areafada.com \
CLERK_CNAME_TARGET_2=<target-from-publishing-panel> \
pnpm --filter api-server check:dns
```

| Check | Status | Notes |
|-------|--------|-------|
| Clerk CNAME 1 | ⬜ PENDING | |
| Clerk CNAME 2 | ⬜ PENDING | |
| Resend SPF | ⬜ PENDING | |
| Resend DKIM | ⬜ PENDING | |
| DMARC | ⬜ PENDING | |
| `RESEND_FROM_EMAIL` | ✅ Already set to `AreaFada OS <no-reply@areafada.com>` | |

### Smoke Test (Resend Transactional Email)

```bash
SMOKE_RECIPIENT=<address@mail-tester.com> pnpm --filter api-server smoke:email
```

| Field | Value |
|-------|-------|
| Run date | ⬜ PENDING |
| Test address (mail-tester.com) | ⬜ PENDING |
| Resend message ID | ⬜ PENDING |
| mail-tester.com score | ⬜ PENDING / 10 |
| SPF result | ⬜ PENDING |
| DKIM result | ⬜ PENDING |
| DMARC result | ⬜ PENDING |
| From address | ⬜ PENDING (`AreaFada OS <no-reply@areafada.com>`) |
| Landed in Inbox | ⬜ PENDING |

### Clerk Verification-Email Test

```bash
TEST_EMAIL=<address@mail-tester.com> pnpm --filter api-server test:clerk-email
```

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
| ⬜ Pending | | Apply DNS changes → verify areafada.com in Resend dashboard → wait up to 48 h → re-run `check:dns` and `smoke:email` → fill in Run 2 |
