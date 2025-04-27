import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../utils/upstream-utils";
import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";

/**
 * Registers Calendar-related tools with the MCP server
 */
export function registerCalendarTools(server: McpServer, props: Props) {
  const getCalendarClient = () => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: props.accessToken });
    return google.calendar({ version: "v3", auth });
  };

  // Tool to list upcoming events (existing)
  server.tool(
    "calendar_listEvents",
    "List upcoming calendar events",
    {
      timeMin: z
        .string()
        .datetime({ message: "Invalid datetime string. Must be ISO 8601." })
        .optional()
        .describe(
          "Start time (ISO string, e.g., '2023-10-26T10:00:00Z', default: now)"
        ),
      timeMax: z
        .string()
        .datetime({ message: "Invalid datetime string. Must be ISO 8601." })
        .optional()
        .describe(
          "End time (ISO string, e.g., '2023-10-27T10:00:00Z', default: 7 days from now)"
        ),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(2500) // Max allowed by API
        .default(10)
        .describe("Maximum number of results"),
      calendarId: z
        .string()
        .default("primary")
        .describe("Calendar ID (default: primary)"),
      query: z.string().optional().describe("Free text search query"),
      showDeleted: z
        .boolean()
        .default(false)
        .describe("Whether to include deleted events"),
    },
    async ({
      timeMin,
      timeMax,
      maxResults,
      calendarId,
      query,
      showDeleted,
    }) => {
      try {
        const calendar = getCalendarClient();
        const now = new Date();
        const defaultTimeMin = now.toISOString();
        const defaultTimeMax = new Date(
          now.getTime() + 7 * 24 * 60 * 60 * 1000
        ).toISOString();

        const params: calendar_v3.Params$Resource$Events$List = {
          calendarId,
          timeMin: timeMin || defaultTimeMin,
          timeMax: timeMax || defaultTimeMax,
          maxResults,
          singleEvents: true,
          orderBy: "startTime",
          showDeleted,
        };
        if (query) params.q = query;

        const response = await calendar.events.list(params);

        const formattedEvents = (response.data.items || []).map((event) => ({
          id: event.id,
          summary: event.summary || "(No Title)",
          start: event.start?.dateTime || event.start?.date,
          end: event.end?.dateTime || event.end?.date,
          status: event.status,
          location: event.location || "",
          description: event.description || "",
          attendees: event.attendees
            ? event.attendees.map((a) => ({
                email: a.email,
                name: a.displayName || "",
                responseStatus: a.responseStatus,
              }))
            : [],
        }));

        return {
          content: [
            {
              type: "text",
              text:
                formattedEvents.length > 0
                  ? `Events for calendar "${calendarId}":\n${JSON.stringify(
                      formattedEvents,
                      null,
                      2
                    )}`
                  : `No upcoming events found for calendar "${calendarId}".`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error listing calendar events:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing events: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool to create an event
  server.tool(
    "calendar_createEvent",
    "Create a new calendar event",
    {
      summary: z.string().describe("Title or summary of the event"),
      start: z
        .string()
        .datetime({ message: "Invalid datetime string. Must be ISO 8601." })
        .describe("Start time (ISO string, e.g., '2023-10-26T10:00:00Z')"),
      end: z
        .string()
        .datetime({ message: "Invalid datetime string. Must be ISO 8601." })
        .describe("End time (ISO string, e.g., '2023-10-26T11:00:00Z')"),
      calendarId: z
        .string()
        .default("primary")
        .describe("Calendar ID (default: primary)"),
      description: z
        .string()
        .optional()
        .describe("Detailed description of the event"),
      location: z.string().optional().describe("Location of the event"),
      colorId: z.string().optional().describe("Color ID for the event (1-11)"),
      attendees: z
        .array(z.string().email())
        .optional()
        .describe("List of attendee email addresses"),
      recurrence: z
        .string()
        .optional()
        .describe(
          "Recurrence rule (RRULE format, e.g., 'RRULE:FREQ=WEEKLY;COUNT=10')"
        ),
    },
    async ({
      summary,
      start,
      end,
      calendarId,
      description,
      location,
      colorId,
      attendees,
      recurrence,
    }) => {
      try {
        const calendar = getCalendarClient();
        const requestBody: calendar_v3.Schema$Event = {
          summary,
          start: { dateTime: start },
          end: { dateTime: end },
        };

        if (description) requestBody.description = description;
        if (location) requestBody.location = location;
        if (colorId) requestBody.colorId = colorId;
        if (attendees && attendees.length > 0) {
          requestBody.attendees = attendees.map((email) => ({ email }));
        }
        if (recurrence) {
          requestBody.recurrence = [recurrence];
        }

        const response = await calendar.events.insert({
          calendarId,
          requestBody,
          sendUpdates: attendees && attendees.length > 0 ? "all" : "none",
        });

        return {
          content: [
            {
              type: "text",
              text: `Event "${summary}" created successfully with ID: ${response.data.id} in calendar: ${calendarId}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating event:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error creating event: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool to get a specific event
  server.tool(
    "calendar_getEvent",
    "Get details of a specific calendar event",
    {
      eventId: z.string().describe("The ID of the event to retrieve"),
      calendarId: z
        .string()
        .default("primary")
        .describe("Calendar ID (default: primary)"),
    },
    async ({ eventId, calendarId }) => {
      try {
        const calendar = getCalendarClient();
        const response = await calendar.events.get({
          calendarId,
          eventId,
        });

        const data = response.data;
        let resultText = `Event Details (ID: ${data.id}):\n`;
        resultText += `Title: ${data.summary || "(No Title)"}\n`;
        resultText += `Status: ${data.status}\n`;
        resultText += `Start: ${data.start?.dateTime || data.start?.date}\n`;
        resultText += `End: ${data.end?.dateTime || data.end?.date}\n`;
        if (data.description)
          resultText += `Description: ${data.description}\n`;
        if (data.location) resultText += `Location: ${data.location}\n`;
        if (data.attendees && data.attendees.length > 0) {
          resultText += `Attendees: ${data.attendees
            .map((a) => `${a.email} (${a.responseStatus})`)
            .join(", ")}\n`;
        }
        if (data.recurrence)
          resultText += `Recurrence: ${data.recurrence.join(", ")}\n`;
        if (data.organizer?.email)
          resultText += `Organizer: ${data.organizer.email}\n`;
        if (data.htmlLink) resultText += `Link: ${data.htmlLink}\n`;

        return {
          content: [{ type: "text", text: resultText }],
        };
      } catch (error: any) {
        console.error("Error getting event:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error getting event ${eventId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to update an event
  server.tool(
    "calendar_updateEvent",
    "Update an existing calendar event",
    {
      eventId: z.string().describe("The ID of the event to update"),
      calendarId: z
        .string()
        .default("primary")
        .describe("Calendar ID (default: primary)"),
      changes: z
        .object({
          summary: z.string().optional(),
          description: z.string().optional(),
          start: z
            .string()
            .datetime()
            .optional()
            .describe("New start time (ISO string)"),
          end: z
            .string()
            .datetime()
            .optional()
            .describe("New end time (ISO string)"),
          location: z.string().optional(),
          colorId: z.string().optional(),
          attendees: z.array(z.string().email()).optional(),
          recurrence: z.string().optional(),
        })
        .describe("Object containing the fields to update"),
    },
    async ({ eventId, calendarId, changes }) => {
      try {
        const calendar = getCalendarClient();
        const updatedEvent: calendar_v3.Schema$Event = {};

        // Map changes to the request body, handling nested structures
        if (changes.summary !== undefined)
          updatedEvent.summary = changes.summary;
        if (changes.description !== undefined)
          updatedEvent.description = changes.description;
        if (changes.location !== undefined)
          updatedEvent.location = changes.location;
        if (changes.colorId !== undefined)
          updatedEvent.colorId = changes.colorId;
        if (changes.start) updatedEvent.start = { dateTime: changes.start };
        if (changes.end) updatedEvent.end = { dateTime: changes.end };
        if (changes.attendees)
          updatedEvent.attendees = changes.attendees.map((email) => ({
            email,
          }));
        if (changes.recurrence) updatedEvent.recurrence = [changes.recurrence];

        if (Object.keys(updatedEvent).length === 0) {
          return {
            content: [{ type: "text", text: "No changes provided to update." }],
          };
        }

        const response = await calendar.events.patch({
          calendarId,
          eventId,
          requestBody: updatedEvent,
          sendUpdates: changes.attendees ? "all" : "none",
        });

        return {
          content: [
            {
              type: "text",
              text: `Event "${response.data.summary}" (ID: ${eventId}) updated successfully.`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error updating event:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error updating event ${eventId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to delete an event
  server.tool(
    "calendar_deleteEvent",
    "Delete a calendar event",
    {
      eventId: z.string().describe("The ID of the event to delete"),
      calendarId: z
        .string()
        .default("primary")
        .describe("Calendar ID (default: primary)"),
      sendUpdates: z
        .enum(["all", "none", "externalOnly"])
        .default("all")
        .describe("Whether to send notifications to attendees"),
    },
    async ({ eventId, calendarId, sendUpdates }) => {
      try {
        const calendar = getCalendarClient();
        await calendar.events.delete({
          calendarId,
          eventId,
          sendUpdates,
        });

        return {
          content: [
            {
              type: "text",
              text: `Event ${eventId} deleted successfully from calendar ${calendarId}.`,
            },
          ],
        };
      } catch (error: any) {
        // Handle 'gone' error specifically (event already deleted)
        if (error.code === 410) {
          return {
            content: [
              {
                type: "text",
                text: `Event ${eventId} was already deleted or does not exist.`,
              },
            ],
          };
        }
        console.error("Error deleting event:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error deleting event ${eventId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to find free time slots
  server.tool(
    "calendar_findFreeTime",
    "Find free time slots across specified calendars",
    {
      startTime: z
        .string()
        .datetime()
        .describe("Start of the time range to search (ISO string)"),
      endTime: z
        .string()
        .datetime()
        .describe("End of the time range to search (ISO string)"),
      durationMinutes: z
        .number()
        .int()
        .positive()
        .describe("Required duration of the free slot in minutes"),
      calendarIds: z
        .array(z.string())
        .min(1)
        .default(["primary"])
        .describe("List of calendar IDs to check (default: primary)"),
    },
    async ({ startTime, endTime, durationMinutes, calendarIds }) => {
      try {
        const calendar = getCalendarClient();
        const timeMin = new Date(startTime);
        const timeMax = new Date(endTime);
        const durationMs = durationMinutes * 60 * 1000;

        // Use the freebusy query API for efficiency
        const response = await calendar.freebusy.query({
          requestBody: {
            timeMin: timeMin.toISOString(),
            timeMax: timeMax.toISOString(),
            items: calendarIds.map((id) => ({ id })),
          },
        });

        const busySlots: { start: number; end: number }[] = [];
        for (const calId in response.data.calendars) {
          const calendarInfo = response.data.calendars[calId];
          if (calendarInfo.busy) {
            calendarInfo.busy.forEach((slot) => {
              busySlots.push({
                start: new Date(slot.start!).getTime(),
                end: new Date(slot.end!).getTime(),
              });
            });
          }
        }

        // Sort busy slots
        busySlots.sort((a, b) => a.start - b.start);

        // Merge overlapping busy slots
        const mergedBusySlots: { start: number; end: number }[] = [];
        if (busySlots.length > 0) {
          let currentSlot = { ...busySlots[0] };
          for (let i = 1; i < busySlots.length; i++) {
            if (busySlots[i].start <= currentSlot.end) {
              currentSlot.end = Math.max(currentSlot.end, busySlots[i].end);
            } else {
              mergedBusySlots.push(currentSlot);
              currentSlot = { ...busySlots[i] };
            }
          }
          mergedBusySlots.push(currentSlot);
        }

        // Find free slots
        const freeSlots: { start: string; end: string }[] = [];
        let currentCheckTime = timeMin.getTime();

        for (const busy of mergedBusySlots) {
          if (
            busy.start > currentCheckTime &&
            busy.start - currentCheckTime >= durationMs
          ) {
            freeSlots.push({
              start: new Date(currentCheckTime).toISOString(),
              end: new Date(busy.start).toISOString(),
            });
          }
          currentCheckTime = Math.max(currentCheckTime, busy.end);
        }

        // Check free time after the last busy slot
        if (
          timeMax.getTime() > currentCheckTime &&
          timeMax.getTime() - currentCheckTime >= durationMs
        ) {
          freeSlots.push({
            start: new Date(currentCheckTime).toISOString(),
            end: timeMax.toISOString(),
          });
        }

        if (freeSlots.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No free time slots found matching the criteria.",
              },
            ],
          };
        }

        const resultText =
          "Available time slots:\n" +
          freeSlots
            .map(
              (slot) =>
                `${new Date(slot.start).toLocaleString()} - ${new Date(
                  slot.end
                ).toLocaleString()}`
            )
            .join("\n");

        return { content: [{ type: "text", text: resultText }] };
      } catch (error: any) {
        console.error("Error finding free time:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error finding free time: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to list user's calendars
  server.tool(
    "calendar_listCalendars",
    "List all calendars the user has access to",
    {}, // No parameters needed
    async () => {
      try {
        const calendar = getCalendarClient();
        const response = await calendar.calendarList.list();

        const calendars = (response.data.items || []).map((cal) => ({
          id: cal.id,
          summary: cal.summary,
          description: cal.description || "",
          primary: !!cal.primary,
          accessRole: cal.accessRole,
          backgroundColor: cal.backgroundColor,
        }));

        return {
          content: [
            {
              type: "text",
              text:
                calendars.length > 0
                  ? `User Calendars:\n${JSON.stringify(calendars, null, 2)}`
                  : "No calendars found.",
            },
          ],
        };
      } catch (error: any) {
        console.error("Error listing calendars:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing calendars: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );
}
