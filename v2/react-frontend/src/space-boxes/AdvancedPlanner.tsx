import {useEffect,useState,type FormEvent} from "react";
import {refreshFeed,timezone,type PullFeed,type RemoteTask} from "./connected/live";
import * as api from "./connected/api.js";

type FocusItem = {id:string;activeMinutes:number};
type PlannedBreak = {id:string;breakMinutes:number|null;afterFocusItemId?:string|null;beforeFocusItemId?:string|null};
type Draft = {
  title:string; plannedStart:string; targetDay:string; classification:"primary"|"extra";
  parentTaskId:string|null; note:string; resources:string;
  sessionPlan:FocusItem[]; breaks:string[];
};
type Props={day:string;onDayChange:(day:string)=>Promise<void>;onChanged:()=>Promise<void>;notify:(message:string)=>void};
const defaultDay=()=>new Date().toLocaleDateString("en-CA");

function resourceRows(text:string){
  return text.split("\n").map(s=>s.trim()).filter(Boolean).map(line=>{
    const split=line.indexOf(" | ");
    const label=split>=0?line.slice(0,split).trim():"";
    const url=split>=0?line.slice(split+3).trim():line;
    const parsed=new URL(url);
    if(!["http:","https:"].includes(parsed.protocol))throw new Error("Working links must use http:// or https://.");
    return {url,label};
  });
}
function buildDraft(task:RemoteTask|null,day:string):Draft{
  const sessionPlan=task?.sessionPlan?.length?task.sessionPlan.map(x=>({...x})):[{id:crypto.randomUUID(),activeMinutes:25}];
  const breaks: string[]=sessionPlan.slice(0,-1).map((item,i)=>{
    const next=sessionPlan[i+1];
    const existing=(task?.plannedBreaks||[] as PlannedBreak[]).find((b:any)=>b.afterFocusItemId===item.id&&b.beforeFocusItemId===next.id) as PlannedBreak|undefined;
    return existing?.breakMinutes!=null?String(existing.breakMinutes):"";
  });
  return {
    title:task?.title||"",plannedStart:task?.plannedStart||"09:00",targetDay:task?.planDayId||day,
    classification:task?.classification||"primary",parentTaskId:task?.parentTaskId||null,
    note:task?.note||"",resources:(task?.resources||[]).map(r=>r.label?r.label+" | "+r.url:r.url).join("\n"),
    sessionPlan,breaks,
  };
}
function writeRecord(previous:RemoteTask|null,draft:Draft){
  if(!draft.title.trim())throw new Error("Enter a task title.");
  if(!draft.targetDay||!/^\d{4}-\d\d-\d\d$/.test(draft.targetDay))throw new Error("Choose a valid Plan Day.");
  if(!draft.plannedStart.trim())throw new Error("Choose a planned start time.");
  if(!draft.sessionPlan.length||draft.sessionPlan.some(s=>!Number.isFinite(s.activeMinutes)||s.activeMinutes<=0))
    throw new Error("Every focus session must have a positive duration.");
  const ids=new Set(draft.sessionPlan.map(s=>s.id));
  if(ids.size!==draft.sessionPlan.length)throw new Error("Session identities must be unique.");
  const resources=resourceRows(draft.resources);
  const oldBreaks=(previous?.plannedBreaks||[]) as PlannedBreak[];
  const plannedBreaks:PlannedBreak[]=[];
  for(let i=0;i<draft.sessionPlan.length-1;i++){
    const minutes=draft.breaks[i]?.trim();
    if(!minutes)continue;
    const count=Number(minutes);
    if(!Number.isFinite(count)||count<=0)throw new Error("Break minutes must be positive.");
    const after=draft.sessionPlan[i].id,before=draft.sessionPlan[i+1].id;
    const matched=oldBreaks.find(b=>b.afterFocusItemId===after&&b.beforeFocusItemId===before);
    plannedBreaks.push({id:matched?.id||crypto.randomUUID(),breakMinutes:count,
      afterFocusItemId:after,beforeFocusItemId:before});
  }
  const retiredFocusItems=[
    ...(previous?.retiredFocusItems||[]) as FocusItem[],
    ...(previous?.sessionPlan||[]).filter(s=>!ids.has(s.id)),
  ];
  const activeBreakIds=new Set(plannedBreaks.map(b=>b.id));
  const retiredPlannedBreaks=[
    ...(previous?.retiredPlannedBreaks||[]) as PlannedBreak[],
    ...oldBreaks.filter(b=>!activeBreakIds.has(b.id)),
  ];
  return {...previous,
    id:previous?.id||crypto.randomUUID(),
    title:draft.title.trim(),plannedStart:draft.plannedStart,targetDay:undefined,
    planDayId:draft.targetDay,classification:draft.classification,
    parentTaskId:draft.parentTaskId,note:draft.note.trim()||null,resources,
    sessionPlan:draft.sessionPlan,
    plannedBreaks,retiredFocusItems,retiredPlannedBreaks,
    completedAt:previous?.completedAt||null,cancelledAt:previous?.cancelledAt||null,
  };
}
function errorMessage(error:unknown){return error instanceof Error?error.message:"The operation could not be completed.";}
export function AdvancedPlanner({day,onDayChange,onChanged,notify}:Props){
  const [feed,setFeed]=useState<PullFeed|null>(null);
  const [editing,setEditing]=useState<RemoteTask|null|undefined>(undefined);
  const [draft,setDraft]=useState<Draft>(()=>buildDraft(null,day));
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [dayInput,setDayInput]=useState(day);
  useEffect(()=>{setDayInput(day)},[day]);
  useEffect(()=>{
    let live=true;setLoading(true);setError("");
    refreshFeed().then(data=>{if(live)setFeed(data)}).catch(e=>{if(live)setError(errorMessage(e))}).finally(()=>{if(live)setLoading(false)});
    return()=>{live=false};
  },[day]);
  const tasks=(feed?.tasks||[]).filter(t=>t.planDayId===day&&!t.cancelledAt)
    .sort((a,b)=>a.plannedStart.localeCompare(b.plannedStart)||a.title.localeCompare(b.title));
  const primaryCount=tasks.filter(t=>t.classification==="primary").length;
  function open(task:RemoteTask|null,parentTaskId:string|null=null){
    setEditing(task);
    const next=buildDraft(task,day);
    if(!task&&parentTaskId)next.parentTaskId=parentTaskId;
    if(!task&&parentTaskId)next.classification="extra";
    if(!task&&primaryCount>=3)next.classification="extra";
    setDraft(next);setError("");
  }
  function modify(patch:Partial<Draft>){setDraft(d=>({...d,...patch}))}
  function alterSession(index:number,patch:Partial<FocusItem>){
    modify({sessionPlan:draft.sessionPlan.map((item,i)=>i===index?{...item,...patch}:item)});
  }
  function moveSession(index:number,offset:number){
    const target=index+offset;
    if(target<0||target>=draft.sessionPlan.length)return;
    const copy=[...draft.sessionPlan];[copy[index],copy[target]]=[copy[target],copy[index]];
    modify({sessionPlan:copy,breaks:copy.slice(0,-1).map(()=>"")});
  }
  async function persist(ops:Record<string,unknown>[]){
    const response=await api.syncPush(ops) as {results:{status:string;message?:string;code?:string}[]};
    if(!response.results||response.results.length!==ops.length)throw new Error("The server did not acknowledge every change.");
    const bad=response.results.find(r=>!["accepted","duplicate"].includes(r.status));
    if(bad)throw new Error(bad.message||"The server rejected this change ("+bad.status+"). Refresh to resolve conflicts.");
    const updated=await refreshFeed();setFeed(updated);await onChanged();
  }
  async function save(event:FormEvent){
    event.preventDefault();if(loading)return;setLoading(true);setError("");
    try{
      const record=writeRecord(editing||null,draft);
      const known=(feed?.tasks||[]).filter(t=>t.planDayId===draft.targetDay&&!t.cancelledAt&&t.id!==record.id);
      if(record.classification==="primary"&&known.filter(t=>t.classification==="primary").length>=3)
        throw new Error("Only three primary priorities may be planned for a day. Use Extra instead.");
      const ops:Record<string,unknown>[]=[];
      if(!(feed?.planDays||[]).some(p=>p.id===draft.targetDay))ops.push({kind:"plan_day",record:{id:draft.targetDay,timezone:timezone()}});
      ops.push({kind:"task",baseRevision:editing?.recordRevision??0,record});
      await persist(ops);
      setEditing(undefined);
      notify("Plan saved in your account.");
    }catch(e){setError(errorMessage(e))}
    finally{setLoading(false)}
  }
  async function decide(task:RemoteTask,type:"complete"|"cancel"){
    if(loading)return;setLoading(true);setError("");
    try{
      const field=type==="complete"?"completedAt":"cancelledAt";
      const record={...task,[field]:Date.now()};
      await persist([{kind:"task",baseRevision:task.recordRevision??0,record}]);
      setEditing(undefined);
      notify(type==="complete"?"Task completion confirmed.":"Task cancelled.");
    }catch(e){setError(errorMessage(e))}
    finally{setLoading(false)}
  }
  return <div className="advanced-planner">
    <div className="advanced-head">
      <p className="fineprint">Plan Day • tasks, multiple focus sessions, breaks and links.</p>
      <label>Plan Day
        <input type="date" value={dayInput} onChange={e=>setDayInput(e.target.value)} disabled={loading}/>
      </label>
      <button type="button" className="reset-button" disabled={loading||!dayInput||dayInput===day} onClick={()=>onDayChange(dayInput)}>Show day</button>
    </div>
    {error&&<p className="form-error" role="alert">{error}</p>}
    {loading&&<p role="status" className="fineprint">Synchronizing with your account…</p>}
    {editing===undefined?<div className="advanced-list">
      <div className="dock-heading"><span>Day's priorities</span><small>{primaryCount} of 3 primary</small></div>
      {tasks.length===0?<div className="empty-state"><p>No tasks planned for this day.</p></div>:tasks.map(task=>
        <div className="advanced-task" key={task.id}>
          <div><strong>{task.title}</strong><small>{task.plannedStart} · {task.classification} · {task.sessionPlan.length} sessions · {task.sessionPlan.reduce((sum,x)=>sum+x.activeMinutes,0)} planned min{task.completedAt?" · Completed":""}</small></div>
          <div className="advanced-task-actions"><button type="button" onClick={()=>open(task)}>Edit</button><button type="button" onClick={()=>open(null,task.id)}>Subtask</button></div>
        </div>
      )}
      <div className="advanced-buttons">
        <button type="button" className="save-button" onClick={()=>open(null)}>{primaryCount>=3?"Add extra task":"Add a task"}</button>
      </div>
    </div>:<form className="editor advanced-editor" onSubmit={save}>
      <div className="row-top"><strong>{editing?"Edit task":"New task"}</strong><button type="button" className="reset-button" onClick={()=>setEditing(undefined)}>Back to plan</button></div>
      <label>Task title<input required autoFocus maxLength={120} value={draft.title} onChange={e=>modify({title:e.target.value})}/></label>
      <div className="form-grid">
        <label>Planned start<input required type="time" value={draft.plannedStart} onChange={e=>modify({plannedStart:e.target.value})}/></label>
        <label>Type<select value={draft.classification} onChange={e=>modify({classification:e.target.value as "primary"|"extra"})}><option value="primary">Primary priority</option><option value="extra">Extra task</option></select></label>
      </div>
      <div className="form-grid">
        <label>Plan Day<input required type="date" value={draft.targetDay} onChange={e=>modify({targetDay:e.target.value})}/></label>
        <label>Parent task<select value={draft.parentTaskId||""} onChange={e=>modify({parentTaskId:e.target.value||null})}><option value="">None</option>{(feed?.tasks||[]).filter(t=>!t.cancelledAt&&t.id!==editing?.id&&t.planDayId===draft.targetDay).map(t=><option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
      </div>
      <label>Notes<textarea rows={2} value={draft.note} onChange={e=>modify({note:e.target.value})}/></label>
      <div className="dock-heading"><span>Ordered focus sessions</span><small>{draft.sessionPlan.reduce((sum,item)=>sum+(Number(item.activeMinutes)||0),0)} minutes planned</small></div>
      {draft.sessionPlan.map((item,i)=><div className="advanced-session" key={item.id}>
        <div className="session-main"><span>Session {i+1}</span><label>Minutes<input type="number" min="1" step="0.5" required value={item.activeMinutes} onChange={e=>alterSession(i,{activeMinutes:Number(e.target.value)})}/></label>
          <button type="button" disabled={i===0} onClick={()=>moveSession(i,-1)} title="Move up">↑</button><button type="button" disabled={i===draft.sessionPlan.length-1} onClick={()=>moveSession(i,1)} title="Move down">↓</button>
          <button type="button" disabled={draft.sessionPlan.length===1} onClick={()=>modify({sessionPlan:draft.sessionPlan.filter((_,j)=>j!==i),breaks:[]})}>Remove</button>
        </div>
        {i<draft.sessionPlan.length-1&&<label>Break after session (minutes, optional)<input type="number" min="0" step="0.5" value={draft.breaks[i]||""} onChange={e=>modify({breaks:draft.breaks.map((v,j)=>j===i?e.target.value:v)})}/></label>}
      </div>)}
      <button type="button" className="reset-button" onClick={()=>modify({sessionPlan:[...draft.sessionPlan,{id:crypto.randomUUID(),activeMinutes:25}],breaks:[...draft.breaks,""]})}>+ Focus session</button>
      <label>Working links <small>One per line: https://... or Label | https://...</small><textarea rows={3} value={draft.resources} onChange={e=>modify({resources:e.target.value})}/></label>
      <button type="submit" className="save-button" disabled={loading}>Save task</button>
      {editing&&<div className="advanced-buttons">
        {!editing.completedAt&&<button type="button" className="reset-button" disabled={loading} onClick={()=>decide(editing,"complete")}>Mark complete</button>}
        {!editing.cancelledAt&&<button type="button" className="reset-button" disabled={loading} onClick={()=>decide(editing,"cancel")}>Cancel task</button>}
      </div>}
    </form>}
  </div>;
}

