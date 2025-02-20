import { createClerkClient } from "@clerk/backend";
import { Command } from "@commander-js/extra-typings";
import { z } from "zod";
import toolRegistry from "~/utils/tools/all-tools";
import type { BaseToolConfig } from "~/utils/tools/registry";

// Ensure we have the required environment variables
if (!process.env.CLERK_SECRET_KEY) {
  console.error("CLERK_SECRET_KEY environment variable is required");
  process.exit(1);
}

const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

const program = new Command();

// Helper function to convert Zod schema to Commander options
function addSchemaOptions<T extends z.ZodObject<any>>(
  command: Command,
  schema: T
): Command {
  const shape = schema.shape;
  for (const [key, value] of Object.entries(shape)) {
    const zodValue = value as z.ZodTypeAny;
    const description = zodValue.description || `The ${key} parameter`;

    if (zodValue instanceof z.ZodString) {
      command.option(`--${key} <value>`, description);
    } else if (zodValue instanceof z.ZodNumber) {
      command.option(`--${key} <number>`, description, parseFloat);
    } else if (zodValue instanceof z.ZodBoolean) {
      command.option(`--${key}`, description);
    } else if (zodValue instanceof z.ZodEnum) {
      const values = zodValue._def.values;
      command.option(
        `--${key} <value>`,
        `${description} (one of: ${values.join(", ")})`
      );
    } else if (zodValue instanceof z.ZodArray) {
      command.option(
        `--${key} <items...>`,
        `${description} (comma-separated list)`
      );
    } else if (zodValue instanceof z.ZodDate) {
      command.option(
        `--${key} <date>`,
        `${description} (ISO date string)`,
        (val) => new Date(val)
      );
    } else if (zodValue instanceof z.ZodOptional) {
      // Recursively handle the inner type
      const innerType = zodValue._def.innerType;
      if (innerType instanceof z.ZodString) {
        command.option(`--${key} [value]`, description);
      } else if (innerType instanceof z.ZodNumber) {
        command.option(`--${key} [number]`, description, parseFloat);
      } else if (innerType instanceof z.ZodBoolean) {
        command.option(`--${key}`, description);
      } else if (innerType instanceof z.ZodEnum) {
        const values = innerType._def.values;
        command.option(
          `--${key} [value]`,
          `${description} (one of: ${values.join(", ")})`
        );
      } else if (innerType instanceof z.ZodArray) {
        command.option(
          `--${key} [items...]`,
          `${description} (comma-separated list)`
        );
      } else if (innerType instanceof z.ZodDate) {
        command.option(
          `--${key} [date]`,
          `${description} (ISO date string)`,
          (val) => new Date(val)
        );
      }
    }
  }
  return command;
}

// Helper function to create a command for a tool
function createToolCommand<
  TSchema extends z.ZodObject<any>,
  TInput extends z.infer<TSchema>,
  TOutput,
>(tool: BaseToolConfig<TSchema, TOutput>) {
  const command = new Command(tool.name)
    .description(tool.description)
    .option("-u, --user-id <id>", "Clerk user ID");

  // Add options based on the tool's schema
  addSchemaOptions(command, tool.parameters);

  command.action(async (options: { userId?: string } & Record<string, any>) => {
    try {
      // Get user ID from command line arguments
      const userId = options.userId;
      if (!userId) {
        console.error("Please provide a user ID with --user-id");
        process.exit(1);
      }

      // Get Google token from Clerk
      const [user, token] = await Promise.all([
        clerkClient.users.getUser(userId),
        clerkClient.users.getUserOauthAccessToken(userId, "google"),
      ]);
      const googleToken = token.data[0].token;

      // Extract tool parameters from options
      const params: Record<string, any> = {};
      for (const key of Object.keys(tool.parameters.shape)) {
        if (options[key] !== undefined) {
          params[key] = options[key];
        }
      }

      // Parse and validate parameters
      const parseResult = tool.parameters.safeParse(params);
      if (!parseResult.success) {
        console.error("Invalid parameters:", parseResult.error.message);
        process.exit(1);
      }

      console.log(`Executing ${tool.name}...`);
      const result = await tool.execute(parseResult.data as TInput, {
        googleToken,
        user,
      });
      console.log("Result:", JSON.stringify(result, null, 2));
    } catch (error) {
      console.error("Error:", error);
      process.exit(1);
    }
  });

  return command;
}

// Add commands for each tool
program.description("Test tools");
for (const tool of toolRegistry.getAllTools()) {
  program.addCommand(createToolCommand(tool));
}

program.parse(process.argv);
