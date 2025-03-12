import type { llm } from "@livekit/agents";
import { z } from "zod";
import type { BaseToolConfig, RequestContext } from "./registry";

export function createLivekitToolDefition<TParams extends z.ZodType, TResult>(
  tool: BaseToolConfig<TParams, TResult>,
  context: RequestContext
): [string, llm.CallableFunction] {
  return [
    tool.name,
    {
      parameters: tool.parameters,
      description: tool.description,
      execute: async (params) => {
        console.log("DEBUG: execute", tool.name, params);
        const res = await tool.execute(params, context);
        return JSON.stringify(res);
      },
    },
  ];
}

export function requestContextToAttributes(
  context: RequestContext
): Record<string, string> {
  return {
    googleToken: context.googleToken,
    user: JSON.stringify(context.user),
  };
}

export function requestContextFromAttributes(
  attributes: Record<string, string>
): RequestContext {
  if (!attributes.googleToken) {
    throw new Error("Missing googleToken in attributes");
  }
  if (!attributes.user) {
    throw new Error("Missing user in attributes");
  }
  return {
    googleToken: attributes.googleToken,
    user: JSON.parse(attributes.user),
  };
}
