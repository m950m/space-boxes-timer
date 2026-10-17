// Real browser → built React → Django → disposable PostgreSQL. No API mocks.
// Email is captured by Django's private file mailbox; external delivery is a separate gate.
import {test,expect,type Page} from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {readdirSync,readFileSync,statSync} from "node:fs";
import {join} from "node:path";

const password="Space-Boxes-E2E-Private-739!";
async function account(page:Page){await page.getByRole("button",{name:"Account",exact:true}).click()}
async function close(page:Page){await page.getByRole("button",{name:"Close dialog"}).click()}
async function login(page:Page,email:string){
  await account(page);await page.getByLabel("Email",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);
  await page.getByRole("button",{name:"Sign in",exact:true}).click();await expect(page.getByText("Signed in as "+email+".")).toBeVisible();await close(page);
}
function latestMail(email:string){
  const directory=process.env.SPACE_BOXES_DEV_EMAIL_DIR;
  if(!directory)throw new Error("Real E2E requires a private disposable SPACE_BOXES_DEV_EMAIL_DIR.");
  return readdirSync(directory).sort((a,b)=>statSync(join(directory,a)).mtimeMs-statSync(join(directory,b)).mtimeMs).map(file=>readFileSync(join(directory,file),"utf8")).filter(body=>body.includes("To: "+email)).at(-1)||"";
}
async function addTask(page:Page,title:string){
  await page.getByRole("button",{name:"Planner",exact:true}).click();await page.getByRole("button",{name:"Add a task",exact:true}).click();
  await page.getByLabel("Task title",{exact:true}).fill(title);await page.getByRole("button",{name:"Save task",exact:true}).click();
  await expect(page.locator(".advanced-task").filter({hasText:title})).toBeVisible();await close(page);
}
test("registration, verification, focus, refresh, recovery, export and deletion",async({page,context,browser})=>{
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  const email="real-"+Date.now()+"@example.invalid";
  await page.goto("/");await expect(page.getByRole("button",{name:"Set up box"})).toBeEnabled();
  await addTask(page,"Importable local priority");
  await account(page);await page.getByRole("button",{name:"Create account",exact:true}).click();
  await page.getByLabel("Email",{exact:true}).fill(email);await page.getByLabel("Password",{exact:true}).fill(password);
  await page.getByRole("button",{name:"Create account",exact:true}).click();
  await expect(page.getByText("One quick step: verify your email")).toBeVisible();
  await expect.poll(()=>latestMail(email)).toContain("#verify=");
  const link=latestMail(email).match(/Confirm your email: (\S+)/)![1];
  const verification=new URL(link).hash;await page.goto("/"+verification);
  await expect(page.getByText("Email verified. Please sign in.")).toBeVisible();await close(page);
  await login(page,email);await account(page);await page.getByRole("button",{name:"Import / sync local data"}).click();
  await expect(page.getByText("Local data import confirmed.")).toBeVisible();await close(page);
  await expect(page.getByRole("heading",{name:"Importable local priority",exact:true})).toBeVisible();
  await addTask(page,"Persisted real priority");
  // Legacy/imported URL text remains data; unsafe/malformed URLs must never render as links.
  await page.evaluate(async()=>{
    const {csrfToken}=await (await fetch("/api/v2/csrf")).json();
    const feed=await (await fetch("/api/v2/sync/pull?since=0")).json();
    const task=feed.tasks.find((t:any)=>t.title==="Persisted real priority");
    const response=await fetch("/api/v2/sync/push",{method:"POST",headers:{"Content-Type":"application/json","X-CSRFToken":csrfToken},body:JSON.stringify({ops:[{kind:"task",baseRevision:task.recordRevision,record:{...task,resources:[{url:"javascript:alert(1)"},{url:"not a URL"},{url:"https://example.com"}]}}]})});
    const result=await response.json();if(!response.ok||result.results[0].status!=="accepted")throw new Error("Disposable resource fixture rejected");
  });
  await page.reload();await expect(page.locator(".task-list")).toContainText("Persisted real priority");
  await page.getByRole("button",{name:"Persisted real priority, select task",exact:true}).click();
  await expect(page.locator(".working-links a")).toHaveCount(1);await expect(page.locator(".working-links a")).toHaveAttribute("href","https://example.com");
  await page.getByRole("button",{name:"Start focus",exact:true}).click();await expect(page.getByRole("button",{name:"Pause focus",exact:true})).toBeEnabled();
  await expect(page.locator(".timer")).toContainText("24");
  await page.getByRole("button",{name:"Pause focus",exact:true}).click();await expect(page.getByRole("button",{name:"Resume focus",exact:true})).toBeEnabled();
  const controlDevice=await browser.newContext();const controlPage=await controlDevice.newPage();await controlPage.goto("/");await login(controlPage,email);
  await expect(controlPage.getByRole("button",{name:"Recover control here"})).toBeEnabled();
  await expect(controlPage.getByRole("button",{name:"Resume focus",exact:true})).toBeDisabled();
  controlPage.once("dialog",dialog=>dialog.accept());await controlPage.getByRole("button",{name:"Recover control here"}).click();
  await controlPage.getByRole("button",{name:"Resume focus",exact:true}).click();await controlPage.getByRole("button",{name:"Pause focus",exact:true}).click();
  await page.getByRole("button",{name:"Refresh saved state"}).click();await expect(page.getByRole("button",{name:"Resume focus",exact:true})).toBeDisabled();await controlDevice.close();
  await page.reload();await expect(page.getByRole("button",{name:"Recover control here"})).toBeEnabled();
  await expect(page.getByRole("button",{name:"Resume focus",exact:true})).toBeDisabled();
  page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Recover control here"}).click();
  await page.getByRole("button",{name:"Resume focus",exact:true}).click();
  await page.getByRole("button",{name:"Complete task",exact:true}).click();
  await expect(page.getByRole("button",{name:"Task complete",exact:true})).toBeVisible();
  await page.reload();await page.getByRole("button",{name:"History",exact:true}).click();
  await expect(page.locator(".history-list")).toContainText("Persisted real priority");
  await expect(page.locator(".history-list")).toContainText("confirmed");await close(page);
  const other=await browser.newContext();const device=await other.newPage();await device.goto("/");await login(device,email);
  await expect(device.locator(".task-list")).toContainText("Persisted real priority");await other.close();
  await page.getByRole("button",{name:"Settings",exact:true}).click();await page.getByLabel("Report cadence",{exact:true}).selectOption("weekly");
  await page.getByLabel("Suggested distracting domains").fill("example.com");await page.getByRole("button",{name:"Save account preferences"}).click();
  await expect(page.getByText("Preferences confirmed in your account.")).toBeVisible();await close(page);
  await page.getByRole("button",{name:"Settings",exact:true}).click();await expect(page.getByLabel("Report cadence",{exact:true})).toHaveValue("weekly");await close(page);
  await account(page);const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export my data"}).click();
  const exported=await download;expect(exported.suggestedFilename()).toBe("space-boxes-export.json");
  const raw=readFileSync((await exported.path())!,"utf8"),data=JSON.parse(raw);
  expect(data.tasks.some((task:any)=>task.title==="Persisted real priority")).toBe(true);
  expect(data.evidence.some((row:any)=>row.endAt!==null)).toBe(true);expect(raw).not.toContain(password);
  await page.getByRole("button",{name:"Sign out",exact:true}).click();await close(page);
  await account(page);await page.getByRole("button",{name:"Forgot password?"}).click();await page.getByLabel("Email",{exact:true}).fill(email);
  await page.getByRole("button",{name:"Request recovery code"}).click();await expect(page.getByLabel("Recovery code")).toBeVisible();
  await expect.poll(()=>latestMail(email)).toContain("single-use code");
  const code=latestMail(email).match(/password:\r?\n([A-Za-z0-9_-]+)/)![1];
  await page.getByLabel("Recovery code").fill(code);await page.getByLabel("New password",{exact:true}).fill(password+"New");
  await page.getByRole("button",{name:"Reset password",exact:true}).click();await expect(page.getByText("Password changed. Sign in with your new password.")).toBeVisible();
  await page.getByLabel("Password",{exact:true}).fill(password+"New");await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await page.getByRole("button",{name:"Delete account…"}).click();await page.getByLabel("Confirm account password").fill("incorrect");
  await page.getByRole("button",{name:"Permanently delete account"}).click();await expect(page.getByRole("alert")).toContainText("Password confirmation failed");
  await page.getByLabel("Confirm account password").fill(password+"New");await page.getByRole("button",{name:"Permanently delete account"}).click();
  await expect(page.getByRole("button",{name:"Sign in",exact:true})).toBeVisible();expect(errors).toEqual([]);
});
test("local persistence, primary cap, extras, multiple sessions and browser takeover",async({page,context})=>{
  await page.goto("/");await expect(page.getByRole("button",{name:"Set up box"})).toBeEnabled();
  await addTask(page,"Local durable task");await page.reload();await expect(page.getByRole("heading",{name:"Local durable task",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Planner",exact:true}).click();await page.getByRole("button",{name:"Add a task",exact:true}).click();
  await page.getByLabel("Task title",{exact:true}).fill("Extra with two sessions");await page.getByLabel("Task classification",{exact:true}).selectOption("extra");
  await page.getByRole("button",{name:"+ Focus session"}).click();await page.getByLabel("Break after session (minutes, optional)").fill("5");
  await page.getByRole("button",{name:"Save task",exact:true}).click();
  const extra=page.locator(".advanced-task").filter({hasText:"Extra with two sessions"});await expect(extra).toContainText("2 sessions");
  await extra.getByRole("button",{name:"Focus session 2",exact:true}).click();await expect(page.getByRole("heading",{name:"Extra with two sessions",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Pause focus",exact:true}).click();
  const observer=await context.newPage();await observer.goto("/");await expect(observer.getByRole("button",{name:"Recover control here"})).toBeEnabled();
  observer.once("dialog",d=>d.accept());await observer.getByRole("button",{name:"Recover control here"}).click();
  await observer.getByRole("button",{name:"End session",exact:true}).click();await expect(observer.getByText("No active focus reservation.")).toBeVisible();await observer.close();
  await page.getByRole("button",{name:"Refresh saved state"}).click();await expect(page.getByRole("button",{name:"Start focus",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"Start focus",exact:true}).click();await expect(page.getByRole("button",{name:"Pause focus",exact:true})).toBeEnabled();
  await page.reload();await expect(page.getByRole("button",{name:"Recover control here"})).toBeEnabled();
  page.once("dialog",d=>d.accept());await page.getByRole("button",{name:"Recover control here"}).click();
  await page.getByRole("button",{name:"End session",exact:true}).click();await expect(page.getByText("No active focus reservation.")).toBeVisible();
  await page.getByRole("button",{name:"History",exact:true}).click();
  const uncertain=page.locator(".reconcile-form").filter({hasText:"Uncertain interval"}).first();await expect(uncertain).toBeVisible();
  await uncertain.getByLabel("Interval duration in seconds",{exact:true}).fill("2");await uncertain.getByLabel("Seconds for part 1",{exact:true}).fill("1");
  await uncertain.getByRole("button",{name:"Add interval part"}).click();await uncertain.getByLabel("Seconds for part 2",{exact:true}).fill("1");
  await uncertain.getByRole("button",{name:"Confirm evidence decision"}).click();await expect(uncertain).toHaveCount(0);await close(page);
  await page.getByRole("button",{name:"Insights",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("Interrupted time");
  await expect(page.getByRole("dialog")).toContainText("Local durable task");await close(page);
});
test("planner quota, subtasks, validation, rescheduling and session defaults",async({page})=>{
  await page.goto("/");await expect(page.getByRole("button",{name:"Set up box"})).toBeEnabled();
  await page.getByRole("button",{name:"Settings",exact:true}).click();await page.getByLabel("New focus session length").selectOption("45");await close(page);
  for(const title of ["Priority one","Priority two","Priority three"])await addTask(page,title);
  await page.getByRole("button",{name:"Planner",exact:true}).click();await expect(page.getByRole("dialog")).toContainText("3 of 3 primary");
  await page.getByRole("button",{name:"Add extra task",exact:true}).click();await page.getByLabel("Task title",{exact:true}).fill("Fourth priority draft");
  await expect(page.getByLabel("Minutes",{exact:true})).toHaveValue("45");await page.getByLabel("Task classification",{exact:true}).selectOption("primary");
  await page.getByRole("button",{name:"Save task",exact:true}).click();await expect(page.getByRole("alert")).toContainText("Only three primary");
  await expect(page.getByLabel("Task title",{exact:true})).toHaveValue("Fourth priority draft");await page.getByRole("button",{name:"Back to plan"}).click();
  const one=page.locator(".advanced-task").filter({has:page.getByText("Priority one",{exact:true})});await one.getByRole("button",{name:"Subtask / split"}).click();
  await page.getByLabel("Task title",{exact:true}).fill("Child with evidence notes");await page.getByLabel("Notes",{exact:true}).fill("A retained planning note");
  await page.getByLabel("Working links").fill("javascript:alert(1)");await page.getByRole("button",{name:"Save task",exact:true}).click();
  await expect(page.getByRole("alert")).toContainText("Working links must use");await page.getByLabel("Working links").fill("Reference | https://example.com");
  await page.getByRole("button",{name:"Save task",exact:true}).click();
  await one.getByRole("button",{name:"Edit",exact:true}).click();await page.getByRole("button",{name:"Cancel task",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("2 of 3 primary");await page.getByRole("button",{name:"Add a task",exact:true}).click();
  await page.getByLabel("Task title",{exact:true}).fill("Replacement priority");await page.getByRole("button",{name:"Save task",exact:true}).click();
  const child=page.locator(".advanced-task").filter({hasText:"Child with evidence notes"});await child.getByRole("button",{name:"Edit",exact:true}).click();
  await expect(page.getByLabel("Notes",{exact:true})).toHaveValue("A retained planning note");
  await page.getByLabel("Parent task").selectOption("");await page.getByLabel("Plan Day",{exact:true}).last().fill("2030-04-05");
  await page.getByLabel("Plan Day timezone",{exact:true}).fill("Pacific/Auckland");await page.getByRole("button",{name:"Save task",exact:true}).click();
  await expect(page.locator(".advanced-editor")).toHaveCount(0);
  await page.getByLabel("Plan Day",{exact:true}).fill("2030-04-05");await page.getByRole("button",{name:"Show day",exact:true}).click();
  await expect(child).toBeVisible();await child.getByRole("button",{name:"Edit",exact:true}).click();await expect(page.getByLabel("Plan Day timezone",{exact:true})).toHaveValue("Pacific/Auckland");
});
test("responsive, keyboard dialogs and reduced motion accessibility",async({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});await page.setViewportSize({width:390,height:844});await page.goto("/");
  await expect(page.getByRole("button",{name:"Set up box"})).toBeEnabled();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole("button",{name:"Planner",exact:true}).click();await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");await expect(page.getByRole("dialog")).toHaveCount(0);
  const results=await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze();
  expect(results.violations).toEqual([]);
  for(const name of ["Account","Settings"]){
    await page.getByRole("button",{name,exact:true}).click();
    expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);await close(page);
  }
  await page.getByRole("button",{name:"Planner",exact:true}).click();await page.getByRole("button",{name:"Add a task",exact:true}).click();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(["wcag2a","wcag2aa","wcag21aa"]).analyze()).violations).toEqual([]);
});
