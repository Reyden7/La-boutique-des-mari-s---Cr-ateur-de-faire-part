import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRecoveryState, getInitializedAuthSession, getRecoveryRedirect, isRecoveryCallback, isValidRecoveryEmail, validateNewPassword, sendPasswordRecovery, updateRecoveredPassword, RECOVERY_INVALID_MESSAGE } from "../src/lib/passwordRecovery.ts";

const session = { user: { id: "fixture-user", is_anonymous: false, last_sign_in_at: "2026-10-08T10:00:00Z" }, expires_at: 4600 };
function storage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key,value) => values.set(key,value), removeItem: (key) => values.delete(key), values };
}
function fixture() {
  const store = storage(); const recovery = createRecoveryState(store, () => 1_000_000);
  const calls = [];
  const client = { auth: {
    getSession: async () => ({ data:{session},error:null }),
    getUser: async () => ({ data:{user:session.user},error:null }),
    updateUser: async (payload) => { calls.push({method:"updateUser",payload}); return {error:null}; },
    signOut: async (options) => { calls.push({method:"signOut",options}); return {error:null}; },
  } };
  return { store,recovery,calls,client };
}
test("email and existing six-character password rules", () => {
  for (const value of ["", "bad", "a@", "a@b", "a b@example.test"]) assert.equal(isValidRecoveryEmail(value),false);
  assert.equal(isValidRecoveryEmail(" qa@example.test "),true);
  assert.match(validateNewPassword("12345","12345"),/6 caractères/);
  assert.match(validateNewPassword("123456","123457"),/ne correspondent pas/);
  assert.equal(validateNewPassword("123456","123456"),null);
});
test("native email reset uses trimmed email and exact local/production origins", async () => {
  for (const origin of ["https://www.laboutiquedesmaries.fr","https://laboutiquedesmaries.fr","http://localhost:5173","http://127.0.0.1:5173"]) {
    const calls=[]; const client={auth:{resetPasswordForEmail:async(...args)=>{calls.push(args);return {error:null};}}};
    await sendPasswordRecovery(client," qa@example.test ",origin);
    assert.deepEqual(calls,[["qa@example.test",{redirectTo:origin+"/reset-password"}]]);
    await assert.rejects(sendPasswordRecovery(client,"invalid",origin),/email valide/);
    assert.equal(calls.length,1);
  }
});
test("known and unknown emails have the same success outcome; technical errors are sanitized", async () => {
  for (const error of [null,{code:"user_not_found",message:"private account detail"}])
    assert.equal(await sendPasswordRecovery({auth:{resetPasswordForEmail:async()=>({error})}},"unknown@example.test","http://localhost:5173"),undefined);
  for (const result of [()=>({error:{code:"over_email_send_rate_limit",message:"private detail"}}),()=>{throw new Error("private detail");}])
    await assert.rejects(sendPasswordRecovery({auth:{resetPasswordForEmail:async()=>result()}},"qa@example.test","http://localhost:5173"),error=>!error.message.includes("private")&&/Impossible/.test(error.message));
});
test("ordinary sessions, anonymous and expired recovery sessions cannot enable reset", () => {
  const {recovery}=fixture();
  recovery.handleEvent("INITIAL_SESSION",session); assert.equal(recovery.hasSession(session),false);
  recovery.handleEvent("SIGNED_IN",session); assert.equal(recovery.hasSession(session),false);
  recovery.handleEvent("PASSWORD_RECOVERY",{...session,user:{...session.user,is_anonymous:true}}); assert.equal(recovery.hasSession(session),false);
  recovery.handleEvent("PASSWORD_RECOVERY",{...session,expires_at:900}); assert.equal(recovery.hasSession(session),false);
});
test("recovery routing overrides dashboard, login and admin, but never normal sessions", () => {
  for (const path of ["/", "/auth", "/login", "/studio/fixture", "/admin/assets", "/unknown"]) {
    assert.equal(getRecoveryRedirect(path, true), "/reset-password");
    assert.equal(getRecoveryRedirect(path, false), null);
  }
  assert.equal(getRecoveryRedirect("/reset-password", true), null);
  assert.equal(getRecoveryRedirect("/reset-password", false), null);
});
test("callback type is only a loading hint, not proof of recovery", () => {
  assert.equal(isRecoveryCallback({search:"",hash:"#type=recovery"}), true);
  assert.equal(isRecoveryCallback({search:"?type=recovery",hash:""}), true);
  assert.equal(isRecoveryCallback({search:"?type=signup",hash:""}), false);
  assert.equal(isRecoveryCallback({search:"",hash:""}), false);
  const {recovery} = fixture();
  assert.equal(recovery.hasSession(session), false);
});
test("auth bootstrap waits for the real SDK's deferred PASSWORD_RECOVERY before releasing routing", async () => {
  const {recovery} = fixture(); const calls=[];
  const client={auth:{
    initialize: async()=>{
      calls.push("initialize");
      setTimeout(()=>{recovery.handleEvent("PASSWORD_RECOVERY",session);calls.push("PASSWORD_RECOVERY");},0);
      return {error:null};
    },
    getSession:async()=>{calls.push("getSession");assert.equal(recovery.hasSession(session),true);return {data:{session},error:null};},
  }};
  assert.equal((await getInitializedAuthSession(client)).data.session,session);
  assert.deepEqual(calls,["initialize","PASSWORD_RECOVERY","getSession"]);
});
test("invalid callback initialization cannot reuse an existing ordinary session", async () => {
  let reads=0; const error={code:"otp_expired"};
  const client={auth:{initialize:async()=>({error}),getSession:async()=>{reads++;return {data:{session},error:null};}}};
  assert.deepEqual(await getInitializedAuthSession(client),{data:{session:null},error});
  assert.equal(reads,0);
});
test("SDK recovery event survives refresh with a user-bound, expiring UI marker and no token", () => {
  const {recovery,store}=fixture(); let notifications=0;
  const unsubscribe=recovery.subscribe(()=>notifications++);
  recovery.handleEvent("PASSWORD_RECOVERY",session);
  assert.equal(recovery.hasSession(session),true); assert.equal(notifications,1);
  assert.equal(recovery.hasSession({...session,user:{id:"someone-else"}}),false);
  const reloaded=createRecoveryState(store,()=>1_000_000);
  reloaded.handleEvent("INITIAL_SESSION",session); assert.equal(reloaded.hasSession(session),true);
  reloaded.handleEvent("SIGNED_IN",session); assert.equal(reloaded.hasSession(session),true); // Actual SDK reload/focus behavior.
  assert.deepEqual(JSON.parse([...store.values.values()][0]),{userId:"fixture-user",signedInAt:"2026-10-08T10:00:00Z",expiresAt:4_600_000});
  assert.equal(createRecoveryState(store,()=>4_600_001).hasSession(session),false);
  recovery.handleEvent("TOKEN_REFRESHED",{...session,expires_at:8000});
  assert.equal(recovery.getSnapshot().expiresAt,4_600_000); // Cannot extend recovery indefinitely.
  unsubscribe(); recovery.clear(); assert.equal(notifications,1);
});
test("sign out, a new regular login or a different account clears recovery", () => {
  for(const [event,next] of [["SIGNED_OUT",null],["SIGNED_IN",{...session,user:{...session.user,last_sign_in_at:"2026-10-08T11:00:00Z"}}],["INITIAL_SESSION",{...session,user:{id:"someone-else"}}]]){
    const {recovery,store}=fixture();recovery.handleEvent("PASSWORD_RECOVERY",session);recovery.handleEvent(event,next);
    assert.equal(recovery.hasSession(session),false);assert.equal(store.values.size,0);
  }
});
test("unavailable/corrupt session storage degrades safely", () => {
  const blocked={getItem:()=>{throw new Error();},setItem:()=>{throw new Error();},removeItem:()=>{throw new Error();}};
  const recovery=createRecoveryState(blocked,()=>1_000_000);
  recovery.handleEvent("PASSWORD_RECOVERY",session);assert.equal(recovery.hasSession(session),true);recovery.clear();
  assert.equal(recovery.hasSession(session),false);
  const corrupt={...blocked,getItem:()=>"not json"};assert.equal(createRecoveryState(corrupt).getSnapshot(),null);
});
test("updateUser only after verified recovery session, then clear and local sign out", async () => {
  const {recovery,client,calls,store}=fixture();recovery.handleEvent("PASSWORD_RECOVERY",session);
  await updateRecoveredPassword(client,recovery,"fixture-secret");
  assert.deepEqual(calls,[{method:"updateUser",payload:{password:"fixture-secret"}},{method:"signOut",options:{scope:"local"}}]);
  assert.equal(store.values.size,0);assert.equal(recovery.hasSession(session),false);
  await assert.rejects(updateRecoveredPassword(client,recovery,"another-secret"),new RegExp(RECOVERY_INVALID_MESSAGE));
  assert.equal(calls.length,2);
});
test("bare reset route with an ordinary login never updates a password", async () => {
  const {recovery,client,calls}=fixture();
  await assert.rejects(updateRecoveredPassword(client,recovery,"fixture-secret"),new RegExp(RECOVERY_INVALID_MESSAGE));assert.equal(calls.length,0);
});
test("missing/expired/revoked server session refuses update even with a recovery UI marker", async () => {
  for(const kind of ["missing","revoked","mismatch"]) {
    const {recovery,client,calls}=fixture();recovery.handleEvent("PASSWORD_RECOVERY",session);
    if(kind==="missing")client.auth.getSession=async()=>({data:{session:null},error:null});
    if(kind==="revoked")client.auth.getUser=async()=>({data:{user:null},error:{code:"bad_jwt"}});
    if(kind==="mismatch")client.auth.getUser=async()=>({data:{user:{id:"someone-else"}},error:null});
    await assert.rejects(updateRecoveredPassword(client,recovery,"fixture-secret"),new RegExp(RECOVERY_INVALID_MESSAGE));assert.equal(calls.length,0);
    assert.equal(recovery.getSnapshot(),null);
  }
});
test("server update error remains safe and retryable; expiration invalidates the recovery marker", async () => {
  for(const code of ["weak_password","session_expired"]) {
    const {recovery,client}=fixture();recovery.handleEvent("PASSWORD_RECOVERY",session);
    client.auth.updateUser=async()=>({error:{code,message:"private server detail"}});
    await assert.rejects(updateRecoveredPassword(client,recovery,"fixture-secret"),error=>!error.message.includes("private"));
    assert.equal(recovery.hasSession(session),code!=="session_expired");
  }
});
test("no false failure if local sign out fails after successful password update", async () => {
  const {recovery,client}=fixture();recovery.handleEvent("PASSWORD_RECOVERY",session);
  client.auth.signOut=async()=>{throw new Error("network unavailable");};
  await updateRecoveredPassword(client,recovery,"fixture-secret");assert.equal(recovery.hasSession(session),false);
});
test("public route, autocomplete, safe errors and synchronous double-submit guards remain wired", () => {
  const source=(path)=>readFileSync(new URL(path,import.meta.url),"utf8");
  assert.match(source("../src/App.tsx"),/path="\/reset-password" element={<ResetPasswordPage \/>}/);
  assert.match(source("../src/pages/AuthPage.tsx"),/current-password/);
  assert.equal((source("../src/pages/ResetPasswordPage.tsx").match(/autoComplete="new-password"/g)??[]).length,2);
  for(const file of ["../src/pages/AuthPage.tsx","../src/pages/ResetPasswordPage.tsx"])assert.match(source(file),/if \(busy.current/);
  assert.match(source("../src/lib/supabase.ts"),/detectSessionInUrl: true/);
  assert.match(source("../src/contexts/AuthContext.tsx"),/getInitializedAuthSession\(client\)/);
  assert.match(source("../src/contexts/AuthContext.tsx"),/if \(initialized\) setLoading\(false\)/);
  assert.match(source("../src/App.tsx"),/<RecoveryRouteGuard><Routes>/);
  assert.match(source("../src/App.tsx"),/path="\/login" element={<AuthPage \/>}/);
  assert.match(source("../src/pages/ResetPasswordPage.tsx"),/to="\/login"/);
  for(const file of ["../src/pages/AuthPage.tsx","../src/components/auth/ProtectedRoute.tsx"])
    assert.match(source(file),/getRecoveryRedirect\(location.pathname, recoveryReady\)/);
  const helper=source("../src/lib/passwordRecovery.ts");assert.ok(!helper.includes("access_token")&&!helper.includes("setSession(")&&!helper.includes(".from("));
});
