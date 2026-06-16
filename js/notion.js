// ═══════════════════════════════════════════════
// NOTION — loyihani Notionga chop etish
// Tavsif HTML'i Notion bloklariga aylantiriladi:
// sarlavhalar, ro'yxatlar, iqtibos, jadval, ochiladigan blok,
// qalin/kursiv/rang/havola — tuzilishi saqlangan holda.
// ═══════════════════════════════════════════════

const NOTION_VERSION = '2022-06-28';

function notionCfg(){
  return {
    token: (localStorage.getItem('notion_token')||'').trim(),
    parent: (localStorage.getItem('notion_parent')||'').trim().replace(/-/g,''),
    proxy: (localStorage.getItem('notion_proxy')||'').trim(),
  };
}

let _ntSaveTimer=null;
// Yozayotganda avtomatik saqlash: local darhol, Firestore biroz kechikib
function notionAutoSave(){
  const t = (byId('nt-token')?.value||'').trim();
  const p = (byId('nt-parent')?.value||'').trim();
  const px = (byId('nt-proxy')?.value||'').trim();
  localStorage.setItem('notion_token', t);
  localStorage.setItem('notion_parent', p);
  localStorage.setItem('notion_proxy', px);
  updateNotionStatus();
  clearTimeout(_ntSaveTimer);
  _ntSaveTimer=setTimeout(()=>{
    if(typeof saveSettingToFirestore==='function'){
      saveSettingToFirestore('notionToken', t);
      saveSettingToFirestore('notionParent', p);
      saveSettingToFirestore('notionProxy', px);
    }
  }, 700);
}

// Eski tugma uchun
function saveNotionSettings(){
  notionAutoSave();
  if(typeof saveSettingToFirestore==='function'){
    saveSettingToFirestore('notionToken', (byId('nt-token')?.value||'').trim());
    saveSettingToFirestore('notionParent', (byId('nt-parent')?.value||'').trim());
    saveSettingToFirestore('notionProxy', (byId('nt-proxy')?.value||'').trim());
  }
  toast('Notion sozlamalari saqlandi — barcha qurilmalarda ishlaydi ✓');
}
function clearNotionSettings(){
  ['notion_token','notion_parent','notion_proxy'].forEach(k=>localStorage.removeItem(k));
  ['nt-token','nt-parent','nt-proxy'].forEach(id=>{const e=byId(id);if(e)e.value='';});
  updateNotionStatus();
  if(typeof saveSettingToFirestore==='function'){
    saveSettingToFirestore('notionToken', '');
    saveSettingToFirestore('notionParent', '');
    saveSettingToFirestore('notionProxy', '');
  }
  toast("Notion ulanishi o'chirildi");
}
function updateNotionStatus(){
  const c = notionCfg();
  const connected = !!(c.token && c.parent);
  if(typeof setConnBadge==='function') setConnBadge('nt-status-badge', connected);
  const el = byId('nt-status');
  if(!el) return;
  el.textContent = connected
    ? 'Ulangan — loyihalarni Notionga yuborish mumkin' + (c.proxy?' (proxy orqali)':'')
    : 'Token va ota-sahifa ID kiritilmagan';
  el.style.color = connected ? 'var(--success)' : 'var(--muted)';
}

// ── HTML → NOTION BLOKLARI ──
function notionColorName(css, isBg){
  if(!css) return null;
  const m = css.match(/[\d.]+/g);
  let name = null;
  if(m && m.length>=3){
    const [r,g,b] = m.map(Number);
    const max = Math.max(r,g,b), min = Math.min(r,g,b);
    if(max-min < 45) name = 'gray';                              // kulrang / oqimtir
    else if(r>=g && g>=b && r-b>60 && g>110) name = (g>150?'yellow':'orange'); // sariq/to'q sariq
    else if(r>=g && r>=b) name = (b>=110 ? 'pink' : 'red');      // qizil / pushti
    else if(g>=r && g>=b) name = 'green';                        // yashil
    else name = (r>110 ? 'purple' : 'blue');                    // siyohrang / ko'k
  }
  if(!name) return null;
  return isBg ? name+'_background' : name;
}

