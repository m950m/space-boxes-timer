// MOCKED API failure tests, separate from real-product.spec.ts.
import {test,expect} from "@playwright/test";
for(const status of [503,429])test(`mocked registration ${status} preserves form and sends one mutation`,async({page})=>{
  let posts=0;
  await page.route("**/api/v2/accounts/register",async route=>{posts++;await route.fulfill({status,contentType:"application/json",body:JSON.stringify({error:{code:"unavailable",message:"Service unavailable"}})})});
  await page.goto("/");await page.getByRole("button",{name:"Account",exact:true}).click();
  await page.getByRole("button",{name:"Create account",exact:true}).click();await page.getByLabel("Email",{exact:true}).fill("mock@example.invalid");await page.getByLabel("Password",{exact:true}).fill("Mocked-Local-Password-321!");
  await page.getByRole("button",{name:"Create account",exact:true}).click();await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByLabel("Email",{exact:true})).toHaveValue("mock@example.invalid");expect(posts).toBe(1);
});
test("mocked account sync outage cannot present local tasks as account data",async({page})=>{
  await page.goto("/");await page.getByRole("button",{name:"Set up box"}).click();
  await page.getByLabel("What will you focus on?").fill("Local-only draft");await page.getByRole("button",{name:"Save task",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Local-only draft",exact:true})).toBeVisible();
  const account={email:"mock-sync@example.invalid",scopeId:"mock-account"};
  let signedIn=false;
  await page.route("**/api/v2/accounts/login",route=>{signedIn=true;return route.fulfill({json:{account}})});
  await page.route("**/api/v2/accounts/me",route=>route.fulfill(signedIn?{json:{account}}:{status:401,json:{error:{message:"Sign in required"}}}));
  await page.getByRole("button",{name:"Account",exact:true}).click();
  await page.route("**/api/v2/sync/pull?*",route=>route.fulfill({status:503,json:{error:{message:"Unavailable"}}}));
  await page.getByLabel("Email",{exact:true}).fill(account.email);await page.getByLabel("Password",{exact:true}).fill("Mocked-Sync-Password-321!");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page.getByText("Signed in successfully. Task synchronization needs a retry.")).toBeVisible({timeout:10000});
  await page.getByRole("button",{name:"Close dialog"}).click();
  await expect(page.getByRole("heading",{name:"Local-only draft",exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Set up box"})).toBeDisabled();
});
