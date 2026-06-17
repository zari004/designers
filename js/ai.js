// ═══════════════════════════════════════════════
// AI YORDAMCHI — ovoz/matn/rasm → dizayn briefi
//   · Ovoz  → Web Speech API (bepul, Chrome/Edge)
//   · Matn  → Groq LLaMA 3.3 70B (bepul, tez)
//   · Rasm  → Groq LLaMA 3.2 11B Vision (bepul)
// ═══════════════════════════════════════════════

const AI_KEY_STORE    = 'exon_groq_key';
const AI_INSTR_STORE  = 'exon_ai_instructions';
const AI_CHAT_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const AI_CHAT_MODEL   = 'llama-3.3-70b-versatile';
const AI_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

function getAiKey(){ return localStorage.getItem(AI_KEY_STORE)||''; }
function getAiInstructions(){ return localStorage.getItem(AI_INSTR_STORE)||''; }

const RU_FLAG='<svg width="16" height="11" viewBox="0 0 16 11" style="border-radius:2px;vertical-align:middle;margin-right:4px;flex-shrink:0"><rect width="16" height="3.67" fill="#fff" stroke="#e0e0e0" stroke-width="0.3"/><rect y="3.67" width="16" height="3.67" fill="#0039A6"/><rect y="7.33" width="16" height="3.67" fill="#D52B1E"/></svg>';

