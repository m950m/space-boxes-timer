import test from "node:test";
import assert from "node:assert/strict";
import {BACKUP_FORMAT,validateWorkspaceBackup} from "../../frontend/js/persistence/backup-format.js";
import {createFocusState,transitionFocus} from "../../frontend/js/focus/focus-lifecycle.js";

const task={id:"task-1",ownershipScopeId:"source",planDayId:"2026-10-18",planDay:{timezone:"Africa/Cairo"},title:"Study",plannedStart:"09:00",classification:"primary",sessionPlan:[{id:"item-1",activeMinutes:25}],resources:[{label:"Course",url:"https://example.com"}]};
function fixture(){
  let focus=createFocusState("source");
  focus=transitionFocus(focus,{type:"start",id:"cmd-1",contextId:"tab-1",at:1000,expectedRevision:0,task,taskId:task.id,plannedItemId:"item-1",timezone:"Africa/Cairo",sessionId:"session-1",evidenceId:"evidence-1"});
  focus=transitionFocus(focus,{type:"end",id:"cmd-2",contextId:"tab-1",at:2000,expectedRevision:1,observation:{at:2000,elapsedMs:1000,certainty:"confirmed"}});
  return {format:BACKUP_FORMAT,version:1,exportedAt:"2026-10-18T12:00:00.000Z",planning:{ownershipScopeId:"source",revision:1,tasks:[structuredClone(task)]},focus};
}
test("round trip preserves planning, resources, frozen history and recorded evidence",()=>{
  const backup=fixture();assert.deepEqual(validateWorkspaceBackup(JSON.parse(JSON.stringify(backup))),backup);
});
test("unfinished reservation remains recoverable without inventing elapsed focus",()=>{
  const backup=fixture();backup.focus=transitionFocus(createFocusState("source"),{type:"start",id:"start",contextId:"tab",at:1000,expectedRevision:0,task,plannedItemId:"item-1",timezone:"Africa/Cairo",sessionId:"session",evidenceId:"evidence"});
  assert.equal(validateWorkspaceBackup(backup).focus.reservation.state,"running");
});
for(const [name,mutate] of [
  ["unsupported version",b=>b.version=2],
  ["missing format",b=>delete b.format],
  ["missing task array",b=>delete b.planning.tasks],
  ["duplicate identity",b=>b.planning.tasks.push(structuredClone(b.planning.tasks[0]))],
  ["mismatched scope",b=>b.planning.tasks[0].ownershipScopeId="other"],
  ["dangling parent",b=>b.planning.tasks[0].parentTaskId="missing"],
  ["four primary boxes",b=>{for(let i=2;i<=4;i++)b.planning.tasks.push({...structuredClone(task),id:"task-"+i})}],
  ["invalid start",b=>b.planning.tasks[0].plannedStart={}],
  ["invalid date",b=>b.planning.tasks[0].planDayId="2026-02-30"],
  ["invalid timezone",b=>b.planning.tasks[0].planDay.timezone="invalid"],
  ["negative session duration",b=>b.planning.tasks[0].sessionPlan[0].activeMinutes=-1],
  ["invalid resource",b=>b.planning.tasks[0].resources=[{url:5}]],
  ["contradictory task decisions",b=>{b.planning.tasks[0].completedAt=2000;b.planning.tasks[0].cancelledAt=3000}],
  ["missing session task",b=>b.focus.sessions[0].taskId="missing"],
  ["missing planned item",b=>b.planning.tasks[0].sessionPlan[0].id="missing"],
  ["missing evidence",b=>b.focus.evidence=[]],
  ["missing authority history",b=>b.focus.authorityChanges=[]],
  ["forged completion",b=>b.focus.sessions[0].ending.outcome="completed"],
])test("rejects "+name,()=>{const backup=fixture();mutate(backup);assert.throws(()=>validateWorkspaceBackup(backup))});
