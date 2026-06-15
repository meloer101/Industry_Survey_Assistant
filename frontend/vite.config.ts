import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

const backendTarget = process.env.VITE_BACKEND_URL ?? "http://127.0.0.1:8000";
const proxyDebug = process.env.VITE_PROXY_DEBUG === "true";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  server: {
    host: true,
    allowedHosts: ["localhost", "127.0.0.1"],
    proxy: {
      // Proxy API requests to the backend server
      "/api": {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            if (proxyDebug) console.warn('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            if (proxyDebug) {
              console.info('Sending Request to the Target:', req.method, proxyReq.path);
            }
            // ADK 2.x enforces origin allowlist; rewrite Origin so the proxy
            // request looks same-origin to the backend.
            proxyReq.setHeader('Origin', 'http://127.0.0.1:8000');
          });
          proxy.on('proxyRes', (proxyRes, req, _res) => {
            if (proxyDebug) {
              console.info('Received Response from the Target:', proxyRes.statusCode, req.url);
            }
          });
        },
      },
    },
  },
});
