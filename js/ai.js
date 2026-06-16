// ═══════════════════════════════════════════════
// AI YORDAMCHI — ovoz/matn → rasmiy loyiha tavsifi
// Groq API — bepul, tez, O'zbekistonda ishlaydi
//   · Ovoz  → Whisper-large-v3 (o'zbekcha)
//   · Matn  → LLaMA-3.3-70b-versatile
// ═══════════════════════════════════════════════

const AI_KEY_STORE        = 'exon_groq_key';
const AI_INSTR_STORE      = 'exon_ai_instructions';
const GOOGLE_STT_KEY_STORE= 'exon_google_stt_key';
const GROQ_STT_URL        = 'https://api.groq.com/openai/v1/audio/transcriptions';
const GROQ_CHAT_URL       = 'https://api.groq.com/openai/v1/chat/completions';
const GOOGLE_STT_URL      = 'https://speech.googleapis.com/v1/speech:recognize';
const GROQ_CHAT_MODEL     = 'llama-3.3-70b-versatile';
const GROQ_STT_MODEL      = 'whisper-large-v3';

function getAiKey(){ return localStorage.getItem(AI_KEY_STORE)||''; }
function saveAiKey(k){ localStorage.setItem(AI_KEY_STORE, k.trim()); }
function getGoogleSttKey(){ return localStorage.getItem(GOOGLE_STT_KEY_STORE)||''; }

// O'qitish dasturi — egasi AI ga doimiy ko'rsatma beradi (har bir tahlilga qo'shiladi)
function getAiInstructions(){ return localStorage.getItem(AI_INSTR_STORE)||''; }

