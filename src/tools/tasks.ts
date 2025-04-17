import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../utils/upstream-utils";
import { google } from "googleapis";

/**
 * Registers Tasks-related tools with the MCP server
 */
export function registerTasksTools(server: McpServer, props: Props) {
  // Tool to list task lists
  server.tool("tasks.listTaskLists", "List all task lists", {}, async () => {
    try {
      // Initialize Google API client
      const auth = new google.auth.OAuth2();
      auth.setCredentials({ access_token: props.accessToken });
      const tasks = google.tasks({ version: "v1", auth });

      // List task lists
      const response = await tasks.tasklists.list();

      return {
        content: [
          {
            type: "text",
            text:
              response.data.items && response.data.items.length > 0
                ? JSON.stringify(response.data.items, null, 2)
                : "No task lists found.",
          },
        ],
      };
    } catch (error) {
      console.error("Error listing task lists:", error);
      return {
        content: [
          {
            type: "text",
            text: `Error listing task lists: ${
              error instanceof Error ? error.message : String(error)
            }`,
          },
        ],
      };
    }
  });
}
