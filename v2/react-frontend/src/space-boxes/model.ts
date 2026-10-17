// View-only slots. Planning and focus rules live in the existing domain stores.
export type Task = {id:number;title:string;start:string;links:string[];done:boolean;minutes:number};
export type Entry = {title:string;seconds:number;at:number;completed:boolean};
export type State = {tasks:Task[];history:Entry[]};
export const initial:State = {tasks:[1,2,3].map((id)=>({id,title:["Your first priority","Your second priority","Your third priority"][id-1],start:["09:00","12:00","15:00"][id-1],links:[],done:false,minutes:25})),history:[]};
type Action = {type:"reset"}|{type:"hydrate";tasks:Task[];history?:Entry[]};
export function reduce(state:State,action:Action):State{
  return action.type==="reset"?structuredClone(initial):{tasks:action.tasks,history:action.history||[]};
}
