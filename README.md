[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/vakharwalad23-google-mcp-remote-badge.png)](https://mseep.ai/app/vakharwalad23-google-mcp-remote)

# Google MCP Remote
[![Verified on MseeP](https://mseep.ai/badge.svg)](https://mseep.ai/app/fd4f5a90-36d2-47b4-b06b-d8bde98a35ce)
</br>
A [Cloudflare Workers-based MCP server](https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp/) implementation that provides Google API tools (Gmail, Calendar, Drive, etc.) for the [Model Context Protocol](https://modelcontextprotocol.com/docs/mcp-protocol), designed to integrate seamlessly with AI clients like Claude or Cursor.

> ⚠️ **SECURITY WARNING**: Do not use someone else's deployed instance of this server as it requires access to your Google account and personal data. Always deploy your own instance to maintain control over your data and API access.

## Features

- **Gmail**:
  - Send emails with multiple recipients (to, cc, bcc) and HTML content
  - List emails with custom queries, labels, and result limits
  - Read specific emails by ID
  - Manage labels (add, remove, list)
  - Draft and delete emails
- **Calendar**:
  - List calendars and set a default calendar
  - Create events with details (summary, start/end time, attendees, etc.)
  - List upcoming events with customizable filters
  - Update or delete existing events
  - Find free time slots for scheduling
- **Drive**:
  - Filter files with search queries
  - Sort by modification date or other criteria
  - View detailed file metadata
  - Read file content (text, docs, spreadsheets)
  - Create new files with specified content
  - Update existing files
  - Delete files (trash or permanent)
  - Share files with specific permissions
- **Tasks**:
  - View all task lists
  - Create new task lists
  - Delete existing task lists
  - List tasks with filters
  - View task details
  - Create tasks with title, notes, and due dates
  - Update task properties
  - Mark tasks as complete
  - Delete tasks
- **YouTube**:
  - Search for videos with customizable parameters
  - Get detailed information about specific videos
- **Contacts**:
  - List and search contacts from Google Contacts
  - Get detailed information about specific contacts

## Deployment Instructions

### Prerequisites

1. **Google Cloud Project**:

   - Create a project in the [Google Cloud Console](https://console.cloud.google.com/)
   - Set up OAuth 2.0 credentials (Client ID and Client Secret)
   - Enable the APIs you need (Gmail, Calendar, Drive, Tasks, YouTube, People/Contacts)
   - Add authorized JavaScript origins and redirect URIs for your Cloudflare Worker
   - Redirect URI should be in the format:

     ```
     Deployed URL + /callback
      https://your-project.your-username.workers.dev/callback

     For local testing:
      http://localhost:8788/callback
     ```

2. **Cloudflare Account**:
   - Sign up for a [Cloudflare account](https://dash.cloudflare.com/sign-up) if you don't have one
   - Install Wrangler CLI: `bun install -g wrangler`
   - Authenticate with Cloudflare: `wrangler login`

### Deployment Steps

1. **Clone the repository**:

   ```bash
   git clone https://github.com/vakharwalad23/google-mcp-remote.git
   cd google-mcp-remote
   ```

2. **Install dependencies**:

   ```bash
   bun install
   ```

3. **Configure secrets**:
   Set your Google OAuth credentials as secrets in Cloudflare:

   ```bash
   wrangler secret put GOOGLE_OAUTH_CLIENT_ID
   wrangler secret put GOOGLE_OAUTH_CLIENT_SECRET
   wrangler secret put COOKIE_ENCRYPTION_KEY
   ```

   (For the COOKIE_ENCRYPTION_KEY, generate a random string to secure cookies)

4. **Create a KV namespace**:

   ```bash
   wrangler kv:namespace create OAUTH_KV
   ```

   Then update your wrangler.jsonc with the ID from the output

5. **Deploy to Cloudflare Workers**:

   ```bash
   bun run deploy
   ```

6. **Note your deployment URL**:
   After deployment, Wrangler will provide a URL like: `https://your-project.your-username.workers.dev`

## Usage with AI Clients

Once deployed, configure your AI client (Claude, Cursor, etc.) to use your MCP server.

### Claude Configuration

Edit your `claude_desktop_config.json` or for cursor `mcp.json`:

```json
{
  "mcpServers": {
    "google-mcp-remote": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://your-project.your-username.workers.dev/sse"
      ]
    }
  }
}
```

### Example Commands

You can now ask Claude to perform tasks using your Google account:

```
Send an email to jane.doe@example.com with the subject "Meeting Notes" and body "Here are the notes from today."
```

```
List my upcoming calendar events for the next 3 days.
```

```
Create a calendar event titled "Team Sync" tomorrow at 10 AM for 1 hour.
```

```
Search YouTube for recent videos about machine learning.
```

## Alternative Usage Methods

### Using with Cloudflare AI Playground

You can test the MCP server online using [Cloudflare AI Playground](https://playground.ai.cloudflare.com/):

1. Open Cloudflare AI Playground
2. Enter your MCP server URL with the `/sse` path:
   ```
   https://your-project.your-username.workers.dev/sse
   ```
3. Start interacting with your Google services through the playground interface

### Offline Testing with MCP Inspector

For local development and testing without deploying to Cloudflare:

1. **Create a `.dev.vars` file** in your project root with the necessary environment variables:

   ```
   GOOGLE_OAUTH_CLIENT_ID="your-client-id"
   GOOGLE_OAUTH_CLIENT_SECRET="your-client-secret"
   COOKIE_ENCRYPTION_KEY="your-random-encryption-key"
   ```

2. **Use Bun**:

   ```bash
   # Install dependencies
   bun install

   # Run local development server
   bun run dev
   ```

3. **Test with MCP Inspector**:
   ```bash
   bunx @modelcontextprotocol/inspector@latest
   ```
   This launches a local interface to test your MCP server functionality

## OAuth Authorization

The first time you use the server with an AI client, you'll need to authorize access to your Google account:

1. The server will display an approval dialog
2. Approve the MCP client access to your server
3. Follow the Google OAuth flow to grant API access
4. After authorization, you'll be redirected back to your AI client

## Local Development

To run the server locally:

```bash
bun install
bun run dev
```

This will start a local development server, typically at http://localhost:8788

## Troubleshooting

- **OAuth Issues**: Ensure your Google Cloud project has the correct redirect URIs set
- **API Permissions**: Check that you've enabled all required APIs in Google Cloud Console
- **Token Expiration**: If you encounter authentication errors, try clearing the KV storage and re-authenticating

Thank you for using Google MCP Remote! If you have any questions or suggestions, feel free to open an issue or contribute to the project.
