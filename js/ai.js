// ═══════════════════════════════════════════════
// AI YORDAMCHI — ovoz/matn → rasmiy loyiha tavsifi
// OpenAI Whisper (ovoz→matn, o'zbekcha) + GPT-4o-mini (rasmiylashtirish)
// ═══════════════════════════════════════════════

const AI_KEY_STORE = 'exon_openai_key';

function getAiKey(){ return localStorage.getItem(AI_KEY_STORE)||''; }
function saveAiKey(k){ localStorage.setItem(AI_KEY_STORE, k.trim()); }

// ── MODAL OCHISH ──
function openAiAssistant(){
  if(!getAiKey()){
    // Sozlamalarga o'tib kalit kiritishni so'rash
    if(confirm("AI yordamchi uchun OpenAI API kaliti kerak.\nSozlamalar sahifasiga o'tish?")){
      showPanel('settings');
      setTimeout(()=>{ const el=document.getElementById('ai-key-inp'); if(el){ el.focus(); el.scrollIntoView({behavior:'smooth',block:'center'}); } },300);
    }
    return;
  }
  _showAiModal();
}

let _aiRecorder=null, _aiChunks=[], _aiRecording=false;

function _showAiModal(){
  const tt=byId('modal-title-text'); if(tt) tt.textContent='AI Yordamchi';
  const mb=byId('modal-body'); if(!mb) return;
  mb.innerHTML=`
    <p style="color:var(--muted);font-size:13px;margin:0 0 14px">
      Loyiha haqida qisqacha gapiring yoki yozing — AI rasmiy hujjatga aylantiradi.
    </p>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <button class="btn btn-primary ai-mic-btn" id="ai-mic-btn" onclick="aiToggleRec()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        Mikrofon
      </button>
      <span id="ai-rec-status" style="font-size:12px;color:var(--muted)">Bosing va gapiring</span>
    </div>
    <div class="form-group">
      <label class="form-label">Yoki matn yozing</label>
      <textarea class="form-input" id="ai-text-inp" rows="4"
        placeholder="Masalan: Aziz uchun mobil ilova dizayni kerak, 5 ta ekran, 10 kun muddatda, yuqori muhimlik, animatsiyali onboarding bo'lsin..."
        style="width:100%;resize:vertical"></textarea>
    </div>
    <button class="btn btn-primary" onclick="aiProcess()" style="width:100%;margin-top:4px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:6px"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 18l-6.2 3 1.2-6.8L2 9.3l6.9-1z"/></svg>
      Tahlil qilish
    </button>
    <div id="ai-result" style="display:none;margin-top:18px"></div>
  `;
  byId('modal').style.display='flex';
}

// ── SOZLAMALAR: API KALIT ──
function aiKeyChange(val){
  const hint=document.getElementById('ai-key-hint');
  if(hint) hint.textContent = val.trim().startsWith('sk-') ? 'Kalit to\'g\'ri ko\'rinadi ✓' : 'Kalit faqat sizning qurilmangizda (localStorage) saqlanadi';
}
function aiSaveKey(){
  const val=(document.getElementById('ai-key-inp')?.value||'').trim();
  if(!val){ toast("API kalit bo'sh"); return; }
  if(!val.startsWith('sk-')){ toast("Kalit sk- bilan boshlanishi kerak"); return; }
  saveAiKey(val);
  _aiUpdateSettingsBadge();
  toast("OpenAI API kaliti saqlandi ✓");
}
function aiClearKey(){
  localStorage.removeItem(AI_KEY_STORE);
  const el=document.getElementById('ai-key-inp'); if(el) el.value='';
  _aiUpdateSettingsBadge();
  toast("Kalit o'chirildi");
}
function _aiUpdateSettingsBadge(){
  const badge=document.getElementById('ai-status-badge');
  if(!badge) return;
  const has=!!getAiKey();
  badge.style.display=has?'':'none';
}
// Sozlamalar sahifasi ochilganda kalit qiymatini yuklash (renderSettingsPage dan chaqiriladi)
function loadAiSettings(){
  const el=document.getElementById('ai-key-inp');
  if(el) el.value=getAiKey();
  _aiUpdateSettingsBadge();
}

