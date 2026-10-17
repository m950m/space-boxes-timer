import {useEffect,useReducer,useRef,useState,type CSSProperties,type FormEvent} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {initial,reduce,type Task} from "./model";
import {Workspace} from "./workspace";
import {SettingsPanel} from "./SettingsPanel";
import {FocusDetails} from "./FocusDetails";
import {getSessionActivity} from "./connected/focus/activity-evidence.js";
import * as api from "./connected/api.js";
import "./space-boxes.css";
import {toRemoteView,currentDay,timezone,safeLinks,type PullFeed,type RemoteTask} from "./connected/live";
import {createBrowserFocus} from "./connected/focus/browser-focus.js";
import {getDayActivityReport} from "./connected/reports/activity-reports.js";
import {AdvancedPlanner} from "./AdvancedPlanner";
import {LOCAL_ONLY} from "./release";


function Icon({name,size=20}:{name:string;size?:number}){
const paths:Record<string,React.ReactNode>={
play:<path d="m9 5 11 7-11 7Z"/>,
pause:<><path d="M8 5v14M16 5v14"/></>,
check:<path d="m5 12 4 4L19 6"/>,
close:<path d="m6 6 12 12M18 6 6 18"/>,
edit:<><path d="m15 5 4 4M5 19l4-1L20 7a2.8 2.8 0 0 0-4-4L5 14Z"/></>,
history:<><path d="M3 11a9 9 0 1 1 2 7M3 4v7h7M12 7v5l3 2"/></>,
settings:<><path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/></>,
link:<><path d="m9 15 6-6M7 14l-2 2a3 3 0 0 0 4 4l4-4M11 8l4-4a3 3 0 0 1 4 4l-2 2"/></>,
user:<><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/></>,
arrow:<path d="M5 12h14m-5-5 5 5-5 5"/>,
box:<><path d="m12 3 9 5v9l-9 5-9-5V8Zm0 10v9M3 8l9 5 9-5M7.5 5.5l9 5"/></>,
};
return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]||paths.box}</svg>;
}
function Character(){
return <svg className="character" viewBox="0 0 580 650" aria-label="An original faceless figure with a transparent head holding your task boxes" role="img">
<defs>
<linearGradient id="skin" x1="0" y1="0" x2="1" y2=".7"><stop stopColor="#fcfdfd"/><stop offset=".45" stopColor="#dbe4e7"/><stop offset="1" stopColor="#91a6ad"/></linearGradient>
<linearGradient id="shirt" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#c5d2d5"/><stop offset=".5" stopColor="#99afb5"/><stop offset="1" stopColor="#5b7b83"/></linearGradient>
<linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#fff" stopOpacity=".7"/><stop offset=".5" stopColor="#c8d9df" stopOpacity=".08"/><stop offset="1" stopColor="#8baab1" stopOpacity=".55"/></linearGradient>
<linearGradient id="neck" x1="0" y1="0" x2="1" y2="0"><stop stopColor="#b0c0c5"/><stop offset=".45" stopColor="#f3f6f6"/><stop offset="1" stopColor="#8aa3ab"/></linearGradient>
<radialGradient id="base"><stop stopColor="#58747c" stopOpacity=".25"/><stop offset="1" stopColor="#58747c" stopOpacity="0"/></radialGradient>
</defs>
<ellipse cx="298" cy="600" rx="215" ry="38" fill="url(#base)"/>
<path d="M241 370v66c-27 18-59 17-83 32-42 24-47 76-51 111 96 42 268 45 361 0-7-48-17-86-56-109-28-17-63-19-85-34v-72Z" fill="url(#shirt)" stroke="#8ca3aa" strokeWidth="1.5"/>
<path d="M244 366v64c14 24 65 27 83 5v-72" fill="url(#neck)" stroke="#a1b3b9" strokeWidth="1.5"/>
<path d="M171 258c-10 20-5 59 9 72 7 7 14 5 18 3 11 55 52 91 91 90 55-2 100-54 106-121l12-25-11-22Z" fill="url(#skin)" stroke="#93aab2" strokeWidth="1.5"/>
<path d="M193 280c-17-20-34-12-30 9 3 17 11 25 24 22" fill="url(#skin)" stroke="#9bb0b6" strokeWidth="2"/>
<path d="M185 286c-8-7-11 8-3 15" fill="none" stroke="#8fa5ad" strokeWidth="2"/>
<path d="M196 324c11 50 42 76 76 83" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="3"/>
<path d="M193 257c-8-74 20-145 101-148 83-4 113 58 103 148Z" fill="url(#glass)" stroke="#9bb5bc" strokeWidth="1.5"/>
<ellipse cx="295" cy="256" rx="102" ry="31" fill="#9bb1b9" fillOpacity=".3" stroke="#78949e" strokeWidth="1.5"/>
<ellipse cx="295" cy="253" rx="94" ry="25" fill="#e3ebed" fillOpacity=".6"/>
<path d="M214 207c-2-36 23-66 49-76" fill="none" stroke="#fff" strokeOpacity=".8" strokeWidth="6" strokeLinecap="round"/>
<path d="M374 181c9 18 12 34 10 53" fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="2"/>
<path d="M191 477c-19 36-21 66-18 104M380 476c22 30 29 63 25 107" fill="none" stroke="#6d8d96" strokeOpacity=".45" strokeWidth="2"/>
<path d="M219 452c22 34 93 47 135 4" fill="none" stroke="#f5f8f8" strokeOpacity=".45" strokeWidth="3"/>
<path d="m245 499 29 17 28-16v32l-28 17-29-16Z" fill="none" stroke="#e1eaed" strokeWidth="1.5" opacity=".7"/><path d="m245 499 29-16 28 17m-28 16v33" fill="none" stroke="#e1eaed" strokeWidth="1.5" opacity=".7"/>
</svg>;
}
function Cube({number,opened,done}:{number:number;opened?:boolean;done?:boolean}){
return <span className={"cube "+(opened?"opened ":"")+(done?"finished":"")} aria-hidden="true"><span className="cube-shadow"/><span className="cube-front">{done?<Icon name="check" size={22}/>:String(number).padStart(2,"0")}</span><span className="cube-side"/><span className="cube-lid"/></span>;
}
function Modal({title,children,open,onOpenChange}:{title:string;children:React.ReactNode;open:boolean;onOpenChange:(v:boolean)=>void}){
return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="modal-shade"/><Dialog.Content className="modal-panel"><div className="modal-heading"><Dialog.Title>{title}</Dialog.Title><Dialog.Close className="icon-button" aria-label="Close dialog"><Icon name="close"/></Dialog.Close></div><Dialog.Description className="sr-only">{title} in your Space Boxes workspace.</Dialog.Description>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
function Editor({task,save}:{task:Task;save:(t:Task)=>void}){
const [title,setTitle]=useState(task.title),[time,setTime]=useState(task.start),[minutes,setMinutes]=useState(task.minutes),[links,setLinks]=useState(task.links.join("\n")),[error,setError]=useState("");
function submit(e:FormEvent){e.preventDefault();const urls=links.split("\n").map(s=>s.trim()).filter(Boolean);if(!title.trim()){setError("Give this task a title.");return}if(urls.some(u=>{try{return !["https:","http:"].includes(new URL(u).protocol)}catch{return true}})){setError("Use full https:// or http:// working links, one per line.");return}save({...task,title:title.trim(),start:time,minutes,links:urls})}
return <form onSubmit={submit} className="editor"><label>What will you focus on?<input autoFocus value={title} maxLength={90} onChange={e=>setTitle(e.target.value)} required/></label><div className="form-grid"><label>Planned start<input type="time" value={time} onChange={e=>setTime(e.target.value)} required/></label><label>Session length<select value={minutes} onChange={e=>setMinutes(Number(e.target.value))}>{[5,15,25,45,60,90].map(n=><option key={n} value={n}>{n} minutes</option>)}</select></label></div><label>Working links <small>Optional, one per line</small><textarea rows={3} value={links} onChange={e=>setLinks(e.target.value)} placeholder="https://"/></label>{error&&<p role="alert" className="form-error">{error}</p>}<p className="fineprint">A planned time is a reminder to yourself. Focus starts when you choose.</p><button type="submit" className="save-button">Save task <Icon name="check"/></button></form>;
}

type AccountInfo = { email?: string; [key: string]: unknown };
async function accountRequest(path:string,data?:Record<string,string>){
  return await api.request(data?"POST":"GET","/api/v2/"+path,data) as Record<string,unknown>;
}
function ConnectedAccount({notify,onAuthenticated,onSignedOut,onImportLocal,verificationMessage}:{verificationMessage:string;onImportLocal:()=>Promise<void>;notify:(message:string)=>void;onAuthenticated:()=>Promise<void>;onSignedOut:()=>void}){
  type AccountMode = "login"|"register"|"recover"|"recover-confirm"|"verify-pending";
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [code,setCode]=useState("");
  const [newPassword,setNewPassword]=useState("");
  const [mode,setMode]=useState<AccountMode>("login");
  const [account,setAccount]=useState<AccountInfo|null>(null);
  const [working,setWorking]=useState(false);
  const [error,setError]=useState("");
  const [info,setInfo]=useState("");
  const [deleteOpen,setDeleteOpen]=useState(false);
  const [deletePassword,setDeletePassword]=useState("");
  useEffect(()=>{if(verificationMessage){setMode("login");setInfo(verificationMessage);setPassword("");setError("")}},[verificationMessage]);

  useEffect(()=>{
    accountRequest("accounts/me").then(value=>setAccount((value.account||value.user||value) as AccountInfo)).catch(()=>{});
  },[]);

  async function submit(event:FormEvent){
    event.preventDefault();
    setError("");
    setWorking(true);
    try {
      if(mode==="recover"){
        await accountRequest("accounts/recovery/request",{email});
        setMode("recover-confirm");
        setInfo("If the account is eligible and email delivery is available, a recovery code will arrive.");
        return;
      }
      if(mode==="recover-confirm"){
        await accountRequest("accounts/recovery/confirm",{token:code,password:newPassword});
        setNewPassword("");setCode("");setPassword("");
        setMode("login");
        setInfo("Password changed. Sign in with your new password.");
        return;
      }
      if(mode==="register"){
        const response=await accountRequest("accounts/register",{email,password});
        setPassword("");
        if(response.verificationRequired){
          setMode("verify-pending");
          setInfo("Check your inbox for a single-use verification link. Your account remains inactive until verified.");
          return;
        }
      } else if(mode==="login"){
        await accountRequest("accounts/login",{email,password});
      } else return;

      const value=await accountRequest("accounts/me");
      setAccount((value.account||value.user||value) as AccountInfo);
      setPassword("");
      try {
        await onAuthenticated();
        notify("Account connected. Your saved tasks are ready.");
      } catch(syncError) {
        setError(syncError instanceof Error?syncError.message:"Signed in, but tasks could not be loaded.");
        notify("Signed in successfully. Task synchronization needs a retry.");
      }
    }catch(e){
      setError(e instanceof Error?e.message:"The request could not be completed.");
    }finally {setWorking(false)}
  }

  async function resend(){
    setWorking(true);setError("");setInfo("");
    try{
      const response=await accountRequest("accounts/verify/resend",{email});
      setInfo(String(response.message||"If eligible, another verification email will arrive."));
    }catch(e){setError(e instanceof Error?e.message:"Couldn't request verification email.")}
    finally{setWorking(false)}
  }
  async function logout(all=false){
    setWorking(true);setError("");
    try{
      await accountRequest(all?"accounts/logout-all":"accounts/logout",{});
      setAccount(null);onSignedOut();
      notify(all?"Signed out from all devices.":"Signed out.");
    }catch(e){setError(e instanceof Error?e.message:"Sign out failed.")}
    finally{setWorking(false)}
  }
  async function deleteAccount(event:FormEvent){
    event.preventDefault();setWorking(true);setError("");
    try{
      await accountRequest("account/delete",{password:deletePassword});
      setDeletePassword("");setAccount(null);onSignedOut();
      notify("Your connected account has been deleted.");
    }catch(e){setError(e instanceof Error?e.message:"Account deletion failed.")}
    finally{setWorking(false)}
  }
  const switchMode=(next:AccountMode)=>{
    setError("");setInfo("");setPassword("");setNewPassword("");setCode("");setMode(next);
  };
  if(account){
    return <div className="connected-account">
      <p>Signed in{account.email?" as "+account.email:""}.</p>
      <p className="fineprint">Your plans, focus and account data stay in your Space Boxes workspace.</p>
      <button className="save-button" disabled={working} onClick={async()=>{setWorking(true);setError("");try{const result=await api.request("GET","/api/v2/account/export");const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:"application/json"}));const link=document.createElement("a");link.href=url;link.download="space-boxes-export.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){setError(e instanceof Error?e.message:"Export failed.")}finally{setWorking(false)}}}>Export my data <Icon name="arrow" size={18}/></button>
      <p className="fineprint">Import this browser's local plans and ended sessions explicitly. Local data stays intact; conflicting changes require resolution.</p>
      <button className="reset-button" disabled={working} onClick={async()=>{setWorking(true);setError("");try{await onImportLocal();setInfo("Local data import confirmed.")}catch(e){setError(e instanceof Error?e.message:"Import failed; local data is preserved.")}finally{setWorking(false)}}}>Import / sync local data</button>
      {info&&<p role="status">{info}</p>}
      <button className="reset-button" disabled={working} onClick={async()=>{setWorking(true);setError("");try{await onAuthenticated()}catch(e){setError(e instanceof Error?e.message:"Account workspace unavailable.")}finally{setWorking(false)}}}>Load account workspace</button>
      <div className="account-actions">
        <button type="button" disabled={working} className="reset-button" onClick={()=>logout(false)}>Sign out</button>
        <button type="button" disabled={working} className="reset-button" onClick={()=>logout(true)}>Sign out all devices</button>
        <button type="button" disabled={working} className="reset-button" onClick={()=>setDeleteOpen(!deleteOpen)}>{deleteOpen?"Cancel deletion":"Delete account…"}</button>
      </div>
      {deleteOpen&&<form className="editor" onSubmit={deleteAccount}>
        <p className="fineprint">This permanently deletes your account and connected data. The action cannot be undone.</p>
        <label>Confirm account password<input type="password" required value={deletePassword} onChange={e=>setDeletePassword(e.target.value)}/></label>
        <button className="reset-button" type="submit" disabled={working||!deletePassword}>Permanently delete account</button>
      </form>}
      {error&&<p className="form-error" role="alert">{error}</p>}
    </div>;
  }
  return <div className="connected-account">
    {mode==="verify-pending"?<div className="editor">
      <h3>One quick step: verify your email</h3>
      <p>Check the inbox for <strong>{email}</strong> and open the Space Boxes verification link.</p>
      <p className="fineprint">The link expires in 24 hours and can be used only once.</p>
      {info&&<p role="status" className="fineprint">{info}</p>}
      {error&&<p role="alert" className="form-error">{error}</p>}
      <button className="save-button" type="button" disabled={working} onClick={resend}>{working?"Sending…":"Resend verification email"}</button>
      <button className="reset-button" type="button" onClick={()=>switchMode("login")}>I've verified — sign in</button>
    </div>:<form className="editor" onSubmit={submit}>
      <p className="fineprint">{mode==="register"?"Create a connected Space Boxes account. We'll ask you to verify your email.":mode==="login"?"Sign in to save your three priorities, focus and history.":"Recover your account with a one-use email code."}</p>
      {mode!=="recover-confirm"&&<label>Email<input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} /></label>}
      {(mode==="login"||mode==="register")&&<label>Password<input type="password" minLength={8} autoComplete={mode==="register"?"new-password":"current-password"} required value={password} onChange={e=>setPassword(e.target.value)}/></label>}
      {mode==="recover-confirm"&&<>
        <label>Recovery code<input required autoComplete="one-time-code" value={code} onChange={e=>setCode(e.target.value.trim())}/></label>
        <label>New password<input type="password" minLength={8} autoComplete="new-password" required value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label>
      </>}
      {info&&<p role="status" className="fineprint">{info}</p>}
      {error&&<p role="alert" className="form-error">{error}</p>}
      <button className="save-button" disabled={working}>{working?"Please wait…":mode==="register"?"Create account":mode==="recover"?"Request recovery code":mode==="recover-confirm"?"Reset password":"Sign in"}</button>
      <div className="form-grid account-links">
        <button type="button" onClick={()=>switchMode(mode==="register"?"login":"register")}>{mode==="register"?"Sign in instead":"Create account"}</button>
        <button type="button" onClick={()=>switchMode(mode==="recover"||mode==="recover-confirm"?"login":"recover")}>{mode==="recover"||mode==="recover-confirm"?"Back to sign in":"Forgot password?"}</button>
      </div>
    </form>}
  </div>;
}

