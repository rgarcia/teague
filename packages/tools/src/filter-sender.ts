import { z } from "zod";
import { createFilter } from "./gmail";
import type { BaseToolConfig } from "./registry";

const filterSenderSchema = z.object({
  fromEmail: z.string().describe("The email address to create a filter for"),
});
export type FilterSenderInput = z.infer<typeof filterSenderSchema>;

export type FilterSenderOutput = { success: boolean };

export const filterSenderConfig: BaseToolConfig<
  typeof filterSenderSchema,
  FilterSenderOutput
> = {
  name: "FilterSender",
  description:
    "Create a filter to automatically archive emails from a specific sender.",
  parameters: filterSenderSchema,
  vapiParameters: {
    type: "object",
    properties: {
      fromEmail: {
        type: "string",
        description: "The email address to create a filter for",
      },
    },
    required: ["fromEmail"],
  },
  execute: async ({ fromEmail }, context) => {
    if (!context.googleToken) {
      throw new Error("Google token is required for this operation");
    }

    return await createFilter({
      googleToken: context.googleToken,
      fromEmail,
    });
  },
  messages: [
    {
      type: "request-start" as const,
      content: "",
    },
    {
      type: "request-failed" as const,
      content:
        "I couldn't create the filter right now, please try again later.",
    },
    {
      type: "request-response-delayed" as const,
      content:
        "I'm having some trouble creating this filter right now--let's try again later.",
      timingMilliseconds: 10000,
    },
  ],
};
