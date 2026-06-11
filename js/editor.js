// ═══════════════════════════════════════════════
// EDITOR — Notion uslubidagi loyiha sahifasi (yon panel)
//  • chegaradan ushlab kengaytiriladigan panel
//  • matnni belgilaganda chiqadigan suzuvchi asboblar paneli
//  • "/" buyruq menyusi (jadval, ro'yxat, sarlavha, ochiladigan blok...)
//  • teglar, izohlar, Notionga yuborish
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

// ── XUSUSIYAT QATORLARI ──
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

// Kategoriya select'ini rangli badge (pill) ko'rinishiga keltiruvchi uslub
function catPillStyle(color){
  const c = color || '#888';
  // Chevron (pastga o'q) rangini ham kategoriya rangiga moslaymiz
  const chevron = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 12 12'><path d='M2 4l4 4 4-4' fill='none' stroke='${encodeURIComponent(c)}' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/></svg>")`;
  return `background-color:color-mix(in srgb,${c} 15%,transparent);color:${c};border:1.5px solid color-mix(in srgb,${c} 45%,transparent);background-image:${chevron};background-repeat:no-repeat;background-position:right 10px center`;
}

// Ikkita xususiyatni yonma-yon ko'rsatish (qator qisqaradi)
function propRow2(l1, ic1, inp1, l2, ic2, inp2){
  return `<div class="prop-row2">
    <div class="prop-half"><div class="prop-label2">${PROP_ICONS[ic1]||''}${l1}</div>${inp1}</div>
    <div class="prop-half"><div class="prop-label2">${PROP_ICONS[ic2]||''}${l2}</div>${inp2}</div>
  </div>`;
}

// ── PANELNI OCHISH ──
function openProjectPeek(id = null, preDesignerId = null){
  if(!designers.length){ toast("Avval dizayner qo'shing"); return; }
  const p = id ? projects.find(x=>x.id===id) : null;
  peekProjId = p ? p.id : null;
  peekTags = [...(p?.tags||[])];
  const defDId = preDesignerId || p?.designerId || designers[0].id;
  const defDesigner = designers.find(d=>d.id===parseInt(defDId));
  let defCat = p?.category || defDesigner?.category || firstCat();
  if(!CAT_INFO[defCat]) defCat = firstCat();
  const defPrice = p?.pricePerUnit ?? (CAT_INFO[defCat]?.priceRange[0] || 10000);
  const today = new Date().toISOString().slice(0,10);

  byId('peek-head-title').textContent = p ? 'Loyihani tahrirlash' : 'Yangi loyiha';
  byId('peek-del-btn').style.display = p ? '' : 'none';

  byId('peek-body').innerHTML = `
    <input class="peek-title" id="pk-title" placeholder="Loyiha nomi" value="${esc(p?.title||'')}"/>
    <div class="prop-table" id="pk-props">
      ${propRow('Dizayner','user',`<select class="prop-input" id="pk-did" onchange="peekDesignerChange()">${
        designers.map(d=>`<option value="${d.id}"${defDId==d.id?' selected':''}>${esc(d.name)} (${esc(d.category)})</option>`).join('')
      }</select>`)}
      ${propRow('Muhimlik','flag',`<select class="prop-input" id="pk-priority">
        <option value="low"${p?.priority==='low'?' selected':''}>Past</option>
        <option value="medium"${(p?.priority||'medium')==='medium'?' selected':''}>O'rta</option>
        <option value="high"${p?.priority==='high'?' selected':''}>Yuqori</option>
      </select>`)}
      ${propRow('Kategoriya','cat',(()=>{
        const ci0=CAT_INFO[defCat]||Object.values(CAT_INFO)[0]||{color:'#888',label:defCat};
        return `<select class="cat-pill-select" id="pk-cat" onchange="peekCatChange()" style="${catPillStyle(ci0.color)}">${
          catKeys().map(c=>`<option value="${esc(c)}"${defCat===c?' selected':''}>${esc(CAT_INFO[c].label||c)}</option>`).join('')
        }</select>`;
      })())}
      ${propRow('Boshlangan','cal',`<input type="date" class="prop-input" id="pk-date" value="${p?.date||today}"/>`)}
      ${propRow('Muddat','clock',`<input type="date" class="prop-input" id="pk-deadline" value="${p?.deadline||''}"/>`)}
      ${propRow('Birlik soni','hash',`<input type="number" min="1" class="prop-input" id="pk-units" value="${p?.units||1}" oninput="calcPeekTotal()"/>`)}
      ${propRow("Narx (so'm)",'coin',`<input type="number" min="0" class="prop-input" id="pk-price" value="${defPrice}" oninput="calcPeekTotal()"/>`)}
      ${propRow("Jami to'lov",'sum',`<span class="prop-total" id="pk-total">—</span>`)}
      ${propRow('Teglar','cat',`<div class="tags-wrap" id="pk-tags" onclick="byId('pk-tag-inp')?.focus()"></div>`)}
      ${propRow('Fayllar','clip',`<input class="prop-input" id="pk-files" value="${esc(p?.files?.join(', ')||'')}" placeholder="design.fig, export.zip"/>`)}
    </div>
    <div class="section-label" style="display:block;margin:18px 0 8px">Tavsif <span class="rte-tip">— matnni belgilang yoki yangi qatorda <b>/</b> bosing</span></div>
    <div class="rte rich" id="pk-rte" contenteditable="true"
      data-placeholder="Bu yerga loyiha tavsifini yozing. Formatlash uchun matnni belgilang. Blok qo'shish uchun yangi qatorda / bosing."
      oninput="rteInput()" onkeydown="rteKeydown(event)" onkeyup="rteSaveSel()" onmouseup="rteSaveSel()"></div>
    ${p ? `<div class="section-label" style="display:block;margin:24px 0 2px">Izohlar</div>${commentBoxHtml(p,'peek')}` : ''}
  `;

  byId('pk-rte').innerHTML = p ? (p.descHtml || (p.description ? '<p>'+esc(p.description)+'</p>' : '')) : '';
  try{ document.execCommand('styleWithCSS', false, true); }catch(e){}
  renderPeekTags(false);
  calcPeekTotal();
  ensureBubble();
  ensureSlash();
  updateNotionBtnLabel(p);

  applyPeekWidth();
  byId('peek-overlay').classList.add('open');
  byId('peek').classList.add('open');
  document.body.style.overflow = 'hidden';
  if(!p) setTimeout(()=>byId('pk-title')?.focus(), 280);
}

