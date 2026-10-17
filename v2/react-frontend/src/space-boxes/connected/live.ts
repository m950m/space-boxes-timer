import type {Task,Session,Entry} from "../model";
import * as api from "./api.js";
import {getSessionActivity} from "./focus/activity-evidence.js";
export type RemoteTask = {
  id:string; planDayId:string; title:string; plannedStart:string;
  classification:"primary"|"extra"; sessionPlan:{id:string;activeMinutes:number}[];
  resources?:{url:string;label?:string}[];
  recordRevision?:number; revision?:number; completedAt?:number|null;
  cancelledAt?:number|null; parentTaskId?:string|null;
  note?:string|null; plannedBreaks?:unknown[]; retiredFocusItems?:unknown[];
  retiredPlannedBreaks?:unknown[];
};
export type PullFeed = {tasks:RemoteTask[];planDays:{id:string;timezone:string}[];sessions:Record<string,unknown>[];evidence:Record<string,unknown>[];decisions:Record<string,unknown>[];ownershipScopeId:string;scopeRevision:number};
export type RemoteView = {slots:(RemoteTask|null)[];tasks:Task[];history:Entry[]};
export const currentDay = () => {
  const now = new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
};
export const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const placeholders=["Your first priority","Your second priority","Your third priority"];
export function toRemoteView(feed:PullFeed,day=currentDay()):RemoteView {
  const slots:(RemoteTask|null)[] = feed.tasks
    .filter(t=>t.planDayId===day&&t.classification==="primary"&&!t.parentTaskId&&!t.cancelledAt)
    .sort((a,b)=>a.plannedStart.localeCompare(b.plannedStart)||a.id.localeCompare(b.id)).slice(0,3);
  while(slots.length<3)slots.push(null);
  const tasks:Task[] = slots.map((t,i)=>({
    id:i+1,title:t?.title||placeholders[i],start:t?.plannedStart||["09:00","12:00","15:00"][i],
    links:(t?.resources||[]).map(x=>x.url),done:!!t?.completedAt,
    minutes:t?.sessionPlan?.[0]?.activeMinutes||25,
  }));
  const state={sessions:feed.sessions||[],evidence:feed.evidence||[],reconciliations:feed.decisions||[]};
  const history:Entry[]=(feed.sessions||[]).filter(s=>s.ending&&s.actualStart)
    .map(s=>{
      const ending=s.ending as Record<string,unknown>;
      const at=Number(ending.recordedAt||s.actualStart);
      const match=feed.tasks.find(t=>t.id===s.taskId);
      let confirmedSeconds=0;
      try{confirmedSeconds=Math.floor(getSessionActivity(state,s.id).confirmedActiveMs/1000);}catch{}
      return {title:match?.title||"Focus session",seconds:confirmedSeconds,
        at,completed:ending.outcome==="completed"};
    }).sort((a,b)=>b.at-a.at);
  return {slots,tasks,history};
}
export async function refreshFeed():Promise<PullFeed>{
  return (await api.syncPull(0)) as PullFeed;
}
export async function saveRemoteTask(day:string, previous:RemoteTask|null, task:Task, feed:PullFeed):Promise<RemoteTask>{
  if (!task.title.trim()||task.title.startsWith("Your ")&&task.title.endsWith(" priority")&&!previous)
    throw new Error("Please enter a task title before saving.");
  const record:RemoteTask={
    ...(previous||{}),
    id:previous?.id||crypto.randomUUID(),
    planDayId:day,
    title:task.title.trim(),
    plannedStart:task.start,
    classification:"primary",
    sessionPlan:previous?.sessionPlan?.length
      ?previous.sessionPlan.map((item,i)=>i===0?{...item,activeMinutes:task.minutes}:item)
      :[{id:crypto.randomUUID(),activeMinutes:task.minutes}],
    resources:task.links.map(url=>({url})),
    completedAt:previous?.completedAt||null,
    cancelledAt:null,
    parentTaskId:previous?.parentTaskId||null,
  };
  const ops:Record<string,unknown>[]=[];
  if(!feed.planDays?.some(x=>x.id===day))ops.push({kind:"plan_day",record:{id:day,timezone:timezone()}});
  ops.push({kind:"task",baseRevision:previous?.recordRevision||0,record});
  const response=await api.syncPush(ops) as {results:{status:string;message?:string;record?:RemoteTask}[]};
  if(!response.results?.length||response.results.some(r=>!["accepted","duplicate"].includes(r.status)))
    throw new Error("Task not saved: conflict or rejection from the server. Refresh and retry.");
  return record;
}
export async function completeRemoteTask(previous:RemoteTask):Promise<void>{
  const result=await api.syncPush([{kind:"task",baseRevision:previous.recordRevision||0,
    record:{...previous,completedAt:Date.now()}}]) as {results:{status:string}[]};
  if(!result.results?.length||!(["accepted","duplicate"].includes(result.results[0].status)))
    throw new Error("Focus session saved, but completion is not confirmed. Refresh before retrying.");
}
