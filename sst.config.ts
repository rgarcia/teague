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
        hcloud: {
          version: "1.21.2",
          token:
            input?.stage === Stage.Prod
              ? must("HCLOUD_TOKEN_PROD")
              : must("HCLOUD_TOKEN_DEV"),
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
    const customDomain = new railway.CustomDomain("web", {
      domain,
      environmentId,
      serviceId: web.id,
    });
    const dns = new cloudflare.Record("web", {
      name: domain,
      type: "CNAME",
      zoneId: must("CLOUDFLARE_ZONE_ID"),
      proxied: true,
      value: customDomain.dnsRecordValue,
      comment: "Set via SST",
    });

    return { web, envVars, domain };
  },
});
