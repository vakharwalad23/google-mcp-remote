declare namespace Cloudflare {
  interface Env {
    OAUTH_KV: KVNamespace;
    GOOGLE_MCP_REMOTE: DurableObjectNamespace /* GoogleMcpRemote */;
    GOOGLE_OAUTH_CLIENT_ID: string;
    GOOGLE_OAUTH_CLIENT_SECRET: string;
    COOKIE_ENCRYPTION_KEY: string;
  }
}
interface Env extends Cloudflare.Env {}
