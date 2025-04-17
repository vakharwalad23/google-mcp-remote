import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Props } from "../utils/upstream-utils";
import { google, youtube_v3 } from "googleapis";

/**
 * Registers YouTube Data API v3 related tools with the MCP server
 */
export function registerYouTubeTools(server: McpServer, props: Props) {
  const getYouTubeClient = () => {
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: props.accessToken });
    return google.youtube({ version: "v3", auth });
  };

  // Tool to search for videos
  server.tool(
    "youtube.searchVideos",
    "Search for YouTube videos based on a query.",
    {
      query: z.string().min(1).describe("The search query term(s)"),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(50)
        .default(5)
        .describe("Maximum number of results to return (1-50)"),
      order: z
        .enum([
          "date",
          "rating",
          "relevance",
          "title",
          "videoCount",
          "viewCount",
        ])
        .default("relevance")
        .describe("Sort order for results"),
      videoType: z
        .enum(["any", "episode", "movie"])
        .default("any")
        .describe("Filter by video type"),
      // Add more filters like regionCode, relevanceLanguage etc. if needed
    },
    async ({ query, maxResults, order, videoType }) => {
      try {
        const youtube = getYouTubeClient();
        const params: youtube_v3.Params$Resource$Search$List = {
          part: ["snippet"], // Basic part including title, description, channelId, etc.
          q: query,
          maxResults,
          order,
          type: ["video"], // Search only for videos
          videoType,
        };

        const response = await youtube.search.list(params);

        if (!response.data.items || response.data.items.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No YouTube videos found matching the query.",
              },
            ],
          };
        }

        const results = response.data.items.map((item) => ({
          videoId: item.id?.videoId,
          title: item.snippet?.title,
          description: item.snippet?.description,
          channelTitle: item.snippet?.channelTitle,
          publishedAt: item.snippet?.publishedAt,
          link: item.id?.videoId
            ? `https://www.youtube.com/watch?v=${item.id.videoId}`
            : "N/A",
        }));

        return {
          content: [
            {
              type: "text",
              text: `YouTube Search Results for "${query}":\n${JSON.stringify(
                results,
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error: any) {
        console.error("Error searching YouTube videos:", error);
        return {
          content: [
            {
              type: "text",
              text: `Error searching YouTube: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // Tool to get video details
  server.tool(
    "youtube.getVideoDetails",
    "Get detailed information about a specific YouTube video.",
    {
      videoId: z.string().min(1).describe("The ID of the YouTube video"),
    },
    async ({ videoId }) => {
      try {
        const youtube = getYouTubeClient();
        const response = await youtube.videos.list({
          part: ["snippet", "contentDetails", "statistics"], // Request comprehensive details
          id: [videoId],
        });

        if (!response.data.items || response.data.items.length === 0) {
          return {
            content: [
              { type: "text", text: `Video with ID ${videoId} not found.` },
            ],
          };
        }

        const video = response.data.items[0];
        const details = {
          title: video.snippet?.title,
          description: video.snippet?.description,
          channelTitle: video.snippet?.channelTitle,
          publishedAt: video.snippet?.publishedAt,
          duration: video.contentDetails?.duration, // ISO 8601 duration format (e.g., PT15M33S)
          viewCount: video.statistics?.viewCount,
          likeCount: video.statistics?.likeCount,
          commentCount: video.statistics?.commentCount,
          tags: video.snippet?.tags,
          link: `https://www.youtube.com/watch?v=${videoId}`,
        };

        return {
          content: [
            {
              type: "text",
              text: `Video Details (ID: ${videoId}):\n${JSON.stringify(
                details,
                null,
                2
              )}`,
            },
          ],
        };
      } catch (error: any) {
        console.error(`Error getting video details for ${videoId}:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Error getting video details: ${
                error.message || String(error)
              }`,
            },
          ],
        };
      }
    }
  );

  // TODO
  // Add more tools as needed: list playlists, videos in playlist, etc.
}
