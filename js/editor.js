// ═══════════════════════════════════════════════
// EDITOR — Notion uslubidagi loyiha sahifasi (yon panel)
// teglar, boy matn muharriri (sarlavha, rang, jadval,
// havola, ochilib-yopiladigan bloklar, tekislash)
// ═══════════════════════════════════════════════

const byId = id => document.getElementById(id);

let peekProjId = null;   // hozir ochiq loyiha (null = yangi)
let peekTags = [];

// ── TEGLAR ──
const TAG_COLORS = ['#16a34a','#0284c7','#7c3aed','#db2777','#dc2626','#ea580c','#ca8a04','#64748b'];

function tagColor(name){
  let h = 0;
  for(const ch of String(name)) h = (h*31 + ch.charCodeAt(0)) >>> 0;
  return TAG_COLORS[h % TAG_COLORS.length];
}

function tagChipHtml(name, removeIdx = null){
  const c = tagColor(name);
  return `<span class="tag-chip" style="background:color-mix(in srgb,${c} 13%,transparent);color:${c}">${esc(name)}${
    removeIdx !== null ? `<button class="tag-x" tabindex="-1" onclick="removeTag(${removeIdx})">×</button>` : ''
  }</span>`;
}

function renderPeekTags(focus){
  const el = byId('pk-tags');
  if(!el) return;
  el.innerHTML = peekTags.map((t,i)=>tagChipHtml(t,i)).join('') +
    `<input class="tag-inp" id="pk-tag-inp" placeholder="+ teg" onkeydown="tagKey(event)"/>`;
  if(focus) byId('pk-tag-inp').focus();
}

function tagKey(e){
  if(e.key === 'Enter' || e.key === ','){
    e.preventDefault();
    const v = e.target.value.trim().replace(/,+$/,'');
    if(v && !peekTags.includes(v)) peekTags.push(v);
    renderPeekTags(true);
  } else if(e.key === 'Backspace' && !e.target.value && peekTags.length){
    peekTags.pop();
    renderPeekTags(true);
  }
}

function removeTag(i){ peekTags.splice(i,1); renderPeekTags(true); }

