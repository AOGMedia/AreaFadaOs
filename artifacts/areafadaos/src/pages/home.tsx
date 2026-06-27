import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const stats = [
  { label: "Creator Revenue", value: "$2.4M+" },
  { label: "Active Creators", value: "1,200+" },
  { label: "Brand Deals Closed", value: "4,800+" },
  { label: "Platforms Supported", value: "8+" },
];

const tiers = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    description: "Get started with basic scheduling",
    features: ["1 platform", "10 posts/month", "Basic scheduling"],
    cta: "Get Started",
    highlight: false,
  },
  {
    name: "Creator",
    price: "$49",
    period: "/mo",
    description: "For solo creators ready to monetize",
    features: ["Multi-platform scheduling", "Monetization dashboard", "AI captions", "Book Promo module", "Auto-Post"],
    cta: "Start Creating",
    highlight: false,
  },
  {
    name: "Brand",
    price: "$199",
    period: "/mo",
    description: "For brands and content studios",
    features: ["Everything in Creator", "Full analytics", "Live Video module", "Clip Engine", "Traffic tools"],
    cta: "Go Brand",
    highlight: true,
  },
  {
    name: "Agency",
    price: "$499",
    period: "/mo",
    description: "For agencies managing multiple creators",
    features: ["Everything in Brand", "Ambassador CRM", "Fan Hub", "36-state network", "10 client seats"],
    cta: "Scale Agency",
    highlight: false,
  },
];

export default function Home() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-black text-sm">AF</span>
          </div>
          <span className="font-bold text-lg tracking-tight">Area Fada OS</span>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            data-testid="btn-sign-in"
            onClick={() => setLocation("/sign-in")}
          >
            Sign In
          </Button>
          <Button
            data-testid="btn-get-started"
            onClick={() => setLocation("/sign-up")}
          >
            Get Started
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6 text-center">
        <Badge className="mb-6 bg-primary/10 text-primary border-primary/20 hover:bg-primary/20" data-testid="badge-tagline">
          The Creator Economy Just Got Serious
        </Badge>
        <h1 className="text-5xl md:text-7xl font-black tracking-tighter mb-6 leading-none" data-testid="hero-headline">
          Your Social Media
          <br />
          <span className="text-primary">Monetization Engine</span>
        </h1>
        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed" data-testid="hero-subtitle">
          Powered by Charly Boy's 40+ years of brand building. Schedule, monetize, and grow
          across every platform — with AI, automation, and an army of ambassadors behind you.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            size="lg"
            className="text-base px-8 py-6 font-bold"
            data-testid="btn-hero-cta"
            onClick={() => setLocation("/sign-up")}
          >
            Start Your OS →
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="text-base px-8 py-6"
            data-testid="btn-hero-secondary"
            onClick={() => setLocation("/sign-in")}
          >
            Sign In
          </Button>
        </div>
      </section>

      {/* Stats */}
      <section className="py-14 px-6 border-y border-border bg-muted/30">
        <div className="max-w-4xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s) => (
            <div key={s.label} className="text-center" data-testid={`stat-${s.label.toLowerCase().replace(/ /g, "-")}`}>
              <div className="text-3xl font-black text-primary mb-1">{s.value}</div>
              <div className="text-sm text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Modules */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-4xl font-black text-center mb-4 tracking-tight">Everything You Need to Win</h2>
          <p className="text-muted-foreground text-center mb-14 max-w-xl mx-auto">
            7 powerful modules built for African creators, brands, and agencies ready to dominate.
          </p>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { icon: "📅", title: "Auto-Post & Scheduling", desc: "Schedule across IG, TikTok, X, YouTube, Facebook simultaneously with AI-suggested best times." },
              { icon: "💰", title: "Monetization Hub", desc: "Paystack invoicing, brand deal tracking, revenue analytics — all in one dashboard." },
              { icon: "📖", title: "Book Promo Engine", desc: "Dedicated campaigns for the '999' book and future releases — promo links, tracking, conversions." },
              { icon: "🎬", title: "Live Video & Clip Engine", desc: "Stream, record, and auto-clip highlights into shareable TikTok/IG Reels in one click." },
              { icon: "🌍", title: "Traffic Generator", desc: "36-state ambassador network driving real traffic to your content and products." },
              { icon: "⭐", title: "Fan Hub", desc: "Verify buyers, reward superfans, build a paid community — Charly Boy's inner circle." },
              { icon: "📊", title: "Campaign Intelligence", desc: "Sentiment analysis, trend radar, and political campaign mode for enterprise clients." },
            ].map((m) => (
              <div
                key={m.title}
                className="p-5 rounded-xl border border-border bg-card hover:border-primary/30 transition-colors"
                data-testid={`module-card-${m.title.toLowerCase().replace(/ /g, "-")}`}
              >
                <div className="text-2xl mb-3">{m.icon}</div>
                <h3 className="font-bold text-sm mb-1">{m.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{m.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-20 px-6 bg-muted/30 border-t border-border">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-4xl font-black text-center mb-4 tracking-tight">Pick Your Power Level</h2>
          <p className="text-muted-foreground text-center mb-14">Start free. Scale when you're ready.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {tiers.map((t) => (
              <div
                key={t.name}
                className={`rounded-xl border p-6 flex flex-col ${t.highlight ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card"}`}
                data-testid={`pricing-tier-${t.name.toLowerCase()}`}
              >
                {t.highlight && (
                  <Badge className="self-start mb-3 bg-primary text-primary-foreground text-xs">Most Popular</Badge>
                )}
                <div className="font-bold text-sm text-muted-foreground mb-1">{t.name}</div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-3xl font-black">{t.price}</span>
                  <span className="text-sm text-muted-foreground">{t.period}</span>
                </div>
                <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{t.description}</p>
                <ul className="space-y-2 mb-6 flex-1">
                  {t.features.map((f) => (
                    <li key={f} className="text-xs flex items-start gap-2">
                      <span className="text-primary mt-0.5">✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={t.highlight ? "default" : "outline"}
                  className="w-full text-sm"
                  data-testid={`pricing-cta-${t.name.toLowerCase()}`}
                  onClick={() => setLocation("/sign-up")}
                >
                  {t.cta}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-10 px-6 border-t border-border text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center gap-2 mb-3">
          <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-black text-xs">AF</span>
          </div>
          <span className="font-bold">Area Fada OS</span>
        </div>
        <p>© 2026 Area Fada OS. Powered by Charly Boy. Built for Africa's creators.</p>
      </footer>
    </div>
  );
}