// ── MODAL OCHISH ──
async function openAiAssistant(){
  if(!getAiKey()){
    // Avval Firestore'dan yuklashga urinib ko'ramiz
    if(typeof syncSettingsFromFirestore==='function') await syncSettingsFromFirestore();
  }
  if(!getAiKey()){
    if(confirm("AI yordamchi uchun Groq API kaliti kerak.\nSozlamalar sahifasiga o'tish?")){
      const _src=document.querySelector('.panel.active')?.id?.replace('panel-','')||'projects';
      if(typeof closePeek==='function') closePeek();
      goToSettingsFrom(_src);
      setTimeout(()=>{
        const el=document.getElementById('ai-key-inp');
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
let _aiImages=[];  // max 5 ta base64

function _showAiModal(){
  _aiWebSpeechFinal=''; _aiRecording=false; _aiImages=[];
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
      <div id="ai-rec-viz" style="display:none;margin-top:10px;padding:8px 14px;background:var(--hover);border-radius:10px;border:1px solid var(--border);align-items:center;justify-content:space-between">
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
      <textarea class="form-input" id="ai-text-inp" rows="3"
        placeholder="Masalan: Kerasys uchun 4 betlik infografik dizayn..."
        style="width:100%;resize:vertical"></textarea>
    </div>
    <div style="margin-bottom:14px">
      <div id="ai-drop-zone" style="padding:14px 16px;border:1.5px dashed var(--border);border-radius:10px;cursor:pointer;color:var(--muted);font-size:13px;text-align:center;transition:all .2s">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" style="margin-bottom:6px;display:block;margin-inline:auto"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
        <div id="ai-drop-label" style="font-weight:500">Rasmlarni shu yerga sudrab tashlang yoki bosib tanlang</div>
        <div style="font-size:11px;margin-top:3px;opacity:.6">Ctrl+V bilan ham joylashtirish mumkin &nbsp;•&nbsp; 5 tagacha rasm</div>
      </div>
      <input type="file" id="ai-img-input" accept="image/*" multiple style="display:none" onchange="_aiAddImages(this.files)"/>
      <div id="ai-img-thumbs" style="display:none;flex-wrap:wrap;gap:8px;margin-top:10px"></div>
    </div>
    <button class="btn btn-primary" onclick="aiProcess()" style="width:100%;margin-top:4px">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="margin-right:6px"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 18l-6.2 3 1.2-6.8L2 9.3l6.9-1z"/></svg>
      Tahlil qilish
    </button>
    <div id="ai-result" style="display:none;margin-top:18px"></div>
  `;
  byId('modal').style.display='flex';
  // Drag & drop
  const dz=byId('ai-drop-zone');
  dz.addEventListener('click',()=>byId('ai-img-input').click());
  dz.addEventListener('dragover',e=>{e.preventDefault();dz.style.borderColor='var(--accent)';dz.style.background='var(--accent-soft)';});
  dz.addEventListener('dragleave',()=>{dz.style.borderColor='var(--border)';dz.style.background='';});
  dz.addEventListener('drop',e=>{e.preventDefault();dz.style.borderColor='var(--border)';dz.style.background='';_aiAddImages(e.dataTransfer.files);});
  // Paste (Ctrl+V)
  document.addEventListener('paste',_aiPasteHandler);
}

// ── RASM YUKLASH (ko'p rasm, drag&drop, Ctrl+V) ──
function _aiAddImages(files){
  if(!files||!files.length) return;
  const arr=Array.from(files).filter(f=>f.type.startsWith('image/')).slice(0, 5-_aiImages.length);
  if(!arr.length) return;
  let done=0;
  arr.forEach(file=>{
    const reader=new FileReader();
    reader.onload=e=>{
      _aiResizeImage(e.target.result, 1024, resized=>{
        _aiImages.push(resized);
        done++;
        if(done===arr.length) _aiRenderThumbs();
      });
    };
    reader.readAsDataURL(file);
  });
}
function _aiPasteHandler(e){
  if(!byId('ai-drop-zone')) return; // modal yopiq
  const items=Array.from(e.clipboardData?.items||[]).filter(i=>i.type.startsWith('image/'));
  if(!items.length) return;
  _aiAddImages(items.map(i=>i.getAsFile()).filter(Boolean));
}
function aiImageRemove(i){
  _aiImages.splice(i,1);
  _aiRenderThumbs();
  if(!_aiImages.length){ const inp=byId('ai-img-input'); if(inp) inp.value=''; }
}
function _aiRenderThumbs(){
  const grid=byId('ai-img-thumbs');
  const lbl=byId('ai-drop-label');
  const dz=byId('ai-drop-zone');
  if(!grid) return;
  if(!_aiImages.length){
    grid.style.display='none';
    if(dz){ dz.style.display='block'; dz.style.borderColor='var(--border)'; dz.style.borderStyle='dashed'; }
    if(lbl) lbl.textContent='Rasmlarni shu yerga sudrab tashlang yoki bosib tanlang';
    return;
  }
  grid.style.display='flex';
  grid.innerHTML=_aiImages.map((src,i)=>`
    <div style="position:relative;flex-shrink:0">
      <img src="${src}" style="height:80px;width:80px;object-fit:cover;border-radius:8px;border:1.5px solid var(--accent);display:block"/>
      <button onclick="aiImageRemove(${i})" style="position:absolute;top:2px;right:2px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.65);color:#fff;border:none;cursor:pointer;font-size:13px;line-height:20px;text-align:center;padding:0">×</button>
    </div>`).join('');
  if(dz) dz.style.display=_aiImages.length>=5?'none':'block';
  if(lbl) lbl.textContent=`${_aiImages.length} ta rasm biriktirildi ✓ — yana qo'shish mumkin (${5-_aiImages.length} ta qoldi)`;
  if(_aiImages.length<5&&dz){ dz.style.borderColor='var(--accent)'; dz.style.borderStyle='solid'; }
}
function _aiResizeImage(dataUrl, maxPx, cb){
  const img=new Image();
  img.onload=()=>{
    const scale=Math.min(1, maxPx/Math.max(img.width,img.height));
    const w=Math.round(img.width*scale), h=Math.round(img.height*scale);
    const c=document.createElement('canvas');
    c.width=w; c.height=h;
    c.getContext('2d').drawImage(img,0,0,w,h);
    cb(c.toDataURL('image/jpeg',0.85));
  };
  img.src=dataUrl;
}

// ── GROQ KALITI ──
let _aiKeySaveTimer=null;
function aiKeyAutoSave(val){
  const v=(val||'').trim();
  localStorage.setItem(AI_KEY_STORE, v);
  _aiUpdateSettingsBadge();
  const hint=document.getElementById('ai-key-hint');
  if(hint) hint.textContent = v
    ? 'Saqlandi ✓ — barcha qurilmalarda ishlaydi'
    : 'Kalit kiritilmagan';
  clearTimeout(_aiKeySaveTimer);
  _aiKeySaveTimer=setTimeout(()=>{
    if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('groqKey', v);
  }, 700);
}
function aiKeyClear(){
  localStorage.removeItem(AI_KEY_STORE);
  const el=document.getElementById('ai-key-inp'); if(el) el.value='';
  _aiUpdateSettingsBadge();
  if(typeof saveSettingToFirestore==='function') saveSettingToFirestore('groqKey','');
  const hint=document.getElementById('ai-key-hint');
  if(hint) hint.textContent='Kalit kiritilmagan';
  toast("Groq kaliti o'chirildi");
}
function _aiUpdateSettingsBadge(){
  if(typeof setConnBadge==='function') setConnBadge('ai-status-badge', !!getAiKey());
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
`SEN INFOGRAFIK DIZAYN AGENTISAN.

Foydalanuvchi qisqacha yozadi (masalan: "Kerasys uchun 4 betlik dizayn").
Sen shu ma'lumotdan to'liq, batafsil dizayn brifingi yaratasan.

═══ UMUMIY QOIDALAR (har doim qo'llan) ═══
• O'lcham: 1080×1440 px (vertikal)
• Mahsulot rasmi infografikning 60-80% ini egallaydi — FOKUS MAHSULOTGA
• Matnlar katta va o'qishga oson, faqat ENG KERAKLI ma'lumotlar
• Uslub: YORQIN, CLEAN, zamonaviy marketplace estetikasi
• Mahsulot dizayniga mos to'ldiruvchi dekorativ elementlar qo'shilishi mumkin
• Har bir bet mustaqil va to'liq ko'rinishli bo'lsin

═══ BETLAR TUZILMASI ═══
1-BET (har doim): Mahsulot nomi • Firma logosi • Asosiy 3-5 ta xarakteristika • Hero rasm
2-BET va keyin: Tarkib / foydalanish / afzalliklar / narx / boshqa ma'lumotlar

═══ CHIQISH FORMATI ═══
Har bir bet uchun ALOHIDA bo'lim yoz:
- Betning maqsadi va g'oyasi
- Vizual tarkib (nima, qayerda, qanday o'lchamda)
- Matn bloklari (sarlavha, kichik matn, badge'lar)
- Rang va uslub yo'nalishi
- Dekorativ elementlar

MUHIM: Dizayner hujjatni o'qib, XAYOLIDA to'liq vizualizatsiyani ko'ra olishi kerak.
Jadvallar, h2/h3 sarlavhalar, ro'yxatlar — barchasini ishlatib batafsil yoz.`;

function loadAiSettings(){
  const keyEl=document.getElementById('ai-key-inp');
  if(keyEl) keyEl.value=getAiKey();
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
  if(!textInp && !_aiImages.length){ toast("Avval ovoz yozing, matn kiriting yoki rasm biriktiring"); return; }

  const res=byId('ai-result'); if(!res) return;
  res.style.display='block';
  res.innerHTML=`<div style="text-align:center;padding:20px;color:var(--muted)"><div class="ai-loader"></div><div style="margin-top:8px;font-size:13px">${_aiImages.length?'Rasmlar tahlil qilinmoqda… (1/2)':'Tahlil qilinmoqda…'}</div></div>`;

  try{
    const today=new Date().toISOString().slice(0,10);
    const catList=typeof catKeys==='function'?catKeys().join(', '):'A, B, C';
    const customInstr=(getAiInstructions()||'').trim();

    const rulesBlock=customInstr||AI_DEFAULT_INSTRUCTIONS;

    const systemPrompt=
`Sen EXON tizimidagi infografik dizayn agentisan.
Foydalanuvchi o'zbek tilida QISQACHA yozadi (masalan: "Kerasys uchun 4 betlik dizayn").
Sening vazifang: shu qisqa ma'lumotdan professional, JUDA BATAFSIL dizayn brifingi yaratish.

BUGUN: ${today}
KATEGORIYALAR: ${catList}

═══════════════════════════════════
AGENT QOIDALARI:
═══════════════════════════════════
${rulesBlock}
═══════════════════════════════════

CHIQISH TALABLARI:
- descHtml maydoni HAQIQIY HTML bo'lsin: h2, h3, p, ul, li, strong, table teglaridan foydalan
- Har bir bet uchun ALOHIDA bo'lim yoz (masalan: <h2>1-BET: Mahsulot taqdimoti</h2>)
- Har bir betda vizual tarkib, matn bloklari, rang va dekor elementlari batafsil yozilsin
- Jadval ishlatish kerak bo'lsa: <table><tr><th>...</th></tr><tr><td>...</td></tr></table>
- Dizayner hujjatni o'qib XAYOLIDA to'liq vizualizatsiyani KO'RA OLISHI KERAK
- Matn juda uzun bo'lsin — qisqalik XATO, batafsil yozish MAJBURIY

MAJBURIY JAVOB FORMATI — faqat shu JSON, boshqa hech narsa yozma:
{"title":"loyiha nomi 3-8 so'z","descHtml":"...to'liq HTML...","priority":"low|medium|high","deadline":"YYYY-MM-DD yoki null","category":"kategoriyalardan biri yoki null"}`;

    const key=getAiKey();
    if(!key) throw new Error("Groq API kaliti yo'q — Sozlamalar → AI Yordamchi");

    // 2-BOSQICHLI PIPELINE: Vision → Text
    let productInfo='';
    if(_aiImages.length>0){
      // 1-bosqich: rasmlardan mahsulot ma'lumotlarini qisqa ol
      res.innerHTML=`<div style="text-align:center;padding:20px;color:var(--muted)"><div class="ai-loader"></div><div style="margin-top:8px;font-size:13px">Rasmlar tahlil qilinmoqda… (1/2)</div></div>`;
      const visionResp=await fetch(AI_CHAT_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
        body:JSON.stringify({
          model:AI_VISION_MODEL,
          messages:[{
            role:'user',
            content:[
              ..._aiImages.map(url=>({type:'image_url',image_url:{url}})),
              {type:'text',text:'Bu mahsulot rasmlaridan quyidagilarni aniqla va qisqacha yoz (JSON emas, oddiy matn):\n- Mahsulot nomi va brend\n- Qadoq ranglari va vizual uslub\n- Qadoqdagi asosiy matnlar va xususiyatlar\n- Mahsulot turi va kategoriyasi\n- Ko\'zga tashlanadigan boshqa ma\'lumotlar'}
            ]
          }],
          temperature:0.3,
          max_tokens:1500
        })
      });
      if(visionResp.ok){
        const vd=await visionResp.json();
        productInfo=vd.choices?.[0]?.message?.content||'';
      }
      res.innerHTML=`<div style="text-align:center;padding:20px;color:var(--muted)"><div class="ai-loader"></div><div style="margin-top:8px;font-size:13px">Dizayn briefi yaratilmoqda… (2/2)</div></div>`;
    }

    // 2-bosqich: LLaMA 70B bilan to'liq tz yarat
    const finalUserText=[
      productInfo?`RASMLARDAN OLINGAN MAHSULOT MA'LUMOTLARI:\n${productInfo}`:'',
      textInp?`FOYDALANUVCHI TALABI:\n${textInp}`:''
    ].filter(Boolean).join('\n\n') || 'Dizayn briefi yarat';

    const chatResp=await fetch(AI_CHAT_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({
        model:AI_CHAT_MODEL,
        messages:[
          {role:'system',content:systemPrompt},
          {role:'user',content:finalUserText}
        ],
        temperature:0.5,
        max_tokens:4000,
        response_format:{type:'json_object'}
      })
    });
    if(!chatResp.ok){
      const errText=await chatResp.text().catch(()=>'');
      let errMsg='';
      try{ errMsg=JSON.parse(errText)?.error?.message||''; }catch(e){}
      throw new Error(errMsg||errText||`HTTP ${chatResp.status}`);
    }
    const chatData=await chatResp.json();
    const raw=chatData.choices?.[0]?.message?.content||'';
    if(!raw) throw new Error("AI bo'sh javob qaytardi");

    let parsed;
    try{
      // avval to'g'ridan-to'g'ri parse qilib ko'r
      const cleaned=raw.replace(/```json|```/g,'').trim();
      try{ parsed=JSON.parse(cleaned); }
      catch{
        // JSON blokini qidirish: { ... } orasidan ajrat
        const m=cleaned.match(/\{[\s\S]*\}/);
        if(m) parsed=JSON.parse(m[0]);
        else throw new Error("JSON topilmadi");
      }
    }catch{ throw new Error("AI javobi noto'g'ri formatda — qayta urining"); }
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
        <div class="rich" id="ai-res-desc" style="font-size:13px;line-height:1.6;color:var(--muted)">${p.descHtml||''}</div>
        <div id="ai-res-ru" style="display:none;margin-top:14px;padding-top:14px;border-top:1px dashed var(--border)">
          <div style="font-size:11px;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px">${RU_FLAG} Ruscha tarjima</div>
          <div class="rich" id="ai-res-ru-content" style="font-size:13px;line-height:1.6;color:var(--muted)"></div>
        </div>
      </div>
      <div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-primary" style="flex:1" onclick="aiApply()">✓ Tasdiqlash</button>
        <button class="btn btn-ghost" id="ai-ru-btn" onclick="aiResultTranslate()">${RU_FLAG} Ruscha</button>
        <button class="btn btn-ghost" onclick="aiProcess()">Qayta tahlil</button>
      </div>
    </div>`;
}

function aiResultTranslate(){
  const btn=byId('ai-ru-btn');
  const ruBox=byId('ai-res-ru');
  if(ruBox&&ruBox.style.display!=='none'){ ruBox.style.display='none'; if(btn) btn.innerHTML=RU_FLAG+' Ruscha'; return; }
  const html=(_aiLastResult?.descHtml||'');
  if(!html) return;
  if(btn){ btn.disabled=true; btn.textContent='Tarjima qilinmoqda…'; }
  aiTranslate(html, (ru)=>{
    const rc=byId('ai-res-ru-content'); if(rc) rc.innerHTML=ru;
    if(ruBox) ruBox.style.display='block';
    if(btn){ btn.disabled=false; btn.innerHTML=RU_FLAG+' Yashirish'; }
  }, (err)=>{
    if(btn){ btn.disabled=false; btn.innerHTML=RU_FLAG+' Ruscha'; }
    toast('Tarjima xatosi: '+err);
  });
}

// ── RUS TILIGA TARJIMA (umumiy) ──
async function aiTranslate(html, onDone, onError){
  const key=getAiKey();
  if(!key){ toast("Groq kaliti yo'q — Sozlamalar → AI Yordamchi"); return; }
  try{
    const resp=await fetch(AI_CHAT_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({
        model:AI_CHAT_MODEL,
        messages:[
          {role:'system',content:"You are a professional Uzbek-to-Russian translator working with HTML content.\n\nYour STRICT rules:\n1. Translate EVERY word from Uzbek to Russian - leave nothing in Uzbek\n2. Write Russian text ONLY in Cyrillic script: А Б В Г Д Е Ё Ж З И Й К Л М Н О П Р С Т У Ф Х Ц Ч Ш Щ Ъ Ы Ь Э Ю Я\n3. NEVER use Latin letters for Russian words (wrong: 'Beliy', correct: 'Белый')\n4. Keep all HTML tags and attributes exactly as-is, only translate text inside tags\n5. Return ONLY the translated HTML - no explanations, no code fences (```), no extra text\n\nTranslation examples:\n- 'Asosiy rang: Oq' → 'Основной цвет: Белый'\n- 'Mahsulot nomi' → 'Название товара'\n- 'Loyiha tavsifi' → 'Описание проекта'\n- 'Dizayn' → 'Дизайн'\n- 'Sahifa' → 'Страница'\n- 'Fon' → 'Фон'\n- 'Sarlavha' → 'Заголовок'"},
          {role:'user',content:html}
        ],
        temperature:0.3,
        max_tokens:4000
      })
    });
    if(!resp.ok){
      const t=await resp.text().catch(()=>''); let m='';
      try{m=JSON.parse(t)?.error?.message||'';}catch(e){}
      throw new Error(m||`HTTP ${resp.status}`);
    }
    const data=await resp.json();
    const out=(data.choices?.[0]?.message?.content||'').replace(/```html|```/g,'').trim();
    if(!out) throw new Error("Bo'sh javob");
    onDone(out);
  }catch(e){ if(onError) onError(e.message); else toast('Tarjima xatosi: '+e.message); }
}

