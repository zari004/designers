// ═══════════════════════════════════════════════
// AUTH — login, foydalanuvchilar, huquqlar
// Parollar SHA-256 hash ko'rinishida saqlanadi
// ═══════════════════════════════════════════════

const PASS_SALT = 'exon::v1::';

// Sinxron SHA-256 (https bo'lmagan muhitda ham ishlaydi)
function sha256sync(input){
  var ascii = unescape(encodeURIComponent(input));
  function rightRotate(v,a){ return (v>>>a)|(v<<(32-a)); }
  var maxWord = Math.pow(2,32), result='', i, j, words=[], asciiBitLength = ascii.length*8;
  var hash = sha256sync.h = sha256sync.h || [];
  var k = sha256sync.k = sha256sync.k || [];
  var primeCounter = k.length, isComposite = {};
  for(var candidate=2; primeCounter<64; candidate++){
    if(!isComposite[candidate]){
      for(i=0;i<313;i+=candidate) isComposite[i]=candidate;
      hash[primeCounter]=(Math.pow(candidate,.5)*maxWord)|0;
      k[primeCounter++]=(Math.pow(candidate,1/3)*maxWord)|0;
    }
  }
  ascii += '\x80';
  while(ascii.length%64 - 56) ascii += '\x00';
  for(i=0;i<ascii.length;i++){
    j=ascii.charCodeAt(i);
    if(j>>8) return null;
    words[i>>2] |= j << ((3-i)%4)*8;
  }
  words[words.length]=(asciiBitLength/maxWord)|0;
  words[words.length]=asciiBitLength;
  for(j=0;j<words.length;){
    var w=words.slice(j,j+=16), oldHash=hash;
    hash=hash.slice(0,8);
    for(i=0;i<64;i++){
      var w15=w[i-15], w2=w[i-2];
      var a=hash[0], e=hash[4];
      var temp1=hash[7]
        +(rightRotate(e,6)^rightRotate(e,11)^rightRotate(e,25))
        +((e&hash[5])^(~e&hash[6]))
        +k[i]
        +(w[i]=(i<16)?w[i]:(w[i-16]+(rightRotate(w15,7)^rightRotate(w15,18)^(w15>>>3))+w[i-7]+(rightRotate(w2,17)^rightRotate(w2,19)^(w2>>>10)))|0);
      var temp2=(rightRotate(a,2)^rightRotate(a,13)^rightRotate(a,22))
        +((a&hash[1])^(a&hash[2])^(hash[1]&hash[2]));
      hash=[(temp1+temp2)|0].concat(hash);
      hash[4]=(hash[4]+temp1)|0;
    }
    for(i=0;i<8;i++) hash[i]=(hash[i]+oldHash[i])|0;
  }
  for(i=0;i<8;i++) for(j=3;j+1;j--){
    var b=(hash[i]>>(j*8))&255;
    result+=((b<16)?0:'')+b.toString(16);
  }
  return result;
}

function hashPass(p){ return sha256sync(PASS_SALT + p); }

const PERM_LABELS = {designers:'Dizaynerlar',projects:'Loyihalar',payments:"To'lovlar",reports:'Hisobotlar',users:'Foydalanuvchilar',settings:'Sozlamalar'};

function defaultAdmin(){
  return {
    id:'admin', username:'admin', passHash:hashPass('exon2024'),
    role:'admin', displayName:'Art Direktor',
    permissions:{designers:true,projects:true,settings:true,users:true,reports:true,payments:true},
  };
}

function getUsers(){
  const s = localStorage.getItem('exon_users');
  let users;
  try{ users = s ? JSON.parse(s) : null; }catch(e){ users = null; }
  if(!users || !users.length) users = [defaultAdmin()];
  // Eski format (ochiq parol) → hash'ga ko'chirish
  let migrated = false;
  users.forEach(u=>{
    if(u.password !== undefined){
      u.passHash = hashPass(u.password);
      delete u.password;
      migrated = true;
    }
  });
  if(!users.find(u=>u.id==='admin')){ users.unshift(defaultAdmin()); migrated = true; }
  if(migrated) saveUsersRaw(users);
  return users;
}

function saveUsersRaw(users){ localStorage.setItem('exon_users', JSON.stringify(users)); }

// Saqlash + sinxronlash uchun belgilash (data.js bilan bog'lanadi)
function saveUsers(users){
  saveUsersRaw(users);
  if(typeof persist === 'function') persist();
}

function getCurrentUser(){
  const s = sessionStorage.getItem('exon_session');
  if(!s) return null;
  let sess;
  try{ sess = JSON.parse(s); }catch(e){ return null; }
  return getUsers().find(u=>u.id===sess.id) || null;
}

function doLogin(){
  const uname = document.getElementById('login-user').value.trim();
  const pass  = document.getElementById('login-pass').value;
  const users = getUsers();
  const user  = users.find(u=>u.username===uname && u.passHash===hashPass(pass));
  const err   = document.getElementById('login-error');
  if(!user){ err.style.display='block'; return; }
  err.style.display='none';
  sessionStorage.setItem('exon_session', JSON.stringify({id:user.id}));
  document.getElementById('login-screen').style.display='none';
  initApp(user);
}

function doLogout(){
  sessionStorage.removeItem('exon_session');
  location.reload();
}

function hasPermission(key){
  const u = getCurrentUser();
  if(!u) return false;
  if(u.role==='admin') return true;
  return !!(u.permissions && u.permissions[key]);
}

function changeOwnPassword(){
  const old = document.getElementById('chpw-old')?.value;
  const n1  = document.getElementById('chpw-new')?.value;
  const n2  = document.getElementById('chpw-new2')?.value;
  const cur = getCurrentUser();
  if(!cur) return;
  const users = getUsers();
  const u = users.find(x=>x.id===cur.id);
  if(!u || u.passHash!==hashPass(old)){ toast("Eski parol noto'g'ri!"); return; }
  if(!n1 || n1!==n2){ toast("Yangi parollar mos emas!"); return; }
  if(n1.length<4){ toast("Parol juda qisqa (kamida 4 belgi)"); return; }
  u.passHash = hashPass(n1);
  saveUsers(users);
  toast("Parol o'zgartirildi");
  ['chpw-old','chpw-new','chpw-new2'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
}

function saveAdminCreds(){
  const cur = getCurrentUser();
  if(cur?.role!=='admin'){ toast("Ruxsat yo'q!"); return; }
  const newUname = document.getElementById('admin-uname')?.value?.trim();
  const newPass  = document.getElementById('admin-newpass')?.value;
  const curPass  = document.getElementById('admin-curpass')?.value;
  if(!newUname){ toast("Login bo'sh bo'lishi mumkin emas!"); return; }
  const users = getUsers();
  const u = users.find(x=>x.id==='admin');
  if(!u){ toast("Admin topilmadi!"); return; }
  if(u.passHash!==hashPass(curPass)){ toast("Joriy parol noto'g'ri!"); return; }
  if(users.find(x=>x.id!=='admin' && x.username===newUname)){ toast("Bu login band!"); return; }
  u.username = newUname;
  if(newPass) u.passHash = hashPass(newPass);
  saveUsers(users);
  toast("Art Direktor login ma'lumotlari saqlandi");
  ['admin-newpass','admin-curpass'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
}
