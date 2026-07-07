# AreaFada OS

**AreaFada OS** is an all-in-one creator management platform built for African artists, influencers, and entertainment brands. It combines social scheduling, monetization, fan engagement, live video, ambassador CRM, and AI-powered campaign intelligence into a single workspace.

---

## Monorepo Layout

```
/
├── artifacts/
│   ├── api-server/          # Express 5 REST API (Node.js backend)
│   ├── areafadaos/          # React + Vite web dashboard (creator OS)
│   ├── areafada-revenue/    # Expo React Native mobile app (revenue & deals)
│   └── mockup-sandbox/      # Internal design canvas / component preview
├── lib/
│   ├── db/                  # Drizzle ORM schema, migrations, seed scripts
│   ├── api-spec/            # OpenAPI spec (source of truth for all routes)
│   ├── api-client-react/    # Orval-generated React Query hooks
│   └── api-zod/             # Orval-generated Zod request/response schemas
├── scripts/                 # One-off utility scripts
├── .env.example             # All required environment variables (redacted)
├── pnpm-workspace.yaml      # pnpm workspace + catalog versions
└── tsconfig.base.json       # Shared TypeScript compiler options
```

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 24+ |
| pnpm | 10+ |
| PostgreSQL | 15+ (or a hosted provider — Neon, Supabase, etc.) |

---

## Local Setup

```bash
# 1. Clone the repo
git clone https://github.com/AOGMedia/AreaFadaOs.git
cd AreaFadaOs

# 2. Install dependencies
pnpm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env — fill in DATABASE_URL, Clerk keys, and any other required values

# 4. Push the database schema
pnpm --filter @workspace/db run push

# 5. Start the API server
pnpm --filter @workspace/api-server run dev

# 6. In a separate terminal, start the web dashboard
pnpm --filter @workspace/areafadaos run dev

# 7. (Optional) Start the mobile app (Expo dev server)
pnpm --filter @workspace/areafada-revenue run dev
```

The web dashboard will be available at `http://localhost:<PORT>` (the port is assigned via the `PORT` environment variable).  
The API server listens on the port set in `PORT` — this variable is required and the server will throw on startup if it is missing.

---

## Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm run build` | Typecheck + build all packages |
| `pnpm run typecheck` | Full typecheck across all packages |
| `pnpm --filter @workspace/api-server run dev` | Run the API server in dev mode |
| `pnpm --filter @workspace/areafadaos run dev` | Run the web dashboard in dev mode |
| `pnpm --filter @workspace/areafada-revenue run dev` | Start the Expo mobile dev server |
| `pnpm --filter @workspace/db run push` | Push schema changes to the database (dev only) |
| `pnpm --filter @workspace/db run generate` | Generate Drizzle migration files |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate React Query hooks and Zod schemas from the OpenAPI spec |

---

## Required Environment Variables

Copy `.env.example` to `.env` and fill in the values. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `CLERK_SECRET_KEY` | ✅ | Clerk backend secret key |
| `CLERK_PUBLISHABLE_KEY` | ✅ | Clerk frontend publishable key |
| `VITE_CLERK_PUBLISHABLE_KEY` | ✅ | Same as above, exposed to Vite |
| `CLERK_WEBHOOK_SECRET` | ✅ | For verifying Clerk webhook events |
| `TOKEN_ENCRYPTION_KEY` | ✅ | 32-byte hex key for OAuth token encryption |
| `SESSION_SECRET` | ✅ | Random string for session signing |
| `RESEND_API_KEY` | ✅ | Transactional email via Resend |
| `FLUTTERWAVE_SECRET_KEY` | ✅ | Flutterwave payments |
| `PAYSTACK_SECRET_KEY` | ✅ | Paystack payments |
| `ANTHROPIC_API_KEY` | ⚠️ | AI features (campaign intelligence, clip engine) |
| Social OAuth keys | ⚠️ | Per-platform: Facebook, Instagram, TikTok, X, YouTube |
| `APP_URL` | ⚠️ | Public URL for OAuth redirect URIs |

See `.env.example` for the full list with comments.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24, TypeScript 5.9 |
| Package manager | pnpm workspaces |
| API | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Validation | Zod v4, drizzle-zod |
| Auth | Clerk (managed via Replit Auth pane) |
| API codegen | Orval (OpenAPI → React Query + Zod) |
| Web frontend | React 19, Vite 7, Tailwind CSS v4 |
| Mobile | Expo (React Native) |
| Email | Resend |
| Payments | Flutterwave, Paystack |
| AI | Anthropic Claude |
| Build | esbuild (ESM bundle → `dist/index.mjs` for API server) |

---

## Key Product Features

- **Social Scheduling** — Draft, schedule, and auto-publish posts to Instagram, TikTok, X, YouTube, and Facebook from one calendar
- **Monetization Hub** — Invoicing, affiliate link tracking, Flutterwave/Paystack payment collection
- **Fan Hub** — Tiered fan loyalty system with challenges, points, rewards, and a public fan portal
- **Ambassador CRM** — Manage brand ambassadors, track performance, issue payouts
- **Live Video** — OBS WebSocket integration for streaming, live session management, and fan ticket sales
- **Clip Engine** — AI-assisted video clip extraction, captioning, watermarking, and multi-account distribution
- **Campaign Intelligence** — AI-powered brief generation and campaign analytics
- **Media Partners** — Book promo and traffic exchange with partner media houses
- **Revenue Mobile App** — Expo app for on-the-go deal management, invoices, and affiliate tracking

---

## Architecture Notes

- The **OpenAPI spec** at `lib/api-spec/` is the single source of truth for all API contracts. After changing any route shape, run `pnpm --filter @workspace/api-spec run codegen` to regenerate client hooks and Zod schemas.
- **Drizzle schema** lives in `lib/db/src/schema.ts`. Run `pnpm --filter @workspace/db run push` to apply changes (development only); use `generate` + `migrate` for production migrations.
- All routes require a valid **Clerk session** via the `requireAuth` middleware, except `/health` and webhook endpoints.
- The `requireTier("agency")` middleware guards agency-only features (Ambassador CRM, campaign intelligence).
- **OAuth tokens** (platform connections) are encrypted at rest using `TOKEN_ENCRYPTION_KEY` before being stored in the database.
- The API server is bundled to a single ESM file (`dist/index.mjs`) by esbuild for production deployment; the production start command is `node --enable-source-maps ./dist/index.mjs`.