// Tarjima sifatini tekshirish — qisqa tekstlarda (<25 harf) o'tkazib yuboriladi
async function aiCheckTranslation(uzText, ruText, onResult){
  if(!uzText || uzText.replace(/\s+/g,'').length < 25){ onResult(null); return; }
  const key=getAiKey(); if(!key){ onResult(null); return; }
  try{
    const resp=await fetch(AI_CHAT_URL,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({
        model:AI_CHAT_MODEL,
        messages:[
          {role:'system',content:"You are a translation quality evaluator for Uzbek→Russian translations. Check if the Russian translation accurately and completely conveys the meaning of the Uzbek original. Consider semantic accuracy, completeness, and naturalness. Respond ONLY with valid JSON (no other text): {\"ok\":true,\"note\":\"\"} if accurate, or {\"ok\":false,\"note\":\"<1 sentence in Uzbek explaining the issue, max 70 chars>\"} if there are problems."},
          {role:'user',content:`Uzbek:\n${uzText.slice(0,600)}\n\nRussian:\n${ruText.slice(0,600)}`}
        ],
        temperature:0.1,
        max_tokens:120,
        response_format:{type:'json_object'}
      })
    });
    if(!resp.ok){ onResult(null); return; }
    const data=await resp.json();
    const raw=(data.choices?.[0]?.message?.content||'').trim();
    const m=raw.match(/\{[\s\S]*?\}/);
    if(!m){ onResult(null); return; }
    onResult(JSON.parse(m[0]));
  }catch(e){ onResult(null); }
}

