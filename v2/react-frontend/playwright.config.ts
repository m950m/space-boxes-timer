import {defineConfig} from "@playwright/test";
const baseURL=process.env.SPACE_BOXES_TEST_URL||"http://127.0.0.1:8019";
if(!["127.0.0.1","localhost","[::1]"].includes(new URL(baseURL).hostname))
  throw new Error("These mutating tests require disposable loopback staging. Public staging needs separately approved resources and inbox verification.");
export default defineConfig({
  testDir:"./tests/e2e",workers:1,timeout:45000,
  // Auth traces capture request bodies/tokens; keep them disabled.
  use:{baseURL,trace:"off",
    launchOptions:process.env.SPACE_BOXES_BROWSER?{executablePath:process.env.SPACE_BOXES_BROWSER}:undefined},
  reporter:[["list"]],
});
