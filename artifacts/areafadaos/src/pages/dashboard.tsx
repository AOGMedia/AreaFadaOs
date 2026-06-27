import { useUser } from "@clerk/react";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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
  TrendingUp,
  Zap,
} from "lucide-react";

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

function StatCard({
  icon,
  label,
  value,
  sub,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub?: string;
  loading?: boolean;
}) {
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

export default function Dashboard() {
  const { user } = useUser();
  const { data: profile, isLoading: profileLoading } = useGetMe();
  const { data: tier } = useGetMyTier();
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: activity, isLoading: activityLoading } = useGetDashboardActivity();

  return (
    <AppShell title="Dashboard">
      <div className="p-6 max-w-6xl mx-auto">
        {/* Welcome */}
        <div className="mb-7">
          {profileLoading ? (
            <Skeleton className="h-8 w-64 mb-2" />
          ) : (
            <h1
              className="text-2xl sm:text-3xl font-black mb-1"
              data-testid="dashboard-heading"
            >
              Good vibes, {profile?.displayName?.split(" ")[0] || user?.firstName || "Fada"} 🔥
            </h1>
          )}
          <p className="text-muted-foreground text-sm">
            Here's how your creator empire is performing today.
          </p>
          {tier && (
            <Badge
              className="mt-2 bg-primary/10 text-primary border-primary/20"
              data-testid="badge-tier"
            >
              {tier.tierName} Plan
              {tier.monthlyPrice !== null && tier.monthlyPrice !== undefined
                ? ` — $${tier.monthlyPrice}/mo`
                : " — Custom"}
            </Badge>
          )}
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

        {/* Activity Feed */}
        <div>
          <h2 className="font-bold text-sm text-muted-foreground mb-3 uppercase tracking-wider">
            Recent Activity
          </h2>
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
                  {activity.slice(0, 10).map((item, i) => (
                    <li
                      key={item.id ?? i}
                      className="flex items-start gap-3 px-4 py-3"
                      data-testid={`activity-item-${item.id ?? i}`}
                    >
                      <div className="text-lg shrink-0 mt-0.5">
                        {ACTIVITY_ICONS[item.type] || "📌"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs leading-relaxed text-foreground">
                          {item.description}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(item.createdAt).toLocaleDateString("en-NG", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div
                  className="p-6 text-center text-sm text-muted-foreground"
                  data-testid="activity-empty"
                >
                  No activity yet. Start creating!
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
