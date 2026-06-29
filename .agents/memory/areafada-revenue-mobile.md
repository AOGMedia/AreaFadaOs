---
name: AreaFada Revenue Mobile
description: Expo mobile app for creator revenue tracking — key architectural decisions and wiring patterns.
---

# AreaFada Revenue Mobile App

## Auth wiring (Clerk Expo)
- Root `_layout.tsx` wraps in `<ClerkProvider tokenCache proxyUrl>` + `<ClerkLoaded>`
- `(tabs)/_layout.tsx` calls `setAuthTokenGetter(() => getToken())` — required for Bearer auth on mobile (no cookie jar)
- Dev script must prefix with `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY`
- `build.js` sets `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` + `EXPO_PUBLIC_CLERK_PROXY_URL` in Metro env

**Why:** Mobile has no browser cookie jar — explicit Bearer token wiring is mandatory. Copy this pattern for any future Expo apps.

## Push notification stub pattern
- `hooks/useOverdueNotifications.ts` uses `expo-notifications` local scheduling as a stub
- Real push: store token via `getExpoPushTokenAsync()`, POST to API, send from server scheduler
- TODO markers in the hook describe the graduation path clearly

**Why:** Expo local notifications work in dev without a push server; the stub keeps the feature visible while the real backend integration is deferred.

## Font convention
- `@expo-google-fonts/dm-sans` to match the web app; use `DM_Sans_400Regular` through `DM_Sans_700Bold` in all StyleSheets

## Design tokens
- Primary: `#12a557` light / `#15c266` dark; accent: `#e88c0a`; in `constants/colors.ts` with `light`, `dark` keys + `radius: 10`
