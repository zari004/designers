// ═══════════════════════════════════════════════
// AUTH — Firebase Auth asosida login/register/logout
// ═══════════════════════════════════════════════

const PERM_LABELS = {
  designers:'Dizaynerlar', projects:'Loyihalar', payments:"To'lovlar",
  reports:'Hisobotlar', users:'Foydalanuvchilar', settings:'Sozlamalar'
};

// Default role definitions
const _DEFAULT_ROLES = {
  admin:   { label:'Admin', perms:{designers:true, projects:true, payments:true, reports:true, users:true, settings:true} },
  manager: { label:'Menejer', perms:{designers:true, projects:true, payments:true, reports:true, users:false, settings:false} },
  designer:{ label:'Dizayner', perms:{designers:false, projects:true, payments:true, reports:true, users:false, settings:false} },
  viewer:  { label:"Ko'ruvchi", perms:{designers:true, projects:true, payments:false, reports:true, users:false, settings:false} },
  pending: { label:'Kutilmoqda', perms:{designers:false, projects:false, payments:false, reports:false, users:false, settings:false} }
};
let ROLE_DEFS;
try {
  ROLE_DEFS = JSON.parse(localStorage.getItem('exon_role_defs')) || _DEFAULT_ROLES;
} catch { ROLE_DEFS = _DEFAULT_ROLES; }
if(!ROLE_DEFS.designer){
  ROLE_DEFS.designer = _DEFAULT_ROLES.designer;
  localStorage.setItem('exon_role_defs', JSON.stringify(ROLE_DEFS));
  setTimeout(()=>{ if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('roleDefs', JSON.stringify(ROLE_DEFS)); }, 3000);
}

let _currentUser = null; // { uid, email, displayName, role, permissions }
let _fbUsersCache = [];  // Firestore users ro'yxati (admin panel uchun)

function getCurrentUser(){ return _currentUser; }
function getUsers(){ return _fbUsersCache; }
function saveUsersRaw(){} // Firebase'da kerak emas, compat uchun saqlanadi

function hasPermission(key){
  const u = _currentUser;
  if(!u) return false;
  if(u.role === 'admin') return true;
  return !!(u.permissions && u.permissions[key]);
}

function isDesignerRole(){
  return _currentUser?.role === 'designer';
}

function getMyDesignerId(){
  return _currentUser?.designerId || null;
}

function getMyProjects(){
  const did = getMyDesignerId();
  if(!did) return [];
  return projects.filter(p => p.designerId === did);
}

function getMyDesigner(){
  const did = getMyDesignerId();
  if(!did) return null;
  return designers.find(d => d.id === did) || null;
}

function _dismissAppLoading(){
  const ov=document.getElementById('app-loading-overlay');
  if(!ov) return;
  ov.style.opacity='0';
  setTimeout(()=>ov.remove(), 350);
}

function _updateSidebarUser(user){
  const sbu=document.getElementById('sidebar-username');
  const sba=document.getElementById('sidebar-avatar');
  const sFooter=document.querySelector('.sidebar-footer');
  if(sFooter) sFooter.style.opacity='';
  const name=user.displayName||user.username||user.email||'?';
  if(sbu) sbu.textContent=name;
  if(sba) sba.textContent=name.slice(0,2).toUpperCase();
}

// Firestore so'roviga timeout qo'yish
function _fbQueryWithTimeout(promise, ms){
  return Promise.race([
    promise,
    new Promise((_,rej) => setTimeout(() => rej(new Error('timeout')), ms))
  ]);
}

// ── AUTH STATE KUZATUVCHI (app.js dan bitta marta chaqiriladi) ──
function setupAuthListener(onLogin, onLogout){
  const auth = getFbAuth();
  if(!auth){ onLogout(); return; }
  auth.onAuthStateChanged(fbUser => {
    if(fbUser){
      const quickProfile = {
        uid: fbUser.uid, email: fbUser.email,
        displayName: fbUser.displayName || fbUser.email?.split('@')[0] || '?',
        role: '_loading',
        permissions: {},
        createdAt: new Date().toISOString(),
      };
      _currentUser = quickProfile;
      onLogin(quickProfile);
      _loadFirestoreProfile(fbUser.uid);
    } else {
      _currentUser = null;
      onLogout();
    }
  });
}

