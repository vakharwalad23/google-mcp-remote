import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GoogleHandler } from "./auth-handler";
import { Props } from "./utils/upstream-utils";

export class GoogleMcpRemote extends McpAgent<Props, Env> {
  server = new McpServer({
    name: "Google OAuth Proxy Demo",
    version: "1.0.0",
  });

  async init() {
    // Hello, world!
    this.server.tool(
      "add",
      "Add two numbers the way only MCP can",
      { a: z.number(), b: z.number() },
      async ({ a, b }) => ({
        content: [{ type: "text", text: String(a + b) }],
      })
    );
  }
}

export default new OAuthProvider({
  apiRoute: "/sse",
  apiHandler: GoogleMcpRemote.mount("/sse") as unknown as any,
  defaultHandler: GoogleHandler as unknown as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
