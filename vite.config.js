import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base: the build works at any URL depth, so GitHub Pages project
  // sites (/usuario.github.io/repo/) load without hardcoding the repo name.
  base: "./",
});