async function _loadFirestoreProfile(uid){
  if(!isFbReady()){
    // Firebase tayyor emas — admin paneli KO'RSATILMAYDI
    if(typeof showPendingScreen==='function') showPendingScreen();
    _dismissAppLoading();
    return;
  }

  // Profilni bir necha marta o'qishga urinamiz:
  // · Yangi ro'yxatdan o'tganda hujjat hali yozilmagan bo'lishi mumkin (poyga holati)
  // · Firestore sekin javob berishi mumkin
  // MUHIM: profil aniqlanmaguncha OQ FON ustki qatlam (overlay) olib tashlanmaydi —
  // shu sabab admin paneli boshqa foydalanuvchilarga sira ko'rinmaydi.
  let profile = null;
  for(let attempt=0; attempt<6; attempt++){
    try{
      const snap = await Promise.race([
        getDb().collection('users').doc(uid).get(),
        new Promise((_,r)=>setTimeout(()=>r(new Error('timeout')),5000))
      ]);
      if(snap && snap.exists){ profile = snap.data(); break; }
    }catch(e){ console.warn('Firestore profil urinish #'+attempt+':', e); }
    await new Promise(r=>setTimeout(r, 1200));
  }

  // Profil topilmadi (yangi ro'yxatdan o'tgan yoki hujjat o'chirilgan) →
  // tizimga kiritmaymiz, faqat "Tasdiqlanishi kutilmoqda" ekrani.
  if(!profile){
    if(typeof showPendingScreen==='function') showPendingScreen();
    _dismissAppLoading();
    return;
  }

  _currentUser = profile;

  // Rol berilmagan (pending) → faqat tasdiqlash ekrani, admin paneli yo'q
  if(profile.role === 'pending' || !profile.role){
    if(typeof showPendingScreen==='function') showPendingScreen();
    _dismissAppLoading();
    return;
  }

  // Haqiqiy rol — endi to'g'ri panel chiziladi, keyin overlay olib tashlanadi
  if(typeof applyNavPermissions==='function') applyNavPermissions(profile);
  _updateSidebarUser(profile);
  if(typeof rerenderActive==='function') rerenderActive();
  _dismissAppLoading();

  // Admin foydalanuvchilar ro'yxati (rol kutayotganlar bildirishnomasi uchun ham)
  try {
    const users = await Promise.race([
      getAllFbUsers(),
      new Promise((_,r)=>setTimeout(()=>r('timeout'),5000))
    ]);
    _fbUsersCache = users || [];
    if(typeof renderNotifPanel==='function') renderNotifPanel();
  } catch { _fbUsersCache = []; }
}

// ── KIRISH ──
async function doLogin(){
  const email = document.getElementById('login-email')?.value?.trim();
  const pass  = document.getElementById('login-pass')?.value;
  const errEl = document.getElementById('login-error');
  if(!email || !pass){
    if(errEl){ errEl.textContent = "Email va parolni kiriting"; errEl.style.display='block'; } return;
  }
  const btn = document.getElementById('login-btn');
  if(btn){ btn.disabled=true; btn.textContent='Kirilmoqda...'; }
  try{
    await fbSignIn(email, pass);
    if(errEl) errEl.style.display='none';
    // onAuthStateChanged → onLogin → initApp chaqiriladi
  }catch(e){
    if(errEl){ errEl.textContent=loginErrMsg(e.code); errEl.style.display='block'; }
    if(btn){ btn.disabled=false; btn.textContent='Kirish'; }
  }
}

// ── RO'YXATDAN O'TISH ──
async function doRegister(){
  const email = document.getElementById('reg-email')?.value?.trim();
  const pass  = document.getElementById('reg-pass')?.value;
  const name  = document.getElementById('reg-name')?.value?.trim();
  const errEl = document.getElementById('reg-error');
  if(!email||!pass||!name){
    if(errEl){ errEl.textContent="Barcha maydonlarni to'ldiring"; errEl.style.display='block'; } return;
  }
  if(pass.length < 6){
    if(errEl){ errEl.textContent="Parol kamida 6 belgi bo'lishi kerak"; errEl.style.display='block'; } return;
  }
  const btn = document.getElementById('reg-btn');
  if(btn){ btn.disabled=true; btn.textContent="Ro'yxatdan o'tilmoqda..."; }
  try{
    await fbRegisterUser(email, pass, name); // rol fbRegisterUser ichida aniqlanadi
    if(errEl) errEl.style.display='none';
    // onAuthStateChanged → initApp chaqiriladi
  }catch(e){
    if(errEl){ errEl.textContent=loginErrMsg(e.code); errEl.style.display='block'; }
    if(btn){ btn.disabled=false; btn.textContent="Ro'yxatdan o'tish"; }
  }
}

