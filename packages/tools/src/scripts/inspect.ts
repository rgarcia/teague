import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "path";
import { collectEnvVars } from "./shared-tool-utils";

async function main() {
  const toolName = process.argv[2];

  if (!toolName) {
    console.error("Please provide a tool name as an argument");
    process.exit(1);
  }

  try {
    // Construct the import path relative to this script
    const modulePath = path.join("..", `${toolName}.ts`);
    const module = await import(modulePath);

    if (!module.requiredEnvVars || typeof module.requiredEnvVars !== "object") {
      console.error("Tool module does not export requiredEnvVars object");
      process.exit(1);
    }

    // Collect environment variables
    const envVars = await collectEnvVars(toolName, module.requiredEnvVars);

    // Get absolute path to the tool script
    const toolScriptPath = path.resolve(
      path.join(__dirname, "..", `${toolName}.ts`)
    );

    // Create temporary env file
    const envFilePath = path.join(os.tmpdir(), `mcp-env-${Date.now()}`);
    const envFileContent = Object.entries(envVars)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    fs.writeFileSync(envFilePath, envFileContent);

    console.log(
      `Running 'bunx @modelcontextprotocol/inspector@latest bun run ${toolScriptPath}' with env: ${envFileContent.replace(
        /\n/g,
        ", "
      )}`
    );

    // Run the inspector command
    const child = spawn(
      "bunx",
      [
        "@modelcontextprotocol/inspector@latest",
        "bun",
        "run",
        "--env-file",
        envFilePath,
        toolScriptPath,
      ],
      {
        stdio: "inherit", // Pipe stdout/stderr to parent process
      }
    );

    // Wait for the process to exit and forward its exit code
    child.on("exit", (code) => {
      // Clean up the temporary env file
      try {
        fs.unlinkSync(envFilePath);
      } catch (error) {
        console.warn("Failed to clean up temporary env file:", error);
      }
      process.exit(code ?? 1);
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    } else {
      console.error("An unknown error occurred");
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