// ── TASDIQLASH ──
function aiApply(){
  const p=_aiLastResult;
  if(!p){ toast("Xatolik — qayta tahlil qiling"); return; }
  if(byId('pk-title')&&byId('pk-rte')){
    if(p.title){ const el=byId('pk-title'); if(el) el.value=p.title; }
    if(p.descHtml){ const rte=byId('pk-rte'); if(rte){ rte.innerHTML=p.descHtml; typeof rteInput==='function'&&rteInput(); } }
    if(p.priority){ const el=byId('pk-priority'); if(el) el.value=p.priority; }
    if(p.deadline){ const el=byId('pk-deadline'); if(el){ el.dataset.isoDate=p.deadline; el.value=typeof dpFmt==='function'?dpFmt(p.deadline):p.deadline; } }
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

// ═══════════════════════════════════════════════
// XUSUSIY AI YORDAMCHI — chat panel
// ═══════════════════════════════════════════════

let _aiChatHistory=[];
let _aiChatReady=false;

function _aiCtx(){
  const dList=designers.map(d=>`ID:${d.id} "${d.name}" (${d.role}, ${d.category} kat., ${d.status})`).join('\n');
  const pList=[...projects].filter(p=>p.status!=='deleted').sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,30).map(p=>{
    const d=designers.find(x=>x.id===p.designerId);
    return `ID:${p.id} "${p.title}" dizayner:"${d?.name||'?'}"(ID:${p.designerId}) holat:${p.status}${p.deadline?' muddat:'+p.deadline:''} narx:${p.units}x${p.pricePerUnit}`;
  }).join('\n');
  const today=new Date().toISOString().slice(0,10);
  const cats=typeof CAT_INFO!=='undefined'?Object.entries(CAT_INFO).map(([k,v])=>`${k}:${v.label},${v.priceRange[0]}-${v.priceRange[1]}`).join('; '):'';
  return `Bugun: ${today}\n\nDIZAYNERLAR:\n${dList||'(yo\'q)'}\n\nLOYIHALAR (so'nggi 30):\n${pList||'(yo\'q)'}\n\nKATEGORIYALAR: ${cats}`;
}

function _aiChatSysPrompt(){
  return `Sen EXON loyiha boshqaruv tizimining AI yordamchisisan. Art direktor seni ishlatadi. O'zbek tilida javob ber.

${_aiCtx()}

SEN QILA OLADIGAN AMALLAR (actions massivida qaytarasan):

1. create_project — yangi loyiha yaratish
   params: {title, designerId(raqam), description(HTML tavsif/TZ), deadline(YYYY-MM-DD), priority(low/medium/high), units(raqam), pricePerUnit(raqam)}
   Agar TZ yozish kerak bo'lsa, description ga batafsil professional texnik topshiriq yoz (h2, h3, p, ul, ol, table, strong).

2. update_project — loyihani yangilash
   params: {id(raqam), status(wip/review/done), deadline, title, designerId, priority}

3. delete_project — chiqitdonga tashlash
   params: {id(raqam)}

4. create_designer — yangi dizayner qo'shish
   params: {name, role, category(A/B/C), phone, telegram, cardNumber, skills(massiv)}

5. send_to_notion — Notionga yuborish
   params: {id(raqam)}

6. open_project — loyihani peek panelda ochish
   params: {id(raqam)}

7. navigate — sahifaga o'tish
   params: {panel} (dashboard/designers/projects/payments/reports/settings)

JAVOB FORMATI — har doim faqat JSON:
{"reply":"Foydalanuvchiga o'zbek tilida javob","actions":[{"name":"action_name","params":{...}}]}

Agar hech qanday amal kerak bo'lmasa: actions bo'sh massiv [].
Bir necha amal kerak bo'lsa, hammasini actions ga qo'sh.

QOIDALAR:
- Har doim o'zbek tilida javob ber
- Dizayner/loyiha nomini izlab, to'g'ri ID bilan amal qil
- Deadline formati YYYY-MM-DD
- Agar ma'lumot yetmasa (qaysi dizayner, qanday loyiha), so'ra — bajarma
- Faqat JSON javob ber, boshqa hech narsa yo'q`;
}

let _aiFabHidden=false;

function dismissAiFab(){
  _aiFabHidden=true;
  const fab=document.getElementById('ai-chat-fab');
  const panel=document.getElementById('ai-chat-panel');
  const trash=document.getElementById('ai-fab-trash');
  if(panel) panel.classList.remove('open');
  if(fab){fab.style.transition='transform .3s,opacity .2s';fab.classList.add('hide');}
  if(trash) trash.classList.remove('visible','over');
}

function _ensureAiChat(){
  if(_aiChatReady) return;
  _aiChatReady=true;
  if(_aiFabHidden) return;

  const trash=document.createElement('div');
  trash.id='ai-fab-trash';trash.className='ai-fab-trash';
  trash.innerHTML='<svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M2 4h12M5.5 4V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1"/><path d="M3.5 4l.7 9a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1l.7-9"/></svg>';
  document.body.appendChild(trash);

  const fab=document.createElement('button');
  fab.id='ai-chat-fab';fab.className='ai-chat-fab';fab.title='AI Yordamchi';
  fab.innerHTML=`<svg class="ai-fab-face" viewBox="0 0 28 28" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round"><line class="ai-eye" x1="8" y1="11" x2="12" y2="11"/><line class="ai-eye ai-eye-r" x1="16" y1="11" x2="20" y2="11"/><path class="ai-m ai-m1" d="M9 19Q14 23 19 19"/><line class="ai-m ai-m2" x1="10" y1="20" x2="18" y2="20"/><path class="ai-m ai-m3" d="M9 21Q14 18 19 21"/></svg>`;

  let _holdTimer=0,_canDrag=false,_dragging=false,_moved=false,_pid=0;
  let _sx,_sy,_fabL,_fabT;

  fab.addEventListener('pointerdown',e=>{
    _pid=e.pointerId;_sx=e.clientX;_sy=e.clientY;
    _canDrag=false;_dragging=false;_moved=false;
    fab.setPointerCapture(e.pointerId);
    _holdTimer=setTimeout(()=>{
      _canDrag=true;
      fab.style.transition='none';fab.style.cursor='grabbing';
      fab.classList.add('drag-ready');
    },1000);
  });

  fab.addEventListener('pointermove',e=>{
    if(!_canDrag) return;
    const dx=e.clientX-_sx,dy=e.clientY-_sy;
    if(!_dragging&&Math.abs(dx)+Math.abs(dy)<4) return;
    if(!_dragging){
      _dragging=true;_moved=true;
      const r=fab.getBoundingClientRect();
      _fabL=r.left;_fabT=r.top;
      trash.classList.add('visible');
    }
    const nx=_fabL+e.clientX-_sx, ny=_fabT+e.clientY-_sy;
    fab.style.left=nx+'px';fab.style.top=ny+'px';
    fab.style.right='auto';fab.style.bottom='auto';
    const tR=trash.getBoundingClientRect(),fR=fab.getBoundingClientRect();
    const hit=fR.left<tR.right&&fR.right>tR.left&&fR.top<tR.bottom&&fR.bottom>tR.top;
    trash.classList.toggle('over',hit);
  });

  function endDrag(e){
    clearTimeout(_holdTimer);
    try{fab.releasePointerCapture(_pid);}catch{}
    fab.classList.remove('drag-ready');
    fab.style.cursor='';
    if(_dragging){
      const tR=trash.getBoundingClientRect(),fR=fab.getBoundingClientRect();
      const hit=fR.left<tR.right&&fR.right>tR.left&&fR.top<tR.bottom&&fR.bottom>tR.top;
      trash.classList.remove('visible','over');
      if(hit){dismissAiFab();return;}
      const cl=Math.max(0,Math.min(parseFloat(fab.style.left),window.innerWidth-fab.offsetWidth));
      const ct=Math.max(0,Math.min(parseFloat(fab.style.top),window.innerHeight-fab.offsetHeight));
      fab.style.left=cl+'px';fab.style.top=ct+'px';
      fab.style.transition='';
    }
    _canDrag=false;_dragging=false;
  }
  fab.addEventListener('pointerup',endDrag);
  fab.addEventListener('pointercancel',endDrag);

  fab.addEventListener('click',e=>{
    if(_moved){_moved=false;return;}
    toggleAiChat();
  });

  document.body.appendChild(fab);
}

function _buildChatPanel(){
  if(document.getElementById('ai-chat-panel')) return;
  const p=document.createElement('div');
  p.id='ai-chat-panel';p.className='ai-chat-panel';
  p.innerHTML=`
    <div class="ai-chat-head" id="ai-chat-head">
      <div class="ai-chat-head-title">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        EXON AI Yordamchi
      </div>
      <div style="display:flex;gap:4px">
        <button class="ai-chat-head-btn" onclick="_aiChatClear()" title="Tarixni tozalash">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 4h12M5.5 4V3a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1"/><path d="M3.5 4l.7 9a1 1 0 0 0 1 1h5.6a1 1 0 0 0 1-1l.7-9"/></svg>
        </button>
        <button class="ai-chat-head-btn" onclick="toggleAiChat()">✕</button>
      </div>
    </div>
    <div class="ai-chat-msgs" id="ai-chat-msgs">
      <div class="ai-chat-msg ai-msg"><div class="ai-chat-bubble">Salom! Men EXON AI yordamchiman.<br>Loyiha yaratish, TZ yozish, dizayner qo'shish, Notionga yuborish — ixtiyoringizda. Nima qilishim kerak?</div></div>
    </div>
    <div class="ai-chat-footer">
      <input class="ai-chat-inp" id="ai-chat-inp" placeholder="Buyruq yoki savol yozing…" onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendAiChat()}"/>
      <button class="ai-chat-send" onclick="sendAiChat()">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M14.7 1.3a1 1 0 0 0-1.1-.2L1.4 6.5a1 1 0 0 0 .1 1.8l4.3 1.7 1.7 4.3a1 1 0 0 0 1.8.1l5.4-12.2a1 1 0 0 0-.2-1z"/></svg>
      </button>
    </div>`;
  document.body.appendChild(p);

  const head=document.getElementById('ai-chat-head');
  let _pd=false,_psx,_psy,_pleft,_ptop;
  head.addEventListener('pointerdown',e=>{
    if(e.target.closest('.ai-chat-head-btn')) return;
    if(window.innerWidth<=880) return;
    _pd=true;_psx=e.clientX;_psy=e.clientY;
    const r=p.getBoundingClientRect();
    _pleft=r.left;_ptop=r.top;
    head.setPointerCapture(e.pointerId);
    p.style.transition='none';
  });
  head.addEventListener('pointermove',e=>{
    if(!_pd) return;
    let nx=_pleft+e.clientX-_psx, ny=_ptop+e.clientY-_psy;
    nx=Math.max(0,Math.min(nx,window.innerWidth-p.offsetWidth));
    ny=Math.max(0,Math.min(ny,window.innerHeight-p.offsetHeight));
    p.style.left=nx+'px';p.style.top=ny+'px';p.style.right='auto';p.style.bottom='auto';
  });
  const panelEnd=()=>{_pd=false;p.style.transition='';};
  head.addEventListener('pointerup',panelEnd);
  head.addEventListener('pointercancel',panelEnd);
}

function toggleAiChat(){
  if(!document.getElementById('ai-chat-panel')) _buildChatPanel();
  const panel=document.getElementById('ai-chat-panel');
  const fab=document.getElementById('ai-chat-fab');
  if(!panel) return;
  const opening=!panel.classList.contains('open');
  if(opening&&fab){
    const r=fab.getBoundingClientRect();
    const pw=400,ph=560;
    let pl=r.left-pw-12, pt=r.top+r.height-ph;
    if(pl<8) pl=r.right+12;
    if(pt<8) pt=8;
    if(pl+pw>window.innerWidth-8) pl=window.innerWidth-pw-8;
    if(window.innerWidth<=880){panel.style.left='';panel.style.top='';panel.style.right='';panel.style.bottom='';}
    else{panel.style.left=pl+'px';panel.style.top=pt+'px';panel.style.right='auto';panel.style.bottom='auto';}
  }
  panel.classList.toggle('open');
  if(fab) fab.classList.toggle('hide',panel.classList.contains('open'));
  if(panel.classList.contains('open')) setTimeout(()=>document.getElementById('ai-chat-inp')?.focus(),200);
}

function _aiChatClear(){
  _aiChatHistory=[];
  const m=document.getElementById('ai-chat-msgs');
  if(m) m.innerHTML='<div class="ai-chat-msg ai-msg"><div class="ai-chat-bubble">Tarix tozalandi. Yangi savol yoki buyruq bering!</div></div>';
}

function _chatBubble(role,html,id){
  const m=document.getElementById('ai-chat-msgs');if(!m) return;
  const d=document.createElement('div');
  d.className='ai-chat-msg '+(role==='user'?'user-msg':'ai-msg');
  if(id) d.id=id;
  d.innerHTML='<div class="ai-chat-bubble">'+html+'</div>';
  m.appendChild(d);m.scrollTop=m.scrollHeight;
}

function _replaceThink(html){
  const el=document.getElementById('ai-chat-think');
  if(el){el.querySelector('.ai-chat-bubble').innerHTML=html;el.removeAttribute('id');
    document.getElementById('ai-chat-msgs').scrollTop=document.getElementById('ai-chat-msgs').scrollHeight;}
}

async function sendAiChat(){
  const inp=document.getElementById('ai-chat-inp');
  const text=(inp?.value||'').trim();if(!text) return;
  inp.value='';
  _chatBubble('user',esc(text));
  _chatBubble('ai','<span class="ai-typing">Javob tayyorlanmoqda</span>','ai-chat-think');

  const key=getAiKey();
  if(!key){_replaceThink('AI kaliti sozlanmagan. <b>Sozlamalar → Groq API kaliti</b> ni kiriting.');return;}

  _aiChatHistory.push({role:'user',content:text});

  try{
    const res=await fetch(AI_CHAT_URL,{
      method:'POST',
      headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:AI_CHAT_MODEL,
        messages:[{role:'system',content:_aiChatSysPrompt()},..._aiChatHistory.slice(-16)],
        response_format:{type:'json_object'},
        max_tokens:4000,
        temperature:0.3,
      })
    });
    if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||'HTTP '+res.status);}
    const data=await res.json();
    const raw=data.choices?.[0]?.message?.content||'';
    let parsed;
    try{parsed=JSON.parse(raw);}catch{parsed={reply:raw,actions:[]};}
    _aiChatHistory.push({role:'assistant',content:raw});

    const results=[];
    if(parsed.actions?.length){for(const act of parsed.actions){const r=_aiExec(act);if(r)results.push(r);}}

    let html=esc(parsed.reply||'Tayyor.').replace(/\n/g,'<br>');
    if(results.length) html+='<div class="ai-chat-actions">'+results.map(r=>
      '<span class="ai-act-tag '+(r.ok?'ok':'err')+'">'+esc(r.label)+'</span>').join('')+'</div>';
    _replaceThink(html);
  }catch(e){_replaceThink('<span style="color:var(--error)">Xatolik: '+esc(e.message)+'</span>');}
}

