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

1. Once you have a `packages/auth/token.json` file you can chat with your email in Claude Desktop via

   ```zsh
   cd packages/tools
   bun install
   bun run chat-with gmail
   ```

If you inspect the output of this command it will have a general command you can plug in to other MCP Clients, e.g. Cursor, if you want to chat with it elsewhere.
