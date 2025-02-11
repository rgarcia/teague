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
      removal: input?.stage === Stage.Prod ? "retain" : "remove",
      protect: [Stage.Prod].includes(input?.stage as Stage),
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
    const sshKeyPubPath =
      $app.stage == Stage.Prod
        ? process.env.HOME + "/.ssh/cannon-prod/id_ed25519.pub"
        : process.env.HOME + "/.ssh/cannon-dev/id_ed25519.pub";
    const sshKey = new hcloud.SshKey("sshKey", {
      publicKey: readFileSync(sshKeyPubPath).toString(),
      name: "sshKey",
    });
    const location = "ash";
    const serverName = `${location}-${$app.stage}-web-1`;
    const server = new hcloud.Server(serverName, {
      serverType: "cpx11",
      image: "debian-12",
      name: serverName,
      location: location,
      sshKeys: [sshKey.id],
      publicNets: [{ ipv4Enabled: true }, { ipv6Enabled: true }],
    });
    const sshKeyPrivPath =
      $app.stage == Stage.Prod
        ? process.env.HOME + "/.ssh/cannon-prod/id_ed25519"
        : process.env.HOME + "/.ssh/cannon-dev/id_ed25519";

    // Wait for SSH to become available
    const waitForSSH = new command.local.Command(`wait-for-ssh-${serverName}`, {
      create: $interpolate`count=0; until ssh -i ${sshKeyPrivPath} -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@${server.ipv4Address} 'exit' || [ $count -eq 24 ]; do echo "Waiting for SSH... ($(( 24 - count ))/24 attempts remaining)"; count=$((count + 1)); sleep 5; done; if [ $count -eq 24 ]; then echo "Timeout waiting for SSH after 2 minutes" >&2; exit 1; fi`,
      logging: "stdoutAndStderr",
    });

    // copy the playbook to the server
    const playbookPath = `${process.cwd()}/infra/web/playbook.yaml`;
    const copyPlaybook = new command.local.Command(
      `copy-playbook-${serverName}`,
      {
        create: $interpolate`scp -o StrictHostKeyChecking=no -i ${sshKeyPrivPath} ${playbookPath} root@${server.ipv4Address}:/root/playbook.yaml`,
        environment: {
          PLAYBOOK_HASH: hashFile(playbookPath),
        },
      },
      {
        dependsOn: [waitForSSH],
      }
    );

    const connection = {
      host: server.ipv4Address,
      user: "root",
      privateKey: readFileSync(sshKeyPrivPath).toString(),
    };
    // install some prereqs so we can run ansible on the server
    const aptInstallPrereqs = "apt update && apt install -y python3 ansible";
    const aptInstallPrereqsCmd = new command.remote.Command(
      `apt-install-prereqs-${serverName}`,
      {
        connection,
        create: aptInstallPrereqs,
      }
    );

    // run the playbook on the server
    const runPlaybook = new command.remote.Command(
      "run-playbook",
      {
        connection,
        create: $interpolate`PLAYBOOK_HASH=${hashFile(playbookPath)} \
          ANSIBLE_HOST_KEY_CHECKING=False \
          ansible-playbook -vv \
          --connection=local \
          --inventory=127.0.0.1, \
          /root/playbook.yaml \
          -e "deploy_env=${$app.stage}" \
          -e "node_env=${$app.stage === Stage.Prod ? "production" : "development"}" \
          -e "cloud_provider=hcloud" \
          -e "cloud_region=${location}" \
          -e "clerk_publishable_key=${secrets.clerk.publishableKey.value}" \
          -e "clerk_secret_key=${secrets.clerk.secretKey.value}"`,
        logging: "stdoutAndStderr",
      },
      {
        dependsOn: [copyPlaybook, aptInstallPrereqsCmd],
      }
    );

    const webRecord = new cloudflare.Record(`web-dns-record-${serverName}`, {
      name: $app.stage === "prod" ? "cannon-web" : "dev--cannon-web",
      zoneId: must("CLOUDFLARE_ZONE_ID"),
      type: "A",
      value: server.ipv4Address,
      proxied: true,
    });

    return {
      server,
    };
  },
});
