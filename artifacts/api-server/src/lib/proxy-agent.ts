import { HttpsProxyAgent } from "https-proxy-agent";
import { SocksProxyAgent } from "socks-proxy-agent";
import type { Agent as HttpsAgent } from "https";
import { Readable } from "stream";
import { logger } from "./logger";

export type AnyProxyAgent = HttpsProxyAgent<string> | SocksProxyAgent;

const SUPPORTED_SCHEMES = new Set(["http:", "https:", "socks:", "socks4:", "socks5:", "socks5h:"]);

const cache = new Map<string, AnyProxyAgent>();

/**
 * Builds (or returns from cache) a Node http(s) Agent that tunnels traffic
 * through the given proxy URL. Used by:
 *   - google-auth-library (`transporterOptions.agent`) for token exchange
 *   - native fetch via undici Dispatcher? — no: undici needs a separate
 *     adapter. We only use Node-Agent flavor here, and pair raw fetches
 *     with `node-fetch`-style agents below if needed.
 *
 * Throws on unsupported schemes so callers see an explicit error instead
 * of silently bypassing the proxy.
 */
export function getProxyAgent(rawUrl: string): AnyProxyAgent {
  const url = rawUrl.trim();
  const cached = cache.get(url);
  if (cached) return cached;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid proxy URL: malformed URL`);
  }
  const scheme = parsed.protocol.toLowerCase();
  if (!SUPPORTED_SCHEMES.has(scheme)) {
    throw new Error(
      `Unsupported proxy scheme "${scheme}". Use http://, https://, socks://, socks4://, or socks5://`,
    );
  }

  let agent: AnyProxyAgent;
  if (scheme.startsWith("socks")) {
    agent = new SocksProxyAgent(url);
  } else {
    agent = new HttpsProxyAgent(url);
  }
  cache.set(url, agent);
  return agent;
}

/**
 * Redacts user:password from a proxy URL for safe logging / UI display.
 * `socks5://user:secret@host:1080` → `socks5://user:***@host:1080`.
 */
export function redactProxyUrl(rawUrl: string | null | undefined): string {
  if (!rawUrl) return "";
  try {
    const u = new URL(rawUrl.trim());
    if (u.password) u.password = "***";
    return u.toString();
  } catch {
    return "<invalid proxy url>";
  }
}

/**
 * Validates a proxy URL string. Returns null if OK, or an error message.
 * Does NOT make a network call — purely syntactic.
 */
export function validateProxyUrl(rawUrl: string): string | null {
  const v = rawUrl.trim();
  if (!v) return "Proxy URL is empty";
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return "Malformed URL";
  }
  if (!SUPPORTED_SCHEMES.has(u.protocol.toLowerCase())) {
    return `Unsupported scheme "${u.protocol}". Use http, https, socks, socks4, or socks5`;
  }
  if (!u.hostname) return "Missing host";
  return null;
}

/**
 * Wraps `fetch` to route through the given proxy agent. We use the Node http
 * Agent (not undici Dispatcher) because (a) it works for both HTTP/HTTPS and
 * SOCKS uniformly, and (b) it matches what google-auth-library uses, so
 * troubleshooting is consistent.
 *
 * On Node 20+, `globalThis.fetch` is undici and does NOT accept `agent`
 * directly. So when a proxy is required, we fall through to a small wrapper
 * built on the standard https module via the proxy agent. To keep the call
 * site simple we expose the same fetch signature and use undici's lower-level
 * `fetch` with `dispatcher` only for HTTP(S) — and route SOCKS through a
 * Node-native agent path.
 *
 * Implementation note: we use `node-fetch` semantics via dynamic import of
 * the runtime's https module is overkill — instead we leverage the fact that
 * `https-proxy-agent` and `socks-proxy-agent` produce a Node http.Agent, and
 * Node 20's fetch (undici) supports a custom `dispatcher` built from
 * `undici.Agent({ connect: { ... } })`. Rather than duplicate that, we
 * provide a simple wrapper that uses Node's `https` module directly when a
 * proxy is configured, returning a Response-compatible object.
 */
export async function proxiedFetch(
  url: string,
  init: RequestInit | undefined,
  proxyUrl: string,
): Promise<Response> {
  const agent = getProxyAgent(proxyUrl);
  const u = new URL(url);
  const isHttps = u.protocol === "https:";
  const lib = isHttps ? await import("https") : await import("http");

  // Normalize headers
  const headers: Record<string, string> = {};
  if (init?.headers) {
    if (init.headers instanceof Headers) {
      init.headers.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(init.headers)) {
      for (const [k, v] of init.headers) headers[k] = v;
    } else {
      Object.assign(headers, init.headers as Record<string, string>);
    }
  }

  // Body handling — support string, Buffer, Uint8Array.
  let body: Buffer | string | undefined;
  if (init?.body != null) {
    if (typeof init.body === "string" || Buffer.isBuffer(init.body)) {
      body = init.body;
    } else if (init.body instanceof Uint8Array) {
      body = Buffer.from(init.body);
    } else {
      // For ReadableStream / FormData / Blob we don't support proxying yet —
      // fall back loudly so callers know.
      throw new Error("proxiedFetch: body type not supported (use string or Buffer)");
    }
    if (!headers["content-length"] && !headers["Content-Length"]) {
      headers["Content-Length"] = String(Buffer.byteLength(body));
    }
  }

  return new Promise<Response>((resolve, reject) => {
    const req = lib.request(
      {
        method: init?.method ?? "GET",
        host: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        headers,
        agent: agent as unknown as HttpsAgent,
      },
      (res) => {
        const responseHeaders = new Headers();
        for (const [k, v] of Object.entries(res.headers)) {
          if (Array.isArray(v)) v.forEach((x) => responseHeaders.append(k, x));
          else if (v != null) responseHeaders.set(k, String(v));
        }
        // Stream the body lazily so SSE / NDJSON callers can iterate
        // `response.body` without us buffering the whole payload. For
        // non-streaming callers, `.text()` / `.json()` / `.arrayBuffer()`
        // still work — the Response class handles consuming the stream.
        const webStream = Readable.toWeb(res) as unknown as ReadableStream<Uint8Array>;
        const response = new Response(webStream, {
          status: res.statusCode ?? 0,
          statusText: res.statusMessage ?? "",
          headers: responseHeaders,
        });
        resolve(response);
      },
    );
    req.on("error", (err) => {
      logger.warn({ err: err.message, host: u.hostname, proxy: redactProxyUrl(proxyUrl) }, "proxied request failed");
      reject(err);
    });
    if (init?.signal) {
      const abort = () => req.destroy(new Error("aborted"));
      if (init.signal.aborted) abort();
      else init.signal.addEventListener("abort", abort, { once: true });
    }
    if (body != null) req.write(body);
    req.end();
  });
}

/**
 * Drop-in fetch that auto-routes through the proxy if `proxyUrl` is set,
 * otherwise calls the global fetch directly.
 */
export function fetchWithOptionalProxy(
  url: string,
  init?: RequestInit,
  proxyUrl?: string | null,
): Promise<Response> {
  if (proxyUrl && proxyUrl.length > 0) {
    return proxiedFetch(url, init, proxyUrl);
  }
  return fetch(url, init);
}
