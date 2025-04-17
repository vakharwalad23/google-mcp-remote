import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../utils/upstream-utils";
import { google, people_v1 } from "googleapis";

/**
 * Registers Google Contacts (People API) related tools with the MCP server.
 */
export function registerContactsTools(server: McpServer, props: Props) {
  const getPeopleClient = () => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: props.accessToken });
    return google.people({ version: "v1", auth });
  };

  // Tool to list contacts
  server.tool(
    "contacts.listContacts",
    "List contacts from the user's Google Contacts.",
    {
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(1000)
        .default(20)
        .describe("Maximum number of contacts to return"),
      // Common fields: names,emailAddresses,phoneNumbers
      readMask: z
        .string()
        .default("names,emailAddresses,phoneNumbers")
        .describe("Comma-separated list of fields to include for each contact"),
      // Other options: sources, requestSyncToken, pageToken
    },
    async ({ pageSize, readMask }) => {
      try {
        const people = getPeopleClient();
        const response = await people.people.connections.list({
          resourceName: "people/me",
          pageSize,
          personFields: readMask,
          // Add sortOrder if needed: people.connections.list({ sortOrder: 'LAST_MODIFIED_ASCENDING' })
        });

        const connections = response.data.connections;
        if (!connections || connections.length === 0) {
          return { content: [{ type: "text", text: "No contacts found." }] };
        }

        const formattedContacts = connections.map((person) => ({
          resourceName: person.resourceName,
          name: person.names?.[0]?.displayName || "N/A",
          emails:
            person.emailAddresses?.map((e) => e.value).filter(Boolean) || [],
          phoneNumbers:
            person.phoneNumbers?.map((p) => p.value).filter(Boolean) || [],
        }));

        return {
          content: [
            {
              type: "text",
              text: `Contacts:\n${JSON.stringify(formattedContacts, null, 2)}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error listing contacts:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing contacts: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool to search contacts
  server.tool(
    "contacts.searchContacts",
    "Search for contacts by name, email, or phone number.",
    {
      query: z.string().min(1).describe("The query string to search for"),
      pageSize: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(10)
        .describe("Maximum number of results (max 30 for search)"),
      readMask: z
        .string()
        .default("names,emailAddresses,phoneNumbers")
        .describe("Comma-separated list of fields to include"),
    },
    async ({ query, pageSize, readMask }) => {
      try {
        const people = getPeopleClient();
        // Note: The search API is people.searchContacts, not people.connections.search
        const response = await people.people.searchContacts({
          // Corrected API endpoint
          query,
          pageSize,
          readMask,
        });

        const results = response.data.results;
        if (!results || results.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No contacts found matching query "${query}".`,
              },
            ],
          };
        }

        const formattedResults = results.map((result) => ({
          resourceName: result.person?.resourceName,
          name: result.person?.names?.[0]?.displayName || "N/A",
          emails:
            result.person?.emailAddresses
              ?.map((e) => e.value)
              .filter(Boolean) || [],
          phoneNumbers:
            result.person?.phoneNumbers?.map((p) => p.value).filter(Boolean) ||
            [],
        }));

        return {
          content: [
            {
              type: "text",
              text: `Contact Search Results for "${query}":\n${JSON.stringify(
                formattedResults,
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error searching contacts:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error searching contacts: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to get a specific contact's details
  server.tool(
    "contacts.getContact",
    "Get detailed information for a specific contact using their resource name.",
    {
      resourceName: z
        .string()
        .min(1)
        .startsWith("people/")
        .describe(
          "The resource name of the contact (e.g., 'people/c123456789')"
        ),
      readMask: z
        .string()
        .default(
          "names,emailAddresses,phoneNumbers,birthdays,addresses,organizations,biographies"
        )
        .describe("Comma-separated list of fields to include"),
    },
    async ({ resourceName, readMask }) => {
      try {
        const people = getPeopleClient();
        const response = await people.people.get({
          resourceName,
          personFields: readMask,
        });

        const person = response.data;

        // Format the output nicely
        const details = {
          resourceName: person.resourceName,
          names: person.names,
          emailAddresses: person.emailAddresses,
          phoneNumbers: person.phoneNumbers,
          birthdays: person.birthdays,
          addresses: person.addresses,
          organizations: person.organizations,
          biographies: person.biographies,
          // Add other fields from readMask as needed
        };

        return {
          content: [
            {
              type: "text",
              text: `Contact Details (${resourceName}):\n${JSON.stringify(
                details,
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 404) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Contact with resource name ${resourceName} not found.`,
              },
            ],
          };
        }
        console.error(`Error getting contact ${resourceName}:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error getting contact: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // TODO
  // Add tools for creating/updating contacts if needed, ensuring you have the correct write scopes.
}
