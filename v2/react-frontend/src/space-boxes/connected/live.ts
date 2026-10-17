import type {Task,Entry} from "../model";
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
export type PullFeed = {tasks:RemoteTask[];planDays:{id:string;timezone:string}[];sessions:Record<string,any>[];evidence:Record<string,any>[];decisions:Record<string,any>[];ownershipScopeId:string;scopeRevision:number};
export type RemoteView = {slots:(RemoteTask|null)[];tasks:Task[];history:Entry[]};
export const currentDay = () => {
  const now = new Date();
  return [now.getFullYear(),String(now.getMonth()+1).padStart(2,"0"),String(now.getDate()).padStart(2,"0")].join("-");
};
export const timezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
// Legacy/imported resource text is untrusted. Only HTTP links may be opened.
export function safeLinks(resources:{url:string}[]=[]):string[]{
  return resources.map(row=>row.url).filter(url=>{try{return ["http:","https:"].includes(new URL(url).protocol)}catch{return false}});
}
const placeholders=["Your first priority","Your second priority","Your third priority"];
export function toRemoteView(feed:PullFeed,day=currentDay()):RemoteView {
  const slots:(RemoteTask|null)[] = feed.tasks
    .filter(t=>t.planDayId===day&&t.classification==="primary"&&!t.cancelledAt)
    .sort((a,b)=>a.plannedStart.localeCompare(b.plannedStart)||a.id.localeCompare(b.id)).slice(0,3);
  while(slots.length<3)slots.push(null);
  const tasks:Task[] = slots.map((t,i)=>({
    id:i+1,title:t?.title||placeholders[i],start:t?.plannedStart||["09:00","12:00","15:00"][i],
    links:safeLinks(t?.resources),done:!!t?.completedAt,
    minutes:t?.sessionPlan?.[0]?.activeMinutes||25,
  }));
  const state={sessions:feed.sessions||[],evidence:feed.evidence||[],reconciliations:feed.decisions||[]};
  const history:Entry[]=(feed.sessions||[]).filter(s=>s.ending&&s.actualStart)
    .map(s=>{
      const ending=s.ending as Record<string,unknown>;
      const at=Number(ending.recordedAt||s.actualStart);
      let confirmedSeconds=0;
      try{confirmedSeconds=Math.floor(getSessionActivity(state,s.id).confirmedActiveMs/1000);}catch{}
      return {title:s.startingSnapshot?.title||"Focus session",seconds:confirmedSeconds,
        at,completed:ending.outcome==="completed"};
    }).sort((a,b)=>b.at-a.at);
  return {slots,tasks,history};
}
export async function refreshFeed():Promise<PullFeed>{
  return (await api.syncPull(0)) as PullFeed;
}
