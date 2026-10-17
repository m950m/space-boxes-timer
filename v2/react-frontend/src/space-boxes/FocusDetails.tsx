import {useState,type FormEvent} from "react";
import {getSessionActivity,validateReconciliation} from "./connected/focus/activity-evidence.js";

const duration=(ms:number)=>(ms/1000).toFixed(1)+"s";
export function FocusDetails({state,controller,disabled,onReconcile}:{state:any;controller:any;disabled:boolean;onReconcile:(input:any)=>Promise<void>}){
  if(!state)return <p role="status">Loading saved focus…</p>;
  const unresolved=state.evidence.filter((e:any)=>e.endAt!==null&&(e.kind==="uncertain"||(e.kind==="pause"&&e.elapsedMs===null))&&!state.reconciliations.some((r:any)=>r.evidenceId===e.id));
  return <div className="focus-details">
    <p className="fineprint">Only recorded, confirmed evidence counts as focus. Sleep, clock changes and disconnected intervals remain uncertain until you decide.</p>
    {unresolved.map((e:any)=><Reconcile key={e.id} evidence={e} contextId={controller?.contextId} disabled={disabled||(state.reservation?.sessionId===e.sessionId&&state.reservation?.controllerId!==controller?.contextId)} submit={onReconcile}/>)}
    <ul className="history-list">{[...state.sessions].reverse().map((session:any)=>{
      const activity=getSessionActivity(state,session.id);
      return <li key={session.id}><span><strong>{session.startingSnapshot.title}</strong>
        <small>{session.startingSnapshot.planDayId} · {session.startingSnapshot.timezone} · {new Date(session.actualStart).toLocaleString()}</small>
        <small>{activity.effectiveOutcome||"Unfinished"} · {duration(activity.confirmedActiveMs)} confirmed / {duration(session.targetMs)} planned</small>
        <small>{duration(activity.pauseMs)} pause · {activity.interruptionCount} interruptions ({duration(activity.interruptionMs)}) · {duration(activity.uncertainMs)} uncertain</small>
        {(activity.unknownPauseIntervals>0||activity.unknownUncertainIntervals>0)&&<small>Unknown duration: {activity.unknownPauseIntervals} pause / {activity.unknownUncertainIntervals} focus intervals</small>}
      </span></li>;
    })}</ul>
  </div>;
}
function Reconcile({evidence:e,contextId,disabled,submit}:{evidence:any;contextId:string;disabled:boolean;submit:(input:any)=>Promise<void>}){
  const [total,setTotal]=useState(e.elapsedMs===null?"":String(e.elapsedMs/1000));
  const [parts,setParts]=useState<{kind:string;seconds:string;episodeId:string}[]>([{kind:e.kind==="pause"?"pause":"focus",seconds:e.elapsedMs===null?"":String(e.elapsedMs/1000),episodeId:crypto.randomUUID()}]);
  const [error,setError]=useState("");
  async function save(event:FormEvent){
    event.preventDefault();setError("");
    const input={evidenceId:e.id,elapsedMs:e.elapsedMs??Number(total)*1000,parts:parts.map(p=>({kind:p.kind,elapsedMs:Number(p.seconds)*1000,...(p.kind==="interruption"?{episodeId:p.episodeId}:{})}))};
    try{
      validateReconciliation(e,{...input,id:crypto.randomUUID(),originContextId:contextId,decidedAt:Date.now()});
      await submit(input);
    }catch(err){setError(err instanceof Error?err.message:"Decision was not accepted.")}
  }
  return <form className="editor reconcile-form" onSubmit={save}><fieldset disabled={disabled}>
    <legend>{e.kind==="pause"?"Unknown pause duration":"Uncertain interval"}</legend>
    <p className="fineprint">{new Date(e.startAt).toLocaleString()} → {new Date(e.endAt).toLocaleString()}. Leave unresolved if you cannot confirm. Explicit pause never becomes focus.</p>
    <label>Interval duration in seconds<input type="number" min="0" step="0.001" required readOnly={e.elapsedMs!==null} value={total} onChange={event=>setTotal(event.target.value)}/></label>
    {parts.map((p,i)=><div className="reconcile-part" key={i}>
      <label>Part {i+1}<select value={p.kind} onChange={event=>setParts(parts.map((part,j)=>j===i?{...part,kind:event.target.value}:part))}>{e.kind==="pause"?<option value="pause">Explicit pause</option>:<><option value="focus">Confirmed work</option><option value="interruption">Interruption</option></>}</select></label>
      <label>Seconds for part {i+1}<input required type="number" min="0" step="any" value={p.seconds} onChange={event=>setParts(parts.map((part,j)=>j===i?{...part,seconds:event.target.value}:part))}/></label>
      {p.kind==="interruption"&&<label>Interruption group<input required value={p.episodeId} onChange={event=>setParts(parts.map((part,j)=>j===i?{...part,episodeId:event.target.value}:part))}/></label>}
      {parts.length>1&&<button type="button" onClick={()=>setParts(parts.filter((_,j)=>j!==i))}>Remove part {i+1}</button>}
    </div>)}
    {e.kind!=="pause"&&<button type="button" onClick={()=>setParts([...parts,{kind:"interruption",seconds:"",episodeId:crypto.randomUUID()}])}>Add interval part</button>}
    {error&&<p role="alert" className="form-error">{error}</p>}
    <button className="save-button" type="submit">Confirm evidence decision</button>
  </fieldset></form>;
}
