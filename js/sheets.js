// ═══════════════════════════════════════════════
// GOOGLE SHEETS — to'lovlar eksporti
// Har bir so'rov natijasi tekshiriladi, xato bo'lsa
// aniq sabab ko'rsatiladi. Eski ma'lumotlar tozalanadi.
// ═══════════════════════════════════════════════

function gsConnected(){
  return !!(localStorage.getItem('gs_sheet_id') && localStorage.getItem('gs_token'));
}
function updateGSStatus(){
  if(typeof setConnBadge==='function') setConnBadge('gs-status-badge', gsConnected());
  const gsSt=document.getElementById('gs-status');
  if(gsSt) gsSt.textContent = gsConnected()
    ? 'Ulangan — to\'lovlarni eksport qilish mumkin'
    : (localStorage.getItem('gs_sheet_id') ? 'Token kiritilmagan' : 'Sheet ID kiritilmagan');
}

let _gsSaveTimer=null;
// Yozayotganda avtomatik saqlash: local darhol, Firestore biroz kechikib
function gsAutoSave(){
  const id=(document.getElementById('gs-sheet-id')?.value||'').trim();
  const tok=(document.getElementById('gs-token')?.value||'').trim();
  localStorage.setItem('gs_sheet_id', id);
  localStorage.setItem('gs_token', tok);
  updateGSStatus();
  clearTimeout(_gsSaveTimer);
  _gsSaveTimer=setTimeout(()=>{
    if(typeof saveSettingToFirestore==='function'){
      saveSettingToFirestore('gsSheetId', id);
      saveSettingToFirestore('gsToken', tok);
    }
  }, 700);
}

// Eski tugma uchun
function saveGSSettings(){
  gsAutoSave();
  if(typeof saveSettingToFirestore==='function'){
    saveSettingToFirestore('gsSheetId', (document.getElementById('gs-sheet-id')?.value||'').trim());
    saveSettingToFirestore('gsToken', (document.getElementById('gs-token')?.value||'').trim());
  }
  toast("Google Sheets sozlamalari saqlandi — barcha qurilmalarda ishlaydi ✓");
}

function clearGSToken(){
  localStorage.removeItem('gs_sheet_id');
  localStorage.removeItem('gs_token');
  const gsId=document.getElementById('gs-sheet-id');
  const gsTok=document.getElementById('gs-token');
  if(gsId) gsId.value='';
  if(gsTok) gsTok.value='';
  updateGSStatus();
  if(typeof saveSettingToFirestore==='function'){
    saveSettingToFirestore('gsSheetId', '');
    saveSettingToFirestore('gsToken', '');
  }
  toast("Google Sheets sozlamalari o'chirildi");
}

