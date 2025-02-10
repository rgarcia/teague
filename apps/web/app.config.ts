import { defineConfig } from "@tanstack/start/config";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  vite: {
    // node_modules/vinxi/dist/types/lib/vite-dev.d.ts needs to be updated to comment out the omittion of 'server' for this to work
    server: {
      allowedHosts: ["raf--cannon.ngrok.app"],
    },
    plugins: [
      tsConfigPaths({
        projects: ["./tsconfig.json"],
      }),
    ],
  },
  server: {},
});
