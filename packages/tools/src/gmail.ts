import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type {
  CallToolRequest,
  CallToolResult,
  ListResourcesRequest,
  ListResourcesResult,
  ListToolsRequest,
  ListToolsResult,
  Resource,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createEnv } from "@t3-oss/env-core";
import type { OAuth2Client } from "google-auth-library";
import { gmail_v1, google } from "googleapis";
import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

interface GmailMessage {
  id: string;
  subject: string;
  sender: string;
  timestamp: string;
}

export class GmailMCPServer extends Server {
  private gmail: gmail_v1.Gmail;

  constructor({ TOKEN_JSON_PATH }: { TOKEN_JSON_PATH: string }) {
    super(
      {
        name: "tools/gmail",
        version: "0.1.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );
    const content = readFileSync(TOKEN_JSON_PATH, "utf-8");
    const credentials = JSON.parse(content);
    const auth = google.auth.fromJSON(credentials) as OAuth2Client;
    this.gmail = google.gmail({ version: "v1", auth });

    this.setRequestHandler(
      ListResourcesRequestSchema,
      this.listResources.bind(this)
    );
    this.setRequestHandler(ListToolsRequestSchema, this.listTools.bind(this));
    this.setRequestHandler(
      CallToolRequestSchema,
      this.handleToolCall.bind(this)
    );
  }

  private async listResources(
    request: ListResourcesRequest
  ): Promise<ListResourcesResult> {
    try {
      const pageSize = 10;
      const params: gmail_v1.Params$Resource$Users$Messages$List = {
        userId: "me",
        q: "in:inbox",
        maxResults: pageSize,
        pageToken: request.params?.cursor,
      };

      if (request.params?.cursor) {
        params.pageToken = request.params.cursor;
      }

      const response = await this.gmail.users.messages.list(params);
      const messages = response.data.messages || [];
      const resources: Resource[] = [];

      for (const message of messages) {
        const msg = await this.gmail.users.messages.get({
          userId: "me",
          id: message.id!,
          format: "full",
        });

        const headers = msg.data.payload?.headers || [];
        const subject =
          headers.find((header) => header.name?.toLowerCase() === "subject")
            ?.value || "(no subject)";
        const sender =
          headers.find((header) => header.name?.toLowerCase() === "from")
            ?.value || "(unknown sender)";

        resources.push({
          uri: `gmail:///${message.id}`,
          name: subject,
          mimeType: "message/rfc822",
        });
      }

      return {
        resources,
        nextCursor: response.data.nextPageToken || undefined,
      };
    } catch (error) {
      console.error("Error listing Gmail resources:", error);
      throw error;
    }
  }

  private async listTools(
    _request: ListToolsRequest
  ): Promise<ListToolsResult> {
    const tools: Tool[] = [
      {
        name: "search_emails",
        description: "Search for emails in Gmail",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Search query string",
            },
          },
          required: ["query"],
        },
      },
      {
        name: "inbox_stats",
        description: "Get total and unread email counts from Gmail inbox",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
    ];

    return {
      tools,
    };
  }

  private async handleToolCall(
    request: CallToolRequest
  ): Promise<CallToolResult> {
    try {
      switch (request.params.name) {
        case "search_emails":
          return {
            content: [
              {
                type: "text",
                text: await this.handleSearchEmails(
                  request.params.arguments?.query as string
                ),
              },
            ],
            isError: false,
          };
        case "inbox_stats":
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify(await this.handleInboxStats()),
              },
            ],
            isError: false,
          };
        default:
          throw new Error(`Tool not found: ${request.params.name}`);
      }
    } catch (error) {
      console.error(`Error handling tool ${request.params.name}:`, error);
      return {
        content: [
          {
            type: "text",
            text: `Error handling tool ${request.params.name}: ${error}`,
          },
        ],
        isError: true,
      };
    }
  }

  private async handleSearchEmails(query: string): Promise<string> {
    const response = await this.gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 10,
    });

    const messages = response.data.messages || [];
    const results: GmailMessage[] = [];

    for (const message of messages) {
      const msg = await this.gmail.users.messages.get({
        userId: "me",
        id: message.id!,
        format: "full",
      });

      const headers = msg.data.payload?.headers || [];
      const subject =
        headers.find((header) => header.name?.toLowerCase() === "subject")
          ?.value || "(no subject)";
      const sender =
        headers.find((header) => header.name?.toLowerCase() === "from")
          ?.value || "(unknown sender)";

      results.push({
        id: message.id!,
        subject,
        sender,
        timestamp: msg.data.internalDate || "",
      });
    }

    return `Found ${results.length} emails:\n${results
      .map((msg) => `${msg.subject} (from: ${msg.sender})`)
      .join("\n")}`;
  }

  private async handleInboxStats(): Promise<{ total: number; unread: number }> {
    const totalResponse = await this.gmail.users.messages.list({
      userId: "me",
      q: "in:inbox",
    });

    const unreadResponse = await this.gmail.users.messages.list({
      userId: "me",
      q: "in:inbox is:unread",
    });

    return {
      total: totalResponse.data.resultSizeEstimate || 0,
      unread: unreadResponse.data.resultSizeEstimate || 0,
    };
  }
}

export const requiredEnvVars = {
  TOKEN_JSON_PATH: {
    name: "TOKEN_JSON_PATH",
    description: "The path to the JSON file containing the OAuth2 credentials",
    refine: (path: string) => existsSync(path),
    message: "File does not exist",
  },
};

export const main = async (
  runtimeEnv: Record<string, string> = process.env as Record<string, string>
) => {
  const envConfig = createEnv({
    server: {
      TOKEN_JSON_PATH: z
        .string()
        .describe(requiredEnvVars.TOKEN_JSON_PATH.description)
        .refine(requiredEnvVars.TOKEN_JSON_PATH.refine, {
          message: requiredEnvVars.TOKEN_JSON_PATH.message,
        }),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
  });
  const server = new GmailMCPServer(envConfig);
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

if (import.meta.main) {
  main();
}
