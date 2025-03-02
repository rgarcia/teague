import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import Langfuse from "langfuse";
import { LangfuseExporter } from "langfuse-vercel";
// for debugging:
// import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.INFO);

const lfConfig = {
  baseUrl: process.env.LANGFUSE_BASE_URL,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
};
export const langfuse = new Langfuse(lfConfig);
export const langfuseExporter = new LangfuseExporter(lfConfig);

let traceExporter: OTLPTraceExporter | LangfuseExporter;
if (process.env.OTEL_EXPORTER_OTLP_ENABLED === "true") {
  traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  });
} else {
  traceExporter = langfuseExporter;
}

// Set up OpenTelemetry with Langfuse exporter
const sdk = new NodeSDK({
  traceExporter,
  instrumentations: [getNodeAutoInstrumentations()],
  resource: new Resource({
    [ATTR_SERVICE_NAME]: "teague",
  }),
});

sdk.start();
process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("Tracing terminated"))
    .catch((error) => console.log("Error terminating tracing", error))
    .finally(() => process.exit(0));
});