function loginErrMsg(code){
  const m = {
    'auth/user-not-found':       'Bunday email topilmadi',
    'auth/wrong-password':       "Parol noto'g'ri",
    'auth/invalid-email':        "Email noto'g'ri formatda",
    'auth/too-many-requests':    "Ko'p urinish — biroz kuting",
    'auth/email-already-in-use': "Bu email allaqachon ro'yxatda",
    'auth/weak-password':        "Parol juda sodda",
    'auth/invalid-credential':   "Email yoki parol noto'g'ri",
    'auth/network-request-failed': "Internet aloqasi yo'q",
  };
  return m[code] || ('Xatolik: ' + (code||'noma\'lum'));
}

// ── CHIQISH ──
async function doLogout(){
  try{ await fbSignOut(); }catch(e){ console.warn('signOut:', e); }
  location.reload();
}

// ── PAROLNI O'ZGARTIRISH (o'z paroli) ──
async function changeOwnPassword(){
  const old = document.getElementById('chpw-old')?.value;
  const n1  = document.getElementById('chpw-new')?.value;
  const n2  = document.getElementById('chpw-new2')?.value;
  const fbUser = getFbAuth()?.currentUser;
  if(!fbUser){ toast("Kirish talab etiladi"); return; }
  if(!n1 || n1 !== n2){ toast("Yangi parollar mos emas!"); return; }
  if(n1.length < 6){ toast("Parol kamida 6 belgi bo'lishi kerak"); return; }
  try{
    const cred = firebase.auth.EmailAuthProvider.credential(fbUser.email, old);
    await fbUser.reauthenticateWithCredential(cred);
    await fbUser.updatePassword(n1);
    toast("Parol o'zgartirildi");
    ['chpw-old','chpw-new','chpw-new2'].forEach(id=>{
      const el=document.getElementById(id); if(el) el.value='';
    });
  }catch(e){
    toast("Xatolik: " + loginErrMsg(e.code));
  }
}

// ── LOGIN EKRANI: TABLAR ──
function showLoginTab(tab){
  const loginF = document.getElementById('login-form');
  const regF   = document.getElementById('reg-form');
  if(loginF) loginF.style.display = tab==='login' ? '' : 'none';
  if(regF)   regF.style.display   = tab==='reg'   ? '' : 'none';
  document.querySelectorAll('.login-tab-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab)
  );
}

// ── FIREBASE SOZLAMALARINI SAQLASH (settings sahifasida) ──
function saveFbConfigFromSettings(){
  const raw = document.getElementById('fb-config-json')?.value?.trim();
  if(!raw){ toast("Konfiguratsiya kiritilmagan"); return; }
  let cfg;
  try{
    // Firebase config'ni JSON yoki JS object sifatida qabul qilish
    cfg = JSON.parse(raw);
  }catch{
    try{
      // eslint-disable-next-line no-new-func
      cfg = (new Function('return (' + raw + ')'))();
    }catch{
      toast("JSON formati noto'g'ri — Firebase Console'dan to'g'ri ko'chiring"); return;
    }
  }
  if(!cfg?.apiKey || !cfg?.projectId){ toast("apiKey va projectId bo'lishi shart"); return; }
  saveFbConfig(cfg);
  toast("Firebase konfiguratsiyasi saqlandi — sahifa yangilanadi...");
  setTimeout(()=>location.reload(), 1500);
}

function clearFbConfigFromSettings(){
  if(!confirm("Firebase konfiguratsiyasini o'chirasizmi? Ilovani qayta sozlash kerak bo'ladi.")) return;
  clearFbConfig();
  toast("Firebase konfiguratsiyasi o'chirildi — sahifa yangilanadi...");
  setTimeout(()=>location.reload(), 1200);
}

