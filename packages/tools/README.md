# tools

A collection of MCP servers.

## Why MCP

MCP lets you hop into a Claude Desktop session with something fairly easily, which allows for quick testing before you use them in other ways.

## Running a tool

To install dependencies:

```bash
bun install
```

To run a tool in Claude Desktop (this will quit and relaunch Claude Desktop):

```bash
bun run chat-with <tool name>
```

To run a tool through the [MCP inspector](https://modelcontextprotocol.io/docs/tools/inspector):

```bash
bun run inspect <tool name>
```
