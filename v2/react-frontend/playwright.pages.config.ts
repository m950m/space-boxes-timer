import {defineConfig,devices} from "@playwright/test";
export default defineConfig({
  testDir:"./tests/pages",workers:1,timeout:45000,
  use:{baseURL:"http://127.0.0.1:4173/space-boxes-timer/",trace:"retain-on-failure",
    launchOptions:process.env.SPACE_BOXES_BROWSER?{executablePath:process.env.SPACE_BOXES_BROWSER}:undefined},
  projects:[{name:"desktop",use:{...devices["Desktop Chrome"]}},{name:"mobile",use:{...devices["iPhone 13"],defaultBrowserType:"chromium"}}],
  webServer:{command:"node tests/pages-server.mjs",url:"http://127.0.0.1:4173/space-boxes-timer/",reuseExistingServer:false},
  reporter:[["list"],["html",{open:"never",outputFolder:"pages-test-report"}]],
});
