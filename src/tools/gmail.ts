import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../utils/upstream-utils";
import { google, gmail_v1 } from "googleapis";

/**
 * Registers Gmail-related tools with the MCP server
 */
export function registerGmailTools(server: McpServer, props: Props) {
  const getGmailClient = () => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: props.accessToken });
    return google.gmail({ version: "v1", auth });
  };

  // Tool to send an email (Updated)
  server.tool(
    "gmail_sendEmail",
    "Send an email to specified recipients",
    {
      to: z
        .array(z.string().email())
        .min(1)
        .describe("Primary recipient email addresses"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body content"),
      cc: z
        .array(z.string().email())
        .optional()
        .describe("CC recipient email addresses"),
      bcc: z
        .array(z.string().email())
        .optional()
        .describe("BCC recipient email addresses"),
      isHtml: z
        .boolean()
        .default(false)
        .describe("Set to true if the body is HTML content"),
    },
    async ({ to, subject, body, cc, bcc, isHtml }) => {
      try {
        const gmail = getGmailClient();
        const emailLines = [];
        emailLines.push(`To: ${to.join(", ")}`);
        if (cc && cc.length) emailLines.push(`Cc: ${cc.join(", ")}`);
        if (bcc && bcc.length) emailLines.push(`Bcc: ${bcc.join(", ")}`);
        emailLines.push(`Subject: ${subject}`);
        emailLines.push(
          `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=utf-8`
        );
        emailLines.push("");
        emailLines.push(body);

        const email = emailLines.join("\r\n");
        const encodedEmail = Buffer.from(email)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const response = await gmail.users.messages.send({
          userId: "me",
          requestBody: { raw: encodedEmail },
        });

        return {
          content: [
            {
              type: "text",
              text: `Email sent successfully. Message ID: ${response.data.id}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error sending email:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error sending email: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool to list emails (Updated)
  server.tool(
    "gmail_listEmails",
    "List emails with optional query, labels, and limits. Returns a summary including IDs.",
    {
      query: z
        .string()
        .optional()
        .describe(
          "Search query (same format as Gmail search, e.g., 'from:user@example.com')"
        ),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(500)
        .default(10)
        .describe("Maximum number of results"),
      labelIds: z
        .array(z.string())
        .optional()
        .describe("List of label IDs to filter by (e.g., ['INBOX', 'UNREAD'])"),
    },
    async ({ query, maxResults, labelIds }) => {
      try {
        const gmail = getGmailClient();
        const params: gmail_v1.Params$Resource$Users$Messages$List = {
          userId: "me",
          maxResults,
        };
        if (query) params.q = query;
        if (labelIds) params.labelIds = labelIds;

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

        // Get minimal details (metadata) for each message
        const emailDetailsPromises = messageList.data.messages.map(
          async (msg) => {
            if (!msg.id) return null;
            try {
              const msgDetails = await gmail.users.messages.get({
                userId: "me",
                id: msg.id,
                format: "metadata",
                metadataHeaders: ["Subject", "From", "Date"],
              });
              const headers = msgDetails.data.payload?.headers || [];
              const subject =
                headers.find((h) => h.name === "Subject")?.value ||
                "(No subject)";
              const from = headers.find((h) => h.name === "From")?.value || "";
              const date = headers.find((h) => h.name === "Date")?.value || "";
              return {
                id: msg.id,
                subject,
                from,
                date,
                snippet: msgDetails.data.snippet || "",
              };
            } catch (detailError: any) {
              console.error(
                `Error fetching details for message ${msg.id}:`,
                detailError
              );
              return {
                id: msg.id,
                subject: "(Error fetching details)",
                from: "",
                date: "",
                snippet: "",
              };
            }
          }
        );

        const emails = (await Promise.all(emailDetailsPromises)).filter(
          (e) => e !== null
        );

        // Format results
        const formattedResults = emails
          .map(
            (msg, index) =>
              `[${index + 1}] ID: ${msg!.id}\nFrom: ${msg!.from}\nDate: ${
                msg!.date
              }\nSubject: ${msg!.subject}\nSnippet: ${msg!.snippet}`
          )
          .join("\n\n---\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Found ${emails.length} emails:\n\n${formattedResults}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error listing emails:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing emails: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool to get a specific email's content
  server.tool(
    "gmail_getEmail",
    "Get the full content of a specific email by its ID.",
    {
      messageId: z.string().describe("The ID of the email message to retrieve"),
      format: z
        .enum(["full", "metadata", "minimal", "raw"])
        .default("full")
        .describe("Format of the message data returned"),
    },
    async ({ messageId, format }) => {
      try {
        const gmail = getGmailClient();
        const response = await gmail.users.messages.get({
          userId: "me",
          id: messageId,
          format: format,
        });

        const { payload, snippet, labelIds, internalDate } = response.data;
        if (!payload || !payload.headers) {
          return {
            content: [
              {
                type: "text",
                text: `Could not retrieve payload/headers for message ${messageId}.`,
              },
            ],
          };
        }
        const headers = payload.headers;

        const subject =
          headers.find((h) => h.name?.toLowerCase() === "subject")?.value ||
          "(No subject)";
        const from =
          headers.find((h) => h.name?.toLowerCase() === "from")?.value || "";
        const to =
          headers.find((h) => h.name?.toLowerCase() === "to")?.value || "";
        const dateHeader =
          headers.find((h) => h.name?.toLowerCase() === "date")?.value || "";
        const date =
          dateHeader ||
          (internalDate
            ? new Date(parseInt(internalDate)).toISOString()
            : "Unknown");

        // Function to find and decode the body part (handles multipart)
        const findBody = (part: gmail_v1.Schema$MessagePart): string => {
          if (
            part.body?.data &&
            (part.mimeType === "text/plain" || part.mimeType === "text/html")
          ) {
            return Buffer.from(part.body.data, "base64").toString("utf8");
          }
          if (part.parts) {
            // Prefer text/plain, fallback to text/html
            const plainPart = part.parts.find(
              (p) => p.mimeType === "text/plain"
            );
            if (plainPart?.body?.data)
              return Buffer.from(plainPart.body.data, "base64").toString(
                "utf8"
              );
            const htmlPart = part.parts.find((p) => p.mimeType === "text/html");
            if (htmlPart?.body?.data)
              return Buffer.from(htmlPart.body.data, "base64").toString("utf8");
            // Recurse if needed (though usually not necessary for plain/html)
            for (const subPart of part.parts) {
              const subBody = findBody(subPart);
              if (subBody) return subBody;
            }
          }
          return "";
        };

        const body = findBody(payload);

        let result = `Subject: ${subject}\n`;
        result += `From: ${from}\n`;
        result += `To: ${to}\n`;
        result += `Date: ${date}\n`;
        result += `Labels: ${(labelIds || []).join(", ")}\n\n`;
        result += `Snippet: ${snippet || ""}\n\n`;
        result += `Body:\n${body.substring(0, 2000)}${
          body.length > 2000 ? "... (truncated)" : ""
        }`; // Truncate long bodies

        return { content: [{ type: "text", text: result }] };
      } catch (error: any) {
        console.error(`Error getting email ${messageId}:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error getting email ${messageId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to create a draft email
  server.tool(
    "gmail_draftEmail",
    "Create a draft email in Gmail.",
    {
      to: z
        .array(z.string().email())
        .min(1)
        .describe("Primary recipient email addresses"),
      subject: z.string().describe("Email subject"),
      body: z.string().describe("Email body content"),
      cc: z
        .array(z.string().email())
        .optional()
        .describe("CC recipient email addresses"),
      bcc: z
        .array(z.string().email())
        .optional()
        .describe("BCC recipient email addresses"),
      isHtml: z
        .boolean()
        .default(false)
        .describe("Set to true if the body is HTML content"),
    },
    async ({ to, subject, body, cc, bcc, isHtml }) => {
      try {
        const gmail = getGmailClient();
        const emailLines = [];
        emailLines.push(`To: ${to.join(", ")}`);
        if (cc && cc.length) emailLines.push(`Cc: ${cc.join(", ")}`);
        if (bcc && bcc.length) emailLines.push(`Bcc: ${bcc.join(", ")}`);
        emailLines.push(`Subject: ${subject}`);
        emailLines.push(
          `Content-Type: ${isHtml ? "text/html" : "text/plain"}; charset=utf-8`
        );
        emailLines.push("");
        emailLines.push(body);

        const email = emailLines.join("\r\n");
        const encodedEmail = Buffer.from(email)
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const response = await gmail.users.drafts.create({
          userId: "me",
          requestBody: { message: { raw: encodedEmail } },
        });

        return {
          content: [
            {
              type: "text",
              text: `Draft created successfully. Draft ID: ${response.data.id}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating draft:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error creating draft: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool to delete an email
  server.tool(
    "gmail_deleteEmail",
    "Delete an email (moves to trash by default).",
    {
      messageId: z.string().describe("The ID of the email message to delete"),
      permanently: z
        .boolean()
        .default(false)
        .describe(
          "Set to true to delete permanently instead of moving to trash"
        ),
    },
    async ({ messageId, permanently }) => {
      try {
        const gmail = getGmailClient();
        if (permanently) {
          await gmail.users.messages.delete({ userId: "me", id: messageId });
          return {
            content: [
              {
                type: "text",
                text: `Message ${messageId} permanently deleted.`,
              },
            ],
          };
        } else {
          await gmail.users.messages.trash({ userId: "me", id: messageId });
          return {
            content: [
              { type: "text", text: `Message ${messageId} moved to trash.` },
            ],
          };
        }
      } catch (error: any) {
        if (error.code === 404) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Message ID ${messageId} not found.`,
              },
            ],
          };
        }
        console.error(`Error deleting message ${messageId}:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error deleting message ${messageId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to modify email labels
  server.tool(
    "gmail_modifyLabels",
    "Add or remove labels from an email.",
    {
      messageId: z.string().describe("The ID of the email message to modify"),
      addLabelIds: z
        .array(z.string())
        .optional()
        .describe("List of label IDs to add (e.g., ['UNREAD', 'IMPORTANT'])"),
      removeLabelIds: z
        .array(z.string())
        .optional()
        .describe("List of label IDs to remove (e.g., ['INBOX'])"),
    },
    async ({ messageId, addLabelIds, removeLabelIds }) => {
      try {
        if (!addLabelIds && !removeLabelIds) {
          return {
            content: [
              { type: "text", text: "No labels specified to add or remove." },
            ],
          };
        }
        const gmail = getGmailClient();
        await gmail.users.messages.modify({
          userId: "me",
          id: messageId,
          requestBody: {
            addLabelIds: addLabelIds || [],
            removeLabelIds: removeLabelIds || [],
          },
        });

        let result = `Successfully modified labels for message ${messageId}.`;
        if (addLabelIds && addLabelIds.length > 0)
          result += `\nAdded: ${addLabelIds.join(", ")}`;
        if (removeLabelIds && removeLabelIds.length > 0)
          result += `\nRemoved: ${removeLabelIds.join(", ")}`;

        return { content: [{ type: "text", text: result }] };
      } catch (error: any) {
        if (error.code === 404) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Message ID ${messageId} not found.`,
              },
            ],
          };
        }
        console.error(
          `Error modifying labels for message ${messageId}:`,
          error
        );
        return {
          content: [
            {
              type: "text",
              text: `Error modifying labels for message ${messageId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to list labels
  server.tool(
    "gmail_listLabels",
    "List all available Gmail labels.",
    {}, // No parameters
    async () => {
      try {
        const gmail = getGmailClient();
        const response = await gmail.users.labels.list({ userId: "me" });
        const labels = (response.data.labels || []).map((label) => ({
          id: label.id,
          name: label.name,
          type: label.type, // 'system' or 'user'
          messageListVisibility: label.messageListVisibility, // e.g., 'show', 'hide'
          labelListVisibility: label.labelListVisibility, // e.g., 'labelShow', 'labelHide'
        }));

        return {
          content: [
            {
              type: "text",
              text: `Available Labels:\n${JSON.stringify(labels, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error listing labels:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing labels: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );
}