// ── FOYDALANUVCHILAR (admin tomonidan) ──
async function renderFbUsersAdmin(){
  const el = document.getElementById('fb-users-list');
  if(!el) return;
  el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px">Yuklanmoqda...</div>';
  try{
    _fbUsersCache = await getAllFbUsers();
    if(!_fbUsersCache.length){
      el.innerHTML = '<div style="color:var(--muted);font-size:13px;padding:8px">Hozircha foydalanuvchi yo\'q</div>';
      return;
    }
    const pendingUsers = _fbUsersCache.filter(u=>u.role==='pending');
    const warnHtml = pendingUsers.length ? `<div style="background:#fef3cd;border:1px solid #ffc107;border-radius:8px;padding:12px 16px;margin-bottom:14px;display:flex;align-items:center;gap:10px">
      <span style="font-size:18px">&#9888;</span>
      <div style="font-size:13px;color:#664d03;font-weight:600">${pendingUsers.length} ta foydalanuvchi rol kutmoqda — iltimos, rol belgilang</div>
    </div>` : '';
    el.innerHTML = warnHtml + _fbUsersCache.map(u => {
      const isDesigner = u.role === 'designer';
      return `<div class="user-row" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);flex-wrap:wrap">
        <div class="user-avatar" style="font-size:12px;width:34px;height:34px;flex-shrink:0">${(u.displayName||u.email).slice(0,2).toUpperCase()}</div>
        <div style="flex:1;min-width:120px">
          <div style="font-weight:600;font-size:13px">${esc(u.displayName||'—')}</div>
          <div style="font-size:11.5px;color:var(--muted)">${esc(u.email)}</div>
        </div>
        <select class="mini-select" onchange="fbChangeRole('${u.uid}',this.value)" ${u.uid===_currentUser?.uid?'disabled title="O\'z rolini o\'zgartirish mumkin emas"':''}>
          ${Object.entries(ROLE_DEFS).map(([rk,rd])=>`<option value="${esc(rk)}" ${u.role===rk?'selected':''}>${esc(rd.label)}</option>`).join('')}
        </select>
        ${isDesigner ? `<select class="mini-select" onchange="fbLinkDesigner('${u.uid}',this.value)" style="max-width:140px">
          <option value="">— Bog'lash —</option>
          ${designers.map(d=>`<option value="${d.id}" ${u.designerId==d.id?'selected':''}>${esc(d.name)}</option>`).join('')}
        </select>` : ''}
        ${u.uid!==_currentUser?.uid?`<button class="btn btn-danger btn-xs" onclick="fbDeleteUser('${u.uid}','${esc(u.displayName||u.email)}')">×</button>`:''}
      </div>`;
    }).join('');
  }catch(e){
    el.innerHTML = `<div style="color:var(--err);font-size:13px;padding:8px">Xatolik: ${esc(e.message)}</div>`;
  }
}

async function fbChangeRole(uid, role){
  try{
    await updateFbUserRole(uid, role);
    // Rolning ruxsatlarini ham foydalanuvchiga yozish — shunda rol haqiqatan kuchga kiradi
    const perms = ROLE_DEFS[role]?.perms;
    if(perms && typeof updateFbUserPermissions === 'function'){
      await updateFbUserPermissions(uid, perms);
    }
    toast("Rol o'zgartirildi");
    _fbUsersCache = await getAllFbUsers();
    renderFbUsersAdmin();
  }catch(e){ toast("Xato: " + e.message); }
}

async function fbLinkDesigner(uid, designerId){
  try{
    const did = designerId ? parseInt(designerId) : null;
    await getDb().collection('users').doc(uid).set({ designerId: did }, { merge: true });
    toast(did ? "Dizaynerga bog'landi" : "Bog'lanish olib tashlandi");
    _fbUsersCache = await getAllFbUsers();
    renderFbUsersAdmin();
  }catch(e){ toast("Xato: " + e.message); }
}

async function fbDeleteUser(uid, name){
  if(!confirm(`"${name}" foydalanuvchisini o'chirish? Kirish imkoni yo'qoladi.`)) return;
  try{
    await deleteFbUserProfile(uid);
    toast("Foydalanuvchi o'chirildi");
    renderFbUsersAdmin();
  }catch(e){ toast("Xato: " + e.message); }
}

// ── ROL BOSHQARISH ──
// Asosiy (o'chirib bo'lmaydigan) rollar
const _BUILTIN_ROLES = ['admin','manager','designer','viewer','pending'];

function saveRoleDefs(){
  localStorage.setItem('exon_role_defs', JSON.stringify(ROLE_DEFS));
  // Boshqa qurilmalarga ham tarqatish (Firestore sozlamalar hujjati orqali)
  if(typeof saveSettingToFirestore === 'function'){
    saveSettingToFirestore('roleDefs', JSON.stringify(ROLE_DEFS));
  }
}

function updateRolePerms(roleName, perms){
  if(!ROLE_DEFS[roleName]) return;
  ROLE_DEFS[roleName].perms = perms;
  saveRoleDefs();
  // Hozirgi foydalanuvchining roli o'zgarganda, UI yangilansin
  if(_currentUser?.role === roleName){
    _currentUser.permissions = perms;
    if(typeof rerenderActive==='function') rerenderActive();
  }
}

