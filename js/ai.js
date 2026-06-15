// ═══════════════════════════════════════════════
// AI YORDAMCHI — ovoz/matn → rasmiy loyiha tavsifi
// Groq API — bepul, tez, O'zbekistonda ishlaydi
//   · Ovoz  → Whisper-large-v3 (o'zbekcha)
//   · Matn  → LLaMA-3.3-70b-versatile
// ═══════════════════════════════════════════════

const AI_KEY_STORE   = 'exon_groq_key';
const GROQ_STT_URL   = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_CHAT_URL  = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_CHAT_MODEL = 'llama-3.3-70b-versatile';
const GROQ_STT_MODEL  = 'whisper-large-v3';

function getAiKey(){ return localStorage.getItem(AI_KEY_STORE)||''; }
function saveAiKey(k){ localStorage.setItem(AI_KEY_STORE, k.trim()); }

// ── FIRESTORE SINXRONIZATSIYA ──
async function aiSyncKeyFromFirestore(){
  try{
    if(typeof getDb!=='function'||!getDb()) return;
    const snap=await getDb().collection('exon').doc('settings').get();
    if(snap.exists){
      const k=snap.data()?.groqKey||'';
      if(k && !getAiKey()){ saveAiKey(k); _aiUpdateSettingsBadge(); const el=document.getElementById('ai-key-inp'); if(el) el.value=k; }
    }
  }catch(e){ console.warn('AI kalit yuklash:', e); }
}
async function _aiSaveKeyToFirestore(k){
  try{
    if(typeof getDb!=='function'||!getDb()) return;
    await getDb().collection('exon').doc('settings').set({groqKey:k},{merge:true});
  }catch(e){ console.warn('AI kalit saqlash:', e); }
}

// ── MODAL OCHISH ──
function openAiAssistant(){
  if(!getAiKey()){
    if(confirm("AI yordamchi uchun Groq API kaliti kerak.\nSozlamalar sahifasiga o'tish?")){
      showPanel('settings');
      setTimeout(()=>{ const el=document.getElementById('ai-key-inp'); if(el){ el.focus(); el.scrollIntoView({behavior:'smooth',block:'center'}); } },300);
    }
    return;
  }
  _showAiModal();
}

let _aiRecorder=null, _aiChunks=[], _aiRecording=false, _aiAudioWav=null;

