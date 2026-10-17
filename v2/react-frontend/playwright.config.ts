import {defineConfig} from "@playwright/test";
export default defineConfig({
  testDir:"./tests/e2e",workers:1,timeout:45000,
  // Auth traces capture request bodies/tokens; keep them disabled.
  use:{baseURL:process.env.SPACE_BOXES_TEST_URL||"http://127.0.0.1:8019",trace:"off",
    launchOptions:process.env.SPACE_BOXES_BROWSER?{executablePath:process.env.SPACE_BOXES_BROWSER}:undefined},
  reporter:[["list"]],
});
