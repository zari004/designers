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

// ── FORUM MAVZULARI (TOPICS) ──
// Faol mavzu — yuborish vaqtida o'rnatiladi; barcha xabarlar shu mavzuga ketadi.
let _tgThreadId = null;

// Telegram xato matnidan tushunarli sabab chiqarish
function _tgFriendlyError(raw){
  const low = (raw||'').toLowerCase();
  let desc = raw || '';
  const m = (raw||'').match(/"description"\s*:\s*"([^"]+)"/);
  if(m) desc = m[1];

  if(low.includes('chat not found'))
    return "Guruh topilmadi. Guruh ID noto'g'ri yoki bot guruhga qo'shilmagan. To'g'ri ID: -100... (taklif havolasi emas).";
  if(low.includes('not a forum') || low.includes('topic') && low.includes('disabled') || low.includes('forum'))
    return "Guruhda 'Mavzular' (Topics) yoqilmagan. Guruh sozlamalari → Topics ni yoqing.";
  if(low.includes('not enough rights') || low.includes('admin') || low.includes('can_manage_topics') || low.includes('rights to manage'))
    return "Bot huquqi yetarli emas. Botni admin qiling va 'Manage Topics' (Mavzularni boshqarish) huquqini bering.";
  if(low.includes('bot is not a member') || low.includes('member of the'))
    return "Bot guruhda emas. Avval botni guruhga qo'shing.";
  if(low.includes('supergroup'))
    return "Bu oddiy guruh. Topics faqat superguruhda ishlaydi (Topics yoqilsa guruh avtomatik superguruhga aylanadi).";
  return desc;
}

// Guruhda yangi mavzu (forum topic) ochish → message_thread_id qaytaradi.
// Guruh superguruh bo'lib, Mavzular (Topics) yoqilgan va bot admin bo'lishi kerak.
async function tgCreateTopic(groupId, name){
  let res;
  try{
    res = await tgApiFetch('createForumTopic', () => ({
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ chat_id: groupId, name: (name||'Loyiha').slice(0,128) })
    }));
  }catch(e){
    throw new Error("Mavzu ochib bo'lmadi — " + _tgFriendlyError(e.message));
  }
  const tid = res?.result?.message_thread_id;
  if(!tid) throw new Error("Mavzu ochilmadi — guruh sozlamalarini tekshiring.");
  return tid;
}

// Mavzuni butun ichidagi xabarlar bilan o'chirish (bot can_delete_messages bo'lishi kerak)
async function tgDeleteTopic(groupId, threadId){
  return tgApiFetch('deleteForumTopic', () => ({
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: groupId, message_thread_id: threadId })
  }));
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

function _tgDelay(ms){ return new Promise(r => setTimeout(r, ms)); }

// Telegram "retry_after" (429) ni avtomatik kutib qayta urinadigan fetch
async function tgApiFetch(method, buildReq, retries){
  const c = tgCfg();
  if(!c.botToken || !c.proxyUrl) throw new Error('Telegram sozlanmagan');
  const url = c.proxyUrl.replace(/\/+$/,'') + '/bot' + c.botToken + '/' + method;
  const maxRetries = (retries==null) ? 6 : retries;
  for(let attempt=0; ; attempt++){
    const { body, headers } = buildReq();
    const res = await fetch(url, { method:'POST', headers, body });
    if(res.ok) return res.json();
    const errText = await res.text();
    const m = errText.match(/"retry_after":\s*(\d+)/);
    if(m && attempt < maxRetries){
      const wait = (parseInt(m[1],10) + 1) * 1000;
      if(typeof _tgRetryNotice==='function') _tgRetryNotice(wait);
      await _tgDelay(wait);
      continue;
    }
    throw new Error('Telegram xatosi: ' + errText);
  }
}

async function tgSendMessage(channelId, text, threadId){
  const tid = (threadId!=null) ? threadId : _tgThreadId;
  return tgApiFetch('sendMessage', () => ({
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      chat_id: channelId,
      ...(tid ? { message_thread_id: tid } : {}),
      text: text,
      parse_mode: 'Markdown',
      disable_web_page_preview: false
    })
  }));
}

// Bir nechta faylni ALBOM (guruh) qilib bitta so'rovda yuborish (2-10 ta)
async function tgSendMediaGroup(channelId, files, caption, asPhoto, threadId){
  const tid = (threadId!=null) ? threadId : _tgThreadId;
  const type = asPhoto ? 'photo' : 'document';
  return tgApiFetch('sendMediaGroup', () => {
    const fd = new FormData();
    fd.append('chat_id', channelId);
    if(tid) fd.append('message_thread_id', tid);
    const media = files.map((f, i) => {
      const item = { type, media: `attach://file${i}` };
      if(i===0 && caption){ item.caption = caption; item.parse_mode = 'Markdown'; }
      return item;
    });
    fd.append('media', JSON.stringify(media));
    files.forEach((f, i) => fd.append('file'+i, f, f.name));
    return { body: fd }; // multipart — Content-Type'ni brauzer o'zi qo'yadi
  });
}

