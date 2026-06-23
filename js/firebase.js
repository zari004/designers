// ═══════════════════════════════════════════════
// FIREBASE — init, Firestore, Auth helpers
// SDK: compat v10 (index.html da script teglari orqali yuklangan)
// ═══════════════════════════════════════════════

const FB_CFG_KEY = 'exon_fb_cfg';

// Default config (exon-panel loyihasi)
const FB_DEFAULT_CFG = {
  apiKey: "AIzaSyAwP3MQWJzNs4FyO9BOfqIo1BgOG7ojrMY",
  authDomain: "exon-panel.firebaseapp.com",
  projectId: "exon-panel",
  storageBucket: "exon-panel.firebasestorage.app",
  messagingSenderId: "646003876514",
  appId: "1:646003876514:web:111c48243ae19e0fa6edfb"
};

let _db   = null;
let _auth = null;
let _storage = null;
let _fbReady = false;
let _realtimeUnsub = null;
let _echoTs = null; // o'z yozuvimizning aksini o'tkazib yuborish uchun

// ── KONFIGURATSIYA ──
function getFbConfig(){
  try{
    const stored = JSON.parse(localStorage.getItem(FB_CFG_KEY)||'null');
    return stored || FB_DEFAULT_CFG;
  }catch{ return FB_DEFAULT_CFG; }
}
function hasFbConfig(){
  return true; // Default config har doim mavjud
}
function saveFbConfig(cfg){
  localStorage.setItem(FB_CFG_KEY, JSON.stringify(cfg));
}
function clearFbConfig(){
  localStorage.removeItem(FB_CFG_KEY);
}

// ── FIREBASE ISHGA TUSHIRISH ──
async function initFirebase(){
  if(_fbReady) return true;
  const cfg = getFbConfig();
  if(!cfg?.apiKey){ return false; }
  try{
    if(typeof firebase === 'undefined') return false;
    if(!firebase.apps.length) firebase.initializeApp(cfg);
    _auth = firebase.auth();
    _db   = firebase.firestore();
    try{ if(firebase.storage) _storage = firebase.storage(); }catch(e){ console.warn('Storage init:', e); }
    // IndexedDB oflayn kesh (enablePersistence) BUTUNLAY olib tashlandi.
    // Sabab: synchronizeTabs ba'zi brauzerlarda Firestore ulanishini
    // butunlay qotirib qo'yadi (Auth ishlaydi, lekin .get() abadiy kutadi).
    // Ilova oflayn keshni localStorage orqali o'zi saqlaydi — IndexedDB shart emas.
    _fbReady = true;
    return true;
  }catch(e){
    console.error('Firebase init:', e);
    setSyncStatus('err', 'Firebase xatosi: ' + e.message);
    return false;
  }
}

function isFbReady(){ return _fbReady && !!_db && !!_auth; }
function getDb(){ return _db; }
function getFbAuth(){ return _auth; }

// Firestore uchun ma'lumotni tozalash:
// · undefined, funksiya, Symbol qiymatlarini olib tashlaydi
// · barcha qiymatlarni oddiy (plain) obyekt/massivga aylantiradi
// Bu "Property array contains an invalid nested entity" xatosining oldini oladi.
function _sanitizeForFirestore(data){
  try{ return JSON.parse(JSON.stringify(data)); }
  catch(e){ console.error('sanitize:', e); return data; }
}

// ── FIRESTORE: SAQLASH ──
async function fbSave(){
  if(!isFbReady()) return;
  setSyncStatus('load', "Saqlanmoqda...");
  try{
    const data = _sanitizeForFirestore(snapshot());
    _echoTs = data.savedAt;
    await _db.collection('exon').doc('data').set(data);
    dataSavedAt = data.savedAt;
    isDirty = false;
    setSyncStatus('ok', "Saqlandi · " + new Date().toLocaleTimeString('uz'));
  }catch(e){
    setSyncStatus('err', "Saqlab bo'lmadi: " + e.message);
    console.error('fbSave:', e);
  }
}

// Render'ni xavfsiz chaqirish — xato bo'lsa MATNINI qaytaradi (yutib yubormaydi)
function _safeRender(){
  try{
    if(typeof renderDashboard === 'function') renderDashboard();
    if(typeof rerenderActive === 'function') rerenderActive();
    if(typeof updateCounts === 'function') updateCounts();
    return '';
  }catch(e){
    console.error('render xato:', e);
    return (e && e.message) ? e.message : String(e);
  }
}