function chunkText(s){
  const out=[]; s=s||'';
  if(!s){ return ['']; }
  for(let i=0;i<s.length;i+=1900) out.push(s.slice(i,i+1900));
  return out;
}

function mkRich(text, ann){
  const a = ann||{};
  return chunkText(text).map(t=>{
    const o = {type:'text', text:{content:t}, annotations:{
      bold:!!a.bold, italic:!!a.italic, underline:!!a.underline,
      strikethrough:!!a.strikethrough, code:!!a.code, color:a.color||'default'
    }};
    if(a.link){ o.text.link = {url:a.link}; }
    return o;
  });
}

function inlineRich(node, ann, out){
  if(node.nodeType===3){ if(node.textContent) out.push(...mkRich(node.textContent, ann)); return; }
  if(node.nodeType!==1) return;
  const a = {...ann};
  const tag = node.tagName;
  if(tag==='BR'){ out.push(...mkRich('\n', ann)); return; }
  if(tag==='B'||tag==='STRONG') a.bold=true;
  if(tag==='I'||tag==='EM') a.italic=true;
  if(tag==='U') a.underline=true;
  if(tag==='S'||tag==='STRIKE'||tag==='DEL') a.strikethrough=true;
  if(tag==='CODE') a.code=true;
  if(node.style){
    const col = node.style.color, bg = node.style.backgroundColor;
    const cn = notionColorName(col,false); if(cn) a.color=cn;
    const bn = notionColorName(bg,true); if(bn && bg!=='transparent') a.color=bn;
  }
  if(tag==='A'){ const h=node.getAttribute('href'); if(h && /^https?:/.test(h)) a.link=h; }
  node.childNodes.forEach(ch=>inlineRich(ch,a,out));
}

function richOf(el){
  const out=[]; el.childNodes.forEach(n=>inlineRich(n,{},out));
  return out.length?out:[{type:'text',text:{content:''},annotations:{color:'default'}}];
}

function para(rich){ return {object:'block',type:'paragraph',paragraph:{rich_text:rich}}; }

function blockFromEl(el, blocks){
  if(el.nodeType===3){
    const t=el.textContent.trim();
    if(t) blocks.push(para(mkRich(t)));
    return;
  }
  if(el.nodeType!==1) return;
  const tag = el.tagName;
  switch(tag){
    case 'H1': blocks.push({object:'block',type:'heading_1',heading_1:{rich_text:richOf(el)}}); break;
    case 'H2': blocks.push({object:'block',type:'heading_2',heading_2:{rich_text:richOf(el)}}); break;
    case 'H3': case 'H4': case 'H5': case 'H6':
      blocks.push({object:'block',type:'heading_3',heading_3:{rich_text:richOf(el)}}); break;
    case 'UL': el.querySelectorAll(':scope>li').forEach(li=>
      blocks.push({object:'block',type:'bulleted_list_item',bulleted_list_item:{rich_text:richOf(li)}})); break;
    case 'OL': el.querySelectorAll(':scope>li').forEach(li=>
      blocks.push({object:'block',type:'numbered_list_item',numbered_list_item:{rich_text:richOf(li)}})); break;
    case 'BLOCKQUOTE': blocks.push({object:'block',type:'quote',quote:{rich_text:richOf(el)}}); break;
    case 'HR': blocks.push({object:'block',type:'divider',divider:{}}); break;
    case 'PRE': blocks.push({object:'block',type:'code',code:{rich_text:mkRich(el.innerText),language:'plain text'}}); break;
    case 'DETAILS': {
      const sum = el.querySelector('summary');
      const childEls = [...el.childNodes].filter(n=>!(n.nodeType===1&&n.tagName==='SUMMARY'));
      const kids=[]; childEls.forEach(c=>blockFromEl(c,kids));
      blocks.push({object:'block',type:'toggle',toggle:{
        rich_text: sum?richOf(sum):mkRich('Batafsil'),
        children: kids.slice(0,100)
      }});
      break;
    }
    case 'TABLE': {
      const rows = [...el.querySelectorAll('tr')];
      if(!rows.length) break;
      const width = Math.max(...rows.map(r=>r.children.length));
      const trBlocks = rows.map(r=>{
        const cells=[];
        for(let i=0;i<width;i++){ const td=r.children[i]; cells.push(td?richOf(td):[{type:'text',text:{content:''}}]); }
        return {object:'block',type:'table_row',table_row:{cells}};
      });
      blocks.push({object:'block',type:'table',table:{table_width:width,has_column_header:false,has_row_header:false,children:trBlocks}});
      break;
    }
    case 'P': case 'DIV': {
      // Varaq bloki (.rte-page-ref) → Notionda child_page
      if(el.classList.contains('rte-page-ref')){
        const vid   = el.dataset.vid || '';
        const title = (el.dataset.title || el.innerText.replace('📄','').trim()) || 'Yangi sahifa';
        blocks.push({object:'block',type:'child_page',child_page:{title},_vid:vid});
        break;
      }
      // ichida blok elementlari bo'lsa — ularni alohida ishlash
      const hasBlock = [...el.children].some(c=>/^(H1|H2|H3|UL|OL|TABLE|BLOCKQUOTE|HR|DETAILS|PRE|DIV)$/.test(c.tagName));
      if(hasBlock){ el.childNodes.forEach(c=>blockFromEl(c,blocks)); }
      else { const r=richOf(el); if(r.some(x=>x.text.content.trim())) blocks.push(para(r)); }
      break;
    }
    default: {
      const r=richOf(el);
      if(r.some(x=>x.text.content.trim())) blocks.push(para(r));
    }
  }
}