// ── XAVFSIZ HTML ──
// Tavsif HTML'i saqlashdan va ko'rsatishdan oldin tozalanadi
function sanitizeHtml(html){
  const t = document.createElement('div');
  t.innerHTML = html || '';
  t.querySelectorAll('script,style,iframe,object,embed,form,meta,link').forEach(n=>n.remove());
  t.querySelectorAll('*').forEach(n=>{
    [...n.attributes].forEach(a=>{
      if(/^on/i.test(a.name)) n.removeAttribute(a.name);
      if((a.name==='href'||a.name==='src') && /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
    });
    if(n.tagName==='A'){ n.setAttribute('target','_blank'); n.setAttribute('rel','noopener'); }
  });
  return t.innerHTML;
}

// ── YON PANEL ──
const PROP_ICONS = {
  user:'<svg viewBox="0 0 16 16"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3.3 2.7-6 6-6s6 2.7 6 6"/></svg>',
  status:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="1.5" fill="currentColor" stroke="none"/></svg>',
  flag:'<svg viewBox="0 0 16 16"><path d="M3.5 14V2.5h8.5l-2 3 2 3H3.5"/></svg>',
  cat:'<svg viewBox="0 0 16 16"><path d="M2 2h5.5l6.5 6.5-5.5 5.5L2 7.5V2z"/><circle cx="5.3" cy="5.3" r="1" fill="currentColor" stroke="none"/></svg>',
  cal:'<svg viewBox="0 0 16 16"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M2 6.5h12M5 1.5v3M11 1.5v3"/></svg>',
  clock:'<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6"/><path d="M8 4.5V8l2.3 2.3"/></svg>',
  hash:'<svg viewBox="0 0 16 16"><path d="M6 2L4.5 14M11.5 2L10 14M2.5 5.5h11M2 10.5h11"/></svg>',
  coin:'<svg viewBox="0 0 16 16"><rect x="1.5" y="4" width="13" height="8.5" rx="1.5"/><circle cx="8" cy="8.2" r="2"/></svg>',
  sum:'<svg viewBox="0 0 16 16"><path d="M12.5 3.5h-9L8 8l-4.5 4.5h9"/></svg>',
  clip:'<svg viewBox="0 0 16 16"><path d="M13 7.5L8.2 12.3a3 3 0 1 1-4.2-4.2L9 3.1a2 2 0 0 1 2.8 2.8L7 10.7a1 1 0 0 1-1.4-1.4l4.3-4.3"/></svg>',
};

function propRow(label, icon, valueHtml){
  return `<div class="prop-row">
    <div class="prop-label">${PROP_ICONS[icon]||''}${label}</div>
    <div class="prop-value">${valueHtml}</div>
  </div>`;
}

function openProjectPeek(id = null, preDesignerId = null){
  if(!designers.length){ toast("Avval dizayner qo'shing"); return; }
  const p = id ? projects.find(x=>x.id===id) : null;
  peekProjId = p ? p.id : null;
  peekTags = [...(p?.tags||[])];
  const defDId = preDesignerId || p?.designerId || designers[0].id;
  const defDesigner = designers.find(d=>d.id===parseInt(defDId));
  const defCat = p?.category || defDesigner?.category || 'B';
  const defPrice = p?.pricePerUnit ?? (CAT_INFO[defCat]?.priceRange[0] || 10000);
  const today = new Date().toISOString().slice(0,10);

  byId('peek-head-title').textContent = p ? 'Loyihani tahrirlash' : 'Yangi loyiha';
  byId('peek-del-btn').style.display = p ? '' : 'none';

  byId('peek-body').innerHTML = `
    <input class="peek-title" id="pk-title" placeholder="Loyiha nomi" value="${esc(p?.title||'')}"/>
    <div class="prop-table">
      ${propRow('Dizayner','user',`<select class="prop-input" id="pk-did" onchange="peekDesignerChange()">${
        designers.map(d=>`<option value="${d.id}"${defDId==d.id?' selected':''}>${esc(d.name)} (${d.category})</option>`).join('')
      }</select>`)}
      ${propRow('Holat','status',`<select class="prop-input" id="pk-status">
        <option value="wip"${(p?.status||'wip')==='wip'?' selected':''}>Jarayonda</option>
        <option value="review"${p?.status==='review'?' selected':''}>Ko'rib chiqilmoqda</option>
        <option value="done"${p?.status==='done'?' selected':''}>Bajarildi</option>
      </select>`)}
      ${propRow('Muhimlik','flag',`<select class="prop-input" id="pk-priority">
        <option value="low"${p?.priority==='low'?' selected':''}>Past</option>
        <option value="medium"${(p?.priority||'medium')==='medium'?' selected':''}>O'rta</option>
        <option value="high"${p?.priority==='high'?' selected':''}>Yuqori</option>
      </select>`)}
      ${propRow('Kategoriya','cat',`<select class="prop-input" id="pk-cat" onchange="peekCatChange()">${
        ['A','B','C'].map(c=>`<option value="${c}"${defCat===c?' selected':''}>${c} — ${CAT_INFO[c].desc}</option>`).join('')
      }</select>`)}
      ${propRow('Boshlangan','cal',`<input type="date" class="prop-input" id="pk-date" value="${p?.date||today}"/>`)}
      ${propRow('Muddat','clock',`<input type="date" class="prop-input" id="pk-deadline" value="${p?.deadline||''}"/>`)}
      ${propRow('Birlik soni','hash',`<input type="number" min="1" class="prop-input" id="pk-units" value="${p?.units||1}" oninput="calcPeekTotal()"/>`)}
      ${propRow("Narx (so'm)",'coin',`<input type="number" min="0" class="prop-input" id="pk-price" value="${defPrice}" oninput="calcPeekTotal()"/>`)}
      ${propRow("Jami to'lov",'sum',`<span class="prop-total" id="pk-total">—</span>`)}
      ${propRow('Teglar','cat',`<div class="tags-wrap" id="pk-tags" onclick="byId('pk-tag-inp')?.focus()"></div>`)}
      ${propRow('Fayllar','clip',`<input class="prop-input" id="pk-files" value="${esc(p?.files?.join(', ')||'')}" placeholder="design.fig, export.zip"/>`)}
    </div>
    <div class="form-hint" id="pk-price-hint" style="margin:2px 0 18px"></div>
    <div class="section-label" style="display:block;margin-bottom:8px">Tavsif</div>
    ${rteToolbarHtml()}
    <div class="rte rich" id="pk-rte" contenteditable="true"
      data-placeholder="Tavsif yozing — sarlavhalar, ro'yxatlar, jadvallar, havolalar uchun yuqoridagi asboblardan foydalaning..."
      onkeyup="rteSaveSel()" onmouseup="rteSaveSel()" onblur="rteSaveSel()"></div>
    ${p ? `<div class="section-label" style="display:block;margin:24px 0 2px">Izohlar</div>${commentBoxHtml(p,'peek')}` : ''}
  `;

  byId('pk-rte').innerHTML = p ? (p.descHtml || (p.description ? '<p>'+esc(p.description)+'</p>' : '')) : '';
  try{ document.execCommand('styleWithCSS', false, true); }catch(e){}
  renderPeekTags(false);
  calcPeekTotal();

  byId('peek-overlay').classList.add('open');
  byId('peek').classList.add('open');
  document.body.style.overflow = 'hidden';
  if(!p) setTimeout(()=>byId('pk-title')?.focus(), 280);
}

// Eski nom bilan chaqiruvlar ham ishlasin
function openProjectModal(id = null, preDesignerId = null){ openProjectPeek(id, preDesignerId); }

function closePeek(){
  byId('peek-overlay').classList.remove('open');
  byId('peek').classList.remove('open');
  document.body.style.overflow = '';
  peekProjId = null;
  savedRange = null;
  if(typeof editingCmt !== 'undefined') editingCmt = null;
}

document.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && byId('peek')?.classList.contains('open')) closePeek();
});