// ── FIRESTORE: YUKLASH (birinchi kirish) ──
async function fbLoad(){
  if(!isFbReady()){ setSyncStatus('err', "Firebase tayyor emas"); return; }
  setSyncStatus('load', "Ma'lumot yuklanmoqda…");
  try{
    const snap = await Promise.race([
      _db.collection('exon').doc('data').get(),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('Serverga ulanib bo\'lmadi (timeout)')),6000))
    ]);
    if(!snap.exists){
      if(designers.length || projects.length){
        await fbSave();
        setSyncStatus('ok', "Lokal ma'lumotlar Firebase'ga ko'chirildi");
      } else {
        setSyncStatus('ok', "Firebase tayyor");
      }
      return;
    }
    const data = snap.data();
    const dLen = Array.isArray(data.designers) ? data.designers.length : '—';
    const pLen = Array.isArray(data.projects) ? data.projects.length : '—';
    // Boshlang'ich yuklash: SERVER — haqiqat manbai (boot'da isDirty=false).
    // Saqlanmagan lokal o'zgarish bo'lsa (isDirty) — serverni qo'llamaymiz,
    // lekin baribir xotiradagi holatni ekranga chizamiz.
    if(!isDirty){
      applyData(data);
      saveLocal();
    }
    const renderErr = _safeRender();
    dataSavedAt = data.savedAt || dataSavedAt;
    if(renderErr){
      setSyncStatus('err', "Chizishda xato: " + renderErr);
    } else {
      setSyncStatus('ok', "Yuklandi: " + dLen + " dizayner · " + pLen + " loyiha · " + new Date().toLocaleTimeString('uz') + (typeof APP_VER!=='undefined'?' · '+APP_VER:''));
    }
  }catch(e){
    setSyncStatus('err', "Yuklash xatosi: " + e.message);
    console.error('fbLoad:', e);
  }
}

// ── REAL-VAQT SINXRONIZATSIYA ──
function fbSetupRealtimeSync(){
  if(_realtimeUnsub){ _realtimeUnsub(); _realtimeUnsub=null; }
  if(!isFbReady()) return;
  _realtimeUnsub = _db.collection('exon').doc('data').onSnapshot(snap => {
    if(!snap.exists) return;
    const data = snap.data();
    // O'z yozganimizning aksini o'tkazib yuborish
    if(data.savedAt && data.savedAt === _echoTs) return;
    // Faqat yangiroq ma'lumot kelsa qabul qilish
    if(dataSavedAt && data.savedAt && data.savedAt <= dataSavedAt) return;
    applyData(data);
    saveLocal();
    const re = _safeRender();
    dataSavedAt = data.savedAt;
    if(re){
      setSyncStatus('err', "↻ RENDER xato: " + re);
    } else {
      setSyncStatus('ok', "↻ Yangilandi · " + new Date().toLocaleTimeString('uz'));
    }
  }, err => {
    console.error('onSnapshot xato:', err);
    setSyncStatus('err', "Ulanish uzildi — internet tekshiring");
  });
}

// ── ULASHISH (SHARES) ──
// Ommaviy o'qiladigan "shares" kolleksiyasi. Firestore qoidasiga qarang (README/sozlamalar).
function genShareId(){
  return 's' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4);
}
async function fbCreateShare(payload){
  if(!_db) throw new Error('Firebase tayyor emas');
  const id = genShareId();
  await _db.collection('shares').doc(id).set({
    ...payload,
    createdAt: new Date().toISOString(),
  });
  return id;
}
async function fbLoadShare(id){
  if(!_db) throw new Error('Firebase tayyor emas');
  const snap = await _db.collection('shares').doc(id).get();
  return snap.exists ? snap.data() : null;
}

// ── FIREBASE AUTH HELPERS ──
async function fbSignIn(email, pass){
  if(!isFbReady()) throw new Error('Firebase tayyor emas');
  return (await _auth.signInWithEmailAndPassword(email, pass)).user;
}

async function fbRegisterUser(email, pass, displayName){
  if(!isFbReady()) throw new Error('Firebase tayyor emas');
  // Avval Auth hisob yaratish (shundan keyin foydalanuvchi authenticated bo'ladi)
  const cred = await _auth.createUserWithEmailAndPassword(email, pass);
  const u = cred.user;
  await u.updateProfile({ displayName });
  // Endi authenticated — Firestore'dan birinchi foydalanuvchimi tekshirish
  const snap = await _db.collection('users').limit(1).get();
  const role = snap.empty ? 'admin' : 'pending';
  const perms = snap.empty
    ? { designers:true, projects:true, payments:true, reports:true, users:true, settings:true }
    : { designers:false, projects:false, payments:false, reports:false, users:false, settings:false };
  await _db.collection('users').doc(u.uid).set({
    uid: u.uid, email, displayName, role,
    permissions: perms,
    createdAt: new Date().toISOString(),
  });
  return u;
}

