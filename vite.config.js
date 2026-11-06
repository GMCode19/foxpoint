import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
// L'app è pubblicata su https://gmcode19.github.io/foxpoint/
export default defineConfig({ base: '/foxpoint/', plugins: [react()] })
