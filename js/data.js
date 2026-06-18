// ═══════════════════════════════════════════════
// DATA — holat, lokal kesh, Firebase Firestore sinxronlash
// Har bir o'zgarish avtomatik localStorage'ga yoziladi.
// Firebase tayyor bo'lsa darhol Firestore'ga ham yoziladi.
// ═══════════════════════════════════════════════

const LS_DATA = 'exon_data';

// Kategoriyalar
const CAT_INFO = {
  A:{label:'A toifa',desc:'Eng yaxshi dizaynerlar',priceRange:[15000,20000],color:'#8b5cf6',cls:'cat-a'},
  B:{label:'B toifa',desc:"O'rtacha dizaynerlar",priceRange:[10000,15000],color:'#0ea5e9',cls:'cat-b'},
  C:{label:'C toifa',desc:'Oddiy dizayn ishlari',priceRange:[7000,12000],color:'#f59e0b',cls:'cat-c'},
};

function catKeys(){ return Object.keys(CAT_INFO); }
// Kategoriyani xavfsiz olish — yo'q bo'lsa standart qaytaradi.
// Render paytida noma'lum kategoriya butun sahifani qulatib yubormasligi uchun.
function catOf(key){
  return CAT_INFO[key] || {label:String(key||'?'),desc:'',priceRange:[10000,15000],color:'#6b7280',cls:'cat-unknown'};
}
function catSlug(k){ const s=String(k).toLowerCase().replace(/[^a-z0-9]/g,''); return 'cat'+(s||Math.random().toString(36).slice(2,6)); }
function firstCat(){ return catKeys()[0]||'A'; }

function refreshCatCls(){
  catKeys().forEach(k=>{ CAT_INFO[k].cls = catSlug(k); });
}

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

function addCategory(key, def){
  key = String(key||'').trim();
  if(!key || CAT_INFO[key]) return false;
  CAT_INFO[key] = {
    label: def.label||key+' toifa', desc: def.desc||'',
    priceRange: def.priceRange||[10000,15000],
    color: def.color||'#16a34a', cls: catSlug(key),
  };
  return true;
}
function updateCategory(key, def){
  if(!CAT_INFO[key]) return;
  Object.assign(CAT_INFO[key], def);
  CAT_INFO[key].cls = catSlug(key);
}
function deleteCategory(key){
  if(catKeys().length<=1) return false;
  if(designers.some(d=>d.category===key) || projects.some(p=>p.category===key)) return 'inuse';
  delete CAT_INFO[key];
  return true;
}

let designers = [];
let projects  = [];
let trashedProjects = [];
let nextDId = 1, nextPId = 1;
let dataSavedAt = null;
let isDirty = false;

function recalcIds(){
  nextDId = designers.length ? Math.max(...designers.map(d=>d.id))+1 : 1;
  nextPId = projects.length  ? Math.max(...projects.map(p=>p.id))+1  : 1;
}

function snapshot(){
  const categories = {};
  catKeys().forEach(k=>{ const c=CAT_INFO[k]; categories[k]={label:c.label,desc:c.desc,priceRange:c.priceRange,color:c.color}; });
  return {
    designers, projects, trashedProjects,
    categories,
    savedAt: new Date().toISOString(),
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
  trashedProjects = trashedProjects.filter(x=>x.id!==id);
}

function applyData(d){
  if(Array.isArray(d.designers)) designers = d.designers;
  if(Array.isArray(d.projects))  projects  = d.projects;
  if(Array.isArray(d.trashedProjects)) trashedProjects = d.trashedProjects;
  if(d.categories && typeof d.categories==='object' && Object.keys(d.categories).length){
    catKeys().forEach(k=>delete CAT_INFO[k]);
    Object.entries(d.categories).forEach(([k,c])=>{
      CAT_INFO[k]={label:c.label||k,desc:c.desc||'',priceRange:c.priceRange||[10000,15000],color:c.color||'#16a34a',cls:catSlug(k)};
    });
  } else if(d.catPrices){
    ['A','B','C'].forEach(c=>{ if(d.catPrices[c]&&CAT_INFO[c]) CAT_INFO[c].priceRange = d.catPrices[c]; });
  }
  applyCategoryStyles();
  dataSavedAt = d.savedAt || null;
  recalcIds();
}

function saveLocal(){
  try{ localStorage.setItem(LS_DATA, JSON.stringify(snapshot())); }catch(e){ console.warn('localStorage:', e); }
}

function loadLocal(){
  const s = localStorage.getItem(LS_DATA);
  if(!s) return false;
  try{ applyData(JSON.parse(s)); return true; }catch(e){ return false; }
}

// ── SINXRONIZATSIYA ──
// Firebase tayyor bo'lsa — Firestore'ga darhol yozadi.
// Tayyor bo'lmasa — faqat lokal saqlanadi.
function persist(){
  saveLocal();
  isDirty = true;
  if(typeof isFbReady === 'function' && isFbReady()){
    setSyncStatus('load', "Saqlanmoqda...");
    fbSave().catch(e => setSyncStatus('err', 'Xato: ' + e.message));
  } else {
    setSyncStatus('dirty', "Lokal saqlandi");
  }
}

// Sync-bar uchun holat ko'rsatgichi
function setSyncStatus(state, msg){
  const dot = document.getElementById('sync-dot');
  const txt = document.getElementById('sync-msg');
  if(!dot||!txt) return;
  dot.className = 'sync-dot ' + (state||'');
  txt.textContent = msg;
}