// Rang panelini tashqariga bosilganda yopish
document.addEventListener('click', e=>{
  const pop = byId('rte-colorpop');
  if(pop && pop.classList.contains('open') && !e.target.closest('.rte-colorwrap')) pop.classList.remove('open');
});

function peekDesignerChange(){
  const d = designers.find(x=>x.id===parseInt(byId('pk-did').value));
  if(!d) return;
  byId('pk-cat').value = d.category;
  byId('pk-price').value = CAT_INFO[d.category].priceRange[0];
  calcPeekTotal();
}

function peekCatChange(){
  const ci = CAT_INFO[byId('pk-cat').value];
  if(!ci) return;
  byId('pk-price').value = ci.priceRange[0];
  calcPeekTotal();
}

function calcPeekTotal(){
  const u = parseInt(byId('pk-units')?.value)||0;
  const pr = parseInt(byId('pk-price')?.value)||0;
  if(byId('pk-total')) byId('pk-total').textContent = fmtPrice(u*pr)+" so'm";
  const cat = byId('pk-cat')?.value||'B', ci = CAT_INFO[cat];
  if(byId('pk-price-hint') && ci)
    byId('pk-price-hint').textContent = `${cat} kategoriya uchun tavsiya: ${ci.priceRange[0].toLocaleString()}–${ci.priceRange[1].toLocaleString()} so'm/birlik`;
}

function savePeekProject(){
  const title = byId('pk-title')?.value.trim();
  if(!title){ toast('Loyiha nomini kiriting'); byId('pk-title')?.focus(); return; }
  const ed = byId('pk-rte');
  const plain = ed.innerText.replace(/\s+/g,' ').trim();
  const descHtml = sanitizeHtml(ed.innerHTML);
  const status = byId('pk-status').value;
  const obj = {
    designerId: parseInt(byId('pk-did').value),
    title,
    descHtml: plain ? descHtml : '',
    description: plain.slice(0,3000),
    category: byId('pk-cat').value,
    units: parseInt(byId('pk-units').value)||1,
    pricePerUnit: parseInt(byId('pk-price').value)||0,
    date: byId('pk-date').value || new Date().toISOString().slice(0,10),
    deadline: byId('pk-deadline').value || null,
    status,
    priority: byId('pk-priority').value,
    files: byId('pk-files').value.split(',').map(s=>s.trim()).filter(Boolean),
    tags: [...peekTags],
  };
  if(peekProjId){
    const ex = projects.find(p=>p.id===peekProjId);
    obj.paymentPaid = ex?.paymentPaid||false;
    obj.paymentDate = ex?.paymentDate||null;
    obj.comments = ex?.comments||[];
    obj.doneDate = status==='done' ? (ex?.doneDate||new Date().toISOString().slice(0,10)) : null;
    projects = projects.map(p=>p.id===peekProjId?{...p,...obj}:p);
    toast('Loyiha yangilandi');
  } else {
    obj.paymentPaid=false; obj.paymentDate=null; obj.comments=[];
    obj.doneDate = status==='done' ? new Date().toISOString().slice(0,10) : null;
    projects.push({...obj, id:nextPId++});
    toast("Loyiha qo'shildi");
  }
  closePeek();
  persist();
  rerenderActive();
}

