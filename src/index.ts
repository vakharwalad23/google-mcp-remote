import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { GoogleHandler } from "./auth-handler";
import type { Props } from "./utils/upstream-utils";
import { registerAllTools } from "./tools";

export class MyMCP extends McpAgent<Env, unknown, Props> {
  server = new McpServer({
    name: "Google MCP Server - Remote",
    version: "1.0.0",
  });

  async init() {
    // Hello, world!
    this.server.tool(
      "greet",
      "Greet the use with a message",
      { name: z.string() },
      async ({ name }) => ({
        content: [{ type: "text", text: `Hello, ${name}!` }],
      })
    );
    registerAllTools(this.server, this.props);
  }
}

export default new OAuthProvider({
  apiRoute: "/sse",
  apiHandler: MyMCP.mount("/sse") as any,
  defaultHandler: GoogleHandler as any,
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
});
