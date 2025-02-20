import { User } from "@clerk/backend";
import type { Vapi } from "@vapi-ai/server-sdk";
import { z } from "zod";

export interface RequestContext {
  googleToken: string;
  user: User;
  // Add other context properties as needed
}

export type BaseToolConfig<TParams extends z.ZodType, TResult> = {
  name: string;
  description: string;
  parameters: TParams;
  execute: (
    params: z.infer<TParams>,
    context: RequestContext
  ) => Promise<TResult>;
  // Vapi-specific fields
  messages?: Vapi.CreateFunctionToolDtoMessagesItem[];
  vapiParameters: Vapi.OpenAiFunctionParameters;
};

export type ToolRegistry = {
  [key: string]: BaseToolConfig<any, any>;
};

export class ToolRegistryManager {
  private registry: ToolRegistry = {};

  registerTool<TParams extends z.ZodType, TResult>(
    config: BaseToolConfig<TParams, TResult>
  ) {
    this.registry[config.name] = config;
    return config;
  }

  getTool(name: string) {
    const tool = this.registry[name];
    if (!tool) {
      throw new Error(`Tool ${name} not found in registry`);
    }
    return tool;
  }

  getAllTools() {
    return Object.values(this.registry);
  }
}
