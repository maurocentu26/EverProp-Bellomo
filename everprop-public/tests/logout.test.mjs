import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(fs.readFileSync(new URL('../src/lib/everprop-api.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function client(serviceWorker,requests){
 const context={exports:{},process:{env:{}},URL,Headers,Event,DOMException,AbortSignal,setTimeout:(fn)=>setTimeout(fn,5),clearTimeout,document:{cookie:''},navigator:{serviceWorker},window:{location:{origin:'http://localhost:3000'},dispatchEvent(){}},fetch:async(url)=>{requests.push(String(url));return {ok:true,status:204};},require(){throw Error('Unexpected import');}};
 vm.runInNewContext(source,context);return context.exports;
}
test('a stalled service worker cannot prevent server logout',async()=>{const requests=[];await client({getRegistration:()=>new Promise(()=>{})},requests).logoutEverprop();assert.equal(requests.length,1);assert.match(requests[0],/auth\/logout$/);});
test('a stalled unsubscribe still revokes the subscription and logs out',async()=>{const requests=[];await client({getRegistration:async()=>({pushManager:{getSubscription:async()=>({endpoint:'https://example.invalid/push',unsubscribe:()=>new Promise(()=>{})})}})},requests).logoutEverprop();assert.equal(requests.length,2);assert.match(requests[0],/push\/subscriptions$/);assert.match(requests[1],/auth\/logout$/);});