function deleteProjectFromPeek(){
  if(!peekProjId) return;
  if(!confirm("Loyiha o'chirilsinmi?")) return;
  projects = projects.filter(p=>p.id!==peekProjId);
  closePeek();
  persist();
  rerenderActive();
  toast("Loyiha o'chirildi");
}

// ── MATN MUHARRIRI ──
// Asbob bosilganda tanlov yo'qolmasligi uchun saqlanadi
let savedRange = null;

function rteSaveSel(){
  const s = getSelection();
  if(s.rangeCount && byId('pk-rte')?.contains(s.anchorNode)) savedRange = s.getRangeAt(0);
}

function rteRestoreSel(){
  if(!savedRange) return;
  const s = getSelection();
  s.removeAllRanges();
  s.addRange(savedRange);
}

function rte(cmd, val = null){
  const ed = byId('pk-rte');
  if(!ed) return;
  ed.focus();
  rteRestoreSel();
  document.execCommand(cmd, false, val);
  rteSaveSel();
}

function rteBlockSel(sel){ if(sel.value) rte('formatBlock', sel.value); sel.selectedIndex = 0; }
function rteSizeSel(sel){ if(sel.value) rte('fontSize', sel.value); sel.selectedIndex = 0; }

function rteLink(){
  const u = prompt('Havola manzili (URL):', 'https://');
  if(u && u !== 'https://') rte('createLink', u);
}

function rteTable(){
  const row = '<tr>'+'<td><br></td>'.repeat(3)+'</tr>';
  rte('insertHTML', '<table><tbody>'+row.repeat(3)+'</tbody></table><p><br></p>');
}

function rteToggle(){
  rte('insertHTML', '<details open><summary>Sarlavha</summary><div>Matn yozing...</div></details><p><br></p>');
}

const RTE_TEXT_COLORS = ['#8b93a5','#ef4444','#f97316','#eab308','#22c55e','#38bdf8','#a78bfa','#ec4899'];
const RTE_BG_COLORS = ['transparent','rgba(220,38,38,.16)','rgba(234,88,12,.16)','rgba(202,138,4,.18)','rgba(22,163,74,.16)','rgba(2,132,199,.16)','rgba(124,58,237,.14)','rgba(219,39,119,.14)'];

