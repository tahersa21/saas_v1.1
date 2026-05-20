import { getSettingValue } from "../routes/admin/settings";
import { logger } from "./logger";

export interface GitHubOAuthConfig {
  enabled: boolean;
  clientId: string;
  clientSecret: string;
}

let cache: { value: GitHubOAuthConfig; expiresAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

export function invalidateGitHubOAuthCache(): void {
  cache = null;
}

function parseBool(v: string | null): boolean {
  if (!v) return false;
  const s = v.trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

export async function getGitHubOAuthConfig(): Promise<GitHubOAuthConfig> {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  const [enabledRaw, clientId, clientSecret] = await Promise.all([
    getSettingValue("github_oauth_enabled").catch(() => null),
    getSettingValue("github_oauth_client_id").catch(() => null),
    getSettingValue("github_oauth_client_secret").catch(() => null),
  ]);

  const value: GitHubOAuthConfig = {
    enabled: parseBool(enabledRaw) && Boolean(clientId) && Boolean(clientSecret),
    clientId: clientId ?? "",
    clientSecret: clientSecret ?? "",
  };

  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
}

export interface GitHubUserInfo {
  id: string;
  email: string;
  name: string;
}

export async function exchangeCodeForUserInfo(params: {
  code: string;
  redirectUri: string;
}): Promise<GitHubUserInfo> {
  const cfg = await getGitHubOAuthConfig();
  if (!cfg.enabled) throw new Error("GitHub sign-in is not configured");

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      code: params.code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: params.redirectUri,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => "");
    logger.warn({ status: tokenRes.status, body: text.slice(0, 500) }, "GitHub token exchange failed");
    throw new Error("Failed to exchange GitHub authorization code");
  }

  const tokenJson = (await tokenRes.json()) as { access_token?: string; error?: string; error_description?: string };
  if (!tokenJson.access_token || tokenJson.error) {
    logger.warn({ err: tokenJson.error, desc: tokenJson.error_description }, "GitHub token error");
    throw new Error(tokenJson.error_description || "GitHub did not return an access token");
  }

  const [userRes, emailsRes] = await Promise.all([
    fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }),
    fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }),
  ]);

  if (!userRes.ok) {
    const text = await userRes.text().catch(() => "");
    logger.warn({ status: userRes.status, body: text.slice(0, 500) }, "GitHub user fetch failed");
    throw new Error("Failed to fetch GitHub user profile");
  }

  const u = (await userRes.json()) as {
    id?: number;
    login?: string;
    name?: string | null;
    email?: string | null;
  };

  if (!u.id) throw new Error("GitHub profile is missing required fields");

  let email = (u.email ?? "").trim().toLowerCase();

  if (!email && emailsRes.ok) {
    const emails = (await emailsRes.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
    const primary = emails.find((e) => e.primary && e.verified);
    const anyVerified = emails.find((e) => e.verified);
    email = (primary ?? anyVerified)?.email?.toLowerCase().trim() ?? "";
  }

  if (!email) throw new Error("GitHub account has no verified public email. Please add a public email to your GitHub profile.");

  return {
    id: String(u.id),
    email,
    name: u.name?.trim() || u.login || email,
  };
}

export function buildGitHubAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", "user:email");
  url.searchParams.set("state", params.state);
  return url.toString();
}
