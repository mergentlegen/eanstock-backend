const { defineConfig } = require("vite");
const react = require("@vitejs/plugin-react");
const path = require("path");

module.exports = defineConfig({
  plugins: [react()],
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, "../public"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:3000",
      "/admin": "http://localhost:3000",
      "/health": "http://localhost:3000",
      "/locations": "http://localhost:3000",
      "/products": "http://localhost:3000",
      "/inventory": "http://localhost:3000",
      "/sales": "http://localhost:3000",
      "/jobs": "http://localhost:3000",
    },
  },
});