// Bitta faylni yuborish (albom kamida 2 ta talab qiladi — 1 ta uchun)
async function tgSendSingle(channelId, file, caption, asPhoto, threadId){
  const tid = (threadId!=null) ? threadId : _tgThreadId;
  const method = asPhoto ? 'sendPhoto' : 'sendDocument';
  const field  = asPhoto ? 'photo' : 'document';
  return tgApiFetch(method, () => {
    const fd = new FormData();
    fd.append('chat_id', channelId);
    if(tid) fd.append('message_thread_id', tid);
    fd.append(field, file, file.name);
    if(caption){ fd.append('caption', caption); fd.append('parse_mode', 'Markdown'); }
    return { body: fd };
  });
}

// Bir bo'lim fayllarini guruhlab yuborish: rasmlar albom, qolganlari hujjat.
// forceDoc=true bo'lsa hammasi hujjat (original sifat) sifatida ketadi.
async function tgSendSectionFiles(channelId, files, label, forceDoc, threadId){
  if(label) { await tgSendMessage(channelId, label, threadId); await _tgDelay(300); }

  const PHOTO_MAX = 10 * 1024 * 1024;
  const photos = forceDoc ? [] : files.filter(f => f.type.startsWith('image/') && f.size <= PHOTO_MAX);
  const docs   = forceDoc ? files.slice() : files.filter(f => !(f.type.startsWith('image/') && f.size <= PHOTO_MAX));

  const sendChunks = async (arr, asPhoto) => {
    for(let i=0; i<arr.length; i+=10){
      const chunk = arr.slice(i, i+10);
      if(chunk.length === 1){
        await tgSendSingle(channelId, chunk[0], undefined, asPhoto, threadId);
      } else {
        await tgSendMediaGroup(channelId, chunk, undefined, asPhoto, threadId);
      }
      await _tgDelay(400);
    }
  };

  await sendChunks(photos, true);
  await sendChunks(docs, false);
}

// XHR (progress bilan) — 429 da qayta urinadi (peek panel uchun)
async function tgSendFile(channelId, file, caption, onProgress){
  for(let attempt=0; ; attempt++){
    try{
      return await tgSendFileOnce(channelId, file, caption, onProgress);
    }catch(err){
      const m = String(err.message||'').match(/"retry_after":\s*(\d+)/);
      if(m && attempt < 6){ await _tgDelay((parseInt(m[1],10)+1)*1000); continue; }
      throw err;
    }
  }
}