// Notion tugmasi yozuvini holatga qarab yangilash
function updateNotionBtnLabel(p){
  const btn = byId('peek-notion-btn');
  if(!btn) return;
  const ic = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><rect x="2" y="1.5" width="12" height="13" rx="1.5"/><path d="M5.5 11V5l5 6V5"/></svg>';
  const published = !!(p && p.notionPageId);
  btn.disabled = false;
  btn.onclick = sendProjectToNotion;
  btn.innerHTML = ic + (published ? ' Notionda yangilash' : ' Notionga yuborish');
  btn.title = published ? 'Notiondagi sahifani yangilash' : 'Loyihani Notionga chop etish';
}

function openProjectModal(id = null, preDesignerId = null){ openProjectPeek(id, preDesignerId); }

function closePeek(){
  hideBubble(); hideSlash();
  byId('peek-overlay').classList.remove('open');
  byId('peek').classList.remove('open');
  document.body.style.overflow = '';
  peekProjId = null;
  savedRange = null;
  if(typeof editingCmt !== 'undefined') editingCmt = null;
}

document.addEventListener('keydown', e=>{
  if(e.key === 'Escape' && byId('peek')?.classList.contains('open')){
    if(byId('rte-slash')?.classList.contains('open')){ hideSlash(); return; }
    closePeek();
  }
});

function peekDesignerChange(){
  const d = designers.find(x=>x.id===parseInt(byId('pk-did').value));
  if(!d || !CAT_INFO[d.category]) return;
  byId('pk-cat').value = d.category;
  byId('pk-price').value = CAT_INFO[d.category].priceRange[0];
  const sel = byId('pk-cat');
  if(sel) sel.style.cssText = catPillStyle(CAT_INFO[d.category].color);
  calcPeekTotal();
}

function peekCatChange(){
  const key = byId('pk-cat').value;
  const ci = CAT_INFO[key];
  if(!ci) return;
  byId('pk-price').value = ci.priceRange[0];
  calcPeekTotal();
  const sel = byId('pk-cat');
  if(sel) sel.style.cssText = catPillStyle(ci.color);
}

