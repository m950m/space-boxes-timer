/** UI smoke checks for the Higgsfield-designed frontend with a fake Django API.
 * These do not constitute live database/SMTP acceptance.
 * Requires Playwright browser installed; override PLAYWRIGHT_MODULE for local toolchain.
 */
const assert=require("node:assert/strict");
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||"/usr/local/lib/node_modules/playwright");
const base=process.env.SPACE_BOXES_TEST_URL||"http://127.0.0.1:4174";
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox"]});
 const page=await browser.newPage({viewport:{width:1365,height:930}});
 const errors=[];page.on("pageerror",e=>errors.push(e.message));
 const day=new Date();const localDay=[day.getFullYear(),String(day.getMonth()+1).padStart(2,"0"),String(day.getDate()).padStart(2,"0")].join("-");
 let authed=false,registered=false,verified=false,focus=null,revision=0,db=[];
 await page.route("**/api/v2/**",async route=>{
  const url=new URL(route.request().url());const p=url.pathname;
  const send=(status,body)=>route.fulfill({status,contentType:"application/json",body:JSON.stringify(body)});
  const payload=route.request().postDataJSON?.()||{};
  if(p.endsWith("/csrf"))return send(200,{csrfToken:"mock-csrf"});
  if(p.endsWith("/accounts/me"))return authed?send(200,{account:{email:"test@example.invalid",scopeId:"00000000-0000-4000-8000-000000000001"}}):send(401,{error:{code:"unauthenticated",message:"Sign in required."}});
  if(p.endsWith("/accounts/register")){registered=true;return send(202,{ok:true,verificationRequired:true,message:"Check your email"})}
  if(p.endsWith("/accounts/verify")){assert.equal(payload.token,"test-verification-token");verified=true;return send(200,{ok:true,verified:true})}
  if(p.endsWith("/accounts/verify/resend"))return send(202,{ok:true,message:"If eligible, verification instructions will be sent."});
  if(p.endsWith("/accounts/login")){authed=true;return send(200,{account:{email:"test@example.invalid",scopeId:"00000000-0000-4000-8000-000000000001"}})}
  if(p.endsWith("/accounts/recovery/request"))return send(200,{ok:true});
  if(p.endsWith("/accounts/recovery/confirm")){assert.equal(payload.token,"sample-code");return send(200,{ok:true})}
  if(p.endsWith("/accounts/logout")||p.endsWith("/accounts/logout-all")){authed=false;return send(200,{ok:true})}
  if(p.endsWith("/sync/pull"))return send(200,{planDays:[{id:localDay,timezone:"UTC"}],tasks:db,sessions:[],evidence:[],decisions:[],authorityChanges:[],breaks:[],exposure:[],config:null,prefs:null,reservation:focus,scopeRevision:revision,focusRevision:revision,ownershipScopeId:"00000000-0000-4000-8000-000000000001"});
  if(p.endsWith("/sync/push")){const ops=payload.ops||[];for(const op of ops)if(op.kind==="task")db=[...db.filter(t=>t.id!==op.record.id),{...op.record,recordRevision:1}];revision++;return send(200,{results:ops.map(op=>({status:"accepted",record:{...op.record,recordRevision:1}}))})}
  if(p.endsWith("/focus/command")){revision++;if(payload.type==="start")focus={sessionId:payload.sessionId,state:"running",controllerId:payload.contextId,controlVersion:1,evidenceId:payload.evidenceId};if(payload.type==="pause"&&focus)focus.state="paused";if(payload.type==="resume"&&focus)focus.state="running";if(payload.type==="end")focus=null;return send(200,{focusRevision:revision,reservation:focus,session:null})}
  return send(404,{error:{code:"not_found",message:"not found"}});
 });
 await page.goto(base,{waitUntil:"networkidle"});
 assert.equal(await page.locator("h1").first().innerText(),"Room to focus.");
 await page.getByRole("button",{name:"Account",exact:true}).click();
 await page.getByRole("button",{name:"Create account",exact:true}).last().click();
 await page.getByRole("textbox",{name:"Email"}).fill("test@example.invalid");
 await page.getByLabel("Password").fill("Strong-Pass-For-QA-123!");
 await page.getByRole("button",{name:"Create account",exact:true}).last().click();
 await page.getByText("One quick step: verify your email").waitFor();
 assert(registered);
 await page.getByRole("button",{name:"I've verified — sign in"}).click();
 await page.getByLabel("Password").fill("Strong-Pass-For-QA-123!");
 await page.getByRole("button",{name:"Sign in",exact:true}).last().click();
 await page.getByText("Signed in as test@example.invalid.").waitFor();
 await page.getByRole("button",{name:"Close dialog"}).click();
 await page.getByRole("button",{name:"Planner",exact:true}).click();
 await page.getByRole("button",{name:"Add a task",exact:true}).click();
 await page.getByRole("textbox",{name:"Task title"}).fill("Work on a real priority");
 await page.getByRole("button",{name:"+ Focus session"}).click();
 await page.getByLabel("Break after session (minutes, optional)").fill("5");
 await page.getByRole("button",{name:/Save task/}).click();
 await page.waitForTimeout(700);console.log("debug errors",await page.locator(".form-error").allTextContents(),"db",db.length,"forms valid",await page.locator(".advanced-editor").evaluate(e=>e.checkValidity()).catch(()=>"closed"));
 assert.equal(db.length,1);
 assert.equal(db[0].sessionPlan.length,2);
 assert.equal(db[0].plannedBreaks.length,1);
 await page.getByRole("button",{name:"Close dialog"}).click();
 await page.getByRole("button",{name:"Start focus"}).click();
 await page.getByRole("button",{name:"Pause focus"}).waitFor();
 assert.equal(focus.state,"running");
 await page.getByRole("button",{name:"Pause focus"}).click();
 assert.equal(focus.state,"paused");
 await page.getByRole("button",{name:"Resume focus"}).click();
 await page.getByRole("button",{name:"End session"}).click();
 await page.getByRole("button",{name:"Start focus"}).waitFor();
 assert.equal(focus,null);
 assert.deepEqual(errors,[]);
 console.log("PASS sign-up UI, logged-in UI, connected planner, focus start/pause/resume/end, browser errors");
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
