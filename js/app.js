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
function showPanel(name){
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
  const map={
    'nav-designers':'designers',
    'nav-projects':'projects',
    'nav-settings':'settings',
    'nav-users':'users',
    'nav-reports':'reports',
    'nav-payments':'payments',
  };
  Object.entries(map).forEach(([elId,perm])=>{
    const el=document.getElementById(elId);
    if(!el) return;
    const ok=(user.role==='admin')||!!(user.permissions&&user.permissions[perm]);
    el.style.display=ok?'':'none';
  });
  // Bottom nav huquqlari
  const bmap={
    'bnav-designers':'designers',
    'bnav-projects':'projects',
    'bnav-payments':'payments',
    'bnav-settings':'settings',
  };
  Object.entries(bmap).forEach(([elId,perm])=>{
    const el=document.getElementById(elId);
    if(!el) return;
    const ok=(user.role==='admin')||!!(user.permissions&&user.permissions[perm]);
    el.style.display=ok?'':'none';
  });
}

// ── INIT ──
function initApp(user){
  document.getElementById('login-screen').style.display = 'none';
  const fbSetup = document.getElementById('fb-setup-screen');
  if(fbSetup) fbSetup.style.display = 'none';
  document.getElementById('sidebar').style.visibility='';
  document.querySelector('.main').style.visibility='';
  document.querySelector('.topbar').style.visibility='';
  document.getElementById('sync-bar').style.visibility='';
  const bn=document.getElementById('bottom-nav'); if(bn) bn.style.visibility='';

  const sbu=document.getElementById('sidebar-username');
  if(sbu) sbu.textContent=user.displayName||user.username||user.email||'—';
  const sba=document.getElementById('sidebar-avatar');
  const name=user.displayName||user.username||user.email||'?';
  if(sba) sba.textContent=name.slice(0,2).toUpperCase();

  applyNavPermissions(user);
  updateCounts();
  renderDashboard();
  renderNotifPanel();

  // Firebase real-vaqt sinxronizatsiya
  if(typeof fbSetupRealtimeSync === 'function') fbSetupRealtimeSync();
  if(typeof fbLoad === 'function') fbLoad();
  // AI kalitini Firestore'dan yuklab olish (boshqa qurilmada kiritilgan bo'lsa)
  if(typeof aiSyncKeyFromFirestore === 'function') aiSyncKeyFromFirestore();

  // PWA shortcut uchun signal
  window.dispatchEvent(new Event('exon-ready'));
}

function showAppLogin(){
  document.getElementById('sidebar').style.visibility='hidden';
  document.querySelector('.main').style.visibility='hidden';
  document.querySelector('.topbar').style.visibility='hidden';
  document.getElementById('sync-bar').style.visibility='hidden';
  const bn=document.getElementById('bottom-nav'); if(bn) bn.style.visibility='hidden';
  document.getElementById('login-screen').style.display='';
  const fbSetup = document.getElementById('fb-setup-screen');
  if(fbSetup) fbSetup.style.display = 'none';
}

function showFbSetup(){
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
    const ok = await initFirebase();
    if(!ok){
      // Konfiguratsiya noto'g'ri — sozlash ekranini ko'rsat
      showFbSetup();
      return;
    }
    // Firebase Auth holati kuzatuvchi
    setupAuthListener(
      user => initApp(user),   // kirgan foydalanuvchi
      ()   => showAppLogin()   // chiqish yoki kirilmagan
    );
  } else {
    // Firebase sozlanmagan — sozlash ekranini ko'rsat
    showFbSetup();
  }
})();
