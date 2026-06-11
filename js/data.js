// ═══════════════════════════════════════════════
// DATA — holat, lokal saqlash, GitHub sinxronlash
// Har bir o'zgarish avtomatik localStorage'ga yoziladi.
// Token bo'lsa 4 soniyadan keyin avtomatik GitHub'ga ham yoziladi.
// ═══════════════════════════════════════════════

const REPO_OWNER = 'zari004';
const REPO_NAME  = 'designers';
const DATA_FILE  = 'data.json';
const LS_DATA    = 'exon_data';

// Kategoriyalar — foydalanuvchi o'zi qo'shishi/sozlashi mumkin.
// cls (CSS sinfi) va color avtomatik boshqariladi.
const CAT_INFO = {
  A:{label:'A toifa',desc:'Eng yaxshi dizaynerlar',priceRange:[15000,20000],color:'#8b5cf6',cls:'cat-a'},
  B:{label:'B toifa',desc:"O'rtacha dizaynerlar",priceRange:[10000,15000],color:'#0ea5e9',cls:'cat-b'},
  C:{label:'C toifa',desc:'Oddiy dizayn ishlari',priceRange:[7000,12000],color:'#f59e0b',cls:'cat-c'},
};

function catKeys(){ return Object.keys(CAT_INFO); }
function catSlug(k){ const s=String(k).toLowerCase().replace(/[^a-z0-9]/g,''); return 'cat'+(s||Math.random().toString(36).slice(2,6)); }
function firstCat(){ return catKeys()[0]||'A'; }

// Har bir kategoriya uchun cls qiymatini qayta hisoblash
function refreshCatCls(){
  catKeys().forEach(k=>{ CAT_INFO[k].cls = catSlug(k); });
}

// Kategoriya ranglarini sahifaga joriy etish (dinamik CSS)
function applyCategoryStyles(){
  refreshCatCls();
  let css = '';
  catKeys().forEach(k=>{
    const ci = CAT_INFO[k];
    const s = ci.cls, col = ci.color;
    css += `.${s}{background:color-mix(in srgb,${col} 13%,transparent);color:${col}}`;
    css += `.cat-opt.sel-${s}{border-color:${col};background:color-mix(in srgb,${col} 8%,transparent)}`;
  });
  let st = document.getElementById('dyn-cat-styles');
  if(!st){ st = document.createElement('style'); st.id='dyn-cat-styles'; document.head.appendChild(st); }
  st.textContent = css;
}

// Kategoriya boshqaruvi
function addCategory(key, def){
  key = String(key||'').trim();
  if(!key) return false;
  if(CAT_INFO[key]) return false;
  CAT_INFO[key] = {
    label: def.label||key+' toifa',
    desc: def.desc||'',
    priceRange: def.priceRange||[10000,15000],
    color: def.color||'#16a34a',
    cls: catSlug(key),
  };
  return true;
}
function updateCategory(key, def){
  if(!CAT_INFO[key]) return;
  Object.assign(CAT_INFO[key], def);
  CAT_INFO[key].cls = catSlug(key);
}
function deleteCategory(key){
  if(catKeys().length<=1) return false;            // kamida bitta qolsin
  if(designers.some(d=>d.category===key) || projects.some(p=>p.category===key)) return 'inuse';
  delete CAT_INFO[key];
  return true;
}

let designers = [];
let projects  = [];
let trashedProjects = [];   // o'chirilgan, tiklanishi mumkin
let nextDId = 1, nextPId = 1;
let dataSavedAt = null;   // oxirgi saqlangan vaqt (ISO)
let isDirty = false;      // GitHub'ga yozilmagan o'zgarishlar bormi
let autoSaveTimer = null;

function recalcIds(){
  nextDId = designers.length ? Math.max(...designers.map(d=>d.id))+1 : 1;
  nextPId = projects.length  ? Math.max(...projects.map(p=>p.id))+1  : 1;
}

function snapshot(){
  // Kategoriyalarni to'liq saqlaymiz (custom toifalar ham)
  const categories = {};
  catKeys().forEach(k=>{ const c=CAT_INFO[k]; categories[k]={label:c.label,desc:c.desc,priceRange:c.priceRange,color:c.color}; });
  return {
    designers, projects, trashedProjects,
    categories,
    catPrices:{A:CAT_INFO.A?.priceRange, B:CAT_INFO.B?.priceRange, C:CAT_INFO.C?.priceRange},
    users:getUsers(),
    savedAt:new Date().toISOString(),
  };
}

function trashProject(id){
  const p = projects.find(x=>x.id===id);
  if(!p) return;
  trashedProjects.push({...p, trashedAt: new Date().toISOString()});
  projects = projects.filter(x=>x.id!==id);
}
function restoreProject(id){
  const p = trashedProjects.find(x=>x.id===id);
  if(!p) return;
  const {trashedAt, ...rest} = p;
  projects.push(rest);
  trashedProjects = trashedProjects.filter(x=>x.id!==id);
}
function purgeProject(id){
  // Butunlay o'chirish — Notion arxivini caller tomonidan boshqariladi
  trashedProjects = trashedProjects.filter(x=>x.id!==id);
}

function applyData(d){
  if(Array.isArray(d.designers)) designers = d.designers;
  if(Array.isArray(d.projects))  projects  = d.projects;
  if(Array.isArray(d.trashedProjects)) trashedProjects = d.trashedProjects;
  // Yangi format: to'liq kategoriyalar
  if(d.categories && typeof d.categories==='object' && Object.keys(d.categories).length){
    catKeys().forEach(k=>delete CAT_INFO[k]);
    Object.entries(d.categories).forEach(([k,c])=>{
      CAT_INFO[k]={label:c.label||k,desc:c.desc||'',priceRange:c.priceRange||[10000,15000],color:c.color||'#16a34a',cls:catSlug(k)};
    });
  } else if(d.catPrices){
    // Eski format: faqat narxlar
    ['A','B','C'].forEach(c=>{ if(d.catPrices[c]&&CAT_INFO[c]) CAT_INFO[c].priceRange = d.catPrices[c]; });
  }
  applyCategoryStyles();
  if(Array.isArray(d.users) && d.users.length) saveUsersRaw(d.users);
  dataSavedAt = d.savedAt || null;
  recalcIds();
}

