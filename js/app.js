// ═══════════════════════════════════════════════
// APP — mavzu (light/dark), navigatsiya, favicon, init
// ═══════════════════════════════════════════════

// ── MAVZU ──
const SUN_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function currentTheme(){ return document.documentElement.dataset.theme || 'light'; }

function updateThemeBtn(){
  const btn=document.getElementById('theme-btn');
  if(btn) btn.innerHTML = currentTheme()==='dark' ? SUN_ICON : MOON_ICON;
}

function toggleTheme(){
  const next = currentTheme()==='dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('exon_theme', next);
  updateThemeBtn();
}

// Qurilma mavzusi o'zgarsa (foydalanuvchi qo'lda tanlamagan bo'lsa)
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e=>{
  if(!localStorage.getItem('exon_theme')){
    document.documentElement.dataset.theme = e.matches ? 'dark' : 'light';
    updateThemeBtn();
  }
});

// ── PAROL KO'RSATISH TOGGLE ──
function togglePw(btn){
  const inp=btn.parentElement.querySelector('input');
  if(!inp) return;
  const show=inp.type==='password';
  inp.type=show?'text':'password';
  btn.innerHTML=show
    ?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17.9 17.9A10.1 10.1 0 0 1 12 20C5 20 1 12 1 12a18.4 18.4 0 0 1 5.1-5.9M9.9 4.2A9 9 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.2 3.1"/><path d="M1 1l22 22"/><path d="M8.4 8.4a3 3 0 0 0 4.2 4.2"/></svg>'
    :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
}

// ── MODAL ESCAPE ──
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'){
    const m=document.getElementById('modal');
    if(m&&m.style.display!=='none'){typeof closeModal==='function'&&closeModal();return;}
    const np=document.getElementById('notif-panel');
    if(np&&np.classList.contains('open')){typeof toggleNotifPanel==='function'&&toggleNotifPanel();}
  }
});

