import { useState, useEffect, useRef } from "react";
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
  Loader2,
  Wifi,
  WifiOff,
  AlertCircle,
  FlaskConical,
  XCircle,
} from "lucide-react";

const API = import.meta.env.BASE_URL.replace(/\/$/, "") + "/api";

async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(`${API}${path}`, { credentials: "include", ...opts });
  if (!r.ok) {
    let message: string;
    try {
      const body = await r.json();
      message = body.message ?? body.error ?? `Request failed (${r.status})`;
    } catch {
      message = await r.text().catch(() => `Request failed (${r.status})`);
    }
    throw new Error(message);
  }
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
  lastVerified?: string | null;
  keyExpired?: boolean | null;
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

interface CredentialTestResult {
  ok: boolean;
  message?: string;
  appName?: string | null;
}

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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<CredentialTestResult | null>(null);

  const isConfigured = !!(status?.appId && status?.hasSecret);
  const hasPartial = !!(status?.appId || status?.hasSecret);
  const canTest = (platform.key === "instagram" || platform.key === "facebook") && isConfigured;

  const callbackUrl = `${window.location.origin}${import.meta.env.BASE_URL.replace(/\/$/, "")}/api/oauth/${platform.callbackPlatform}/callback`;

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiFetch(`/settings/credentials/test/${platform.key}`, { method: "POST" });
      setTestResult(result as CredentialTestResult);
    } catch (err: any) {
      setTestResult({ ok: false, message: err?.message ?? "Test request failed." });
    } finally {
      setTesting(false);
    }
  }

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
            onChange={(e) => { setAppId(e.target.value); setTestResult(null); }}
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
              onChange={(e) => { setAppSecret(e.target.value); setTestResult(null); }}
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
            {isSaving ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Save className="w-3 h-3 mr-1.5" />}
            {isSaving ? "Saving…" : "Save credentials"}
          </Button>
          {canTest && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs"
              onClick={handleTest}
              disabled={testing || isSaving}
              title="Verify credentials against the Meta Graph API"
            >
              {testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <FlaskConical className="w-3 h-3 mr-1" />}
              {testing ? "Testing…" : "Test"}
            </Button>
          )}
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

        {testResult !== null && (
          <div className={`flex items-start gap-2 p-2.5 rounded-lg text-xs border ${testResult.ok ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
            {testResult.ok ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-600" />
            ) : (
              <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-red-600" />
            )}
            <span className="leading-relaxed">
              {testResult.ok
                ? `Credentials verified${testResult.appName ? ` — App: ${testResult.appName}` : ""}. Ready for OAuth.`
                : (testResult.message ?? "Credential test failed.")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface RestreamChannel {
  id: string | number;
  displayName: string;
  platform: string;
  active: boolean;
}

interface SimpleTestResult {
  ok: boolean;
  invalid?: boolean;
  error?: string;
  reason?: string | null;
}

interface YoutubeTestResult extends SimpleTestResult {}

interface InstagramTestResult extends SimpleTestResult {
  accountId?: string | null;
  accountName?: string | null;
}

interface RestreamTestResult {
  ok: boolean;
  invalid?: boolean;
  error?: string;
  channels?: RestreamChannel[];
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
  const [testingYoutube, setTestingYoutube] = useState(false);
  const [youtubeTestResult, setYoutubeTestResult] = useState<YoutubeTestResult | null>(null);
  const [testingInstagram, setTestingInstagram] = useState(false);
  const [instagramTestResult, setInstagramTestResult] = useState<InstagramTestResult | null>(null);
  const [testingRestream, setTestingRestream] = useState(false);
  const [restreamTestResult, setRestreamTestResult] = useState<RestreamTestResult | null>(null);

  const ytStatus = data?.youtube;
  const igStatus = data?.instagram;
  const rstStatus = data?.restream;

  const canTestYoutube = !!(youtubeApiKey || ytStatus?.configured || ytStatus?.envOverride);
  const canTestInstagram = !!(instagramAccessToken || igStatus?.configured || igStatus?.envOverride);
  const canTestRestream = !!(restreamApiKey || rstStatus?.configured || rstStatus?.envOverride);

  async function testYoutubeConnection() {
    setTestingYoutube(true);
    setYoutubeTestResult(null);
    try {
      const result = await apiFetch("/settings/live-api-keys/test-youtube", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(youtubeApiKey ? { apiKey: youtubeApiKey } : {}),
      });
      setYoutubeTestResult(result as YoutubeTestResult);
    } catch (err: any) {
      setYoutubeTestResult({ ok: false, error: err?.message ?? "Request failed." });
    } finally {
      setTestingYoutube(false);
    }
  }

  async function testInstagramConnection() {
    setTestingInstagram(true);
    setInstagramTestResult(null);
    try {
      const result = await apiFetch("/settings/live-api-keys/test-instagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(instagramAccessToken ? { token: instagramAccessToken } : {}),
      });
      setInstagramTestResult(result as InstagramTestResult);
    } catch (err: any) {
      setInstagramTestResult({ ok: false, error: err?.message ?? "Request failed." });
    } finally {
      setTestingInstagram(false);
    }
  }

  async function testRestreamConnection() {
    setTestingRestream(true);
    setRestreamTestResult(null);
    try {
      const result = await apiFetch("/settings/live-api-keys/test-restream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(restreamApiKey ? { apiKey: restreamApiKey } : {}),
      });
      setRestreamTestResult(result as RestreamTestResult);
    } catch (err: any) {
      setRestreamTestResult({ ok: false, error: err?.message ?? "Request failed." });
    } finally {
      setTestingRestream(false);
    }
  }

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
            <Label className="text-xs font-medium flex items-center gap-1.5 flex-wrap">
              <Youtube className="w-3.5 h-3.5 text-red-500" /> YouTube Data API Key
              {ytStatus?.envOverride && (
                <Badge variant="outline" className="text-[10px] py-0 h-4 text-blue-600 border-blue-300 ml-1">env override</Badge>
              )}
              {!ytStatus?.envOverride && ytStatus?.configured && (
                ytStatus?.keyExpired === true ? (
                  <Badge variant="outline" className="text-[10px] py-0 h-4 text-red-600 border-red-300 ml-1 flex items-center gap-0.5">
                    <AlertCircle className="w-2.5 h-2.5" /> expired
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] py-0 h-4 text-emerald-600 border-emerald-300 ml-1">saved</Badge>
                )
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
              onChange={e => {
                setYoutubeApiKey(e.target.value);
                setYoutubeTestResult(null);
              }}
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

          {/* Test Connection button */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs px-3 w-full"
            disabled={testingYoutube || !canTestYoutube}
            onClick={testYoutubeConnection}
          >
            {testingYoutube ? (
              <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Testing…</>
            ) : (
              <><Wifi className="w-3 h-3 mr-1.5" />Test Connection</>
            )}
          </Button>

          {/* Inline test results */}
          {youtubeTestResult && (
            <div className={`rounded-lg border p-3 text-xs ${
              youtubeTestResult.ok
                ? "bg-emerald-50 border-emerald-200"
                : youtubeTestResult.invalid
                ? "bg-red-50 border-red-200"
                : "bg-amber-50 border-amber-200"
            }`}>
              {youtubeTestResult.ok ? (
                <div className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Key valid — YouTube Data API accepted the credentials.
                </div>
              ) : youtubeTestResult.invalid ? (
                <div className="flex items-center gap-1.5 font-medium text-red-700">
                  <WifiOff className="w-3.5 h-3.5" />
                  Invalid key — YouTube rejected the credentials.{youtubeTestResult.reason ? ` (${youtubeTestResult.reason})` : " Double-check your API key."}
                </div>
              ) : (
                <div className="flex items-start gap-1.5 text-amber-700">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{youtubeTestResult.error ?? "Connection test failed."}</span>
                </div>
              )}
            </div>
          )}

          {/* Expired key warning */}
          {!ytStatus?.envOverride && ytStatus?.configured && ytStatus?.keyExpired === true && (
            <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                This YouTube Data API key has been disabled or revoked. Paste a fresh key and save to restore live viewer counts.
              </span>
            </div>
          )}

          {/* Last verified timestamp */}
          {!ytStatus?.envOverride && ytStatus?.configured && ytStatus?.lastVerified && (
            <p className="text-[11px] text-muted-foreground">
              Last verified: {new Date(ytStatus.lastVerified).toLocaleString()}
            </p>
          )}

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
            <Label className="text-xs font-medium flex items-center gap-1.5 flex-wrap">
              <span className="text-[13px]">📸</span> Instagram Graph API Access Token
              {igStatus?.envOverride && (
                <Badge variant="outline" className="text-[10px] py-0 h-4 text-blue-600 border-blue-300 ml-1">env override</Badge>
              )}
              {!igStatus?.envOverride && igStatus?.configured && (
                igStatus?.keyExpired === true ? (
                  <Badge variant="outline" className="text-[10px] py-0 h-4 text-red-600 border-red-300 ml-1 flex items-center gap-0.5">
                    <AlertCircle className="w-2.5 h-2.5" /> expired
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] py-0 h-4 text-emerald-600 border-emerald-300 ml-1">saved</Badge>
                )
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
              onChange={e => {
                setInstagramAccessToken(e.target.value);
                setInstagramTestResult(null);
              }}
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

          {/* Test Connection button */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs px-3 w-full"
            disabled={testingInstagram || !canTestInstagram}
            onClick={testInstagramConnection}
          >
            {testingInstagram ? (
              <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Testing…</>
            ) : (
              <><Wifi className="w-3 h-3 mr-1.5" />Test Connection</>
            )}
          </Button>

          {/* Inline test results */}
          {instagramTestResult && (
            <div className={`rounded-lg border p-3 text-xs ${
              instagramTestResult.ok
                ? "bg-emerald-50 border-emerald-200"
                : instagramTestResult.invalid
                ? "bg-red-50 border-red-200"
                : "bg-amber-50 border-amber-200"
            }`}>
              {instagramTestResult.ok ? (
                <div className="flex items-center gap-1.5 font-medium text-emerald-700">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Token valid{instagramTestResult.accountName ? ` — connected as ${instagramTestResult.accountName}` : " — Instagram Graph API accepted the token."}
                </div>
              ) : instagramTestResult.invalid ? (
                <div className="flex items-center gap-1.5 font-medium text-red-700">
                  <WifiOff className="w-3.5 h-3.5" />
                  Invalid token — Instagram rejected the credentials.{instagramTestResult.reason ? ` (${instagramTestResult.reason})` : " Double-check your access token."}
                </div>
              ) : (
                <div className="flex items-start gap-1.5 text-amber-700">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{instagramTestResult.error ?? "Connection test failed."}</span>
                </div>
              )}
            </div>
          )}

          {/* Expired token warning */}
          {!igStatus?.envOverride && igStatus?.configured && igStatus?.keyExpired === true && (
            <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                This Instagram access token has expired (tokens last 60 days). Generate a fresh long-lived token and save it to restore live viewer counts.
              </span>
            </div>
          )}

          {/* Last verified timestamp */}
          {!igStatus?.envOverride && igStatus?.configured && igStatus?.lastVerified && (
            <p className="text-[11px] text-muted-foreground">
              Last verified: {new Date(igStatus.lastVerified).toLocaleString()}
            </p>
          )}

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
            <Label className="text-xs font-medium flex items-center gap-1.5 flex-wrap">
              <span className="text-[13px]">📡</span> Restream.io API Key
              {rstStatus?.envOverride && (
                <Badge variant="outline" className="text-[10px] py-0 h-4 text-blue-600 border-blue-300 ml-1">env override</Badge>
              )}
              {!rstStatus?.envOverride && rstStatus?.configured && (
                rstStatus?.keyExpired === true ? (
                  <Badge variant="outline" className="text-[10px] py-0 h-4 text-red-600 border-red-300 ml-1 flex items-center gap-0.5">
                    <AlertCircle className="w-2.5 h-2.5" /> expired
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] py-0 h-4 text-emerald-600 border-emerald-300 ml-1">saved</Badge>
                )
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
              onChange={e => {
                setRestreamApiKey(e.target.value);
                setRestreamTestResult(null);
              }}
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

          {/* Test Connection button */}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs px-3 w-full"
            disabled={testingRestream || !canTestRestream}
            onClick={testRestreamConnection}
          >
            {testingRestream ? (
              <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Testing…</>
            ) : (
              <><Wifi className="w-3 h-3 mr-1.5" />Test Connection</>
            )}
          </Button>

          {/* Inline test results */}
          {restreamTestResult && (
            <div className={`rounded-lg border p-3 space-y-2 text-xs ${
              restreamTestResult.ok
                ? "bg-emerald-50 border-emerald-200"
                : restreamTestResult.invalid
                ? "bg-red-50 border-red-200"
                : "bg-amber-50 border-amber-200"
            }`}>
              {restreamTestResult.ok ? (
                <>
                  <div className="flex items-center gap-1.5 font-medium text-emerald-700">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Key valid — {restreamTestResult.channels?.length ?? 0} destination{restreamTestResult.channels?.length !== 1 ? "s" : ""} found
                  </div>
                  {restreamTestResult.channels && restreamTestResult.channels.length > 0 && (
                    <ul className="space-y-1 pl-5">
                      {restreamTestResult.channels.map((ch) => (
                        <li key={ch.id} className="flex items-center gap-1.5">
                          {ch.active ? (
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                          ) : (
                            <Circle className="w-3 h-3 text-amber-500 shrink-0" />
                          )}
                          <span className={ch.active ? "text-emerald-700" : "text-amber-700"}>
                            {ch.displayName}
                            <span className="ml-1 opacity-60 font-normal">({ch.platform})</span>
                            {!ch.active && <span className="ml-1 text-amber-600 font-medium">— disabled</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {restreamTestResult.channels?.length === 0 && (
                    <p className="text-emerald-600 pl-5">Key is valid but no destination channels are configured yet.</p>
                  )}
                </>
              ) : restreamTestResult.invalid ? (
                <div className="flex items-center gap-1.5 font-medium text-red-700">
                  <WifiOff className="w-3.5 h-3.5" />
                  Invalid key — Restream rejected the credentials. Double-check your Personal Access Token.
                </div>
              ) : (
                <div className="flex items-start gap-1.5 text-amber-700">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>{restreamTestResult.error ?? "Connection test failed."}</span>
                </div>
              )}
            </div>
          )}

          {/* Expired key warning */}
          {!rstStatus?.envOverride && rstStatus?.configured && rstStatus?.keyExpired === true && (
            <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>
                This Restream Personal Access Token has expired or been revoked. Paste a fresh token and save to restore live streaming.
              </span>
            </div>
          )}

          {/* Last verified timestamp */}
          {!rstStatus?.envOverride && rstStatus?.configured && rstStatus?.lastVerified && (
            <p className="text-[11px] text-muted-foreground">
              Last verified: {new Date(rstStatus.lastVerified).toLocaleString()}
            </p>
          )}

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
  const restreamCheckFiredRef = useRef(false);
  const youtubeCheckFiredRef = useRef(false);
  const instagramCheckFiredRef = useRef(false);

  const { data, isLoading } = useQuery<CredentialsResponse>({
    queryKey: ["settings-credentials"],
    queryFn: () => apiFetch("/settings/credentials"),
  });

  const { data: liveApiKeysData } = useQuery<LiveApiKeysResponse>({
    queryKey: ["settings-live-api-keys"],
    queryFn: () => apiFetch("/settings/live-api-keys"),
  });

  const { data: liveSessionsData, isSuccess: liveSessionsLoaded } = useQuery<Array<{ id: number; status: string }>>({
    queryKey: ["live-sessions"],
    queryFn: () => apiFetch("/live-sessions"),
    staleTime: 30_000,
  });

  // Derived only after the query has resolved — undefined while loading
  const hasActiveLiveSession = liveSessionsLoaded
    ? (Array.isArray(liveSessionsData) && liveSessionsData.some((s) => s.status === "live"))
    : null; // null = "not yet known"

  // Background check: silently verify the Restream key on page load if one is configured.
  // Guards:
  //  1. liveSessionsLoaded — do not fire until we know whether a session is live (prevents
  //     the race where liveApiKeysData resolves first and checks run before status is known)
  //  2. hasActiveLiveSession — skip entirely while a live session is active to avoid
  //     outbound API calls that could spike latency or open a brief token-invalidation window
  useEffect(() => {
    if (restreamCheckFiredRef.current) return;
    if (!liveSessionsLoaded) return;
    if (hasActiveLiveSession) return;
    const rst = liveApiKeysData?.restream;
    if (!rst?.configured || rst?.envOverride) return;
    restreamCheckFiredRef.current = true;
    apiFetch("/settings/live-api-keys/check-restream", { method: "POST" })
      .then(() => { queryClient.invalidateQueries({ queryKey: ["settings-live-api-keys"] }); })
      .catch(() => {});
  }, [liveApiKeysData, liveSessionsLoaded, hasActiveLiveSession, queryClient]);

  // Background check: silently verify the YouTube API key on page load if one is configured.
  // Same guards as the Restream check above — see that comment for rationale.
  useEffect(() => {
    if (youtubeCheckFiredRef.current) return;
    if (!liveSessionsLoaded) return;
    if (hasActiveLiveSession) return;
    const yt = liveApiKeysData?.youtube;
    if (!yt?.configured || yt?.envOverride) return;
    youtubeCheckFiredRef.current = true;
    apiFetch("/settings/live-api-keys/check-youtube", { method: "POST" })
      .then(() => { queryClient.invalidateQueries({ queryKey: ["settings-live-api-keys"] }); })
      .catch(() => {});
  }, [liveApiKeysData, liveSessionsLoaded, hasActiveLiveSession, queryClient]);

  // Background check: silently verify the Instagram token on page load if one is configured.
  // Same guards as the Restream check above — see that comment for rationale.
  useEffect(() => {
    if (instagramCheckFiredRef.current) return;
    if (!liveSessionsLoaded) return;
    if (hasActiveLiveSession) return;
    const ig = liveApiKeysData?.instagram;
    if (!ig?.configured || ig?.envOverride) return;
    instagramCheckFiredRef.current = true;
    apiFetch("/settings/live-api-keys/check-instagram", { method: "POST" })
      .then(() => { queryClient.invalidateQueries({ queryKey: ["settings-live-api-keys"] }); })
      .catch(() => {});
  }, [liveApiKeysData, liveSessionsLoaded, hasActiveLiveSession, queryClient]);

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