function tgSendFileOnce(channelId, file, caption, onProgress){
  const c = tgCfg();
  if(!c.botToken || !c.proxyUrl) throw new Error('Telegram sozlanmagan');

  const method = 'sendDocument';
  const fieldName = 'document';

  const url = c.proxyUrl.replace(/\/+$/,'') + '/bot' + c.botToken + '/' + method;

  const formData = new FormData();
  formData.append('chat_id', channelId);
  if(_tgThreadId) formData.append('message_thread_id', _tgThreadId);
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

// ── ASOSIY YUBORISH FUNKSIYASI (peek paneldan) ──
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

    if(statusEl) statusEl.innerHTML = renderTgProgress("Loyiha ma'lumoti yuborilmoqda...");
    await tgSendMessage(channelId, caption);

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

    if(figmaLink){
      if(statusEl) statusEl.innerHTML = renderTgProgress('Figma link yuborilmoqda...');
      await tgSendMessage(channelId, `🎨 *Figma:* ${figmaLink}`);
    }

    const wasWip = p.status === 'wip';
    if(statusEl) statusEl.innerHTML = `
      <div class="tg-success">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
        <span>Ishlar yuborildi!${wasWip ? ' Loyiha "Ko\'rib chiqilmoqda"ga o\'tdi.' : ''}</span>
      </div>`;

    projects = projects.map(pr => {
      if(pr.id!==projectId) return pr;
      const upd = {...pr, tgDelivered: true, tgDeliveredAt: new Date().toISOString()};
      if(pr.status==='wip') upd.status = 'review';
      return upd;
    });
    persist();

    toast('Ishlar Telegram kanalga yuborildi!');

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

// ── TOPSHIRISH MODALI — BO'LIMLI YUKLASH TIZIMI ──
let _tgSections = [];     // dizayn rasmlari bo'limlari: { name, files }
let _tgMaterials = [];    // materiallar va PSD fayllari
let _tgDeliveryProjectId = null;

function openDeliveryModal(projectId){
  const p = projects.find(x=>x.id===projectId);
  if(!p){ toast('Loyiha topilmadi'); return; }
  const d = designers.find(x=>x.id===p.designerId);
  const channelId = tgDesignerChannel(p.designerId);
  _tgSections = [];
  _tgMaterials = [];
  _tgDeliveryProjectId = projectId;

  const tt = document.getElementById('modal-title-text');
  if(tt) tt.textContent = 'Ishlarni topshirish';
  const mb = document.getElementById('modal-body');
  if(!mb) return;

  if(!channelId){
    mb.innerHTML = `<div id="tg-deliver-modal-flag" style="display:none"></div>
      <div style="padding:10px 4px">
        <div style="font-size:13.5px;font-weight:600;margin-bottom:6px">${esc(p.title)}</div>
        <div class="tg-channel-note" style="color:var(--warning);font-size:13px">
          Sizning Telegram guruhingiz hali admin tomonidan sozlanmagan.
          Iltimos, administrator bilan bog'laning.
        </div>
      </div>`;
    document.getElementById('modal').style.display='flex';
    return;
  }

  _tgAddSection();

  mb.innerHTML = `<div id="tg-deliver-modal-flag" style="display:none"></div>
    <div class="tg-dlv-head">
      <div class="tg-dlv-title">${esc(p.title)}</div>
      <div class="tg-dlv-sub">Rasmlarni bo'limlarga ajratib yuklang (rang, o'lcham, tarkib…). Har bir bo'lim Telegramга alohida guruh bo'lib boradi.</div>
    </div>

    <div class="tg-group-label"><span>🎨 Dizayn rasmlari</span></div>
    <div id="tg-sections-wrap"></div>

    <button class="tg-add-section-btn" onclick="_tgAddSection();_tgRenderSections()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Yangi bo'lim qo'shish
    </button>

    <div class="tg-group-label" style="margin-top:18px"><span>📦 Materiallar va PSD</span></div>
    <div class="tg-mat-block">
      <div class="tg-upload-zone" id="tg-mat-area"
        ondragover="event.preventDefault();this.classList.add('dragover')"
        ondragleave="this.classList.remove('dragover')"
        ondrop="_tgMatDrop(event)">
        <input type="file" id="tg-mat-file" multiple style="display:none" onchange="_tgMatFiles(this.files)" accept=".psd,.ai,.eps,.pdf,.zip,.rar,.fig,.sketch,image/*"/>
        <div class="tg-upload-placeholder" id="tg-mat-ph" onclick="document.getElementById('tg-mat-file').click()">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
          <span>PSD, AI, ZIP, fayllarni tashlang</span>
        </div>
        <div class="tg-file-list" id="tg-mat-list"></div>
      </div>
    </div>

    <div class="tg-figma-row">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2a4 4 0 0 0-4 4 4 4 0 0 0 0 8 4 4 0 0 0 4 4 4 4 0 0 0 0-8 4 4 0 0 0-4-4z"/></svg>
      <input class="form-input" id="tg-figma-link" placeholder="Figma link (ixtiyoriy)" style="flex:1"/>
    </div>`;

  const modalEl = mb.closest('.modal');
  let footer = modalEl.querySelector('.tg-modal-footer');
  if(footer) footer.remove();
  footer = document.createElement('div');
  footer.className = 'tg-modal-footer';
  footer.innerHTML = `
    <button class="btn btn-primary tg-send-btn" id="tg-send-btn" onclick="tgSubmitDelivery(${p.id})" style="width:100%;justify-content:center" disabled>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      Topshirish
    </button>
    <div id="tg-submit-hint" style="font-size:11px;color:var(--muted);text-align:center;margin-top:6px">Dizayn rasmlarini va materiallarni yuklang</div>`;
  modalEl.appendChild(footer);

  _tgRenderSections();
  _tgRenderMaterials();
  document.getElementById('modal').style.display='flex';
}

// ── DIZAYN BO'LIMLARI ──

function _tgAddSection(){
  _tgSections.push({ name: '', files: [] });
}

function _tgRemoveSection(idx){
  if(_tgSections.length <= 1){ toast("Kamida bitta bo'lim qoldirilishi kerak"); return; }
  _tgSections.splice(idx, 1);
  _tgRenderSections();
  _tgUpdateSubmitState();
}

function _tgRenameSection(idx, name){
  if(_tgSections[idx]) _tgSections[idx].name = name;
}

function _tgRenderSections(){
  const wrap = document.getElementById('tg-sections-wrap');
  if(!wrap) return;
  wrap.innerHTML = _tgSections.map((sec, si) => `
    <div class="tg-section">
      <div class="tg-section-head">
        <span class="tg-section-badge">${si+1}</span>
        <input class="tg-section-name" value="${esc(sec.name)}" placeholder="Bo'lim nomi (masalan: Oq rang, 50x70)" oninput="_tgRenameSection(${si},this.value)"/>
        <span class="tg-section-count">${sec.files.length ? sec.files.length+' ta' : ''}</span>
        ${_tgSections.length>1 ? `<button class="tg-section-del" onclick="_tgRemoveSection(${si})" title="Bo'limni o'chirish">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>` : ''}
      </div>
      <div id="tg-sec-grid-${si}"
        ondragover="event.preventDefault();this.classList.add('tg-grid-drag')"
        ondragleave="this.classList.remove('tg-grid-drag')"
        ondrop="_tgSecDrop(event,${si})">${_tgSecGridHtml(si)}</div>
      <input type="file" id="tg-sec-file-${si}" multiple style="display:none" onchange="_tgSecFiles(this.files,${si})" accept="image/*"/>
    </div>`).join('');
}

function _tgSecGridHtml(si){
  const files = _tgSections[si]?.files || [];
  const tiles = files.map((f, fi) => {
    const isImg = f.type.startsWith('image/');
    const thumb = isImg ? URL.createObjectURL(f) : null;
    return `<div class="tg-thumb" title="${esc(f.name)}">
      ${thumb ? `<img src="${thumb}" alt="${esc(f.name)}"/>` : `<div class="tg-thumb-doc">${getFileIcon(f.name)}</div>`}
      <button class="tg-thumb-del" onclick="_tgSecRemove(${si},${fi})" title="O'chirish">×</button>
    </div>`;
  }).join('');
  return `<div class="tg-thumb-grid">${tiles}
    <div class="tg-thumb-add" onclick="document.getElementById('tg-sec-file-${si}').click()" title="Rasm qo'shish">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      <span>Rasm</span>
    </div>
  </div>`;
}

function _tgSecDrop(e, si){
  e.preventDefault();
  e.currentTarget.classList.remove('tg-grid-drag');
  _tgSecFiles(e.dataTransfer.files, si);
}

function _tgSecFiles(fileList, si){
  const sec = _tgSections[si];
  if(!sec) return;
  for(const f of fileList){
    if(!sec.files.some(x=>x.name===f.name && x.size===f.size)){
      sec.files.push(f);
    }
  }
  _tgRenderSecGrid(si);
  _tgUpdateSubmitState();
}

function _tgSecRemove(si, fi){
  if(_tgSections[si]) _tgSections[si].files.splice(fi, 1);
  _tgRenderSecGrid(si);
  _tgUpdateSubmitState();
}

function _tgRenderSecGrid(si){
  const el = document.getElementById('tg-sec-grid-'+si);
  if(el) el.innerHTML = _tgSecGridHtml(si);
  // sarlavhada sonni yangilash
  const head = el ? el.parentElement.querySelector('.tg-section-count') : null;
  if(head){ const n=_tgSections[si].files.length; head.textContent = n ? n+' ta' : ''; }
}

// ── MATERIALLAR VA PSD ──

function _tgMatDrop(e){
  e.preventDefault();
  e.currentTarget.classList.remove('dragover');
  _tgMatFiles(e.dataTransfer.files);
}

function _tgMatFiles(fileList){
  for(const f of fileList){
    if(!_tgMaterials.some(x=>x.name===f.name && x.size===f.size)){
      _tgMaterials.push(f);
    }
  }
  _tgRenderMaterials();
  _tgUpdateSubmitState();
}

function _tgMatRemove(idx){
  _tgMaterials.splice(idx, 1);
  _tgRenderMaterials();
  _tgUpdateSubmitState();
}

function _tgRenderMaterials(){
  const el = document.getElementById('tg-mat-list');
  const ph = document.getElementById('tg-mat-ph');
  if(!el) return;
  if(!_tgMaterials.length){
    el.innerHTML = '';
    if(ph) ph.style.display = '';
    return;
  }
  if(ph) ph.style.display = 'none';
  el.innerHTML = _tgMaterials.map((f, i) => {
    const isImg = f.type.startsWith('image/');
    const thumb = isImg ? URL.createObjectURL(f) : null;
    return `<div class="tg-file-item">
      ${thumb ? `<img class="tg-file-thumb" src="${thumb}" alt="${esc(f.name)}"/>` : `<div class="tg-file-icon">${getFileIcon(f.name)}</div>`}
      <div class="tg-file-info">
        <div class="tg-file-name">${esc(f.name)}</div>
        <div class="tg-file-size">${formatFileSize(f.size)}</div>
      </div>
      <button class="tg-file-remove" onclick="_tgMatRemove(${i})" title="Olib tashlash">×</button>
    </div>`;
  }).join('') + `
    <div class="tg-file-add" onclick="document.getElementById('tg-mat-file').click()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Yana qo'shish
    </div>`;
}

function _tgUpdateSubmitState(){
  const btn = document.getElementById('tg-send-btn');
  const hint = document.getElementById('tg-submit-hint');
  if(!btn) return;
  const designFiles = _tgSections.reduce((s, sec) => s + sec.files.length, 0);
  const hasDesign = designFiles > 0;
  const hasMaterials = _tgMaterials.length > 0;
  const ok = hasDesign && hasMaterials;
  btn.disabled = !ok;
  if(hint){
    if(ok){ hint.style.display='none'; }
    else {
      let msg = '';
      if(!hasDesign && !hasMaterials) msg = 'Dizayn rasmlarini va materiallarni yuklang';
      else if(!hasDesign) msg = 'Kamida bitta dizayn rasmini yuklang';
      else msg = 'Materiallar (PSD, AI, ZIP) yuklanishi shart';
      hint.style.display=''; hint.textContent = msg;
    }
  }
}

function _tgRetryNotice(waitMs){
  if(_tgSendState && !_tgSendState.finished){
    _tgSendState.retryMsg = `⏳ Telegram chekloviga uchradi — ${Math.round(waitMs/1000)}s kutilmoqda, so'ng davom etadi…`;
    _tgRenderSendSheet();
    return;
  }
  const statusEl = document.getElementById('tg-delivery-status');
  if(statusEl) statusEl.innerHTML = renderTgProgress(`Telegram chekloviga uchradi — ${Math.round(waitMs/1000)}s kutilmoqda, so'ng davom etadi…`);
}

// ── FONDA YUBORISH — KICHIK QALQOVCHI OYNACHA (mini) ──
// Bir nechta yuborish bir vaqtda fonda ketishi mumkin; har biri alohida karta.
let _tgJobs = [];      // [{ id, projectId, projectTitle, steps, sentFiles, totalFiles, finished, error, retryMsg, expanded }]
let _tgJobSeq = 0;

function _tgMiniEnsure(){
  let wrap = document.getElementById('tg-mini-wrap');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'tg-mini-wrap';
    wrap.style.cssText = 'position:fixed;left:18px;bottom:18px;right:auto';
    document.body.appendChild(wrap);
  }
  return wrap;
}

