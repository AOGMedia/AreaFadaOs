import { useEffect, useRef } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk } from "@clerk/react";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from "wouter";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import UpgradePage from "@/pages/upgrade";
import NotFound from "@/pages/not-found";
import SchedulingPage from "@/pages/scheduling";
import MonetizationPage from "@/pages/monetization";
import { createModulePage } from "@/pages/module-placeholder";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#2dd172",
    colorForeground: "#0d0d0d",
    colorMutedForeground: "#666666",
    colorDanger: "#ef4444",
    colorBackground: "#ffffff",
    colorInput: "#f0f0f0",
    colorInputForeground: "#0d0d0d",
    colorNeutral: "#d1d5db",
    fontFamily: "'DM Sans', sans-serif",
    borderRadius: "0.625rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden shadow-xl",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-gray-900 font-bold text-2xl",
    headerSubtitle: "text-gray-500 text-sm",
    socialButtonsBlockButtonText: "text-gray-700 font-medium",
    formFieldLabel: "text-gray-700 font-medium text-sm",
    footerActionLink: "text-emerald-600 font-semibold hover:text-emerald-700",
    footerActionText: "text-gray-500",
    dividerText: "text-gray-400 text-sm",
    identityPreviewEditButton: "text-emerald-600",
    formFieldSuccessText: "text-emerald-600",
    alertText: "text-gray-800",
    logoBox: "mb-2",
    logoImage: "h-10 w-auto",
    socialButtonsBlockButton: "border border-gray-200 hover:bg-gray-50 text-gray-700",
    formButtonPrimary: "bg-emerald-500 hover:bg-emerald-600 text-white font-semibold",
    formFieldInput: "border border-gray-200 bg-gray-50 text-gray-900 focus:ring-emerald-500",
    footerAction: "bg-gray-50 border-t border-gray-100",
    dividerLine: "bg-gray-200",
    alert: "border border-red-100 bg-red-50",
    otpCodeFieldInput: "border border-gray-200 bg-gray-50",
    formFieldRow: "mb-4",
    main: "p-6",
  },
};

const BookPromoPage = createModulePage({
  title: "Book Promo Engine",
  description: "Dedicated campaign manager for '999' and future releases — smart promo links, click tracking, and download conversions.",
  icon: "📖",
  moduleKey: "bookPromo",
  requiredTier: "creator",
});

const LiveVideoPage = createModulePage({
  title: "Live Video",
  description: "Stream live sessions, schedule streams, and drive reminder opt-ins across all your platforms at once.",
  icon: "🎬",
  moduleKey: "liveVideo",
  requiredTier: "brand",
});

const ClipEnginePage = createModulePage({
  title: "Clip Engine",
  description: "Auto-clip highlights from live sessions and long-form content into shareable TikTok/Reels-ready clips.",
  icon: "✂️",
  moduleKey: "clipEngine",
  requiredTier: "brand",
});

const TrafficPage = createModulePage({
  title: "Traffic Engine",
  description: "Drive real traffic to your content and products through smart link tools, UTM tracking, and geo-targeted campaigns.",
  icon: "🌍",
  moduleKey: "trafficTools",
  requiredTier: "brand",
});

const AmbassadorsPage = createModulePage({
  title: "Ambassador CRM",
  description: "Manage your 36-state ambassador network — assign tasks, track performance, and reward top ambassadors.",
  icon: "🤝",
  moduleKey: "ambassadorCrm",
  requiredTier: "agency",
});

const FanHubPage = createModulePage({
  title: "Fan Hub",
  description: "Verify '999' book buyers, build a paid inner circle, and reward Area Fada's superfans with exclusive access.",
  icon: "⭐",
  moduleKey: "fanHub",
  requiredTier: "agency",
});

const IntelligencePage = createModulePage({
  title: "Campaign Intelligence",
  description: "AI-powered sentiment analysis, trend radar, competitive intel, and political campaign mode for enterprise clients.",
  icon: "📊",
  moduleKey: "campaignIntelligence",
  requiredTier: "enterprise",
});

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const qc = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        qc.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, qc]);

  return null;
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/dashboard" />
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function AuthRequired({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">{children}</Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back, Fada",
            subtitle: "Sign in to your creator OS",
          },
        },
        signUp: {
          start: {
            title: "Join Area Fada OS",
            subtitle: "Your social media monetization engine",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <ClerkQueryClientCacheInvalidator />
          <Switch>
            <Route path="/" component={HomeRedirect} />
            <Route path="/sign-in/*?" component={SignInPage} />
            <Route path="/sign-up/*?" component={SignUpPage} />

            <Route path="/dashboard">
              <AuthRequired><Dashboard /></AuthRequired>
            </Route>
            <Route path="/upgrade">
              <AuthRequired><UpgradePage /></AuthRequired>
            </Route>
            <Route path="/scheduling">
              <AuthRequired><SchedulingPage /></AuthRequired>
            </Route>
            <Route path="/monetization">
              <AuthRequired><MonetizationPage /></AuthRequired>
            </Route>
            <Route path="/book-promo">
              <AuthRequired><BookPromoPage /></AuthRequired>
            </Route>
            <Route path="/live-video">
              <AuthRequired><LiveVideoPage /></AuthRequired>
            </Route>
            <Route path="/clip-engine">
              <AuthRequired><ClipEnginePage /></AuthRequired>
            </Route>
            <Route path="/traffic">
              <AuthRequired><TrafficPage /></AuthRequired>
            </Route>
            <Route path="/ambassadors">
              <AuthRequired><AmbassadorsPage /></AuthRequired>
            </Route>
            <Route path="/fan-hub">
              <AuthRequired><FanHubPage /></AuthRequired>
            </Route>
            <Route path="/intelligence">
              <AuthRequired><IntelligencePage /></AuthRequired>
            </Route>

            <Route component={NotFound} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
