// ═══════════════════════════════════════════════
// AI YORDAMCHI — ovoz/matn → rasmiy loyiha tavsifi
//   · Ovoz  → Web Speech API (bepul, Chrome/Edge)
//   · Matn  → OpenRouter — google/gemini-2.0-flash-exp:free
// ═══════════════════════════════════════════════

const OPENROUTER_KEY_STORE = 'exon_openrouter_key';
const AI_INSTR_STORE       = 'exon_ai_instructions';
const OPENROUTER_CHAT_URL  = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_MODEL     = 'deepseek/deepseek-chat:free';

function getOpenRouterKey(){ return localStorage.getItem(OPENROUTER_KEY_STORE)||''; }
function getAiInstructions(){ return localStorage.getItem(AI_INSTR_STORE)||''; }

// ── MODAL OCHISH ──
function openAiAssistant(){
  if(!getOpenRouterKey()){
    if(confirm("AI yordamchi uchun OpenRouter API kaliti kerak.\nSozlamalar sahifasiga o'tish?")){
      showPanel('settings');
      setTimeout(()=>{
        const el=document.getElementById('ai-or-key-inp');
        if(el){ el.focus(); el.scrollIntoView({behavior:'smooth',block:'center'}); }
      }, 300);
    }
    return;
  }
  _showAiModal();
}

let _aiRecording=false, _aiLastResult=null;
let _aiWebSpeechRec=null, _aiWebSpeechFinal='';
let _aiTimerInt=null, _aiRecStart=0;

function _showAiModal(){
  _aiWebSpeechFinal=''; _aiRecording=false;
  if(_aiWebSpeechRec){ try{_aiWebSpeechRec.stop();}catch(e){} _aiWebSpeechRec=null; }
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
      <div id="ai-rec-viz" style="display:none;margin-top:10px;padding:8px 14px;background:var(--hover);border-radius:10px;border:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <span style="display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--error)"><span class="ai-rec-dot"></span> Yozilmoqda…</span>
        <span id="ai-rec-timer" style="font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--text)">0:00</span>
      </div>
      <div id="ai-live-text" style="display:none;min-height:64px;max-height:180px;overflow-y:auto;padding:12px 16px;background:var(--bg);border:1.5px solid var(--accent);border-radius:10px;font-size:15px;line-height:1.7;color:var(--text);word-break:break-word;margin-top:10px">
        <span id="ai-live-final"></span><span id="ai-live-interim" style="color:var(--muted);font-style:italic"></span>
        <span id="ai-live-cursor" style="display:inline-block;width:2px;height:1.1em;background:var(--accent);vertical-align:text-bottom;margin-left:2px;animation:ai-blink 1s step-end infinite"></span>
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

// ── OPENROUTER KALITI ──
let _orSaveTimer=null;
function openRouterKeyAutoSave(val){
  const v=(val||'').trim();
  localStorage.setItem(OPENROUTER_KEY_STORE, v);
  _aiUpdateSettingsBadge();
  const hint=document.getElementById('ai-or-key-hint');
  if(hint) hint.textContent = v
    ? 'Saqlandi ✓ — barcha qurilmalarda ishlaydi'
    : 'Kalit kiritilmagan';
  clearTimeout(_orSaveTimer);
  _orSaveTimer=setTimeout(()=>{
    if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('openRouterKey', v);
  }, 700);
}
function openRouterKeyClear(){
  localStorage.removeItem(OPENROUTER_KEY_STORE);
  const el=document.getElementById('ai-or-key-inp'); if(el) el.value='';
  _aiUpdateSettingsBadge();
  if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('openRouterKey','');
  const hint=document.getElementById('ai-or-key-hint');
  if(hint) hint.textContent='Kalit kiritilmagan';
  toast("OpenRouter kaliti o'chirildi");
}
function _aiUpdateSettingsBadge(){
  if(typeof setConnBadge==='function') setConnBadge('ai-status-badge', !!getOpenRouterKey());
}

