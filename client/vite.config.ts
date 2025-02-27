import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1337,
    allowedHosts: ["localhost", "10.0.0.68", "10.0.0.90", "10.0.0.24", "unixtm.dev", "timer.unixtm.dev"],
  },
})