function _tgStepIcon(status){
  if(status==='done')  return '<span class="tg-step-ic done"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg></span>';
  if(status==='sending') return '<span class="tg-step-ic sending"></span>';
  if(status==='error') return '<span class="tg-step-ic error"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></span>';
  return '<span class="tg-step-ic pending"></span>';
}

function _tgJobCardHtml(job){
  const pct = job.totalFiles ? Math.round(job.sentFiles / job.totalFiles * 100) : (job.finished ? 100 : 0);
  let state, headIcon, subLine;
  if(job.error){
    state = 'error';
    headIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
    subLine = 'Yuborishda xatolik';
  } else if(job.finished){
    state = 'done';
    headIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>';
    subLine = 'Yuborildi ✓';
  } else {
    state = 'sending';
    headIcon = '<span class="tg-mini-spin"></span>';
    subLine = `Yuborilmoqda… ${job.sentFiles}/${job.totalFiles} fayl`;
  }

  const rightBtn = job.finished
    ? `<button class="tg-mini-x" onclick="event.stopPropagation();_tgMiniDismiss(${job.id})" title="Yopish">×</button>`
    : `<span class="tg-mini-chev${job.expanded?' open':''}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 9l6 6 6-6"/></svg></span>`;

  const retryHtml = (!job.finished && job.retryMsg)
    ? `<div class="tg-mini-retry">⏳ ${esc(job.retryMsg)}</div>` : '';

  const stepsHtml = job.expanded ? `<div class="tg-mini-steps">${
    job.steps.map(s => `
      <div class="tg-step ${s.status}">
        ${_tgStepIcon(s.status)}
        <div class="tg-step-body">
          <div class="tg-step-title">${s.icon} ${esc(s.title)}</div>
          <div class="tg-step-sub">${esc(s.sub)}</div>
        </div>
        ${s.status==='sending' ? '<span class="tg-step-tag">…</span>' : ''}
        ${s.status==='done' ? '<span class="tg-step-tag ok">✓</span>' : ''}
      </div>`).join('')
  }</div>` : '';

  return `<div class="tg-mini-card ${state}">
    <div class="tg-mini-head" onclick="_tgMiniToggle(${job.id})">
      <span class="tg-mini-ic ${state}">${headIcon}</span>
      <div class="tg-mini-text">
        <div class="tg-mini-title">${esc(job.projectTitle)}</div>
        <div class="tg-mini-sub">${subLine}</div>
      </div>
      ${rightBtn}
    </div>
    <div class="tg-mini-bar"><div class="tg-mini-fill ${state}" style="width:${pct}%"></div></div>
    ${job.error ? `<div class="tg-mini-err">${esc(job.error)}</div>` : ''}
    ${retryHtml}
    ${stepsHtml}
  </div>`;
}

