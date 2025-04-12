declare namespace Cloudflare {
  interface Env {
    OAUTH_KV: KVNamespace;
    GOOGLE_OAUTH_CLIENT_ID: string;
    GOOGLE_OAUTH_CLIENT_SECRET: string;
    COOKIE_ENCRYPTION_KEY: string;
    MCP_OBJECT: DurableObjectNamespace /* MyMCP */;
  }
}
interface Env extends Cloudflare.Env {}
type StringifyValues<EnvType extends Record<string, unknown>> = {
  [Binding in keyof EnvType]: EnvType[Binding] extends string
    ? EnvType[Binding]
    : string;
};
declare namespace NodeJS {
  interface ProcessEnv
    extends StringifyValues<
      Pick<
        Cloudflare.Env,
        | "GOOGLE_OAUTH_CLIENT_ID"
        | "GOOGLE_OAUTH_CLIENT_SECRET"
        | "COOKIE_ENCRYPTION_KEY"
      >
    > {}
}
