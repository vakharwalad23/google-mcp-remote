import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../utils/upstream-utils";
import { google, drive_v3 } from "googleapis";
import { Readable } from "stream"; // Needed for file content handling

/**
 * Registers Drive-related tools with the MCP server
 */
export function registerDriveTools(server: McpServer, props: Props) {
  const getDriveClient = () => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: props.accessToken });
    return google.drive({ version: "v3", auth });
  };

  // Tool to list files (existing)
  server.tool(
    "drive_listFiles",
    "List files from Google Drive. Default query is 'trashed = false'.",
    {
      query: z
        .string()
        .optional()
        .default("trashed = false")
        .describe(
          "Search query (e.g., 'name contains \"report\"', 'mimeType=\"image/jpeg\"')"
        ),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(20)
        .describe("Maximum number of results"),
      orderBy: z
        .string()
        .optional()
        .default("modifiedTime desc")
        .describe("Field(s) to sort by (e.g., 'modifiedTime desc', 'name')"),
      fields: z
        .string()
        .optional()
        .default("files(id, name, mimeType, modifiedTime, size, webViewLink)")
        .describe("Fields to include in the response"),
    },
    async ({ query, pageSize, orderBy, fields }) => {
      try {
        const drive = getDriveClient();
        const response = await drive.files.list({
          q: query,
          pageSize: pageSize,
          orderBy: orderBy,
          fields: fields,
        });

        if (!response.data.files || response.data.files.length === 0) {
          return {
            content: [
              { type: "text", text: "No files found matching your criteria." },
            ],
          };
        }

        // Format the output similar to the old class
        const formattedFiles = response.data.files
          .map((file: any) => {
            const size = file.size
              ? `${(parseInt(file.size) / 1024).toFixed(2)} KB`
              : "N/A";
            return `${file.name} (${file.mimeType})\nID: ${
              file.id
            }\nModified: ${file.modifiedTime}\nSize: ${size}\nLink: ${
              file.webViewLink || "N/A"
            }`;
          })
          .join("\n\n---\n\n");

        return {
          content: [
            { type: "text", text: `Files Found:\n\n${formattedFiles}` },
          ],
        };
      } catch (error: any) {
        console.error("Error listing drive files:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing files: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool to get file content
  server.tool(
    "drive_getFileContent",
    "Get the content of a file. Exports Google Docs/Sheets as text/csv.",
    {
      fileId: z
        .string()
        .describe("The ID of the file to retrieve content from"),
    },
    async ({ fileId }) => {
      try {
        const drive = getDriveClient();
        const fileMetadata = await drive.files.get({
          fileId: fileId,
          fields: "id, name, mimeType, webViewLink",
        });

        const { name, mimeType, webViewLink } = fileMetadata.data;

        if (!mimeType) {
          return {
            content: [
              {
                type: "text",
                text: `Could not determine MIME type for file: ${name} (ID: ${fileId})`,
              },
            ],
          };
        }

        // Handle text-based files
        if (
          mimeType.startsWith("text/") ||
          mimeType === "application/json" ||
          mimeType.includes("javascript")
        ) {
          const response = await drive.files.get(
            { fileId: fileId, alt: "media" },
            { responseType: "stream" }
          );
          // Read stream to string (simplified example, might need more robust handling for large files)
          const content = await streamToString(response.data as Readable);
          return {
            content: [
              {
                type: "text",
                text: `File: ${name} (ID: ${fileId})\nType: ${mimeType}\n\nContent:\n${content}`,
              },
            ],
          };
        }
        // Handle Google Docs/Sheets export
        else if (
          mimeType === "application/vnd.google-apps.document" ||
          mimeType === "application/vnd.google-apps.spreadsheet"
        ) {
          const exportMimeType =
            mimeType === "application/vnd.google-apps.spreadsheet"
              ? "text/csv"
              : "text/plain";
          const response = await drive.files.export(
            { fileId: fileId, mimeType: exportMimeType },
            { responseType: "stream" }
          );
          const content = await streamToString(response.data as Readable);
          return {
            content: [
              {
                type: "text",
                text: `File: ${name} (ID: ${fileId})\nType: ${mimeType}\nExported as: ${exportMimeType}\n\nContent:\n${content}`,
              },
            ],
          };
        }
        // Handle other types
        else {
          return {
            content: [
              {
                type: "text",
                text: `File: ${name} (ID: ${fileId})\nType: ${mimeType}\nLink: ${webViewLink}\n\nContent preview is not available for this file type.`,
              },
            ],
          };
        }
      } catch (error: any) {
        console.error("Error getting file content:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error getting content for file ${fileId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to create a file
  server.tool(
    "drive_createFile",
    "Create a new file (text or Google Doc/Sheet/etc.)",
    {
      name: z.string().describe("The name of the new file"),
      content: z
        .string()
        .optional()
        .describe(
          "The text content for the file (ignored for Google Apps types)"
        ),
      mimeType: z
        .string()
        .default("text/plain")
        .describe(
          "MIME type (e.g., 'text/plain', 'application/vnd.google-apps.document')"
        ),
      folderId: z
        .string()
        .optional()
        .describe("ID of the folder to create the file in"),
    },
    async ({ name, content, mimeType, folderId }) => {
      try {
        const drive = getDriveClient();
        const fileMetadata: drive_v3.Schema$File = { name };
        if (folderId) fileMetadata.parents = [folderId];

        let response;
        // Handle Google Apps types (no content upload)
        if (mimeType.startsWith("application/vnd.google-apps")) {
          fileMetadata.mimeType = mimeType;
          response = await drive.files.create({
            requestBody: fileMetadata,
            fields: "id, name, webViewLink, mimeType",
          });
          const { id, webViewLink, mimeType: createdMimeType } = response.data;
          return {
            content: [
              {
                type: "text",
                text: `Created ${createdMimeType} '${name}'\nID: ${id}\nLink: ${webViewLink}`,
              },
            ],
          };
        }
        // Handle regular files with content
        else {
          if (content === undefined) {
            return {
              content: [
                {
                  type: "text",
                  text: "Error: Content is required for non-Google Apps file types.",
                },
              ],
            };
          }
          response = await drive.files.create({
            requestBody: fileMetadata,
            media: {
              mimeType: mimeType,
              body: content,
            },
            fields: "id, name, webViewLink, mimeType",
          });
          const { id, webViewLink, mimeType: createdMimeType } = response.data;
          return {
            content: [
              {
                type: "text",
                text: `Created file '${name}' (${createdMimeType})\nID: ${id}\nLink: ${
                  webViewLink || "N/A"
                }`,
              },
            ],
          };
        }
      } catch (error: any) {
        console.error("Error creating file:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error creating file '${name}': ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to update file content (only non-Google Apps types)
  server.tool(
    "drive_updateFileContent",
    "Update the content of an existing file (not applicable for Google Docs/Sheets).",
    {
      fileId: z.string().describe("The ID of the file to update"),
      content: z.string().describe("The new text content for the file"),
      mimeType: z
        .string()
        .optional()
        .describe("Optional: New MIME type for the file"),
    },
    async ({ fileId, content, mimeType }) => {
      try {
        const drive = getDriveClient();
        // Get metadata first to check type
        const meta = await drive.files.get({
          fileId,
          fields: "mimeType, name",
        });
        if (meta.data.mimeType?.startsWith("application/vnd.google-apps")) {
          return {
            content: [
              {
                type: "text",
                text: `Cannot update content for Google Apps file type (${meta.data.mimeType}). Use Google Drive interface.`,
              },
            ],
          };
        }

        const response = await drive.files.update({
          fileId: fileId,
          media: {
            mimeType: mimeType || meta.data.mimeType || "text/plain", // Use provided, existing, or default
            body: content,
          },
          fields: "id, name, modifiedTime",
        });

        return {
          content: [
            {
              type: "text",
              text: `File '${response.data.name}' (ID: ${fileId}) content updated successfully at ${response.data.modifiedTime}.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error updating file content:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error updating content for file ${fileId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to delete a file (move to trash or permanently)
  server.tool(
    "drive_deleteFile",
    "Delete a file (moves to trash by default).",
    {
      fileId: z.string().describe("The ID of the file to delete"),
      permanently: z
        .boolean()
        .default(false)
        .describe(
          "Set to true to delete permanently instead of moving to trash"
        ),
    },
    async ({ fileId, permanently }) => {
      try {
        const drive = getDriveClient();
        if (permanently) {
          await drive.files.delete({ fileId });
          return {
            content: [
              { type: "text", text: `File ID ${fileId} permanently deleted.` },
            ],
          };
        } else {
          await drive.files.update({ fileId, requestBody: { trashed: true } });
          return {
            content: [
              { type: "text", text: `File ID ${fileId} moved to trash.` },
            ],
          };
        }
      } catch (error: any) {
        // Handle 'notFound' error specifically
        if (error.code === 404) {
          return {
            content: [
              { type: "text", text: `Error: File ID ${fileId} not found.` },
            ],
          };
        }
        console.error("Error deleting file:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error deleting file ${fileId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to share a file
  server.tool(
    "drive_shareFile",
    "Share a file with a user.",
    {
      fileId: z.string().describe("The ID of the file to share"),
      emailAddress: z
        .string()
        .email()
        .describe("Email address of the user to share with"),
      role: z
        .enum(["reader", "commenter", "writer", "owner"])
        .default("reader")
        .describe("Role to grant the user"),
      sendNotification: z
        .boolean()
        .default(true)
        .describe("Whether to send an email notification"),
      message: z
        .string()
        .optional()
        .describe("Optional message to include in the notification email"),
    },
    async ({ fileId, emailAddress, role, sendNotification, message }) => {
      try {
        const drive = getDriveClient();
        await drive.permissions.create({
          fileId: fileId,
          requestBody: {
            type: "user",
            role: role,
            emailAddress: emailAddress,
          },
          sendNotificationEmail: sendNotification,
          emailMessage: message,
          fields: "id", // Request minimal fields
        });

        // Get file name for confirmation message
        const fileMeta = await drive.files.get({ fileId, fields: "name" });

        return {
          content: [
            {
              type: "text",
              text: `File '${fileMeta.data.name}' (ID: ${fileId}) shared with ${emailAddress} as ${role}.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error sharing file:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error sharing file ${fileId} with ${emailAddress}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );
}

// Helper function to read a stream into a string
async function streamToString(stream: Readable): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}