// Eski kod bilan muvofiqlik uchun — markaziy syncSettingsFromFirestore ishlatiladi
async function aiSyncKeyFromFirestore(){
  if(typeof syncSettingsFromFirestore==='function') await syncSettingsFromFirestore();
  const el=document.getElementById('ai-key-inp'); if(el) el.value=getAiKey();
  _aiUpdateSettingsBadge();
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

let _aiRecorder=null, _aiChunks=[], _aiRecording=false, _aiAudioWav=null, _aiLastResult=null;

function _showAiModal(){
  _aiAudioWav=null;
  const tt=byId('modal-title-text'); if(tt) tt.textContent='AI Yordamchi';
  const mb=byId('modal-body'); if(!mb) return;
  mb.innerHTML=`
    <p style="color:var(--muted);font-size:13px;margin:0 0 14px">
      Loyiha haqida o'zbekcha qisqacha gapiring yoki yozing — AI rasmiy hujjatga aylantiradi.
    </p>
    <div style="margin-bottom:14px">
      <div style="display:flex;align-items:center;gap:10px">
        <button class="btn btn-primary ai-mic-btn" id="ai-mic-btn" onclick="aiToggleRec()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4z"/><path d="M19 10a7 7 0 0 1-14 0"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
          <span id="ai-mic-label">Mikrofon</span>
        </button>
        <span id="ai-rec-status" style="font-size:12px;color:var(--muted)">Bosing va gapiring</span>
      </div>
      <!-- Jonli yozish vizualizatsiyasi (kompyuter + telefon) -->
      <div id="ai-rec-viz" style="display:none;margin-top:12px;padding:11px 14px;background:var(--hover);border-radius:10px;border:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px">
          <span style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--error)"><span class="ai-rec-dot"></span> Yozilmoqda…</span>
          <span id="ai-rec-timer" style="font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--text)">0:00</span>
        </div>
        <canvas id="ai-rec-canvas" height="44" style="width:100%;height:44px;display:block"></canvas>
      </div>
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

// ── SOZLAMALAR: API KALIT (avtomatik saqlash) ──
// Groq kalitlari "gsk_" bilan boshlanadi
function _aiKeyLooksValid(v){ return !!v && v.length>=20 && !/\s/.test(v); }

let _aiSaveTimer=null;
// Foydalanuvchi yozayotganda — darhol local, biroz kechikib Firestore'ga
function aiKeyAutoSave(val){
  const v=(val||'').trim();
  const hint=document.getElementById('ai-key-hint');
  saveAiKey(v);                       // localStorage — darhol
  _aiUpdateSettingsBadge();
  if(hint){
    hint.textContent = v
      ? (_aiKeyLooksValid(v) ? 'Saqlandi ✓ — barcha qurilmalarda ishlaydi' : 'Kalit juda qisqa ko\'rinadi')
      : 'Kiritilgan kalit barcha qurilmalarda avtomatik ishlaydi';
  }
  clearTimeout(_aiSaveTimer);
  _aiSaveTimer=setTimeout(()=>{        // Firestore — yozish to'xtagach
    if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('groqKey', v);
  }, 700);
}
// Eski tugma uchun (agar chaqirilsa)
function aiSaveKey(){
  const val=(document.getElementById('ai-key-inp')?.value||'').trim();
  if(!val){ toast("API kalit bo'sh"); return; }
  aiKeyAutoSave(val);
  if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('groqKey', val);
  toast("Groq API kaliti saqlandi — barcha qurilmalarda ishlaydi ✓");
}
function aiClearKey(){
  localStorage.removeItem(AI_KEY_STORE);
  const el=document.getElementById('ai-key-inp'); if(el) el.value='';
  _aiUpdateSettingsBadge();
  if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('groqKey', '');
  const hint=document.getElementById('ai-key-hint');
  if(hint) hint.textContent='Kiritilgan kalit barcha qurilmalarda avtomatik ishlaydi';
  toast("Kalit o'chirildi");
}
function _aiUpdateSettingsBadge(){
  if(typeof setConnBadge==='function') setConnBadge('ai-status-badge', !!getAiKey());
}

// ── GOOGLE CLOUD STT KALITI (ixtiyoriy — o'zbekchani aniqroq taniydi) ──
let _gSttSaveTimer=null;
function googleSttKeyAutoSave(val){
  const v=(val||'').trim();
  localStorage.setItem(GOOGLE_STT_KEY_STORE, v);
  const hint=document.getElementById('ai-google-key-hint');
  if(hint) hint.textContent = v
    ? 'Saqlandi ✓ — Google STT ishlatiladi (o\'zbekcha aniq taniydi)'
    : 'Kiritilmagan bo\'lsa Groq Whisper ishlatiladi';
  clearTimeout(_gSttSaveTimer);
  _gSttSaveTimer=setTimeout(()=>{
    if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('googleSttKey', v);
  }, 700);
}
function googleSttKeyClear(){
  localStorage.removeItem(GOOGLE_STT_KEY_STORE);
  const el=document.getElementById('ai-google-key-inp'); if(el) el.value='';
  if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('googleSttKey','');
  const hint=document.getElementById('ai-google-key-hint');
  if(hint) hint.textContent="Kiritilmagan bo'lsa Groq Whisper ishlatiladi";
  toast("Google STT kaliti o'chirildi");
}

// ── O'QITISH DASTURI (maxsus ko'rsatmalar) ──
let _aiInstrSaveTimer=null;
function aiInstrAutoSave(val){
  const v=val||'';
  localStorage.setItem(AI_INSTR_STORE, v);
  const hint=document.getElementById('ai-instr-hint');
  if(hint) hint.textContent = v.trim() ? 'Saqlandi ✓ — AI faqat shu qoidalarga amal qiladi' : 'Bo\'sh bo\'lsa — standart shablon ishlatiladi';
  clearTimeout(_aiInstrSaveTimer);
  _aiInstrSaveTimer=setTimeout(()=>{
    if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('aiInstructions', v);
  }, 800);
}
function aiResetInstructions(){
  if(!confirm("Qoidalarni standart shablonga qaytarasizmi?")) return;
  localStorage.removeItem(AI_INSTR_STORE);
  const instr=document.getElementById('ai-instr-inp');
  if(instr){ instr.value=AI_DEFAULT_INSTRUCTIONS; }
  if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('aiInstructions','');
  const hint=document.getElementById('ai-instr-hint');
  if(hint) hint.textContent='Standartga qaytarildi — endi shablonni o\'zicha o\'zgartiring';
}

const AI_DEFAULT_INSTRUCTIONS =
`Har bir loyiha tavsifi quyidagi bo'limlardan iborat bo'lsin:

<h2>Maqsad</h2>
Loyihaning asosiy maqsadini 2-3 gapda yoz. Muhim so'zlarni qalin qil.

<h2>Bajariladigan ishlar</h2>
Kamida 5 ta aniq vazifani ro'yxatda yoz — har biri o'lchanadigan natijaga ega bo'lsin.

<h2>Texnik talablar</h2>
Format, o'lcham, rang, dasturiy talab va cheklovlarni ro'yxatda yoz.

<h2>Kutilayotgan natija</h2>
Yakuniy mahsulot qanday ko'rinishi va qanday topshirilishi kerakligini yoz.

Qo'shimcha qoidalar:
- Rasmiy va professional tilda yoz (o'zbek tilida)
- Mijoz ismi yoki loyiha nomi aniq bo'lsa — uni sarlavhaga kirgizt
- Muddat aytilmasa — 2 hafta qilib qo'y
- Har bo'limda kamida 2-3 ta aniq ma'lumot bo'lsin`;

function loadAiSettings(){
  const el=document.getElementById('ai-key-inp');
  if(el) el.value=getAiKey();
  const gEl=document.getElementById('ai-google-key-inp');
  if(gEl) gEl.value=getGoogleSttKey();
  const instr=document.getElementById('ai-instr-inp');
  if(instr){
    // Bo'sh bo'lsa — default shablonni ko'rsat (localStorage'ga saqlanmaydi, faqat ko'rsatish uchun)
    instr.value=getAiInstructions()||AI_DEFAULT_INSTRUCTIONS;
  }
  _aiUpdateSettingsBadge();
}

// ── MIKROFON YOZISH (jonli vizualizatsiya bilan) ──
let _aiVizCtx=null, _aiAnalyser=null, _aiVizRAF=null, _aiTimerInt=null, _aiRecStart=0;

async function aiToggleRec(){
  if(_aiRecording){ aiStopRec(); return; }
  try{
    const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    _aiChunks=[];
    const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus'
               : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' : '';
    _aiRecorder=new MediaRecorder(stream, mime?{mimeType:mime}:undefined);
    _aiRecorder.ondataavailable=e=>{ if(e.data.size>0) _aiChunks.push(e.data); };
    _aiRecorder.onstop=()=>{ stream.getTracks().forEach(t=>t.stop()); _aiStopViz(); _aiConvertAudio(); };
    _aiRecorder.start(200);
    _aiRecording=true;
    const btn=byId('ai-mic-btn'); if(btn) btn.classList.add('ai-mic-active');
    const lbl=byId('ai-mic-label'); if(lbl) lbl.textContent="To'xtatish";
    const st=byId('ai-rec-status'); if(st) st.textContent='Gapiring… tugagach qayta bosing';
    _aiStartViz(stream);
  }catch(e){
    toast("Mikrofonga ruxsat berilmadi: "+e.message);
  }
}
function aiStopRec(){
  if(!_aiRecorder||!_aiRecording) return;
  _aiRecording=false;
  _aiRecorder.stop();
  const st=byId('ai-rec-status'); if(st) st.textContent='Tayyorlanmoqda…';
}

// Jonli to'lqin + taymer
function _aiStartViz(stream){
  const viz=byId('ai-rec-viz'); if(viz) viz.style.display='';
  // Taymer
  _aiRecStart=Date.now();
  const tEl=byId('ai-rec-timer'); if(tEl) tEl.textContent='0:00';
  _aiTimerInt=setInterval(()=>{
    const s=Math.floor((Date.now()-_aiRecStart)/1000);
    if(tEl) tEl.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
  },250);
  // To'lqin (mikrofon darajasi)
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    _aiVizCtx=new AC();
    const src=_aiVizCtx.createMediaStreamSource(stream);
    _aiAnalyser=_aiVizCtx.createAnalyser();
    _aiAnalyser.fftSize=256;
    src.connect(_aiAnalyser);
    const canvas=byId('ai-rec-canvas'); if(!canvas) return;
    const cx=canvas.getContext('2d');
    const data=new Uint8Array(_aiAnalyser.frequencyBinCount);
    const accent=(getComputedStyle(document.documentElement).getPropertyValue('--accent')||'#16a34a').trim()||'#16a34a';
    const bars=34;
    const step=Math.max(1,Math.floor(data.length/bars));
    function draw(){
      _aiVizRAF=requestAnimationFrame(draw);
      const w=canvas.clientWidth||300, h=canvas.height;
      if(canvas.width!==w) canvas.width=w;
      _aiAnalyser.getByteFrequencyData(data);
      cx.clearRect(0,0,w,h);
      const bw=w/bars;
      cx.fillStyle=accent;
      for(let i=0;i<bars;i++){
        const v=data[i*step]/255;
        const bh=Math.max(3, v*h*0.95);
        cx.beginPath();
        const x=i*bw+1, y=(h-bh)/2, ww=Math.max(2,bw-3), r=Math.min(2,ww/2);
        if(cx.roundRect) cx.roundRect(x,y,ww,bh,r); else cx.rect(x,y,ww,bh);
        cx.fill();
      }
    }
    draw();
  }catch(e){ /* vizualizatsiya ixtiyoriy */ }
}
function _aiStopViz(){
  if(_aiVizRAF) cancelAnimationFrame(_aiVizRAF); _aiVizRAF=null;
  if(_aiTimerInt) clearInterval(_aiTimerInt); _aiTimerInt=null;
  if(_aiVizCtx){ try{_aiVizCtx.close();}catch(e){} _aiVizCtx=null; }
  _aiAnalyser=null;
  const viz=byId('ai-rec-viz'); if(viz) viz.style.display='none';
  const btn=byId('ai-mic-btn'); if(btn) btn.classList.remove('ai-mic-active');
  const lbl=byId('ai-mic-label'); if(lbl) lbl.textContent='Mikrofon';
}

// ── GOOGLE CLOUD STT (uz-UZ, LINEAR16) ──
async function _aiTranscribeGoogle(key){
  // WAV = 44 bayt sarlavha + raw PCM — Google LINEAR16 uchun faqat PCM kerak
  const pcm=_aiAudioWav.slice(44);
  // Katta massivni qismlarga bo'lib base64'ga aylantirish (stack overflow oldini olish)
  let binary='';
  const chunk=8192;
  for(let i=0;i<pcm.length;i+=chunk){
    binary+=String.fromCharCode(...pcm.subarray(i,Math.min(i+chunk,pcm.length)));
  }
  const audioContent=btoa(binary);

  const resp=await fetch(`${GOOGLE_STT_URL}?key=${encodeURIComponent(key)}`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      config:{
        encoding:'LINEAR16',
        sampleRateHertz:16000,
        languageCode:'uz-UZ',
        enableAutomaticPunctuation:true,
        model:'latest_long'
      },
      audio:{content:audioContent}
    })
  });
  if(!resp.ok){
    const err=await resp.json().catch(()=>({}));
    throw new Error('Google STT xatosi: '+(err.error?.message||resp.statusText));
  }
  const data=await resp.json();
  const text=(data.results||[]).map(r=>r.alternatives?.[0]?.transcript||'').join(' ').trim();
  if(!text) throw new Error("Google STT matn olinmadi — qayta aniqroq gapiring");
  return text;
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
    // 1-qadam: ovoz bo'lsa — STT bilan tekstga aylantirish
    // Google Cloud STT kalit bo'lsa — Google (o'zbekchani aniqroq taniydi)
    // Aks holda — Groq Whisper (fallback)
    let transcript='';
    if(_aiAudioWav){
      const googleKey=getGoogleSttKey();
      if(googleKey){
        res.innerHTML=`<div style="text-align:center;padding:20px;color:var(--muted)"><div class="ai-loader"></div><div style="margin-top:8px;font-size:13px">Google AI ovoz taniyapti…</div></div>`;
        transcript=await _aiTranscribeGoogle(googleKey);
      } else {
        res.innerHTML=`<div style="text-align:center;padding:20px;color:var(--muted)"><div class="ai-loader"></div><div style="margin-top:8px;font-size:13px">Groq Whisper transkripsiya qilmoqda…</div></div>`;
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
    }

    // Matn manbasi: ovoz + qo'lda kiritilgan matn
    const userContent=[transcript, textInp].filter(Boolean).join('\n');

    res.innerHTML=`<div style="text-align:center;padding:20px;color:var(--muted)"><div class="ai-loader"></div><div style="margin-top:8px;font-size:13px">Loyiha tayyorlanmoqda…</div></div>`;

    // 2-qadam: LLaMA bilan rasmiy hujjat yaratish
    const today=new Date().toISOString().slice(0,10);
    const catList=typeof catKeys==='function'?catKeys().join(', '):'A, B, C';
    const customInstr=(getAiInstructions()||'').trim();

    // Foydalanuvchi o'z qoidalarini yozgan bo'lsa — FAQAT o'sha qoidalar ishlaydi.
    // Aks holda — bazaviy shablon.
    const rulesBlock = customInstr ||
`Har bir loyiha tavsifi quyidagi bo'limlardan iborat bo'lsin:

<h2>Maqsad</h2>
Loyihaning asosiy maqsadini 2-3 gapda yoz. Muhim so'zlarni <strong>qalin</strong> qil.

<h2>Bajariladigan ishlar</h2>
Kamida 5 ta aniq vazifani <ul><li> ro'yxatida yoz — har biri o'lchanadigan natijaga ega bo'lsin.

<h2>Texnik talablar</h2>
Format, o'lcham, rang, dasturiy talab va cheklovlarni <ul><li> ro'yxatida yoz.

<h2>Kutilayotgan natija</h2>
Yakuniy mahsulot qanday ko'rinishi va qanday topshirilishi kerakligini yoz.

Qo'shimcha qoidalar:
- Rasmiy va professional tilda yoz (o'zbek tilida)
- Mijoz ismi yoki loyiha nomi aniq bo'lsa — uni title'ga kirgizt
- Muddat aytilmasa — 2 hafta qilib qo'y
- Har bo'limda kamida 2-3 ta aniq ma'lumot bo'lsin`;

    const systemPrompt =
`Sen EXON (dizaynerlar boshqaruv tizimi) uchun loyiha tahlilchisissan.
Foydalanuvchi o'zbek tilida qisqa, erkin ma'lumot beradi (ba'zan ovoz orqali — kichik xatolarni kontekstdan to'g'irla).
Sening YAGONA vazifang: foydalanuvchi ma'lumotini quyidagi EGA QOIDALARI asosida loyiha hujjatiga aylantirish.

BUGUN: ${today}
KATEGORIYALAR: ${catList}

═══════════════════════════════════
EGA QOIDALARI — bu qoidalarga QATTIQ amal qil, o'zingdan hech narsa qo'shma:
═══════════════════════════════════
${rulesBlock}
═══════════════════════════════════

MAJBURIY JAVOB FORMATI — faqat shu JSON, boshqa hech narsa yozma:
{"title":"loyiha nomi 3-8 so'z","descHtml":"ega qoidalaridagi tuzilmada to'liq HTML","priority":"low|medium|high","deadline":"YYYY-MM-DD yoki null","category":"kategoriyalardan biri yoki null"}`;

    const chatResp=await fetch(GROQ_CHAT_URL,{
      method:'POST',
      headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:GROQ_CHAT_MODEL,
        messages:[
          {role:'system', content:systemPrompt},
          {role:'user', content:userContent}
        ],
        temperature:0.5,
        max_tokens:3000,
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
  _aiLastResult = p;
  const res=byId('ai-result'); if(!res) return;
  const priLabel={low:"Past",medium:"O'rta",high:"Yuqori"}[p.priority]||p.priority||'—';
  const priColor={low:"var(--muted)",medium:"var(--warning)",high:"var(--error)"}[p.priority]||'var(--muted)';
  const sttLabel=getGoogleSttKey()?'Google STT':'Groq Whisper';
  const transcriptHtml=transcript?`
    <div style="margin-bottom:12px;padding:10px 14px;background:var(--bg);border-radius:8px;border-left:3px solid var(--accent)">
      <div style="font-size:11px;font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">Ovoz matni (${sttLabel})</div>
      <div style="font-size:13.5px;color:var(--text);line-height:1.6">${esc(transcript)}</div>
    </div>`:'';
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
        ${transcriptHtml}
        <div style="font-weight:700;font-size:15px;margin-bottom:8px">${esc(p.title||'')}</div>
        <div class="rich" style="font-size:13px;line-height:1.6;color:var(--muted)">${p.descHtml||''}</div>
      </div>
      <div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="aiApply()">
          ✓ Tasdiqlash — loyihaga qo'shish
        </button>
        <button class="btn btn-ghost" onclick="aiProcess()">Qayta tahlil</button>
      </div>
    </div>`;
}

// ── TASDIQLASH: FORMANI TO'LDIRISH ──
function aiApply(){
  const p = _aiLastResult;
  if(!p){ toast("Xatolik — qayta tahlil qiling"); return; }

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
    setTimeout(()=>aiApply(), 400);
  }
}