function _aiExec(act){
  const p=act.params||{};
  try{switch(act.name){
    case 'create_project':{
      const did=Number(p.designerId)||designers[0]?.id;
      if(!designers.find(d=>d.id===did)) return{ok:false,label:'Dizayner topilmadi'};
      const cat=designers.find(d=>d.id===did)?.category||'B';
      const ci=typeof CAT_INFO!=='undefined'?(CAT_INFO[cat]||Object.values(CAT_INFO)[0]):null;
      const obj={title:p.title||'Yangi loyiha',designerId:did,
        descHtml:typeof sanitizeHtml==='function'?sanitizeHtml(p.description||''):(p.description||''),
        status:'wip',priority:p.priority||'medium',category:cat,
        units:Number(p.units)||1,pricePerUnit:Number(p.pricePerUnit)||(ci?ci.priceRange[0]:15000),
        deadline:p.deadline||null,date:new Date().toISOString().slice(0,10),
        tags:[],files:'',varaqs:{},comments:[],id:nextPId++};
      projects.push(obj);persist();rerenderActive();
      toast('Loyiha yaratildi: '+obj.title);
      return{ok:true,label:'✓ '+obj.title};}

    case 'update_project':{
      const id=Number(p.id),pi=projects.findIndex(x=>x.id===id);
      if(pi<0) return{ok:false,label:'Loyiha topilmadi (ID:'+p.id+')'};
      if(p.status) projects[pi].status=p.status;
      if(p.deadline) projects[pi].deadline=p.deadline;
      if(p.title) projects[pi].title=p.title;
      if(p.designerId) projects[pi].designerId=Number(p.designerId);
      if(p.priority) projects[pi].priority=p.priority;
      if(p.status==='done'&&!projects[pi].doneDate) projects[pi].doneDate=new Date().toISOString().slice(0,10);
      persist();rerenderActive();
      toast('Yangilandi: '+projects[pi].title);
      return{ok:true,label:'✓ '+projects[pi].title+' yangilandi'};}

    case 'delete_project':{
      const id=Number(p.id),proj=projects.find(x=>x.id===id);
      if(!proj) return{ok:false,label:'Loyiha topilmadi'};
      if(typeof trashProject==='function') trashProject(id);
      else projects=projects.filter(x=>x.id!==id);
      persist();rerenderActive();
      toast("O'chirildi: "+proj.title);
      return{ok:true,label:'✓ '+proj.title+" o'chirildi"};}

    case 'create_designer':{
      const d={id:nextDId++,name:p.name||'Yangi dizayner',role:p.role||'Dizayner',
        category:p.category||'B',phone:p.phone||'',telegram:p.telegram||'',
        cardNumber:p.cardNumber||'',status:'active',skills:p.skills||[],
        photo:'',joinedAt:new Date().toISOString().slice(0,10)};
      designers.push(d);persist();rerenderActive();
      toast("Dizayner qo'shildi: "+d.name);
      return{ok:true,label:'✓ '+d.name+" qo'shildi"};}

    case 'send_to_notion':{
      const id=Number(p.id),proj=projects.find(x=>x.id===id);
      if(!proj) return{ok:false,label:'Loyiha topilmadi'};
      typeof openProjectPeek==='function'&&openProjectPeek(id);
      setTimeout(()=>{typeof sendProjectToNotion==='function'&&sendProjectToNotion();},700);
      return{ok:true,label:'↗ '+proj.title+' Notionga yuborilmoqda…'};}

    case 'open_project':{
      typeof openProjectPeek==='function'&&openProjectPeek(Number(p.id));
      return{ok:true,label:'✓ Loyiha ochildi'};}

    case 'navigate':{
      typeof showPanel==='function'&&showPanel(p.panel||'dashboard');
      return{ok:true,label:'✓ '+(p.panel||'dashboard')};}

    default:return null;
  }}catch(e){return{ok:false,label:e.message};}
}

window.addEventListener('exon-ready',()=>{
  if(new URLSearchParams(location.search).get('share')) return;
  _ensureAiChat();
});
if(document.readyState==='complete'||document.readyState==='interactive'){
  setTimeout(()=>{if(!_aiChatReady&&!new URLSearchParams(location.search).get('share'))_ensureAiChat();},2000);
}
