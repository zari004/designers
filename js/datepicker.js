// ════════════════════════════════════════════════
// O'ZBEK TAQVIMI — Custom Date Picker
// • Yashil ranglar (var(--accent))
// • Uzbek oy / kun nomlari
// • 4 ta tezkor tugma: Bugun, Ertaga, 7 kun, 30 kun
// • data-iso-date atributida YYYY-MM-DD saqlanadi
// ════════════════════════════════════════════════

const UZ_MONTHS = ['Yanvar','Fevral','Mart','Aprel','May','Iyun','Iyul','Avgust','Sentabr','Oktabr','Noyabr','Dekabr'];
const UZ_DAYS_S = ['Du','Se','Ch','Pa','Ju','Sh','Ya'];

// ISO → "16 Iyun 2026"
function dpFmt(iso){
  if(!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y,m,d] = iso.split('-').map(Number);
  return `${d} ${UZ_MONTHS[m-1]} ${y}`;
}

let _dp = { el:null, y:0, m:0 };

function dpOpen(el){
  _dp.el = el;
  const iso = el.dataset.isoDate || '';
  if(iso && /^\d{4}-\d{2}-\d{2}$/.test(iso)){
    const [y,m] = iso.split('-').map(Number);
    _dp.y = y; _dp.m = m - 1;
  } else {
    const n = new Date(); _dp.y = n.getFullYear(); _dp.m = n.getMonth();
  }
  _dpEnsure();
  _dpRender();
  const pop = document.getElementById('dp-pop');
  pop.style.display = 'block';
  _dpPos(el);
  setTimeout(()=>{ document.addEventListener('mousedown', _dpOut); }, 60);
}

function dpClose(){
  const pop = document.getElementById('dp-pop');
  if(pop) pop.style.display = 'none';
  document.removeEventListener('mousedown', _dpOut);
  _dp.el = null;
}

function _dpOut(e){
  const pop = document.getElementById('dp-pop');
  if(pop && pop.contains(e.target)) return;
  if(_dp.el && _dp.el === e.target) return;
  dpClose();
}

function _dpEnsure(){
  if(document.getElementById('dp-pop')) return;
  const pop = document.createElement('div');
  pop.id = 'dp-pop'; pop.className = 'dp-pop';
  pop.style.display = 'none';
  document.body.appendChild(pop);
}

function _dpPos(el){
  const pop = document.getElementById('dp-pop');
  if(!pop || !el) return;
  const r = el.getBoundingClientRect();
  const pw = 292, ph = 420;
  let l = r.left, t = r.bottom + 6;
  if(l + pw > window.innerWidth - 8)  l = window.innerWidth - pw - 8;
  if(t + ph > window.innerHeight - 8) t = r.top - ph - 6;
  pop.style.left = Math.max(8, l) + 'px';
  pop.style.top  = Math.max(8, t) + 'px';
}

function _dpRender(){
  const pop = document.getElementById('dp-pop'); if(!pop) return;
  const selIso = _dp.el?.dataset.isoDate || '';
  const selDate = (selIso && /^\d{4}-\d{2}-\d{2}$/.test(selIso))
    ? new Date(selIso + 'T00:00:00') : null;
  const today = new Date(); today.setHours(0,0,0,0);

  const first = new Date(_dp.y, _dp.m, 1);
  const startDow = (first.getDay() + 6) % 7;   // Mon=0
  const dim = new Date(_dp.y, _dp.m + 1, 0).getDate();
  const prevDim = new Date(_dp.y, _dp.m, 0).getDate();
  const total = Math.ceil((startDow + dim) / 7) * 7;

  let cells = '';
  for(let i = 0; i < total; i++){
    const dn = i - startDow + 1;
    if(i < startDow){
      cells += `<div class="dp-day dp-other">${prevDim - startDow + i + 1}</div>`;
    } else if(dn > dim){
      cells += `<div class="dp-day dp-other">${dn - dim}</div>`;
    } else {
      const date = new Date(_dp.y, _dp.m, dn);
      const isTd  = date.getTime() === today.getTime();
      const isSel = selDate && date.getTime() === selDate.getTime();
      const isWk  = (i % 7) >= 5;
      let cls = 'dp-day';
      if(isSel)      cls += ' dp-sel';
      else if(isTd)  cls += ' dp-today';
      else if(isWk)  cls += ' dp-wknd';
      cells += `<div class="${cls}" onclick="_dpPick(${_dp.y},${_dp.m+1},${dn})">${dn}</div>`;
    }
  }

  const ICONS = {
    sun:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    rise: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M17 18a5 5 0 0 0-10 0"/><path d="M12 2v4M4.93 10.93l2.83 2.83M19.07 10.93l-2.83 2.83M2 18h20M12 6v2"/></svg>',
    week: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v3M16 2v3M9 14h6M9 18h4"/></svg>',
    moon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
  };

  const quick = [
    { ic:ICONS.sun,  t:'Bugun',  fn:'_dpQk(0)' },
    { ic:ICONS.rise, t:'Ertaga', fn:'_dpQk(1)' },
    { ic:ICONS.week, t:'7 kun',  fn:'_dpQk(7)' },
    { ic:ICONS.moon, t:'30 kun', fn:'_dpQk(30)' },
  ];

  pop.innerHTML = `
    <div class="dp-quick">
      ${quick.map(q=>`<button class="dp-qbtn" onclick="${q.fn}">${q.ic}<span>${q.t}</span></button>`).join('')}
    </div>
    <div class="dp-nav">
      <button class="dp-nbtn" onclick="_dpPm()">‹</button>
      <div class="dp-ntitle">${UZ_MONTHS[_dp.m]} <span class="dp-nyear">${_dp.y}</span></div>
      <button class="dp-nbtn" onclick="_dpNm()">›</button>
    </div>
    <div class="dp-grid">
      ${UZ_DAYS_S.map(d=>`<div class="dp-dow">${d}</div>`).join('')}
      ${cells}
    </div>
    <div class="dp-foot">
      <button class="dp-ok" onclick="dpClose()">OK</button>
      <button class="dp-clr" onclick="_dpClr()">Tozalash</button>
    </div>`;
}

function _dpPick(y, m, d){
  const iso = `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  if(_dp.el){
    _dp.el.dataset.isoDate = iso;
    _dp.el.value = dpFmt(iso);
    _dp.el.dispatchEvent(new Event('change', {bubbles:true}));
  }
  _dpRender();
  setTimeout(dpClose, 120);
}

function _dpQk(days){
  const t = new Date(); t.setDate(t.getDate() + days);
  _dpPick(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

function _dpPm(){ _dp.m--; if(_dp.m < 0){ _dp.m = 11; _dp.y--; } _dpRender(); }
function _dpNm(){ _dp.m++; if(_dp.m > 11){ _dp.m = 0;  _dp.y++; } _dpRender(); }

function _dpClr(){
  if(_dp.el){
    _dp.el.dataset.isoDate = '';
    _dp.el.value = '';
    _dp.el.dispatchEvent(new Event('change', {bubbles:true}));
  }
  dpClose();
}
