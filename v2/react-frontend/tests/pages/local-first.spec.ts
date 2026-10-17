import {test,expect,chromium,type Page} from "@playwright/test";
import {mkdtemp,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";

const home="/space-boxes-timer/";
async function ready(page:Page){await page.goto(home);await expect(page.getByRole("button",{name:"Set up box"})).toBeEnabled()}
async function close(page:Page){await page.getByRole("button",{name:"Close dialog"}).click()}
async function add(page:Page,title="Read the course"){
  await page.getByRole("button",{name:"Set up box"}).click();
  await page.getByLabel("What will you focus on?").fill(title);
  await page.getByLabel("Working links").fill("https://example.com/course");
  await page.getByRole("button",{name:"Save task",exact:true}).click();
  await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
}
async function backup(page:Page){
  await page.getByRole("button",{name:"Settings",exact:true}).click();
  const download=page.waitForEvent("download");await page.getByRole("button",{name:"Export JSON backup"}).click();
  const file=await download;const stream=await file.createReadStream();let text="";
  for await(const chunk of stream!)text+=chunk.toString();
  return JSON.parse(text);
}
async function selectBackup(page:Page,data:any){
  await page.getByLabel("Import JSON backup",{exact:true}).setInputFiles({name:"backup.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify(data))});
}
test.beforeEach(async({page})=>{
  const failures:string[]=[];
  page.on("pageerror",e=>failures.push(e.message));
  page.on("console",m=>{if(m.type()==="error")failures.push(m.text())});
  await page.route("**/api/**",route=>{failures.push("Backend request: "+route.request().url());return route.abort()});
  (page as any).releaseFailures=failures;
});
test.afterEach(async({page})=>{expect((page as any).releaseFailures).toEqual([])});

test("original scene, navigation, base path, motion and mobile layout",async({page},info)=>{
  await ready(page);
  await expect(page.locator(".character")).toBeVisible();await expect(page.locator(".scene-task")).toHaveCount(3);
  await expect(page.locator(".star").first()).toHaveCSS("animation-name","drift");
  await expect(page.getByRole("button",{name:"Account",exact:true})).toHaveCount(0);
  await expect(page.getByText(/Clearing browser storage can erase your data/)).toBeVisible();
  for(const [button,heading] of [["Planner","Plan your space"],["History","Your focus history"],["Insights","Your focus insights"],["Settings","A space that suits you"]]){
    await page.getByRole("button",{name:button,exact:true}).click();
    await expect(page.getByRole("heading",{name:heading,exact:true})).toBeVisible();await close(page);
  }
  await page.getByRole("link",{name:"Space Boxes home",exact:true}).click();await expect(page).toHaveURL(/\/space-boxes-timer\/$/);
  await page.goto(home+"?from=bookmark#focus-controls");await page.reload();
  await expect(page.getByRole("button",{name:"Set up box"})).toBeEnabled();
  const width=await page.evaluate(()=>({content:document.documentElement.scrollWidth,viewport:innerWidth}));expect(width.content).toBeLessThanOrEqual(width.viewport);
  await page.screenshot({path:info.outputPath("scene.png"),fullPage:true});
  await info.attach("scene",{path:info.outputPath("scene.png"),contentType:"image/png"});
  await page.getByRole("button",{name:"Settings",exact:true}).click();await page.getByLabel("Quiet motion").check();await close(page);
  await expect(page.locator(".space-app")).toHaveClass(/quiet/);await page.reload();await expect(page.locator(".space-app")).toHaveClass(/quiet/);
});

test("create, edit, links, focus, pause/resume, completion, history and factual reports",async({page})=>{
  await ready(page);await add(page);
  await page.getByRole("button",{name:"Edit selected task",exact:true}).first().click();
  await page.getByLabel("What will you focus on?").fill("Finish the course");await page.getByRole("button",{name:"Save task",exact:true}).click();
  await expect(page.locator(".working-links a")).toHaveAttribute("href","https://example.com/course");
  await page.context().route("https://example.com/course",route=>route.fulfill({body:"Course link works"}));
  const opened=page.waitForEvent("popup");await page.locator(".working-links a").click();const popup=await opened;await expect(popup).toHaveURL("https://example.com/course");await popup.close();
  await page.getByRole("button",{name:"Start focus",exact:true}).click();await expect(page.locator(".cube.opened")).toHaveCount(1);
  await expect(page.locator(".timer")).not.toHaveText("25:00",{timeout:7000});
  await page.getByRole("button",{name:"Pause focus",exact:true}).click();const paused=await page.locator(".timer").innerText();
  await page.getByRole("button",{name:"History",exact:true}).click();await expect(page.locator(".history-list")).toContainText("Finish the course");await close(page);
  expect(await page.locator(".timer").innerText()).toBe(paused);
  await page.getByRole("button",{name:"Resume focus",exact:true}).click();await expect(page.getByRole("button",{name:"Pause focus",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"Complete task",exact:true}).click();await expect(page.getByRole("button",{name:"Task complete",exact:true})).toBeVisible();
  await page.reload();await expect(page.getByRole("button",{name:"Task complete",exact:true})).toBeVisible();
  await page.getByRole("button",{name:"History",exact:true}).click();await expect(page.locator(".history-list")).toContainText("ended-early");await close(page);
  await page.getByRole("button",{name:"Insights",exact:true}).click();
  await expect(page.locator(".insight-metrics>div").first().locator("strong")).toHaveText("1");
  await expect(page.getByText("1.0m",{exact:true})).toHaveCount(0); // A few seconds never become a full minute.
  await close(page);
  const data=await backup(page);expect(data.focus.sessions).toHaveLength(1);
  expect(data.focus.evidence.some((e:any)=>e.kind==="pause")).toBe(true);
  expect(data.focus.evidence.filter((e:any)=>e.kind==="focus").reduce((n:number,e:any)=>n+(e.elapsedMs||0),0)).toBeGreaterThan(0);
});

test("reload keeps the reservation and requires explicit recovery; another tab cannot double-start",async({page,context})=>{
  await ready(page);await add(page,"Persisted focus");await page.getByRole("button",{name:"Start focus",exact:true}).click();
  await page.getByRole("button",{name:"Pause focus",exact:true}).click();await expect(page.getByRole("button",{name:"Resume focus",exact:true})).toBeEnabled();await page.reload();
  await expect(page.getByRole("button",{name:"Resume focus",exact:true})).toBeDisabled();await expect(page.getByRole("button",{name:"Recover control here"})).toBeEnabled();
  page.once("dialog",dialog=>dialog.accept());await page.getByRole("button",{name:"Recover control here"}).click();await expect(page.getByRole("button",{name:"Resume focus",exact:true})).toBeEnabled();
  const other=await context.newPage();await other.goto(home);await expect(other.getByRole("button",{name:"Resume focus",exact:true})).toBeDisabled();await other.close();
  await page.getByRole("button",{name:"Resume focus",exact:true}).click();await page.getByRole("button",{name:"End session",exact:true}).click();
  await expect(page.getByRole("button",{name:"Start focus",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"History",exact:true}).click();await expect(page.getByRole("group",{name:"Unknown pause duration",exact:true})).toBeVisible();
});

test("local planning, focus and export continue with the network offline",async({page,context})=>{
  await ready(page);await page.evaluate(()=>document.fonts.ready.then(()=>{}));await context.setOffline(true);
  await add(page,"Offline work");await page.getByRole("button",{name:"Start focus",exact:true}).click();
  await page.getByRole("button",{name:"Pause focus",exact:true}).click();await expect(page.getByRole("button",{name:"Resume focus",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"End session",exact:true}).click();await expect(page.getByRole("button",{name:"Start focus",exact:true})).toBeEnabled();
  const data=await backup(page);expect(data.planning.tasks[0].title).toBe("Offline work");expect(data.focus.sessions[0].ending).toBeTruthy();
});

test("a backup of unfinished work restores a reserved session with explicit recovery",async({page,browser})=>{
  await ready(page);await add(page,"Unfinished backup");await page.getByRole("button",{name:"Start focus",exact:true}).click();await expect(page.getByRole("button",{name:"Pause focus",exact:true})).toBeEnabled();
  const data=await backup(page);expect(data.focus.reservation.state).toBe("running");
  const fresh=await browser.newContext();const restored=await fresh.newPage();await ready(restored);
  await restored.getByRole("button",{name:"Settings",exact:true}).click();await selectBackup(restored,data);await restored.getByRole("button",{name:"Restore validated backup"}).click();await expect(restored.getByText(/Backup restored in this browser/)).toBeVisible();await close(restored);
  await expect(restored.getByRole("button",{name:"Pause focus",exact:true})).toBeDisabled();
  restored.once("dialog",dialog=>dialog.accept());await restored.getByRole("button",{name:"Recover control here"}).click();await expect(restored.getByRole("button",{name:"Pause focus",exact:true})).toBeEnabled();
  await restored.getByRole("button",{name:"End session",exact:true}).click();await expect(restored.getByRole("button",{name:"Start focus",exact:true})).toBeEnabled();
  await restored.getByRole("button",{name:"History",exact:true}).click();await expect(restored.getByRole("group",{name:"Uncertain interval",exact:true})).toBeVisible();await fresh.close();
});

test("JSON round trip restores evidence in a fresh workspace and rejects corrupt/conflicting imports",async({page,browser})=>{
  await ready(page);await add(page,"Backed up work");await page.getByRole("button",{name:"Start focus",exact:true}).click();await page.getByRole("button",{name:"End session",exact:true}).click();
  const data=await backup(page);await selectBackup(page,data);await page.getByRole("button",{name:"Restore validated backup"}).click();await expect(page.getByText("This backup is already present. No data changed.")).toBeVisible();
  const corrupt=structuredClone(data);corrupt.focus.sessions[0].taskId="missing";await selectBackup(page,corrupt);await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("button",{name:"Restore validated backup"})).toHaveCount(0);
  const fresh=await browser.newContext();const restored=await fresh.newPage();await ready(restored);
  await restored.getByRole("button",{name:"Settings",exact:true}).click();await selectBackup(restored,data);await restored.getByRole("button",{name:"Restore validated backup"}).click();await expect(restored.getByText(/Backup restored in this browser/)).toBeVisible();await close(restored);
  await restored.reload();await expect(restored.getByRole("heading",{name:"Backed up work",exact:true})).toBeVisible();
  await restored.getByRole("button",{name:"History",exact:true}).click();await expect(restored.locator(".history-list li")).toHaveCount(1);await close(restored);
  const restoredData=await backup(restored);expect(restoredData.focus.evidence).toEqual(data.focus.evidence);expect(restoredData.focus.sessions[0].startingSnapshot).toEqual(data.focus.sessions[0].startingSnapshot);
  const conflict=structuredClone(data);conflict.planning.tasks[0].title="Conflicting replacement";
  await selectBackup(restored,conflict);await restored.getByRole("button",{name:"Restore validated backup"}).click();await expect(restored.getByRole("alert")).toContainText("empty local workspace");await close(restored);
  await expect(restored.getByRole("heading",{name:"Backed up work",exact:true})).toBeVisible();await fresh.close();
});

test("planner supports three priorities, extra tasks, multiple sessions, notes and explicit completion",async({page})=>{
  await ready(page);await page.getByRole("button",{name:"Planner",exact:true}).click();
  for(let i=1;i<=4;i++){
    await page.getByRole("button",{name:i===4?"Add extra task":"Add a task",exact:true}).click();await page.getByLabel("Task title",{exact:true}).fill("Priority "+i);
    if(i===1){await page.getByLabel("Notes",{exact:true}).fill("Keep original evidence");await page.getByRole("button",{name:"+ Focus session",exact:true}).click()}
    await page.getByRole("button",{name:"Save task",exact:true}).click();
  }
  await expect(page.locator(".advanced-task")).toHaveCount(4);await expect(page.locator(".advanced-task").filter({hasText:"Priority 4"})).toContainText("extra");
  await page.locator(".advanced-task").filter({hasText:"Priority 4"}).getByRole("button",{name:"Edit",exact:true}).click();await page.getByRole("button",{name:"Mark complete",exact:true}).click();
  await close(page);await page.reload();await page.getByRole("button",{name:"Planner",exact:true}).click();await expect(page.locator(".advanced-task").filter({hasText:"Priority 4"})).toContainText("Completed");
});

test("browser process restart preserves tasks and a paused focus session",async({page},info)=>{
  test.skip(info.project.name!=="desktop","One real process-restart check is sufficient.");
  const profile=await mkdtemp(join(tmpdir(),"space-boxes-pages-"));
  const options={headless:true,executablePath:process.env.SPACE_BOXES_BROWSER};
  let persistent=await chromium.launchPersistentContext(profile,options);
  try{
    const first=await persistent.newPage();await first.goto("http://127.0.0.1:4173"+home);await add(first,"Survives restart");await first.getByRole("button",{name:"Start focus",exact:true}).click();await first.getByRole("button",{name:"Pause focus",exact:true}).click();await expect(first.getByRole("button",{name:"Resume focus",exact:true})).toBeEnabled();
    await persistent.close();persistent=await chromium.launchPersistentContext(profile,options);
    const reopened=await persistent.newPage();await reopened.goto("http://127.0.0.1:4173"+home);await expect(reopened.getByRole("heading",{name:"Survives restart",exact:true})).toBeVisible();
    await expect(reopened.getByRole("button",{name:"Resume focus",exact:true})).toBeDisabled();await expect(reopened.getByRole("button",{name:"Recover control here"})).toBeEnabled();
  }finally{await persistent.close();await rm(profile,{recursive:true,force:true})}
});