function _tgMiniRender(){
  const wrap = _tgMiniEnsure();
  if(!_tgJobs.length){ wrap.innerHTML=''; wrap.style.display='none'; return; }
  wrap.style.display='flex';
  wrap.innerHTML = _tgJobs.map(_tgJobCardHtml).join('');
}

function _tgMiniToggle(id){
  const job = _tgJobs.find(j=>j.id===id);
  if(!job) return;
  job.expanded = !job.expanded;
  _tgMiniRender();
}

function _tgMiniDismiss(id){
  _tgJobs = _tgJobs.filter(j=>j.id!==id);
  _tgMiniRender();
}

function _tgRetryNotice(waitMs){
  // Eng so'nggi tugamagan ishga cheklov xabarini biriktiramiz
  const job = _tgJobs.filter(j=>!j.finished).pop();
  if(job){
    job.retryMsg = `Telegram cheklovi — ${Math.round(waitMs/1000)}s kutilmoqda…`;
    _tgMiniRender();
  }
}

// ── BO'LIMLI TOPSHIRISH (darhol yopiladi, fonda yuboradi) ──
function tgSubmitDelivery(projectId){
  const p = projects.find(x=>x.id===projectId);
  if(!p){ toast('Loyiha topilmadi'); return; }
  const d = designers.find(x=>x.id===p.designerId);
  const channelId = tgDesignerChannel(p.designerId);
  if(!channelId){ toast('Telegram guruh belgilanmagan'); return; }
  if(!isTgReady()){ toast("Telegram sozlamalari to'ldirilmagan"); return; }

  const designFiles = _tgSections.reduce((s, sec) => s + sec.files.length, 0);
  if(!designFiles){ toast('Kamida bitta dizayn rasmini yuklang'); return; }
  if(!_tgMaterials.length){ toast('Materiallar (PSD, AI, ZIP) yuklanishi shart'); return; }

  const figmaLink = document.getElementById('tg-figma-link')?.value?.trim() || '';

  // Fayllarni nusxalab olamiz (modal yopilgach ham fon ishlashi uchun)
  const sections  = _tgSections.filter(s => s.files.length).map(s => ({ name: s.name, files: s.files.slice() }));
  const materials = _tgMaterials.slice();

  // Modalni DARHOL yopamiz — foydalanuvchi boshqa ishni qilaversin
  _tgSections = []; _tgMaterials = [];
  closeModal();
  toast('Yuborish boshlandi — fonda davom etadi');

  // Fonda yuborishni boshlaymiz (kutmaymiz)
  _tgRunDeliveryJob(p, d, channelId, sections, materials, figmaLink);
}

