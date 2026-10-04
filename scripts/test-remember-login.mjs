import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createPinia, setActivePinia } from 'pinia'
const outfile=resolve('.test-output/remember-login.mjs')
await build({entryPoints:['src/utils/rememberLogin.ts'],outfile,bundle:true,platform:'node',format:'esm'})
const {readSavedLogin,saveRememberedLogin,forgetSavedLogin,clearLoginOnLogout}=await import(pathToFileURL(outfile))
const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}
const fake={account:'TEST_ONLY_USER',password:'TEST_ONLY_PASSWORD',schoolSelect:'other',schoolCode:'TEST_ONLY_SCHOOL'}
assert.equal(readSavedLogin(storage),null)
saveRememberedLogin(fake,false,storage);assert.equal(readSavedLogin(storage),null);assert.equal(values.has('loginPassword'),false)
saveRememberedLogin(fake,true,storage);assert.deepEqual(readSavedLogin(storage),fake)
clearLoginOnLogout(storage);assert.deepEqual(readSavedLogin(storage),fake)
forgetSavedLogin(storage);assert.equal(readSavedLogin(storage),null)
for(const key of ['loginAccount','loginPassword','loginSchoolSelect','loginSchoolCode'])assert.equal(values.has(key),false)
values.delete('rememberPassword');values.set('loginAccount',fake.account);values.set('loginPassword',fake.password)
assert.equal(readSavedLogin(storage).password,fake.password)
clearLoginOnLogout(storage);assert.equal(readSavedLogin(storage),null)
saveRememberedLogin(fake,true,storage);saveRememberedLogin({...fake,account:'SECOND_TEST_USER'},true,storage)
assert.equal(readSavedLogin(storage).account,'SECOND_TEST_USER')
saveRememberedLogin(fake,false,storage);assert.equal(readSavedLogin(storage),null)
// Exercise the actual auth store with isolated local storage and fake official APIs.
globalThis.localStorage=storage;globalThis.window={setInterval:()=>123}
globalThis.__rememberLoginCalls=[];globalThis.__rememberLoginFails=false
const authFile=resolve('.test-output/remember-auth.mjs')
await build({entryPoints:['src/stores/auth.ts'],outfile:authFile,bundle:true,platform:'node',format:'esm',external:['pinia'],plugins:[{
 name:'offline-auth',setup(b){
  b.onResolve({filter:/^@\/api\/auth$/},()=>({path:'auth',namespace:'fake'}))
  b.onResolve({filter:/^@\/config$/},()=>({path:'config',namespace:'fake'}))
  b.onResolve({filter:/^@\/utils\/track$/},()=>({path:'track',namespace:'fake'}))
  b.onLoad({filter:/.*/,namespace:'fake'},args=>({loader:'js',contents:args.path==='auth'?`
   export async function discoverSchool(){return {server:'http://fixture.invalid'}}
   export async function loginApi(account,password){globalThis.__rememberLoginCalls.push({account,password});if(globalThis.__rememberLoginFails)throw Error('test denied');return {accessToken:'TEST_ONLY_TOKEN',refreshToken:'TEST_ONLY_REFRESH',expireInSeconds:3600,refreshExpireInSeconds:7200}}
   export async function getUserInfo(){return {realName:'TEST_ONLY',userId:'TEST_ONLY_ID'}}
   export async function refreshTokenApi(){return null}
  `:args.path==='config'?`export const IS_BROWSER=false,PLATFORM='webview2',IS_WINDOWS=true;`:`export async function reportLogin(){}` }))
 }
}]})
setActivePinia(createPinia());const {useAuthStore}=await import(pathToFileURL(authFile));const auth=useAuthStore()
await auth.login(fake.account,fake.password,'other',fake.schoolCode,false);assert.equal(values.has('loginPassword'),false)
await auth.login(fake.account,fake.password,'other',fake.schoolCode,true);auth.logout()
assert.equal(values.has('token'),false);assert.equal(values.has('refreshToken'),false);assert.deepEqual(readSavedLogin(storage),fake)
await auth.autoRelogin();assert.equal(globalThis.__rememberLoginCalls.at(-1).password,fake.password)
forgetSavedLogin(storage);await assert.rejects(()=>auth.autoRelogin(),/无可用登录凭据/)
globalThis.__rememberLoginFails=true;await assert.rejects(()=>auth.login(fake.account,fake.password,'sxz','',true),/test denied/)
assert.equal(values.has('loginPassword'),false);auth.stopRefresh()
console.log('PASS: opt-in local password persistence, prefill, logout, immediate forgetting, legacy compatibility and account replacement; fake credentials only.')
