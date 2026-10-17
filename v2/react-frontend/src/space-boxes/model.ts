export type Task = {id:number; title:string; start:string; links:string[]; done:boolean; minutes:number};
export type Session = {taskId:number; title:string; startedAt:number; elapsed:number; lastTick:number; paused:boolean; duration:number};
export type Entry = {title:string; seconds:number; at:number; completed:boolean};
export type State = {tasks:Task[]; session:Session|null; history:Entry[]};
export const initial:State = {tasks:[
{id:1,title:"Make something meaningful",start:"09:00",links:[],done:false,minutes:25},
{id:2,title:"Go deeper into a good idea",start:"11:00",links:[],done:false,minutes:25},
{id:3,title:"Create room to learn",start:"15:00",links:[],done:false,minutes:25}
],session:null,history:[]};
export type Action = {type:"start";id:number;now:number}|{type:"tick";now:number}|{type:"pause";now:number}|{type:"resume";now:number}|{type:"end";now:number;complete:boolean}|{type:"edit";task:Task}|{type:"reset"}|{type:"hydrate";tasks:Task[];history?:Entry[];session?:Session|null};
export function elapsed(s:Session,now:number){return s.elapsed+(s.paused?0:Math.max(0,now-s.lastTick)/1000)}
export function reduce(state:State,a:Action):State{
 if(a.type==="reset")return structuredClone(initial);
 if(a.type==="hydrate")return {...state,tasks:a.tasks,session:a.session??null,history:a.history??[]};
 if(a.type==="edit")return {...state,tasks:state.tasks.map(t=>t.id===a.task.id?{...a.task,done:t.done}:t)};
 if(a.type==="start"){
 const t=state.tasks.find(t=>t.id===a.id);
 if(state.session||!t||t.done)return state;
 return {...state,session:{taskId:t.id,title:t.title,startedAt:a.now,elapsed:0,lastTick:a.now,paused:false,duration:t.minutes*60}};
 }
 const s=state.session;if(!s)return state;
 if(a.type==="tick")return {...state,session:{...s,elapsed:elapsed(s,a.now),lastTick:a.now}};
 if(a.type==="pause")return {...state,session:{...s,elapsed:elapsed(s,a.now),lastTick:a.now,paused:true}};
 if(a.type==="resume")return {...state,session:{...s,paused:false,lastTick:a.now}};
 if(a.type==="end")return {...state,session:null,tasks:state.tasks.map(t=>t.id===s.taskId&&a.complete?{...t,done:true}:t),history:[{title:s.title,seconds:Math.floor(elapsed(s,a.now)),at:a.now,completed:a.complete},...state.history]};
 return state;
}