// Varaq nomini xavfsiz qilish: []*/\?: belgilar taqiqlangan
function safeSheetTitle(name){
  return name.replace(/[\[\]\*\/\\\?:]/g,' ').trim().slice(0,30);
}
// Range ichida varaq nomi: apostrof ikkilanadi
function quoteSheet(title){
  return "'"+title.replace(/'/g,"''")+"'";
}

async function gsFetch(url, opts, errCtx){
  const res = await fetch(url, opts);
  if(!res.ok){
    const j = await res.json().catch(()=>({}));
    const msg = j.error?.message || ('HTTP '+res.status);
    if(res.status===401) throw new Error("Token muddati o'tgan yoki noto'g'ri — Sozlamalarda yangi token kiriting. ("+errCtx+")");
    if(res.status===403) throw new Error("Ruxsat yo'q — token Sheets API huquqiga ega emas yoki bu jadvalga kirish yopiq. ("+errCtx+")");
    if(res.status===404) throw new Error("Jadval topilmadi — Sheet ID noto'g'ri. ("+errCtx+")");
    throw new Error(errCtx+': '+msg);
  }
  return res.json();
}

async function exportToGoogleSheets(){
  let sheetId=localStorage.getItem('gs_sheet_id');
  let token=localStorage.getItem('gs_token');
  if(!sheetId||!token){
    if(typeof syncSettingsFromFirestore==='function') await syncSettingsFromFirestore();
    sheetId=localStorage.getItem('gs_sheet_id');
    token=localStorage.getItem('gs_token');
  }
  if(!sheetId||!token){
    toast("Avval Sozlamalar bo'limida Google Sheets ulanishini to'ldiring");
    goToSettingsFrom('payments');
    return;
  }
  const btn=document.getElementById('gs-export-btn');
  if(btn){btn.disabled=true;btn.textContent='Yuklanmoqda...';}

  const dval=document.getElementById('pay-d-filter')?.value||'all';
  const mval=document.getElementById('pay-month-filter')?.value||'all';
  let doneProjs=projects.filter(p=>p.status==='done'&&(dval==='all'||p.designerId===parseInt(dval)));
  doneProjs=filterByMonth(doneProjs,mval);

  const H={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
  const BASE=`https://sheets.googleapis.com/v4/spreadsheets/${sheetId}`;

  try{
    if(!doneProjs.length) throw new Error("Eksport uchun bajarilgan loyiha yo'q");

    // Faqat loyihasi bor dizaynerlar uchun varaq ochamiz
    const activeDesigners = designers.filter(d=>doneProjs.some(p=>p.designerId===d.id));

    // 1. Mavjud varaqlar
    const meta = await gsFetch(BASE,{headers:H},'Jadvalni ochish');
    const existingSheets=(meta.sheets||[]).map(s=>({id:s.properties.sheetId,title:s.properties.title}));

    // 2. Kerakli varaqlarni yaratish
    const neededNames=['Umumiy Hisobot',...activeDesigners.map(d=>safeSheetTitle(d.name))];
    const addReqs=neededNames
      .filter(name=>!existingSheets.find(s=>s.title===name))
      .map(name=>({addSheet:{properties:{title:name}}}));

    let sheetIdMap={};
    existingSheets.forEach(s=>{sheetIdMap[s.title]=s.id;});
    if(addReqs.length){
      const addData = await gsFetch(`${BASE}:batchUpdate`,{method:'POST',headers:H,body:JSON.stringify({requests:addReqs})},'Varaq yaratish');
      (addData.replies||[]).forEach(r=>{if(r.addSheet) sheetIdMap[r.addSheet.properties.title]=r.addSheet.properties.sheetId;});
    }

    // 3. Eski ma'lumotlarni tozalash
    await gsFetch(`${BASE}/values:batchClear`,{
      method:'POST',headers:H,
      body:JSON.stringify({ranges:neededNames.map(n=>`${quoteSheet(n)}!A1:Z2000`)}),
    },'Tozalash');

    const valueUpdates=[];
    const formatRequests=[];

    // ── UMUMIY HISOBOT ──
    const sumTitle='Umumiy Hisobot';
    const sumSId=sheetIdMap[sumTitle];
    const summaryRows=[
      ["EXON Dizaynerlar — To'lovlar hisoboti"],
      [`Sana: ${new Date().toLocaleDateString('uz-UZ')}`],
      [],
      ['Dizayner','Karta raqami','Kat.','Loyiha nomi','Boshlangan','Muddat','Bajarilgan','Holat','Birlik','Narx/birlik',"Jami (so'm)","To'langan sana"],
    ];
    const colorRequests=[];
    let rowIdx=4;

    activeDesigners.forEach(d=>{
      const dp=doneProjs.filter(p=>p.designerId===d.id);
      dp.forEach(p=>{
        const isOverdue=p.deadline&&p.doneDate&&p.doneDate>p.deadline;
        const payStatus=p.paymentPaid?"TO'LANGAN":(isOverdue?"KECHIKKAN":"KUTILMOQDA");
        summaryRows.push([
          d.name, d.cardNumber||'', p.category, p.title,
          p.date, p.deadline||'', p.doneDate||'',
          payStatus, p.units, p.pricePerUnit, p.units*p.pricePerUnit,
          p.paymentDate||''
        ]);
        if(p.paymentPaid){
          colorRequests.push({repeatCell:{range:{sheetId:sumSId,startRowIndex:rowIdx,endRowIndex:rowIdx+1,startColumnIndex:0,endColumnIndex:12},cell:{userEnteredFormat:{backgroundColor:{red:0.85,green:0.97,blue:0.87}}},fields:'userEnteredFormat.backgroundColor'}});
        } else if(isOverdue){
          colorRequests.push({repeatCell:{range:{sheetId:sumSId,startRowIndex:rowIdx,endRowIndex:rowIdx+1,startColumnIndex:0,endColumnIndex:12},cell:{userEnteredFormat:{backgroundColor:{red:0.99,green:0.87,blue:0.87}}},fields:'userEnteredFormat.backgroundColor'}});
        }
        rowIdx++;
      });
      const tot=dp.reduce((s,p)=>s+p.units*p.pricePerUnit,0);
      const paid=dp.filter(p=>p.paymentPaid).reduce((s,p)=>s+p.units*p.pricePerUnit,0);
      summaryRows.push(['','','','','','','',`${d.name} JAMI:`,dp.reduce((s,p)=>s+p.units,0),'',tot,`To'langan: ${paid.toLocaleString()}`]);
      colorRequests.push({repeatCell:{range:{sheetId:sumSId,startRowIndex:rowIdx,endRowIndex:rowIdx+1,startColumnIndex:0,endColumnIndex:12},cell:{userEnteredFormat:{backgroundColor:{red:0.95,green:0.95,blue:0.95},textFormat:{bold:true}}},fields:'userEnteredFormat(backgroundColor,textFormat)'}});
      summaryRows.push([]);
      rowIdx+=2;
    });

    valueUpdates.push({range:`${quoteSheet(sumTitle)}!A1`,values:summaryRows});

    formatRequests.push(
      {repeatCell:{range:{sheetId:sumSId,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{textFormat:{bold:true,fontSize:13}}},fields:'userEnteredFormat.textFormat'}},
      {repeatCell:{range:{sheetId:sumSId,startRowIndex:3,endRowIndex:4},cell:{userEnteredFormat:{backgroundColor:{red:0.13,green:0.13,blue:0.13},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}}}},fields:'userEnteredFormat(backgroundColor,textFormat)'}},
      ...colorRequests,
      {updateDimensionProperties:{range:{sheetId:sumSId,dimension:'COLUMNS',startIndex:3,endIndex:4},properties:{pixelSize:250},fields:'pixelSize'}},
      {updateDimensionProperties:{range:{sheetId:sumSId,dimension:'COLUMNS',startIndex:0,endIndex:1},properties:{pixelSize:160},fields:'pixelSize'}},
    );

    // ── HAR BIR DIZAYNER ──
    activeDesigners.forEach(d=>{
      const title=safeSheetTitle(d.name);
      const dSId=sheetIdMap[title];
      if(dSId===undefined) return;
      const dp=doneProjs.filter(p=>p.designerId===d.id);
      const dRows=[
        [`${d.name} — To'lovlar hisoboti`],
        [`Karta: ${d.cardNumber||'—'}  |  Kategoriya: ${d.category}  |  Sana: ${new Date().toLocaleDateString('uz-UZ')}`],
        [],
        ['#','Loyiha nomi','Boshlangan','Muddat','Bajarilgan','Kat.','Birlik','Narx/birlik',"Jami (so'm)",'Holat',"To'langan sana"],
      ];
      let dRowIdx=4;
      const dColorReqs=[];
      dp.forEach((p,i)=>{
        const isOverdue=p.deadline&&p.doneDate&&p.doneDate>p.deadline;
        const payStatus=p.paymentPaid?"TO'LANGAN":(isOverdue?"KECHIKKAN":"KUTILMOQDA");
        dRows.push([i+1,p.title,p.date,p.deadline||'—',p.doneDate||'—',p.category,p.units,p.pricePerUnit,p.units*p.pricePerUnit,payStatus,p.paymentDate||'']);
        if(p.paymentPaid){
          dColorReqs.push({repeatCell:{range:{sheetId:dSId,startRowIndex:dRowIdx,endRowIndex:dRowIdx+1,startColumnIndex:0,endColumnIndex:11},cell:{userEnteredFormat:{backgroundColor:{red:0.85,green:0.97,blue:0.87}}},fields:'userEnteredFormat.backgroundColor'}});
        } else if(isOverdue){
          dColorReqs.push({repeatCell:{range:{sheetId:dSId,startRowIndex:dRowIdx,endRowIndex:dRowIdx+1,startColumnIndex:0,endColumnIndex:11},cell:{userEnteredFormat:{backgroundColor:{red:0.99,green:0.87,blue:0.87}}},fields:'userEnteredFormat.backgroundColor'}});
        }
        dRowIdx++;
      });
      const tot=dp.reduce((s,p)=>s+p.units*p.pricePerUnit,0);
      const paidTot=dp.filter(p=>p.paymentPaid).reduce((s,p)=>s+p.units*p.pricePerUnit,0);
      dRows.push([]);
      dRows.push(['','JAMI:','','','','',dp.reduce((s,p)=>s+p.units,0),'',tot,'','']);
      dRows.push(['',"TO'LANGAN:",'','','','','','',paidTot,'','']);
      dRows.push(['','QOLDI:','','','','','','',tot-paidTot,'','']);

      valueUpdates.push({range:`${quoteSheet(title)}!A1`,values:dRows});

      formatRequests.push(
        {repeatCell:{range:{sheetId:dSId,startRowIndex:0,endRowIndex:1},cell:{userEnteredFormat:{textFormat:{bold:true,fontSize:13}}},fields:'userEnteredFormat.textFormat'}},
        {repeatCell:{range:{sheetId:dSId,startRowIndex:3,endRowIndex:4},cell:{userEnteredFormat:{backgroundColor:{red:0.13,green:0.13,blue:0.13},textFormat:{bold:true,foregroundColor:{red:1,green:1,blue:1}}}},fields:'userEnteredFormat(backgroundColor,textFormat)'}},
        ...dColorReqs,
        {repeatCell:{range:{sheetId:dSId,startRowIndex:dRowIdx+1,endRowIndex:dRowIdx+4},cell:{userEnteredFormat:{textFormat:{bold:true}}},fields:'userEnteredFormat.textFormat'}},
        {updateDimensionProperties:{range:{sheetId:dSId,dimension:'COLUMNS',startIndex:1,endIndex:2},properties:{pixelSize:240},fields:'pixelSize'}},
      );
    });

    // 4. Qiymatlarni yozish — natija tekshiriladi
    await gsFetch(`${BASE}/values:batchUpdate`,{
      method:'POST',headers:H,
      body:JSON.stringify({valueInputOption:'RAW',data:valueUpdates}),
    },"Ma'lumot yozish");

    // 5. Formatlash — natija tekshiriladi
    if(formatRequests.length){
      await gsFetch(`${BASE}:batchUpdate`,{method:'POST',headers:H,body:JSON.stringify({requests:formatRequests})},'Formatlash');
    }

    toast(`${activeDesigners.length+1} ta varaq Google Sheets'ga yozildi`);
  }catch(e){
    console.error('Google Sheets eksport xatosi:', e);
    toast('Xatolik: '+e.message);
  }finally{
    if(btn){btn.disabled=false;btn.textContent="Google Sheets'ga saqlash";}
  }
}
