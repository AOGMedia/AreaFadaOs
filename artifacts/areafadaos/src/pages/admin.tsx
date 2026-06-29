import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { useGetMyTier } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Shield, Users } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

const TIERS = ["free", "creator", "brand", "agency", "enterprise"] as const;
type Tier = (typeof TIERS)[number];

const TIER_BADGE: Record<string, string> = {
  free: "bg-gray-100 text-gray-600",
  creator: "bg-emerald-100 text-emerald-700",
  brand: "bg-blue-100 text-blue-700",
  agency: "bg-purple-100 text-purple-700",
  enterprise: "bg-amber-100 text-amber-700",
};

interface AdminUser {
  id: number;
  clerkId: string;
  email: string;
  displayName: string;
  tier: string;
  createdAt: string;
}

export function AdminPage() {
  const { data: tierData } = useGetMyTier();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [pendingTiers, setPendingTiers] = useState<Record<number, string>>({});

  const { data: meData } = useQuery<{ id: number }>({
    queryKey: ["users", "me"],
    queryFn: () => apiFetch("/users/me"),
    enabled: tierData?.tier === "enterprise",
  });
  const myId = meData?.id;

  const { data, isLoading, error } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["admin", "users"],
    queryFn: () => apiFetch("/admin/users"),
    enabled: tierData?.tier === "enterprise",
  });

  const patchTier = useMutation({
    mutationFn: ({ id, tier }: { id: number; tier: string }) =>
      apiFetch(`/admin/users/${id}/tier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      }),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
      setPendingTiers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast({ title: "Tier updated", description: "User's plan has been changed." });
    },
    onError: (_err, { id }) => {
      setPendingTiers((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast({ title: "Update failed", description: "Could not change tier. Try again.", variant: "destructive" });
    },
  });

  if (tierData && tierData.tier !== "enterprise") {
    return (
      <AppShell title="Admin">
        <div className="flex flex-col items-center justify-center h-full p-12 text-center">
          <Shield className="w-12 h-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-bold mb-2">Access Restricted</h2>
          <p className="text-muted-foreground">The Admin panel is only available to Enterprise accounts.</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Admin">
      <div className="p-6 max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
            <Shield className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h1 className="text-2xl font-black">Admin Panel</h1>
            <p className="text-sm text-muted-foreground">Manage user accounts and subscription tiers</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4" />
              All Users
              {data && (
                <Badge variant="outline" className="ml-auto text-xs font-normal">
                  {data.users.length} total
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            )}

            {error && (
              <p className="text-sm text-destructive py-4">Failed to load users. Make sure you are signed in as an enterprise account.</p>
            )}

            {data && data.users.length === 0 && (
              <p className="text-sm text-muted-foreground py-4">No users yet. Sign in via Google or email to create a user row.</p>
            )}

            {data && data.users.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Email</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Name</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Tier</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Joined</th>
                      <th className="text-left py-2 px-3 font-medium text-muted-foreground">Change Tier</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.users.map((user) => {
                      const activeTier = pendingTiers[user.id] ?? user.tier;
                      return (
                        <tr key={user.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-3 font-mono text-xs truncate max-w-[200px]">{user.email}</td>
                          <td className="py-3 px-3 text-sm truncate max-w-[140px]">{user.displayName || "—"}</td>
                          <td className="py-3 px-3">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${TIER_BADGE[user.tier] || TIER_BADGE.free}`}>
                              {user.tier}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-xs text-muted-foreground whitespace-nowrap">
                            {new Date(user.createdAt).toLocaleDateString("en-GB", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </td>
                          <td className="py-3 px-3">
                            {user.id === myId ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-block">
                                      <Select value={activeTier} disabled>
                                        <SelectTrigger className="h-7 text-xs w-32 cursor-not-allowed opacity-50">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {TIERS.map((t) => (
                                            <SelectItem key={t} value={t} className="text-xs">
                                              {t.charAt(0).toUpperCase() + t.slice(1)}
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-[200px] text-xs">
                                    You can't change your own tier — ask another enterprise admin to do this.
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <Select
                                value={activeTier}
                                onValueChange={(tier) => {
                                  if (tier === user.tier) return;
                                  setPendingTiers((prev) => ({ ...prev, [user.id]: tier }));
                                  patchTier.mutate({ id: user.id, tier });
                                }}
                                disabled={patchTier.isPending && pendingTiers[user.id] !== undefined}
                              >
                                <SelectTrigger className="h-7 text-xs w-32">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {TIERS.map((t) => (
                                    <SelectItem key={t} value={t} className="text-xs">
                                      {t.charAt(0).toUpperCase() + t.slice(1)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="mt-4 text-xs text-muted-foreground">
          To create a Clerk webhook so sign-ins auto-sync to the database, add a webhook at{" "}
          <code className="bg-muted px-1 rounded">dashboard.clerk.com → Webhooks → Add Endpoint</code>{" "}
          with events <code className="bg-muted px-1 rounded">user.created</code> and{" "}
          <code className="bg-muted px-1 rounded">session.created</code>, then set the{" "}
          <code className="bg-muted px-1 rounded">CLERK_WEBHOOK_SECRET</code> environment variable.
        </p>

        <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
          <p className="font-semibold mb-1">Bootstrap promote — force-upgrade any account by email</p>
          <p className="mb-2 text-amber-700">
            If a user row was created before enterprise auto-upgrade was active, use this one-off{" "}
            <code className="bg-amber-100 px-1 rounded">curl</code> command to fix it immediately.
            First set <code className="bg-amber-100 px-1 rounded">ADMIN_SECRET</code> as a Replit
            secret (Secrets tab in the workspace toolbar), then run:
          </p>
          <pre className="bg-amber-100 rounded p-2 overflow-x-auto text-[10px] leading-relaxed whitespace-pre-wrap break-all">
{`curl -X PATCH https://<your-replit-domain>/api/admin/promote \\
  -H "Content-Type: application/json" \\
  -H "x-admin-secret: <ADMIN_SECRET>" \\
  -d '{"email":"osejialexander77@gmail.com","tier":"enterprise"}'`}
          </pre>
          <p className="mt-1 text-amber-600">
            The endpoint returns <code className="bg-amber-100 px-1 rounded">501</code> if{" "}
            <code className="bg-amber-100 px-1 rounded">ADMIN_SECRET</code> is not set, and{" "}
            <code className="bg-amber-100 px-1 rounded">401</code> if the secret is wrong.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