function htmlToNotionBlocks(html){
  const root = document.createElement('div');
  root.innerHTML = sanitizeHtml(html||'');
  const blocks=[];
  root.childNodes.forEach(n=>blockFromEl(n,blocks));
  return blocks;
}

// _vid va child_page bloklarni tozalash (Notion API qabul qilmaydigan maydonlar)
function notionClean(blocks){
  return blocks
    .filter(b => b.type !== 'child_page')
    .map(b => {
      const c = {...b};
      delete c._vid;
      const inner = c[c.type];
      if(inner && Array.isArray(inner.children)){
        c[c.type] = {...inner, children: notionClean(inner.children)};
      }
      return c;
    });
}

// Ichki varaqlarni (child_page) rekursiv ravishda Notionda yaratish
async function _notionCreateSubPages(parentId, rawBlocks, varaqs, depth){
  if(depth > 6) return;
  const childPageBlocks = rawBlocks.filter(b => b.type === 'child_page');
  for(const cp of childPageBlocks){
    const vid = cp._vid || '';
    const varaq = vid ? (varaqs[vid] || {}) : {};
    const varaqTitle = varaq.title || cp.child_page.title || 'Yangi sahifa';
    const subRaw = htmlToNotionBlocks(varaq.descHtml || '');
    const subBlocks = notionClean(subRaw);
    try{
      const sub = await notionFetch('/pages','POST',{
        parent:{type:'page_id', page_id: parentId},
        properties:{title:{title:[{type:'text',text:{content:varaqTitle}}]}},
        children: subBlocks.slice(0,100),
      });
      for(let i=100; i<subBlocks.length; i+=100){
        await notionFetch(`/blocks/${sub.id}/children`,'PATCH',{children:subBlocks.slice(i,i+100)});
      }
      await _notionCreateSubPages(sub.id, subRaw, varaqs, depth+1);
    }catch(e){ console.warn('Ichki varaq yaratishda xato:', varaqTitle, e.message); }
  }
}

// ── API ──
async function notionFetch(path, method, body){
  const c = notionCfg();
  const base = c.proxy ? c.proxy.replace(/\/$/,'') : 'https://api.notion.com';
  const res = await fetch(base + '/v1' + path, {
    method,
    headers:{
      'Authorization':`Bearer ${c.token}`,
      'Notion-Version':NOTION_VERSION,
      'Content-Type':'application/json',
    },
    body: body?JSON.stringify(body):undefined,
  });
  const j = await res.json().catch(()=>({}));
  if(!res.ok){
    const msg = j.message || ('HTTP '+res.status);
    throw new Error(msg);
  }
  return j;
}

