import {defineConfig} from "vite";
export default defineConfig(({mode})=>({
  base:mode==="pages"?"/space-boxes-timer/":"/",
  server:{port:5173,proxy:{"/api/v2":{target:process.env.SPACE_BOXES_DEV_BACKEND||"http://127.0.0.1:8000",changeOrigin:true}}},
  build:{outDir:"dist"}
}));
