import { exec } from "node:child_process";
import fs from "node:fs";
import path from "path";
import { collectEnvVars, execAsync } from "./shared-tool-utils";

interface ClaudeConfig {
  mcpServers: Record<
    string,
    {
      command: string;
      args: string[];
      env: Record<string, string>;
    }
  >;
}

async function isProcessRunning(processName: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`pgrep -f "${processName}"`);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function waitForProcessExit(
  processName: string,
  timeoutMs = 10000
): Promise<void> {
  const startTime = Date.now();
  while (await isProcessRunning(processName)) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for ${processName} to exit`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function waitForProcessStart(
  processName: string,
  timeoutMs = 10000
): Promise<void> {
  const startTime = Date.now();
  while (!(await isProcessRunning(processName))) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Timeout waiting for ${processName} to start`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function updateClaudeConfig(
  toolName: string,
  scriptPath: string,
  envVars: Record<string, string>
) {
  const configPath = path.join(
    process.env.HOME!,
    "Library/Application Support/Claude/claude_desktop_config.json"
  );

  // Create backup if config exists
  if (fs.existsSync(configPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${configPath}.bak-${timestamp}`;
    fs.copyFileSync(configPath, backupPath);
  }

  // Create fresh config
  const config: ClaudeConfig = {
    mcpServers: {
      [toolName]: {
        command: "bun",
        args: [scriptPath],
        env: envVars,
      },
    },
  };

  // Write new config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function restartClaudeDesktop() {
  const claudePath = "/Applications/Claude.app/Contents/MacOS/Claude";

  // Kill existing Claude process if running
  if (await isProcessRunning(claudePath)) {
    await execAsync(`pkill -TERM -f "${claudePath}"`);
    await waitForProcessExit(claudePath);
  }

  // Start Claude
  exec(`open -a Claude`);
  await waitForProcessStart(claudePath);
}

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

    console.log("\nCollected values:");
    console.log(envVars);

    // Get absolute path to the tool script
    const toolScriptPath = path.resolve(
      path.join(__dirname, "..", `${toolName}.ts`)
    );

    // Update Claude desktop config
    await updateClaudeConfig(toolName, toolScriptPath, envVars);
    console.log("Updated Claude desktop configuration");

    // Restart Claude desktop
    console.log("Restarting Claude desktop...");
    await restartClaudeDesktop();
    console.log("Claude desktop restarted successfully");
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
