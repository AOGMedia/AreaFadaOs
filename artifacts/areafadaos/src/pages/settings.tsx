import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  Circle,
  Eye,
  EyeOff,
  ExternalLink,
  Settings,
  Trash2,
  Save,
  Info,
  Radio,
  Youtube,
} from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", ...opts });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

interface CredentialStatus {
  appId: string | null;
  hasSecret: boolean;
}

interface CredentialsResponse {
  credentials: Record<string, CredentialStatus>;
}

interface LiveApiKeyStatus {
  configured: boolean;
  envOverride: boolean;
}

interface LiveApiKeysResponse {
  youtube: LiveApiKeyStatus;
  instagram: LiveApiKeyStatus;
  restream: LiveApiKeyStatus;
}

const PLATFORM_CONFIG = [
  {
    key: "instagram",
    label: "Instagram",
    color: "from-pink-500 to-purple-600",
    textColor: "text-pink-600",
    bgColor: "bg-pink-50",
    borderColor: "border-pink-200",
    docsUrl: "https://developers.facebook.com/apps/",
    appIdLabel: "App ID",
    appSecretLabel: "App Secret",
    hint: "Create a Facebook App at developers.facebook.com and add the Instagram Graph API product.",
    callbackPlatform: "instagram",
  },
  {
    key: "facebook",
    label: "Facebook",
    color: "from-blue-600 to-blue-700",
    textColor: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
    docsUrl: "https://developers.facebook.com/apps/",
    appIdLabel: "App ID",
    appSecretLabel: "App Secret",
    hint: "Same Facebook App as Instagram — add the Facebook Login product for Pages.",
    callbackPlatform: "facebook",
  },
  {
    key: "x",
    label: "X (Twitter)",
    color: "from-gray-800 to-black",
    textColor: "text-gray-800",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    docsUrl: "https://developer.twitter.com/en/portal/dashboard",
    appIdLabel: "Client ID",
    appSecretLabel: "Client Secret",
    hint: "Create a project + app on developer.twitter.com. Enable OAuth 2.0 under User Auth Settings.",
    callbackPlatform: "x",
  },
  {
    key: "tiktok",
    label: "TikTok",
    color: "from-gray-900 to-red-500",
    textColor: "text-gray-900",
    bgColor: "bg-gray-50",
    borderColor: "border-gray-200",
    docsUrl: "https://developers.tiktok.com/",
    appIdLabel: "Client Key",
    appSecretLabel: "Client Secret",
    hint: "Create an app on developers.tiktok.com and add the Login Kit product.",
    callbackPlatform: "tiktok",
  },
] as const;

