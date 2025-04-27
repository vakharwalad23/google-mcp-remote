import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../utils/upstream-utils";
import { google, tasks_v1 } from "googleapis";

// Helper function to update a task
async function _updateTaskHelper(
  tasks: tasks_v1.Tasks,
  taskListId: string,
  taskId: string,
  updates: {
    title?: string | null;
    notes?: string | null;
    due?: string | null;
    status?: "needsAction" | "completed" | null;
  }
): Promise<tasks_v1.Schema$Task> {
  // Fetch the current task to apply updates correctly
  const currentTaskResponse = await tasks.tasks.get({
    tasklist: taskListId,
    task: taskId,
  });
  const currentTask = currentTaskResponse.data;

  // Create the request body by merging updates onto the current task data
  const requestBody: tasks_v1.Schema$Task = {
    ...currentTask, // Start with current data
    ...(updates.title !== undefined && { title: updates.title }),
    ...(updates.notes !== undefined && { notes: updates.notes }), // Handles null to clear
    ...(updates.due !== undefined && { due: updates.due }), // Handles null to clear
    ...(updates.status !== undefined && { status: updates.status }),
    // Ensure 'id' is not sent in the request body for update
    id: undefined,
    // Ensure other read-only fields are not sent
    kind: undefined,
    etag: undefined,
    selfLink: undefined,
    parent: undefined,
    position: undefined,
    hidden: undefined,
    links: undefined,
    deleted: undefined,
    completed: undefined, // Status handles completion
    updated: undefined,
  };

  // Clear fields explicitly set to null
  if (updates.notes === null) requestBody.notes = undefined;
  if (updates.due === null) requestBody.due = undefined;
  // Status cannot be null in the API schema, only 'needsAction' or 'completed'

  const response = await tasks.tasks.update({
    tasklist: taskListId,
    task: taskId,
    requestBody: requestBody,
  });

  return response.data;
}

/**
 * Registers Tasks-related tools with the MCP server
 */
