/// <reference path="./.sst/platform/config.d.ts" />
import { createHash } from "crypto";
import { readFileSync } from "fs";
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

// hashFile is useful for adding dummy env variables to commands so that
// pulumi is tricked into running a command again when a file changes
const hashFile = (filePath: string) => {
  const content = readFileSync(filePath, "utf8");
  return createHash("sha256").update(content).digest("hex");
};

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
    const api = new sst.aws.ApiGatewayV2("Web");

    const myFunction = new sst.aws.Function("MyFunction", {
      url: true,
      runtime: "nodejs22.x",
      bundle: "apps/web/.output",
      handler: "./server/index.mjs.handler",
      environment: {
        NODE_ENV: "production",
        DEPLOY_ENV: $app.stage,
        VITE_CLERK_PUBLISHABLE_KEY: secrets.clerk.publishableKey.value,
        CLERK_PUBLISHABLE_KEY: secrets.clerk.publishableKey.value,
        CLERK_SECRET_KEY: secrets.clerk.secretKey.value,
      },
    });
    // api.route("$default", {
    //   handler: "apps/web/.output/server/index.mjs",
    //   runtime: "nodejs22.x",
    //   environment: {
    //     NODE_ENV: "production",
    //     DEPLOY_ENV: $app.stage,
    //     VITE_CLERK_PUBLISHABLE_KEY: secrets.clerk.publishableKey.value,
    //     CLERK_PUBLISHABLE_KEY: secrets.clerk.publishableKey.value,
    //     CLERK_SECRET_KEY: secrets.clerk.secretKey.value,
    //   },
    // });
    return { api };
  },
});
