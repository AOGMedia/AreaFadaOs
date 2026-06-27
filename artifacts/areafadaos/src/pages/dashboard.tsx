import { useUser, useClerk, Show } from "@clerk/react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useGetMe,
  useGetMyTier,
  useGetDashboardSummary,
  useGetDashboardActivity,
} from "@workspace/api-client-react";
import {
  Calendar,
  DollarSign,
  Briefcase,
  Users,
  Star,
  Radio,
  LogOut,
  TrendingUp,
  Zap,
  Globe,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const ACTIVITY_ICONS: Record<string, string> = {
  post_scheduled: "📅",
  brand_deal: "💼",
  ambassador: "🌍",
  revenue: "💰",
  fan_hub: "⭐",
  ai_caption: "🤖",
  live_session: "🎬",
  promo_link: "🔗",
};

const TIER_BADGE: Record<string, { label: string; color: string }> = {
  free: { label: "Free", color: "bg-gray-100 text-gray-600" },
  creator: { label: "Creator", color: "bg-emerald-100 text-emerald-700" },
  brand: { label: "Brand", color: "bg-blue-100 text-blue-700" },
  agency: { label: "Agency", color: "bg-purple-100 text-purple-700" },
  enterprise: { label: "Enterprise", color: "bg-amber-100 text-amber-700" },
};

function StatCard({ icon, label, value, sub, loading }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; loading?: boolean }) {
  return (
    <Card data-testid={`stat-card-${label.toLowerCase().replace(/ /g, "-")}`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
        </div>
        {loading ? (
          <>
            <Skeleton className="h-7 w-24 mb-1" />
            <Skeleton className="h-4 w-32" />
          </>
        ) : (
          <>
            <div className="text-2xl font-black mb-0.5">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
            {sub && <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const MODULE_CARDS = [
  { key: "scheduling", icon: <Calendar className="w-4 h-4" />, label: "Scheduling", desc: "Auto-Post & Queue" },
  { key: "monetization", icon: <DollarSign className="w-4 h-4" />, label: "Monetization", desc: "Revenue & Invoicing" },
  { key: "bookPromo", icon: <Zap className="w-4 h-4" />, label: "Book Promo", desc: "999 Campaign" },
  { key: "liveVideo", icon: <Radio className="w-4 h-4" />, label: "Live Video", desc: "Stream & Clip" },
  { key: "ambassadorCrm", icon: <Globe className="w-4 h-4" />, label: "Ambassadors", desc: "36-State Network" },
  { key: "fanHub", icon: <Star className="w-4 h-4" />, label: "Fan Hub", desc: "Inner Circle" },
  { key: "trafficTools", icon: <TrendingUp className="w-4 h-4" />, label: "Traffic Engine", desc: "Drive & Convert" },
  { key: "campaignIntelligence", icon: <Briefcase className="w-4 h-4" />, label: "Intelligence", desc: "Campaign Analytics" },
];

export default function Dashboard() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();

  const { data: profile, isLoading: profileLoading } = useGetMe();
  const { data: tier, isLoading: tierLoading } = useGetMyTier();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: activity, isLoading: activityLoading } = useGetDashboardActivity();

  const tierBadge = TIER_BADGE[profile?.tier || "free"];
  const moduleAccess = tier?.moduleAccess as Record<string, boolean> | undefined;

  const handleSignOut = () => signOut({ redirectUrl: basePath || "/" });

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between h-14">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
              <span className="text-primary-foreground font-black text-xs">AF</span>
            </div>
            <span className="font-bold tracking-tight">Area Fada OS</span>
            {!tierLoading && tierBadge && (
              <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${tierBadge.color}`} data-testid="badge-tier">
                {tierBadge.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Show when="signed-in">
              <span className="text-sm text-muted-foreground hidden sm:block" data-testid="text-user-name">
                {user?.firstName || profile?.displayName || "Fada"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                data-testid="btn-sign-out"
                onClick={handleSignOut}
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </Show>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Welcome */}
        <div className="mb-8">
          {profileLoading ? (
            <Skeleton className="h-8 w-64 mb-2" />
          ) : (
            <h1 className="text-2xl sm:text-3xl font-black mb-1" data-testid="dashboard-heading">
              Good vibes, {profile?.displayName?.split(" ")[0] || user?.firstName || "Fada"} 🔥
            </h1>
          )}
          <p className="text-muted-foreground text-sm">Here's how your creator empire is performing today.</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            icon={<Calendar className="w-4 h-4" />}
            label="Posts Scheduled"
            value={summary?.postsScheduled ?? "—"}
            loading={summaryLoading}
          />
          <StatCard
            icon={<DollarSign className="w-4 h-4" />}
            label="Revenue This Month"
            value={summary ? `$${summary.revenueThisMonth.toLocaleString()}` : "—"}
            loading={summaryLoading}
          />
          <StatCard
            icon={<Briefcase className="w-4 h-4" />}
            label="Brand Deals Active"
            value={summary?.activeBrandDeals ?? "—"}
            loading={summaryLoading}
          />
          <StatCard
            icon={<Users className="w-4 h-4" />}
            label="Ambassadors"
            value={summary?.ambassadorCount ?? "—"}
            sub="36-state network"
            loading={summaryLoading}
          />
          <StatCard
            icon={<Star className="w-4 h-4" />}
            label="Fan Hub Members"
            value={summary?.fanHubMembers ?? "—"}
            loading={summaryLoading}
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            label="Total Reach"
            value={summary ? `${(summary.totalReach / 1000).toFixed(0)}K` : "—"}
            loading={summaryLoading}
          />
          <StatCard
            icon={<Radio className="w-4 h-4" />}
            label="Platforms Connected"
            value={summary?.platformsConnected ?? "—"}
            loading={summaryLoading}
          />
          <StatCard
            icon={<Zap className="w-4 h-4" />}
            label="AI Captions Generated"
            value={summary?.aiCaptionsGenerated ?? "—"}
            loading={summaryLoading}
          />
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Modules */}
          <div className="md:col-span-2">
            <h2 className="font-bold text-sm text-muted-foreground mb-3 uppercase tracking-wider">Your Modules</h2>
            <div className="grid sm:grid-cols-2 gap-3">
              {MODULE_CARDS.map((mod) => {
                const unlocked = moduleAccess?.[mod.key] ?? false;
                return (
                  <div
                    key={mod.key}
                    className={`flex items-center gap-3 p-4 rounded-xl border transition-colors ${
                      unlocked
                        ? "border-border bg-card hover:border-primary/30 cursor-pointer"
                        : "border-border/50 bg-muted/30 opacity-50 cursor-not-allowed"
                    }`}
                    data-testid={`module-${mod.key}`}
                  >
                    <div className={`p-2 rounded-lg ${unlocked ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {mod.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm">{mod.label}</div>
                      <div className="text-xs text-muted-foreground">{mod.desc}</div>
                    </div>
                    {!unlocked && (
                      <Badge variant="outline" className="text-xs shrink-0">Upgrade</Badge>
                    )}
                  </div>
                );
              })}
            </div>

            {tier && (
              <div className="mt-4 p-4 rounded-xl border border-primary/20 bg-primary/5">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm">Upgrade to unlock all modules</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      Current plan: <strong>{tier.tierName}</strong>
                      {tier.monthlyPrice !== null && tier.monthlyPrice !== undefined ? ` — $${tier.monthlyPrice}/mo` : " — Custom pricing"}
                    </div>
                  </div>
                  <Button size="sm" className="shrink-0" data-testid="btn-upgrade">
                    Upgrade
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Activity Feed */}
          <div>
            <h2 className="font-bold text-sm text-muted-foreground mb-3 uppercase tracking-wider">Recent Activity</h2>
            <Card>
              <CardContent className="p-0">
                {activityLoading ? (
                  <div className="p-4 space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="flex gap-3">
                        <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                        <div className="flex-1">
                          <Skeleton className="h-3 w-full mb-1.5" />
                          <Skeleton className="h-3 w-2/3" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : activity && activity.length > 0 ? (
                  <ul className="divide-y divide-border">
                    {activity.slice(0, 8).map((item, i) => (
                      <li key={item.id ?? i} className="flex items-start gap-3 px-4 py-3" data-testid={`activity-item-${item.id ?? i}`}>
                        <div className="text-lg shrink-0 mt-0.5">
                          {ACTIVITY_ICONS[item.type] || "📌"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs leading-relaxed text-foreground">{item.description}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(item.createdAt).toLocaleDateString("en-NG", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="p-6 text-center text-sm text-muted-foreground" data-testid="activity-empty">
                    No activity yet. Start creating!
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