// Lokalga yozish (dirty holatini o'zgartirmaydi)
function saveLocal(){
  try{ localStorage.setItem(LS_DATA, JSON.stringify(snapshot())); }catch(e){ console.warn('localStorage to\'ldi:', e); }
}

function loadLocal(){
  const s = localStorage.getItem(LS_DATA);
  if(!s) return false;
  try{ applyData(JSON.parse(s)); return true; }catch(e){ return false; }
}

// Har bir mutatsiyadan keyin chaqiriladi
function persist(){
  saveLocal();
  isDirty = true;
  const cfg = getSyncCfg();
  if(cfg.enabled){
    setSyncStatus('dirty', "O'zgarishlar bor — avtomatik saqlanadi...");
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(()=>syncSave(true), 4000);
  } else {
    setSyncStatus('dirty', "O'zgarishlar lokal saqlandi (GitHub token kiritilmagan)");
  }
}

// ── GITHUB SYNC ──
function getSyncCfg(){
  const token = localStorage.getItem('gh_token')||'';
  return {token, enabled: !!token};
}

function setSyncStatus(state, msg){
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-msg');
  if(!dot||!txt) return;
  dot.className = 'sync-dot ' + (state||'');
  txt.textContent = msg;
}

async function syncSave(silent){
  const cfg = getSyncCfg();
  if(!cfg.enabled){ showPanel('settings'); toast("Avval GitHub token kiriting (Sozlamalar)"); return; }
  setSyncStatus('load', "GitHub'ga saqlanmoqda...");
  const btn = document.getElementById('btn-save');
  if(btn) btn.disabled = true;
  try{
    const data = snapshot();
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));

    // Joriy SHA (yangilash uchun)
    let sha = '';
    try{
      const r = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_FILE}?t=${Date.now()}`,
        {headers:{Authorization:`Bearer ${cfg.token}`,Accept:'application/vnd.github+json'}});
      if(r.ok){ const j = await r.json(); sha = j.sha||''; }
    }catch(e){}

    const body = {message:`Ma'lumotlar yangilandi — ${new Date().toLocaleString('uz')}`, content};
    if(sha) body.sha = sha;

    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_FILE}`,{
      method:'PUT',
      headers:{Authorization:`Bearer ${cfg.token}`,'Content-Type':'application/json',Accept:'application/vnd.github+json'},
      body: JSON.stringify(body),
    });
    if(!res.ok){ const e = await res.json().catch(()=>({})); throw new Error(e.message||('HTTP '+res.status)); }
    isDirty = false;
    dataSavedAt = data.savedAt;
    setSyncStatus('ok', `Saqlandi · ${new Date().toLocaleTimeString('uz')}`);
    if(!silent) toast("GitHub'ga saqlandi");
  }catch(e){
    setSyncStatus('err', 'Saqlashda xatolik: '+e.message);
    toast('Xatolik: '+e.message);
  }
  if(btn) btn.disabled = false;
}

async function syncLoad(silent){
  const cfg = getSyncCfg();
  setSyncStatus('load', "Yuklanmoqda...");
  const btn = document.getElementById('btn-load');
  if(btn) btn.disabled = true;
  try{
    const headers = {Accept:'application/vnd.github+json'};
    if(cfg.token) headers.Authorization = `Bearer ${cfg.token}`;
    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${DATA_FILE}?t=${Date.now()}`,{headers});
    if(!res.ok){
      if(res.status===404){ setSyncStatus('', "Hali ma'lumot saqlanmagan"); if(btn) btn.disabled=false; return; }
      throw new Error('HTTP '+res.status);
    }
    const j = await res.json();
    const decoded = decodeURIComponent(escape(atob(j.content.replace(/\n/g,''))));
    const data = JSON.parse(decoded);

    // Lokaldagi saqlanmagan o'zgarishlar yangiroq bo'lsa — ustiga yozmaymiz
    if(isDirty && dataSavedAt && data.savedAt && data.savedAt <= dataSavedAt){
      setSyncStatus('dirty', "Lokal o'zgarishlar yangiroq — ↑ Saqlash bosing");
      if(btn) btn.disabled = false;
      return;
    }
    applyData(data);
    saveLocal();
    isDirty = false;
    setSyncStatus('ok', `Yuklandi · ${data.savedAt ? new Date(data.savedAt).toLocaleString('uz') : ''}`);
    rerenderActive();
    if(!silent) toast("Ma'lumotlar yuklandi");
  }catch(e){
    setSyncStatus('err', 'Yuklashda xatolik: '+e.message);
    if(!silent) toast('Xatolik: '+e.message);
  }
  if(btn) btn.disabled = false;
}

function saveTokenFromSettings(){
  const t = document.getElementById('s-token2')?.value?.trim();
  if(!t){ clearToken(); return; }
  localStorage.setItem('gh_token', t);
  setSyncStatus('ok', "Token saqlandi — sinxronlashga tayyor");
  toast("Token saqlandi");
  if(isDirty) syncSave(true);
}

function clearToken(){
  localStorage.removeItem('gh_token');
  const s2 = document.getElementById('s-token2');
  if(s2) s2.value='';
  setSyncStatus('', "Mahalliy rejim");
  toast("Token o'chirildi");
}