async function _tgRunDeliveryJob(p, d, channelId, sections, materials, figmaLink){
  const totalFiles = sections.reduce((s,sec)=>s+sec.files.length,0) + materials.length;

  const steps = [];
  steps.push({ key:'topic', icon:'🗂', title:'Guruhda mavzu ochilmoqda', sub:p.title, files:0, status:'pending' });
  steps.push({ key:'caption', icon:'📝', title:"Loyiha ma'lumoti", sub:'matn xabari', files:0, status:'pending' });
  sections.forEach((sec, si)=>{
    const nm = sec.name ? `: ${sec.name}` : '';
    steps.push({ key:'sec'+si, icon:'🎨', title:`Bo'lim ${si+1}${nm}`, sub:`${sec.files.length} ta rasm`, files:sec.files.length, status:'pending' });
  });
  steps.push({ key:'materials', icon:'📦', title:'Materiallar va PSD', sub:`${materials.length} ta fayl`, files:materials.length, status:'pending' });
  if(figmaLink) steps.push({ key:'figma', icon:'🔗', title:'Figma havola', sub:'link', files:0, status:'pending' });

  const job = { id:++_tgJobSeq, projectId:p.id, projectTitle:p.title, steps, sentFiles:0, totalFiles, finished:false, error:null, retryMsg:null, expanded:false };
  _tgJobs.push(job);
  _tgMiniRender();

  const begin  = (i)=>{ steps[i].status='sending'; job.retryMsg=null; _tgMiniRender(); };
  const finish = (i)=>{ steps[i].status='done'; job.sentFiles += steps[i].files; _tgMiniRender(); };

  let idx = 0;
  let topicId = null;
  try{
    // 1) Guruhda loyiha uchun yangi mavzu ochish
    begin(idx);
    topicId = await tgCreateTopic(channelId, p.title);
    finish(idx); await _tgDelay(300); idx++;

    begin(idx);
    await tgSendMessage(channelId, tgBuildCaption(p, d), topicId);
    finish(idx); await _tgDelay(350); idx++;

    for(let si = 0; si < sections.length; si++){
      const sec = sections[si];
      const name = sec.name ? `: ${sec.name}` : '';
      const label = `📂 *Bo'lim ${si+1}${name}* — ${sec.files.length} ta rasm`;
      begin(idx);
      await tgSendSectionFiles(channelId, sec.files, label, true, topicId);
      finish(idx); await _tgDelay(350); idx++;
    }

    begin(idx);
    await tgSendSectionFiles(channelId, materials, `📦 *Materiallar va PSD* — ${materials.length} ta fayl`, true, topicId);
    finish(idx); await _tgDelay(350); idx++;

    if(figmaLink){
      begin(idx);
      await tgSendMessage(channelId, `🎨 *Figma:* ${figmaLink}`, topicId);
      finish(idx); idx++;
    }

    job.finished = true;
    _tgMiniRender();

    projects = projects.map(pr=>{
      if(pr.id!==p.id) return pr;
      const upd={...pr, tgDelivered:true, tgDeliveredAt:new Date().toISOString(), tgGroupId:channelId, tgTopicId:topicId};
      if(pr.status==='wip') upd.status='review';
      return upd;
    });
    persist();
    toast(`"${p.title}" — guruhga yuborildi!`);
    if(typeof rerenderActive==='function') rerenderActive();

    // Kengaytirilmagan bo'lsa, biroz turib o'zi yo'qoladi
    setTimeout(()=>{ if(!job.expanded) _tgMiniDismiss(job.id); }, 9000);

  }catch(err){
    console.error('Telegram yuborish xatosi:', err);
    if(steps[idx]) steps[idx].status = 'error';
    job.error = err.message || 'Nomaʼlum xatolik';
    job.finished = true;
    _tgMiniRender();
    toast(`"${p.title}" — yuborishda xatolik`);
  }
}

