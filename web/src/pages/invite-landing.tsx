import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, XCircle, Globe, Users, Zap, BarChart3, Shield } from "lucide-react";

const PARTNER_BENEFITS: Record<string, { title: string; desc: string; icon: React.ReactNode; perks: string[] }> = {
  creator_partner: {
    title: "Creator Partner", desc: "Join Africa's leading creator OS and grow your reach across every platform.",
    icon: <Users className="w-7 h-7 text-emerald-500" />,
    perks: ["Multi-platform scheduling", "AI caption generation", "Revenue analytics", "Brand deal manager", "Priority onboarding support"],
  },
  brand_partner: {
    title: "Brand Partner", desc: "Connect with top Nigerian and African creators for authentic campaigns.",
    icon: <Zap className="w-7 h-7 text-blue-500" />,
    perks: ["Creator discovery", "Campaign ROI tracking", "Branded analytics reports", "Direct deal management", "Dedicated account manager"],
  },
  agency_reseller: {
    title: "Agency Reseller", desc: "White-label AreaFada OS for your clients and unlock agency revenue share.",
    icon: <Globe className="w-7 h-7 text-purple-500" />,
    perks: ["White-label platform", "Client workspaces", "Revenue share programme", "Agency dashboard", "Priority SLA support"],
  },
  media_house: {
    title: "Media House Partner", desc: "Power your editorial and broadcast workflows with our creator data API.",
    icon: <BarChart3 className="w-7 h-7 text-amber-500" />,
    perks: ["Full API access", "Real-time creator data", "Co-marketing opportunities", "Broadcast integrations", "Enterprise SLA & support"],
  },
  political_campaign: {
    title: "Political Campaign Partner", desc: "Real-time voter sentiment, LGA political maps, and crisis alert intelligence.",
    icon: <Shield className="w-7 h-7 text-red-500" />,
    perks: ["LGA-level political map", "Voter sentiment tracking", "Crisis auto-detection", "Competitor monitoring", "Campaign ROI attribution"],
  },
};

interface InviteData {
  orgName: string;
  contactName: string;
  partnerType: string;
  partnerTypeLabel: string;
  tierPreset: string;
  expiresAt: string;
  token: string;
}

const apiBase = import.meta.env.BASE_URL.replace(/\/$/, "");

export function InviteLandingPage() {
  const { token } = useParams<{ token: string }>();
  const [, navigate] = useLocation();
  const [invite, setInvite] = useState<InviteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setError("Invalid invite link."); setLoading(false); return; }
    fetch(`${apiBase}/api/partner-invites/public/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d.error ?? "Invalid or expired invite");
        }
        return r.json();
      })
      .then((data) => { setInvite(data); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 to-gray-900">
        <div className="text-white text-lg animate-pulse">Loading your invite…</div>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-950 to-gray-900 p-6">
        <Card className="max-w-md w-full bg-gray-900 border-gray-800 text-white">
          <CardHeader className="text-center">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <CardTitle className="text-red-400">Invite Unavailable</CardTitle>
          </CardHeader>
          <CardContent className="text-center text-gray-400 space-y-4">
            <p>{error ?? "This invite link is no longer valid."}</p>
            <Button onClick={() => navigate("/sign-up")} className="w-full bg-emerald-600 hover:bg-emerald-700">
              Create an Account Anyway
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const benefits = PARTNER_BENEFITS[invite.partnerType] ?? PARTNER_BENEFITS["creator_partner"];
  const expiryDate = new Date(invite.expiresAt);
  const daysLeft = Math.max(0, Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-emerald-950">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-emerald-900/40 text-emerald-400 border border-emerald-700/50 rounded-full px-4 py-1.5 text-sm font-medium mb-6">
            <CheckCircle2 className="w-4 h-4" /> Personal Invite
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">
            Welcome, <span className="text-emerald-400">{invite.orgName}</span>
          </h1>
          <p className="text-gray-400 text-lg">
            {invite.contactName}, you've been personally invited to join AreaFada OS
            as a <span className="text-white font-semibold">{invite.partnerTypeLabel}</span>.
          </p>
          {daysLeft > 0 && (
            <div className="inline-flex items-center gap-1.5 text-amber-400 text-sm mt-3">
              <Clock className="w-4 h-4" />
              This invite expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
            </div>
          )}
        </div>

        {/* Partner Type Card */}
        <Card className="bg-gray-900/80 border-gray-700 text-white mb-6">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-800 rounded-xl">{benefits.icon}</div>
              <div>
                <CardTitle className="text-xl">{benefits.title}</CardTitle>
                <p className="text-gray-400 text-sm mt-0.5">{benefits.desc}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-gray-400 text-sm mb-4 font-medium uppercase tracking-wide">What's included</p>
            <ul className="space-y-2">
              {benefits.perks.map((perk) => (
                <li key={perk} className="flex items-center gap-2 text-gray-300">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  {perk}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* About AreaFada OS */}
        <Card className="bg-gray-900/60 border-gray-800 text-white mb-8">
          <CardContent className="pt-6">
            <p className="text-gray-400 text-sm leading-relaxed">
              <span className="text-white font-semibold">AreaFada OS</span> is the all-in-one social media
              management platform built for Nigerian and African creators, brands, and agencies.
              Schedule content, generate AI captions, manage brand deals, track live video, and access
              enterprise-grade campaign intelligence — all in one place.
            </p>
          </CardContent>
        </Card>

        {/* CTA */}
        <div className="text-center space-y-3">
          <Button
            size="lg"
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-base py-6"
            onClick={() => {
              localStorage.setItem("partnerInviteToken", invite.token);
              localStorage.setItem("partnerInviteTier", invite.tierPreset);
              navigate("/sign-up");
            }}
          >
            Accept Invite & Create Your Account
          </Button>
          <p className="text-gray-500 text-sm">
            By signing up you agree to the{" "}
            <a href="https://areafada.com/terms" className="text-emerald-500 hover:underline">Terms of Service</a>{" "}
            and{" "}
            <a href="https://areafada.com/privacy" className="text-emerald-500 hover:underline">Privacy Policy</a>.
          </p>
          <Badge variant="secondary" className="bg-gray-800 text-gray-400 text-xs">
            Pre-configured as {invite.tierPreset} tier
          </Badge>
        </div>
      </div>
    </div>
  );
}
