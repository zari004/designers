// ═══════════════════════════════════════════════
// TELEGRAM INTEGRATSIYA — Tayyor ishlarni kanalga yuborish
// Proxy server orqali: Brauzer → Proxy → Telegram
// ═══════════════════════════════════════════════

function tgCfg(){
  return {
    botToken:  localStorage.getItem('tg_bot_token')||'',
    proxyUrl:  localStorage.getItem('tg_proxy_url')||'',
  };
}

function tgDesignerChannel(designerId){
  try{
    const map = JSON.parse(localStorage.getItem('tg_channels')||'{}');
    return map[designerId] || '';
  }catch(e){ return ''; }
}

function tgSetDesignerChannel(designerId, channelId){
  try{
    const map = JSON.parse(localStorage.getItem('tg_channels')||'{}');
    map[designerId] = channelId;
    localStorage.setItem('tg_channels', JSON.stringify(map));
    saveSettingToFirestore('tgChannels', JSON.stringify(map));
  }catch(e){}
}

function isTgReady(){
  const c = tgCfg();
  return !!(c.botToken && c.proxyUrl);
}

let _tgAutoSaveTimer = null;
function tgAutoSave(){
  localStorage.setItem('tg_bot_token', document.getElementById('tg-bot-token')?.value||'');
  localStorage.setItem('tg_proxy_url', document.getElementById('tg-proxy-url')?.value||'');
  clearTimeout(_tgAutoSaveTimer);
  _tgAutoSaveTimer = setTimeout(()=>{
    saveSettingToFirestore('tgBotToken', localStorage.getItem('tg_bot_token')||'');
    saveSettingToFirestore('tgProxyUrl', localStorage.getItem('tg_proxy_url')||'');
  }, 700);
  if(typeof _stgUpdateBadges==='function') _stgUpdateBadges();
  updateTgStatus();
}

function updateTgStatus(){
  const el = document.getElementById('tg-status');
  if(!el) return;
  const c = tgCfg();
  if(c.botToken && c.proxyUrl){
    el.innerHTML = '<span style="color:var(--success)">✓ Bot token va proxy tayyor</span>';
  } else {
    const missing = [];
    if(!c.botToken) missing.push('Bot token');
    if(!c.proxyUrl) missing.push('Proxy URL');
    el.innerHTML = `<span style="color:var(--warning)">${missing.join(' va ')} kiritilmagan</span>`;
  }
}

// ── FAYL YUKLASH HOLATI ──
let _tgUploadQueue = [];
let _tgUploading = false;

function tgBuildCaption(project, designer){
  const cat = typeof CAT_INFO!=='undefined' && CAT_INFO[project.category]
    ? CAT_INFO[project.category].label : project.category;
  const total = (project.units||1) * (project.pricePerUnit||0);
  let caption = `📁 *${project.title}*\n`;
  caption += `👤 ${designer?.name||'—'}`;
  if(cat) caption += ` • ${cat}`;
  caption += `\n💰 ${fmtPrice(total)} so'm`;
  if(project.deadline) caption += `\n📅 Muddat: ${project.deadline}`;
  if(project.doneDate) caption += `\n✅ Bajarildi: ${project.doneDate}`;
  return caption;
}

async function tgSendMessage(channelId, text){
  const c = tgCfg();
  if(!c.botToken || !c.proxyUrl) throw new Error('Telegram sozlanmagan');
  const url = c.proxyUrl.replace(/\/+$/,'') + '/bot' + c.botToken + '/sendMessage';
  const res = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      chat_id: channelId,
      text: text,
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    })
  });
  if(!res.ok){
    const err = await res.text();
    throw new Error('Telegram xatosi: ' + err);
  }
  return res.json();
}

