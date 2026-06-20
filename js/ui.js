// ═══════════════════════════════════════════════
// UI — render funksiyalari, modallar, yordamchilar
// ═══════════════════════════════════════════════

let currentDesignerId = null;
let catFilter = 'all', projStatusFilter = 'all';
let photoData = {};

// ── YORDAMCHILAR ──
function esc(s){ return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function fmtPrice(n){
  n = n||0;
  if(n>=1000000) return (n/1000000).toFixed(1).replace(/\.0$/,'')+'M';
  return n.toLocaleString('uz');
}

function toast(msg){
  const el = document.createElement('div');
  el.className='toast'; el.textContent=msg;
  document.body.appendChild(el);
  setTimeout(()=>{ el.style.animation='toastOut .25s ease forwards'; setTimeout(()=>el.remove(),250); },2600);
}

function photoAvatar(d,size){
  const r = size>40?10:6;
  if(d.photo) return `<div style="width:${size}px;height:${size}px;border-radius:${r}px;overflow:hidden;flex-shrink:0;border:1px solid var(--border)"><img src="${d.photo}" style="width:100%;height:100%;object-fit:cover"/></div>`;
  const initials = d.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  return `<div style="width:${size}px;height:${size}px;border-radius:${r}px;background:var(--accent-soft);color:var(--accent-text);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.36)}px;font-weight:700;flex-shrink:0">${initials}</div>`;
}

function statusBadge(s){
  const map={active:'s-active',idle:'s-idle',away:'s-away'};
  const dot={active:'var(--success)',idle:'var(--warning)',away:'var(--error)'};
  const labels={active:'Faol',idle:"Bo'sh",away:'Uzoqda'};
  return `<span class="status ${map[s]||'s-idle'}"><span class="status-dot-sm" style="background:${dot[s]||'var(--muted)'}"></span>${labels[s]||s}</span>`;
}

function projStatusBadge(s){
  const map={wip:'s-wip',review:'s-review',done:'s-done'};
  const labels={wip:'Jarayonda',review:"Ko'rib chiqilmoqda",done:'Bajarildi'};
  return `<span class="status ${map[s]||'s-draft'}">${labels[s]||s}</span>`;
}

function deadlineDays(dl){
  if(!dl) return null;
  const now=new Date(); now.setHours(0,0,0,0);
  const d=new Date(dl); d.setHours(0,0,0,0);
  return Math.round((d-now)/(1000*60*60*24));
}

function deadlineBadge(p){
  if(p.status==='done'||!p.deadline) return '';
  const days=deadlineDays(p.deadline);
  if(days<0)  return `<span class="status s-away">${Math.abs(days)} kun o'tdi</span>`;
  if(days===0)return `<span class="status s-away">Bugun!</span>`;
  if(days<=3) return `<span class="status s-idle">${days} kun qoldi</span>`;
  return `<span class="status s-draft">${days} kun qoldi</span>`;
}

function applyOverduePenalties(){
  let changed=false;
  projects.forEach(p=>{
    if(p.status!=='done'&&p.deadline&&deadlineDays(p.deadline)<0&&!p.penaltyApplied){
      p.originalPricePerUnit=p.pricePerUnit;
      p.pricePerUnit=Math.round(p.pricePerUnit*0.7);
      p.penaltyApplied=true;
      changed=true;
    }
  });
  if(changed) persist();
}

function priorityBadge(pr){
  if(!pr) return '';
  const map={
    high:`<span class="status s-away"><span class="status-dot-sm" style="background:var(--error)"></span>Yuqori</span>`,
    medium:`<span class="status s-idle"><span class="status-dot-sm" style="background:var(--warning)"></span>O'rta</span>`,
    low:`<span class="status s-draft"><span class="status-dot-sm" style="background:var(--muted2)"></span>Past</span>`,
  };
  return map[pr]||'';
}

const _COPY_IC=`<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="5" width="9" height="9" rx="1.5"/><path d="M3 11H2a1 1 0 0 1-1-1V2a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v1"/></svg>`;

function copyField(btn){
  const text=btn?.dataset?.copy||''; if(!text||text==='—') return;
  const done=()=>{ btn.classList.add('copy-ok'); setTimeout(()=>btn.classList.remove('copy-ok'),1200); toast('Nusxalandi ✓'); };
  if(navigator.clipboard){ navigator.clipboard.writeText(text).then(done).catch(()=>_clipFallback(text,done)); }
  else _clipFallback(text,done);
}
function _clipFallback(t,cb){ const a=document.createElement('textarea'); a.value=t; a.style.cssText='position:fixed;opacity:0'; document.body.appendChild(a); a.select(); try{document.execCommand('copy');cb();}catch(e){} document.body.removeChild(a); }
function _cpBtn(val){ return `<button class="copy-btn" data-copy="${esc(val)}" onclick="event.stopPropagation();copyField(this)" title="Nusxalash">${_COPY_IC}</button>`; }

function maskCard(c){ if(!c) return '—'; return c.replace(/(\d{4})\s?(\d{4})\s?(\d{4})\s?(\d{4})/,'$1 •••• •••• $4'); }

// Faol panelni qayta chizish
function rerenderActive(){
  const active = document.querySelector('.panel.active')?.id?.replace('panel-','');
  const fns = {dashboard:renderDashboard,designers:renderDesigners,projects:renderProjects,trash:renderTrash,detail:renderDetail,payments:renderPayments,reports:renderReports,users:renderUsers,settings:renderSettingsPage};
  if(fns[active]) fns[active]();
  updateCounts();
}

function updateCounts(){
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  const vp=_visibleProjects();
  set('nav-count-d', _visibleDesigners().length);
  set('nav-count-p', vp.length);
  set('nav-count-trash', trashedProjects.length);
  set('nav-count-pay', vp.filter(p=>p.status==='done').length);
  set('nav-count-u', getUsers().length);
  renderNotifPanel();
}

function updateTopbar(name){
  const tr = document.getElementById('topbar-right-badges');
  if(!tr) return;
  tr.innerHTML='';
  if(name==='designers'){
    const a=designers.filter(d=>d.status==='active').length;
    tr.innerHTML=`<span class="badge badge-green">${a} faol</span>`;
  }
  if(name==='projects'){
    const wip=projects.filter(p=>p.status==='wip').length;
    const overdue=projects.filter(p=>p.status!=='done'&&p.deadline&&deadlineDays(p.deadline)<0).length;
    if(overdue>0) tr.innerHTML+=`<span class="badge badge-red">${overdue} muddati o'tdi</span>`;
    if(wip>0) tr.innerHTML+=`<span class="badge badge-blue">${wip} jarayonda</span>`;
  }
  if(name==='payments'){
    const total=projects.filter(p=>p.status==='done').reduce((s,p)=>s+p.units*p.pricePerUnit,0);
    tr.innerHTML=`<span class="badge badge-green">Jami: ${fmtPrice(total)} so'm</span>`;
  }
  if(name==='users'){
    tr.innerHTML=`<span class="badge badge-blue">${getUsers().length} foydalanuvchi</span>`;
  }
}

// ═══════════════ DASHBOARD ═══════════════
function _visibleDesigners(){
  if(typeof isDesignerRole==='function' && isDesignerRole()){
    const my = typeof getMyDesigner==='function' ? getMyDesigner() : null;
    return my ? [my] : [];
  }
  return designers;
}
function _visibleProjects(){
  if(typeof isDesignerRole==='function' && isDesignerRole()){
    const did = typeof getMyDesignerId==='function' ? getMyDesignerId() : null;
    return did ? projects.filter(p=>p.designerId===did) : [];
  }
  return projects;
}

function _isLoading(){ return _currentUser?.role === '_loading' || (typeof getCurrentUser==='function' && getCurrentUser()?.role === '_loading'); }

function renderDashboard(){
  if(_isLoading()) return _renderSkeletonDashboard();
  applyOverduePenalties();
  if(typeof isDesignerRole==='function' && isDesignerRole()) return _renderDesignerDashboard();
  const vd = _visibleDesigners();
  const vp = _visibleProjects();
  document.getElementById('st-active').textContent = vd.filter(d=>d.status==='active').length;
  document.getElementById('st-total').textContent = vd.length;
  document.getElementById('st-wip').textContent = vp.filter(p=>p.status==='wip').length;
  const total = vp.filter(p=>p.status==='done').reduce((s,p)=>s+p.units*p.pricePerUnit,0);
  document.getElementById('st-budget').textContent = fmtPrice(total);

  const dd = document.getElementById('dash-designers');
  dd.innerHTML = vd.length ? vd.map(d=>`
    <div class="table-row" style="grid-template-columns:1fr auto auto;cursor:pointer" onclick="openDetail(${d.id})">
      <div style="display:flex;align-items:center;gap:10px">
        ${photoAvatar(d,32)}
        <div>
          <div style="font-size:13px;font-weight:600">${esc(d.name)}</div>
          <div style="font-size:11.5px;color:var(--muted)">${esc(d.role)}</div>
        </div>
      </div>
      <span class="d-cat-badge ${catOf(d.category).cls}">${d.category}</span>
      ${statusBadge(d.status)}
    </div>`).join('') : '<div class="empty">Hali dizayner qo\'shilmagan</div>';

  const overdue=vp.filter(p=>p.status!=='done'&&p.deadline&&deadlineDays(p.deadline)<=3);
  const dashAlerts=document.getElementById('dash-alerts');
  if(dashAlerts){
    dashAlerts.innerHTML = overdue.length ? `<div class="card" style="border-color:color-mix(in srgb,var(--error) 35%,transparent);padding:14px 18px;margin-bottom:16px">
      <div style="font-size:12.5px;font-weight:700;color:var(--error);margin-bottom:8px">Diqqat — ${overdue.length} ta loyiha muddati yaqin yoki o'tgan</div>
      ${overdue.map(p=>{const d=designers.find(x=>x.id===p.designerId);const days=deadlineDays(p.deadline);
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;cursor:pointer" onclick="openProjectPeek(${p.id})">
          <span style="font-size:12.5px;font-weight:600;flex:1;min-width:160px">${esc(p.title)}</span>
          <span style="font-size:11.5px;color:var(--muted)">${esc(d?.name||'')}</span>
          ${days<0?`<span class="status s-away">${Math.abs(days)} kun o'tdi</span>`:days===0?`<span class="status s-away">Bugun!</span>`:`<span class="status s-idle">${days} kun qoldi</span>`}
        </div>${p.penaltyApplied?`<div style="font-size:11px;color:var(--error);margin-bottom:6px;padding-left:4px">Kechiktirilgani uchun loyiha summasi 30% ga kamaydi: ${fmtPrice(p.originalPricePerUnit*p.units)} → ${fmtPrice(p.pricePerUnit*p.units)} so'm</div>`:''}`;}).join('')}
    </div>` : '';
  }

  const recent=[...vp].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,6);
  document.getElementById('dash-projects').innerHTML = recent.length ? recent.map(p=>{
    const d=designers.find(x=>x.id===p.designerId);
    return `<div class="table-row" style="grid-template-columns:1fr auto;cursor:pointer" onclick="openProjectPeek(${p.id})">
      <div>
        <div style="font-size:12.5px;font-weight:600;margin-bottom:2px">${esc(p.title)}</div>
        <div style="font-size:11.5px;color:var(--muted)">${esc(d?.name||'')} · ${p.date}${p.deadline?' · muddat: '+p.deadline:''}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        ${projStatusBadge(p.status)}
        <span class="price-tag">${fmtPrice(p.units*p.pricePerUnit)} so'm</span>
      </div>
    </div>`;
  }).join('') : '<div class="empty">Hali loyiha yo\'q</div>';
}