// ── O'QITISH DASTURI ──
let _aiInstrSaveTimer=null;
function aiInstrAutoSave(val){
  const v=val||'';
  localStorage.setItem(AI_INSTR_STORE, v);
  const hint=document.getElementById('ai-instr-hint');
  if(hint) hint.textContent = v.trim()
    ? 'Saqlandi ✓ — AI faqat shu qoidalarga amal qiladi'
    : 'Bo\'sh bo\'lsa — standart shablon ishlatiladi';
  clearTimeout(_aiInstrSaveTimer);
  _aiInstrSaveTimer=setTimeout(()=>{
    if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('aiInstructions', v);
  }, 800);
}
function aiResetInstructions(){
  if(!confirm("Qoidalarni standart shablonga qaytarasizmi?")) return;
  localStorage.removeItem(AI_INSTR_STORE);
  const instr=document.getElementById('ai-instr-inp');
  if(instr) instr.value=AI_DEFAULT_INSTRUCTIONS;
  if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('aiInstructions','');
  const hint=document.getElementById('ai-instr-hint');
  if(hint) hint.textContent="Standartga qaytarildi — endi shablonni o'zicha o'zgartiring";
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
  const orEl=document.getElementById('ai-or-key-inp');
  if(orEl) orEl.value=getOpenRouterKey();
  const instr=document.getElementById('ai-instr-inp');
  if(instr) instr.value=getAiInstructions()||AI_DEFAULT_INSTRUCTIONS;
  _aiUpdateSettingsBadge();
}

// ── MIKROFON (Web Speech API) ──
function aiToggleRec(){
  if(_aiRecording){ aiStopRec(); return; }

  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR){
    toast("Bu brauzer ovoz tanishni qo'llab-quvvatlamaydi — Chrome yoki Edge ishlating");
    return;
  }

  _aiWebSpeechFinal='';
  _aiWebSpeechRec=new SR();
  _aiWebSpeechRec.lang='uz-UZ';
  _aiWebSpeechRec.continuous=true;
  _aiWebSpeechRec.interimResults=true;

  _aiWebSpeechRec.onstart=()=>{
    _aiRecording=true;
    const btn=byId('ai-mic-btn'); if(btn) btn.classList.add('ai-mic-active');
    const lbl=byId('ai-mic-label'); if(lbl) lbl.textContent="To'xtatish";
    const st=byId('ai-rec-status'); if(st) st.textContent='Gapiring…';
    const viz=byId('ai-rec-viz'); if(viz) viz.style.display='flex';
    const liveBox=byId('ai-live-text'); if(liveBox) liveBox.style.display='';
    const liveF=byId('ai-live-final'); if(liveF) liveF.textContent='';
    const liveI=byId('ai-live-interim'); if(liveI) liveI.textContent='';
    _aiRecStart=Date.now();
    const tEl=byId('ai-rec-timer'); if(tEl) tEl.textContent='0:00';
    _aiTimerInt=setInterval(()=>{
      const s=Math.floor((Date.now()-_aiRecStart)/1000);
      if(tEl) tEl.textContent=Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
    }, 250);
  };

  _aiWebSpeechRec.onresult=(e)=>{
    let interim='';
    for(let i=e.resultIndex;i<e.results.length;i++){
      if(e.results[i].isFinal) _aiWebSpeechFinal+=e.results[i][0].transcript+' ';
      else interim+=e.results[i][0].transcript;
    }
    const liveF=byId('ai-live-final'); if(liveF) liveF.textContent=_aiWebSpeechFinal;
    const liveI=byId('ai-live-interim'); if(liveI) liveI.textContent=interim;
    const liveBox=byId('ai-live-text');
    if(liveBox) liveBox.scrollTop=liveBox.scrollHeight;
  };

  _aiWebSpeechRec.onerror=(e)=>{
    if(e.error==='no-speech') return;
    _aiRecording=false;
    _aiWebSpeechCleanup(e.error!=='aborted');
  };

  _aiWebSpeechRec.onend=()=>{
    if(_aiRecording){ try{ _aiWebSpeechRec.start(); }catch(ex){ _aiRecording=false; _aiWebSpeechCleanup(false); } }
    else _aiWebSpeechCleanup(false);
  };

  try{ _aiWebSpeechRec.start(); }
  catch(e){ toast("Mikrofonga ruxsat berilmadi: "+e.message); }
}

function aiStopRec(){
  _aiRecording=false;
  if(_aiWebSpeechRec){ try{ _aiWebSpeechRec.stop(); }catch(e){} }
}

