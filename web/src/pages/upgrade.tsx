import { useLocation } from "wouter";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetMyTier } from "@workspace/api-client-react";

const TIERS = [
  {
    key: "creator",
    name: "Creator",
    price: "$49",
    period: "/mo",
    features: ["Multi-platform scheduling", "Monetization dashboard", "AI captions", "Book Promo", "Auto-Post"],
  },
  {
    key: "brand",
    name: "Brand",
    price: "$199",
    period: "/mo",
    highlight: true,
    features: ["Everything in Creator", "Full analytics", "Live Video", "Clip Engine", "Traffic tools", "3 seats"],
  },
  {
    key: "agency",
    name: "Agency",
    price: "$499",
    period: "/mo",
    features: ["Everything in Brand", "Ambassador CRM", "Fan Hub", "36-state network", "10 seats"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    price: "Custom",
    period: "",
    features: ["Everything in Agency", "Campaign Intelligence", "Political campaign mode", "Dedicated support", "SLA"],
  },
];

const TIER_RANK: Record<string, number> = { free: 0, creator: 1, brand: 2, agency: 3, enterprise: 4 };

export default function UpgradePage() {
  const [, setLocation] = useLocation();
  const { data: tier } = useGetMyTier();
  const userRank = TIER_RANK[tier?.tier || "free"] ?? 0;

  return (
    <AppShell title="Upgrade">
      <div className="p-6 max-w-5xl">
        <h1 className="text-3xl font-black mb-2" data-testid="upgrade-heading">Upgrade Your Plan</h1>
        <p className="text-muted-foreground mb-8">Unlock more modules and grow your creator empire.</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TIERS.map((t) => {
            const tierRank = TIER_RANK[t.key] ?? 0;
            const isCurrent = tier?.tier === t.key;
            const isDowngrade = tierRank < userRank;

            return (
              <div
                key={t.key}
                className={`rounded-xl border p-5 flex flex-col ${
                  t.highlight
                    ? "border-primary bg-primary/5 ring-1 ring-primary"
                    : "border-border bg-card"
                }`}
                data-testid={`upgrade-tier-${t.key}`}
              >
                {t.highlight && (
                  <Badge className="self-start mb-3 bg-primary text-primary-foreground text-xs">Most Popular</Badge>
                )}
                {isCurrent && (
                  <Badge className="self-start mb-3 bg-muted text-muted-foreground text-xs">Current Plan</Badge>
                )}
                <div className="font-bold text-sm text-muted-foreground mb-1">{t.name}</div>
                <div className="flex items-baseline gap-1 mb-3">
                  <span className="text-2xl font-black">{t.price}</span>
                  <span className="text-sm text-muted-foreground">{t.period}</span>
                </div>
                <ul className="space-y-1.5 mb-5 flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="text-xs flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  size="sm"
                  variant={isCurrent || isDowngrade ? "outline" : t.highlight ? "default" : "outline"}
                  className="w-full"
                  disabled={isCurrent || isDowngrade}
                  data-testid={`btn-upgrade-${t.key}`}
                  onClick={() => !isCurrent && !isDowngrade && setLocation("/sign-up")}
                >
                  {isCurrent ? "Current Plan" : isDowngrade ? "Downgrade" : `Upgrade to ${t.name}`}
                </Button>
              </div>
            );
          })}
        </div>
        <div className="mt-6">
          <Button variant="ghost" onClick={() => setLocation("/dashboard")} data-testid="btn-back-dashboard">
            ← Back to Dashboard
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