// ── LOYIHANI RAD ETISH (guruhdagi mavzuni o'chirish) ──
async function tgRejectDelivery(projectId){
  const p = projects.find(x=>x.id===projectId);
  if(!p){ toast('Loyiha topilmadi'); return; }
  if(!confirm("Loyiha rad etilsinmi? Guruhdagi mavzu va undagi BARCHA fayllar butunlay o'chadi, loyiha 'Jarayonda'ga qaytadi.")) return;

  const btn = document.getElementById('tg-reject-btn');
  if(btn){ btn.disabled = true; btn.textContent = "O'chirilmoqda…"; }

  try{
    if(p.tgGroupId && p.tgTopicId){
      await tgDeleteTopic(p.tgGroupId, p.tgTopicId);
    }
    projects = projects.map(pr => pr.id!==projectId ? pr
      : ({...pr, status:'wip', tgDelivered:false, tgDeliveredAt:null, tgGroupId:null, tgTopicId:null}));
    persist();
    toast("Loyiha rad etildi — guruhdan o'chirildi");
    if(typeof closePeek==='function') closePeek();
    if(typeof rerenderActive==='function') rerenderActive();
  }catch(err){
    console.error('Rad etish xatosi:', err);
    toast("O'chirishda xatolik: " + (err.message||''));
    if(btn){ btn.disabled = false; btn.innerHTML = _tgRejectBtnInner(); }
  }
}

function _tgRejectBtnInner(){
  return '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg> Rad etish (guruhdan o\'chirish)';
}

