import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../utils/upstream-utils";
import { google } from "googleapis";

/**
 * Registers Gmail-related tools with the MCP server
 */
export function registerGmailTools(server: McpServer, props: Props) {
  // Tool to send an email
  server.tool(
    "gmail.sendEmail",
    "Send an email to specified recipients",
    {
      to: z
        .string()
        .describe("Primary recipient(s) email addresses (comma-separated)"),
      cc: z
        .string()
        .optional()
        .describe("CC recipient(s) email addresses (comma-separated)"),
      bcc: z
        .string()
        .optional()
        .describe("BCC recipient(s) email addresses (comma-separated)"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body (can contain HTML)"),
    },
    async ({ to, cc, bcc, subject, body }) => {
      try {
        // Initialize Google API client
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: props.accessToken });
        const gmail = google.gmail({ version: "v1", auth });

        // Create email in RFC 2822 format
        const email = [
          `To: ${to}`,
          cc ? `Cc: ${cc}` : "",
          bcc ? `Bcc: ${bcc}` : "",
          `Subject: ${subject}`,
          "Content-Type: text/html; charset=utf-8",
          "",
          body,
        ]
          .filter(Boolean)
          .join("\r\n");

        // Base64 encode the email
        const encodedEmail = Buffer.from(email)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        // Send the email through the Gmail API
        const response = await gmail.users.messages.send({
          userId: "me",
          requestBody: {
            raw: encodedEmail,
          },
        });

        return {
          content: [
            {
              type: "text",
              text: `Email sent successfully! Message ID: ${response.data.id}`,
            },
          ],
        };
      } catch (error) {
        console.error("Error sending email:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error sending email: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to list emails
  server.tool(
    "gmail.listEmails",
    "List emails with optional query and limits",
    {
      query: z
        .string()
        .optional()
        .describe("Search query (same format as Gmail search)"),
      maxResults: z
        .number()
        .min(1)
        .max(100)
        .default(10)
        .describe("Maximum number of results"),
      labelIds: z
        .string()
        .optional()
        .describe("Comma-separated list of label IDs"),
    },
    async ({ query, maxResults, labelIds }) => {
      try {
        // Initialize Google API client
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: props.accessToken });
        const gmail = google.gmail({ version: "v1", auth });

        // List messages with query parameters
        const params: any = {
          userId: "me",
          maxResults,
        };

        if (query) params.q = query;
        if (labelIds)
          params.labelIds = labelIds.split(",").map((l) => l.trim());

        const messageList = await gmail.users.messages.list(params);

        if (
          !messageList.data.messages ||
          messageList.data.messages.length === 0
        ) {
          return {
            content: [
              { type: "text", text: "No emails found matching the criteria." },
            ],
          };
        }

        // Get full message details for each message
        const emails = await Promise.all(
          messageList.data.messages.slice(0, maxResults).map(async (msg) => {
            const msgResponse = await gmail.users.messages.get({
              userId: "me",
              id: msg.id!,
            });
            return msgResponse.data;
          })
        );

        // Format the emails for display
        const formattedEmails = emails.map((email) => {
          // Extract headers
          const headers = (email.payload?.headers || []).reduce(
            (acc: any, header: any) => {
              acc[header.name.toLowerCase()] = header.value;
              return acc;
            },
            {}
          );

          return {
            id: email.id,
            threadId: email.threadId,
            from: headers.from || "Unknown",
            to: headers.to || "Unknown",
            subject: headers.subject || "(No Subject)",
            date: headers.date || "Unknown",
            snippet: email.snippet || "",
            labels: email.labelIds || [],
          };
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(formattedEmails, null, 2),
            },
          ],
        };
      } catch (error) {
        console.error("Error listing emails:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing emails: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );
}