async function tgSendFile(channelId, file, caption, onProgress){
  const c = tgCfg();
  if(!c.botToken || !c.proxyUrl) throw new Error('Telegram sozlanmagan');

  const method = 'sendDocument';
  const fieldName = 'document';

  const url = c.proxyUrl.replace(/\/+$/,'') + '/bot' + c.botToken + '/' + method;

  const formData = new FormData();
  formData.append('chat_id', channelId);
  formData.append(fieldName, file, file.name);
  if(caption) formData.append('caption', caption);
  formData.append('parse_mode', 'Markdown');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = 5 * 60 * 1000;

    xhr.upload.onprogress = (e) => {
      if(e.lengthComputable && onProgress){
        onProgress({ phase:'upload', loaded: e.loaded, total: e.total, pct: Math.round(e.loaded / e.total * 100) });
      }
    };

    xhr.upload.onload = () => {
      if(onProgress) onProgress({ phase:'processing', loaded: file.size, total: file.size, pct: 100 });
    };

    xhr.onload = () => {
      if(xhr.status >= 200 && xhr.status < 300){
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error('Telegram xatosi: ' + xhr.responseText));
      }
    };

    xhr.onerror = () => reject(new Error('Tarmoq xatosi'));
    xhr.ontimeout = () => reject(new Error('Vaqt tugadi (5 daqiqa)'));
    xhr.send(formData);
  });
}

