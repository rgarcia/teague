import { defineConfig } from "@tanstack/start/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  vite: {
    // node_modules/vinxi/dist/types/lib/vite-dev.d.ts needs to be updated to comment out the omittion of 'server' for this to work w/ typescript
    // @ts-ignore
    server: {
      allowedHosts: [
        "raf--cannon.ngrok.app",
        "dev--web.raf.xyz",
        "prod--web.raf.xyz",
      ],
    },
    build: {
      sourcemap: true,
      outDir: "dist",
      assetsDir: "assets",
    },
    plugins: [
      tsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
    ],
  },
  server: {
    preset: "node-server",
  },
});