// ── MIKROFON YOZISH ──
async function aiToggleRec(){
  if(_aiRecording){ aiStopRec(); return; }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    _aiChunks=[];
    _aiRecorder=new MediaRecorder(stream,{mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':'audio/ogg;codecs=opus'});
    _aiRecorder.ondataavailable=e=>{ if(e.data.size>0) _aiChunks.push(e.data); };
    _aiRecorder.onstop=()=>{ stream.getTracks().forEach(t=>t.stop()); aiSendAudio(); };
    _aiRecorder.start(200);
    _aiRecording=true;
    const btn=byId('ai-mic-btn'); if(btn){ btn.classList.add('ai-mic-active'); btn.querySelector('svg').style.stroke='#ef4444'; }
    const st=byId('ai-rec-status'); if(st) st.innerHTML='<span class="ai-rec-dot"></span> Yozilmoqda… qayta bosing — to\'xtatish';
  }catch(e){
    toast("Mikrofonga ruxsat berilmadi: "+e.message);
  }
}
function aiStopRec(){
  if(!_aiRecorder||!_aiRecording) return;
  _aiRecording=false;
  _aiRecorder.stop();
  const btn=byId('ai-mic-btn'); if(btn){ btn.classList.remove('ai-mic-active'); btn.querySelector('svg').style.stroke=''; }
  const st=byId('ai-rec-status'); if(st) st.textContent='Yuborilmoqda…';
}

// ── WHISPER → MATN ──
async function aiSendAudio(){
  if(!_aiChunks.length) return;
  const blob=new Blob(_aiChunks,{type:_aiRecorder?.mimeType||'audio/webm'});
  const fd=new FormData();
  fd.append('file', blob, 'audio.webm');
  fd.append('model','whisper-1');
  fd.append('language','uz');
  try{
    const res=await fetch('https://api.openai.com/v1/audio/transcriptions',{
      method:'POST',
      headers:{'Authorization':'Bearer '+getAiKey()},
      body:fd,
    });
    if(!res.ok){ const e=await res.json(); throw new Error(e.error?.message||res.statusText); }
    const data=await res.json();
    const tx=byId('ai-text-inp');
    if(tx){ tx.value=(tx.value.trim()+' '+data.text).trim(); }
    const st=byId('ai-rec-status'); if(st) st.textContent='Ovoz matnga aylandi ✓';
  }catch(e){
    toast("Whisper xatosi: "+e.message);
    const st=byId('ai-rec-status'); if(st) st.textContent='Xatolik — qayta urinib ko\'ring';
  }
}

// ── GPT ORQALI RASMIYLASHTIRISH ──
async function aiProcess(){
  const text=(byId('ai-text-inp')?.value||'').trim();
  if(!text){ toast("Avval matn yozing yoki gapiring"); return; }

  const res=byId('ai-result'); if(!res) return;
  res.style.display='block';
  res.innerHTML=`<div style="text-align:center;padding:20px;color:var(--muted)"><div class="ai-loader"></div><div style="margin-top:8px;font-size:13px">AI tahlil qilmoqda…</div></div>`;

  const today=new Date().toISOString().slice(0,10);
  const catList=typeof catKeys==='function'?catKeys().join(', '):'A, B, C';

  const systemPrompt=`Sen dizaynerlar boshqaruv tizimi uchun loyiha tahlilchisissan. Foydalanuvchi qisqa ma'lumot beradi, sen uni rasmiy loyiha hujjatiga aylantirasan.

Mavjud kategoriyalar: ${catList}

Faqat JSON qaytargin, boshqa hech narsa yozma:
{
  "title": "aniq va qisqa loyiha nomi (3-8 so'z)",
  "descHtml": "<p>rasmiy batafsil tavsif HTML formatida (2-4 paragraf, <strong> va <ul> ishlatsa bo'ladi)</p>",
  "priority": "low yoki medium yoki high",
  "deadline": "YYYY-MM-DD yoki null",
  "category": "yuqoridagi kategoriyalardan biri yoki null"
}

Qoidalar:
- title: konkret, qisqa, professional
- descHtml: rasmiy uslubda — maqsad, qamrov va kutilayotgan natija yozilsin
- priority: high=shoshilinch, medium=oddiy, low=vaqti bor
- deadline: muddati aytilsa hisoblang (bugun: ${today}), aks holda null
- category: faqat mavjud kategoriyalardan tanlang yoki null`;

  try{
    const resp=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Authorization':'Bearer '+getAiKey(),'Content-Type':'application/json'},
      body:JSON.stringify({
        model:'gpt-4o-mini',
        messages:[{role:'system',content:systemPrompt},{role:'user',content:text}],
        temperature:0.4,
        max_tokens:800,
      }),
    });
    if(!resp.ok){ const e=await resp.json(); throw new Error(e.error?.message||resp.statusText); }
    const data=await resp.json();
    const raw=data.choices[0]?.message?.content||'';
    let parsed;
    try{
      const jsonStr=raw.replace(/```json|```/g,'').trim();
      parsed=JSON.parse(jsonStr);
    }catch{
      throw new Error("AI javobi noto'g'ri formatda. Qayta urining.");
    }
    _showAiResult(parsed, text);
  }catch(e){
    res.innerHTML=`<div style="color:var(--error);padding:12px;background:rgba(239,68,68,.08);border-radius:8px;font-size:13px">Xatolik: ${esc(e.message)}</div>`;
  }
}