function PlatformCredentialCard({
  platform,
  status,
  onSave,
  onClear,
  isSaving,
  isClearing,
}: {
  platform: typeof PLATFORM_CONFIG[number];
  status: CredentialStatus | undefined;
  onSave: (appId: string, appSecret: string) => void;
  onClear: () => void;
  isSaving: boolean;
  isClearing: boolean;
}) {
  const [appId, setAppId] = useState(status?.appId ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const isConfigured = !!(status?.appId && status?.hasSecret);
  const hasPartial = !!(status?.appId || status?.hasSecret);

  const callbackUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/oauth/${platform.callbackPlatform}/callback`;

  return (
    <Card className={`border ${isConfigured ? "border-emerald-200 bg-emerald-50/30" : hasPartial ? "border-amber-200 bg-amber-50/30" : "border-border"}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${platform.color} flex items-center justify-center`}>
              <span className="text-white font-bold text-xs">{platform.label[0]}</span>
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">{platform.label}</CardTitle>
              <div className="flex items-center gap-1.5 mt-0.5">
                {isConfigured ? (
                  <>
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    <span className="text-xs text-emerald-600 font-medium">Configured</span>
                  </>
                ) : hasPartial ? (
                  <>
                    <Circle className="w-3 h-3 text-amber-500" />
                    <span className="text-xs text-amber-600 font-medium">Incomplete</span>
                  </>
                ) : (
                  <>
                    <Circle className="w-3 h-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">Not configured</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <a
            href={platform.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            Docs <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs ${platform.bgColor} ${platform.borderColor} border`}>
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-muted-foreground" />
          <span className="text-muted-foreground leading-relaxed">{platform.hint}</span>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">{platform.appIdLabel}</Label>
          <Input
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            placeholder={`Enter your ${platform.appIdLabel}`}
            className="h-8 text-sm font-mono"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-medium">
            {platform.appSecretLabel}
            {status?.hasSecret && (
              <Badge variant="outline" className="ml-2 text-[10px] py-0 h-4 text-emerald-600 border-emerald-300">
                saved
              </Badge>
            )}
          </Label>
          <div className="relative">
            <Input
              type={showSecret ? "text" : "password"}
              value={appSecret}
              onChange={(e) => setAppSecret(e.target.value)}
              placeholder={status?.hasSecret ? "Leave blank to keep existing secret" : `Enter your ${platform.appSecretLabel}`}
              className="h-8 text-sm font-mono pr-9"
            />
            <button
              type="button"
              onClick={() => setShowSecret((v) => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Callback URL to register in developer portal</Label>
          <div className="flex items-center gap-2 p-2 rounded-md bg-muted border border-border">
            <code className="text-xs text-foreground break-all flex-1">{callbackUrl}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(callbackUrl)}
              className="text-xs text-muted-foreground hover:text-foreground shrink-0 px-1.5 py-0.5 rounded hover:bg-background transition-colors"
            >
              Copy
            </button>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <Button
            size="sm"
            className="flex-1 h-8 text-xs"
            onClick={() => onSave(appId, appSecret)}
            disabled={isSaving || (!appId && !appSecret)}
          >
            <Save className="w-3 h-3 mr-1.5" />
            {isSaving ? "Saving…" : "Save credentials"}
          </Button>
          {hasPartial && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs text-destructive hover:text-destructive"
              onClick={onClear}
              disabled={isClearing}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LiveApiKeysCard({
  data,
  onSave,
  onClear,
  isSaving,
  isClearing,
}: {
  data: LiveApiKeysResponse | undefined;
  onSave: (youtubeApiKey?: string, instagramAccessToken?: string, restreamApiKey?: string) => void;
  onClear: (key: "youtube" | "instagram" | "restream") => void;
  isSaving: boolean;
  isClearing: string | null;
}) {
  const [youtubeApiKey, setYoutubeApiKey] = useState("");
  const [instagramAccessToken, setInstagramAccessToken] = useState("");
  const [restreamApiKey, setRestreamApiKey] = useState("");
  const [showYt, setShowYt] = useState(false);
  const [showIg, setShowIg] = useState(false);
  const [showRst, setShowRst] = useState(false);

  const ytStatus = data?.youtube;
  const igStatus = data?.instagram;
  const rstStatus = data?.restream;

  return (
    <Card className="border-red-200 bg-red-50/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
            <Radio className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Live Viewer API Keys</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Required for real-time viewer counts during live sessions (polled every 15 s)
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs bg-blue-50 border border-blue-200`}>
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
          <span className="text-blue-700 leading-relaxed">
            Keys are encrypted before storage and never sent back to the browser.
            Without them, the live panel shows last-known stored counts instead of real-time numbers.
          </span>
        </div>

        {/* YouTube API Key */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <Youtube className="w-3.5 h-3.5 text-red-500" /> YouTube Data API Key
              {ytStatus?.envOverride && (
                <Badge variant="outline" className="text-[10px] py-0 h-4 text-blue-600 border-blue-300 ml-1">env override</Badge>
              )}
              {!ytStatus?.envOverride && ytStatus?.configured && (
                <Badge variant="outline" className="text-[10px] py-0 h-4 text-emerald-600 border-emerald-300 ml-1">saved</Badge>
              )}
            </Label>
            {ytStatus?.configured && !ytStatus?.envOverride && (
              <button
                type="button"
                className="text-[11px] text-destructive hover:underline flex items-center gap-0.5"
                onClick={() => onClear("youtube")}
                disabled={isClearing === "youtube"}
              >
                <Trash2 className="w-3 h-3" /> {isClearing === "youtube" ? "Clearing…" : "Clear"}
              </button>
            )}
          </div>
          <div className="relative">
            <Input
              type={showYt ? "text" : "password"}
              value={youtubeApiKey}
              onChange={e => setYoutubeApiKey(e.target.value)}
              placeholder={ytStatus?.configured || ytStatus?.envOverride ? "Leave blank to keep existing key" : "AIza…"}
              className="h-8 text-sm font-mono pr-9"
              disabled={!!ytStatus?.envOverride}
            />
            <button
              type="button"
              onClick={() => setShowYt(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showYt ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          {ytStatus?.envOverride && (
            <p className="text-[11px] text-blue-600">Set via server environment variable — to override, clear the env var first.</p>
          )}
          {!ytStatus?.envOverride && (
            <p className="text-[11px] text-muted-foreground">
              Get a key at{" "}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="underline">
                console.cloud.google.com
              </a>{" "}
              → APIs &amp; Services → Credentials. Enable the YouTube Data API v3.
            </p>
          )}
        </div>

        {/* Instagram Access Token */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <span className="text-[13px]">📸</span> Instagram Graph API Access Token
              {igStatus?.envOverride && (
                <Badge variant="outline" className="text-[10px] py-0 h-4 text-blue-600 border-blue-300 ml-1">env override</Badge>
              )}
              {!igStatus?.envOverride && igStatus?.configured && (
                <Badge variant="outline" className="text-[10px] py-0 h-4 text-emerald-600 border-emerald-300 ml-1">saved</Badge>
              )}
            </Label>
            {igStatus?.configured && !igStatus?.envOverride && (
              <button
                type="button"
                className="text-[11px] text-destructive hover:underline flex items-center gap-0.5"
                onClick={() => onClear("instagram")}
                disabled={isClearing === "instagram"}
              >
                <Trash2 className="w-3 h-3" /> {isClearing === "instagram" ? "Clearing…" : "Clear"}
              </button>
            )}
          </div>
          <div className="relative">
            <Input
              type={showIg ? "text" : "password"}
              value={instagramAccessToken}
              onChange={e => setInstagramAccessToken(e.target.value)}
              placeholder={igStatus?.configured || igStatus?.envOverride ? "Leave blank to keep existing token" : "EAAa…"}
              className="h-8 text-sm font-mono pr-9"
              disabled={!!igStatus?.envOverride}
            />
            <button
              type="button"
              onClick={() => setShowIg(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showIg ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          {igStatus?.envOverride && (
            <p className="text-[11px] text-blue-600">Set via server environment variable — to override, clear the env var first.</p>
          )}
          {!igStatus?.envOverride && (
            <p className="text-[11px] text-muted-foreground">
              Long-lived token from a Facebook App with <code className="bg-muted px-0.5 rounded">instagram_basic</code> +{" "}
              <code className="bg-muted px-0.5 rounded">instagram_manage_insights</code> permissions.{" "}
              <a href="https://developers.facebook.com/apps/" target="_blank" rel="noopener noreferrer" className="underline">
                developers.facebook.com
              </a>
            </p>
          )}
        </div>

        {/* Restream API Key */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs font-medium flex items-center gap-1.5">
              <span className="text-[13px]">📡</span> Restream.io API Key
              {rstStatus?.envOverride && (
                <Badge variant="outline" className="text-[10px] py-0 h-4 text-blue-600 border-blue-300 ml-1">env override</Badge>
              )}
              {!rstStatus?.envOverride && rstStatus?.configured && (
                <Badge variant="outline" className="text-[10px] py-0 h-4 text-emerald-600 border-emerald-300 ml-1">saved</Badge>
              )}
            </Label>
            {rstStatus?.configured && !rstStatus?.envOverride && (
              <button
                type="button"
                className="text-[11px] text-destructive hover:underline flex items-center gap-0.5"
                onClick={() => onClear("restream")}
                disabled={isClearing === "restream"}
              >
                <Trash2 className="w-3 h-3" /> {isClearing === "restream" ? "Clearing…" : "Clear"}
              </button>
            )}
          </div>
          <div className="relative">
            <Input
              type={showRst ? "text" : "password"}
              value={restreamApiKey}
              onChange={e => setRestreamApiKey(e.target.value)}
              placeholder={rstStatus?.configured || rstStatus?.envOverride ? "Leave blank to keep existing key" : "Paste your Restream Personal Access Token…"}
              className="h-8 text-sm font-mono pr-9"
              disabled={!!rstStatus?.envOverride}
            />
            <button
              type="button"
              onClick={() => setShowRst(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              {showRst ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          </div>
          {rstStatus?.envOverride && (
            <p className="text-[11px] text-blue-600">Set via server environment variable — to override, clear the env var first.</p>
          )}
          {!rstStatus?.envOverride && (
            <p className="text-[11px] text-muted-foreground">
              Get your token at{" "}
              <a href="https://app.restream.io/settings/api" target="_blank" rel="noopener noreferrer" className="underline">
                app.restream.io/settings/api
              </a>
              {" "}→ Personal Access Token. One OBS feed fans out to all connected platforms automatically.
            </p>
          )}
        </div>

        <Button
          size="sm"
          className="w-full h-8 text-xs"
          disabled={isSaving || (!youtubeApiKey && !instagramAccessToken && !restreamApiKey)}
          onClick={() => {
            onSave(youtubeApiKey || undefined, instagramAccessToken || undefined, restreamApiKey || undefined);
            setYoutubeApiKey("");
            setInstagramAccessToken("");
            setRestreamApiKey("");
          }}
        >
          <Save className="w-3 h-3 mr-1.5" />
          {isSaving ? "Saving…" : "Save Live API Keys"}
        </Button>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [savingPlatform, setSavingPlatform] = useState<string | null>(null);
  const [clearingPlatform, setClearingPlatform] = useState<string | null>(null);
  const [savingLiveKeys, setSavingLiveKeys] = useState(false);
  const [clearingLiveKey, setClearingLiveKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery<CredentialsResponse>({
    queryKey: ["settings-credentials"],
    queryFn: () => apiFetch("/settings/credentials"),
  });

  const { data: liveApiKeysData } = useQuery<LiveApiKeysResponse>({
    queryKey: ["settings-live-api-keys"],
    queryFn: () => apiFetch("/settings/live-api-keys"),
  });

  const saveMutation = useMutation({
    mutationFn: ({ platform, appId, appSecret }: { platform: string; appId: string; appSecret: string }) =>
      apiFetch(`/settings/credentials/${platform}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appId, appSecret }),
      }),
    onSuccess: (_, { platform }) => {
      queryClient.invalidateQueries({ queryKey: ["settings-credentials"] });
      setSavingPlatform(null);
      toast({ title: "Credentials saved", description: `${platform} credentials have been saved.` });
    },
    onError: (err: Error) => {
      setSavingPlatform(null);
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const clearMutation = useMutation({
    mutationFn: (platform: string) =>
      apiFetch(`/settings/credentials/${platform}`, { method: "DELETE" }),
    onSuccess: (_, platform) => {
      queryClient.invalidateQueries({ queryKey: ["settings-credentials"] });
      setClearingPlatform(null);
      toast({ title: "Credentials cleared", description: `${platform} credentials removed.` });
    },
    onError: (err: Error) => {
      setClearingPlatform(null);
      toast({ title: "Failed to clear", description: err.message, variant: "destructive" });
    },
  });

  const saveLiveKeysMutation = useMutation({
    mutationFn: ({ youtubeApiKey, instagramAccessToken, restreamApiKey }: { youtubeApiKey?: string; instagramAccessToken?: string; restreamApiKey?: string }) =>
      apiFetch("/settings/live-api-keys", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtubeApiKey, instagramAccessToken, restreamApiKey }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings-live-api-keys"] });
      setSavingLiveKeys(false);
      toast({ title: "Live API keys saved", description: "Your API keys have been saved and encrypted." });
    },
    onError: (err: Error) => {
      setSavingLiveKeys(false);
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const clearLiveKeyMutation = useMutation({
    mutationFn: (key: string) =>
      apiFetch(`/settings/live-api-keys/${key}`, { method: "DELETE" }),
    onSuccess: (_, key) => {
      queryClient.invalidateQueries({ queryKey: ["settings-live-api-keys"] });
      setClearingLiveKey(null);
      const label = key === "youtube" ? "YouTube API key" : key === "restream" ? "Restream API key" : "Instagram access token";
      toast({ title: "Key cleared", description: `${label} removed.` });
    },
    onError: (err: Error) => {
      setClearingLiveKey(null);
      toast({ title: "Failed to clear", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = (platform: string, appId: string, appSecret: string) => {
    setSavingPlatform(platform);
    saveMutation.mutate({ platform, appId, appSecret });
  };

  const handleClear = (platform: string) => {
    setClearingPlatform(platform);
    clearMutation.mutate(platform);
  };

  const handleSaveLiveKeys = (youtubeApiKey?: string, instagramAccessToken?: string, restreamApiKey?: string) => {
    setSavingLiveKeys(true);
    saveLiveKeysMutation.mutate({ youtubeApiKey, instagramAccessToken, restreamApiKey });
  };

  const handleClearLiveKey = (key: "youtube" | "instagram" | "restream") => {
    setClearingLiveKey(key);
    clearLiveKeyMutation.mutate(key);
  };

  return (
    <AppShell title="Settings">
      <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-8">
        {/* ─── Live Viewer API Keys ─── */}
        <div id="live-viewer-api-keys">
          <div className="flex items-center gap-2 mb-1">
            <Radio className="w-5 h-5 text-red-500" />
            <h1 className="text-xl font-bold tracking-tight">Live Viewer API Keys</h1>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            Connect YouTube and Instagram APIs so viewer counts update automatically every 15 seconds during a live session.
          </p>
          <LiveApiKeysCard
            data={liveApiKeysData}
            onSave={handleSaveLiveKeys}
            onClear={handleClearLiveKey}
            isSaving={savingLiveKeys}
            isClearing={clearingLiveKey}
          />
        </div>

        {/* ─── Platform OAuth Credentials ─── */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Settings className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold tracking-tight">Platform API Credentials</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Enter your developer app credentials for each platform. These are stored securely and used when you connect social accounts. You can update them at any time.
          </p>
        </div>

        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="py-3 px-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800 space-y-1">
                <p className="font-medium">How this works</p>
                <p className="text-xs text-amber-700 leading-relaxed">
                  Each platform requires you to create a developer app and register your callback URL.
                  Once saved, clicking "Connect" on the Scheduling page will use these credentials to start the OAuth flow.
                  Instagram and Facebook use the same Facebook App — enter the same App ID and Secret for both.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i} className="animate-pulse">
                <CardHeader><div className="h-4 w-32 bg-muted rounded" /></CardHeader>
                <CardContent><div className="h-24 bg-muted rounded" /></CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {PLATFORM_CONFIG.map((platform) => (
              <PlatformCredentialCard
                key={platform.key}
                platform={platform}
                status={data?.credentials[platform.key]}
                onSave={(appId, appSecret) => handleSave(platform.key, appId, appSecret)}
                onClear={() => handleClear(platform.key)}
                isSaving={savingPlatform === platform.key}
                isClearing={clearingPlatform === platform.key}
              />
            ))}
          </div>
        )}

        <Card className="border-dashed">
          <CardContent className="py-4 px-4">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Token encryption</p>
                <p>
                  OAuth access tokens are encrypted at rest using AES-256-GCM. The encryption key is managed via the <code className="bg-muted px-1 rounded">TOKEN_ENCRYPTION_KEY</code> server environment variable.
                  In development a safe fallback is used automatically. For production deployments, set this to a 64-character hex string generated with <code className="bg-muted px-1 rounded">openssl rand -hex 32</code>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
