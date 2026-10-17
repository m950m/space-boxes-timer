// Serve the production artifact under the exact Pages prefix, without an SPA fallback.
import {createServer} from "node:http";
import {readFile} from "node:fs/promises";
import {resolve,extname} from "node:path";
const root=resolve("dist"),base="/space-boxes-timer/";
createServer(async(req,res)=>{
  const path=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
  const file=resolve(root,path.slice(base.length)||"index.html");
  if(!path.startsWith(base)||!file.startsWith(root+"/")){res.writeHead(404).end();return}
  try{
    const data=await readFile(file);
    res.writeHead(200,{"Content-Type":({".html":"text/html",".js":"text/javascript",".css":"text/css",".svg":"image/svg+xml"})[extname(file)]||"application/octet-stream"}).end(data);
  }catch{res.writeHead(404).end()}
}).listen(4173,"127.0.0.1");