function toggleRolePerm(roleName, permKey, checked){
  if(!ROLE_DEFS[roleName]) return;
  ROLE_DEFS[roleName].perms[permKey] = checked;
  updateRolePerms(roleName, ROLE_DEFS[roleName].perms);
  toast(`${esc(PERM_LABELS[permKey])} — ${checked?'Ruxsat berildi':'Ruxsat o\'chirildi'}`);
}

// Yangi rol qo'shish
function addRole(){
  const keyInp = document.getElementById('new-role-key');
  const labelInp = document.getElementById('new-role-label');
  let key = (keyInp?.value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g,'');
  const label = (labelInp?.value || '').trim();
  if(!key){ toast("Rol kalitini kiriting (masalan: buxgalter)"); return; }
  if(ROLE_DEFS[key]){ toast("Bunday rol allaqachon mavjud"); return; }
  ROLE_DEFS[key] = {
    label: label || key,
    perms: { designers:false, projects:false, payments:false, reports:false, users:false, settings:false }
  };
  saveRoleDefs();
  if(keyInp) keyInp.value='';
  if(labelInp) labelInp.value='';
  renderRoleManager();
  toast(`"${esc(label||key)}" roli qo'shildi`);
}

// Rol nomini (ko'rinadigan label) tahrirlash
function renameRoleLabel(roleName, label){
  if(!ROLE_DEFS[roleName]) return;
  ROLE_DEFS[roleName].label = (label || '').trim() || roleName;
  saveRoleDefs();
}

// Rolni o'chirish
function deleteRole(roleName){
  if(_BUILTIN_ROLES.includes(roleName)){ toast("Asosiy rollarni o'chirib bo'lmaydi"); return; }
  if(!ROLE_DEFS[roleName]) return;
  const inUse = (getUsers() || []).some(u => u.role === roleName);
  if(inUse){ toast("Bu rol foydalanuvchilarga biriktirilgan — avval ularning rolini o'zgartiring"); return; }
  if(!confirm(`"${ROLE_DEFS[roleName].label || roleName}" rolini o'chirasizmi?`)) return;
  delete ROLE_DEFS[roleName];
  saveRoleDefs();
  renderRoleManager();
  toast("Rol o'chirildi");
}

function renderRoleManager(){
  const el = document.getElementById('role-mgr-content');
  if(!el) return;
  let html = '';
  for(const [rName, rDef] of Object.entries(ROLE_DEFS)){
    const isBuiltin = _BUILTIN_ROLES.includes(rName);
    html += `<div class="role-item" style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <input class="form-input" style="font-weight:600;flex:1" value="${esc(rDef.label)}" onchange="renameRoleLabel('${rName}',this.value)" title="Rol nomi"/>
        <span style="font-size:11px;color:var(--muted);font-family:var(--mono)">${esc(rName)}</span>
        ${isBuiltin ? '' : `<button class="btn btn-danger btn-xs" title="Rolni o'chirish" onclick="deleteRole('${rName}')">×</button>`}
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px">`;
    for(const [pKey, pLabel] of Object.entries(PERM_LABELS)){
      const checked = rDef.perms[pKey] ? 'checked' : '';
      // Admin har doim hamma narsaga ega — uni o'zgartirib bo'lmaydi
      const disabled = rName === 'admin' ? 'disabled' : '';
      html += `<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer">
        <input type="checkbox" ${checked} ${disabled} onchange="toggleRolePerm('${rName}','${pKey}',this.checked)"/>
        ${esc(pLabel)}
      </label>`;
    }
    html += `</div></div>`;
  }
  // ── Yangi rol qo'shish formasi ──
  html += `<div style="border:1px dashed var(--border);border-radius:8px;padding:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
    <div style="flex:1;min-width:130px">
      <label class="form-label" style="font-size:11px;margin-bottom:4px">Rol kaliti (lotin harflari)</label>
      <input class="form-input" id="new-role-key" placeholder="masalan: buxgalter"/>
    </div>
    <div style="flex:1;min-width:130px">
      <label class="form-label" style="font-size:11px;margin-bottom:4px">Ko'rinadigan nomi</label>
      <input class="form-input" id="new-role-label" placeholder="masalan: Buxgalter"/>
    </div>
    <button class="btn btn-primary btn-sm" onclick="addRole()">+ Rol qo'shish</button>
  </div>`;
  el.innerHTML = html;
}
