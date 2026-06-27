import { useLocation } from "wouter";
import { useGetMyTier } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

const TIER_RANK: Record<string, number> = {
  free: 0,
  creator: 1,
  brand: 2,
  agency: 3,
  enterprise: 4,
};

const TIER_PRICES: Record<string, string> = {
  creator: "$49/mo",
  brand: "$199/mo",
  agency: "$499/mo",
  enterprise: "Custom",
};

interface TierGuardProps {
  moduleKey: string;
  requiredTier: "creator" | "brand" | "agency" | "enterprise";
  children: React.ReactNode;
  moduleName?: string;
}

export function TierGuard({ moduleKey, requiredTier, children, moduleName }: TierGuardProps) {
  const [, setLocation] = useLocation();
  const { data: tierInfo, isLoading } = useGetMyTier();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-pulse text-muted-foreground text-sm">Loading...</div>
      </div>
    );
  }

  const moduleAccess = tierInfo?.moduleAccess as Record<string, boolean> | undefined;
  const hasAccess = moduleAccess?.[moduleKey] ?? false;

  if (hasAccess) {
    return <>{children}</>;
  }

  const userRank = TIER_RANK[tierInfo?.tier || "free"] ?? 0;
  const requiredRank = TIER_RANK[requiredTier] ?? 0;

  if (userRank >= requiredRank) {
    return <>{children}</>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center" data-testid="upgrade-prompt">
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
        <Lock className="w-7 h-7 text-primary" />
      </div>
      <h2 className="text-2xl font-black mb-2">
        {moduleName || "This module"} requires {requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)}
      </h2>
      <p className="text-muted-foreground text-sm max-w-sm mb-6 leading-relaxed">
        You're currently on the <strong>{tierInfo?.tierName || "Free"}</strong> plan.
        Upgrade to <strong>{requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)}</strong> ({TIER_PRICES[requiredTier]}) to unlock this module and grow your creator empire.
      </p>
      <div className="flex gap-3">
        <Button
          size="lg"
          data-testid="btn-upgrade-from-guard"
          onClick={() => setLocation("/upgrade")}
        >
          Upgrade to {requiredTier.charAt(0).toUpperCase() + requiredTier.slice(1)} →
        </Button>
        <Button
          variant="outline"
          size="lg"
          onClick={() => setLocation("/dashboard")}
        >
          Back to Dashboard
        </Button>
      </div>
    </div>
  );
}