async function fbSignOut(){
  if(_realtimeUnsub){ _realtimeUnsub(); _realtimeUnsub=null; }
  if(_auth) await _auth.signOut();
}

// Firestore'dan foydalanuvchi profilini o'qish
async function getFbUserProfile(uid){
  if(!isFbReady()) return null;
  const snap = await _db.collection('users').doc(uid).get();
  return snap.exists ? snap.data() : null;
}

async function saveFbUserProfile(uid, updates){
  if(!isFbReady()) return;
  await _db.collection('users').doc(uid).set(updates, { merge:true });
}

// Birinchi foydalanuvchimi? (admin roli berish uchun)
async function isFirstFbUser(){
  if(!isFbReady()) return false;
  const snap = await _db.collection('users').limit(1).get();
  return snap.empty;
}

// Barcha foydalanuvchilar (admin panel)
async function getAllFbUsers(){
  if(!isFbReady()) return [];
  const snap = await _db.collection('users').orderBy('createdAt').get();
  return snap.docs.map(d => d.data());
}

async function updateFbUserRole(uid, role){
  if(!isFbReady()) return;
  await _db.collection('users').doc(uid).update({ role });
}

async function updateFbUserPermissions(uid, permissions){
  if(!isFbReady()) return;
  await _db.collection('users').doc(uid).update({ permissions });
}

async function deleteFbUserProfile(uid){
  if(!isFbReady()) return;
  await _db.collection('users').doc(uid).delete();
}

// ── CHAT XABARLARI ──
async function sendChatMessage(msg){
  if(!isFbReady()) throw new Error('Firebase tayyor emas');
  await _db.collection('chatMessages').add(_sanitizeForFirestore(msg));
}

function subscribeChatMessages(designerId, callback){
  if(!isFbReady()) return ()=>{};
  return _db.collection('chatMessages')
    .where('designerId','==',designerId)
    .onSnapshot(snap=>{
      const msgs = snap.docs.map(d=>({id:d.id,...d.data()}));
      callback(msgs);
    }, err=>{
      console.warn('Chat onSnapshot xato:', err);
    });
}

function subscribeAllChatMessages(callback){
  if(!isFbReady()) return ()=>{};
  return _db.collection('chatMessages')
    .orderBy('createdAt')
    .onSnapshot(snap=>{
      const msgs = snap.docs.map(d=>({id:d.id,...d.data()}));
      callback(msgs);
    }, err=>{
      console.warn('Chat onSnapshot xato:', err);
    });
}

// ── LOYIHA RASMLARI (Firebase Storage) ──
function isStorageReady(){ return !!_storage; }

// Faylni Storage'ga yuklaydi, {url, path} qaytaradi
async function fbUploadProjectImage(folder, file){
  if(!_storage) throw new Error('Storage tayyor emas');
  const safe = (file.name||'image').replace(/[^a-zA-Z0-9._-]/g,'_');
  const path = `projectImages/${folder}/${Date.now()}_${Math.random().toString(36).slice(2,7)}_${safe}`;
  const ref = _storage.ref().child(path);
  const snap = await ref.put(file, { contentType: file.type||'image/jpeg' });
  const url = await snap.ref.getDownloadURL();
  return { url, path };
}

async function fbUploadChatImage(designerId, file){
  if(!_storage) throw new Error('Storage tayyor emas');
  const safe = (file.name||'image').replace(/[^a-zA-Z0-9._-]/g,'_');
  const path = `chatMedia/${designerId}/${Date.now()}_${Math.random().toString(36).slice(2,7)}_${safe}`;
  const ref = _storage.ref().child(path);
  const snap = await ref.put(file, { contentType: file.type||'image/jpeg' });
  const url = await snap.ref.getDownloadURL();
  return { url, path };
}

// Storage'dan rasmni o'chiradi
async function fbDeleteStorageFile(path){
  if(!_storage || !path) return;
  try{ await _storage.ref().child(path).delete(); }
  catch(e){ console.warn('Storage delete:', e.message); }
}
