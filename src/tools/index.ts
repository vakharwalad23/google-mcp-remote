import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Props } from "../utils/upstream-utils";
import { registerGmailTools } from "./gmail";
import { registerCalendarTools } from "./calendar";
import { registerDriveTools } from "./drive";
import { registerTasksTools } from "./tasks";
import { registerContactsTools } from "./contacts";
import { registerYouTubeTools } from "./youtube";

/**
 * Registers all Google MCP tools with the server
 */
export function registerAllTools(server: McpServer, props: Props) {
  // Register individual tool categories
  registerGmailTools(server, props);
  registerCalendarTools(server, props);
  registerDriveTools(server, props);
  registerTasksTools(server, props);
  registerContactsTools(server, props);
  registerYouTubeTools(server, props);
}
