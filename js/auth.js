// ═══════════════════════════════════════════════
// AUTH — Firebase Auth asosida login/register/logout
// ═══════════════════════════════════════════════

const PERM_LABELS = {
  designers:'Dizaynerlar', projects:'Loyihalar', payments:"To'lovlar",
  reports:'Hisobotlar', users:'Foydalanuvchilar', settings:'Sozlamalar'
};

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

// ── AUTH STATE KUZATUVCHI (app.js dan bitta marta chaqiriladi) ──
function setupAuthListener(onLogin, onLogout){
  const auth = getFbAuth();
  if(!auth){ onLogout(); return; }
  auth.onAuthStateChanged(async fbUser => {
    if(fbUser){
      let profile = await getFbUserProfile(fbUser.uid);
      if(!profile){
        // Firestore profilini qayta yaratish (yangi qurilma / yo'qolgan)
        profile = {
          uid: fbUser.uid, email: fbUser.email,
          displayName: fbUser.displayName || fbUser.email.split('@')[0],
          role: 'viewer',
          permissions:{ designers:true, projects:true, payments:false, reports:true, users:false, settings:false },
          createdAt: new Date().toISOString(),
        };
        await saveFbUserProfile(fbUser.uid, profile);
      }
      _currentUser = profile;
      // Foydalanuvchilar ro'yxatini yangilash
      if(profile.role === 'admin'){
        _fbUsersCache = await getAllFbUsers();
      }
      onLogin(profile);
    } else {
      _currentUser = null;
      onLogout();
    }
  });
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
    const first = await isFirstFbUser();
    await fbRegisterUser(email, pass, name, first ? 'admin' : 'viewer');
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
    el.innerHTML = _fbUsersCache.map(u => `
      <div class="user-row" style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div class="user-avatar" style="font-size:12px;width:34px;height:34px;flex-shrink:0">${(u.displayName||u.email).slice(0,2).toUpperCase()}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:13px">${esc(u.displayName||'—')}</div>
          <div style="font-size:11.5px;color:var(--muted)">${esc(u.email)}</div>
        </div>
        <select class="mini-select" onchange="fbChangeRole('${u.uid}',this.value)" ${u.uid===_currentUser?.uid?'disabled title="O\'z rolini o\'zgartirish mumkin emas"':''}>
          <option value="admin"  ${u.role==='admin'  ?'selected':''}>Admin</option>
          <option value="manager"${u.role==='manager'?'selected':''}>Menejer</option>
          <option value="viewer" ${u.role==='viewer' ?'selected':''}>Ko'ruvchi</option>
        </select>
        ${u.uid!==_currentUser?.uid?`<button class="btn btn-danger btn-xs" onclick="fbDeleteUser('${u.uid}','${esc(u.displayName||u.email)}')">×</button>`:''}
      </div>`).join('');
  }catch(e){
    el.innerHTML = `<div style="color:var(--err);font-size:13px;padding:8px">Xatolik: ${esc(e.message)}</div>`;
  }
}

async function fbChangeRole(uid, role){
  try{
    await updateFbUserRole(uid, role);
    toast("Rol o'zgartirildi");
    _fbUsersCache = await getAllFbUsers();
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
