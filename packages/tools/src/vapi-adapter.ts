import type { Vapi } from "@vapi-ai/server-sdk";
import { z } from "zod";
import type { BaseToolConfig } from "./registry";

export type VapiToolConfig = {
  serverUrl: string;
};

export function createVapiToolDefinition<TParams extends z.ZodType, TResult>(
  tool: BaseToolConfig<TParams, TResult>,
  vapiConfig: VapiToolConfig
): Vapi.ToolsCreateRequest {
  return {
    type: "function",
    async: false,
    messages: tool.messages || [],
    server: {
      url: vapiConfig.serverUrl,
    },
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.vapiParameters,
    },
  };
}