function _showAiModal(){
  _aiAudioWav=null;
  const tt=byId('modal-title-text'); if(tt) tt.textContent='AI Yordamchi';
  const mb=byId('modal-body'); if(!mb) return;
  mb.innerHTML=`
    <p style="color:var(--muted);font-size:13px;margin:0 0 14px">
      Loyiha haqida o'zbekcha qisqacha gapiring yoki yozing — AI rasmiy hujjatga aylantiradi.
    </p>
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:14px">
      <button class="btn btn-primary ai-mic-btn" id="ai-mic-btn" onclick="aiToggleRec()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
        Mikrofon
      </button>
      <span id="ai-rec-status" style="font-size:12px;color:var(--muted)">Bosing va gapiring</span>
    </div>
    <div class="form-group">
      <label class="form-label">Yoki matn yozing <small style="color:var(--muted2)">(ovoz bilan birga ham bo'ladi)</small></label>
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
// Groq kalitlari "gsk_" bilan boshlanadi
function _aiKeyLooksValid(v){ return !!v && v.length>=20 && !/\s/.test(v); }
function aiKeyChange(val){
  const hint=document.getElementById('ai-key-hint');
  if(!hint) return;
  if(_aiKeyLooksValid(val.trim())){
    hint.textContent = val.trim().startsWith('gsk_') ? 'Kalit to\'g\'ri ko\'rinadi ✓' : 'Kalit kiritildi (gsk_ bilan boshlanishi kerak)';
  } else {
    hint.textContent = 'Kalit faqat sizning qurilmangizda (localStorage) saqlanadi';
  }
}
function aiSaveKey(){
  const val=(document.getElementById('ai-key-inp')?.value||'').trim();
  if(!val){ toast("API kalit bo'sh"); return; }
  if(!_aiKeyLooksValid(val)){ toast("Kalit juda qisqa yoki bo'sh joy bor — tekshiring"); return; }
  saveAiKey(val);
  _aiSaveKeyToFirestore(val);
  _aiUpdateSettingsBadge();
  toast("Groq API kaliti saqlandi — barcha qurilmalarda ishlaydi ✓");
}
function aiClearKey(){
  localStorage.removeItem(AI_KEY_STORE);
  const el=document.getElementById('ai-key-inp'); if(el) el.value='';
  _aiUpdateSettingsBadge();
  try{ if(typeof getDb==='function'&&getDb()) getDb().collection('exon').doc('settings').set({groqKey:''},{merge:true}); }catch(e){}
  toast("Kalit o'chirildi");
}
function _aiUpdateSettingsBadge(){
  const badge=document.getElementById('ai-status-badge');
  if(!badge) return;
  badge.style.display=getAiKey()?'':'none';
}
async function loadAiSettings(){
  const el=document.getElementById('ai-key-inp');
  if(el) el.value=getAiKey();
  _aiUpdateSettingsBadge();
  await aiSyncKeyFromFirestore();
  if(el) el.value=getAiKey();
  _aiUpdateSettingsBadge();
}

// ── MIKROFON YOZISH ──
async function aiToggleRec(){
  if(_aiRecording){ aiStopRec(); return; }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    _aiChunks=[];
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
               : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : '';
    _aiRecorder=new MediaRecorder(stream, mime?{mimeType:mime}:undefined);
    _aiRecorder.ondataavailable=e=>{ if(e.data.size>0) _aiChunks.push(e.data); };
    _aiRecorder.onstop=()=>{ stream.getTracks().forEach(t=>t.stop()); _aiConvertAudio(); };
    _aiRecorder.start(200);
    _aiRecording=true;
    const btn=byId('ai-mic-btn'); if(btn) btn.classList.add('ai-mic-active');
    const st=byId('ai-rec-status'); if(st) st.innerHTML='<span class="ai-rec-dot"></span> Yozilmoqda… qayta bosing — to\'xtatish';
  }catch(e){
    toast("Mikrofonga ruxsat berilmadi: "+e.message);
  }
}
function aiStopRec(){
  if(!_aiRecorder||!_aiRecording) return;
  _aiRecording=false;
  _aiRecorder.stop();
  const btn=byId('ai-mic-btn'); if(btn) btn.classList.remove('ai-mic-active');
  const st=byId('ai-rec-status'); if(st) st.textContent='Tayyorlanmoqda…';
}

// ── OVOZNI WAV (16kHz mono) GA AYLANTIRISH ──
async function _aiConvertAudio(){
  if(!_aiChunks.length) return;
  const st=byId('ai-rec-status');
  try{
    const blob=new Blob(_aiChunks,{type:_aiRecorder?.mimeType||'audio/webm'});
    const arr=await blob.arrayBuffer();
    const AC=window.AudioContext||window.webkitAudioContext;
    const ctx=new AC();
    const decoded=await ctx.decodeAudioData(arr);
    ctx.close();
    const targetRate=16000;
    const off=new OfflineAudioContext(1, Math.ceil(decoded.duration*targetRate), targetRate);
    const src=off.createBufferSource(); src.buffer=decoded; src.connect(off.destination); src.start();
    const rendered=await off.startRendering();
    _aiAudioWav=_encodeWav(rendered.getChannelData(0), targetRate);
    if(st) st.innerHTML='Ovoz tayyor ✓ — endi <b>Tahlil qilish</b> bosing';
  }catch(e){
    if(st) st.textContent='Ovozni o\'qib bo\'lmadi — matn yozing';
    toast("Ovoz konvertatsiyasi xatosi: "+e.message);
  }
}

// 16-bit PCM WAV encoder
function _encodeWav(samples, sampleRate){
  const len=samples.length;
  const buf=new ArrayBuffer(44+len*2);
  const v=new DataView(buf);
  const ws=(o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
  ws(0,'RIFF'); v.setUint32(4,36+len*2,true); ws(8,'WAVE');
  ws(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,sampleRate,true); v.setUint32(28,sampleRate*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
  ws(36,'data'); v.setUint32(40,len*2,true);
  let o=44;
  for(let i=0;i<len;i++){ let s=Math.max(-1,Math.min(1,samples[i])); v.setInt16(o,s<0?s*0x8000:s*0x7FFF,true); o+=2; }
  return new Uint8Array(buf);
}

// ── GROQ ORQALI TAHLIL ──
async function aiProcess(){
  const textInp=(byId('ai-text-inp')?.value||'').trim();
  if(!textInp && !_aiAudioWav){ toast("Avval ovoz yozing yoki matn kiriting"); return; }

  const res=byId('ai-result'); if(!res) return;
  res.style.display='block';
  res.innerHTML=`<div style="text-align:center;padding:20px;color:var(--muted)"><div class="ai-loader"></div><div style="margin-top:8px;font-size:13px">Groq tahlil qilmoqda…</div></div>`;

  const key=getAiKey();
  if(!key){ res.innerHTML=`<div style="color:var(--error);padding:12px;background:rgba(239,68,68,.08);border-radius:8px;font-size:13px">API kalit topilmadi — sozlamalarga o'ting</div>`; return; }

  try{
    // 1-qadam: ovoz bo'lsa — Groq Whisper bilan tekstga aylantirish
    let transcript='';
    if(_aiAudioWav){
      res.innerHTML=`<div style="text-align:center;padding:20px;color:var(--muted)"><div class="ai-loader"></div><div style="margin-top:8px;font-size:13px">Ovoz transkripsiya qilinmoqda…</div></div>`;
      const fd=new FormData();
      fd.append('file', new Blob([_aiAudioWav],{type:'audio/wav'}), 'audio.wav');
      fd.append('model', GROQ_STT_MODEL);
      fd.append('language', 'uz');
      fd.append('response_format', 'text');
      const sttResp=await fetch(GROQ_STT_URL,{
        method:'POST',
        headers:{'Authorization':'Bearer '+key},
        body:fd
      });
      if(!sttResp.ok){
        const err=await sttResp.json().catch(()=>({}));
        throw new Error('Ovoz xatosi: '+(err.error?.message||sttResp.statusText));
      }
      transcript=(await sttResp.text()).trim();
      if(!transcript) throw new Error("Ovozdan matn olinmadi — qayta gapiring");
    }

    // Matn manbasi: ovoz + qo'lda kiritilgan matn
    const userContent=[transcript, textInp].filter(Boolean).join('\n');

    res.innerHTML=`<div style="text-align:center;padding:20px;color:var(--muted)"><div class="ai-loader"></div><div style="margin-top:8px;font-size:13px">Loyiha tayyorlanmoqda…</div></div>`;

    // 2-qadam: LLaMA bilan rasmiy hujjat yaratish
    const today=new Date().toISOString().slice(0,10);
    const catList=typeof catKeys==='function'?catKeys().join(', '):'A, B, C';

    const systemPrompt=`Sen dizaynerlar boshqaruv tizimi uchun loyiha tahlilchisissan. Foydalanuvchi o'zbek tilida qisqa ma'lumot beradi, sen uni rasmiy loyiha hujjatiga aylantirasan. Ovozda kichik xatolar bo'lsa kontekstdan to'g'irla.

Mavjud kategoriyalar: ${catList}. Bugungi sana: ${today}.

FAQAT quyidagi JSON formatida javob ber, boshqa hech narsa yozma:
{"title":"aniq loyiha nomi 3-8 so'z","descHtml":"<p>rasmiy tavsif HTML</p>","priority":"low|medium|high","deadline":"YYYY-MM-DD yoki null","category":"kategoriya yoki null"}

Qoidalar: title=konkret professional; descHtml=rasmiy o'zbek tilida maqsad+qamrov+natija (<strong>,<ul><li> ishlatsa bo'ladi); priority=high(shoshilinch),medium(oddiy),low(vaqti bor); deadline=aytilsa hisoblang aks holda null string yoz; category=faqat mavjud kategoriyalardan.`;

    const chatResp=await fetch(GROQ_CHAT_URL,{
      method:'POST',
      headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:GROQ_CHAT_MODEL,
        messages:[
          {role:'system', content:systemPrompt},
          {role:'user', content:userContent}
        ],
        temperature:0.4,
        max_tokens:800,
        response_format:{type:'json_object'}
      })
    });
    if(!chatResp.ok){
      const err=await chatResp.json().catch(()=>({}));
      throw new Error(err.error?.message||chatResp.statusText);
    }
    const chatData=await chatResp.json();
    const raw=chatData.choices?.[0]?.message?.content||'';
    if(!raw) throw new Error("AI bo'sh javob qaytardi");

    let parsed;
    try{ parsed=JSON.parse(raw.replace(/```json|```/g,'').trim()); }
    catch{ throw new Error("AI javobi noto'g'ri formatda. Qayta urining."); }
    if(parsed.deadline==='null'||parsed.deadline==='') parsed.deadline=null;
    if(parsed.category==='null'||parsed.category==='') parsed.category=null;
    _showAiResult(parsed, transcript);
  }catch(e){
    res.innerHTML=`<div style="color:var(--error);padding:12px;background:rgba(239,68,68,.08);border-radius:8px;font-size:13px">Xatolik: ${esc(e.message)}</div>`;
  }
}