// Ota-element database'mi yoki oddiy sahifami — aniqlash
async function resolveNotionParent(c){
  try{
    const db = await notionFetch('/databases/'+c.parent,'GET');
    // title turidagi xususiyat nomini topish (database'da majburiy)
    let titleProp = 'Name';
    if(db.properties){
      for(const [name,prop] of Object.entries(db.properties)){
        if(prop.type==='title'){ titleProp = name; break; }
      }
    }
    return {kind:'database', parent:{type:'database_id',database_id:c.parent}, titleProp};
  }catch(e){
    // database topilmadi — oddiy sahifa deb hisoblaymiz
    return {kind:'page', parent:{type:'page_id',page_id:c.parent}, titleProp:'title'};
  }
}

async function sendProjectToNotion(){
  const c = notionCfg();
  if(!c.token || !c.parent){
    toast('Avval Notion sozlamalarini kiriting');
    closePeek(); showPanel('settings');
    setTimeout(()=>byId('notion-card')?.scrollIntoView({behavior:'smooth'}),200);
    return;
  }
  // Joriy holatni saqlash
  const data = collectPeekProject();
  if(!data.title){ toast('Loyiha nomini kiriting'); byId('pk-title')?.focus(); return; }
  savePeekProjectSilently(data);

  // Avval shu loyiha Notionga yuborilganmi — sahifa ID sini topish
  const existing = peekProjId ? projects.find(p=>p.id===peekProjId) : null;
  const existingPageId = existing?.notionPageId || null;

  const btn = byId('peek-notion-btn');
  const old = btn ? btn.innerHTML : '';
  if(btn){ btn.disabled=true; btn.innerHTML = existingPageId ? 'Yangilanmoqda...' : 'Yuborilmoqda...'; }
  try{
    const d = designers.find(x=>x.id===data.designerId);
    const allBlocks = buildProjectBlocks(data, d);
    const blocks = notionClean(allBlocks);
    let page, url, updated=false;

    if(existingPageId){
      // ── MAVJUD SAHIFANI YANGILASH ──
      try{
        page = await updateNotionPage(existingPageId, data, d, blocks);
        url = page.url || existing.notionUrl || ('https://notion.so/'+existingPageId.replace(/-/g,''));
        updated = true;
      }catch(e){
        // Sahifa Notionda o'chirilgan bo'lsa — yangisini yaratamiz
        if(/Could not find|not found|404|archived/i.test(e.message)){ page=null; }
        else throw e;
      }
    }

    if(!page){
      // ── YANGI SAHIFA YARATISH ──
      const first = blocks.slice(0,100);
      const pinfo = await resolveNotionParent(c);
      const properties = pinfo.kind==='database'
        ? { [pinfo.titleProp]: { title:[{type:'text',text:{content:data.title}}] } }
        : { title: { title:[{type:'text',text:{content:data.title}}] } };
      page = await notionFetch('/pages','POST',{
        parent: pinfo.parent,
        properties,
        children:first,
      });
      for(let i=100;i<blocks.length;i+=100){
        await notionFetch(`/blocks/${page.id}/children`,'PATCH',{children:blocks.slice(i,i+100)});
      }
      url = page.url || ('https://notion.so/'+page.id.replace(/-/g,''));
    }

    // Varaqlarni rekursiv ravishda yaratish (cheksiz ichiga kirish)
    await _notionCreateSubPages(page.id, allBlocks, data.varaqs || {}, 0);

    if(peekProjId){
      projects = projects.map(p=>p.id===peekProjId?{...p,notionUrl:url,notionPageId:page.id}:p);
      persist();
    }
    toast(updated ? 'Notionda yangilandi ✓' : 'Notionga chop etildi ✓');
    if(btn){ btn.innerHTML='Notionda ochish ↗'; btn.disabled=false; btn.onclick=()=>window.open(url,'_blank'); }
    window.open(url,'_blank');
  }catch(e){
    if(btn){ btn.innerHTML=old; btn.disabled=false; }
    const corsLike = /Failed to fetch|NetworkError|load failed/i.test(e.message);
    toast(corsLike ? 'Notion to\'g\'ridan-to\'g\'ri ulanishni rad etdi — proxy kerak (Sozlamalar)' : ('Notion xatosi: '+e.message));
  }
}

