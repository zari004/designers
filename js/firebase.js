// ═══════════════════════════════════════════════
// FIREBASE — init, Firestore, Auth helpers
// SDK: compat v10 (index.html da script teglari orqali yuklangan)
// ═══════════════════════════════════════════════

const FB_CFG_KEY = 'exon_fb_cfg';

// Default config (exon-panel loyihasi)
const FB_DEFAULT_CFG = {
  apiKey: "AIzaSyAwP3MQWJzNs4Fy09BOfqIo1BgOG7ojrMY",
  authDomain: "exon-panel.firebaseapp.com",
  projectId: "exon-panel",
  storageBucket: "exon-panel.firebasestorage.app",
  messagingSenderId: "646003876514",
  appId: "1:646003876514:web:111c48243ae19e0fa6edfb"
};

let _db   = null;
let _auth = null;
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
    // Oflayn kesh (IndexedDB)
    try{
      await _db.enablePersistence({ synchronizeTabs:true });
    }catch(e){
      if(e.code !== 'failed-precondition' && e.code !== 'unimplemented')
        console.warn('Firebase persistence:', e);
    }
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

// ── FIRESTORE: SAQLASH ──
async function fbSave(){
  if(!isFbReady()) return;
  setSyncStatus('load', "Saqlanmoqda...");
  try{
    const data = snapshot();
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

// ── FIRESTORE: YUKLASH (birinchi kirish) ──
async function fbLoad(){
  if(!isFbReady()) return;
  setSyncStatus('load', "Yuklanmoqda...");
  try{
    const snap = await _db.collection('exon').doc('data').get();
    if(!snap.exists){
      // Bo'sh baza — lokal ma'lumotlarni ko'chirib yoz
      if(designers.length || projects.length){
        await fbSave();
        setSyncStatus('ok', "Lokal ma'lumotlar Firebase'ga ko'chirildi");
      } else {
        setSyncStatus('ok', "Firebase tayyor");
      }
      return;
    }
    const data = snap.data();
    if(!dataSavedAt || !data.savedAt || data.savedAt > dataSavedAt){
      applyData(data);
      saveLocal();
      rerenderActive();
    }
    dataSavedAt = data.savedAt || dataSavedAt;
    setSyncStatus('ok', "Yuklandi · " + new Date().toLocaleTimeString('uz'));
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
    rerenderActive();
    dataSavedAt = data.savedAt;
    setSyncStatus('ok', "↻ Yangilandi · " + new Date().toLocaleTimeString('uz'));
  }, err => {
    console.error('onSnapshot xato:', err);
    setSyncStatus('err', "Ulanish uzildi — internet tekshiring");
  });
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
  const role = snap.empty ? 'admin' : 'viewer';
  await _db.collection('users').doc(u.uid).set({
    uid: u.uid, email, displayName, role,
    permissions:{ designers:true, projects:true, payments:false, reports:true, users:false, settings:false },
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
