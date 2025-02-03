import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
  type CallToolResult,
  type Tool as MCPTool,
} from "@modelcontextprotocol/sdk/types.js";
import { jsonSchema, type Tool } from "ai";
import type { JSONSchema7 } from "json-schema";

type MCPToolSetConfig = {
  mcpServers: {
    [key: string]: {
      command: string;
      args: string[];
      env?: Record<string, string>;
    };
  };
  /**
   * whether to include an execute method on each tool. This essentially controls whether you want the AI SDK to execute tools or not.
   */
  noExecute?: boolean;
  /**
   * toolModifier is available to sanitize tool definitions (description and parameters) for models that don't support all JSONSchema7 features or that have other limits.
   */
  toolModifier?: (
    serverName: string,
    toolName: string,
    tool: MCPTool
  ) => MCPTool;
};

type MCPToolSet = {
  tools: {
    [key: string]: Tool;
  };
  executeTool: {
    [key: string]: (args: any) => Promise<CallToolResult>;
  };
  clients: {
    [key: string]: Client;
  };
};

export async function createToolSet(
  config: MCPToolSetConfig
): Promise<MCPToolSet> {
  let toolset: MCPToolSet = {
    tools: {},
    executeTool: {},
    clients: {},
  };

  // could probably speed this up by spinning these up in parallel
  for (const [serverName, serverConfig] of Object.entries(config.mcpServers)) {
    const transport = new StdioClientTransport({
      ...serverConfig,
      stderr: process.stderr,
    });

    const client = new Client(
      {
        name: `${serverName}-client`,
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );
    toolset.clients[serverName] = client;
    await client.connect(transport);

    // Get list of tools and add them to the toolset
    const toolList = await client.listTools();
    for (let tool of toolList.tools) {
      if (config.toolModifier) {
        tool = config.toolModifier(serverName, tool.name, tool);
      }
      let toolName = tool.name;
      if (toolName !== serverName) {
        toolName = `${serverName}_${toolName}`;
      }
      const executeTool = async (args: any): Promise<CallToolResult> => {
        const result = await client.callTool({
          name: tool.name,
          arguments: args,
        });
        return result as CallToolResult;
      };
      toolset.tools[toolName] = {
        description: tool.description || "",
        parameters: jsonSchema(tool.inputSchema as JSONSchema7),
        execute: config.noExecute ? undefined : executeTool,
      };
      toolset.executeTool[toolName] = executeTool;
    }
  }

  return toolset;
}

/**
 * Modifies tool parameters to remove all but the "enum" format constraint.
 * Gemini only supports "enum" format constraint on string fields.
 * https://cloud.google.com/vertex-ai/generative-ai/docs/multimodal/control-generated-output?authuser=1
 */
export function geminiToolModifier(
  serverName: string,
  toolName: string,
  tool: MCPTool
): MCPTool {
  if (!tool.inputSchema.properties) {
    return tool;
  }
  for (const [_, value] of Object.entries(tool.inputSchema.properties)) {
    const v = value as any;
    if (typeof v === "object" && v.type === "string" && v.format != "enum") {
      v.format = undefined;
    }
  }
  return tool;
}

/**
 * Modifies tool parameters to truncate descriptions to 1024 characters for OpenAI compatibility.
 * OpenAI has a limit on the length of descriptions in their function calling API.
 */
export function oaiToolModifier(modelId: string) {
  return (serverName: string, toolName: string, tool: MCPTool): MCPTool => {
    let modifiedTool = { ...tool };

    // Apply description length limit
    if (
      modifiedTool.description?.length &&
      modifiedTool.description.length > 1024
    ) {
      modifiedTool.description = modifiedTool.description.slice(0, 1024);
    }

    // For o3-mini and o1, remove default values from parameters (it doesn't support them). It also requires all parameters to be listed as required.
    if (modelId.includes("o1") || modelId.includes("o3-mini")) {
      if (modifiedTool.inputSchema.properties) {
        // Make all properties required
        modifiedTool.inputSchema.required = Object.keys(
          modifiedTool.inputSchema.properties
        );

        // Remove default values
        for (const [_, value] of Object.entries(
          modifiedTool.inputSchema.properties
        )) {
          const v = value as any;
          if (typeof v === "object" && "default" in v) {
            delete v.default;
          }
        }
      }
    }

    return modifiedTool;
  };
}

export function defaultToolModifier(providerId: string, modelId: string) {
  if (providerId === "gemini") {
    return geminiToolModifier;
  } else if (providerId === "openai.chat") {
    return oaiToolModifier(modelId);
  }
  return undefined;
}
