import {useEffect,useState,type FormEvent} from "react";
import * as api from "./connected/api.js";
import type {Workspace} from "./workspace";
import {LocalBackup} from "./LocalBackup";
export function SettingsPanel({defaultMinutes,onDefaultMinutes,workspace,quiet,onQuiet,onRestored}:{defaultMinutes:number;onDefaultMinutes:(value:number)=>void;workspace:Workspace|null;quiet:boolean;onQuiet:(quiet:boolean)=>void;onRestored:()=>Promise<void>}){
  const [cadence,setCadence]=useState("");const [email,setEmail]=useState(false);
  const [domains,setDomains]=useState("");const [enabled,setEnabled]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [working,setWorking]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
  useEffect(()=>{
    if(!workspace?.remote)return;
    setWorking(true);api.syncPull(0).then((feed:any)=>{setCadence(feed.prefs?.cadence||"");setEmail(feed.prefs?.channels?.includes("email")||false);setDomains((feed.config?.domains||[]).join("\n"));setEnabled(feed.config?.enabled||false);setLoaded(true)}).catch((e:any)=>setError(e.message)).finally(()=>setWorking(false));
  },[workspace]);
  async function save(event:FormEvent){
    event.preventDefault();if(!workspace||working)return;setWorking(true);setError("");setMessage("");
    try{
      const list=domains.split("\n").map(d=>d.trim().toLowerCase()).filter(Boolean);
      if(list.some(d=>!/^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(d)))throw new Error("Enter domain names such as example.com, one per line.");
      await workspace.push([{kind:"prefs",record:{cadence:cadence||null,channels:email?["email"]:[]}},{kind:"config",record:{enabled,domains:list,noticeAcknowledgedAt:enabled?Date.now():null}}]);
      setMessage("Preferences confirmed in your account.");
    }catch(e){setError(e instanceof Error?e.message:"Preferences were not saved.")}
    finally{setWorking(false)}
  }
  return <div><label className="setting-row">New focus session length<select value={defaultMinutes} onChange={e=>onDefaultMinutes(Number(e.target.value))}>{[5,15,25,45,60,90].map(value=><option key={value} value={value}>{value} minutes</option>)}</select></label><div className="setting-row"><span><strong>Quiet motion</strong><small>Keep the scene still. System reduced-motion is always respected.</small></span><input aria-label="Quiet motion" type="checkbox" checked={quiet} onChange={e=>onQuiet(e.target.checked)}/></div>
    <p className="fineprint">Local plans and evidence persist in this browser. Export important data before clearing browser storage.</p>
    {!workspace?.remote&&<LocalBackup workspace={workspace} onRestored={onRestored}/>}
    {workspace?.remote&&<form className="editor" onSubmit={save}>
      <label>Report cadence<select aria-label="Report cadence" value={cadence} disabled={working||!loaded} onChange={e=>setCadence(e.target.value)}><option value="">Off</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
      <label><input type="checkbox" checked={email} disabled={working||!loaded} onChange={e=>setEmail(e.target.checked)}/> Email report preference</label>
      <p className="fineprint">Delivery depends on availability for this workspace. Saving a preference does not confirm an email was delivered.</p>
      <label>Suggested distracting domains<textarea value={domains} disabled={working||!loaded} onChange={e=>setDomains(e.target.value)} placeholder="example.com"/></label>
      <label><input type="checkbox" checked={enabled} disabled={working||!loaded} onChange={e=>setEnabled(e.target.checked)}/> Save blocking preference for the optional extension</label>
      <p className="fineprint">The optional browser extension applies these preferences. This page does not block other websites.</p>
      <button className="save-button" disabled={working||!loaded}>Save account preferences</button>
    </form>}
    {error&&<p role="alert" className="form-error">{error}</p>}{message&&<p role="status">{message}</p>}
  </div>;
}
