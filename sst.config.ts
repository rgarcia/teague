/// <reference path="./.sst/platform/config.d.ts" />
enum Stage {
  Prod = "prod",
  Dev = "dev",
}
function must(envVar: string): string {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
  return process.env[envVar]!;
}

export default $config({
  app(input) {
    return {
      name: "cannon",
      removal: "remove",
      protect: false,
      home: "aws",
      providers: {
        aws: {
          profile: "personal", // TODO: change :)
        },
        command: "1.0.1",
        cloudflare: {
          version: "5.49.0",
          apiToken: must("CLOUDFLARE_API_TOKEN"),
        },
        railway: {
          version: "0.4.4",
          token: must("RAILWAY_TOKEN"),
        },
      },
    };
  },
  async run() {
    if ($app.stage !== Stage.Prod && $app.stage !== Stage.Dev) {
      throw new Error("Invalid stage");
    }
    const secrets = {
      clerk: {
        publishableKey: new sst.Secret("ClerkPublishableKey"),
        secretKey: new sst.Secret("ClerkSecretKey"),
      },
      langfuse: {
        secretKey: new sst.Secret("LangfuseSecretKey"),
        otelExporterOtlpHeaders: new sst.Secret(
          "LangfuseOtelExporterOtlpHeaders"
        ),
      },
      openai: {
        apiKey: new sst.Secret("OpenAIApiKey"),
      },
      voyageai: {
        apiKey: new sst.Secret("VoyageAIKey"),
      },
      turbopuffer: {
        apiKey: new sst.Secret("TurbopufferKey"),
      },
      googleGenerativeAI: {
        apiKey: new sst.Secret("GoogleGenerativeAIKey"),
      },
      vapi: {
        apiKey: new sst.Secret("VapiKey"),
      },
      planetscale: {
        host: "aws.connect.psdb.cloud",
        username: new sst.Secret("PlanetScaleUsername"),
        password: new sst.Secret("PlanetScalePassword"),
      },
      livekit: {
        url: new sst.Secret("LiveKitUrl"),
        apiKey: new sst.Secret("LiveKitApiKey"),
        apiSecret: new sst.Secret("LiveKitApiSecret"),
      },
      elevenlabs: {
        apiKey: new sst.Secret("ElevenLabsApiKey"),
      },
      deepgram: {
        apiKey: new sst.Secret("DeepgramApiKey"),
      },
    };
    const vars = [
      {
        name: "CLERK_SECRET_KEY",
        value: secrets.clerk.secretKey.value,
      },
      {
        name: "CLERK_PUBLISHABLE_KEY",
        value: secrets.clerk.publishableKey.value,
      },
      {
        name: "VITE_CLERK_PUBLISHABLE_KEY",
        value: secrets.clerk.publishableKey.value,
      },
      {
        name: "LANGFUSE_SECRET_KEY",
        value: secrets.langfuse.secretKey.value,
      },
      {
        name: "LANGFUSE_PUBLIC_KEY",
        value: "pk-lf-e8c1add9-93a5-458d-96cc-44de551fcba1",
      },
      {
        name: "LANGFUSE_BASE_URL",
        value: "https://us.cloud.langfuse.com",
      },
      {
        name: "OPENAI_API_KEY",
        value: secrets.openai.apiKey.value,
      },
      {
        name: "VOYAGE_API_KEY",
        value: secrets.voyageai.apiKey.value,
      },
      {
        name: "TURBOPUFFER_API_KEY",
        value: secrets.turbopuffer.apiKey.value,
      },
      {
        name: "GOOGLE_GENERATIVE_AI_API_KEY",
        value: secrets.googleGenerativeAI.apiKey.value,
      },
      {
        name: "VAPI_API_KEY",
        value: secrets.vapi.apiKey.value,
      },
      {
        name: "DATABASE_HOST",
        value: secrets.planetscale.host,
      },
      {
        name: "DATABASE_USERNAME",
        value: secrets.planetscale.username.value,
      },
      {
        name: "DATABASE_PASSWORD",
        value: secrets.planetscale.password.value,
      },
      {
        name: "OTEL_EXPORTER_OTLP_ENABLED",
        value: "false",
      },
      {
        name: "OTEL_EXPORTER_OTLP_ENDPOINT",
        value: "https://us.cloud.langfuse.com/api/public/otel/v1/traces",
      },
      {
        name: "OTEL_EXPORTER_OTLP_HEADERS",
        value: secrets.langfuse.otelExporterOtlpHeaders.value,
      },
      {
        name: "PORT",
        value: "8080",
      },
      {
        name: "LIVEKIT_URL",
        value: secrets.livekit.url.value,
      },
      {
        name: "LIVEKIT_API_KEY",
        value: secrets.livekit.apiKey.value,
      },
      {
        name: "LIVEKIT_API_SECRET",
        value: secrets.livekit.apiSecret.value,
      },
      {
        name: "NODE_ENV",
        value: $app.stage === Stage.Prod ? "production" : "development",
      },
    ];

    const web = new railway.Service(
      "web",
      {
        name: "web",
        configPath: "infra/web/railway.json",
        projectId: "882a6cf1-941e-4e94-a6b8-58cad52a1908",
        sourceRepo: "rgarcia/teague",
        sourceRepoBranch: "main",
        numReplicas: 1,
      },
      {
        ignoreChanges: ["region"],
      }
    );
    const environmentId =
      $app.stage === Stage.Prod
        ? "df9b8b1d-913b-401d-9dfc-fcac5038c728"
        : "a17c7b31-aa1b-450c-b50c-429bc84add7e";
    let envVars: Record<string, railway.Variable> = {};
    for (const v of vars) {
      envVars[v.name] = new railway.Variable(`web-${v.name}`, {
        name: v.name,
        value: v.value,
        environmentId,
        serviceId: web.id,
      });
    }

    const livekitVars = [
      {
        name: "LIVEKIT_URL",
        value: secrets.livekit.url.value,
      },
      {
        name: "LIVEKIT_API_KEY",
        value: secrets.livekit.apiKey.value,
      },
      {
        name: "LIVEKIT_API_SECRET",
        value: secrets.livekit.apiSecret.value,
      },
      {
        name: "ELEVEN_API_KEY",
        value: secrets.elevenlabs.apiKey.value,
      },
      {
        name: "DEEPGRAM_API_KEY",
        value: secrets.deepgram.apiKey.value,
      },
      {
        name: "OPENAI_API_KEY",
        value: secrets.openai.apiKey.value,
      },
      {
        name: "NODE_ENV",
        value: $app.stage === Stage.Prod ? "production" : "development",
      },
    ];
    const livekit = new railway.Service(
      "livekit-worker",
      {
        name: "livekit-worker",
        configPath: "infra/livekit/railway.json",
        projectId: "882a6cf1-941e-4e94-a6b8-58cad52a1908",
        sourceRepo: "rgarcia/teague",
        sourceRepoBranch: "main",
        numReplicas: 1,
      },
      {
        ignoreChanges: ["region"],
      }
    );
    for (const v of livekitVars) {
      envVars[v.name] = new railway.Variable(`livekit-worker-${v.name}`, {
        name: v.name,
        value: v.value,
        environmentId,
        serviceId: livekit.id,
      });
    }

    const domain = `${$app.stage}--web.raf.xyz`;
    // const customDomain = new railway.CustomDomain("web", {
    //   domain,
    //   environmentId,
    //   serviceId: web.id,
    // });
    // the above doesn't work because the dnsRecordValue that Railway passes back in the API is just... wrong?
    // So go into the railway UI to do this and pull the values from there :(
    const dnsRecordValue =
      $app.stage === Stage.Dev
        ? "zgv62i8j.up.railway.app"
        : "w217r27l.up.railway.app";
    const dns = new cloudflare.Record("web", {
      name: domain,
      type: "CNAME",
      zoneId: must("CLOUDFLARE_ZONE_ID"),
      proxied: true,
      value: dnsRecordValue,
      comment: "Set via SST",
    });

    return { web, envVars, dns };
  },
});
