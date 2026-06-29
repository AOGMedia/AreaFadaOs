# AreaFada OS — Email Deliverability DNS Setup Guide

This guide walks through every DNS change needed so that transactional emails
(clip schedule reports, analytics) and Clerk verification emails pass spam
filters and reach the inbox reliably.

Run the checker at any point to see which items are still outstanding:

```bash
pnpm --filter api-server check:dns
```

---

## Step 1 — Edit the SPF TXT record

**Where:** Your DNS provider (wherever `areafada.com` is managed — Namecheap,
Cloudflare, GoDaddy, etc.)

The current SPF record on `areafada.com` is:

```
v=spf1 include:spf.efwd.registrar-servers.com ~all
```

**Change it to** (add `include:_spf.resend.com` before the trailing `~all`):

```
v=spf1 include:spf.efwd.registrar-servers.com include:_spf.resend.com ~all
```

| Field | Value |
|-------|-------|
| Type  | TXT   |
| Name  | `@`  (or `areafada.com`) |
| Value | `v=spf1 include:spf.efwd.registrar-servers.com include:_spf.resend.com ~all` |

> Do **not** create a second SPF record — there must be exactly one SPF TXT
> record on the root domain. Edit the existing one in-place.

---

## Step 2 — Verify areafada.com in Resend and add the DKIM CNAME

### 2a. Verify the domain in Resend

1. Log in to [https://resend.com/domains](https://resend.com/domains)
2. Click **Add Domain** (or **Verify** if `areafada.com` is already listed)
3. Enter `areafada.com` and click **Verify**
4. Resend will show you a DKIM CNAME record — copy the **Value/Target** field

### 2b. Add the DKIM CNAME at your DNS provider

| Field  | Value |
|--------|-------|
| Type   | CNAME |
| Name   | `resend._domainkey` (or `resend._domainkey.areafada.com` — depends on provider) |
| Value  | The target shown in the Resend dashboard (looks like `<token>.dkim.resend.com`) |
| TTL    | 3600 (or default) |

After adding the record, click **Verify** in Resend. It may take up to 48 h
for DNS to propagate; Resend will show a green checkmark when it detects the
record.

---

## Step 3 — Add the DMARC TXT record

**Where:** Your DNS provider

| Field | Value |
|-------|-------|
| Type  | TXT   |
| Name  | `_dmarc` (or `_dmarc.areafada.com`) |
| Value | `v=DMARC1; p=none; rua=mailto:dmarc@areafada.com` |
| TTL   | 3600 (or default) |

> `p=none` is the correct starting policy — it monitors without blocking any
> mail. Tighten to `p=quarantine` or `p=reject` only after SPF and DKIM have
> been passing consistently for several weeks.

---

## Step 4 — Add Clerk verification-email CNAMEs  *(for signup / password-reset emails)*

Clerk needs two CNAME records that Replit generates per tenant.

1. Open Replit → **Publishing** → **Domains** → `areafada.com` → **Manage**
2. Look for the section **"Authentication DNS setup required"**
3. Copy **both** rows (each has a Host and a Value/Target)
4. Add them at your DNS provider as CNAME records:

| Field | Value |
|-------|-------|
| Type  | CNAME |
| Name  | (Host from Publishing panel — e.g. `clerk.areafada.com`) |
| Value | (Target from Publishing panel) |

Repeat for the second row.

---

## Step 5 — Confirm RESEND_FROM_EMAIL is set correctly

The `RESEND_FROM_EMAIL` env var is already configured correctly in Replit:

```
AreaFada OS <no-reply@areafada.com>
```

No action needed — this check already passes.

---

## Step 6 — Re-run the DNS checker

After making the DNS changes above (allow up to 48 h for propagation):

```bash
# Basic check
pnpm --filter api-server check:dns

# Include Clerk CNAME validation (get values from Replit Publishing panel)
CLERK_CNAME_HOST_1=clerk.areafada.com \
CLERK_CNAME_TARGET_1=<target-from-publishing-panel> \
CLERK_CNAME_HOST_2=accounts.areafada.com \
CLERK_CNAME_TARGET_2=<target-from-publishing-panel> \
pnpm --filter api-server check:dns
```

All checks should show ✅.

---

## Step 7 — Inbox placement validation (mail-tester.com)

DNS correctness is necessary but not sufficient — validate actual inbox
placement after all DNS checks are green.

1. Go to [https://www.mail-tester.com](https://www.mail-tester.com) and copy the generated test address
2. Send a real clip schedule email to that address:
   ```bash
   SMOKE_RECIPIENT=<test-address-from-mail-tester> pnpm --filter api-server smoke:email
   ```
3. Click **"Check your score"** in mail-tester — target is **9–10 / 10**
4. Confirm in the report:
   - SPF: **pass**
   - DKIM: **pass**
   - DMARC: **pass**
   - From address: `no-reply@areafada.com` (not `via resend.dev`)

---

## Summary — DNS records to add/edit

| Record type | Name | Value | Action |
|-------------|------|-------|--------|
| TXT (SPF)   | `@` | `v=spf1 include:spf.efwd.registrar-servers.com include:_spf.resend.com ~all` | **Edit** existing record |
| CNAME (DKIM) | `resend._domainkey` | `<token>.dkim.resend.com` (from Resend dashboard) | **Add** |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@areafada.com` | **Add** |
| CNAME (Clerk 1) | from Replit Publishing panel | from Replit Publishing panel | **Add** |
| CNAME (Clerk 2) | from Replit Publishing panel | from Replit Publishing panel | **Add** |

---

## Useful external tools

| Tool | URL |
|------|-----|
| MXToolbox SPF checker  | https://mxtoolbox.com/spf.aspx |
| MXToolbox DKIM checker | https://mxtoolbox.com/dkim.aspx *(selector: `resend`)* |
| MXToolbox DMARC checker | https://mxtoolbox.com/dmarc.aspx |
| Resend domain dashboard | https://resend.com/domains |
| mail-tester.com | https://www.mail-tester.com |