function rteToolbarHtml(){
  const b = (cmd,title,label) =>
    `<button class="rte-btn" title="${title}" onmousedown="event.preventDefault()" onclick="rte('${cmd}')">${label}</button>`;
  const alignL = '<svg viewBox="0 0 16 16"><path d="M2 3h12M2 6.5h8M2 10h12M2 13.5h8"/></svg>';
  const alignC = '<svg viewBox="0 0 16 16"><path d="M2 3h12M4 6.5h8M2 10h12M4 13.5h8"/></svg>';
  const alignR = '<svg viewBox="0 0 16 16"><path d="M2 3h12M6 6.5h8M2 10h12M6 13.5h8"/></svg>';
  const listU = '<svg viewBox="0 0 16 16"><circle cx="2.5" cy="3.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="2.5" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="2.5" cy="12.5" r="1.1" fill="currentColor" stroke="none"/><path d="M5.5 3.5h9M5.5 8h9M5.5 12.5h9"/></svg>';
  const linkI = '<svg viewBox="0 0 16 16"><path d="M6.5 9.5a3 3 0 0 0 4.2 0L13 7.2a3 3 0 1 0-4.2-4.2L7.6 4.2"/><path d="M9.5 6.5a3 3 0 0 0-4.2 0L3 8.8a3 3 0 1 0 4.2 4.2l1.2-1.2"/></svg>';
  const tableI = '<svg viewBox="0 0 16 16"><rect x="1.5" y="2.5" width="13" height="11" rx="1"/><path d="M1.5 6.5h13M1.5 10h13M6 2.5v11M11 2.5v11"/></svg>';
  const toggleI = '<svg viewBox="0 0 16 16"><path d="M5.5 3l5 5-5 5"/></svg>';
  const hrI = '<svg viewBox="0 0 16 16"><path d="M2 8h12"/></svg>';
  return `<div class="rte-bar">
    <select class="rte-select" title="Blok turi" onchange="rteBlockSel(this)">
      <option value="">Stil</option>
      <option value="p">Matn</option>
      <option value="h1">Sarlavha 1</option>
      <option value="h2">Sarlavha 2</option>
      <option value="h3">Sarlavha 3</option>
      <option value="blockquote">Iqtibos</option>
    </select>
    <select class="rte-select" title="Shrift o'lchami" onchange="rteSizeSel(this)">
      <option value="">O'lcham</option>
      <option value="2">Kichik</option>
      <option value="3">Oddiy</option>
      <option value="4">Katta</option>
      <option value="6">Juda katta</option>
    </select>
    <span class="rte-sep"></span>
    ${b('bold','Qalin (Ctrl+B)','<b>B</b>')}
    ${b('italic','Kursiv (Ctrl+I)','<i>I</i>')}
    ${b('underline','Tagiga chizish (Ctrl+U)','<u>U</u>')}
    ${b('strikeThrough','Ustiga chizish','<s>S</s>')}
    <span class="rte-sep"></span>
    <span class="rte-colorwrap">
      <button class="rte-btn" title="Matn va fon rangi" onmousedown="event.preventDefault()" onclick="byId('rte-colorpop').classList.toggle('open')"><span style="border-bottom:3px solid var(--accent);font-weight:700;line-height:1.1">A</span></button>
      <div class="rte-pop" id="rte-colorpop">
        <div class="rte-pop-label">Matn rangi</div>
        <div class="rte-swatches">${RTE_TEXT_COLORS.map(c=>
          `<button class="rte-swatch" style="color:${c}" onmousedown="event.preventDefault()" onclick="rte('foreColor','${c}');byId('rte-colorpop').classList.remove('open')">A</button>`).join('')}</div>
        <div class="rte-pop-label">Fon rangi</div>
        <div class="rte-swatches">${RTE_BG_COLORS.map(c=>
          `<button class="rte-swatch" style="background:${c}" title="${c==='transparent'?'Fonni olib tashlash':''}" onmousedown="event.preventDefault()" onclick="rte('backColor','${c}');byId('rte-colorpop').classList.remove('open')">${c==='transparent'?'×':''}</button>`).join('')}</div>
      </div>
    </span>
    <span class="rte-sep"></span>
    ${b('justifyLeft','Chapdan tekislash',alignL)}
    ${b('justifyCenter',"O'rtadan tekislash",alignC)}
    ${b('justifyRight',"O'ngdan tekislash",alignR)}
    <span class="rte-sep"></span>
    ${b('insertUnorderedList',"Belgili ro'yxat",listU)}
    ${b('insertOrderedList',"Raqamli ro'yxat",'<span style="font-size:11px;font-weight:700">1.</span>')}
    <span class="rte-sep"></span>
    <button class="rte-btn" title="Havola qo'yish" onmousedown="event.preventDefault()" onclick="rteLink()">${linkI}</button>
    <button class="rte-btn" title="Jadval qo'yish (3×3)" onmousedown="event.preventDefault()" onclick="rteTable()">${tableI}</button>
    <button class="rte-btn" title="Ochilib-yopiladigan blok" onmousedown="event.preventDefault()" onclick="rteToggle()">${toggleI}</button>
    <button class="rte-btn" title="Ajratuvchi chiziq" onmousedown="event.preventDefault()" onclick="rte('insertHorizontalRule')">${hrI}</button>
    <span class="rte-sep"></span>
    ${b('removeFormat','Formatni tozalash','<span style="font-size:11px;font-weight:600">Tx</span>')}
  </div>`;
}