function _showAiResult(p, originalText){
  const res=byId('ai-result'); if(!res) return;
  const priLabel={low:"Past",medium:"O'rta",high:"Yuqori"}[p.priority]||p.priority||'—';
  const priColor={low:"var(--muted)",medium:"var(--warning)",high:"var(--error)"}[p.priority]||'var(--muted)';
  res.innerHTML=`
    <div style="border:1.5px solid var(--accent);border-radius:10px;overflow:hidden">
      <div style="background:var(--accent-soft);padding:10px 16px;display:flex;align-items:center;justify-content:space-between">
        <span style="font-weight:700;font-size:13px;color:var(--accent-text)">AI taklifi</span>
        <div style="display:flex;gap:6px;font-size:11px">
          <span style="background:var(--hover);padding:2px 8px;border-radius:6px;color:${priColor}">${priLabel}</span>
          ${p.deadline?`<span style="background:var(--hover);padding:2px 8px;border-radius:6px;color:var(--muted)">${p.deadline}</span>`:''}
          ${p.category?`<span style="background:var(--hover);padding:2px 8px;border-radius:6px;color:var(--muted)">${esc(p.category)}</span>`:''}
        </div>
      </div>
      <div style="padding:14px 16px">
        <div style="font-weight:700;font-size:15px;margin-bottom:8px">${esc(p.title||'')}</div>
        <div class="rich" style="font-size:13px;line-height:1.6;color:var(--muted)">${p.descHtml||''}</div>
      </div>
      <div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="aiApply(${JSON.stringify(JSON.stringify(p))})">
          ✓ Tasdiqlash — loyihaga qo'shish
        </button>
        <button class="btn btn-ghost" onclick="aiProcess()">Qayta tahlil</button>
      </div>
    </div>`;
}

// ── TASDIQLASH: FORMANI TO'LDIRISH ──
function aiApply(jsonStr){
  let p;
  try{ p=JSON.parse(jsonStr); }catch{ toast("Xatolik"); return; }

  // Peek panelida bo'lsak — maydonlarni to'ldiramiz
  if(byId('pk-title')&&byId('pk-rte')){
    if(p.title){ const el=byId('pk-title'); if(el&&!el.value.trim()) el.value=p.title; }
    if(p.descHtml){
      const rte=byId('pk-rte');
      if(rte){ rte.innerHTML=p.descHtml; rteInput&&rteInput(); }
    }
    if(p.priority){ const el=byId('pk-priority'); if(el) el.value=p.priority; }
    if(p.deadline){ const el=byId('pk-deadline'); if(el) el.value=p.deadline; }
    if(p.category && typeof CAT_INFO!=='undefined' && CAT_INFO[p.category]){
      const el=byId('pk-cat');
      if(el){ el.value=p.category; typeof peekCatChange==='function'&&peekCatChange(); }
    }
    if(p.title && byId('pk-title')){ byId('pk-title').value=byId('pk-title').value||p.title; }
    typeof closeModal==='function'&&closeModal();
    toast("Loyiha to'ldirildi ✓");
  } else {
    // Peek ochiq emas — yangi loyiha modal ochib to'ldirish
    typeof openProjectPeek==='function'&&openProjectPeek();
    setTimeout(()=>aiApply(jsonStr), 400);
  }
}
