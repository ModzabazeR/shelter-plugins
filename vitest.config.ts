import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["plugins/**/*.test.ts"],
    globals: true,
  },
});
