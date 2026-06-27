import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Radio, Bell, CheckCircle, Calendar, Users } from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...opts });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

interface LiveSession {
  id: number; title: string; description?: string; scheduledAt: string;
  status: string; platforms: string[]; totalViewers: number;
}

const PLATFORM_ICONS: Record<string, string> = {
  instagram: "📸", youtube: "▶️", facebook: "👤", x: "𝕏", tiktok: "🎵",
};

const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram Live", youtube: "YouTube Live", facebook: "Facebook Live", x: "X Spaces",
};

interface Props {
  sessionId: number;
}

export function LiveSessionSignupPage({ sessionId }: Props) {
  const { toast } = useToast();
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    fanName: "",
    fanEmail: "",
    fanPhone: "",
    channel: "email" as "email" | "whatsapp",
  });

  const { data: session, isLoading, error } = useQuery<LiveSession>({
    queryKey: ["public-live-session", sessionId],
    queryFn: () => apiFetch(`/live-sessions/${sessionId}/public`),
    retry: false,
  });

  const register = useMutation({
    mutationFn: (body: object) =>
      apiFetch(`/live-sessions/${sessionId}/reminders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: () => setDone(true),
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const liveDate = session ? new Date(session.scheduledAt) : null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Radio className="w-10 h-10 mx-auto mb-3 animate-pulse text-primary" />
          <p className="text-muted-foreground text-sm">Loading session…</p>
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm p-6">
          <p className="text-2xl mb-2">😕</p>
          <h2 className="font-bold text-lg mb-2">Session not found</h2>
          <p className="text-muted-foreground text-sm">This live session link may have expired or been removed.</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-sm p-6">
          <CheckCircle className="w-16 h-16 mx-auto mb-4 text-emerald-500" />
          <h2 className="font-black text-2xl mb-2">You're on the list!</h2>
          <p className="text-muted-foreground leading-relaxed">
            We'll send you a reminder 1 hour before <strong>"{session.title}"</strong> goes live.
            Don't miss it — this is going to be something special. 🔴
          </p>
          <div className="mt-6 p-4 rounded-xl bg-primary/10 border border-primary/20">
            <p className="text-sm font-semibold text-primary">
              📅 {liveDate?.toLocaleDateString("en-NG", { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          <p className="text-xs text-muted-foreground mt-4">— Powered by Area Fada OS</p>
        </div>
      </div>
    );
  }

  const platformsArr = session.platforms as string[];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <div className="bg-gradient-to-br from-red-600 to-red-800 text-white px-6 py-10 text-center">
        <div className="inline-flex items-center gap-2 bg-white/20 rounded-full px-3 py-1 text-xs font-semibold mb-4">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          COMING LIVE
        </div>
        <h1 className="text-2xl md:text-3xl font-black leading-tight mb-2">{session.title}</h1>
        {session.description && (
          <p className="text-red-100 text-sm leading-relaxed max-w-md mx-auto mb-4">{session.description}</p>
        )}
        {liveDate && (
          <div className="inline-flex items-center gap-2 bg-white/20 rounded-xl px-4 py-2 text-sm font-semibold">
            <Calendar className="w-4 h-4" />
            {liveDate.toLocaleDateString("en-NG", { weekday: "long", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
        <div className="flex justify-center gap-3 mt-4">
          {platformsArr.map(p => (
            <div key={p} className="flex items-center gap-1.5 bg-white/20 rounded-lg px-2.5 py-1 text-xs font-medium">
              {PLATFORM_ICONS[p]} {PLATFORM_LABELS[p] ?? p}
            </div>
          ))}
        </div>
      </div>

      {/* Sign-up form */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-5">
              <Bell className="w-6 h-6 text-primary shrink-0" />
              <div>
                <h2 className="font-bold text-lg">Get Reminded</h2>
                <p className="text-sm text-muted-foreground">We'll notify you 1 hour before we go live</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="fanName">Your Name <span className="text-red-500">*</span></Label>
                <Input
                  id="fanName"
                  placeholder="e.g. Nkechi Okafor"
                  value={form.fanName}
                  onChange={e => setForm(f => ({ ...f, fanName: e.target.value }))}
                />
              </div>

              <div>
                <Label className="mb-2 block">Remind me via</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${form.channel === "email" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                    onClick={() => setForm(f => ({ ...f, channel: "email" }))}
                  >
                    📧 Email
                  </button>
                  <button
                    type="button"
                    className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${form.channel === "whatsapp" ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                    onClick={() => setForm(f => ({ ...f, channel: "whatsapp" }))}
                  >
                    💬 WhatsApp
                  </button>
                </div>
              </div>

              {form.channel === "email" ? (
                <div>
                  <Label htmlFor="fanEmail">Email Address <span className="text-red-500">*</span></Label>
                  <Input
                    id="fanEmail"
                    type="email"
                    placeholder="you@example.com"
                    value={form.fanEmail}
                    onChange={e => setForm(f => ({ ...f, fanEmail: e.target.value }))}
                  />
                </div>
              ) : (
                <div>
                  <Label htmlFor="fanPhone">WhatsApp Number <span className="text-red-500">*</span></Label>
                  <Input
                    id="fanPhone"
                    type="tel"
                    placeholder="+234 801 234 5678"
                    value={form.fanPhone}
                    onChange={e => setForm(f => ({ ...f, fanPhone: e.target.value }))}
                  />
                </div>
              )}

              <Button
                className="w-full"
                size="lg"
                disabled={!form.fanName || (form.channel === "email" ? !form.fanEmail : !form.fanPhone) || register.isPending}
                onClick={() => register.mutate({
                  fanName: form.fanName,
                  fanEmail: form.channel === "email" ? form.fanEmail : undefined,
                  fanPhone: form.channel === "whatsapp" ? form.fanPhone : undefined,
                  channel: form.channel,
                })}
              >
                {register.isPending ? "Registering…" : "🔔 Remind Me!"}
              </Button>

              <div className="flex items-center gap-2 text-xs text-muted-foreground justify-center">
                <Users className="w-3.5 h-3.5" />
                <span>Join hundreds of fans already signed up</span>
              </div>
            </div>

            <div className="mt-5 pt-4 border-t text-center">
              <p className="text-xs text-muted-foreground">
                Your info is only used to send this one reminder. No spam, ever.
              </p>
              <p className="text-xs text-muted-foreground mt-1">— Powered by <strong>Area Fada OS</strong></p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
