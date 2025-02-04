# teague

An email thingy.

## Running locally

1. Install `bun`: [docs](https://bun.sh/docs/installation)

1. Set up a project in Google Cloud and then follow [these directions](https://developers.google.com/gmail/api/quickstart/python) to enable the Gmail API and get a `credentials.json` file, stopping short of all the python stuff. Some notes as you follow these directions:

   - It says to choose "internal" however this is only possible w/in a Google Workspace domain, so choose "External" if you're doing this for your personal email.
   - Give it any old logo, this is just a test app. [lucide.dev](https://lucide.dev) has an email icon you can use.
   - Make sure to add the gmail address you'd like to test with as a test user.

   The end result should be a `credentials.json` file that you can download and use locally to pull stuff from the Gmail API.
   Put this file in `packages/auth/credentials.json`.

1. Generate a `token.json` file by running this script:

   ```zsh
   cd packages/auth
   bun install
   bun run index.ts
   ```

## Ways to use it

Once you have a `packages/auth/token.json` you have a few options:

1.  You can chat with the gmail MCP server in Claude Desktop via

    ```zsh
    cd packages/tools
    bun install
    bun run chat-with gmail
    ```

    If you inspect the output of this command it will have a general command you can plug in to other MCP Clients, e.g. Cursor, if you want to chat with it elsewhere.

2.  You can inspect the gmail MCP server in the [MCP inspector](https://github.com/modelcontextprotocol/inspector), which is a visual testing tool for MCP servers:

    ```zsh
    cd packages/tools
    bun install
    bun run inspect gmail
    ```

## Leveling up to a CLI app with voice

Add the google cloud speech-to-text API to the google cloud project being used for email access: https://cloud.google.com/speech-to-text?hl=en.

Then create a service account by

1. Go to "IAM & Admin" > "IAM"
2. Find your service account
3. Add the "Cloud Speech-to-Text API User" role
4. Create a new key for the service account, and download it as json
5. Move it to packages/cli/speech-credentials.json.

Next you'll need to get langfuse credentials since prompts for the CLI are stored there.

Once you have those you can copy `packages/cli/.env.example` to `packages/cli/.env` and fill it out, and then run:

```zsh
cd packages/cli
bun install
rm -rf dist && bun run --env-file .env src/index.ts
```

Open up [localhost:3000/](http://localhost:3000/) alongside the CLI.
If you select "Speak" in the CLI, you need to switch focus to the web app for the web app to record, and then switch back to the CLI to hit a key to stop recording.
