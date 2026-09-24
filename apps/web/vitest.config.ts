import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
  resolve: {
    alias: [
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, "./src/$1") },
      {
        find: /^@sama\/shared\/(.*)$/,
        replacement: path.resolve(__dirname, "../../packages/shared/$1"),
      },
    ],
  },
});