function _aiWebSpeechCleanup(showError){
  if(_aiTimerInt){ clearInterval(_aiTimerInt); _aiTimerInt=null; }
  const btn=byId('ai-mic-btn'); if(btn) btn.classList.remove('ai-mic-active');
  const lbl=byId('ai-mic-label'); if(lbl) lbl.textContent='Mikrofon';
  const viz=byId('ai-rec-viz'); if(viz) viz.style.display='none';
  const cursor=byId('ai-live-cursor'); if(cursor) cursor.style.display='none';
  const liveI=byId('ai-live-interim'); if(liveI) liveI.textContent='';
  const final=(_aiWebSpeechFinal||'').trim();
  if(final){
    const textInp=byId('ai-text-inp');
    if(textInp){
      const ex=(textInp.value||'').trim();
      textInp.value=ex?ex+'\n'+final:final;
    }
    const st=byId('ai-rec-status');
    if(st) st.innerHTML="Tayyor ✓ — endi <b>Tahlil qilish</b> bosing";
  } else {
    const liveBox=byId('ai-live-text'); if(liveBox) liveBox.style.display='none';
    if(showError) toast("Ovoz tanilmadi — brauzer mikrofon ruxsatini tekshiring");
  }
}

// ── OPENROUTER ORQALI TAHLIL ──
async function aiProcess(){
  const textInp=(byId('ai-text-inp')?.value||'').trim();
  if(!textInp){ toast("Avval ovoz yozing yoki matn kiriting"); return; }

  const res=byId('ai-result'); if(!res) return;
  res.style.display='block';
  res.innerHTML=`<div style="text-align:center;padding:20px;color:var(--muted)"><div class="ai-loader"></div><div style="margin-top:8px;font-size:13px">Tahlil qilinmoqda…</div></div>`;

  try{
    const today=new Date().toISOString().slice(0,10);
    const catList=typeof catKeys==='function'?catKeys().join(', '):'A, B, C';
    const customInstr=(getAiInstructions()||'').trim();

    const rulesBlock=customInstr||
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

    const systemPrompt=
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

    const orKey=getOpenRouterKey();
    if(!orKey) throw new Error("OpenRouter API kaliti yo'q — Sozlamalar → AI Yordamchi");
    const chatResp=await fetch(OPENROUTER_CHAT_URL,{
      method:'POST',
      headers:{
        'Authorization':'Bearer '+orKey,
        'Content-Type':'application/json',
        'HTTP-Referer':'https://exon-designers.uz',
        'X-Title':'EXON'
      },
      body:JSON.stringify({
        model:OPENROUTER_MODEL,
        messages:[
          {role:'system', content:systemPrompt},
          {role:'user', content:textInp}
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
    catch{ throw new Error("AI javobi noto'g'ri formatda — qayta urining"); }
    if(parsed.deadline==='null'||parsed.deadline==='') parsed.deadline=null;
    if(parsed.category==='null'||parsed.category==='') parsed.category=null;
    _showAiResult(parsed);
  }catch(e){
    res.innerHTML=`<div style="color:var(--error);padding:12px;background:rgba(239,68,68,.08);border-radius:8px;font-size:13px">Xatolik: ${esc(e.message)}</div>`;
  }
}

function _showAiResult(p){
  _aiLastResult=p;
  const res=byId('ai-result'); if(!res) return;
  const priLabel={low:"Past",medium:"O'rta",high:"Yuqori"}[p.priority]||p.priority||'—';
  const priColor={low:"var(--muted)",medium:"var(--warning)",high:"var(--error)"}[p.priority]||'var(--muted)';
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
      </div>
      <div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;gap:8px">
        <button class="btn btn-primary" style="flex:1" onclick="aiApply()">✓ Tasdiqlash — loyihaga qo'shish</button>
        <button class="btn btn-ghost" onclick="aiProcess()">Qayta tahlil</button>
      </div>
    </div>`;
}

// ── TASDIQLASH ──
function aiApply(){
  const p=_aiLastResult;
  if(!p){ toast("Xatolik — qayta tahlil qiling"); return; }
  if(byId('pk-title')&&byId('pk-rte')){
    if(p.title){ const el=byId('pk-title'); if(el) el.value=p.title; }
    if(p.descHtml){ const rte=byId('pk-rte'); if(rte){ rte.innerHTML=p.descHtml; typeof rteInput==='function'&&rteInput(); } }
    if(p.priority){ const el=byId('pk-priority'); if(el) el.value=p.priority; }
    if(p.deadline){ const el=byId('pk-deadline'); if(el) el.value=p.deadline; }
    if(p.category&&typeof CAT_INFO!=='undefined'&&CAT_INFO[p.category]){
      const el=byId('pk-cat'); if(el){ el.value=p.category; typeof peekCatChange==='function'&&peekCatChange(); }
    }
    typeof closeModal==='function'&&closeModal();
    toast("Loyiha to'ldirildi ✓");
  } else {
    typeof openProjectPeek==='function'&&openProjectPeek();
    setTimeout(()=>aiApply(), 400);
  }
}