function _showAiResult(p, transcript){
  const res=byId('ai-result'); if(!res) return;
  const priLabel={low:"Past",medium:"O'rta",high:"Yuqori"}[p.priority]||p.priority||'—';
  const priColor={low:"var(--muted)",medium:"var(--warning)",high:"var(--error)"}[p.priority]||'var(--muted)';
  const transcriptHtml=transcript?`<div style="margin-top:10px;padding:8px 12px;background:var(--hover);border-radius:8px;font-size:12px;color:var(--muted)"><strong>Transkripsiya:</strong> ${esc(transcript)}</div>`:'';
  res.innerHTML=`
    <div style="border:1.5px solid var(--accent);border-radius:10px;overflow:hidden">
      <div style="background:var(--accent-soft);padding:10px 16px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap">
        <span style="font-weight:700;font-size:13px;color:var(--accent-text)">AI taklifi</span>
        <div style="display:flex;gap:6px;font-size:11px;flex-wrap:wrap">
          <span style="background:var(--hover);padding:2px 8px;border-radius:6px;color:${priColor}">${priLabel}</span>
          ${p.deadline?`<span style="background:var(--hover);padding:2px 8px;border-radius:6px;color:var(--muted)">${esc(p.deadline)}</span>`:''}
          ${p.category?`<span style="background:var(--hover);padding:2px 8px;border-radius:6px;color:var(--muted)">${esc(p.category)}</span>`:''}
        </div>
      </div>
      <div style="padding:14px 16px">
        <div style="font-weight:700;font-size:15px;margin-bottom:8px">${esc(p.title||'')}</div>
        <div class="rich" style="font-size:13px;line-height:1.6;color:var(--muted)">${p.descHtml||''}</div>
        ${transcriptHtml}
      </div>
      <div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick='aiApply(${JSON.stringify(JSON.stringify(p))})'>
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

  if(byId('pk-title')&&byId('pk-rte')){
    if(p.title){ const el=byId('pk-title'); if(el) el.value=p.title; }
    if(p.descHtml){ const rte=byId('pk-rte'); if(rte){ rte.innerHTML=p.descHtml; typeof rteInput==='function'&&rteInput(); } }
    if(p.priority){ const el=byId('pk-priority'); if(el) el.value=p.priority; }
    if(p.deadline){ const el=byId('pk-deadline'); if(el) el.value=p.deadline; }
    if(p.category && typeof CAT_INFO!=='undefined' && CAT_INFO[p.category]){
      const el=byId('pk-cat'); if(el){ el.value=p.category; typeof peekCatChange==='function'&&peekCatChange(); }
    }
    typeof closeModal==='function'&&closeModal();
    toast("Loyiha to'ldirildi ✓");
  } else {
    typeof openProjectPeek==='function'&&openProjectPeek();
    setTimeout(()=>aiApply(jsonStr), 400);
  }
}
