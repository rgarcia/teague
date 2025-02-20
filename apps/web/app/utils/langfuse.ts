import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { NodeSDK } from "@opentelemetry/sdk-node";
import Langfuse from "langfuse";
import { LangfuseExporter } from "langfuse-vercel";

const lfConfig = {
  baseUrl: process.env.LANGFUSE_BASE_URL,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
};

export const langfuse = new Langfuse(lfConfig);

// Set up OpenTelemetry with Langfuse exporter
const sdk = new NodeSDK({
  traceExporter: new LangfuseExporter(lfConfig),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
process.on("SIGTERM", () => {
  sdk.shutdown();
});
