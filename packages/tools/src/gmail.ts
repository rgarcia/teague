import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type {
  CallToolRequest,
  CallToolResult,
  ListResourcesRequest,
  ListResourcesResult,
  ListToolsRequest,
  ListToolsResult,
  ReadResourceRequest,
  ReadResourceResult,
  Resource,
  TextContent,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
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

export enum ToolName {
  SEARCH_EMAILS = "search_emails",
  // INBOX_STATS = "inbox_stats",
  ARCHIVE_EMAILS = "archive_emails",
  GET_EMAIL = "get_email",
}

const SearchEmailsRequestSchema = z.object({
  query: z
    .string()
    .describe("Search query string")
    .optional()
    .default("in:inbox"),
  maxResults: z
    .number()
    .describe("Maximum number of results to return")
    .optional()
    .default(10),
  cursor: z
    .string()
    .describe(
      "An opaque token returned by previous requests that exceeded the limit placed on the number of results returned. If provided in a request, the server will return results starting after this cursor."
    )
    .optional(),
});
type SearchEmailsRequest = z.infer<typeof SearchEmailsRequestSchema>;

const ArchiveEmailsRequestSchema = z.object({
  messageIds: z
    .array(z.string())
    .describe("The IDs of the messages to archive"),
});
type ArchiveEmailsRequest = z.infer<typeof ArchiveEmailsRequestSchema>;

const InboxStatsRequestSchema = z.object({});

const GetEmailRequestSchema = z.object({
  messageId: z.string().describe("The ID of the message to retrieve"),
});
type GetEmailRequest = z.infer<typeof GetEmailRequestSchema>;

export const tools: Tool[] = [
  {
    name: ToolName.SEARCH_EMAILS,
    description: "Search for emails in Gmail",
    inputSchema: zodToJsonSchema(SearchEmailsRequestSchema) as ToolInput,
  },
  // {
  //   name: ToolName.INBOX_STATS,
  //   description: "Get total and unread email counts from Gmail inbox",
  //   inputSchema: zodToJsonSchema(InboxStatsRequestSchema) as ToolInput,
  // },
  {
    name: ToolName.ARCHIVE_EMAILS,
    description: "Archive emails in Gmail",
    inputSchema: zodToJsonSchema(ArchiveEmailsRequestSchema) as ToolInput,
  },
  {
    name: ToolName.GET_EMAIL,
    description: "Get a specific email message by ID",
    inputSchema: zodToJsonSchema(GetEmailRequestSchema) as ToolInput,
  },
];

const GMAIL_URI_PREFIX = "gmail:///messages/";

class GmailMessageUri {
  static fromId(id: string): string {
    return `${GMAIL_URI_PREFIX}${id}`;
  }

  static toId(uri: string): string {
    if (!uri.startsWith(GMAIL_URI_PREFIX)) {
      throw new Error(`Invalid Gmail URI format: ${uri}`);
    }
    return uri.slice(GMAIL_URI_PREFIX.length);
  }
}

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
    this.setRequestHandler(
      ReadResourceRequestSchema,
      this.readResource.bind(this)
    );
    this.setRequestHandler(ListToolsRequestSchema, this.listTools.bind(this));
    this.setRequestHandler(
      CallToolRequestSchema,
      this.handleToolCall.bind(this)
    );
  }

  private async listResources(
    req: ListResourcesRequest
  ): Promise<ListResourcesResult> {
    try {
      const params: gmail_v1.Params$Resource$Users$Messages$List = {
        userId: "me",
        q: "in:inbox",
        maxResults: 10,
        pageToken: req.params?.cursor,
      };

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
        const description = JSON.stringify({
          snippet: msg.data.snippet,
          labels: msg.data.labelIds || [],
        });

        resources.push({
          uri: GmailMessageUri.fromId(message.id!),
          name: subject,
          description,
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

  private async readResource(
    req: ReadResourceRequest
  ): Promise<ReadResourceResult> {
    try {
      const params: gmail_v1.Params$Resource$Users$Messages$Get = {
        userId: "me",
        id: GmailMessageUri.toId(req.params?.uri),
        format: "full", // https://developers.google.com/gmail/api/reference/rest/v1/Format
      };

      let res = await this.gmail.users.messages.get(params);
      if (res.status !== 200) {
        throw new Error(
          `Failed to read resource: ${res.status} ${res.statusText}`
        );
      }

      // decode the base64 stuff if it's text or html
      if (res.data.payload?.parts) {
        res.data.payload.parts = res.data.payload.parts.map((part) => {
          if (
            part.body?.data &&
            part.mimeType &&
            ["text/plain", "text/html"].includes(part.mimeType)
          ) {
            const decoded = Buffer.from(part.body.data, "base64").toString(
              "utf-8"
            );
            part.body.data = decoded;
          }
          return part;
        });
      }

      return {
        contents: [
          {
            type: "text",
            uri: req.params.uri,
            text: JSON.stringify(res),
          },
        ],
      };
    } catch (error) {
      console.error("Error reading Gmail resource:", error);
      throw error;
    }
  }

  private async listTools(_: ListToolsRequest): Promise<ListToolsResult> {
    return { tools };
  }

  private async handleToolCall(
    request: CallToolRequest
  ): Promise<CallToolResult> {
    try {
      switch (request.params.name) {
        case ToolName.SEARCH_EMAILS:
          const searchEmailsReq: SearchEmailsRequest =
            SearchEmailsRequestSchema.parse(request.params.arguments);
          return await this.handleSearchEmails(searchEmailsReq);
        // case ToolName.INBOX_STATS:
        //   InboxStatsRequestSchema.parse(request.params.arguments);
        //   return await this.handleInboxStats();
        case ToolName.ARCHIVE_EMAILS:
          const archiveEmailsReq: ArchiveEmailsRequest =
            ArchiveEmailsRequestSchema.parse(request.params.arguments);
          return await this.handleArchiveEmails(archiveEmailsReq);
        case ToolName.GET_EMAIL:
          const getEmailReq: GetEmailRequest = GetEmailRequestSchema.parse(
            request.params.arguments
          );
          return await this.handleGetEmail(getEmailReq);
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

  private async handleSearchEmails(
    req: SearchEmailsRequest
  ): Promise<CallToolResult> {
    const response = await this.gmail.users.messages.list({
      userId: "me",
      q: req.query,
      maxResults: req.maxResults,
      pageToken: req.cursor,
    });

    const messages = response.data.messages || [];
    const content: TextContent[] = [];

    for (const message of messages) {
      const msg = await this.gmail.users.messages.get({
        userId: "me",
        id: message.id!,
        format: "full",
      });
      //this.log.trace(msg.data, "gmail.users.messages.get");
      const headers = msg.data.payload?.headers || [];
      const subject =
        headers.find((header) => header.name?.toLowerCase() === "subject")
          ?.value || "(no subject)";
      const from =
        headers.find((header) => header.name?.toLowerCase() === "from")
          ?.value || "(unknown sender)";
      const to =
        headers.find((header) => header.name?.toLowerCase() === "to")?.value ||
        undefined;
      const cc =
        headers.find((header) => header.name?.toLowerCase() === "cc")?.value ||
        undefined;
      const bcc =
        headers.find((header) => header.name?.toLowerCase() === "bcc")?.value ||
        undefined;
      content.push({
        type: "text",
        text: JSON.stringify({
          id: message.id,
          from,
          to,
          cc,
          bcc,
          subject,
          labels: msg.data.labelIds,
          snippet: msg.data.snippet,
        }),
      });
    }

    if (response.data.nextPageToken) {
      content.push({
        type: "text",
        text: JSON.stringify({ cursor: response.data.nextPageToken }),
      });
    }

    return {
      content,
      isError: false,
    };
  }

  // private async handleInboxStats(): Promise<CallToolResult> {
  //   const [totalResponse, unreadResponse] = await Promise.all([
  //     this.gmail.users.messages.list({
  //       userId: "me",
  //       q: "in:inbox",
  //     }),
  //     this.gmail.users.messages.list({
  //       userId: "me",
  //       q: "in:inbox is:unread",
  //     }),
  //   ]);

  //   const stats = {
  //     total: totalResponse.data.resultSizeEstimate || 0,
  //     unread: unreadResponse.data.resultSizeEstimate || 0,
  //   };

  //   return {
  //     content: [
  //       {
  //         type: "text",
  //         text: JSON.stringify(stats),
  //       },
  //     ],
  //     isError: false,
  //   };
  // }

  private async handleArchiveEmails(
    req: ArchiveEmailsRequest
  ): Promise<CallToolResult> {
    try {
      const res = await this.gmail.users.messages.batchModify({
        userId: "me",
        requestBody: {
          ids: req.messageIds,
          removeLabelIds: ["INBOX"],
        },
      });
      if (res.status !== 204) {
        throw new Error(
          `Failed to archive emails: ${res.status} ${res.statusText}`
        );
      }
      this.log.info(
        {
          ids: req.messageIds,
          removeLabelIds: ["INBOX"],
        },
        "gmail.users.messages.batchModify"
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              archivedCount: req.messageIds.length,
              messageIds: req.messageIds,
            }),
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.log.error(error, "Failed to archive emails");
      throw error;
    }
  }

  private async handleGetEmail(req: GetEmailRequest): Promise<CallToolResult> {
    try {
      const msg = await this.gmail.users.messages.get({
        userId: "me",
        id: req.messageId,
        format: "full",
      });

      const headers = msg.data.payload?.headers || [];
      const subject =
        headers.find((header) => header.name?.toLowerCase() === "subject")
          ?.value || "(no subject)";
      const from =
        headers.find((header) => header.name?.toLowerCase() === "from")
          ?.value || "(unknown sender)";
      const to =
        headers.find((header) => header.name?.toLowerCase() === "to")?.value ||
        undefined;
      const cc =
        headers.find((header) => header.name?.toLowerCase() === "cc")?.value ||
        undefined;
      const bcc =
        headers.find((header) => header.name?.toLowerCase() === "bcc")?.value ||
        undefined;

      // Decode message parts if they exist
      let parts = msg.data.payload?.parts;
      if (parts) {
        parts = parts.map((part) => {
          if (
            part.body?.data &&
            part.mimeType &&
            ["text/plain", "text/html"].includes(part.mimeType)
          ) {
            const decoded = Buffer.from(part.body.data, "base64").toString(
              "utf-8"
            );
            part.body.data = decoded;
          }
          return part;
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: msg.data.id,
              threadId: msg.data.threadId,
              labelIds: msg.data.labelIds,
              snippet: msg.data.snippet,
              historyId: msg.data.historyId,
              internalDate: msg.data.internalDate,
              sizeEstimate: msg.data.sizeEstimate,
              from,
              to,
              cc,
              bcc,
              subject,
              payload: {
                ...msg.data.payload,
                parts,
              },
            }),
          },
        ],
        isError: false,
      };
    } catch (error) {
      this.log.error(error, "Failed to get email");
      throw error;
    }
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