// ═══════════════ DIZAYNER SHAXSIY DASHBOARD ═══════════════
function _renderDesignerDashboard(){
  applyOverduePenalties();
  const panel=document.getElementById('panel-dashboard');
  if(!panel) return;
  const d=typeof getMyDesigner==='function' ? getMyDesigner() : null;
  const myProjs=typeof getMyProjects==='function' ? getMyProjects() : [];
  const done=myProjs.filter(p=>p.status==='done');
  const wip=myProjs.filter(p=>p.status==='wip');
  const review=myProjs.filter(p=>p.status==='review');
  const totalEarned=done.reduce((s,p)=>s+p.units*p.pricePerUnit,0);
  const totalUnits=done.reduce((s,p)=>s+p.units,0);
  const overdue=myProjs.filter(p=>p.status!=='done'&&p.deadline&&deadlineDays(p.deadline)<0);

  const ci=d?catOf(d.category):{color:'var(--accent)',cls:''};
  const avatarHtml=d?(d.photo?`<img src="${d.photo}"/>`:esc(d.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase())):'?';

  const months=_desMonthlyChart(myProjs);

  panel.innerHTML=`
    <div class="des-hero">
      <div class="des-avatar" style="background:${ci.color}">${avatarHtml}</div>
      <div>
        <div class="des-hello">Salom, ${esc(d?.name?.split(' ')[0]||'Dizayner')}!</div>
        <div class="des-role">${esc(d?.role||'')} ${d?'· '+d.category+' kategoriya':''} ${d?.telegram?'· '+esc(d.telegram):''}</div>
      </div>
    </div>

    <div class="des-stats">
      <div class="des-stat-card"><div class="des-stat-val" style="color:var(--success)">${done.length}</div><div class="des-stat-lbl">Bajarilgan</div></div>
      <div class="des-stat-card"><div class="des-stat-val" style="color:var(--accent2)">${wip.length}</div><div class="des-stat-lbl">Jarayonda</div></div>
      <div class="des-stat-card"><div class="des-stat-val" style="color:var(--accent-text)">${fmtPrice(totalEarned)}</div><div class="des-stat-lbl">Jami to'lov (so'm)</div></div>
      <div class="des-stat-card"><div class="des-stat-val">${totalUnits}</div><div class="des-stat-lbl">Jami birlik</div></div>
    </div>

    ${overdue.length?`<div class="card" style="border-color:color-mix(in srgb,var(--error) 35%,transparent);padding:14px 18px;margin-bottom:20px">
      <div style="font-size:12.5px;font-weight:700;color:var(--error);margin-bottom:8px">Diqqat — ${overdue.length} ta loyiha muddati o'tgan</div>
      ${overdue.map(p=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;cursor:pointer" onclick="openProjectPeek(${p.id})">
        <span style="font-size:12.5px;font-weight:600;flex:1">${esc(p.title)}</span>
        <span class="status s-away">${Math.abs(deadlineDays(p.deadline))} kun o'tdi</span>
      </div>${p.penaltyApplied?`<div style="font-size:11px;color:var(--error);margin-bottom:6px;padding-left:4px">Kechiktirilgani uchun loyiha summasi 30% ga kamaydi: ${fmtPrice(p.originalPricePerUnit*p.units)} → ${fmtPrice(p.pricePerUnit*p.units)} so'm</div>`:''}`).join('')}
    </div>`:''}

    <div class="des-chart-wrap">
      <div class="des-chart-title">Oxirgi 6 oy faoliyati</div>
      ${months}
    </div>

    <div style="font-size:14px;font-weight:700;margin-bottom:14px">Loyihalarim</div>
    ${_renderKanban(wip,review,done)}
  `;
}

function _renderSkeletonDashboard(){
  const panel=document.getElementById('panel-dashboard');
  if(!panel) return;
  const sk=(w,h,r)=>`<div class="skel" style="width:${w};height:${h}px;border-radius:${r||8}px"></div>`;
  panel.innerHTML=`
    <div style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
      ${sk('56px',56,28)}
      <div style="flex:1">${sk('180px',18)}${sk('120px',13)}</div>
    </div>
    <div class="stat-grid">
      <div class="stat-card">${sk('50px',28)}${sk('90px',12)}</div>
      <div class="stat-card">${sk('50px',28)}${sk('90px',12)}</div>
      <div class="stat-card">${sk('80px',28)}${sk('90px',12)}</div>
    </div>
    <div class="card" style="margin-top:20px;padding:18px">
      ${sk('140px',14)}
      <div style="margin-top:14px">${sk('100%',10)}${sk('100%',10)}${sk('100%',10)}${sk('60%',10)}</div>
    </div>
    <div class="card" style="margin-top:14px;padding:18px">
      ${sk('120px',14)}
      <div style="margin-top:12px">
        ${[1,2,3].map(()=>`<div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">${sk('32px',32,16)}<div style="flex:1">${sk('60%',13)}${sk('40%',10)}</div>${sk('60px',20,10)}</div>`).join('')}
      </div>
    </div>
  `;
}

function _desMonthlyChart(projs){
  const now=new Date();
  const bars=[];
  for(let i=5;i>=0;i--){
    const m=new Date(now.getFullYear(),now.getMonth()-i,1);
    const label=m.toLocaleString('uz',{month:'short'});
    const cnt=projs.filter(p=>{
      const pd=new Date(p.doneDate||p.date);
      return pd.getMonth()===m.getMonth()&&pd.getFullYear()===m.getFullYear()&&p.status==='done';
    }).length;
    bars.push({label,cnt});
  }
  const max=Math.max(1,...bars.map(b=>b.cnt));
  return bars.map(b=>`<div class="des-bar-row">
    <span class="des-bar-label">${b.label}</span>
    <div class="des-bar-track"><div class="des-bar-fill" style="width:${Math.round(b.cnt/max*100)}%;background:var(--accent2)"></div></div>
    <span class="des-bar-val">${b.cnt}</span>
  </div>`).join('');
}

function _renderKanban(wip,review,done){
  const col=(title,dot,items,colKind)=>{
    return `<div class="kanban-col">
      <div class="kanban-col-head">
        <div class="kanban-col-dot" style="background:${dot}"></div>
        <div class="kanban-col-title">${title}</div>
        <span class="kanban-col-count">${items.length}</span>
      </div>
      ${items.length?items.map(p=>{
        const isOver=p.deadline&&deadlineDays(p.deadline)<0;
        let footRight='';
        if(colKind==='wip'){
          // Jarayonda: topshirish tugmasi — modal ochadi
          footRight=`<button class="kanban-deliver-btn" onclick="event.stopPropagation();openDeliveryModal(${p.id})" title="Tayyor ishlarni topshirish">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            Topshirish
          </button>`;
        } else if(colKind==='review'){
          footRight=`<span style="font-size:10.5px;color:var(--warning);font-weight:600">⏳ Tekshiruvda</span>`;
        } else if(colKind==='done'){
          footRight=`<span style="font-size:10.5px;color:var(--success);font-weight:600">✓ Tasdiqlangan</span>`;
        }
        return `<div class="kanban-card${isOver?' overdue':''}" onclick="openProjectPeek(${p.id})">
          <div class="kanban-card-title">${esc(p.title)}</div>
          <div class="kanban-card-meta">
            <span>${p.date}</span>
            ${p.deadline?`<span>muddat: ${p.deadline}</span>`:''}
            ${isOver?'<span style="color:var(--error);font-weight:600">kechikkan</span>':''}
            ${p.tgDelivered?'<span style="color:var(--accent2)">📎 yuborilgan</span>':''}
          </div>
          <div class="kanban-card-foot">
            ${p.penaltyApplied?`<span style="text-decoration:line-through;color:var(--muted);font-size:10px">${fmtPrice(p.originalPricePerUnit*p.units)}</span><span class="price-tag" style="color:var(--error)">${fmtPrice(p.pricePerUnit*p.units)} so'm</span>`:`<span class="price-tag">${fmtPrice(p.units*p.pricePerUnit)} so'm</span>`}
            ${footRight}
          </div>
        </div>`;
      }).join(''):`<div style="text-align:center;padding:30px 10px;color:var(--muted);font-size:12px">Hozircha bo'sh</div>`}
    </div>`;
  };
  return `<div class="kanban">
    ${col('Jarayonda','var(--accent2)',wip,'wip')}
    ${col("Ko'rib chiqilmoqda",'var(--warning)',review,'review')}
    ${col('Bajarildi','var(--success)',[...done].sort((a,b)=>(b.doneDate||'').localeCompare(a.doneDate||'')).slice(0,10),'done')}
  </div>`;
}

// ═══════════════ DIZAYNERLAR ═══════════════
function setCatFilter(c){
  catFilter=c;
  document.querySelectorAll('#cat-tabs .tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.cat===c));
  renderDesigners();
}

// Dizaynerlar bo'limidagi kategoriya tablari (dinamik)
function renderCatTabs(){
  const el=document.getElementById('cat-tabs');
  if(!el) return;
  if(catFilter!=='all' && !CAT_INFO[catFilter]) catFilter='all';
  el.innerHTML=`<button class="tab-btn${catFilter==='all'?' active':''}" data-cat="all" onclick="setCatFilter('all')">Barchasi</button>`+
    catKeys().map(c=>`<button class="tab-btn${catFilter===c?' active':''}" data-cat="${esc(c)}" onclick="setCatFilter('${c}')">${esc(c)}</button>`).join('');
}

function renderDesigners(){
  renderCatTabs();
  const _isDes = typeof isDesignerRole==='function' && isDesignerRole();
  const dAddBtn=document.querySelector('#panel-designers .btn-primary[onclick*="openDesignerModal"]');
  if(dAddBtn) dAddBtn.style.display=_isDes?'none':'';
  const q=(document.getElementById('search-d')?.value||'').toLowerCase();
  const base = _visibleDesigners();
  let list=base.filter(d=>
    (catFilter==='all'||d.category===catFilter)&&
    (d.name.toLowerCase().includes(q)||(d.role||'').toLowerCase().includes(q))
  );
  const grid=document.getElementById('designers-grid');
  if(!list.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1">Hech narsa topilmadi</div>';return;}
  grid.innerHTML=list.map(d=>{
    const lastMonth=new Date(); lastMonth.setMonth(lastMonth.getMonth()-1);
    const doneLastMonth=projects.filter(p=>p.designerId===d.id&&p.status==='done'&&new Date(p.doneDate||p.date)>=lastMonth).length;
    const wipNow=projects.filter(p=>p.designerId===d.id&&p.status==='wip').length;
    const ci=catOf(d.category);
    return `<div class="d-card" onclick="openDetail(${d.id})">
      <div class="d-card-top">
        ${photoAvatar(d,64)}
        <div class="d-info">
          <div class="d-name">${esc(d.name)}</div>
          <div class="d-role">${esc(d.role)}</div>
          <span class="d-cat-badge ${ci.cls}">${d.category} kategoriya</span>
        </div>
        <div onclick="event.stopPropagation()" style="flex-shrink:0">${statusBadge(d.status)}</div>
      </div>
      <div class="d-card-stats">
        <div class="d-stat">
          <div class="d-stat-val" style="color:var(--success)">${doneLastMonth}</div>
          <div class="d-stat-lbl">Oxirgi oy</div>
        </div>
        <div class="d-stat">
          <div class="d-stat-val" style="color:var(--accent2)">${wipNow}</div>
          <div class="d-stat-lbl">Jarayonda</div>
        </div>
      </div>
      <div class="d-card-footer">
        <div style="flex:1;min-width:0">
          <div class="d-contact-row">${esc(d.phone||'—')}${d.phone?_cpBtn(d.phone):''}</div>
          <div class="d-contact-row"><span class="card-num">${maskCard(d.cardNumber)}</span>${d.cardNumber?_cpBtn(d.cardNumber):''}</div>
          ${d.telegram?`<div class="d-contact-row">${esc(d.telegram)}${_cpBtn(d.telegram)}</div>`:''}
        </div>
        ${!_isDes ? `<div class="d-actions" onclick="event.stopPropagation()">
          <button class="btn btn-ghost btn-xs" onclick="openDesignerModal(${d.id})">Tahrir</button>
          <button class="btn btn-danger btn-xs" onclick="deleteDesigner(${d.id})">O'chirish</button>
        </div>` : ''}
      </div>
    </div>`;
  }).join('');
}

function deleteDesigner(id){
  if(typeof isDesignerRole==='function'&&isDesignerRole()){ toast("Ruxsat yo'q"); return; }
  if(!confirm("Dizayner o'chirilsinmi? Uning barcha loyihalari ham o'chadi.")) return;
  designers=designers.filter(d=>d.id!==id);
  projects=projects.filter(p=>p.designerId!==id);
  persist(); rerenderActive(); toast("Dizayner o'chirildi");
}

// ═══════════════ DIZAYNER PROFILI ═══════════════
let _detailFromPanel = 'designers';

function openDetail(id){
  _detailFromPanel = document.querySelector('.panel.active')?.id?.replace('panel-','') || 'designers';
  currentDesignerId=id;
  showPanel('detail');
}

function goBackFromDetail(){
  showPanel(_detailFromPanel || 'designers');
}

function renderDetail(){
  const d=designers.find(x=>x.id===currentDesignerId);
  if(!d){ showPanel('designers'); return; }
  const _backLabels={dashboard:'← Asosiy sahifa',designers:'← Dizaynerlar',reports:'← Hisobotlar',payments:"← To'lovlar"};
  const backBtn=document.querySelector('#panel-detail .back-btn');
  if(backBtn) backBtn.textContent=_backLabels[_detailFromPanel]||'← Dizaynerlar';
  const ci=catOf(d.category);
  const dProjs=projects.filter(p=>p.designerId===d.id);
  const lastMonth=new Date(); lastMonth.setMonth(lastMonth.getMonth()-1);
  const doneLastMonth=dProjs.filter(p=>p.status==='done'&&new Date(p.doneDate||p.date)>=lastMonth).length;
  const wipNow=dProjs.filter(p=>p.status==='wip').length;
  const totalEarned=dProjs.filter(p=>p.status==='done').reduce((s,p)=>s+p.units*p.pricePerUnit,0);
  const totalUnits=dProjs.filter(p=>p.status==='done').reduce((s,p)=>s+p.units,0);

  document.getElementById('detail-hero-wrap').innerHTML=`
    <div class="detail-hero">
      <div class="detail-photo">${d.photo?`<img src="${d.photo}"/>`:esc(d.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase())}</div>
      <div style="flex:1;min-width:0">
        <div class="detail-name">${esc(d.name)}</div>
        <div class="detail-role">${esc(d.role)}</div>
        <div class="detail-tags">
          <span class="d-cat-badge ${ci.cls}">${d.category} — ${ci.label}</span>
          ${statusBadge(d.status)}
          ${(d.skills||[]).map(s=>`<span class="skill-tag">${esc(s)}</span>`).join('')}
        </div>
        <div class="detail-contacts">
          <span class="contact-item">Tel: ${esc(d.phone||'—')}${d.phone?_cpBtn(d.phone):''}</span>
          <span class="contact-item">Karta: <span class="card-num">${esc(d.cardNumber||'—')}</span>${d.cardNumber?_cpBtn(d.cardNumber):''}</span>
          <span class="contact-item">Telegram: ${esc(d.telegram||'—')}${d.telegram?_cpBtn(d.telegram):''}</span>
          <span class="contact-item">Qo'shilgan: ${d.joinedAt||'—'}</span>
        </div>
      </div>
      ${!(typeof isDesignerRole==='function'&&isDesignerRole()) ? `<div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0">
        <button class="btn btn-ghost btn-sm" onclick="openDesignerModal(${d.id})">Tahrirlash</button>
        <div style="font-size:11px;color:var(--muted2);text-align:center">${ci.priceRange[0].toLocaleString()}–${ci.priceRange[1].toLocaleString()} so'm/birlik</div>
      </div>` : ''}
    </div>`;

  document.getElementById('detail-stats').innerHTML=[
    {l:'Oxirgi oy (bajarilgan)',v:doneLastMonth,c:'var(--success)'},
    {l:'Jarayonda',v:wipNow,c:'var(--accent2)'},
    {l:'Jami birlik',v:totalUnits,c:'var(--text)'},
    {l:"Jami to'lov (so'm)",v:fmtPrice(totalEarned),c:'var(--accent-text)'},
  ].map(s=>`<div class="det-stat"><div class="v" style="color:${s.c}">${s.v}</div><div class="l">${s.l}</div></div>`).join('');

  const _detAddBtn=document.getElementById('detail-add-btn');
  if(_detAddBtn){
    if(typeof isDesignerRole==='function'&&isDesignerRole()){ _detAddBtn.style.display='none'; }
    else { _detAddBtn.style.display=''; _detAddBtn.onclick=()=>openProjectModal(null,d.id); }
  }

  const el=document.getElementById('detail-projects');
  if(!dProjs.length){el.innerHTML='<div class="empty">Hali loyiha yo\'q</div>';return;}
  el.innerHTML=[...dProjs].sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(p=>projCardHtml(p,false)).join('');
}

// ═══════════════ LOYIHALAR ═══════════════
function setProjFilter(f){
  projStatusFilter=f;
  document.querySelectorAll('#proj-status-tabs .tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.f===f));
  renderProjects();
}

function renderProjects(){
  const _isDes = typeof isDesignerRole==='function' && isDesignerRole();

  if(_isDes){
    const header=document.querySelector('#panel-projects .page-header');
    if(header) header.style.display='none';
    const filterBar=document.querySelector('#panel-projects .filter-bar');
    if(filterBar) filterBar.style.display='none';
    const el=document.getElementById('projects-list');
    if(!el) return;
    const myProjs=_visibleProjects();
    const wip=myProjs.filter(p=>p.status==='wip');
    const review=myProjs.filter(p=>p.status==='review');
    const done=myProjs.filter(p=>p.status==='done');
    el.innerHTML=`<div style="font-size:16px;font-weight:700;margin-bottom:16px">Loyihalarim — doska</div>`+_renderKanban(wip,review,done);
    return;
  }

  const projAddBtn=document.querySelector('#panel-projects .btn-primary[onclick*="openProjectModal"]');
  if(projAddBtn) projAddBtn.style.display='';
  const header2=document.querySelector('#panel-projects .page-header');
  if(header2) header2.style.display='';
  const filterBar2=document.querySelector('#panel-projects .filter-bar');
  if(filterBar2) filterBar2.style.display='';

  const dsel=document.getElementById('proj-d-filter');
  const dval=dsel?.value||'all';
  if(dsel){ dsel.style.display=''; dsel.innerHTML='<option value="all">Barcha dizaynerlar</option>'+
    designers.map(d=>`<option value="${d.id}"${dval==d.id?' selected':''}>${esc(d.name)}</option>`).join(''); }

  const catSel=document.getElementById('proj-cat-filter');
  if(catSel){
    const cv=catSel.value||'all';
    catSel.innerHTML='<option value="all">Barcha kategoriyalar</option>'+
      catKeys().map(c=>`<option value="${esc(c)}"${cv===c?' selected':''}>${esc(c)} kategoriya</option>`).join('');
  }
  const cval=document.getElementById('proj-cat-filter')?.value||'all';
  const prval=document.getElementById('proj-priority-filter')?.value||'all';
  const qval=(document.getElementById('search-p')?.value||'').toLowerCase();
  let list=_visibleProjects();
  if(projStatusFilter!=='all') list=list.filter(p=>p.status===projStatusFilter);
  if(dval!=='all') list=list.filter(p=>p.designerId===parseInt(dval));
  if(cval!=='all') list=list.filter(p=>p.category===cval);
  if(prval!=='all') list=list.filter(p=>p.priority===prval);
  if(qval) list=list.filter(p=>{
    const d=designers.find(x=>x.id===p.designerId);
    return p.title.toLowerCase().includes(qval)||(d?.name||'').toLowerCase().includes(qval)||(p.description||'').toLowerCase().includes(qval)||(p.tags||[]).some(t=>t.toLowerCase().includes(qval));
  });
  list=[...list].sort((a,b)=>{
    const da=a.status!=='done'&&a.deadline?deadlineDays(a.deadline):9999;
    const db=b.status!=='done'&&b.deadline?deadlineDays(b.deadline):9999;
    if(da!==db) return da-db;
    return (b.date||'').localeCompare(a.date||'');
  });

  const el=document.getElementById('projects-list');
  if(!el) return;
  el.innerHTML = list.length
    ? list.map(p=>projCardHtml(p,true)).join('')
    : '<div class="empty">Hech narsa topilmadi</div>';
  // Chiqitdon sonini yon paneldagi badge'da yangilash
  const tb=document.getElementById('nav-count-trash');
  if(tb) tb.textContent=trashedProjects.length;
}

// Kartani bosganda ochiladi — lekin tugma/select/izoh ustiga bosilsa yo'q
function cardClick(e, id){
  if(e.target.closest('button,select,input,textarea,a,.comment-box,.tag-chip,.report-desc')) return;
  openProjectPeek(id);
}

function projCardHtml(p,showDesigner){
  const d=designers.find(x=>x.id===p.designerId);
  const ci=CAT_INFO[p.category];
  const total=p.units*p.pricePerUnit;
  const isOver=p.status!=='done'&&p.deadline&&deadlineDays(p.deadline)<0;
  const _isDes=typeof isDesignerRole==='function'&&isDesignerRole();
  return `<div class="report-card${isOver?' overdue':''}" id="pcard-${p.id}" style="cursor:pointer" onclick="cardClick(event,${p.id})">
    <div class="report-header">
      <div>
        <div class="report-title">${esc(p.title)}</div>
        ${showDesigner&&d?`<div style="display:flex;align-items:center;gap:7px;margin-top:5px">${photoAvatar(d,20)}<span style="font-size:12px;color:var(--muted)">${esc(d.name)}</span></div>`:''}
      </div>
      <div class="report-controls">
        ${priorityBadge(p.priority)}
        <span class="d-cat-badge ${ci.cls}">${p.category}</span>
        ${projStatusBadge(p.status)}
        ${deadlineBadge(p)}
        ${_isDes?'':`<select class="mini-select" onchange="changeProjStatus(${p.id},this.value)">
          <option value="wip"${p.status==='wip'?' selected':''}>Jarayonda</option>
          <option value="review"${p.status==='review'?' selected':''}>Ko'rib chiqilmoqda</option>
          <option value="done"${p.status==='done'?' selected':''}>Bajarildi</option>
        </select>`}
        <button class="btn btn-ghost btn-xs" onclick="openProjectPeek(${p.id})">Ochish</button>
        ${_isDes?'':`<button class="btn btn-danger btn-xs" onclick="deleteProject(${p.id})">×</button>`}
      </div>
    </div>
    <div class="report-meta">
      <span>Boshlangan: ${p.date}</span>
      ${p.deadline?`<span>·</span><span>Muddat: <strong style="color:${p.status==='done'?'var(--muted)':deadlineDays(p.deadline)<0?'var(--error)':deadlineDays(p.deadline)<=3?'var(--warning)':'var(--text)'}">${p.deadline}</strong></span>`:''}
      ${p.doneDate?`<span>·</span><span>Bajarilgan: ${p.doneDate}</span>`:''}
      <span>·</span>
      <span>${p.units} birlik × ${p.pricePerUnit.toLocaleString()} so'm</span>
      <span>·</span>
      ${p.penaltyApplied?`<span style="text-decoration:line-through;color:var(--muted)">${fmtPrice(p.originalPricePerUnit*p.units)} so'm</span><span>·</span><span class="report-price" style="color:var(--error)">Jami: ${fmtPrice(total)} so'm (−30%)</span>`:`<span class="report-price">Jami: ${fmtPrice(total)} so'm</span>`}
    </div>
    ${p.tags&&p.tags.length?`<div class="report-files">${p.tags.map(t=>tagChipHtml(t)).join('')}</div>`:''}
    ${p.descHtml?`<div class="report-desc rich">${sanitizeHtml(p.descHtml)}</div>`:(p.description?`<div class="report-desc">${esc(p.description)}</div>`:'')}
    ${p.files&&p.files.length?`<div class="report-files">${p.files.map(f=>`<span class="file-tag">${esc(f)}</span>`).join('')}</div>`:''}
    ${commentBoxHtml(p,'card')}
  </div>`;
}

function changeProjStatus(id,status){
  if(typeof isDesignerRole==='function'&&isDesignerRole()){ toast("Ruxsat yo'q"); return; }
  projects=projects.map(p=>{
    if(p.id!==id) return p;
    const upd={...p,status};
    // Bajarildi → bajarilgan sana yoziladi; aksincha tozalanadi
    if(status==='done' && !p.doneDate) upd.doneDate=new Date().toISOString().slice(0,10);
    if(status!=='done') upd.doneDate=null;
    return upd;
  });
  persist();
  const stLbl={wip:'Jarayonda',review:"Ko'rib chiqilmoqda",done:'Bajarildi'};
  toast(`Holat o'zgartirildi: ${stLbl[status]||status}`);
  rerenderActive();
}

function deleteProject(id){
  if(typeof isDesignerRole==='function'&&isDesignerRole()){ toast("Ruxsat yo'q"); return; }
  if(!confirm("Loyiha chiqitdonga tashlansinmi? Chiqitdondan tiklash mumkin.")) return;
  trashProject(id);
  persist(); rerenderActive(); toast("Loyiha chiqitdonga tashlandi");
}

function renderTrash(){
  const el = byId('trash-list');
  if(!el) return;
  const empBtn = byId('empty-trash-btn');
  if(!trashedProjects.length){
    el.innerHTML = '<div style="padding:40px 18px;color:var(--muted);font-size:13px;text-align:center">Chiqitdon bo\'sh</div>';
    if(empBtn) empBtn.style.display = 'none';
    return;
  }
  if(empBtn) empBtn.style.display = '';
  el.innerHTML = trashedProjects.slice().reverse().map(p=>{
    const d = designers.find(x=>x.id===p.designerId);
    const date = p.trashedAt ? new Date(p.trashedAt).toLocaleDateString('uz-UZ') : '';
    return `<div class="trash-row">
      <div class="trash-info">
        <span class="trash-title">${esc(p.title)}</span>
        <span class="trash-meta">${esc(d?.name||'—')} · ${date}</span>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-ghost btn-xs" onclick="doRestoreProject(${p.id})">↩ Tiklash</button>
        <button class="btn btn-danger btn-xs" onclick="doPurgeProject(${p.id})">Butunlay o'chirish</button>
      </div>
    </div>`;
  }).join('');
}

function doRestoreProject(id){
  restoreProject(id);
  persist(); rerenderActive(); renderTrash();
  toast("Loyiha tiklandi");
}
function doPurgeProject(id){
  if(!confirm("Loyiha butunlay o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.")) return;
  const p = trashedProjects.find(x=>x.id===id);
  if(p?.notionPageId && typeof archiveNotionPage==='function') archiveNotionPage(p.notionPageId);
  purgeProject(id);
  persist(); renderTrash();
  toast("Butunlay o'chirildi");
}
function emptyTrash(){
  if(!trashedProjects.length) return;
  if(!confirm("Chiqitdondagi barcha loyihalar butunlay o'chirilsinmi? Bu amalni qaytarib bo'lmaydi.")) return;
  trashedProjects.slice().forEach(p=>{
    if(p?.notionPageId && typeof archiveNotionPage==='function') archiveNotionPage(p.notionPageId);
  });
  trashedProjects = [];
  persist(); renderTrash(); updateCounts();
  toast("Chiqitdon tozalandi");
}

// ── IZOHLAR (qo'shish / tahrirlash / o'chirish) ──
let editingCmt=null; // {pid, idx, ctx}

function commentListHtml(p,ctx){
  const cur=getCurrentUser();
  const me=cur?.displayName||cur?.username;
  return (p.comments||[]).map((c,i)=>{
    if(editingCmt&&editingCmt.pid===p.id&&editingCmt.idx===i&&editingCmt.ctx===ctx){
      return `<div class="comment-item">
        <textarea class="form-textarea" id="cmt-edit-${ctx}-${p.id}" style="min-height:60px;font-size:12.5px">${esc(c.text)}</textarea>
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:6px">
          <button class="btn btn-ghost btn-xs" onclick="cancelEditComment()">Bekor</button>
          <button class="btn btn-primary btn-xs" onclick="saveEditComment(${p.id},${i})">Saqlash</button>
        </div>
      </div>`;
    }
    const canEdit=cur&&(cur.role==='admin'||c.author===me);
    return `<div class="comment-item">
      <div class="comment-head">
        <span class="comment-author">${esc(c.author)}</span>
        <span class="comment-time">${esc(c.time)}${c.edited?' · tahrirlangan':''}</span>
        ${canEdit?`<span class="comment-actions">
          <button class="cmt-act-btn" onclick="startEditComment(${p.id},${i},'${ctx}')">Tahrirlash</button>
          <button class="cmt-act-btn cmt-del" onclick="deleteComment(${p.id},${i})">O'chirish</button>
        </span>`:''}
      </div>
      <div class="comment-text">${esc(c.text)}</div>
    </div>`;
  }).join('');
}

function commentBoxHtml(p,ctx){
  return `<div class="comment-box">
    <div id="cmt-list-${ctx}-${p.id}">${commentListHtml(p,ctx)}</div>
    <div class="comment-input-row">
      <input class="form-input" id="cmt-${ctx}-${p.id}" placeholder="Izoh qo'shish..." style="font-size:12px;padding:7px 11px" onkeydown="if(event.key==='Enter')addComment(${p.id},'${ctx}')"/>
      <button class="btn btn-ghost btn-xs" onclick="addComment(${p.id},'${ctx}')">Yuborish</button>
    </div>
  </div>`;
}

// Karta va yon paneldagi izoh ro'yxatlarini birga yangilash
function refreshComments(projId){
  const p=projects.find(x=>x.id===projId);
  if(!p) return;
  ['card','peek'].forEach(ctx=>{
    const el=document.getElementById(`cmt-list-${ctx}-${projId}`);
    if(el) el.innerHTML=commentListHtml(p,ctx);
  });
}

function addComment(projId,ctx='card'){
  const inp=document.getElementById(`cmt-${ctx}-${projId}`);
  if(!inp) return;
  const text=inp.value.trim();
  if(!text) return;
  const cur=getCurrentUser();
  const author=cur?.displayName||cur?.username||'Admin';
  const now=new Date().toLocaleString('uz',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
  projects=projects.map(p=>{
    if(p.id!==projId) return p;
    return {...p,comments:[...(p.comments||[]),{author,text,time:now}]};
  });
  inp.value='';
  persist();
  refreshComments(projId);
  toast("Izoh qo'shildi");
}

function startEditComment(pid,idx,ctx){
  editingCmt={pid,idx,ctx};
  refreshComments(pid);
  const ta=document.getElementById(`cmt-edit-${ctx}-${pid}`);
  if(ta){ ta.focus(); ta.selectionStart=ta.value.length; }
}

function cancelEditComment(){
  const pid=editingCmt?.pid;
  editingCmt=null;
  if(pid!=null) refreshComments(pid);
}

function saveEditComment(pid,idx){
  const ctx=editingCmt?.ctx||'card';
  const ta=document.getElementById(`cmt-edit-${ctx}-${pid}`);
  const v=ta?.value.trim();
  if(!v){ toast("Izoh bo'sh bo'lishi mumkin emas"); return; }
  projects=projects.map(p=>{
    if(p.id!==pid) return p;
    const cs=[...(p.comments||[])];
    if(cs[idx]) cs[idx]={...cs[idx],text:v,edited:true};
    return {...p,comments:cs};
  });
  editingCmt=null;
  persist();
  refreshComments(pid);
  toast('Izoh yangilandi');
}

function deleteComment(pid,idx){
  if(!confirm("Izoh o'chirilsinmi?")) return;
  if(editingCmt&&editingCmt.pid===pid) editingCmt=null;
  projects=projects.map(p=>{
    if(p.id!==pid) return p;
    const cs=[...(p.comments||[])];
    cs.splice(idx,1);
    return {...p,comments:cs};
  });
  persist();
  refreshComments(pid);
  toast("Izoh o'chirildi");
}

// ═══════════════ MODALLAR ═══════════════
function closeModal(){
  const m = document.getElementById('modal');
  const tgFooter = m.querySelector('.tg-modal-footer');
  if(tgFooter) tgFooter.remove();
  m.style.display='none';
  document.removeEventListener('paste',_aiPasteHandler);
}

function openDesignerModal(id=null){
  if(typeof isDesignerRole==='function'&&isDesignerRole()){ toast("Dizayner qo'shish/tahrirlash huquqi yo'q"); return; }
  const d=id?designers.find(x=>x.id===id):null;
  photoData.tempPhoto = d?.photo||null;
  document.getElementById('modal-title-text').textContent = d ? "Dizaynerni tahrirlash" : "Yangi dizayner qo'shish";
  document.getElementById('modal-body').innerHTML=`
    <div style="display:flex;gap:16px;margin-bottom:16px;align-items:flex-start">
      <div>
        <div class="photo-upload" id="photo-prev" onclick="document.getElementById('photo-file').click()">
          ${photoData.tempPhoto?`<img src="${photoData.tempPhoto}"/>`:'<span class="photo-upload-label">Rasm yuklash</span>'}
        </div>
        <input type="file" id="photo-file" accept="image/*" onchange="handlePhoto(event)" style="display:none"/>
      </div>
      <div style="flex:1">
        <div class="form-group"><label class="form-label">Ism Familiya</label><input class="form-input" id="f-name" value="${esc(d?.name||'')}" placeholder="Aziz Karimov"/></div>
        <div class="form-group"><label class="form-label">Rol / Mutaxassislik</label><input class="form-input" id="f-role" value="${esc(d?.role||'')}" placeholder="UI/UX Designer"/></div>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Kategoriya</label>
      <div class="cat-select" id="cat-sel">
        ${catKeys().map(c=>{const ci=CAT_INFO[c];const sel=(d?.category||firstCat())===c;return `
          <div class="cat-opt${sel?' sel-'+ci.cls:''}" onclick="selectCat('${c}',this)" data-cat="${c}">
            <span class="cat-letter" style="color:${ci.color}">${esc(c)}</span>
            <div class="cat-desc">${esc(ci.desc)}</div>
            <div class="cat-price" style="color:${ci.color}">${ci.priceRange[0].toLocaleString()}–${ci.priceRange[1].toLocaleString()}</div>
          </div>`;}).join('')}
      </div>
      <input type="hidden" id="f-cat" value="${d?.category||firstCat()}"/>
    </div>
    <div class="form-grid">
      <div class="form-group"><label class="form-label">Telefon raqami</label><input class="form-input" id="f-phone" type="tel" value="${esc(d?.phone||'')}" placeholder="+998 90 123 45 67"/></div>
      <div class="form-group"><label class="form-label">Karta raqami</label><input class="form-input" id="f-card" inputmode="numeric" value="${esc(d?.cardNumber||'')}" placeholder="8600 1234 5678 9012" maxlength="19" oninput="formatCard(this)"/></div>
    </div>
    <div class="form-grid">
      <div class="form-group"><label class="form-label">Telegram</label><input class="form-input" id="f-tg" value="${esc(d?.telegram||'')}" placeholder="@username"/></div>
      <div class="form-group"><label class="form-label">Holat</label>
        <select class="form-select" id="f-status">
          <option value="active"${(d?.status||'active')==='active'?' selected':''}>Faol</option>
          <option value="idle"${(d?.status||'active')==='idle'?' selected':''}>Bo'sh</option>
          <option value="away"${(d?.status||'active')==='away'?' selected':''}>Uzoqda</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label class="form-label">Ko'nikmalar <small>(vergul bilan)</small></label><input class="form-input" id="f-skills" value="${esc(d?.skills?.join(', ')||'')}" placeholder="Figma, Illustrator, After Effects"/></div>
    <div class="modal-footer">
      <button class="btn btn-ghost" onclick="closeModal()">Bekor qilish</button>
      <button class="btn btn-primary" onclick="saveDesigner(${d?.id||'null'})">Saqlash</button>
    </div>`;
  document.getElementById('modal').style.display='flex';
  setTimeout(()=>document.getElementById('f-name')?.focus(),100);
}

function handlePhoto(e){
  const file=e.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    photoData.tempPhoto=ev.target.result;
    document.getElementById('photo-prev').innerHTML=`<img src="${ev.target.result}"/>`;
  };
  reader.readAsDataURL(file);
}

function selectCat(c, el){
  document.querySelectorAll('#cat-sel .cat-opt').forEach(o=>{o.className='cat-opt'});
  el.classList.add('sel-'+(CAT_INFO[c]?.cls||catSlug(c)));
  document.getElementById('f-cat').value=c;
}

function formatCard(inp){
  let v=inp.value.replace(/\D/g,'').slice(0,16);
  inp.value=v.replace(/(.{4})/g,'$1 ').trim();
}

function saveDesigner(id){
  const name=document.getElementById('f-name').value.trim();
  if(!name){alert("Ism Familiya kiritilmagan!");return;}
  const skills=document.getElementById('f-skills').value.split(',').map(s=>s.trim()).filter(Boolean);
  const obj={
    name,photo:photoData.tempPhoto||null,
    role:document.getElementById('f-role').value.trim(),
    category:document.getElementById('f-cat').value,
    phone:document.getElementById('f-phone').value.trim(),
    cardNumber:document.getElementById('f-card').value.trim(),
    telegram:document.getElementById('f-tg').value.trim(),
    status:document.getElementById('f-status').value,
    skills,
  };
  if(id!=='null'&&id){
    designers=designers.map(d=>d.id===parseInt(id)?{...d,...obj}:d);
    toast('Dizayner yangilandi');
  } else {
    designers.push({...obj,id:nextDId++,joinedAt:new Date().toISOString().slice(0,10)});
    toast("Dizayner qo'shildi");
  }
  closeModal(); photoData.tempPhoto=null;
  persist(); rerenderActive();
}

// Loyiha qo'shish/tahrirlash endi Notion uslubidagi yon panelda — js/editor.js

// ═══════════════ TO'LOVLAR ═══════════════
function filterByMonth(list, mval){
  if(mval==='all') return list;
  const now=new Date();
  return list.filter(p=>{
    const d=new Date(p.doneDate||p.date);
    if(mval==='this_month') return d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();
    if(mval==='last_month'){const lm=new Date(now.getFullYear(),now.getMonth()-1,1);return d.getMonth()===lm.getMonth()&&d.getFullYear()===lm.getFullYear();}
    if(mval==='this_year') return d.getFullYear()===now.getFullYear();
    return true;
  });
}

function renderPayments(){
  const _isDes = typeof isDesignerRole==='function' && isDesignerRole();
  const vp = _visibleProjects();
  const vd = _visibleDesigners();
  const dsel=document.getElementById('pay-d-filter');
  if(dsel){
    if(_isDes){ dsel.style.display='none'; }
    else {
      dsel.style.display='';
      const v=dsel.value;
      dsel.innerHTML='<option value="all">Barcha dizaynerlar</option>'+
        vd.map(d=>`<option value="${d.id}"${v==d.id?' selected':''}>${esc(d.name)}</option>`).join('');
    }
  }
  const dval=_isDes?'all':(document.getElementById('pay-d-filter')?.value||'all');
  const mval=document.getElementById('pay-month-filter')?.value||'all';
  let doneProjs=vp.filter(p=>p.status==='done'&&(dval==='all'||p.designerId===parseInt(dval)));
  doneProjs=filterByMonth(doneProjs,mval);
  const totalAll=vp.filter(p=>p.status==='done').reduce((s,p)=>s+p.units*p.pricePerUnit,0);
  const totalFiltered=doneProjs.reduce((s,p)=>s+p.units*p.pricePerUnit,0);
  const paidTotal=doneProjs.filter(p=>p.paymentPaid).reduce((s,p)=>s+p.units*p.pricePerUnit,0);

  const ps=document.getElementById('pay-stats');
  if(ps) ps.innerHTML=[
    {v:fmtPrice(totalAll),l:"Umumiy jami (so'm)",c:'var(--accent-text)'},
    {v:fmtPrice(totalFiltered),l:"Tanlangan davr (so'm)",c:'var(--text)'},
    {v:fmtPrice(paidTotal),l:"To'langan (so'm)",c:'var(--success)'},
    {v:fmtPrice(totalFiltered-paidTotal),l:"Qolgan (so'm)",c:'var(--error)'},
  ].map(s=>`<div class="stat-card"><div class="stat-val" style="color:${s.c}">${s.v}</div><div class="stat-label">${s.l}</div></div>`).join('');

  const el=document.getElementById('payments-list');
  if(!el) return;
  const byD=vd.filter(d=>dval==='all'||d.id===parseInt(dval)).map(d=>{
    const dp=doneProjs.filter(p=>p.designerId===d.id).sort((a,b)=>(b.doneDate||b.date||'').localeCompare(a.doneDate||a.date||''));
    if(!dp.length) return '';
    const total=dp.reduce((s,p)=>s+p.units*p.pricePerUnit,0);
    const ci=catOf(d.category);
    return `<div class="card" style="margin-bottom:14px">
      <div class="card-header" style="cursor:pointer" onclick="openDetail(${d.id})">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          ${photoAvatar(d,30)}
          <span style="font-size:13.5px;font-weight:700">${esc(d.name)}</span>
          <span class="d-cat-badge ${ci.cls}">${d.category}</span>
          <span class="card-num">${esc(d.cardNumber||'—')}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:12px;color:var(--muted)">${dp.length} ta loyiha</span>
          <span class="price-tag" style="font-size:13px">Jami: ${fmtPrice(total)} so'm</span>
        </div>
      </div>
      ${dp.map(p=>{
        const isOverdue=p.deadline&&p.doneDate&&p.doneDate>p.deadline;
        const rowCls=p.paymentPaid?'pay-row-paid':(isOverdue?'pay-row-overdue':'');
        return `<div class="table-row ${rowCls}" style="grid-template-columns:1fr auto auto${_isDes?'':' auto'}">
          <div style="cursor:pointer" onclick="openProjectPeek(${p.id})">
            <div style="font-size:12.5px;font-weight:600">${esc(p.title)}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">
              ${p.doneDate||p.date}${p.deadline?' · muddat: '+p.deadline:''}${isOverdue?' · <span style="color:var(--error);font-weight:600">kechikkan</span>':''}
              ${p.paymentDate?' · to\'langan: '+p.paymentDate:''}
            </div>
          </div>
          <span style="font-size:11.5px;color:var(--muted);font-variant-numeric:tabular-nums">${p.units} × ${p.pricePerUnit.toLocaleString()}</span>
          <span class="price-tag">${fmtPrice(p.units*p.pricePerUnit)}</span>
          ${_isDes?'':`<button onclick="togglePayment(${p.id})" class="btn btn-xs ${p.paymentPaid?'pay-btn-paid':'pay-btn-unpaid'}">
            ${p.paymentPaid?"To'langan ✓":"To'lanmagan"}
          </button>`}
        </div>`;
      }).join('')}
    </div>`;
  }).join('');
  el.innerHTML=byD||'<div class="empty">Bajarilgan loyiha yo\'q</div>';
}

function togglePayment(projId){
  if(typeof isDesignerRole==='function'&&isDesignerRole()){ toast("Ruxsat yo'q"); return; }
  projects=projects.map(p=>{
    if(p.id!==projId) return p;
    const paid=!p.paymentPaid;
    return {...p,paymentPaid:paid,paymentDate:paid?new Date().toISOString().slice(0,10):null};
  });
  persist();
  renderPayments();
  updateCounts();
  const p=projects.find(x=>x.id===projId);
  toast(p?.paymentPaid?"To'langan deb belgilandi":"To'lanmagan deb belgilandi");
}

function printPayments(){ window.print(); }

// ═══════════════ HISOBOTLAR ═══════════════
function renderReports(){
  const vp = _visibleProjects();
  const vd = _visibleDesigners();
  const done=vp.filter(p=>p.status==='done');
  const wip=vp.filter(p=>p.status==='wip');
  const totalPay=done.reduce((s,p)=>s+p.units*p.pricePerUnit,0);

  const rs=document.getElementById('rep-stats');
  if(rs) rs.innerHTML=[
    {v:done.length,l:'Bajarilgan loyiha',c:'var(--success)'},
    {v:wip.length,l:'Jarayonda',c:'var(--accent2)'},
    {v:fmtPrice(totalPay),l:"Jami to'lov (so'm)",c:'var(--accent-text)'},
    {v:vd.filter(d=>d.status==='active').length,l:'Faol dizayner',c:'var(--text)'},
  ].map(s=>`<div class="stat-card"><div class="stat-val" style="color:${s.c}">${s.v}</div><div class="stat-label">${s.l}</div></div>`).join('');

  const wlEl=document.getElementById('rep-workload');
  if(wlEl){
    if(!vd.length){ wlEl.innerHTML='<div class="empty">Dizayner yo\'q</div>'; }
    else {
      const maxWip=Math.max(1,...vd.map(d=>vp.filter(p=>p.designerId===d.id&&p.status==='wip').length));
      wlEl.innerHTML=vd.map(d=>{
        const dWip=vp.filter(p=>p.designerId===d.id&&p.status==='wip');
        const dReview=vp.filter(p=>p.designerId===d.id&&p.status==='review');
        const dDone=vp.filter(p=>p.designerId===d.id&&p.status==='done');
        const dOverdue=dWip.filter(p=>p.deadline&&deadlineDays(p.deadline)<0);
        const pct=Math.round(dWip.length/maxWip*100);
        const ci=catOf(d.category);
        return `<div style="display:grid;grid-template-columns:180px 1fr auto;gap:14px;align-items:center;margin-bottom:13px">
          <div style="display:flex;align-items:center;gap:9px">
            ${photoAvatar(d,26)}
            <div>
              <div style="font-size:12.5px;font-weight:600">${esc(d.name)}</div>
              <span class="d-cat-badge ${ci.cls}" style="font-size:9.5px;padding:1px 7px">${d.category}</span>
            </div>
          </div>
          <div>
            <div style="display:flex;gap:5px;margin-bottom:5px;flex-wrap:wrap">
              ${dOverdue.length?`<span class="status s-away" style="font-size:10px">${dOverdue.length} muddati o'tdi</span>`:''}
              <span class="status s-wip" style="font-size:10px">${dWip.length} jarayonda</span>
              ${dReview.length?`<span class="status s-review" style="font-size:10px">${dReview.length} ko'rib chiqilmoqda</span>`:''}
            </div>
            <div style="background:var(--hover);border-radius:4px;height:6px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${dOverdue.length?'var(--error)':ci.color};border-radius:4px;transition:width .4s"></div>
            </div>
          </div>
          <span class="price-tag">${dDone.length} bajarildi</span>
        </div>`;
      }).join('');
    }
  }

  const catEl=document.getElementById('rep-cat-chart');
  if(catEl){
    catEl.innerHTML=catKeys().map(c=>{
      const cp=done.filter(p=>p.category===c);
      const total=cp.reduce((s,p)=>s+p.units*p.pricePerUnit,0);
      const ci=CAT_INFO[c];
      const pct=done.length?Math.round(cp.length/done.length*100):0;
      return `<div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px">
          <span class="d-cat-badge ${ci.cls}">${c} kategoriya</span>
          <span style="font-size:11.5px;color:var(--muted)">${cp.length} loyiha · ${fmtPrice(total)} so'm</span>
        </div>
        <div style="background:var(--hover);border-radius:4px;height:7px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${ci.color};border-radius:4px;transition:width .4s"></div>
        </div>
      </div>`;
    }).join('');
  }

  const topEl=document.getElementById('rep-top-designers');
  if(topEl){
    const _isDesRep=typeof isDesignerRole==='function'&&isDesignerRole();
    const topWrap=topEl.closest('.card')||topEl.parentElement;
    if(_isDesRep){ if(topWrap)topWrap.style.display='none'; }
    else {
      if(topWrap)topWrap.style.display='';
      const ranked=[...vd].map(d=>{
        const dp=done.filter(p=>p.designerId===d.id);
        return {...d,doneCount:dp.length,earned:dp.reduce((s,p)=>s+p.units*p.pricePerUnit,0)};
      }).sort((a,b)=>b.earned-a.earned);
      topEl.innerHTML=ranked.length ? ranked.map((d,i)=>`
        <div class="table-row" style="grid-template-columns:24px 1fr auto auto;cursor:pointer" onclick="openDetail(${d.id})">
          <span style="font-size:11.5px;color:var(--muted2);font-variant-numeric:tabular-nums">${i+1}</span>
          <div style="display:flex;align-items:center;gap:9px">
            ${photoAvatar(d,26)}
            <span style="font-size:13px;font-weight:600">${esc(d.name)}</span>
          </div>
          <span style="font-size:11.5px;color:var(--muted)">${d.doneCount} ta</span>
          <span class="price-tag">${fmtPrice(d.earned)} so'm</span>
        </div>`).join('') : '<div class="empty">Dizayner yo\'q</div>';
    }
  }
}

// ═══════════════ FOYDALANUVCHILAR (Firebase) ═══════════════
function renderUsers(){
  // Foydalanuvchilar endi panel-users ichidagi fb-users-list'da ko'rsatiladi
  if(typeof renderFbUsersAdmin === 'function') renderFbUsersAdmin();
}

// ═══════════════ SOZLAMALAR ═══════════════
let _stgActiveTab = 'general';

function stgTab(tab){
  _stgActiveTab = tab;
  document.querySelectorAll('.stg-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.stg-nav-item').forEach(b => b.classList.remove('active'));
  const sec = document.getElementById('stg-'+tab);
  if(sec) sec.classList.add('active');
  const btns = document.querySelectorAll('.stg-nav-item');
  btns.forEach(b => { if(b.getAttribute('onclick')?.includes("'"+tab+"'")) b.classList.add('active'); });
  renderSettingsPage();
}

function _stgUpdateBadges(){
  const fb = document.getElementById('stg-fb-badge');
  const gs = document.getElementById('stg-gs-badge');
  const nt = document.getElementById('stg-nt-badge');
  const ai = document.getElementById('stg-ai-badge');
  if(fb){
    const on = typeof isFbReady === 'function' && isFbReady();
    fb.textContent = on ? 'ON' : 'OFF';
    fb.className = 'stg-nav-badge ' + (on ? 'on' : 'off');
  }
  if(gs){
    const on = !!(localStorage.getItem('gs_sheet_id') && localStorage.getItem('gs_token'));
    gs.textContent = on ? 'ON' : 'OFF';
    gs.className = 'stg-nav-badge ' + (on ? 'on' : 'off');
  }
  if(nt){
    const on = !!localStorage.getItem('notion_token');
    nt.textContent = on ? 'ON' : 'OFF';
    nt.className = 'stg-nav-badge ' + (on ? 'on' : 'off');
  }
  if(ai){
    const on = !!(localStorage.getItem('exon_groq_key') || localStorage.getItem('exon_ai_key'));
    ai.textContent = on ? 'ON' : 'OFF';
    ai.className = 'stg-nav-badge ' + (on ? 'on' : 'off');
  }
  const tg = document.getElementById('stg-tg-badge');
  if(tg){
    const on = typeof isTgReady==='function' && isTgReady();
    tg.textContent = on ? 'ON' : 'OFF';
    tg.className = 'stg-nav-badge ' + (on ? 'on' : 'off');
  }
}

function renderSettingsPage(){
  const _sBackLabels={dashboard:'← Asosiy sahifa',designers:'← Dizaynerlar',projects:'← Loyihalar',payments:"← To'lovlar",reports:'← Hisobotlar',users:'← Foydalanuvchilar'};
  const sBackBtn=document.getElementById('settings-back-btn');
  if(sBackBtn){
    const lbl=_sBackLabels[typeof _settingsReturnPanel!=='undefined'?_settingsReturnPanel:''];
    sBackBtn.style.display=lbl?'':'none';
    if(lbl) sBackBtn.textContent=lbl;
  }

  // App version
  const verEl = document.getElementById('stg-app-ver');
  if(verEl) verEl.textContent = typeof APP_VER !== 'undefined' ? APP_VER : '—';

  const gsId=document.getElementById('gs-sheet-id');
  const gsTok=document.getElementById('gs-token');
  if(gsId) gsId.value=localStorage.getItem('gs_sheet_id')||'';
  if(gsTok) gsTok.value=localStorage.getItem('gs_token')||'';
  if(typeof updateGSStatus==='function') updateGSStatus();

  // Notion sozlamalari
  const ntT=document.getElementById('nt-token');
  const ntP=document.getElementById('nt-parent');
  const ntX=document.getElementById('nt-proxy');
  if(ntT) ntT.value=localStorage.getItem('notion_token')||'';
  if(ntP) ntP.value=localStorage.getItem('notion_parent')||'';
  if(ntX) ntX.value=localStorage.getItem('notion_proxy')||'';
  if(typeof updateNotionStatus==='function') updateNotionStatus();

  // Firebase holat belgisi
  if(typeof setConnBadge==='function'){
    const ready = typeof isFbReady === 'function' && isFbReady();
    setConnBadge('fb-status-badge', ready);
  }

  // Telegram sozlamalari
  const tgT=document.getElementById('tg-bot-token');
  const tgP=document.getElementById('tg-proxy-url');
  if(tgT) tgT.value=localStorage.getItem('tg_bot_token')||'';
  if(tgP) tgP.value=localStorage.getItem('tg_proxy_url')||'';
  if(typeof updateTgStatus==='function') updateTgStatus();
  if(typeof renderTgChannelMap==='function') renderTgChannelMap();

  // Sidebar badge'larini yangilash
  _stgUpdateBadges();

  const cur=getCurrentUser();
  renderCatManager();
  if(cur?.role === 'admin' && typeof renderRoleManager === 'function') renderRoleManager();
  if(typeof loadAiSettings==='function') loadAiSettings();
}

// ── KATEGORIYA BOSHQARUVI ──
function renderCatManager(){
  const cpe=document.getElementById('cat-price-editor');
  if(!cpe) return;
  cpe.innerHTML = catKeys().map(c=>{
    const ci=CAT_INFO[c];
    const inUse = designers.filter(d=>d.category===c).length + projects.filter(p=>p.category===c).length;
    return `<div class="cat-edit-row">
      <div class="cat-edit-head">
        <input class="cat-color-dot" type="color" value="${ci.color}" title="Rang" oninput="updateCatField('${c}','color',this.value)"/>
        <input class="form-input cat-key-inp" value="${esc(c)}" title="Belgi (masalan A, VIP)" onchange="renameCat('${c}',this.value)"/>
        <input class="form-input" style="flex:1" value="${esc(ci.label||'')}" placeholder="Nomi" onchange="updateCatField('${c}','label',this.value)"/>
        <button class="btn btn-danger btn-xs" title="O'chirish" onclick="removeCat('${c}')">×</button>
      </div>
      <input class="form-input" style="margin-top:7px" value="${esc(ci.desc||'')}" placeholder="Izoh (ixtiyoriy)" onchange="updateCatField('${c}','desc',this.value)"/>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:7px">
        <div><label class="form-label">Min (so'm)</label>
          <input class="form-input" type="number" value="${ci.priceRange[0]}" onchange="updateCatPrice('${c}',0,this.value)"/></div>
        <div><label class="form-label">Max (so'm)</label>
          <input class="form-input" type="number" value="${ci.priceRange[1]}" onchange="updateCatPrice('${c}',1,this.value)"/></div>
      </div>
      ${inUse?`<div class="form-hint" style="margin-top:5px">${inUse} ta joyda ishlatilgan</div>`:''}
    </div>`;
  }).join('') + `
    <button class="btn btn-ghost btn-sm" style="margin-top:4px;width:100%" onclick="addCatPrompt()">+ Yangi kategoriya qo'shish</button>`;
}

function updateCatField(key,field,val){
  if(!CAT_INFO[key]) return;
  CAT_INFO[key][field]=val;
  if(field==='color') applyCategoryStyles();
  persist(); rerenderActive();
}
function updateCatPrice(key,idx,val){
  if(!CAT_INFO[key]) return;
  const r=[...CAT_INFO[key].priceRange]; r[idx]=parseInt(val)||0;
  CAT_INFO[key].priceRange=r;
  persist();
}
function renameCat(oldKey,newKeyRaw){
  const newKey=String(newKeyRaw||'').trim();
  if(!newKey||newKey===oldKey){ renderCatManager(); return; }
  if(CAT_INFO[newKey]){ toast("Bu belgi band"); renderCatManager(); return; }
  // Tartibni saqlagan holda kalitni almashtirish
  const entries=catKeys().map(k=>[k===oldKey?newKey:k, CAT_INFO[k]]);
  catKeys().forEach(k=>delete CAT_INFO[k]);
  entries.forEach(([k,v])=>{ CAT_INFO[k]=v; CAT_INFO[k].cls=catSlug(k); });
  // Bog'liq yozuvlarni yangilash
  designers.forEach(d=>{ if(d.category===oldKey) d.category=newKey; });
  projects.forEach(p=>{ if(p.category===oldKey) p.category=newKey; });
  applyCategoryStyles();
  persist(); renderCatManager(); rerenderActive();
  toast("Kategoriya nomi o'zgartirildi");
}
function addCatPrompt(){
  let base='Yangi', key=base, i=1;
  while(CAT_INFO[key]) key=base+(++i);
  addCategory(key,{label:'Yangi toifa',desc:'',priceRange:[10000,15000],color:'#16a34a'});
  applyCategoryStyles();
  persist(); renderCatManager(); rerenderActive();
  toast("Kategoriya qo'shildi — belgisini va nomini o'zgartiring");
}
function removeCat(key){
  const res=deleteCategory(key);
  if(res==='inuse'){ toast("Bu kategoriya ishlatilmoqda — avval bo'shating"); return; }
  if(res===false){ toast("Kamida bitta kategoriya qolishi kerak"); return; }
  applyCategoryStyles();
  persist(); renderCatManager(); rerenderActive();
  toast("Kategoriya o'chirildi");
}

// ═══════════════ BILDIRISHNOMALAR ═══════════════
let notifications = [];

function buildNotifications(){
  const list=[];
  if(_isLoading()){ notifications=list; return; }
  const _isDes=typeof isDesignerRole==='function'&&isDesignerRole();
  const myId=_isDes&&typeof getMyDesignerId==='function'?getMyDesignerId():null;
  const src=_isDes?projects.filter(p=>p.designerId===myId):projects;
  src.filter(p=>p.status!=='done'&&p.deadline&&deadlineDays(p.deadline)<0).forEach(p=>{
    const d=designers.find(x=>x.id===p.designerId);
    list.push({id:'od-'+p.id,type:'overdue',projId:p.id,title:`Muddati o'tdi: ${p.title}`,sub:`${d?.name||''} · ${Math.abs(deadlineDays(p.deadline))} kun o'tgan`,read:false,time:p.deadline});
  });
  src.filter(p=>p.status!=='done'&&p.deadline&&deadlineDays(p.deadline)===0).forEach(p=>{
    const d=designers.find(x=>x.id===p.designerId);
    list.push({id:'td-'+p.id,type:'today',projId:p.id,title:`Bugun muddat: ${p.title}`,sub:d?.name||'',read:false,time:p.deadline});
  });
  src.filter(p=>p.status!=='done'&&p.deadline&&deadlineDays(p.deadline)>0&&deadlineDays(p.deadline)<=3).forEach(p=>{
    const d=designers.find(x=>x.id===p.designerId);
    list.push({id:'soon-'+p.id,type:'soon',projId:p.id,title:`${deadlineDays(p.deadline)} kun qoldi: ${p.title}`,sub:d?.name||'',read:false,time:p.deadline});
  });
  if(!_isDes){
    src.filter(p=>p.status==='review').forEach(p=>{
      const d=designers.find(x=>x.id===p.designerId);
      list.push({id:'rev-'+p.id,type:'review',projId:p.id,title:`Ko'rib chiqish kerak: ${p.title}`,sub:d?.name||'',read:false,time:p.date});
    });
  }
  src.filter(p=>p.penaltyApplied===true&&p.status!=='done').forEach(p=>{
    list.push({id:'pen-'+p.id,type:'penalty',projId:p.id,title:`Jarima: ${p.title}`,sub:`Kechiktirilgani uchun ${fmtPrice(p.originalPricePerUnit*p.units)} → ${fmtPrice(p.pricePerUnit*p.units)} so'm (−30%)`,read:false,time:p.deadline});
  });
  const saved=JSON.parse(localStorage.getItem('exon_notif_read')||'[]');
  list.forEach(n=>{ if(saved.includes(n.id)) n.read=true; });
  notifications=list;
}

function renderNotifPanel(){
  buildNotifications();
  const unread=notifications.filter(n=>!n.read).length;
  const badge=document.getElementById('notif-badge');
  if(badge){ badge.textContent=unread; badge.classList.toggle('show',unread>0); }
  const el=document.getElementById('notif-list');
  if(!el) return;
  if(!notifications.length){ el.innerHTML='<div class="notif-item" style="color:var(--muted2);font-size:12.5px">Bildirishnomalar yo\'q</div>'; return; }
  const dotColor={overdue:'var(--error)',today:'var(--error)',soon:'var(--warning)',review:'var(--accent2)',penalty:'var(--error)'};
  el.innerHTML=notifications.map(n=>`
    <div class="notif-item${n.read?'':' unread'}" style="cursor:pointer" onclick="notifClick('${n.id}')">
      <div class="notif-item-title"><span class="notif-dot" style="background:${dotColor[n.type]||'var(--muted)'}"></span>${esc(n.title)}</div>
      ${n.sub?`<div class="notif-item-sub">${esc(n.sub)}</div>`:''}
      <div class="notif-item-time">${n.time||''}</div>
    </div>`).join('');
}

function notifClick(nid){
  const saved=JSON.parse(localStorage.getItem('exon_notif_read')||'[]');
  if(!saved.includes(nid)) saved.push(nid);
  localStorage.setItem('exon_notif_read',JSON.stringify(saved));
  document.getElementById('notif-panel').classList.remove('open');
  const n=notifications.find(x=>x.id===nid);
  if(!n) return;
  if(n.projId){
    openProjectPeek(n.projId);
  }
}

function toggleNotifPanel(){
  const el=document.getElementById('notif-panel');
  el.classList.toggle('open');
  if(el.classList.contains('open')) renderNotifPanel();
}

function markAllRead(){
  buildNotifications();
  localStorage.setItem('exon_notif_read',JSON.stringify(notifications.map(n=>n.id)));
  renderNotifPanel();
  document.getElementById('notif-panel').classList.remove('open');
}