// Peek panelda review holatidagi yuborilgan loyiha uchun "Rad etish" bloki
function renderReviewActions(p){
  if(!p || p.status!=='review' || !p.tgDelivered || !p.tgTopicId) return '';
  if(typeof isDesignerRole==='function' && isDesignerRole()) return '';
  return `
    <div class="tg-reject-box">
      <div class="tg-reject-info">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/></svg>
        <span>Bu loyiha Telegram guruhiga yuborilgan. Rad etilsa — guruhdagi mavzu va undagi barcha fayllar butunlay o'chiriladi.</span>
      </div>
      <button class="btn tg-reject-btn" id="tg-reject-btn" onclick="tgRejectDelivery(${p.id})">${_tgRejectBtnInner()}</button>
    </div>`;
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

// ── FAYL YUKLASH UI (peek panel uchun) ──
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

// ── FILE HANDLING (peek panel uchun) ──
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
  if(!val){ toast('Guruh ID kiriting'); return; }
  tgSetDesignerChannel(designerId, val);
  toast('Guruh saqlandi');
  if(peekProjId) openProjectPeek(peekProjId);
}

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
        placeholder="Guruh ID: -100..."
        onchange="tgValidateGroupInput(${d.id}, this)"/>
    </div>`;
  }).join('');
}

// Guruh ID maydonini tekshirib saqlash — taklif havolasi/noto'g'ri formatni rad etadi
function tgValidateGroupInput(designerId, inputEl){
  let val = (inputEl.value||'').trim();
  inputEl.classList.remove('input-error');

  if(!val){ tgSetDesignerChannel(designerId, ''); return; }

  // Taklif havolasi yoki har qanday URL — yaramaydi
  if(/^https?:\/\//i.test(val) || val.includes('t.me/') || val.includes('+')){
    inputEl.classList.add('input-error');
    toast("Bu havola — raqamli ID kerak. \"Guruh ID sini aniqlash\" tugmasidan foydalaning.");
    return;
  }

  // Avtomatik tuzatish: "100..." kiritilsa, oldiga "-" qo'shamiz (superguruh manfiy bo'ladi)
  if(/^100\d{5,}$/.test(val)){
    val = '-' + val;
    inputEl.value = val;
    toast("ID tuzatildi: -100... (superguruh manfiy bo'ladi)");
  }

  // To'g'ri format: -100... (superguruh) yoki @username
  const ok = /^-100\d{5,}$/.test(val) || /^@[A-Za-z0-9_]{4,}$/.test(val);
  if(!ok){
    inputEl.classList.add('input-error');
    toast("Noto'g'ri format. To'g'ri: -100... (superguruh ID si)");
    return;
  }

  tgSetDesignerChannel(designerId, val);
  toast('Guruh ID saqlandi');
}

// Bot ko'rgan guruhlarni getUpdates orqali aniqlab, ID larini ko'rsatish
async function tgDetectGroups(){
  const box = document.getElementById('tg-detect-result');
  if(!isTgReady()){ toast("Avval Bot token va Proxy URL ni kiriting"); return; }
  if(box) box.innerHTML = '<div class="form-hint">Tekshirilmoqda…</div>';

  try{
    const res = await tgApiFetch('getUpdates', () => ({
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ allowed_updates: [], limit: 100 })
    }), 1);

    const updates = res?.result || [];
    const groups = {};
    updates.forEach(u => {
      const msg = u.message || u.edited_message || u.channel_post || u.my_chat_member || u.chat_member;
      const chat = msg?.chat;
      if(chat && (chat.type === 'group' || chat.type === 'supergroup')){
        groups[chat.id] = chat.title || '(nomsiz guruh)';
      }
    });

    const list = Object.entries(groups);
    if(!list.length){
      if(box) box.innerHTML = `<div class="settings-note" style="font-size:12px;color:var(--warning)">
        Hech qanday guruh topilmadi. Botni guruhga <strong>admin</strong> qiling va guruhda <strong>biror xabar yozing</strong> (yoki botni qayta qo'shing), so'ng yana urinib ko'ring.
      </div>`;
      return;
    }

    if(box) box.innerHTML = `
      <div class="form-hint" style="margin-bottom:6px">Topilgan guruhlar — ID ni nusxalab, tegishli dizayner maydoniga qo'ying:</div>
      ${list.map(([id, title]) => `
        <div class="tg-detect-row">
          <div class="tg-detect-info">
            <div class="tg-detect-title">${esc(title)}</div>
            <code class="tg-detect-id">${esc(id)}</code>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="tgCopyText('${esc(String(id))}')">Nusxa</button>
        </div>`).join('')}`;
  }catch(err){
    console.error('getUpdates xatosi:', err);
    if(box) box.innerHTML = `<div class="settings-note" style="font-size:12px;color:var(--error)">Xatolik: ${esc(err.message||'')}</div>`;
  }
}

function tgCopyText(txt){
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(txt).then(()=>toast('ID nusxalandi')).catch(()=>toast('Nusxalab bo\'lmadi'));
  } else {
    const ta = document.createElement('textarea');
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try{ document.execCommand('copy'); toast('ID nusxalandi'); }catch(e){ toast('Nusxalab bo\'lmadi'); }
    document.body.removeChild(ta);
  }
}
