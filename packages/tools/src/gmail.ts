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
  TextContent,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createEnv } from "@t3-oss/env-core";
import type { OAuth2Client } from "google-auth-library";
import { gmail_v1, google } from "googleapis";
import { loggerOptionsStderr } from "logger";
import { existsSync, readFileSync } from "node:fs";
import { pino, type Logger } from "pino";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const ToolInputSchema = ToolSchema.shape.inputSchema;
type ToolInput = z.infer<typeof ToolInputSchema>;

enum ToolName {
  SEARCH_EMAILS = "search_emails",
  INBOX_STATS = "inbox_stats",
}

const SearchEmailsSchema = z.object({
  query: z.string().describe("Search query string"),
});

const InboxStatsSchema = z.object({});

export class GmailMCPServer extends Server {
  private gmail: gmail_v1.Gmail;
  private log: Logger;

  constructor({
    TOKEN_JSON_PATH,
    LOG_LEVEL,
  }: {
    TOKEN_JSON_PATH: string;
    LOG_LEVEL: string;
  }) {
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
    this.log = pino({
      ...loggerOptionsStderr, // use stderr since MCP server communicates over stdout if using stdio transport
      name: "tools/gmail",
      level: LOG_LEVEL,
    });
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
        name: ToolName.SEARCH_EMAILS,
        description: "Search for emails in Gmail",
        inputSchema: zodToJsonSchema(SearchEmailsSchema) as ToolInput,
      },
      {
        name: ToolName.INBOX_STATS,
        description: "Get total and unread email counts from Gmail inbox",
        inputSchema: zodToJsonSchema(InboxStatsSchema) as ToolInput,
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
        case ToolName.SEARCH_EMAILS:
          const searchArgs = SearchEmailsSchema.parse(request.params.arguments);
          return await this.handleSearchEmails(searchArgs.query);
        case ToolName.INBOX_STATS:
          InboxStatsSchema.parse(request.params.arguments);
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

  private async handleSearchEmails(query: string): Promise<CallToolResult> {
    const response = await this.gmail.users.messages.list({
      userId: "me",
      q: query,
      maxResults: 10,
    });

    const messages = response.data.messages || [];
    const content: TextContent[] = [];

    for (const message of messages) {
      const msg = await this.gmail.users.messages.get({
        userId: "me",
        id: message.id!,
        format: "full",
      });
      this.log.debug(msg.data, "gmail.users.messages.get");
      const headers = msg.data.payload?.headers || [];
      const subject =
        headers.find((header) => header.name?.toLowerCase() === "subject")
          ?.value || "(no subject)";
      const from =
        headers.find((header) => header.name?.toLowerCase() === "from")
          ?.value || "(unknown sender)";
      content.push({
        type: "text",
        text: JSON.stringify({
          from,
          subject,
          id: message.id,
        }),
      });
    }
    return {
      content,
      isError: false,
    };
  }

  private async handleInboxStats(): Promise<{ total: number; unread: number }> {
    const [totalResponse, unreadResponse] = await Promise.all([
      this.gmail.users.messages.list({
        userId: "me",
        q: "in:inbox",
      }),
      this.gmail.users.messages.list({
        userId: "me",
        q: "in:inbox is:unread",
      }),
    ]);
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
  LOG_LEVEL: {
    name: "LOG_LEVEL",
    description: "The log level to use",
    refine: (level: string) =>
      ["fatal", "error", "warn", "info", "debug", "trace"].includes(level),
    message: "Invalid log level",
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
      LOG_LEVEL: z
        .string()
        .describe(requiredEnvVars.LOG_LEVEL.description)
        .refine(requiredEnvVars.LOG_LEVEL.refine, {
          message: requiredEnvVars.LOG_LEVEL.message,
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