function calcPeekTotal(){
  const u = parseInt(byId('pk-units')?.value)||0;
  const pr = parseInt(byId('pk-price')?.value)||0;
  if(byId('pk-total')) byId('pk-total').textContent = fmtPrice(u*pr)+" so'm";
}

function collectPeekProject(){
  const title = byId('pk-title')?.value.trim();
  const ed = byId('pk-rte');
  const plain = ed.innerText.replace(/\s+/g,' ').trim();
  const descHtml = sanitizeHtml(ed.innerHTML);
  // Holat panel ichida ko'rsatilmaydi — kartadan o'zgartiriladi.
  // Mavjud loyihaning holatini saqlaymiz, yangisi uchun "wip".
  const status = byId('pk-status')?.value
    || (peekProjId ? (projects.find(p=>p.id===peekProjId)?.status || 'wip') : 'wip');
  return {
    title,
    designerId: parseInt(byId('pk-did').value),
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
}

function savePeekProject(){
  const obj = collectPeekProject();
  if(!obj.title){ toast('Loyiha nomini kiriting'); byId('pk-title')?.focus(); return; }
  const status = obj.status;
  if(peekProjId){
    const ex = projects.find(p=>p.id===peekProjId);
    obj.paymentPaid = ex?.paymentPaid||false;
    obj.paymentDate = ex?.paymentDate||null;
    obj.comments = ex?.comments||[];
    obj.notionUrl = ex?.notionUrl||null;
    obj.notionPageId = ex?.notionPageId||null;
    obj.doneDate = status==='done' ? (ex?.doneDate||new Date().toISOString().slice(0,10)) : null;
    projects = projects.map(p=>p.id===peekProjId?{...p,...obj}:p);
    toast('Loyiha yangilandi');
  } else {
    obj.paymentPaid=false; obj.paymentDate=null; obj.comments=[];
    obj.doneDate = status==='done' ? new Date().toISOString().slice(0,10) : null;
    obj.id = nextPId++;
    projects.push({...obj});
    peekProjId = obj.id;
    toast("Loyiha qo'shildi");
  }
  closePeek();
  persist();
  rerenderActive();
}

function deleteProjectFromPeek(){
  if(!peekProjId) return;
  if(!confirm("Loyiha chiqitdonga tashlansinmi? Chiqitdondan tiklash mumkin.")) return;
  trashProject(peekProjId);
  closePeek();
  persist();
  rerenderActive();
  toast("Loyiha chiqitdonga tashlandi");
}

// ═══════════════ PANELNI KENGAYTIRISH ═══════════════
function getPeekWidth(){ return parseInt(localStorage.getItem('exon_peek_w'))||820; }
function clampPeekWidth(w){ return Math.max(440, Math.min(window.innerWidth-40, w)); }

function applyPeekWidth(){
  const peek = byId('peek');
  if(!peek) return;
  if(peek.dataset.max==='1'){ peek.style.width = (window.innerWidth-32)+'px'; return; }
  peek.style.width = clampPeekWidth(getPeekWidth())+'px';
}

function startPeekResize(e){
  e.preventDefault();
  const peek = byId('peek');
  peek.dataset.max = '0';
  document.body.style.cursor = 'ew-resize';
  document.body.style.userSelect = 'none';
  peek.style.transition = 'none';
  // Shaffof to'siq qo'shamiz — sichqoncha form elementlari ustida borib ketsa ham glitch bo'lmaydi
  const cover = document.createElement('div');
  cover.id = 'peek-resize-cover';
  cover.style.cssText = 'position:fixed;inset:0;z-index:9999;cursor:ew-resize';
  document.body.appendChild(cover);
  const move = ev=>{
    const x = ev.touches ? ev.touches[0].clientX : ev.clientX;
    const w = clampPeekWidth(window.innerWidth - x);
    peek.style.width = w + 'px';
  };
  const up = ()=>{
    document.removeEventListener('mousemove', move);
    document.removeEventListener('mouseup', up);
    document.removeEventListener('touchmove', move);
    document.removeEventListener('touchend', up);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    peek.style.transition = '';
    document.getElementById('peek-resize-cover')?.remove();
    localStorage.setItem('exon_peek_w', parseInt(peek.style.width)||820);
  };
  document.addEventListener('mousemove', move);
  document.addEventListener('mouseup', up);
  document.addEventListener('touchmove', move, {passive:false});
  document.addEventListener('touchend', up);
}

function toggleMaxPeek(){
  const peek = byId('peek');
  peek.dataset.max = peek.dataset.max==='1' ? '0' : '1';
  applyPeekWidth();
}

window.addEventListener('resize', ()=>{ if(byId('peek')?.classList.contains('open')) applyPeekWidth(); });

// ═══════════════ MATN MUHARRIRI ═══════════════
let savedRange = null;

function rteSaveSel(){
  const s = getSelection();
  if(s.rangeCount && byId('pk-rte')?.contains(s.anchorNode)) savedRange = s.getRangeAt(0);
  scheduleBubble();
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
  try{ document.execCommand(cmd, false, val); }catch(e){}
  rteSaveSel();
  positionBubble();
}

function rteLink(){
  const u = prompt('Havola manzili (URL):', 'https://');
  if(u && u !== 'https://') rte('createLink', u);
}

// ── SUZUVCHI ASBOBLAR PANELI (matn belgilanganda) ──
let bubbleTimer = null;

function ensureBubble(){
  if(byId('rte-bubble')) return;
  const b = document.createElement('div');
  b.id = 'rte-bubble';
  b.className = 'rte-bubble';
  const bn = (cmd,title,label)=>`<button class="bb-btn" title="${title}" onmousedown="event.preventDefault()" onclick="rte('${cmd}')">${label}</button>`;
  const colorWrap = `<span class="bb-colorwrap">
    <button class="bb-btn" title="Rang" onmousedown="event.preventDefault()" onclick="byId('bb-colorpop').classList.toggle('open')"><span style="border-bottom:3px solid var(--accent);font-weight:700">A</span></button>
    <div class="bb-pop" id="bb-colorpop">
      <div class="bb-pop-label">Matn rangi</div>
      <div class="bb-swatches">${RTE_TEXT_COLORS.map(c=>`<button class="bb-swatch" style="color:${c}" onmousedown="event.preventDefault()" onclick="rte('foreColor','${c}');byId('bb-colorpop').classList.remove('open')">A</button>`).join('')}</div>
      <div class="bb-pop-label">Fon</div>
      <div class="bb-swatches">${RTE_BG_COLORS.map(c=>`<button class="bb-swatch" style="background:${c==='transparent'?'var(--card)':c}" onmousedown="event.preventDefault()" onclick="rte('backColor','${c}');byId('bb-colorpop').classList.remove('open')">${c==='transparent'?'×':''}</button>`).join('')}</div>
    </div>
  </span>`;
  b.innerHTML = `
    <button class="bb-btn bb-txt" title="Oddiy matn" onmousedown="event.preventDefault()" onclick="rte('formatBlock','p')">Matn</button>
    <button class="bb-btn bb-txt" title="Sarlavha 1" onmousedown="event.preventDefault()" onclick="rte('formatBlock','h1')">H1</button>
    <button class="bb-btn bb-txt" title="Sarlavha 2" onmousedown="event.preventDefault()" onclick="rte('formatBlock','h2')">H2</button>
    <button class="bb-btn bb-txt" title="Sarlavha 3" onmousedown="event.preventDefault()" onclick="rte('formatBlock','h3')">H3</button>
    <span class="bb-sep"></span>
    ${bn('bold','Qalin','<b>B</b>')}
    ${bn('italic','Kursiv','<i>I</i>')}
    ${bn('underline','Tagiga chizish','<u>U</u>')}
    ${bn('strikeThrough','Ustiga chizish','<s>S</s>')}
    ${colorWrap}
    <button class="bb-btn" title="Havola" onmousedown="event.preventDefault()" onclick="rteLink()"><svg viewBox="0 0 16 16" class="bb-ic"><path d="M6.5 9.5a3 3 0 0 0 4.2 0L13 7.2a3 3 0 1 0-4.2-4.2L7.6 4.2"/><path d="M9.5 6.5a3 3 0 0 0-4.2 0L3 8.8a3 3 0 1 0 4.2 4.2l1.2-1.2"/></svg></button>
    <span class="bb-sep"></span>
    <button class="bb-btn" title="Belgili ro'yxat" onmousedown="event.preventDefault()" onclick="rte('insertUnorderedList')"><svg viewBox="0 0 16 16" class="bb-ic"><circle cx="2.5" cy="3.5" r="1.1" fill="currentColor" stroke="none"/><circle cx="2.5" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="2.5" cy="12.5" r="1.1" fill="currentColor" stroke="none"/><path d="M5.5 3.5h9M5.5 8h9M5.5 12.5h9"/></svg></button>
    <button class="bb-btn" title="Raqamli ro'yxat" onmousedown="event.preventDefault()" onclick="rte('insertOrderedList')"><b style="font-size:11px">1.</b></button>
    ${bn('removeFormat','Formatni tozalash','<span style="font-size:11px">Tx</span>')}
  `;
  document.body.appendChild(b);
}

function scheduleBubble(){
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(positionBubble, 10);
}

function positionBubble(){
  const b = byId('rte-bubble');
  const ed = byId('pk-rte');
  if(!b || !ed) return;
  const s = getSelection();
  if(!s.rangeCount || s.isCollapsed || !ed.contains(s.anchorNode)){ hideBubble(); return; }
  const r = s.getRangeAt(0).getBoundingClientRect();
  if(r.width===0 && r.height===0){ hideBubble(); return; }
  b.classList.add('open');
  const bw = b.offsetWidth, bh = b.offsetHeight;
  let left = r.left + r.width/2 - bw/2;
  left = Math.max(10, Math.min(window.innerWidth - bw - 10, left));
  let top = r.top - bh - 8;
  if(top < 8) top = r.bottom + 8;
  b.style.left = left + 'px';
  b.style.top = top + 'px';
}

function hideBubble(){
  const b = byId('rte-bubble');
  if(b){ b.classList.remove('open'); byId('bb-colorpop')?.classList.remove('open'); }
}

document.addEventListener('selectionchange', ()=>{
  if(byId('peek')?.classList.contains('open')) scheduleBubble();
});
document.addEventListener('scroll', ()=>{ if(byId('rte-bubble')?.classList.contains('open')) positionBubble(); }, true);

// ── "/" BUYRUQ MENYUSI ──
const RTE_TEXT_COLORS = ['#8b93a5','#ef4444','#f97316','#eab308','#22c55e','#38bdf8','#a78bfa','#ec4899'];
const RTE_BG_COLORS = ['transparent','rgba(220,38,38,.16)','rgba(234,88,12,.16)','rgba(202,138,4,.18)','rgba(22,163,74,.16)','rgba(2,132,199,.16)','rgba(124,58,237,.14)','rgba(219,39,119,.14)'];

const SLASH_ITEMS = [
  {k:'text', label:'Matn', desc:'Oddiy paragraf', ic:'¶', run:()=>rte('formatBlock','p')},
  {k:'h1', label:'Sarlavha 1', desc:'Katta sarlavha', ic:'H1', run:()=>rte('formatBlock','h1')},
  {k:'h2', label:'Sarlavha 2', desc:"O'rta sarlavha", ic:'H2', run:()=>rte('formatBlock','h2')},
  {k:'h3', label:'Sarlavha 3', desc:'Kichik sarlavha', ic:'H3', run:()=>rte('formatBlock','h3')},
  {k:'ul', label:"Belgili ro'yxat", desc:'• punktlar', ic:'•', run:()=>rte('insertUnorderedList')},
  {k:'ol', label:"Raqamli ro'yxat", desc:'1. 2. 3.', ic:'1.', run:()=>rte('insertOrderedList')},
  {k:'quote', label:'Iqtibos', desc:'Ajratilgan matn', ic:'❝', run:()=>rte('formatBlock','blockquote')},
  {k:'table', label:'Jadval', desc:'3×3 jadval', ic:'▦', run:()=>rte('insertHTML','<table><tbody>'+('<tr>'+'<td><br></td>'.repeat(3)+'</tr>').repeat(3)+'</tbody></table><p><br></p>')},
  {k:'toggle', label:'Ochiladigan blok', desc:'Yashirinadigan matn', ic:'▸', run:()=>rte('insertHTML','<details open><summary>Sarlavha</summary><div>Matn...</div></details><p><br></p>')},
  {k:'divider', label:'Ajratuvchi chiziq', desc:'Bo\'limlarni ajratish', ic:'—', run:()=>rte('insertHorizontalRule')},
  {k:'page', label:'Varaq', desc:'Notionda yangi child sahifa', ic:'📄', run:()=>rte('insertHTML','<p class="rte-page-ref">📄&nbsp;Yangi sahifa</p><p><br></p>')},
];

let slashStart = null;   // {node, offset}
let slashIdx = 0;

function ensureSlash(){
  if(byId('rte-slash')) return;
  const m = document.createElement('div');
  m.id = 'rte-slash';
  m.className = 'rte-slash';
  document.body.appendChild(m);
}

function rteKeydown(e){
  const menu = byId('rte-slash');
  const open = menu && menu.classList.contains('open');
  if(open){
    const items = currentSlashItems();
    if(e.key==='ArrowDown'){ e.preventDefault(); slashIdx=(slashIdx+1)%items.length; renderSlash(items); return; }
    if(e.key==='ArrowUp'){ e.preventDefault(); slashIdx=(slashIdx-1+items.length)%items.length; renderSlash(items); return; }
    if(e.key==='Enter'){ e.preventDefault(); pickSlash(items[slashIdx]); return; }
    if(e.key==='Escape'){ e.preventDefault(); hideSlash(); return; }
  }
}

function rteInput(){
  // Joriy caret oldidagi matnda "/" borligini tekshirish
  const s = getSelection();
  if(!s.rangeCount){ hideSlash(); return; }
  const node = s.anchorNode;
  if(!node || node.nodeType!==3){ hideSlash(); return; }
  const text = node.textContent.slice(0, s.anchorOffset);
  const m = text.match(/(?:^|\s)\/([^\s/]*)$/);
  if(m){
    slashStart = {node, offset: s.anchorOffset - m[1].length - 1};
    showSlash(m[1]);
  } else {
    hideSlash();
  }
}

function currentSlashItems(){
  const q = (byId('rte-slash')?.dataset.q||'').toLowerCase();
  if(!q) return SLASH_ITEMS;
  return SLASH_ITEMS.filter(it=>it.label.toLowerCase().includes(q)||it.k.includes(q)) ;
}

function showSlash(query){
  const menu = byId('rte-slash');
  menu.dataset.q = query||'';
  const items = currentSlashItems();
  if(!items.length){ hideSlash(); return; }
  slashIdx = 0;
  renderSlash(items);
  menu.classList.add('open');
  // joylashuv — caret yonida
  const s = getSelection();
  const r = s.getRangeAt(0).getBoundingClientRect();
  let top = r.bottom + 6, left = r.left;
  const mh = menu.offsetHeight, mw = menu.offsetWidth;
  if(top + mh > window.innerHeight - 10) top = r.top - mh - 6;
  left = Math.min(left, window.innerWidth - mw - 10);
  menu.style.top = top + 'px';
  menu.style.left = Math.max(10,left) + 'px';
}

function renderSlash(items){
  const menu = byId('rte-slash');
  menu.innerHTML = items.map((it,i)=>`
    <div class="slash-item${i===slashIdx?' sel':''}" onmousedown="event.preventDefault()" onclick="pickSlashByKey('${it.k}')">
      <span class="slash-ic">${it.ic}</span>
      <span><span class="slash-label">${it.label}</span><span class="slash-desc">${it.desc}</span></span>
    </div>`).join('');
}

function pickSlashByKey(k){
  const it = SLASH_ITEMS.find(x=>x.k===k);
  if(it) pickSlash(it);
}

function pickSlash(it){
  if(!it) return;
  // "/query" matnini o'chirish
  if(slashStart && slashStart.node){
    const sel = getSelection();
    const r = document.createRange();
    try{
      r.setStart(slashStart.node, slashStart.offset);
      r.setEnd(sel.anchorNode, sel.anchorOffset);
      sel.removeAllRanges();
      sel.addRange(r);
      document.execCommand('delete');
    }catch(e){}
  }
  rteSaveSel();
  hideSlash();
  it.run();
}

function hideSlash(){
  const m = byId('rte-slash');
  if(m){ m.classList.remove('open'); m.dataset.q=''; }
  slashStart = null;
}
