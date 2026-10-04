export interface SavedLogin { account: string; password: string; schoolSelect: string; schoolCode: string }
const keys = ['loginAccount', 'loginPassword', 'loginSchoolSelect', 'loginSchoolCode']
export function readSavedLogin(storage: Storage = localStorage): SavedLogin | null {
  if (storage.getItem('rememberPassword') === 'false') return null
  const account = storage.getItem('loginAccount'), password = storage.getItem('loginPassword')
  // Existing app versions saved these fields without a preference. Read them
  // for compatibility, but only explicit opt-in survives a manual logout.
  if (!account || !password) return null
  return { account, password, schoolSelect: storage.getItem('loginSchoolSelect') || 'sxz', schoolCode: storage.getItem('loginSchoolCode') || '' }
}
export function forgetSavedLogin(storage: Storage = localStorage) {
  for (const key of keys) storage.removeItem(key)
  storage.setItem('rememberPassword', 'false')
}
export function saveRememberedLogin(login: SavedLogin, remember: boolean, storage: Storage = localStorage) {
  if (!remember) { forgetSavedLogin(storage); return }
  storage.setItem('rememberPassword', 'true')
  for (const [key, value] of Object.entries({loginAccount:login.account, loginPassword:login.password, loginSchoolSelect:login.schoolSelect, loginSchoolCode:login.schoolCode})) storage.setItem(key,value)
}
export function clearLoginOnLogout(storage: Storage = localStorage) {
  if (storage.getItem('rememberPassword') !== 'true') forgetSavedLogin(storage)
}
