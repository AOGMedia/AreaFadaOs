import { AppShell } from "@/components/AppShell";
import { TierGuard } from "@/components/TierGuard";

interface ModulePageProps {
  title: string;
  description: string;
  icon: string;
  moduleKey: string;
  requiredTier: "creator" | "brand" | "agency" | "enterprise";
  comingSoon?: boolean;
}

function ComingSoonContent({ title, description, icon }: { title: string; description: string; icon: string }) {
  return (
    <div className="p-8">
      <div className="max-w-lg">
        <div className="text-4xl mb-4">{icon}</div>
        <h1 className="text-3xl font-black mb-2">{title}</h1>
        <p className="text-muted-foreground leading-relaxed mb-6">{description}</p>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Module coming soon — building now
        </div>
      </div>
    </div>
  );
}

export function createModulePage({
  title,
  description,
  icon,
  moduleKey,
  requiredTier,
}: ModulePageProps) {
  return function ModulePage() {
    return (
      <AppShell title={title}>
        <TierGuard moduleKey={moduleKey} requiredTier={requiredTier} moduleName={title}>
          <ComingSoonContent title={title} description={description} icon={icon} />
        </TierGuard>
      </AppShell>
    );
  };
}
