import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../utils/upstream-utils";
import { google } from "googleapis";

/**
 * Registers Drive-related tools with the MCP server
 */
export function registerDriveTools(server: McpServer, props: Props) {
  // Tool to list files
  server.tool(
    "drive.listFiles",
    "List files from Google Drive",
    {
      query: z.string().optional().describe("Search query for files"),
      maxResults: z
        .number()
        .min(1)
        .max(1000)
        .default(20)
        .describe("Maximum number of results"),
      orderBy: z
        .string()
        .optional()
        .default("modifiedTime desc")
        .describe("Field to sort by"),
    },
    async ({ query, maxResults, orderBy }) => {
      try {
        // Initialize Google API client
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: props.accessToken });
        const drive = google.drive({ version: "v3", auth });

        // List files
        const response = await drive.files.list({
          pageSize: maxResults,
          q: query,
          orderBy: orderBy,
          fields:
            "files(id,name,mimeType,createdTime,modifiedTime,webViewLink,size,owners,shared)",
        });

        return {
          content: [
            {
              type: "text",
              text:
                response.data.files && response.data.files.length > 0
                  ? JSON.stringify(response.data.files, null, 2)
                  : "No files found matching your criteria.",
            },
          ],
        };
      } catch (error) {
        console.error("Error listing drive files:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing files: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );
}
