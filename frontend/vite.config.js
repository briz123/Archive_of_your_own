import process from "node:process";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const basePath = process.env.VITE_BASE_PATH || "/";
const apiBaseUrl = process.env.VITE_API_BASE_URL?.trim();

if (basePath === "/Archive_of_your_own/") {
  if (!apiBaseUrl) {
    throw new Error("VITE_API_BASE_URL must be set for the GitHub Pages build.");
  }

  let parsedApiBaseUrl;
  try {
    parsedApiBaseUrl = new URL(apiBaseUrl);
  } catch {
    throw new Error("VITE_API_BASE_URL must be a valid backend origin.");
  }

  if (
    parsedApiBaseUrl.protocol !== "https:" ||
    parsedApiBaseUrl.pathname !== "/" ||
    parsedApiBaseUrl.search ||
    parsedApiBaseUrl.hash
  ) {
    throw new Error(
      "VITE_API_BASE_URL must be the HTTPS backend origin only, without an /api path.",
    );
  }
}


export default defineConfig({
  base: basePath,
  plugins: [react({ jsxRuntime: "automatic" })],
  server: {
    proxy: {
      "/api": "http://127.0.0.1:8000",
    }
  },
});