export function SpaceBoxes(){
const [state,dispatch]=useReducer(reduce,initial);
const [selected,setSelected]=useState(1),[panel,setPanel]=useState<string|null>(null),[hydrated,setHydrated]=useState(false),[quiet,setQuiet]=useState(false),[message,setMessage]=useState(""),[celebration,setCelebration]=useState(false);
const [defaultMinutes,setDefaultMinutes]=useState(25);
const scene=useRef<HTMLDivElement>(null);
const [connected,setConnected]=useState(false);
const [remoteFeed,setRemoteFeed]=useState<PullFeed|null>(null);
const remoteSlots=useRef<(RemoteTask|null)[]>([null,null,null]);
const remoteFocus=useRef<any>(null);
const workspace=useRef<Workspace|null>(null);
const [working,setWorking]=useState(false);
const busy=useRef(false);
const [focusReady,setFocusReady]=useState(false);
const [focusState,setFocusState]=useState<any>(null);
const [focusError,setFocusError]=useState("");
const [planDay,setPlanDay]=useState(currentDay());
const [itemId,setItemId]=useState("");
const [verificationMessage,setVerificationMessage]=useState("");
const [authorityGeneration,setAuthorityGeneration]=useState(0);
const feedSequence=useRef(0);
const reservation=focusState?.reservation;
const session=focusState?.sessions.find((session:any)=>session.id===reservation?.sessionId);
const owns=!!reservation&&reservation.controllerId===remoteFocus.current?.contextId;
const activeSlot=session?remoteSlots.current.findIndex(task=>task?.id===session.taskId):-1;
useEffect(()=>{if(session&&activeSlot>=0)setSelected(activeSlot+1)},[session?.id,activeSlot]);
const activity=session?getSessionActivity(focusState,session.id):null;
const selectedSlot=state.tasks.find(task=>task.id===selected)||state.tasks[0];
const chosenItem=remoteSlots.current[selected-1]?.sessionPlan.find(item=>item.id===itemId);
const selectedTask={...selectedSlot,minutes:chosenItem?.activeMinutes||(remoteSlots.current[selected-1]?selectedSlot.minutes:defaultMinutes)};
const t:Task=session?{id:activeSlot>=0?activeSlot+1:4,title:session.startingSnapshot.title,start:session.startingSnapshot.plannedStart||"",links:safeLinks(remoteFeed?.tasks.find(task=>task.id===session.taskId)?.resources),done:false,minutes:session.targetMs/60000}:selectedTask;
const s=session?{taskId:t.id,title:t.title,duration:session.targetMs/1000,elapsed:(activity?.confirmedActiveMs||0)/1000,paused:reservation.state==="paused"}:null;
const completed=state.tasks.filter(task=>task.done).length;
const insight=focusState?getDayActivityReport(focusState,planDay):null;
const minutesLabel=(value:number)=>Number.isFinite(value)?(value/60000).toFixed(1)+"m":"—";
async function loadRemote(day=planDay){
  if(!workspace.current)return;
  const sequence=++feedSequence.current;
  const feed=await workspace.current.pull();
  if(sequence!==feedSequence.current)return;
  const remote=toRemoteView(feed,day);remoteSlots.current=remote.slots;setRemoteFeed(feed);
  dispatch({type:"hydrate",tasks:remote.tasks,history:remote.history});
}
useEffect(()=>{
  let cancelled=false;const store=new Workspace();
  (async()=>{
    await store.init();if(cancelled){store.close();return;}
    workspace.current=store;
    if(!LOCAL_ONLY){try{await accountRequest("accounts/me");const local=await store.focusStore().loadFocus();if(!local.reservation)store.remote=true;else setMessage("Signed in. End your local reserved session before loading the account workspace.");}catch(e){if((e as any)?.status!==401)setMessage("Account status unavailable. Local workspace loaded; reconnect explicitly when online.");}}
    if(cancelled)return;
    setConnected(store.remote);await loadRemote();if(!cancelled)setHydrated(true);
    try{setQuiet(localStorage.getItem("space-boxes-quiet-motion")==="true");const minutes=Number(localStorage.getItem("space-boxes-default-minutes"));if([5,15,25,45,60,90].includes(minutes))setDefaultMinutes(minutes)}catch{setMessage("Preferences could not be loaded from browser storage.")}
  })().catch(e=>{if(!cancelled)setFocusError(e instanceof Error?e.message:"Browser storage unavailable. Nothing has been saved.")});
  return()=>{cancelled=true;store.close();if(workspace.current===store)workspace.current=null;};
},[]);
useEffect(()=>{
  if(LOCAL_ONLY)return;
  function verify(){
    const url=new URL(window.location.href);
    const token=new URLSearchParams(url.hash.slice(1)).get("verify")||url.searchParams.get("verify");
    if(!token)return;
    url.searchParams.delete("verify");url.hash="";window.history.replaceState(null,"",url.pathname+url.search);
    setPanel("account");
    accountRequest("accounts/verify",{token}).then(()=>setVerificationMessage("Email verified. Please sign in.")).catch(e=>setVerificationMessage(e instanceof Error?e.message:"Verification failed."));
  }
  verify();window.addEventListener("hashchange",verify);
  return()=>window.removeEventListener("hashchange",verify);
},[]);

useEffect(()=>{
  if(!hydrated||!workspace.current)return;
  let stopped=false;
  setFocusReady(false);setFocusState(null);setFocusError("");
  const controller:any=(createBrowserFocus as any)(workspace.current.focusStore(),{
    onState:(next:any)=>{if(!stopped)setFocusState(next)},
    onError:(e:unknown)=>{if(!stopped){controller.stop();setFocusReady(false);setFocusError(e instanceof Error?e.message:"Focus changes were not confirmed. Refresh saved focus before retrying.")}},
  });
  remoteFocus.current=controller;
  controller.load().then(()=>{if(!stopped){setFocusReady(true);controller.watch()}}).catch((e:any)=>{if(!stopped)setFocusError(e.message)});
  const poll=setInterval(()=>{
    if(stopped||busy.current)return;
    // Observers only read. The accepted controller alone records evidence.
    controller.load().catch((e:any)=>{if(!stopped){controller.stop();setFocusReady(false);setFocusError(e.message)}});
    loadRemote().catch((e:any)=>{if(!stopped)setFocusError("Plan synchronization failed: "+e.message)});
  },5000);
  return()=>{stopped=true;clearInterval(poll);controller.stop();if(remoteFocus.current===controller)remoteFocus.current=null;};
},[connected,hydrated,planDay,authorityGeneration]);
useEffect(()=>{if(!celebration)return;const id=setTimeout(()=>setCelebration(false),1800);return()=>clearTimeout(id)},[celebration]);
async function act(run:()=>Promise<void>){
  if(busy.current)return;busy.current=true;setWorking(true);
  try{await run();setFocusError("");setFocusReady(true);remoteFocus.current?.watch();}
  catch(e){remoteFocus.current?.stop();setFocusReady(false);setFocusError(e instanceof Error?e.message:"The operation was not confirmed. Refresh before retrying.");throw e;}
  finally{busy.current=false;setWorking(false)}
}
async function refresh(){try{await act(async()=>{await remoteFocus.current?.load();await loadRemote()})}catch{}}
async function saveTask(task:Task){
  if(!workspace.current||!remoteFeed||busy.current)return;
  busy.current=true;setWorking(true);
  try{
    const previous=remoteSlots.current[task.id-1];
    const record={...previous,id:previous?.id||crypto.randomUUID(),planDayId:planDay,title:task.title.trim(),plannedStart:task.start,classification:"primary",sessionPlan:previous?.sessionPlan?.length?previous.sessionPlan.map((item,i)=>i===0?{...item,activeMinutes:task.minutes}:item):[{id:crypto.randomUUID(),activeMinutes:task.minutes}],resources:task.links.map(url=>({url})),cancelledAt:null,parentTaskId:previous?.parentTaskId||null};
    await workspace.current.push([{kind:"plan_day",record:{id:planDay,timezone:remoteFeed.planDays.find(day=>day.id===planDay)?.timezone||timezone()}},{kind:"task",baseRevision:previous?.recordRevision||0,record}]);
    await loadRemote();setPanel(null);setMessage(connected?"Task saved in your account.":"Task saved in this browser.");
  }catch(e){setMessage(e instanceof Error?e.message:"Save failed. Your draft is kept.")}
  finally{busy.current=false;setWorking(false)}
}
async function focusTask(task:RemoteTask,plannedItemId:string){
  if(!focusReady||!remoteFocus.current)throw new Error("Refresh saved focus before starting.");
  await act(async()=>{
    await remoteFocus.current.start({taskId:task.id,plannedItemId,expectedPlanningRevision:remoteFeed?.scopeRevision,timezone:remoteFeed?.planDays.find(day=>day.id===task.planDayId)?.timezone||timezone()});
    setPanel(null);
  });
}
async function startFocus(){
  const remote=remoteSlots.current[t.id-1];if(!remote){setPanel("edit");return;}
  try{await focusTask(remote,remote.sessionPlan.find(item=>item.id===itemId)?.id||remote.sessionPlan[0].id)}catch{}
}
async function pauseOrResume(){if(!s)return;try{await act(async()=>{if(s.paused)await remoteFocus.current.resume();else await remoteFocus.current.pause()})}catch{}}
async function endFocus(complete:boolean){
  if(!session||!workspace.current)return;
  try{await act(async()=>{
    await remoteFocus.current.end();
    if(complete){
      const feed=await workspace.current!.pull();const task=feed.tasks.find(task=>task.id===session.taskId);
      if(!task)throw new Error("Session saved, but task completion could not be confirmed.");
      await workspace.current!.push([{kind:"task",baseRevision:task.recordRevision||0,record:{...task,completedAt:Date.now()}}]);
    }
    await loadRemote();if(complete)setCelebration(true);setMessage(complete?"Session and task completion confirmed.":"Session saved.");
  })}catch{}
}
async function chooseDay(day:string){
  if(reservation){setMessage("End the reserved session before changing Plan Day.");return;}
  if(!day)return;try{await loadRemote(day);setPlanDay(day)}catch(e){setMessage(e instanceof Error?e.message:"Could not load day.")}
}
async function connectAccount(){
  const store=workspace.current;if(!store)throw new Error("Workspace unavailable.");
  if(!store.remote&&(await store.focusStore().loadFocus()).reservation)
    throw new Error("Signed in. End the local session before connecting; local data is preserved.");
  remoteFocus.current?.stop();store.remote=true;
  setHydrated(false);setFocusReady(false);setFocusState(null);setRemoteFeed(null);
  remoteSlots.current=[null,null,null];dispatch({type:"reset"});
  setConnected(true);setAuthorityGeneration(value=>value+1);
  try{await loadRemote();setHydrated(true)}
  catch(e){setFocusError(e instanceof Error?e.message:"Account synchronization failed.");throw e}
}
function signOutWorkspace(){
  remoteFocus.current?.stop();if(workspace.current)workspace.current.remote=false;
  setConnected(false);setHydrated(false);setRemoteFeed(null);remoteSlots.current=[null,null,null];setFocusState(null);dispatch({type:"reset"});
  loadRemote().then(()=>setHydrated(true)).catch(e=>setFocusError(e.message));
}
const remaining=Math.max(0,(s?.duration||t.minutes*60)-(s?.elapsed||0)),clock=Math.ceil(remaining),mm=String(Math.floor(clock/60)).padStart(2,"0"),ss=String(clock%60).padStart(2,"0");
const progress=s?Math.min(1,s.elapsed/s.duration):0;
function choose(id:number){if(s&&s.taskId!==id){setMessage("One box at a time. End the current session before opening another.");return}setSelected(id);setItemId("")}
const locked=!!s;
return <main className={"space-app "+(s?"focus-mode ":"")+(quiet?"quiet ":"")}>
<a className="skip-link" href="#focus-controls">Skip to focus controls</a>
<header className="topbar"><a href={import.meta.env.BASE_URL} className="brand" aria-label="Space Boxes home"><Icon name="box" size={27}/><span>space boxes<span className="brand-point">.</span></span></a><nav aria-label="Main navigation"><button className="nav-current" onClick={()=>setPanel(null)}>My space</button><button onClick={()=>setPanel("history")}>History</button><button onClick={()=>setPanel("insights")}>Insights</button><button onClick={()=>setPanel("planner")}>Planner</button></nav><div className="top-actions"><span className="demo-label">{connected?"Connected account":"Local workspace"}</span><button className="icon-button" aria-label="Settings" onClick={()=>setPanel("settings")}><Icon name="settings"/></button>{!LOCAL_ONLY&&<button className="account-button" aria-label="Account" onClick={()=>setPanel("account")}><Icon name="user" size={18}/></button>}</div></header>
<section className="universe">
<div className="intro"><p className="eyebrow">LESS IN YOUR HEAD. MORE IN YOUR DAY.</p><h1>{completed===3?"Space, reclaimed.":s?"Just this. Just now.":"Room to focus."}</h1><p>{completed===3?"Your three priorities are complete. Take a breath.":"Three priorities. One open box. A little more clarity."}</p></div>
<div className="scene" ref={scene} onPointerMove={e=>{if(quiet||window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;const r=e.currentTarget.getBoundingClientRect();e.currentTarget.style.setProperty("--pointer-x",((e.clientX-r.left)/r.width-.5)*12+"px");e.currentTarget.style.setProperty("--pointer-y",((e.clientY-r.top)/r.height-.5)*8+"px")}} onPointerLeave={e=>{e.currentTarget.style.setProperty("--pointer-x","0px");e.currentTarget.style.setProperty("--pointer-y","0px")}}>
<div className="orbital-plane" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/>{Array.from({length:14},(_,i)=><i key={i} className="star" style={{"--i":i,left:(12+(i*37)%78)+"%",top:(10+(i*23)%68)+"%"} as CSSProperties}/>)}</div>
<div className="character-depth"><Character/></div>
{state.tasks.map((task,i)=><button key={task.id} className={"scene-task task-"+task.id+(s?.taskId===task.id?" is-active":"")+(selected===task.id?" is-selected":"")+(task.done?" is-complete":"")+(s&&s.taskId!==task.id?" is-locked":"")} onClick={()=>choose(task.id)} aria-label={task.title+(task.done?", completed":s&&s.taskId!==task.id?", unavailable during current session":", select task")} aria-pressed={t.id===task.id}><Cube number={i+1} opened={s?.taskId===task.id} done={task.done}/><span className="floating-label">{task.done?"Complete":s?.taskId===task.id?(s.paused?"Paused":"In focus"):"Box "+task.id}</span></button>)}
{celebration&&<div className="celebration" aria-hidden="true">{Array.from({length:18},(_,i)=><i key={i} style={{"--angle":i*20+"deg","--distance":100+(i%4)*25+"px"} as CSSProperties}/>)}</div>}
<div className="scene-caption"><span className="caption-line"/>{s?"The rest can wait.":"Choose a box. Give it your attention."}<span className="caption-line"/></div>
</div>
<aside className="focus-panel" id="focus-controls" aria-label="Focus session">
<div className="task-heading"><span className="tiny-label">{t.done?"COMPLETED":s?(s.paused?"TAKE A BREATH":"YOUR FOCUS"):"YOUR NEXT FOCUS"}</span><span className="task-index">{t.id===4?"EXTRA":"0"+t.id+" / 03"}</span></div>
<h2>{t.title}</h2>{t.id===4&&<p className="fineprint">Extra task / subtask in focus</p>}
<div className="planned-time">{s?"One box open":t.done?"You made room for what matters.":"Planned for "+t.start}{!s&&!t.done&&<button className="edit-inline" aria-label="Edit selected task" onClick={()=>setPanel("edit")}><Icon name="edit" size={15}/></button>}</div>
{!s&&remoteSlots.current[t.id-1]&&<label className="session-picker">Planned session<select aria-label="Planned session" value={itemId} onChange={e=>setItemId(e.target.value)}><option value="">First planned session</option>{remoteSlots.current[t.id-1]!.sessionPlan.map((item,index)=><option key={item.id} value={item.id}>Session {index+1} · {item.activeMinutes} min</option>)}</select></label>}
<div className="timer-wrap" style={{"--progress":progress*100+"%"} as CSSProperties}><div className="timer" role="timer" aria-label={mm+" minutes "+ss+" seconds remaining"}><span>{mm}</span><b>:</b><span>{ss}</span></div><div className="timer-track"><span style={{transform:"scaleX("+progress+")"}}/></div><p className="timer-caption">{s?(remaining===0?"Your time is up. End or complete when ready.":s.paused?"Paused. Your box stays reserved.":"A small promise to your attention."):t.minutes+" minutes of undivided attention"}</p></div>
{!s?<button className="start-button" disabled={t.done||!hydrated||working||!focusReady} onClick={startFocus}><Icon name={t.done?"check":"play"} size={19}/>{t.done?"Task complete":!remoteSlots.current[t.id-1]?"Set up box":"Start focus"}<span className="button-orbit" aria-hidden="true">↗</span></button>:<><button className="pause-button" disabled={working||!owns||!focusReady} onClick={pauseOrResume}><Icon name={s.paused?"play":"pause"} size={18}/>{s.paused?"Resume focus":"Pause focus"}</button><div className="session-actions"><button className="end-button" disabled={working||!owns||!focusReady} onClick={()=>endFocus(false)}>End session</button><button className="complete-button" disabled={working||!owns||!focusReady} onClick={()=>endFocus(true)}><Icon name="check" size={15}/>Complete task</button></div></>}
{t.links.length>0&&<div className="working-links">{t.links.map((l,i)=><a href={l} key={l+i} target="_blank" rel="noopener noreferrer"><Icon name="link" size={14}/>{new URL(l).hostname}<Icon name="arrow" size={13}/></a>)}</div>}
</aside>
<div className="daily-progress"><div className="progress-markers">{state.tasks.map(t=><span className={t.done?"filled":""} key={t.id}>{t.done?<Icon name="check" size={10}/>:null}</span>)}</div><span>{completed} of 3 priorities complete</span></div>
</section>
<section className="task-dock" aria-label="Your three daily priorities"><div className="dock-heading"><span>{planDay===currentDay()?"Today's space":"Space for "+planDay}</span><small>Only what matters.</small></div><div className="task-list">{state.tasks.map(task=><button key={task.id} className={"task-row "+(t.id===task.id?"selected ":"")+(task.done?"done":"")} onClick={()=>choose(task.id)} aria-pressed={t.id===task.id}><span className="row-number">{task.done?<Icon name="check" size={17}/>:"0"+task.id}</span><span className="row-copy"><strong>{task.title}</strong><small>{task.done?"Completed":s?.taskId===task.id?(s.paused?"Paused":"Focusing now"):task.start+" · "+task.minutes+" min"}</small></span><span className="row-arrow">{s&&s.taskId!==task.id?"○":"↗"}</span></button>)}</div><button className="plan-button" disabled={locked} onClick={()=>setPanel("edit")}><Icon name="edit" size={16}/><span>Edit selected task</span></button></section>
<footer><span>Make space for what matters.</span><span>{connected?"Account workspace":(LOCAL_ONLY?"Local tasks · No automatic device sync":"Local tasks · Sign in for sync")}</span></footer>
{LOCAL_ONLY&&<p className="local-notice">Saved in this browser only. No automatic sync across devices. Clearing browser storage can erase your data. <button onClick={()=>setPanel("settings")}>Back up / restore JSON</button></p>}
<section className="sync-status" aria-label="Saved focus status"><p role="status">{!hydrated?"Loading saved workspace…":reservation?(reservation.state==="paused"?"Paused":"Running")+(owns?" · controlled here":" · reserved in another tab or device"):"No active focus reservation."}</p>
{focusError&&<p role="alert" className="form-error">{focusError}</p>}
<button type="button" className="reset-button" disabled={working||!hydrated} onClick={refresh}>Refresh saved state</button>
{reservation&&!owns&&<button type="button" className="save-button" disabled={working||!focusReady} onClick={async()=>{if(window.confirm("Take control of this reserved session here? The previous device will lose control. Unobserved time remains uncertain.")){try{await act(async()=>{await remoteFocus.current.load();await remoteFocus.current.recover({confirmed:true})})}catch{}}}}>Recover control here</button>}
</section>
<div role="status" aria-live="polite" className={"toast "+(message?"visible":"")}>{message}</div>
<Modal title="Plan your space" open={panel==="planner"} onOpenChange={o=>!o&&setPanel(null)}>
{hydrated&&workspace.current?<AdvancedPlanner defaultMinutes={defaultMinutes} day={planDay} workspace={workspace.current} onFocus={focusTask} onDayChange={chooseDay} onChanged={async()=>{await loadRemote(planDay)}} notify={setMessage}/>:<p>Loading saved plans…</p>}
</Modal>
<Modal title="Shape your next focus" open={panel==="edit"} onOpenChange={o=>!o&&setPanel(null)}><Editor key={t.id} task={t} save={saveTask}/></Modal>
<Modal title="Your focus history" open={panel==="history"} onOpenChange={o=>!o&&setPanel(null)}><FocusDetails state={focusState} controller={remoteFocus.current} disabled={working||!focusReady} onReconcile={async(input)=>{await act(async()=>{await remoteFocus.current.reconcile(input);await loadRemote()})}}/></Modal>
<Modal title="Your focus insights" open={panel==="insights"} onOpenChange={o=>!o&&setPanel(null)}>
  <p className="fineprint">Evidence-based activity for Plan Day {planDay}. Verified focus is counted from actual recorded evidence, not simply the time the timer was open.</p>
  {insight?<><div className="insight-metrics">
    <div><strong>{insight.sessionCount}</strong><span>Focus sessions</span></div>
    <div><strong>{minutesLabel(insight.activeFocusMs)}</strong><span>Confirmed active focus</span></div>
    <div><strong>{minutesLabel(insight.plannedFocusMs)}</strong><span>Planned focus</span></div>
    <div><strong>{minutesLabel(insight.pauseMs)}</strong><span>Known pauses</span></div>
    <div><strong>{insight.interruptionCount}</strong><span>Interruptions</span></div>
    <div><strong>{minutesLabel(insight.interruptionMs)}</strong><span>Interrupted time</span></div>
  </div>
  {(insight.unknownPauseIntervals>0||insight.unresolvedEvidenceCount>0||insight.uncertainMs>0)&&
    <p className="fineprint" role="status">Unresolved: {insight.unresolvedEvidenceCount} evidence intervals, {insight.unknownPauseIntervals} unknown pause intervals; {minutesLabel(insight.uncertainMs)} uncertain time. These are not counted as confirmed focus.</p>}
  {insight.uncreditedFocusMs>0&&<p className="fineprint">{minutesLabel(insight.uncreditedFocusMs)} confirmed focus exceeded planned targets.</p>}
  <p className="fineprint">Outcomes: {insight.completedSessions} completed, {insight.endedEarlySessions} ended early, {insight.unfinishedSessions} unfinished.</p>
  {insight.tasks.length>0&&<ul className="history-list">{insight.tasks.map((task:any)=>
    <li key={task.taskId}><span><strong>{task.title}</strong><small>{task.sessionCount} sessions · {minutesLabel(task.activeFocusMs)} confirmed focus / {minutesLabel(task.plannedFocusMs)} planned</small></span></li>
  )}</ul>}
  </>:connected?<p className="fineprint">Could not calculate an evidence-based report from the current data. Please refresh after synchronization.</p>:
  <div className="insight-metrics">
    <div><strong>{state.history.length}</strong><span>Local ended sessions</span></div>
    <div><strong>{state.history.filter(h=>h.completed).length}</strong><span>Locally completed</span></div>
    <div><strong>{completed}/3</strong><span>Today's completed priorities</span></div>
  </div>}
</Modal>
<Modal title="A space that suits you" open={panel==="settings"} onOpenChange={o=>!o&&setPanel(null)}><SettingsPanel onRestored={async()=>{await remoteFocus.current?.load();await loadRemote();setAuthorityGeneration(value=>value+1)}} defaultMinutes={defaultMinutes} onDefaultMinutes={value=>{try{localStorage.setItem("space-boxes-default-minutes",String(value));setDefaultMinutes(value)}catch{setMessage("Session default could not be saved.")}}} workspace={workspace.current} quiet={quiet} onQuiet={value=>{try{localStorage.setItem("space-boxes-quiet-motion",String(value));setQuiet(value)}catch{setMessage("Motion preference could not be saved.")}}}/></Modal>
{!LOCAL_ONLY&&<Modal title="Space Boxes account" open={panel==="account"} onOpenChange={o=>!o&&setPanel(null)}><ConnectedAccount verificationMessage={verificationMessage} notify={setMessage} onImportLocal={async()=>{if(!workspace.current)throw new Error("Workspace unavailable.");await workspace.current.importLocal();await loadRemote()}} onAuthenticated={connectAccount} onSignedOut={signOutWorkspace}/></Modal>}
</main>
}