// ── ASOSIY YUBORISH FUNKSIYASI ──
async function tgDeliverProject(projectId){
  const p = projects.find(x=>x.id===projectId);
  if(!p) { toast('Loyiha topilmadi'); return; }
  const d = designers.find(x=>x.id===p.designerId);
  const channelId = tgDesignerChannel(p.designerId);

  if(!channelId){
    toast('Bu dizayner uchun Telegram kanal belgilanmagan');
    return;
  }
  if(!isTgReady()){
    toast('Telegram sozlamalari to\'ldirilmagan — Sozlamalarga o\'ting');
    return;
  }

  const uploadEl = document.getElementById('tg-upload-area');
  const filesInput = document.getElementById('tg-file-real');
  const figmaInput = document.getElementById('tg-figma-link');
  const statusEl = document.getElementById('tg-delivery-status');

  const files = filesInput?._files || [];
  const figmaLink = figmaInput?.value?.trim() || '';

  if(!files.length && !figmaLink){
    toast('Kamida bitta fayl yoki Figma link kiriting');
    return;
  }

  const sendBtn = document.getElementById('tg-send-btn');
  if(sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Yuborilmoqda...'; }

  try {
    const caption = tgBuildCaption(p, d);

    // 1. Avval loyiha haqida xabar
    if(statusEl) statusEl.innerHTML = renderTgProgress('Loyiha ma\'lumoti yuborilmoqda...');
    await tgSendMessage(channelId, caption);

    // 2. Fayllarni yuborish
    const totalSize = files.reduce((s,f)=>s+f.size, 0);
    let sentSize = 0;
    for(let i = 0; i < files.length; i++){
      const f = files[i];
      const fileCaption = files.length > 1 ? `📎 ${i+1}/${files.length}: ${f.name}` : `📎 ${f.name}`;
      if(statusEl) statusEl.innerHTML = renderTgProgress({
        fileName: f.name, fileSize: f.size,
        loaded: 0, phase: 'upload',
        current: i+1, total: files.length,
        sentSize, totalSize
      });
      await tgSendFile(channelId, f, fileCaption, (info) => {
        if(statusEl) statusEl.innerHTML = renderTgProgress({
          fileName: f.name, fileSize: f.size,
          loaded: info.loaded, phase: info.phase,
          pct: info.pct,
          current: i+1, total: files.length,
          sentSize, totalSize
        });
      });
      sentSize += f.size;
    }

    // 3. Figma link yuborish
    if(figmaLink){
      if(statusEl) statusEl.innerHTML = renderTgProgress('Figma link yuborilmoqda...');
      await tgSendMessage(channelId, `🎨 *Figma:* ${figmaLink}`);
    }

    // 4. Muvaffaqiyat — loyihani "Ko'rib chiqilmoqda"ga o'tkazish
    const wasWip = p.status === 'wip';
    if(statusEl) statusEl.innerHTML = `
      <div class="tg-success">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
        <span>Ishlar yuborildi!${wasWip ? ' Loyiha "Ko\'rib chiqilmoqda"ga o\'tdi.' : ''}</span>
      </div>`;

    projects = projects.map(pr => {
      if(pr.id!==projectId) return pr;
      const upd = {...pr, tgDelivered: true, tgDeliveredAt: new Date().toISOString()};
      // Jarayonda → Ko'rib chiqilmoqda (topshirilgandan keyin)
      if(pr.status==='wip') upd.status = 'review';
      return upd;
    });
    persist();

    toast('Ishlar Telegram kanalga yuborildi!');

    // Modal orqali ochilgan bo'lsa — yopib, doskani yangilash
    if(document.getElementById('tg-deliver-modal-flag')){
      setTimeout(()=>{ closeModal(); if(typeof rerenderActive==='function') rerenderActive(); }, 1400);
    } else if(typeof rerenderActive==='function'){
      rerenderActive();
    }

  } catch(err) {
    console.error('Telegram yuborish xatosi:', err);
    if(statusEl) statusEl.innerHTML = `
      <div class="tg-error">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
        <span>Xatolik: ${esc(err.message)}</span>
      </div>`;
    toast('Yuborishda xatolik yuz berdi');
  } finally {
    if(sendBtn) { sendBtn.disabled = false; sendBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Topshirish'; }
  }
}

// ── TOPSHIRISH MODALI (qalqib chiquvchi oyna) ──
function openDeliveryModal(projectId){
  const p = projects.find(x=>x.id===projectId);
  if(!p){ toast('Loyiha topilmadi'); return; }
  const d = designers.find(x=>x.id===p.designerId);
  const channelId = tgDesignerChannel(p.designerId);
  _tgZoneFiles.design = []; _tgZoneFiles.material = [];

  const tt = document.getElementById('modal-title-text');
  if(tt) tt.textContent = 'Ishlarni topshirish';
  const mb = document.getElementById('modal-body');
  if(!mb) return;

  if(!channelId){
    mb.innerHTML = `<div id="tg-deliver-modal-flag" style="display:none"></div>
      <div style="padding:10px 4px">
        <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">${esc(p.title)}</div>
        <div class="tg-channel-note" style="color:var(--warning);font-size:13px">
          Sizning Telegram kanalingiz hali admin tomonidan sozlanmagan.
          Iltimos, administrator bilan bog'laning.
        </div>
      </div>`;
    document.getElementById('modal').style.display='flex';
    return;
  }

  const zone = (key, label, sub, accept) => `
    <div class="tg-zone-block">
      <div class="tg-zone-label">${label}</div>
      <div class="tg-upload-zone" id="tg-area-${key}"
        ondragover="event.preventDefault();this.classList.add('dragover')"
        ondragleave="this.classList.remove('dragover')"
        ondrop="tgHandleDrop2(event,'${key}')">
        <input type="file" id="tg-file-${key}" multiple style="display:none" onchange="tgHandleFiles2(this.files,'${key}')" accept="${accept}"/>
        <div class="tg-upload-placeholder" id="tg-ph-${key}" onclick="document.getElementById('tg-file-${key}').click()">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>${sub}</span>
        </div>
        <div class="tg-file-list" id="tg-list-${key}"></div>
      </div>
    </div>`;

  mb.innerHTML = `<div id="tg-deliver-modal-flag" style="display:none"></div>
    <div style="margin-bottom:14px">
      <div style="font-size:13.5px;font-weight:700;margin-bottom:3px">${esc(p.title)}</div>
      <div style="font-size:12px;color:var(--muted)">Dizayn rasmlarini va materiallar/PSD fayllarini alohida yuklang. Ikkalasi ham yuklangach «Topshirish» faollashadi.</div>
    </div>

    ${zone('design','🎨 Dizayn rasmlari','Tayyor rasmlarni tashlang · PNG, JPG','image/*')}
    ${zone('material','📦 Materiallar va PSD','PSD, AI, ZIP, fayllarni tashlang','.psd,.ai,.eps,.pdf,.zip,.rar,.fig,.sketch,image/*')}

    <div class="tg-figma-row">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2a4 4 0 0 0-4 4 4 4 0 0 0 0 8 4 4 0 0 0 4 4 4 4 0 0 0 0-8 4 4 0 0 0-4-4z"/></svg>
      <input class="form-input" id="tg-figma-link" placeholder="Figma link (ixtiyoriy)" style="flex:1"/>
    </div>

    <div id="tg-delivery-status"></div>

    <button class="btn btn-primary tg-send-btn" id="tg-send-btn" onclick="tgSubmitDelivery(${p.id})" style="width:100%;margin-top:12px;justify-content:center" disabled>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      Topshirish
    </button>
    <div id="tg-submit-hint" style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px">Ikkala bo'limga ham fayl yuklang</div>`;

  document.getElementById('modal').style.display='flex';
}

// ── IKKI ZONALI FAYL BOSHQARUVI ──
const _tgZoneFiles = { design: [], material: [] };

function tgHandleDrop2(e, zone){
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  tgHandleFiles2(e.dataTransfer.files, zone);
}

function tgHandleFiles2(fileList, zone){
  if(!_tgZoneFiles[zone]) _tgZoneFiles[zone] = [];
  for(const f of fileList){
    if(!_tgZoneFiles[zone].some(x=>x.name===f.name && x.size===f.size)){
      _tgZoneFiles[zone].push(f);
    }
  }
  tgRenderZoneList(zone);
  _tgUpdateSubmitState();
}

function tgRemoveFile2(idx, zone){
  if(_tgZoneFiles[zone]) _tgZoneFiles[zone].splice(idx, 1);
  tgRenderZoneList(zone);
  _tgUpdateSubmitState();
}

function tgRenderZoneList(zone){
  const el = document.getElementById('tg-list-'+zone);
  const files = _tgZoneFiles[zone] || [];
  if(!el) return;
  const ph = document.getElementById('tg-ph-'+zone);
  if(!files.length){
    el.innerHTML = '';
    if(ph) ph.style.display = '';
    return;
  }
  if(ph) ph.style.display = 'none';
  el.innerHTML = files.map((f, i) => {
    const isImg = f.type.startsWith('image/');
    const thumb = isImg ? URL.createObjectURL(f) : null;
    return `<div class="tg-file-item">
      ${thumb ? `<img class="tg-file-thumb" src="${thumb}" alt="${esc(f.name)}"/>` : `<div class="tg-file-icon">${getFileIcon(f.name)}</div>`}
      <div class="tg-file-info">
        <div class="tg-file-name">${esc(f.name)}</div>
        <div class="tg-file-size">${formatFileSize(f.size)}</div>
      </div>
      <button class="tg-file-remove" onclick="tgRemoveFile2(${i},'${zone}')" title="Olib tashlash">×</button>
    </div>`;
  }).join('') + `
    <div class="tg-file-add" onclick="document.getElementById('tg-file-${zone}').click()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Yana qo'shish
    </div>`;
}

function _tgUpdateSubmitState(){
  const btn = document.getElementById('tg-send-btn');
  const hint = document.getElementById('tg-submit-hint');
  if(!btn) return;
  const hasDesign = (_tgZoneFiles.design||[]).length > 0;
  const hasMaterial = (_tgZoneFiles.material||[]).length > 0;
  const ok = hasDesign && hasMaterial;
  btn.disabled = !ok;
  if(hint){
    if(ok){ hint.style.display='none'; }
    else {
      hint.style.display='';
      const need=[];
      if(!hasDesign) need.push('dizayn rasmlari');
      if(!hasMaterial) need.push('materiallar/PSD');
      hint.textContent = need.join(' va ')+' yuklang';
    }
  }
}

// ── IKKI ZONALI TOPSHIRISH ──
async function tgSubmitDelivery(projectId){
  const p = projects.find(x=>x.id===projectId);
  if(!p){ toast('Loyiha topilmadi'); return; }
  const d = designers.find(x=>x.id===p.designerId);
  const channelId = tgDesignerChannel(p.designerId);
  if(!channelId){ toast('Telegram kanal belgilanmagan'); return; }
  if(!isTgReady()){ toast('Telegram sozlamalari to\'ldirilmagan'); return; }

  const designFiles = _tgZoneFiles.design || [];
  const materialFiles = _tgZoneFiles.material || [];
  if(!designFiles.length || !materialFiles.length){
    toast('Ikkala bo\'limga ham fayl yuklang');
    return;
  }
  const figmaLink = document.getElementById('tg-figma-link')?.value?.trim() || '';
  const statusEl = document.getElementById('tg-delivery-status');
  const sendBtn = document.getElementById('tg-send-btn');
  if(sendBtn){ sendBtn.disabled = true; sendBtn.textContent = 'Yuborilmoqda...'; }

  // Barcha fayllar: avval dizayn rasmlari, keyin materiallar
  const allFiles = [
    ...designFiles.map(f=>({file:f, tag:'🎨 Dizayn'})),
    ...materialFiles.map(f=>({file:f, tag:'📦 Material'}))
  ];

  try{
    if(statusEl) statusEl.innerHTML = renderTgProgress('Loyiha ma\'lumoti yuborilmoqda...');
    await tgSendMessage(channelId, tgBuildCaption(p, d));

    const totalSize = allFiles.reduce((s,x)=>s+x.file.size, 0);
    let sentSize = 0;
    for(let i=0; i<allFiles.length; i++){
      const { file:f, tag } = allFiles[i];
      const cap = `${tag} ${i+1}/${allFiles.length}: ${f.name}`;
      if(statusEl) statusEl.innerHTML = renderTgProgress({fileName:f.name,fileSize:f.size,loaded:0,phase:'upload',current:i+1,total:allFiles.length,sentSize,totalSize});
      await tgSendFile(channelId, f, cap, (info)=>{
        if(statusEl) statusEl.innerHTML = renderTgProgress({fileName:f.name,fileSize:f.size,loaded:info.loaded,phase:info.phase,pct:info.pct,current:i+1,total:allFiles.length,sentSize,totalSize});
      });
      sentSize += f.size;
    }

    if(figmaLink){
      if(statusEl) statusEl.innerHTML = renderTgProgress('Figma link yuborilmoqda...');
      await tgSendMessage(channelId, `🎨 *Figma:* ${figmaLink}`);
    }

    if(statusEl) statusEl.innerHTML = `
      <div class="tg-success">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
        <span>Ishlar yuborildi! Loyiha "Ko'rib chiqilmoqda"ga o'tdi.</span>
      </div>`;

    projects = projects.map(pr=>{
      if(pr.id!==projectId) return pr;
      const upd={...pr, tgDelivered:true, tgDeliveredAt:new Date().toISOString()};
      if(pr.status==='wip') upd.status='review';
      return upd;
    });
    persist();
    toast('Ishlar Telegram kanalga yuborildi!');
    _tgZoneFiles.design = []; _tgZoneFiles.material = [];
    setTimeout(()=>{ closeModal(); if(typeof rerenderActive==='function') rerenderActive(); }, 1400);

  }catch(err){
    console.error('Telegram yuborish xatosi:', err);
    if(statusEl) statusEl.innerHTML = `
      <div class="tg-error">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
        <span>Xatolik: ${esc(err.message)}</span>
      </div>`;
    toast('Yuborishda xatolik');
    if(sendBtn){ sendBtn.disabled=false; sendBtn.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Topshirish'; }
  }
}


function renderTgProgress(info){
  if(typeof info === 'string') return `<div class="tg-progress-wrap"><div class="tg-progress-text">${info}</div></div>`;

  const { fileName, fileSize, loaded, phase, pct, current, total, sentSize, totalSize } = info;
  const loadedMB = formatFileSize(loaded||0);
  const totalMB = formatFileSize(fileSize||0);
  const allSentMB = formatFileSize((sentSize||0) + (loaded||0));
  const allTotalMB = formatFileSize(totalSize||0);

  let statusText, barPct;
  if(phase === 'processing'){
    statusText = `⏳ ${fileName} — serverdan Telegramga uzatilmoqda...`;
    barPct = 100;
  } else {
    statusText = `${fileName} — ${loadedMB} / ${totalMB}`;
    barPct = pct || 0;
  }

  return `<div class="tg-progress-wrap">
    <div class="tg-progress-text">
      <span>${statusText}</span>
      <span>${current}/${total}</span>
    </div>
    <div class="tg-progress-bar"><div class="tg-progress-fill${phase==='processing'?' processing':''}" style="width:${barPct}%"></div></div>
    <div class="tg-progress-meta">
      <span>Jami: ${allSentMB} / ${allTotalMB}</span>
      <span>${barPct}%</span>
    </div>
  </div>`;
}

function formatFileSize(bytes){
  if(bytes < 1024) return bytes + ' B';
  if(bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
  if(bytes < 1024*1024*1024) return (bytes/(1024*1024)).toFixed(1) + ' MB';
  return (bytes/(1024*1024*1024)).toFixed(2) + ' GB';
}

// ── FAYL YUKLASH UI ──
function renderDeliverySection(project){
  if(!project || project.status !== 'done') return '';
  const d = designers.find(x=>x.id===project.designerId);
  const channelId = tgDesignerChannel(project.designerId);
  const delivered = project.tgDelivered;

  return `
    <div class="tg-delivery-section${delivered ? ' delivered' : ''}">
      <div class="tg-delivery-header">
        <div class="tg-delivery-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        </div>
        <div>
          <div class="tg-delivery-title">Ishlarni topshirish</div>
          <div class="tg-delivery-sub">${d?.name||'Dizayner'} kanaliga yuboriladi${delivered ? ' · ✓ Yuborilgan' : ''}</div>
        </div>
      </div>

      ${!channelId ? `
        <div class="tg-channel-setup">
          <div class="tg-channel-note">Bu dizayner uchun Telegram kanal ID si belgilanmagan</div>
          <div style="display:flex;gap:8px;align-items:center">
            <input class="form-input" id="tg-quick-channel" placeholder="@kanal_nomi yoki -100..." style="flex:1;font-size:13px"/>
            <button class="btn btn-primary btn-sm" onclick="tgQuickSetChannel(${project.designerId})">Saqlash</button>
          </div>
        </div>
      ` : `
        <div class="tg-upload-zone" id="tg-upload-area"
          ondragover="event.preventDefault();this.classList.add('dragover')"
          ondragleave="this.classList.remove('dragover')"
          ondrop="tgHandleDrop(event)">
          <input type="file" id="tg-file-real" multiple style="display:none" onchange="tgHandleFiles(this.files)" accept="image/*,.psd,.ai,.eps,.pdf,.zip,.rar,.fig,.sketch"/>
          <div class="tg-upload-placeholder" id="tg-upload-placeholder" onclick="document.getElementById('tg-file-real').click()">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Fayllarni shu yerga tashlang</span>
            <span class="tg-upload-hint">yoki bosib tanlang · PSD, PNG, JPG, ZIP, Figma...</span>
          </div>
          <div class="tg-file-list" id="tg-file-list"></div>
        </div>

        <div class="tg-figma-row">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2a4 4 0 0 0-4 4 4 4 0 0 0 0 8 4 4 0 0 0 4 4 4 4 0 0 0 0-8 4 4 0 0 0-4-4z"/></svg>
          <input class="form-input" id="tg-figma-link" placeholder="Figma link (ixtiyoriy)" style="flex:1"/>
        </div>

        <div id="tg-delivery-status"></div>

        <button class="btn btn-primary tg-send-btn" id="tg-send-btn" onclick="tgDeliverProject(${project.id})">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          Telegramga yuborish
        </button>
      `}
    </div>`;
}

// ── FILE HANDLING ──
function tgHandleDrop(e){
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  tgHandleFiles(e.dataTransfer.files);
}

function tgHandleFiles(fileList){
  const input = document.getElementById('tg-file-real');
  if(!input._files) input._files = [];
  for(const f of fileList){
    if(!input._files.some(x=>x.name===f.name && x.size===f.size)){
      input._files.push(f);
    }
  }
  tgRenderFileList();
}

function tgRemoveFile(idx){
  const input = document.getElementById('tg-file-real');
  if(input._files) input._files.splice(idx, 1);
  tgRenderFileList();
}

function tgRenderFileList(){
  const el = document.getElementById('tg-file-list');
  const input = document.getElementById('tg-file-real');
  const files = input?._files || [];
  if(!el) return;

  if(!files.length){
    el.innerHTML = '';
    document.getElementById('tg-upload-placeholder')?.style.setProperty('display','');
    return;
  }
  document.getElementById('tg-upload-placeholder')?.style.setProperty('display','none');

  el.innerHTML = files.map((f, i) => {
    const isImg = f.type.startsWith('image/');
    const icon = getFileIcon(f.name);
    const thumb = isImg ? URL.createObjectURL(f) : null;
    return `<div class="tg-file-item">
      ${thumb
        ? `<img class="tg-file-thumb" src="${thumb}" alt="${esc(f.name)}"/>`
        : `<div class="tg-file-icon">${icon}</div>`
      }
      <div class="tg-file-info">
        <div class="tg-file-name">${esc(f.name)}</div>
        <div class="tg-file-size">${formatFileSize(f.size)}</div>
      </div>
      <button class="tg-file-remove" onclick="tgRemoveFile(${i})" title="Olib tashlash">×</button>
    </div>`;
  }).join('') + `
    <div class="tg-file-add" onclick="document.getElementById('tg-file-real').click()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Yana qo'shish
    </div>`;
}

function getFileIcon(name){
  const ext = name.split('.').pop().toLowerCase();
  const icons = {
    psd:'<span style="color:#31A8FF;font-weight:700">Ps</span>',
    ai:'<span style="color:#FF9A00;font-weight:700">Ai</span>',
    fig:'<span style="color:#A259FF;font-weight:700">Fig</span>',
    sketch:'<span style="color:#FDAD00;font-weight:700">Sk</span>',
    pdf:'<span style="color:#F40F02;font-weight:700">PDF</span>',
    zip:'<span style="color:#FFB800;font-weight:700">ZIP</span>',
    rar:'<span style="color:#6C5CE7;font-weight:700">RAR</span>',
    eps:'<span style="color:#FF6B35;font-weight:700">EPS</span>',
    svg:'<span style="color:#FFB13B;font-weight:700">SVG</span>',
  };
  return icons[ext] || `<span style="color:var(--muted);font-weight:600">${ext.toUpperCase()}</span>`;
}

function tgQuickSetChannel(designerId){
  const val = document.getElementById('tg-quick-channel')?.value?.trim();
  if(!val){ toast('Kanal ID kiriting'); return; }
  tgSetDesignerChannel(designerId, val);
  toast('Kanal saqlandi');
  if(peekProjId) openProjectPeek(peekProjId);
}

// Kanal xaritasini sozlamalar sahifasida ko'rsatish
function renderTgChannelMap(){
  const el = document.getElementById('tg-channel-list');
  if(!el) return;
  let map;
  try{ map = JSON.parse(localStorage.getItem('tg_channels')||'{}'); }catch(e){ map={}; }

  if(!designers.length){
    el.innerHTML = '<div class="form-hint">Dizaynerlar topilmadi</div>';
    return;
  }

  el.innerHTML = designers.filter(d=>d.status!=='away').map(d=>{
    const ch = map[d.id] || '';
    return `<div class="tg-ch-row">
      <div class="tg-ch-name">${esc(d.name)}</div>
      <input class="form-input tg-ch-input" value="${esc(ch)}"
        placeholder="@kanal yoki -100..."
        onchange="tgSetDesignerChannel(${d.id},this.value.trim())"/>
    </div>`;
  }).join('');
}
