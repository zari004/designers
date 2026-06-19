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

  const isImage = file.type.startsWith('image/') && file.size < 10*1024*1024;
  const method = isImage ? 'sendPhoto' : 'sendDocument';
  const fieldName = isImage ? 'photo' : 'document';

  const url = c.proxyUrl.replace(/\/+$/,'') + '/bot' + c.botToken + '/' + method;

  const formData = new FormData();
  formData.append('chat_id', channelId);
  formData.append(fieldName, file, file.name);
  if(caption) formData.append('caption', caption);
  formData.append('parse_mode', 'Markdown');

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);

    xhr.upload.onprogress = (e) => {
      if(e.lengthComputable && onProgress){
        onProgress(Math.round(e.loaded / e.total * 100));
      }
    };

    xhr.onload = () => {
      if(xhr.status >= 200 && xhr.status < 300){
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error('Telegram xatosi: ' + xhr.responseText));
      }
    };

    xhr.onerror = () => reject(new Error('Tarmoq xatosi'));
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
  const filesInput = document.getElementById('tg-file-input');
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
    if(statusEl) statusEl.innerHTML = renderTgProgress('Loyiha ma\'lumoti yuborilmoqda...', 0);
    await tgSendMessage(channelId, caption);

    // 2. Fayllarni yuborish
    for(let i = 0; i < files.length; i++){
      const f = files[i];
      const fileCaption = files.length > 1 ? `📎 ${i+1}/${files.length}: ${f.name}` : `📎 ${f.name}`;
      if(statusEl) statusEl.innerHTML = renderTgProgress(
        `${f.name} yuborilmoqda (${formatFileSize(f.size)})...`,
        0, i+1, files.length
      );
      await tgSendFile(channelId, f, fileCaption, (pct) => {
        if(statusEl) statusEl.innerHTML = renderTgProgress(
          `${f.name} yuborilmoqda...`,
          pct, i+1, files.length
        );
      });
    }

    // 3. Figma link yuborish
    if(figmaLink){
      if(statusEl) statusEl.innerHTML = renderTgProgress('Figma link yuborilmoqda...', 90);
      await tgSendMessage(channelId, `🎨 *Figma:* ${figmaLink}`);
    }

    // 4. Muvaffaqiyat
    if(statusEl) statusEl.innerHTML = `
      <div class="tg-success">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg>
        <span>Barcha fayllar muvaffaqiyatli yuborildi!</span>
      </div>`;

    // Loyihaga yetkazilganlik belgisi
    projects = projects.map(pr => pr.id===projectId ? {...pr, tgDelivered: true, tgDeliveredAt: new Date().toISOString()} : pr);
    persist();

    toast('Fayllar Telegram kanalga yuborildi!');

  } catch(err) {
    console.error('Telegram yuborish xatosi:', err);
    if(statusEl) statusEl.innerHTML = `
      <div class="tg-error">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
        <span>Xatolik: ${esc(err.message)}</span>
      </div>`;
    toast('Yuborishda xatolik yuz berdi');
  } finally {
    if(sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Telegramga yuborish'; }
  }
}

function renderTgProgress(text, pct, current, total){
  const countText = total ? ` (${current}/${total})` : '';
  return `<div class="tg-progress-wrap">
    <div class="tg-progress-text">${text}${countText}</div>
    <div class="tg-progress-bar"><div class="tg-progress-fill" style="width:${pct}%"></div></div>
    <div class="tg-progress-pct">${pct}%</div>
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