export function registerTasksTools(server: McpServer, props: Props) {
  const getTasksClient = () => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: props.accessToken });
    return google.tasks({ version: "v1", auth });
  };

  // Tool to list task lists (Updated formatting)
  server.tool(
    "tasks_listTaskLists",
    "List all task lists",
    {}, // No parameters
    async () => {
      try {
        const tasks = getTasksClient();
        const response = await tasks.tasklists.list({ maxResults: 100 }); // Max allowed

        if (!response.data.items || response.data.items.length === 0) {
          return { content: [{ type: "text", text: "No task lists found." }] };
        }

        const formattedLists = response.data.items
          .map(
            (list: tasks_v1.Schema$TaskList) => `${list.title} - ID: ${list.id}`
          )
          .join("\n");

        return {
          content: [{ type: "text", text: `Task Lists:\n${formattedLists}` }],
        };
      } catch (error: any) {
        console.error("Error listing task lists:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing task lists: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to list tasks within a task list
  server.tool(
    "tasks_listTasks",
    "List tasks within a specific task list.",
    {
      taskListId: z
        .string()
        .default("@default")
        .describe(
          "ID of the task list (defaults to the primary list '@default')"
        ),
      showCompleted: z
        .boolean()
        .default(false)
        .describe("Whether to include completed tasks"),
      showHidden: z
        .boolean()
        .default(false)
        .describe("Whether to include hidden tasks"),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Maximum number of tasks to return"),
      dueMin: z
        .string()
        .datetime()
        .optional()
        .describe("Lower bound for a task's due date (RFC 3339 timestamp)"),
      dueMax: z
        .string()
        .datetime()
        .optional()
        .describe("Upper bound for a task's due date (RFC 3339 timestamp)"),
    },
    async ({
      taskListId,
      showCompleted,
      showHidden,
      maxResults,
      dueMin,
      dueMax,
    }) => {
      try {
        const tasks = getTasksClient();
        const params: tasks_v1.Params$Resource$Tasks$List = {
          tasklist: taskListId,
          showCompleted,
          showHidden,
          maxResults,
        };
        if (dueMin) params.dueMin = dueMin;
        if (dueMax) params.dueMax = dueMax;

        const response = await tasks.tasks.list(params);

        if (!response.data.items || response.data.items.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No tasks found in task list: ${taskListId}`,
              },
            ],
          };
        }

        const formattedTasks = response.data.items
          .map((task: tasks_v1.Schema$Task, index: number) => {
            const due = task.due
              ? `Due: ${new Date(task.due).toLocaleString()}`
              : "";
            const completed = task.completed
              ? `Completed: ${new Date(task.completed).toLocaleString()}`
              : "";
            const status = task.status || "needsAction"; // Default status

            return `[${index + 1}] ${task.title} - ID: ${
              task.id
            }\nStatus: ${status}\n${due}\n${completed}\n${
              task.notes ? `Notes: ${task.notes}` : ""
            }`.trim();
          })
          .join("\n\n---\n\n");

        return {
          content: [
            {
              type: "text",
              text: `Tasks in list "${taskListId}":\n\n${formattedTasks}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error listing tasks:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error listing tasks from list ${taskListId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to get a specific task
  server.tool(
    "tasks_getTask",
    "Get details of a specific task.",
    {
      taskId: z.string().describe("The ID of the task to retrieve"),
      taskListId: z
        .string()
        .default("@default")
        .describe(
          "ID of the task list containing the task (defaults to '@default')"
        ),
    },
    async ({ taskId, taskListId }) => {
      try {
        const tasks = getTasksClient();
        const response = await tasks.tasks.get({
          tasklist: taskListId,
          task: taskId,
        });

        const task = response.data;
        const due = task.due
          ? `Due: ${new Date(task.due).toLocaleString()}`
          : "";
        const completed = task.completed
          ? `Completed: ${new Date(task.completed).toLocaleString()}`
          : "";
        const status = task.status || "needsAction";

        const resultText = `Task: ${task.title}\nID: ${
          task.id
        }\nStatus: ${status}\n${due}\n${completed}\n${
          task.notes ? `Notes: ${task.notes}` : ""
        }`.trim();

        return { content: [{ type: "text", text: resultText }] };
      } catch (error: any) {
        if (error.code === 404) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Task ID ${taskId} not found in list ${taskListId}.`,
              },
            ],
          };
        }
        console.error("Error getting task:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error getting task ${taskId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to create a task
  server.tool(
    "tasks_createTask",
    "Create a new task.",
    {
      title: z.string().min(1).describe("The title of the task"),
      taskListId: z
        .string()
        .default("@default")
        .describe(
          "ID of the task list to add the task to (defaults to '@default')"
        ),
      notes: z.string().optional().describe("Optional notes for the task"),
      due: z
        .string()
        .datetime()
        .optional()
        .describe(
          "Optional due date (RFC 3339 timestamp, e.g., '2023-10-26T10:00:00Z')"
        ),
      // previousTaskId: z.string().optional().describe("ID of the task to insert this task after"), // Optional: for ordering
    },
    async ({ title, taskListId, notes, due /*, previousTaskId */ }) => {
      try {
        const tasks = getTasksClient();
        const taskData: tasks_v1.Schema$Task = { title };
        if (notes) taskData.notes = notes;
        if (due) taskData.due = due;

        const response = await tasks.tasks.insert({
          tasklist: taskListId,
          requestBody: taskData,
          // previous: previousTaskId, // Optional: for ordering
        });

        return {
          content: [
            {
              type: "text",
              text: `Task created: "${response.data.title}" with ID: ${response.data.id} in list ${taskListId}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating task:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error creating task: ${error.message || String(error)}`,
            },
          ],
        };
      }
    }
  );

  // Tool to update a task (uses helper)
  server.tool(
    "tasks_updateTask",
    "Update an existing task (title, notes, due date, status).",
    {
      taskId: z.string().describe("The ID of the task to update"),
      taskListId: z
        .string()
        .default("@default")
        .describe(
          "ID of the task list containing the task (defaults to '@default')"
        ),
      updates: z
        .object({
          title: z.string().min(1).optional(),
          notes: z.string().optional().nullable(), // Allow clearing notes
          due: z.string().datetime().optional().nullable(), // Allow clearing due date
          status: z.enum(["needsAction", "completed"]).optional(),
        })
        .describe(
          "Object containing the fields to update. Use null to clear optional fields like notes or due date."
        ),
    },
    async ({ taskId, taskListId, updates }) => {
      try {
        const tasks = getTasksClient();
        const updatedTask = await _updateTaskHelper(
          tasks,
          taskListId,
          taskId,
          updates
        );

        return {
          content: [
            {
              type: "text",
              text: `Task updated: "${updatedTask.title}" (ID: ${updatedTask.id})`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 404) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Task ID ${taskId} not found in list ${taskListId}.`,
              },
            ],
          };
        }
        console.error("Error updating task:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error updating task ${taskId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to complete a task (uses helper)
  server.tool(
    "tasks_completeTask",
    "Mark a task as completed.",
    {
      taskId: z.string().describe("The ID of the task to complete"),
      taskListId: z
        .string()
        .default("@default")
        .describe(
          "ID of the task list containing the task (defaults to '@default')"
        ),
    },
    async ({ taskId, taskListId }) => {
      try {
        const tasks = getTasksClient();
        // Call the helper with status set to 'completed'
        const updatedTask = await _updateTaskHelper(tasks, taskListId, taskId, {
          status: "completed",
        });

        // Check if it was already completed before the update call (optional, helper handles idempotency)
        // if (updatedTask.status === 'completed' && /* check previous status if needed */) {
        //    return { content: [{ type: "text", text: `Task ${taskId} was already completed.` }] };
        // }

        return {
          content: [
            {
              type: "text",
              text: `Task "${updatedTask.title}" (ID: ${taskId}) marked as completed.`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 404) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Task ID ${taskId} not found in list ${taskListId}.`,
              },
            ],
          };
        }
        console.error(`Error completing task ${taskId}:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error completing task ${taskId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to delete a task
  server.tool(
    "tasks_deleteTask",
    "Delete a task permanently.",
    {
      taskId: z.string().describe("The ID of the task to delete"),
      taskListId: z
        .string()
        .default("@default")
        .describe(
          "ID of the task list containing the task (defaults to '@default')"
        ),
    },
    async ({ taskId, taskListId }) => {
      try {
        const tasks = getTasksClient();
        await tasks.tasks.delete({
          tasklist: taskListId,
          task: taskId,
        });
        // API returns no content on success
        return {
          content: [
            {
              type: "text",
              text: `Task ${taskId} deleted successfully from list ${taskListId}.`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 404) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Task ID ${taskId} not found in list ${taskListId}.`,
              },
            ],
          };
        }
        console.error("Error deleting task:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error deleting task ${taskId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to create a task list
  server.tool(
    "tasks_createTaskList",
    "Create a new task list.",
    {
      title: z.string().min(1).describe("The title for the new task list"),
    },
    async ({ title }) => {
      try {
        const tasks = getTasksClient();
        const response = await tasks.tasklists.insert({
          requestBody: { title },
        });
        return {
          content: [
            {
              type: "text",
              text: `Task list created: "${response.data.title}" with ID: ${response.data.id}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error creating task list:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error creating task list: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to delete a task list
  server.tool(
    "tasks_deleteTaskList",
    "Delete a task list permanently. This also deletes all tasks within it.",
    {
      taskListId: z
        .string()
        .describe("The ID of the task list to delete. Cannot be '@default'."),
    },
    async ({ taskListId }) => {
      if (taskListId === "@default") {
        return {
          content: [
            {
              type: "text",
              text: "Error: Cannot delete the default task list '@default'.",
            },
          ],
        };
      }
      try {
        const tasks = getTasksClient();
        await tasks.tasklists.delete({ tasklist: taskListId });
        // API returns no content on success
        return {
          content: [
            {
              type: "text",
              text: `Task list ${taskListId} deleted successfully.`,
            },
          ],
        };
      } catch (error: any) {
        if (error.code === 404) {
          return {
            content: [
              {
                type: "text",
                text: `Error: Task list ID ${taskListId} not found.`,
              },
            ],
          };
        }
        console.error("Error deleting task list:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error deleting task list ${taskListId}: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );
}
