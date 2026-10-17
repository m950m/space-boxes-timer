import {useState,type ChangeEvent} from "react";
import {MAX_BACKUP_BYTES,validateWorkspaceBackup} from "../../../frontend/js/persistence/backup-format.js";
import type {Workspace} from "./workspace";

export function LocalBackup({workspace,onRestored}:{workspace:Workspace|null;onRestored:()=>Promise<void>}){
  const [pending,setPending]=useState<any>(null),[working,setWorking]=useState(false);
  const [error,setError]=useState(""),[message,setMessage]=useState("");
  async function select(event:ChangeEvent<HTMLInputElement>){
    const file=event.target.files?.[0];setPending(null);setError("");setMessage("");
    if(!file)return;
    setWorking(true);
    try{
      if(file.size>MAX_BACKUP_BYTES)throw new Error("Choose a Space Boxes JSON backup smaller than 10 MiB.");
      setPending(validateWorkspaceBackup(JSON.parse(await file.text())));
    }catch(e){setError(e instanceof Error?e.message:"Invalid backup. Your data is unchanged.")}
    finally{setWorking(false);event.target.value=""}
  }
  async function exportData(){
    if(!workspace)return;setWorking(true);setError("");setMessage("");
    try{
      const backup=await workspace.exportBackup();
      const url=URL.createObjectURL(new Blob([JSON.stringify(backup,null,2)],{type:"application/json"}));
      const link=document.createElement("a");link.href=url;link.download=`space-boxes-backup-${new Date().toISOString().slice(0,10)}.json`;
      link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
      setMessage("Backup downloaded. Keep it somewhere safe; it contains your tasks, links and focus history.");
    }catch(e){setError(e instanceof Error?e.message:"Backup could not be exported.")}
    finally{setWorking(false)}
  }
  async function restore(){
    if(!workspace||!pending)return;setWorking(true);setError("");setMessage("");
    try{
      const result=await workspace.restoreBackup(pending);
      setPending(null);
      try{await onRestored()}catch{
        setMessage("Backup is saved in this browser. Reload the page to refresh the workspace.");return;
      }
      setMessage(result.imported?"Backup restored in this browser. Any unfinished session needs explicit recovery.":"This backup is already present. No data changed.");
    }catch(e){setError(e instanceof Error?e.message:"Import failed. Your data is unchanged.")}
    finally{setWorking(false)}
  }
  return <section className="local-backup" aria-label="Local data backup">
    <h3>Back up your space</h3>
    <p className="fineprint">Tasks and focus history are saved in this browser. They do not automatically sync across devices. Clearing browser storage, using private browsing or removing this browser profile can erase them. Keep a JSON backup.</p>
    <button className="save-button" disabled={!workspace||working} onClick={exportData}>Export JSON backup</button>
    <label className="backup-file">Import JSON backup<input type="file" accept=".json,application/json" disabled={!workspace||working} onChange={select}/></label>
    <p className="fineprint">Restore into an empty local workspace, such as a new browser profile. Existing plans and history are never overwritten. Backups include tasks and recorded evidence, including unfinished sessions; appearance preferences stay with this browser.</p>
    {pending&&<div role="status"><p>{pending.planning.tasks.length} tasks · {pending.focus.sessions.length} focus sessions · exported {new Date(pending.exportedAt).toLocaleString()}</p><button className="reset-button" disabled={working} onClick={restore}>Restore validated backup</button><button className="reset-button" disabled={working} onClick={()=>setPending(null)}>Cancel import</button></div>}
    {error&&<p className="form-error" role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </section>;
}
