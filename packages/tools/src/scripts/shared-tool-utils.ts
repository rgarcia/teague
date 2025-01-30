import { exec } from "node:child_process";
import fs from "node:fs";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";
import path from "path";
import prompts from "prompts";

export const execAsync = promisify(exec);

export interface EnvVarConfig {
  name: string;
  description: string;
  refine?: (value: string) => boolean;
  message?: string;
}

// Helper to check if a string looks like a file path
export function looksLikePath(str: string): boolean {
  return (
    str.includes("/") ||
    str.includes("\\") ||
    str.startsWith("~") ||
    str.startsWith(".")
  );
}

// Helper to resolve paths, handling home directory (~)
export function resolvePath(str: string): string {
  if (str.startsWith("~")) {
    str = str.replace("~", process.env.HOME || process.env.USERPROFILE || "");
  }
  return path.resolve(str);
}

// Helper to get cache directory path for a tool
export function getCacheDir(toolName: string): string {
  return path.join(process.env.HOME!, ".cache", "chat-with", toolName);
}

// Helper to get cache file path for a tool
export function getCacheFile(toolName: string): string {
  return path.join(getCacheDir(toolName), "env-vars.json");
}

// Load cached values for a tool
export async function loadCache(
  toolName: string
): Promise<Record<string, string>> {
  const cacheFile = getCacheFile(toolName);
  try {
    const data = await fs.promises.readFile(cacheFile, "utf-8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

// Save values to cache for a tool
export async function saveCache(
  toolName: string,
  values: Record<string, string>
): Promise<void> {
  const cacheDir = getCacheDir(toolName);
  await mkdir(cacheDir, { recursive: true });
  await fs.promises.writeFile(
    getCacheFile(toolName),
    JSON.stringify(values, null, 2)
  );
}

// Collect environment variables for a tool
export async function collectEnvVars(
  toolName: string,
  requiredEnvVars: Record<string, EnvVarConfig>
): Promise<Record<string, string>> {
  // Load cached values
  const cachedValues = await loadCache(toolName);
  const results: Record<string, string> = {};

  for (const [key, config] of Object.entries(requiredEnvVars)) {
    const initial = cachedValues[key] || "";
    const response = await prompts({
      type: "text",
      name: "value",
      message: `Please enter value for ${config.name} (${config.description}):`,
      initial,
      validate: (value: string) => {
        if (value.length === 0) return "This field is required";
        if (config.refine && !config.refine(value))
          return config.message || "Invalid value";
        return true;
      },
    });

    if (!response.value) {
      console.error("Input cancelled");
      process.exit(1);
    }

    // If the input looks like a path, resolve it to absolute path
    const value = looksLikePath(response.value)
      ? resolvePath(response.value)
      : response.value;
    results[key] = value;
  }

  // Save values to cache
  await saveCache(toolName, results);

  return results;
}