// ── FAVICON ──
// Ikona shrifti yuklangach, undan favicon chiziladi —
// tab'dagi belgi sahifadagi logo bilan aynan bir xil bo'ladi.
function drawFavicon(){
  try{
    const probe=document.createElement('i');
    probe.className='fi fi-br-pencil-paintbrush';
    probe.style.cssText='position:absolute;left:-9999px;top:-9999px';
    document.body.appendChild(probe);
    const content=getComputedStyle(probe,'::before').content;
    probe.remove();
    const ch=content&&content!=='none'?content.replace(/['"]/g,''):'';
    if(!ch) return;
    document.fonts.load('36px uicons-bold-rounded').then(()=>{
      const c=document.createElement('canvas');
      c.width=c.height=64;
      const x=c.getContext('2d');
      x.beginPath();
      if(x.roundRect) x.roundRect(0,0,64,64,15); else x.rect(0,0,64,64);
      x.fillStyle='#16181d';
      x.fill();
      x.font='36px uicons-bold-rounded';
      x.textAlign='center';
      x.textBaseline='middle';
      x.fillStyle='#ffffff';
      x.fillText(ch,32,35);
      let link=document.querySelector('link[rel="icon"]');
      if(!link){ link=document.createElement('link'); link.rel='icon'; document.head.appendChild(link); }
      link.type='image/png';
      link.href=c.toDataURL('image/png');
    }).catch(()=>{});
  }catch(e){}
}

// ── NAVIGATSIYA ──
let _settingsReturnPanel = null;

function goToSettingsFrom(panel){
  _settingsReturnPanel = panel || null;
  showPanel('settings');
}

function goBackFromSettings(){
  const dest = _settingsReturnPanel || 'dashboard';
  _settingsReturnPanel = null;
  showPanel(dest);
}

function updateNavVisibility(){
  const u = typeof getCurrentUser === 'function' ? getCurrentUser() : null;
  const perms = u?.permissions || {};
  const permMap = {designers:'nav-designers', projects:'nav-projects', payments:'nav-payments', reports:'nav-reports', users:'nav-users', settings:'nav-settings'};
  for(const [pKey, navId] of Object.entries(permMap)){
    const nav = document.getElementById(navId);
    if(nav) nav.style.display = (perms[pKey] || pKey === 'dashboard') ? '' : 'none';
  }
}

function showPanel(name){
  const freePanels = ['dashboard','detail','trash'];
  if(!freePanels.includes(name) && typeof hasPermission === 'function' && typeof getCurrentUser === 'function' && getCurrentUser() && !hasPermission(name)){
    toast(`"${name}" bo'limiga kirish ruxsati yo'q`);
    return;
  }
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.querySelectorAll('.bnav-item').forEach(n=>n.classList.remove('active'));
  const panel=document.getElementById('panel-'+name);
  if(panel) panel.classList.add('active');
  // detail sahifasi "Dizaynerlar" bo'limiga tegishli
  const navName = name==='detail' ? 'designers' : name;
  const nav=document.querySelector(`.nav-item[data-panel="${navName}"]`);
  if(nav) nav.classList.add('active');
  const bnav=document.querySelector(`.bnav-item[data-panel="${navName}"]`);
  if(bnav) bnav.classList.add('active');
  const titles={dashboard:'Asosiy sahifa',designers:'Dizaynerlar',projects:'Loyihalar',trash:'Chiqitdon',detail:'Dizayner profili',payments:"To'lovlar",reports:'Hisobotlar',users:'Foydalanuvchilar',settings:'Sozlamalar'};
  document.getElementById('topbar-title').textContent=titles[name]||'';
  updateTopbar(name);
  const fns={dashboard:renderDashboard,designers:renderDesigners,projects:renderProjects,trash:renderTrash,detail:renderDetail,payments:renderPayments,reports:renderReports,users:renderUsers,settings:renderSettingsPage};
  if(fns[name]) fns[name]();
  updateCounts();
  const main=document.querySelector('.main');
  if(main) main.style.overflow = name==='settings' ? 'hidden' : '';
}

function toggleSidebar(){
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('soverlay').classList.toggle('show');
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('soverlay').classList.remove('show');
}

// Bildirishnoma paneli tashqarisiga bosilsa yopiladi
document.addEventListener('click',e=>{
  const np=document.getElementById('notif-panel');
  if(!np) return;
  if(!np.contains(e.target)&&!e.target.closest('#notif-btn')){
    np.classList.remove('open');
  }
});

// ── HUQUQLAR ──
function applyNavPermissions(user){
  const allNav=['nav-designers','nav-projects','nav-settings','nav-users','nav-reports','nav-payments','nav-trash'];
  const allBnav=['bnav-designers','bnav-projects','bnav-payments','bnav-settings'];

  if(user.role==='_loading'||user.role==='pending'){
    allNav.concat(allBnav).forEach(id=>{const el=document.getElementById(id);if(el)el.style.display='none';});
    document.querySelectorAll('.sidebar-section').forEach(s=>s.style.display='none');
    if(typeof aiSetForRole==='function') aiSetForRole(true); // AI tugmasini yashirish
    return;
  }

  const isDes = user.role==='designer' || user.role==='viewer';
  if(typeof aiSetForRole==='function') aiSetForRole(isDes);
  const map={
    'nav-designers':'designers',
    'nav-projects':'projects',
    'nav-settings':'settings',
    'nav-users':'users',
    'nav-reports':'reports',
    'nav-payments':'payments',
    'nav-trash':'trash',
  };
  Object.entries(map).forEach(([elId,perm])=>{
    const el=document.getElementById(elId);
    if(!el) return;
    if(isDes && (perm==='designers'||perm==='trash'||perm==='users'||perm==='settings'||perm==='reports')){
      el.style.display='none'; return;
    }
    const ok=(user.role==='admin')||!!(user.permissions&&user.permissions[perm]);
    el.style.display=ok?'':'none';
  });
  const bmap={
    'bnav-designers':'designers',
    'bnav-projects':'projects',
    'bnav-payments':'payments',
    'bnav-settings':'settings',
  };
  Object.entries(bmap).forEach(([elId,perm])=>{
    const el=document.getElementById(elId);
    if(!el) return;
    if(isDes && (perm==='designers'||perm==='settings')){
      el.style.display='none'; return;
    }
    const ok=(user.role==='admin')||!!(user.permissions&&user.permissions[perm]);
    el.style.display=ok?'':'none';
  });
  // Ichidagi barcha nav-itemlari yashirilgan bo'limlar (va ularning sarlavhasi)
  // butunlay yashiriladi — dizaynerga "Tizim" kabi bo'sh bo'limlar ko'rinmaydi
  document.querySelectorAll('.sidebar-section').forEach(sec=>{
    const items=sec.querySelectorAll('.nav-item');
    const anyVisible=Array.from(items).some(it=>it.style.display!=='none');
    sec.style.display=anyVisible?'':'none';
  });
}

// ═══════════════════════════════════════════════
// INTEGRATSIYA SOZLAMALARI — qurilmalar bo'ylab sinxron
// Barcha API kalitlari Firestore'da bitta hujjatda saqlanadi.
// Bir qurilmada kiritilsa — login qilgan har qanday qurilmada
// avtomatik ishlaydi (qayta kiritish shart emas).
// ═══════════════════════════════════════════════
const SETTINGS_FIELDS = {
  groqKey:        'exon_groq_key',
  gsSheetId:      'gs_sheet_id',
  gsToken:        'gs_token',
  notionToken:    'notion_token',
  notionParent:   'notion_parent',
  notionProxy:    'notion_proxy',
  aiInstructions: 'exon_ai_instructions',
  roleDefs:       'exon_role_defs',
  tgBotToken:     'tg_bot_token',
  tgProxyUrl:     'tg_proxy_url',
  tgChannels:     'tg_channels',
};

// Bitta sozlamani Firestore'ga yozish (barcha qurilmalarga tarqatadi)
async function saveSettingToFirestore(field, value){
  try{
    if(typeof getDb!=='function' || !getDb()) return;
    await getDb().collection('exon').doc('settings').set({[field]: value||''}, {merge:true});
  }catch(e){ console.warn('Sozlama saqlash xatosi:', field, e); }
}

// Ikki tomonlama sinxronizatsiya:
// · Firestore'da bor, local'da yo'q → local'ga yozish
// · Local'da bor, Firestore'da yo'q  → Firestore'ga yuklash
async function syncSettingsFromFirestore(){
  try{
    if(typeof getDb!=='function' || !getDb()) return;
    const snap=await getDb().collection('exon').doc('settings').get();
    const remote=(snap.exists ? snap.data() : null)||{};
    const toUpload={};
    Object.entries(SETTINGS_FIELDS).forEach(([field, lsKey])=>{
      const local=localStorage.getItem(lsKey)||'';
      const cloud=typeof remote[field]==='string' ? remote[field] : '';
      if(cloud && cloud!==local){
        // Firestore'dagi qiymat bor, local boshqa (yoki bo'sh) → tortib olish
        localStorage.setItem(lsKey, cloud);
      } else if(local && !cloud){
        // Local'da bor lekin Firestore'da yo'q → yuklash
        toUpload[field]=local;
      }
    });
    if(Object.keys(toUpload).length){
      await getDb().collection('exon').doc('settings').set(toUpload,{merge:true});
    }
    // Rollar boshqa qurilmada o'zgargan bo'lsa — xotiradagi ROLE_DEFS'ni yangilash
    try{
      const rd = JSON.parse(localStorage.getItem('exon_role_defs')||'null');
      if(rd && typeof ROLE_DEFS !== 'undefined'){
        Object.keys(ROLE_DEFS).forEach(k=>delete ROLE_DEFS[k]);
        Object.assign(ROLE_DEFS, rd);
        if(!ROLE_DEFS.designer && typeof _DEFAULT_ROLES!=='undefined'){
          ROLE_DEFS.designer = _DEFAULT_ROLES.designer;
          localStorage.setItem('exon_role_defs', JSON.stringify(ROLE_DEFS));
          saveSettingToFirestore('roleDefs', JSON.stringify(ROLE_DEFS));
        }
      }
    }catch(e){ /* noto'g'ri JSON — e'tiborsiz */ }
    // Sozlamalar sahifasi ochiq bo'lsa — maydonlar va belgilarni yangilash
    const sp=document.getElementById('panel-settings');
    if(sp && sp.classList.contains('active') && typeof renderSettingsPage==='function'){
      renderSettingsPage();
    }
  }catch(e){ console.warn('Sozlamalarni yuklash xatosi:', e); }
}

// Karta sarlavhasidagi "Ulangan / Ulanmagan" belgisini yangilash
function setConnBadge(id, connected){
  const b=document.getElementById(id);
  if(!b) return;
  b.style.display='';
  b.textContent = connected ? 'Ulangan' : 'Ulanmagan';
  b.classList.toggle('on', !!connected);
}

// ── INIT ──
function initApp(user){
  document.getElementById('login-screen').style.display = 'none';
  const fbSetup = document.getElementById('fb-setup-screen');
  if(fbSetup) fbSetup.style.display = 'none';

  if(user.role==='_loading'){
    // MUHIM: Yuklanish paytida sidebar/main/topbar YASHIRIN qoladi.
    // Faqat oq overlay ko'rinadi. UI profil yuklangandan keyin _revealApp() orqali ochiladi.
    // Firebase xizmatlari esa ishga tushadi (ma'lumot fondan yuklanadi).
    try{ if(typeof fbSetupRealtimeSync === 'function') fbSetupRealtimeSync(); }catch(e){ console.error('realtime:', e); }
    try{ if(typeof fbLoad === 'function') fbLoad(); }catch(e){ console.error('fbLoad:', e); }
    try{ if(typeof syncSettingsFromFirestore === 'function') syncSettingsFromFirestore(); }catch(e){ console.error('settings:', e); }
    window.dispatchEvent(new Event('exon-ready'));
    return;
  }

  // Haqiqiy rol bilan — to'liq UI ochiladi
  _revealApp(user);
}

function _revealApp(user){
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('sidebar').style.visibility='';
  document.querySelector('.main').style.visibility='';
  document.querySelector('.topbar').style.visibility='';
  document.getElementById('sync-bar').style.visibility='';
  const bn=document.getElementById('bottom-nav'); if(bn) bn.style.visibility='';

  const sbu=document.getElementById('sidebar-username');
  const sba=document.getElementById('sidebar-avatar');
  const sFooter=document.querySelector('.sidebar-footer');
  if(sFooter) sFooter.style.opacity='';
  const name=user.displayName||user.username||user.email||'?';
  if(sbu) sbu.textContent=name;
  if(sba) sba.textContent=name.slice(0,2).toUpperCase();

  try{
    applyNavPermissions(user);
    if(typeof updateNavVisibility === 'function') updateNavVisibility();
    updateCounts();
    renderDashboard();
    renderNotifPanel();
  }catch(e){
    console.error('initApp UI render xato:', e);
    _showFatal('UI: '+e.message);
  }

  // Firebase xizmatlari (agar hali ishga tushmagan bo'lsa)
  try{ if(typeof fbSetupRealtimeSync === 'function') fbSetupRealtimeSync(); }catch(e){ console.error('realtime:', e); }
  try{ if(typeof fbLoad === 'function') fbLoad(); }catch(e){ console.error('fbLoad:', e); _showFatal('fbLoad: '+e.message); }
  try{ if(typeof syncSettingsFromFirestore === 'function') syncSettingsFromFirestore(); }catch(e){ console.error('settings:', e); }

  window.dispatchEvent(new Event('exon-ready'));
}

function showAppLogin(){
  if(typeof _dismissAppLoading==='function') _dismissAppLoading();
  document.getElementById('sidebar').style.visibility='hidden';
  document.querySelector('.main').style.visibility='hidden';
  document.querySelector('.topbar').style.visibility='hidden';
  document.getElementById('sync-bar').style.visibility='hidden';
  const bn=document.getElementById('bottom-nav'); if(bn) bn.style.visibility='hidden';
  document.getElementById('login-screen').style.display='';
  const fbSetup = document.getElementById('fb-setup-screen');
  if(fbSetup) fbSetup.style.display = 'none';
}

function showPendingScreen(){
  document.getElementById('sidebar').style.visibility='hidden';
  document.querySelector('.main').style.visibility='hidden';
  document.querySelector('.topbar').style.visibility='hidden';
  document.getElementById('sync-bar').style.visibility='hidden';
  const bn=document.getElementById('bottom-nav'); if(bn) bn.style.visibility='hidden';
  document.getElementById('login-screen').style.display='none';
  const ps=document.getElementById('pending-approval-screen');
  if(ps) ps.style.display='';
}

function showFbSetup(){
  if(typeof _dismissAppLoading==='function') _dismissAppLoading();
  document.getElementById('sidebar').style.visibility='hidden';
  document.querySelector('.main').style.visibility='hidden';
  document.querySelector('.topbar').style.visibility='hidden';
  document.getElementById('sync-bar').style.visibility='hidden';
  const bn=document.getElementById('bottom-nav'); if(bn) bn.style.visibility='hidden';
  document.getElementById('login-screen').style.display='none';
  const fbSetup = document.getElementById('fb-setup-screen');
  if(fbSetup) fbSetup.style.display='';
}

// ── SAHIFA YUKLANGANDA ──
const APP_VER = 'v113';

// Kutilmagan global xatolarni status barda ko'rsatish — sokin qulashning oldini oladi
function _showFatal(msg){
  const txt=document.getElementById('sync-msg');
  const dot=document.getElementById('sync-dot');
  if(txt) txt.textContent='⚠ '+msg;
  if(dot) dot.className='sync-dot err';
}
window.addEventListener('error', e=>{
  _showFatal((e.message||'xato')+' @'+(e.filename||'').split('/').pop()+':'+(e.lineno||'?'));
});
window.addEventListener('unhandledrejection', e=>{
  const r=e.reason; _showFatal('promise: '+(r?.message||r||'noma\'lum'));
});

loadLocal();
applyCategoryStyles();
updateThemeBtn();
document.fonts.ready.then(drawFavicon);
setTimeout(drawFavicon, 2500);

(async function boot(){
  // Ulashilgan havola (?share=...) — kirmasdan faqat ko'rish rejimi
  const shareId = new URLSearchParams(location.search).get('share');
  if(shareId && typeof bootShareViewer === 'function'){
    await bootShareViewer(shareId);
    return;
  }

  // Firebase konfiguratsiyasi bor bo'lsa — Firebase bilan ishlash
  if(typeof hasFbConfig === 'function' && hasFbConfig()){
    setSyncStatus('load', "Firebase ulanmoqda… ("+APP_VER+")");
    let ok = false;
    try {
      ok = await Promise.race([
        initFirebase(),
        new Promise(resolve => setTimeout(() => resolve(false), 6000))
      ]);
    } catch(e) {
      console.error('Firebase init xato:', e);
    }
    if(!ok){
      setSyncStatus('err', "Firebase ulanmadi — qayta urining");
      showFbSetup();
      return;
    }
    setSyncStatus('load', "Kirish tekshirilmoqda...");
    setupAuthListener(
      user => initApp(user),
      ()   => showAppLogin()
    );
  } else {
    showFbSetup();
  }
})();