// Mavjud Notion sahifasini yangilash: sarlavha + butun tarkib qayta yoziladi
async function updateNotionPage(pageId, data, d, blocks){
  // 1. Sarlavha xususiyatini topib yangilash
  const pg = await notionFetch('/pages/'+pageId,'GET');
  if(pg.archived || pg.in_trash) throw new Error('archived');
  let titleKey = 'title';
  if(pg.properties){
    for(const [k,v] of Object.entries(pg.properties)){ if(v.type==='title'){ titleKey=k; break; } }
  }
  await notionFetch('/pages/'+pageId,'PATCH',{
    properties:{ [titleKey]:{ title:[{type:'text',text:{content:data.title}}] } }
  });
  // 2. Eski tarkib bloklarini o'chirish
  let cursor = undefined;
  do{
    const q = cursor ? `?start_cursor=${cursor}&page_size=100` : '?page_size=100';
    const kids = await notionFetch('/blocks/'+pageId+'/children'+q,'GET');
    for(const b of (kids.results||[])){
      try{ await notionFetch('/blocks/'+b.id,'DELETE'); }catch(e){}
    }
    cursor = kids.has_more ? kids.next_cursor : undefined;
  } while(cursor);
  // 3. Yangi tarkibni qo'shish
  for(let i=0;i<blocks.length;i+=100){
    await notionFetch('/blocks/'+pageId+'/children','PATCH',{children:blocks.slice(i,i+100)});
  }
  return pg;
}

// Loyiha o'chirilganda Notion sahifasini ham arxivlash (chiqitga tashlash)
async function archiveNotionPage(pageId){
  const c = notionCfg();
  if(!c.token || !pageId) return;
  try{ await notionFetch('/pages/'+pageId,'PATCH',{archived:true}); }catch(e){}
}

// Notion sarlavha + xususiyatlarni kontekst sifatida qo'shadi
function buildProjectBlocks(data, d){
  const blocks=[];
  const meta=[];
  if(d) meta.push(`Dizayner: ${d.name}`);
  meta.push(`Kategoriya: ${data.category}`);
  meta.push(`Holat: ${({wip:'Jarayonda',review:"Ko'rib chiqilmoqda",done:'Bajarildi'})[data.status]||data.status}`);
  meta.push(`Muhimlik: ${({low:'Past',medium:"O'rta",high:'Yuqori'})[data.priority]||data.priority}`);
  if(data.deadline) meta.push(`Muddat: ${data.deadline}`);
  meta.push(`Jami: ${(data.units*data.pricePerUnit).toLocaleString()} so'm (${data.units}×${data.pricePerUnit.toLocaleString()})`);
  blocks.push({object:'block',type:'callout',callout:{
    rich_text:[{type:'text',text:{content:meta.join('  ·  ')}}],
    icon:{type:'emoji',emoji:'📌'}, color:'gray_background'
  }});
  if(data.tags&&data.tags.length){
    blocks.push(para([{type:'text',text:{content:'Teglar: '},annotations:{bold:true,color:'default'}},
      {type:'text',text:{content:data.tags.join(', ')},annotations:{color:'default'}}]));
  }
  blocks.push({object:'block',type:'divider',divider:{}});
  const body = htmlToNotionBlocks(data.descHtml||'');
  blocks.push(...body);
  return blocks;
}

// Notion yuborishdan oldin lokal saqlash (panelni yopmasdan)
function savePeekProjectSilently(data){
  const status = data.status;
  if(peekProjId){
    const ex = projects.find(p=>p.id===peekProjId);
    const obj = {...data,
      paymentPaid: ex?.paymentPaid||false, paymentDate: ex?.paymentDate||null,
      comments: ex?.comments||[], notionUrl: ex?.notionUrl||null, notionPageId: ex?.notionPageId||null,
      doneDate: status==='done' ? (ex?.doneDate||new Date().toISOString().slice(0,10)) : null,
    };
    projects = projects.map(p=>p.id===peekProjId?{...p,...obj}:p);
  } else {
    const obj = {...data, paymentPaid:false, paymentDate:null, comments:[],
      doneDate: status==='done' ? new Date().toISOString().slice(0,10) : null, id: nextPId++};
    projects.push(obj);
    peekProjId = obj.id;
    byId('peek-del-btn').style.display='';
  }
  persist();
}
