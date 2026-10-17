// Mocked transport tests. These do not prove database or SMTP delivery.
import test from "node:test";
import assert from "node:assert/strict";
import {request,forgetCsrf,ApiError} from "../src/space-boxes/connected/api.js";
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});
for(const failure of ["network",503,429]){
  test(`mutation ${failure}: no unsafe automatic retry`,async()=>{
    forgetCsrf();let posts=0;
    globalThis.fetch=async(path,init={})=>{
      if(path.endsWith("/csrf"))return json({csrfToken:"test-csrf"});
      posts++;assert.equal(init.headers["X-CSRFToken"],"test-csrf");
      if(failure==="network")throw new TypeError("offline");
      return json({error:{code:"unavailable",message:"Not accepted"}},failure);
    };
    await assert.rejects(request("POST","/api/v2/focus/command",{type:"start"}),ApiError);
    assert.equal(posts,1);
  });
}
test("safe GET wakes a sleeping backend with bounded retries",async()=>{
  let calls=0;globalThis.fetch=async()=>++calls<3?json({},503):json({ok:true});
  assert.deepEqual(await request("GET","/api/v2/accounts/me"),{ok:true});assert.equal(calls,3);
});
test("known CSRF middleware rejection refreshes token once",async()=>{
  forgetCsrf();let primes=0,posts=0;
  globalThis.fetch=async(path)=>path.endsWith("/csrf")?json({csrfToken:"test-"+(++primes)}):++posts===1?new Response("CSRF rejected",{status:403,headers:{"Content-Type":"text/html"}}):json({ok:true});
  assert.deepEqual(await request("POST","/api/v2/accounts/logout",{}),{ok:true});assert.equal(primes,2);assert.equal(posts,2);
});
