import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../utils/upstream-utils";
import { google } from "googleapis";

/**
 * Registers Calendar-related tools with the MCP server
 */
export function registerCalendarTools(server: McpServer, props: Props) {
  // Tool to list upcoming events
  server.tool(
    "calendar.listEvents",
    "List upcoming calendar events",
    {
      timeMin: z
        .string()
        .optional()
        .describe("Start time (ISO string, default: now)"),
      timeMax: z
        .string()
        .optional()
        .describe("End time (ISO string, default: 7 days from now)"),
      maxResults: z
        .number()
        .min(1)
        .max(100)
        .default(10)
        .describe("Maximum number of results"),
      calendarId: z
        .string()
        .default("primary")
        .describe("Calendar ID (default: primary)"),
    },
    async ({ timeMin, timeMax, maxResults, calendarId }) => {
      try {
        // Initialize Google API client
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: props.accessToken });
        const calendar = google.calendar({ version: "v3", auth });

        // Set default time range if not provided
        const now = new Date();
        const defaultTimeMin = now.toISOString();
        const defaultTimeMax = new Date(
          now.getTime() + 7 * 24 * 60 * 60 * 1000
        ).toISOString();

        // List events
        const response = await calendar.events.list({
          calendarId,
          timeMin: timeMin || defaultTimeMin,
          timeMax: timeMax || defaultTimeMax,
          maxResults,
          singleEvents: true,
          orderBy: "startTime",
        });

        // Format events for display
        const formattedEvents = (response.data.items || []).map((event) => {
          return {
            id: event.id,
            summary: event.summary || "(No Title)",
            start: event.start,
            end: event.end,
            location: event.location || "",
            description: event.description || "",
            attendees: event.attendees
              ? event.attendees.map((a) => ({
                  email: a.email,
                  name: a.displayName || "",
                }))
              : [],
          };
        });

        return {
          content: [
            {
              type: "text",
              text:
                formattedEvents.length > 0
                  ? JSON.stringify(formattedEvents, null, 2)
                  : "No upcoming events found.",
            },
          ],
        };
      } catch (error) {
        console.error("Error listing calendar events:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing events: ${
                error instanceof Error ? error.message : String(error)
              }`,
            },
          ],
        };
      }
    }
  );
}
