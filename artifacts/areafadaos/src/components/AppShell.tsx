import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk, Show } from "@clerk/react";
import {
  LayoutDashboard,
  Calendar,
  DollarSign,
  BookOpen,
  Radio,
  Scissors,
  TrendingUp,
  Users,
  Star,
  BarChart3,
  LineChart,
  LogOut,
  Menu,
  X,
  ChevronRight,
  Send,
  Globe,
  Shield,
  SlidersHorizontal,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useGetMyTier } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface NavItem {
  label: string;
  path: string;
  icon: React.ReactNode;
  moduleKey: string | null;
  requiredTier?: string;
  enterpriseOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", path: "/dashboard", icon: <LayoutDashboard className="w-4 h-4" />, moduleKey: null },
  { label: "Scheduling", path: "/scheduling", icon: <Calendar className="w-4 h-4" />, moduleKey: "scheduling" },
  { label: "Analytics", path: "/analytics", icon: <LineChart className="w-4 h-4" />, moduleKey: "analytics", requiredTier: "creator" },
  { label: "Monetization", path: "/monetization", icon: <DollarSign className="w-4 h-4" />, moduleKey: "monetization", requiredTier: "creator" },
  { label: "Book Promo", path: "/book-promo", icon: <BookOpen className="w-4 h-4" />, moduleKey: "bookPromo", requiredTier: "creator" },
  { label: "Live Video", path: "/live-video", icon: <Radio className="w-4 h-4" />, moduleKey: "liveVideo", requiredTier: "brand" },
  { label: "Clip Engine", path: "/clip-engine", icon: <Scissors className="w-4 h-4" />, moduleKey: "clipEngine", requiredTier: "brand" },
  { label: "Auto-Post", path: "/auto-post", icon: <Send className="w-4 h-4" />, moduleKey: "autoPost", requiredTier: "brand" },
  { label: "Traffic Engine", path: "/traffic", icon: <TrendingUp className="w-4 h-4" />, moduleKey: "trafficTools", requiredTier: "brand" },
  { label: "Support Inbox", path: "/support", icon: <MessageSquare className="w-4 h-4" />, moduleKey: "customerSupport", requiredTier: "creator" },
  { label: "Ambassadors", path: "/ambassadors", icon: <Users className="w-4 h-4" />, moduleKey: "ambassadorCrm", requiredTier: "agency" },
  { label: "Fan Hub", path: "/fan-hub", icon: <Star className="w-4 h-4" />, moduleKey: "fanHub", requiredTier: "agency" },
  { label: "Intelligence", path: "/intelligence", icon: <BarChart3 className="w-4 h-4" />, moduleKey: "campaignIntelligence", requiredTier: "enterprise" },
  { label: "Media Partners", path: "/media-partners", icon: <Globe className="w-4 h-4" />, moduleKey: "ambassadorCrm", requiredTier: "agency" },
  { label: "Admin", path: "/admin", icon: <Shield className="w-4 h-4" />, moduleKey: null, requiredTier: "enterprise", enterpriseOnly: true },
  { label: "Settings", path: "/settings", icon: <SlidersHorizontal className="w-4 h-4" />, moduleKey: null },
];

const TIER_BADGE: Record<string, string> = {
  free: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  creator: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  brand: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  agency: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
  enterprise: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
};

function SidebarContent({ onClose }: { onClose?: () => void }) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [location] = useLocation();
  const { data: tier } = useGetMyTier();
  const moduleAccess = tier?.moduleAccess as Record<string, boolean> | undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center shrink-0">
            <span className="text-primary-foreground font-black text-xs">AF</span>
          </div>
          <span className="font-bold tracking-tight text-sm">Area Fada OS</span>
        </div>
        {onClose && (
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Close menu">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tier badge */}
      {tier && (
        <div className="px-3 pt-3">
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold w-full justify-center ${TIER_BADGE[tier.tier] || TIER_BADGE.free}`}
            data-testid="sidebar-tier-badge"
          >
            {tier.tierName} Plan
          </span>
        </div>
      )}

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5" data-testid="sidebar-nav">
        {NAV_ITEMS.filter((item) => !item.enterpriseOnly || tier?.tier === "enterprise").map((item) => {
          const unlocked = item.moduleKey === null || (moduleAccess?.[item.moduleKey as string] ?? false);
          const isActive = location === item.path;

          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={onClose}
              data-testid={`nav-link-${item.path.replace("/", "")}`}
            >
              <div
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : unlocked
                    ? "text-foreground hover:bg-muted"
                    : "text-muted-foreground hover:bg-muted/50"
                }`}
              >
                <span className={isActive ? "text-primary" : unlocked ? "text-foreground" : "text-muted-foreground"}>
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {!unlocked && (
                  <Badge variant="outline" className="text-xs px-1.5 py-0.5 h-auto">
                    {item.requiredTier}
                  </Badge>
                )}
                {isActive && <ChevronRight className="w-3 h-3 text-primary shrink-0" />}
              </div>
            </Link>
          );
        })}
      </nav>

      {/* User footer */}
      <div className="border-t border-border px-3 py-3">
        <Show when="signed-in">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-primary font-bold text-xs">
                {(user?.firstName || "F")[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" data-testid="sidebar-user-name">
                {user?.firstName || "Fada"}
              </div>
              <div className="text-xs text-muted-foreground truncate">{user?.primaryEmailAddress?.emailAddress}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            data-testid="btn-sign-out"
            onClick={() => signOut({ redirectUrl: basePath || "/" })}
          >
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </Show>
      </div>
    </div>
  );
}

interface AppShellProps {
  children: React.ReactNode;
  title?: string;
}

export function AppShell({ children, title }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-border bg-sidebar">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden
          />
          <aside className="relative flex flex-col w-64 bg-sidebar border-r border-border h-full">
            <SidebarContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border bg-background">
          <button
            className="p-1.5 rounded-lg hover:bg-muted"
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            data-testid="btn-mobile-menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          {title && <h1 className="font-bold text-base">{title}</h1>}
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
