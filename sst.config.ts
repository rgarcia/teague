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
      },
      openai: {
        apiKey: new sst.Secret("OpenAIApiKey"),
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
        name: "PORT",
        value: "8080",
      },
      {
        name: "NODE_ENV",
        value: $app.stage === Stage.Prod ? "production" : "development",
      },
    ];

    const web = new railway.Service("web", {
      name: "web",
      configPath: "infra/web/railway.json",
      projectId: "882a6cf1-941e-4e94-a6b8-58cad52a1908",
      sourceRepo: "rgarcia/teague",
      sourceRepoBranch: "main",
      region: "us-west2",
      numReplicas: 1,
    });
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
