import {openPlanningStore} from "../../../frontend/js/persistence/planning-store.js";
import {Connection} from "../../../frontend/js/connected/connection.js";
import {wireTaskRecord} from "../../../frontend/js/connected/payload.js";
import {createServerFocusStore} from "./connected/server-focus-store.js";
import * as api from "./connected/api.js";
import {timezone,type PullFeed,type RemoteTask} from "./connected/live";
import {LOCAL_ONLY} from "./release";

// Local planning and focus use the existing serialized IndexedDB domain store.
// Connected writes remain server commands with explicit revision acknowledgements.
export class Workspace {
  private local:any;
  remote=false;
  async init(){this.local=await openPlanningStore();}
  async exportBackup(){return this.local.exportBackup();}
  async restoreBackup(backup:unknown){
    if(this.remote)throw new Error("Switch to the local workspace before restoring a backup.");
    return this.local.restoreBackup(backup);
  }
  close(){this.local?.close();}
  focusStore(){return this.remote&&!LOCAL_ONLY?createServerFocusStore():this.local;}
  async pull():Promise<PullFeed>{
    if(this.remote&&!LOCAL_ONLY)return await api.syncPull(0) as PullFeed;
    const plan=await this.local.load();
    const focus=await this.local.loadFocus();
    const tasks=plan.tasks.map((task:any)=>({...wireTaskRecord(task),recordRevision:plan.revision}));
    const days=new Map<string,{id:string;timezone:string}>();
    for(const task of plan.tasks)days.set(task.planDayId,{id:task.planDayId,timezone:task.planDay?.timezone||timezone()});
    return {tasks,planDays:[...days.values()],...focus,scopeRevision:plan.revision,
      decisions:focus.reconciliations} as PullFeed;
  }
  async push(ops:Record<string,any>[]){
    if(this.remote&&!LOCAL_ONLY){
      const response=await api.syncPush(ops) as {results:{status:string;message?:string}[]};
      if(response.results?.length!==ops.length||response.results.some(r=>!["accepted","duplicate"].includes(r.status)))
        throw new Error(response.results?.find(r=>!["accepted","duplicate"].includes(r.status))?.message||"Change was not accepted. Refresh to resolve the conflict; your draft is preserved.");
      return;
    }
    const plan=await this.local.load();
    const commands:any[]=[];
    const dayOps=ops.filter(op=>op.kind==="plan_day");
    for(const op of ops){
      if(op.kind==="plan_day")continue;
      if(op.kind!=="task")throw new Error("Unsupported local operation.");
      const task=op.record as RemoteTask;
      const previous=plan.tasks.find((t:any)=>t.id===task.id);
      const dayTimezone=dayOps.find(d=>d.record.id===task.planDayId)?.record.timezone||plan.tasks.find((t:any)=>t.planDayId===task.planDayId)?.planDay?.timezone||timezone();
      if(previous&&op.baseRevision!==plan.revision)throw new Error("Stale local plan. Refresh before saving; your draft is preserved.");
      if(!previous){
        commands.push({type:"create",task:{...task,ownershipScopeId:plan.ownershipScopeId,
          planDay:{timezone:dayTimezone}}});
        continue;
      }
      if(previous.planDayId!==task.planDayId||previous.plannedStart!==task.plannedStart)
        commands.push({type:"reschedule",taskId:task.id,planDayId:task.planDayId,plannedStart:task.plannedStart,planDay:{timezone:dayTimezone}});
      if(previous.classification!==task.classification)commands.push({type:"classify",taskId:task.id,classification:task.classification});
      if(previous.parentTaskId!==task.parentTaskId)commands.push({type:"parent",taskId:task.id,parentTaskId:task.parentTaskId});
      commands.push({type:"edit",taskId:task.id,changes:Object.fromEntries(
        ["title","plannedStart","sessionPlan","plannedBreaks","note","resources"].filter(k=>k in task).map(k=>[k,(task as any)[k]]))});
      if(task.completedAt&&!previous.completedAt)commands.push({type:"complete",taskId:task.id,decidedAt:task.completedAt});
      if(task.cancelledAt&&!previous.cancelledAt)commands.push({type:"cancel",taskId:task.id,decidedAt:task.cancelledAt});
    }
    if(commands.length)await this.local.commit(plan.ownershipScopeId,plan.revision,commands);
  }
  async importLocal(){
    if(LOCAL_ONLY)throw new Error("Accounts are unavailable in this local release.");
    if(!this.remote)throw new Error("Sign in before importing.");
    let failure="";
    const connection=new Connection({api,onStatus:(state?:string,detail?:string)=>{if(state==="sync-error")failure=detail||"Synchronization failed.";}});
    const account=await api.fetchMe();connection.account=account.account;
    const snapshot=await this.local.load(),focusState=await this.local.loadFocus();
    if(focusState.reservation)throw new Error("End the local reserved session before importing. Local data is preserved.");
    await connection.loadAck(snapshot.ownershipScopeId);
    if(connection.connected){
      // Existing tested sync preserves content hashes, stale bases and account binding.
      await connection.pushPending({snapshot,focusState});
      if(failure)throw new Error(failure);
      return;
    }
    const summary=await connection.connect({snapshot,focusState}) as any;
    if(summary.conflict||summary.rejected)throw new Error("Some local records were not imported. Local data is preserved; resolve conflicting priorities and retry.");
  }
}
