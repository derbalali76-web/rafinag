/* ═══════════ AUTH (متعدد المستخدمين) ═══════════ */
let _USERS_PATH='goldpro/_users';
let _CUSTS_PATH='goldpro/_customers';
let _usersCache={};

/* ═══ الأدوار — مطابقة لِـ rafinag ═══
   admin: كل شيء | worker: ورشته فقط | customer: كشف حسابه فقط (قراءة) */
const _WORKERS={
    dahmoun:{pw:'0000',workshop:'workshop1',wsName:'دحمون',accent:'#0EA5E9'},
    salah:  {pw:'1111',workshop:'workshop2',wsName:'صلاح', accent:'#8B5CF6'}
};
let _sessionRole='admin',_sessionWs=null,_sessionCustName='';

async function _sha256(s){
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(x=>x.toString(16).padStart(2,'0')).join('');
}

/* ═══ الدخول الموحّد: حقلان فقط، والدور يُستنتج من اسم المستخدم ═══
   admin → مسؤول | dahmoun/salah → عامل ورشة | رقم هاتف → زبون */
window.doLoginUnified=async function(){
    const u=(document.getElementById('loginUser').value||'').trim().toLowerCase();
    const pw=document.getElementById('loginPw').value;
    document.getElementById('loginErr').style.display='none';
    if(!u)return _showLoginErr('أدخل اسم المستخدم');
    if(/^[0-9]{6,}$/.test(u)){
        if(!pw)return _showLoginErr('أدخل كلمة المرور');
        return doLoginCustomer(u,pw);                             /* رقم هاتف = زبون */
    }
    if(_RAFPARTNERS[u])return doLoginPartner(u,pw);               /* شريك رافيناج (عرض) */
    if(_RAFEDITORS[u])return doLoginRafEditor(u,pw);             /* محرّر رافيناج (تسجيل) */
    if(_WORKERS[u])return doLoginWorker(u,pw);                    /* عامل ورشة */
    if(u==='admin')return doLogin();                              /* المسؤول */
    return _showLoginErr('اسم المستخدم غير معروف');
};

/* ── Firebase Email/Password Auth ──
   كل مستخدم يحصل على بريد افتراضي: username@goldpro.local
   هذا يضمن نفس الـ UID على كل الأجهزة بدل Anonymous الذي يعطي UID مختلف لكل جهاز */
const _FB_DOMAIN='@goldpro.local';
/* شركاء الرافيناج المقيّدون: يرون أرشيف الرافيناج فقط + ديونهم */
const _RAFPARTNERS={ ali:'1998' };                    /* شركاء العرض فقط */
const _RAFEDITORS={ ghazali:'1970' };                 /* محرّرو الرافيناج: يسجّلون فواتير */
/* Firebase يشترط كلمة مرور ≥6 أحرف؛ نوسّع كلمة مرور المستخدم بلاحقة ثابتة لـ Firebase فقط.
   الأمان يبقى في كلمة المرور الأصلية (المهاجم يحتاجها أصلاً). كلمتك القصيرة تبقى كما هي في الدخول. */
const _FB_PW_SUFFIX='__GoldPro$ok';
const _fbPw=(pw)=>String(pw||'')+_FB_PW_SUFFIX;

/* ═ إعادة دخول صامتة لجلسة Firebase (عند سقوط التوكن أثناء العمل) ═ */
let _reauthBusy=false;
window._silentReauth=async function(){
    if(_reauthBusy)return false;
    if(localStorage.getItem('gp12_auth')!=='1')return false;
    const uname=localStorage.getItem('gp12_user'),pw=localStorage.getItem('gp12_ek');
    if(!uname||!pw)return false;
    _reauthBusy=true;
    try{
        const email=uname+_FB_DOMAIN;
        try{ await firebase.auth().signInWithEmailAndPassword(email,_fbPw(pw)); }
        catch(_){ await firebase.auth().signInWithEmailAndPassword(email,pw); }
        console.warn('[GoldPro] أعيد فتح جلسة Firebase صامتاً');
        return true;
    }catch(e){ console.warn('[GoldPro] فشل إعادة الدخول الصامت:',e&&e.code); return false; }
    finally{ _reauthBusy=false; }
};

window._lastAuthErr='';
async function _fbSignInEmail(uname,pw,allowCreate){
    const email=uname+_FB_DOMAIN;
    window._lastAuthErr='';
    try{
        await firebase.auth().signInWithEmailAndPassword(email,_fbPw(pw));
        return true;
    }catch(e){
        window._lastAuthErr=(e&&e.code)||String(e);
        /* حسابات قديمة أُنشئت بكلمة المرور الخام قبل التوسيع */
        try{ await firebase.auth().signInWithEmailAndPassword(email,pw); window._lastAuthErr=''; return true; }
        catch(e2){ window._lastAuthErr=(e2&&e2.code)||window._lastAuthErr; }
        /* مستخدم معروف فقد حسابه (حُذف) → أعِد إنشاءه بكلمة مروره */
        if(allowCreate){
            try{ await firebase.auth().createUserWithEmailAndPassword(email,_fbPw(pw)); window._lastAuthErr=''; return true; }
            catch(e3){ window._lastAuthErr=(e3&&e3.code)||window._lastAuthErr; }
        }
        return false;
    }
}

async function _fbCreateAuthUser(uname,pw){
    try{await firebase.auth().createUserWithEmailAndPassword(uname+_FB_DOMAIN,_fbPw(pw));}catch(e){}
}

async function _hashPw(pw){
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pw));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

/* _loadUsers مع Timeout 5 ثوانٍ + fallback إلى الكاش لحل مشكلة التجميد أوفلاين */
function _loadUsers(){
    if(Object.keys(_usersCache).length)return Promise.resolve(_usersCache);
    return new Promise(res=>{
        const t=setTimeout(()=>res(_usersCache),5000);
        _db.ref(_USERS_PATH).once('value',snap=>{
            clearTimeout(t);
            _usersCache=snap.val()||{};
            res(_usersCache);
        });
    });
}

async function _saveUser(uname,isAdmin=false){
    const merged={...(_usersCache[uname]||{}),isAdmin};
    delete merged.pwHash;
    await _db.ref(`${_USERS_PATH}/${uname}`).set(merged);
    _usersCache[uname]=merged;
}
async function _saveUserMeta(uname,meta){
    const merged={...(_usersCache[uname]||{}),...meta};
    await _db.ref(`${_USERS_PATH}/${uname}`).set(merged);
    _usersCache[uname]=merged;
}

/* تهيئة التطبيق بعد الدخول */
function _afterLogin(){
    initRafTable();
    /* حمّل بيانات هذا المستخدم المحليّة (ترباح/حاسبة دبي) بمفتاحه الخاص */
    try{ if(typeof _loadTarbah==='function')_loadTarbah(); }catch(e){}
    setTimeout(()=>{try{if(typeof _migrateTarbahOnce==='function')_migrateTarbahOnce();}catch(e){}},2500);
    try{ if(typeof _loadDubaiCalc==='function')_loadDubaiCalc(); }catch(e){}
    load();syncBal();updAll();
    invRows=10;initInvTable();
    try{
        const _dr=_lsGet(_LSDRAFT);
        if(_dr?.rows?.length>invRows){_dr.rows=_dr.rows.slice(0,invRows);_lsSet(_LSDRAFT,_dr);}
    }catch(e){}
    restoreDraft();calcRaf();
    setInterval(save,30000);
    _startAutoBackup();
    fetchSpotPrice();setInterval(fetchSpotPrice,30*1000);
    /* إن فُتح ملف .gpdf قبل توفّر مفتاح المستخدم، عالجه الآن */
    try{ if(typeof _processPendingGpdf==='function') setTimeout(_processPendingGpdf,400); }catch(e){}
}

const _AUTH_ERR_AR={
    'auth/operation-not-allowed':'مزوّد البريد/كلمة السر معطَّل في Firebase Console — فعِّله من Authentication ← Sign-in method',
    'auth/too-many-requests':'حُظرت المحاولات مؤقتاً لكثرتها — انتظر دقائق ثم أعد',
    'auth/network-request-failed':'مشكلة اتصال بالإنترنت',
    'auth/invalid-credential':'كلمة المرور خاطئة فعلاً',
    'auth/wrong-password':'كلمة المرور خاطئة فعلاً',
    'auth/user-disabled':'الحساب معطَّل من Firebase Console',
};
function _showLoginErr(msg){
    const c=window._lastAuthErr;
    if(c){
        msg+='\n['+c+']'+(_AUTH_ERR_AR[c]?(' — '+_AUTH_ERR_AR[c]):'');
        window._lastAuthErr='';
    }
    const el=document.getElementById('loginErr');
    el.textContent='❌ '+msg;el.style.display='block';
    el.style.animation='none';requestAnimationFrame(()=>{el.style.animation='';});
}

async function doLogin(){
    /* وضع المسؤول الوحيد: المستخدم مثبَّت على admin (مستخدمو الورشات والزبائن مرحلة لاحقة) */
    const uname='admin';
    const pw=document.getElementById('loginPw').value;
    document.getElementById('loginErr').style.display='none';
    if(!pw)return _showLoginErr('أدخل كلمة المرور');

    /* مؤشر التحميل أثناء التحقق */
    const btn=document.querySelector('#loginMainPanel .login-btn');
    const origTxt=btn?btn.textContent:'';
    if(btn){btn.disabled=true;btn.textContent='⏳ جاري التحقق...';}

    let users;
    try{users=await _loadUsers();}catch(e){users=_usersCache;}

    /* قاعدة جديدة فارغة: أول دخول يُنشئ حساب admin بكلمة السر المُدخَلة
       الترتيب مهم: مصادقة Firebase أولاً (القواعد تشترط auth للكتابة في _users) */
    if(!users[uname]){
        if(Object.keys(users).length===0){
            const _authOk=await _fbSignInEmail(uname,pw,true);
            if(!_authOk){
                if(btn){btn.disabled=false;btn.textContent=origTxt;}
                return _showLoginErr('تعذّر إنشاء الحساب — فعّل Email/Password في Authentication');
            }
            try{ await _saveUser(uname,true); users=_usersCache; }
            catch(e){ if(btn){btn.disabled=false;btn.textContent=origTxt;} return _showLoginErr('تعذّر الحفظ — انشر قواعد Realtime Database'); }
        }else{
            if(btn){btn.disabled=false;btn.textContent=origTxt;}
            return _showLoginErr('حساب المسؤول غير موجود');
        }
    }
    const user=users[uname];

    /* التحقّق من كلمة المرور عبر مصادقة Firebase حصراً (لا بصمة مخزّنة تُكسَر) */
    const _ok=await _fbSignInEmail(uname,pw,true);
    if(btn){btn.disabled=false;btn.textContent=origTxt;}
    if(!_ok)return _showLoginErr('كلمة المرور خاطئة');
    /* نظّف أي بصمة قديمة متبقّية في _users */
    try{ if(user.pwHash!==undefined) _saveUser(uname,!!user.isAdmin); }catch(e){}
    _finishLogin(uname,pw,'admin',null,'');
}

/* ═══ إنهاء الدخول الموحّد لكل الأدوار ═══
   كل الأدوار تقرأ/تكتب على بيانات المسؤول (goldpro/admin/data) — الواجهة تُقيَّد حسب الدور */
function _finishLogin(uname,pw,role,ws,custName){
    _sessionRole=role;_sessionWs=ws||null;_sessionCustName=custName||'';
    window._roleLock=role==='admin'?null:role;
    window._sessionRole=role;                       /* لحارس النسخة الاحتياطية */
    window._wsLock=role==='worker'?ws:null;
    _encKey=pw;
    localStorage.setItem('gp12_ek',pw);
    localStorage.setItem('gp12_role',role);
    if(ws)localStorage.setItem('gp12_ws',ws);else localStorage.removeItem('gp12_ws');
    if(custName)localStorage.setItem('gp12_cname',custName);else localStorage.removeItem('gp12_cname');
    const _isMobile=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if(!_isMobile&&document.documentElement.requestFullscreen&&!document.fullscreenElement)
        document.documentElement.requestFullscreen().catch(()=>{});
    _currentUser=uname;
    _LSKEY='gp12_'+(_SITE?_SITE+'_':'')+uname;
    _LSDRAFT='gp12_draft_'+(_SITE?_SITE+'_':'')+uname;
    _baseRef=_db.ref((_SITE?`goldpro/${_SITE}/`:'goldpro/')+'admin/data');
    localStorage.setItem('gp12_auth','1');localStorage.setItem('gp12_user',uname);
    const ud=document.getElementById('currentUserDisplay');if(ud)ud.textContent=uname;
    /* الأدوار المقيدة: أسدل ستارة الإقلاع قبل تلاشي شاشة الدخول —
       وإلا تنكشف واجهة المسؤول خلفها للحظات (تُرفع بعد اكتمال واجهة الدور، وصمام 6ث) */
    if(role!=='admin'){
        const v=document.getElementById('bootVeil');
        if(v){v.style.display='flex';
            setTimeout(()=>{const vv=document.getElementById('bootVeil');if(vv)vv.style.display='none';},6000);}
    }else{
        const v=document.getElementById('bootVeil'); if(v)v.style.display='none';
    }
    const ov=document.getElementById('loginOverlay');
    if(ov){ov.classList.add('fade-out');setTimeout(()=>ov.remove(),520);}
    _fbInitialLoad();_afterLogin();
    _applyRoleUI();
    setTimeout(()=>{try{if(typeof _navNudge==='function')_navNudge();}catch(e){}},900);
}

/* ═══ دخول عامل الورشة (dahmoun / salah) ═══ */
async function doLoginWorker(uname,pw){
    uname=(uname||'').trim().toLowerCase();
    document.getElementById('loginErr').style.display='none';
    const seed=_WORKERS[uname];
    if(!seed)return _showLoginErr('حساب ورشة غير معروف (dahmoun أو salah)');
    if(!pw)return _showLoginErr('أدخل كلمة المرور');
    let users;
    try{users=await _loadUsers();}catch(e){users=_usersCache;}
    if(!users[uname]){
        /* أول دخول لهذا العامل: كلمة السر يجب أن تطابق كلمة rafinag الأصلية
           الترتيب: مصادقة أولاً ثم كتابة _users (القواعد تشترط auth) */
        if(pw!==seed.pw)return _showLoginErr('كلمة المرور خاطئة');
        const _authOk=await _fbSignInEmail(uname,pw,true);
        if(!_authOk)return _showLoginErr('تعذّر إنشاء الحساب — تحقّق من الاتصال');
        try{await _saveUserMeta(uname,{isAdmin:false,role:'worker',workshop:seed.workshop});}
        catch(e){return _showLoginErr('تعذّر الحفظ — انشر قواعد Realtime Database');}
        try{localStorage.setItem('gp12_wpw_'+uname,pw);}catch(e){}
        return _finishLogin(uname,pw,'worker',seed.workshop,'');
    }
    const _ok=await _fbSignInEmail(uname,pw,true);
    if(!_ok)return _showLoginErr('كلمة المرور خاطئة');
    try{localStorage.setItem('gp12_wpw_'+uname,pw);}catch(e){}
    _finishLogin(uname,pw,'worker',seed.workshop,'');
}

/* ═══ دخول شريك الرافيناج (Ali) ═══ */
async function doLoginPartner(uname,pw){
    document.getElementById('loginErr').style.display='none';
    if(!pw)return _showLoginErr('أدخل كلمة المرور');
    const seedPw=_RAFPARTNERS[uname];
    const dispName=uname.charAt(0).toUpperCase()+uname.slice(1);   /* Ali / Ghazali */
    let users;
    try{users=await _loadUsers();}catch(e){users=_usersCache;}
    if(!users[uname]){
        if(pw!==seedPw)return _showLoginErr('كلمة المرور خاطئة');
        const _authOk=await _fbSignInEmail(uname,pw,true);
        if(!_authOk)return _showLoginErr('تعذّر إنشاء الحساب — تحقّق من الاتصال');
        try{await _saveUserMeta(uname,{isAdmin:false,role:'rafpartner'});}
        catch(e){return _showLoginErr('تعذّر الحفظ — انشر قواعد Realtime Database');}
        return _finishLogin(uname,pw,'rafpartner',null,dispName);
    }
    const _ok=await _fbSignInEmail(uname,pw,true);
    if(!_ok)return _showLoginErr('كلمة المرور خاطئة');
    _finishLogin(uname,pw,'rafpartner',null,dispName);
}

/* ═══ دخول محرّر الرافيناج (يسجّل فواتير رافيناج فقط) ═══ */
async function doLoginRafEditor(uname,pw){
    document.getElementById('loginErr').style.display='none';
    if(!pw)return _showLoginErr('أدخل كلمة المرور');
    const seedPw=_RAFEDITORS[uname];
    const dispName=uname.charAt(0).toUpperCase()+uname.slice(1);
    let users;
    try{users=await _loadUsers();}catch(e){users=_usersCache;}
    if(!users[uname]){
        if(pw!==seedPw)return _showLoginErr('كلمة المرور خاطئة');
        const _authOk=await _fbSignInEmail(uname,pw,true);
        if(!_authOk)return _showLoginErr('تعذّر إنشاء الحساب — تحقّق من الاتصال');
        try{await _saveUserMeta(uname,{isAdmin:false,role:'rafeditor'});}
        catch(e){return _showLoginErr('تعذّر الحفظ — انشر قواعد Realtime Database');}
        return _finishLogin(uname,pw,'rafeditor',null,dispName);
    }
    const _ok=await _fbSignInEmail(uname,pw,true);
    if(!_ok)return _showLoginErr('كلمة المرور خاطئة');
    _finishLogin(uname,pw,'rafeditor',null,dispName);
}

/* ═══ دخول الزبون برقم الهاتف ═══ */
async function doLoginCustomer(phone,pw){
    phone=(phone||'').replace(/[^0-9]/g,'');
    document.getElementById('loginErr').style.display='none';
    if(phone.length<6)return _showLoginErr('أدخل رقم هاتف صحيحاً');
    if(!pw)return _showLoginErr('أدخل كلمة المرور');
    /* الرقم لا بد أن يكون مربوطاً باسم زبون من المسؤول */
    const rec=await new Promise(res=>{
        const t=setTimeout(()=>res(null),6000);
        _db.ref(_CUSTS_PATH+'/'+phone).once('value',s=>{clearTimeout(t);res(s.val());},()=>{clearTimeout(t);res(null);});
    });
    if(!rec||!rec.name)return _showLoginErr('الرقم غير مسجّل — تواصل مع المسؤول');
    /* التحقق من كلمة السر التي اختارها المسؤول (بصمة SHA-256) */
    if(rec.pwHash){
        const h=await _sha256(pw);
        if(h!==rec.pwHash)return _showLoginErr('كلمة المرور خاطئة');
    }
    const uname='c'+phone;
    const _ok=await _fbSignInEmail(uname,pw,true);
    if(!_ok)return _showLoginErr('كلمة المرور خاطئة');
    _finishLogin(uname,pw,'customer',null,rec.name);
}

async function setupFirstUser(){
    const uname=(document.getElementById('setupUser').value||'').trim().toLowerCase();
    const pw=document.getElementById('setupPw').value;
    const pw2=document.getElementById('setupPw2').value;
    if(!uname||uname.length<3)return toast('اسم المستخدم ضعيف (3 أحرف على الأقل)','error');
    if(!/^[a-z0-9_]+$/.test(uname))return toast('أحرف لاتينية وأرقام فقط بدون مسافة','error');
    if(pw.length<4)return toast('كلمة المرور قصيرة (4 أحرف على الأقل)','error');
    if(pw!==pw2)return toast('كلمتا المرور لا تتطابقان','error');
    await _saveUser(uname,true);
    _fbCreateAuthUser(uname,pw);
    document.getElementById('loginSetupPanel').style.display='none';
    document.getElementById('loginMainPanel').style.display='block';
    document.getElementById('loginUser').value=uname;
    document.getElementById('loginPw').value=pw;
    toast('✅ تم إنشاء الحساب — سيتم الدخول تلقائياً','success');
    setTimeout(doLogin,600);
}

function doLogout(){
    if(!confirm('هل تريد تسجيل الخروج؟'))return;
    _encKey='';
    localStorage.removeItem('gp12_auth');
    localStorage.removeItem('gp12_user');
    localStorage.removeItem('gp12_ek');
    location.reload();
}

async function changePw(){
    const old=document.getElementById('pwOld').value;
    const n1=document.getElementById('pwNew1').value;
    const n2=document.getElementById('pwNew2').value;
    const user=_usersCache[_currentUser];
    if(!user)return toast('خطأ: المستخدم غير موجود','error');
    if(!n1||n1!==n2)return toast('كلمتا المرور الجديدتان لا تتطابقان','error');
    if(n1.length<4)return toast('كلمة المرور قصيرة — 4 أحرف على الأقل','error');
    const _cu=firebase.auth().currentUser;
    if(!_cu)return toast('سجّل الدخول أولاً','error');
    /* تحقّق من كلمة المرور الحالية عبر Firebase (لا بصمة مخزّنة) */
    try{
        const cred=firebase.auth.EmailAuthProvider.credential(_currentUser+_FB_DOMAIN,_fbPw(old));
        await _cu.reauthenticateWithCredential(cred);
    }catch(e){
        try{ const c2=firebase.auth.EmailAuthProvider.credential(_currentUser+_FB_DOMAIN,old); await _cu.reauthenticateWithCredential(c2); }
        catch(_){ return toast('كلمة المرور الحالية خاطئة','error'); }
    }
    try{ await _cu.updatePassword(_fbPw(n1)); }
    catch(e){ return toast('تعذّر تغيير كلمة المرور: '+(e.code||''),'error'); }
    await _saveUser(_currentUser,!!user.isAdmin);
    _encKey=n1;
    localStorage.setItem('gp12_ek',n1);
    save();
    document.getElementById('pwOld').value='';document.getElementById('pwNew1').value='';document.getElementById('pwNew2').value='';
    toast('✅ تم تغيير كلمة المرور','success');
}

async function addUser(){
    const uname=(document.getElementById('newUserName').value||'').trim().toLowerCase();
    const pw=document.getElementById('newUserPw').value;
    if(!uname||uname.length<3)return toast('اسم المستخدم ضعيف','error');
    if(!/^[a-z0-9_]+$/.test(uname))return toast('أحرف لاتينية وأرقام فقط','error');
    if(pw.length<4)return toast('كلمة المرور قصيرة','error');
    if(_usersCache[uname])return toast('⚠️ المستخدم موجود مسبقاً','error');
    await _saveUser(uname,false);
    _fbCreateAuthUser(uname,pw);
    document.getElementById('newUserName').value='';document.getElementById('newUserPw').value='';
    toast('✅ تم إنشاء المستخدم: '+uname,'success');
    renderUsersList();
}

async function deleteUser(uname){
    if(!confirm(`حذف المستخدم "${uname}"؟`))return;
    await _db.ref(`${_USERS_PATH}/${uname}`).remove();
    delete _usersCache[uname];
    toast('✅ تم الحذف','success');renderUsersList();
}

function renderUsersList(){
    const ul=document.getElementById('usersList');if(!ul)return;
    const isAdmin=_usersCache[_currentUser]?.isAdmin;
    ul.innerHTML=Object.keys(_usersCache).map(u=>`
        <div style="display:flex;align-items:center;justify-content:space-between;padding:.4rem .6rem;background:var(--card2);border-radius:8px;margin-bottom:.25rem;border:1px solid var(--border)">
            <span style="font-size:.78rem;font-weight:800">${u}${_usersCache[u].isAdmin?' 👑':''}</span>
            ${isAdmin&&u!==_currentUser?`<button onclick="deleteUser('${u}')" style="border:none;background:transparent;color:var(--rd);cursor:pointer;font-size:.82rem;padding:0">🗑️</button>`:''}
        </div>`).join('');
}

async function _checkAuth(){
    /* ترحيل جلسة قديمة (كانت في sessionStorage) إلى الدائمة */
    try{
        if(!localStorage.getItem('gp12_auth')&&sessionStorage.getItem('gp12_auth')==='1'){
            ['gp12_auth','gp12_user','gp12_ek','gp12_role','gp12_ws','gp12_cname'].forEach(k=>{
                const v=sessionStorage.getItem(k);
                if(v!=null)localStorage.setItem(k,v);
            });
        }
    }catch(e){}
    const savedUser=localStorage.getItem('gp12_user');
    if(localStorage.getItem('gp12_auth')==='1'&&savedUser){
        _encKey=localStorage.getItem('gp12_ek')||'';
        _sessionRole=localStorage.getItem('gp12_role')||'admin';
        _sessionWs=localStorage.getItem('gp12_ws')||null;
        _sessionCustName=localStorage.getItem('gp12_cname')||'';
        window._roleLock=_sessionRole==='admin'?null:_sessionRole;
        window._sessionRole=_sessionRole;
        window._wsLock=_sessionRole==='worker'?_sessionWs:null;
        _currentUser=savedUser;
        _LSKEY='gp12_'+(_SITE?_SITE+'_':'')+savedUser;
        _LSDRAFT='gp12_draft_'+(_SITE?_SITE+'_':'')+savedUser;
        _baseRef=_db.ref((_SITE?`goldpro/${_SITE}/`:'goldpro/')+'admin/data');
        const ud=document.getElementById('currentUserDisplay');if(ud)ud.textContent=savedUser;
        document.getElementById('loginOverlay').remove();
        /* ═ حرج: طبّق تقييد الدور فوراً (قبل تحميل البيانات) ═
           الدور محفوظ محلياً — لا يحتاج إنترنت. هكذا لا تظهر واجهة الأدمين للزبون
           حتى لو تعطّل تحميل Firebase (انقطاع النت). */
        _applyRoleUI();
        _loadUsers().catch(()=>{});
        if(_encKey) await _fbSignInEmail(savedUser,_encKey).catch(()=>{});
        _fbInitialLoad();_afterLogin();
        _applyRoleUI();   /* مرة ثانية بعد التحميل — احتياط (بوابة الزبون قد تحتاج بيانات) */
        return;
    }
    let users;
    /* لا جلسة محفوظة → شاشة الدخول يجب أن تظهر (إزالة حارس منع الوميض) */
    try{document.documentElement.classList.remove('gp-has-session');}catch(e){}
    try{users=await _loadUsers();}catch(e){users={};}
    /* شاشة الدخول جاهزة — ارفع ستارة الإقلاع */
    const _bv=document.getElementById('bootVeil'); if(_bv)_bv.style.display='none';
    /* تبديل سريع للورشات (جهاز مشترك): أزرار لمسة واحدة لمن كلمته محفوظة هنا */
    try{
        const box=document.querySelector('#loginOverlay .login-box')||document.getElementById('loginOverlay');
        if(box&&!document.getElementById('wsQuickRow')){
            const stored=Object.keys(_WORKERS).filter(u=>localStorage.getItem('gp12_wpw_'+u));
            if(stored.length){
                const row=document.createElement('div');
                row.id='wsQuickRow';
                row.style.cssText='display:flex;gap:.5rem;margin-top:.7rem';
                row.innerHTML='<div style="flex-basis:100%;text-align:center;font-size:.64rem;color:#9ca3af;font-weight:700;margin-bottom:.15rem">دخول سريع للورشة (كلمة السر محفوظة في هذا الجهاز)</div>'
                    +stored.map(u=>{const s=_WORKERS[u];return`
                    <button onclick="_wsQuickLogin('${u}')"
                        style="flex:1;padding:.6rem;border-radius:10px;border:1.5px solid ${s.accent};background:${s.accent}22;color:${s.accent};font-weight:900;font-family:Tajawal,sans-serif;font-size:.82rem;cursor:pointer">🔨 ${s.wsName}</button>`;}).join('');
                row.querySelectorAll?void 0:0;
                /* الصف الأول (العنوان) يلتف */
                row.style.flexWrap='wrap';
                box.appendChild(row);
            }
        }
    }catch(e){}
    if(Object.keys(users).length===0){
        setTimeout(()=>{const e=document.getElementById('loginPw');if(e)e.focus();},200);
    }else{
        setTimeout(()=>{const e=document.getElementById('loginPw');if(e)e.focus();},200);
    }
}

window.doLogin=doLogin;window.changePw=changePw;window.doLogout=doLogout;
window.setupFirstUser=setupFirstUser;window.addUser=addUser;
window.deleteUser=deleteUser;window.renderUsersList=renderUsersList;
window.onload=()=>{ _authReadyPromise.then(()=>_checkAuth()); };

/* ═══════════════ ROLE UI — تقييد الواجهة حسب الدور ═══════════════ */
function _applyRoleUI(){
    const role=_sessionRole;
    if(role==='admin'){ try{document.documentElement.classList.add('gp-role-ready');}catch(e){} return; }
    document.body.classList.add('role-'+role);
    try{document.documentElement.classList.add('gp-role-ready');}catch(e){}
    /* حقن CSS الإخفاء مرة واحدة */
    if(!document.getElementById('roleCss')){
        const st=document.createElement('style');st.id='roleCss';
        st.textContent=`
            body.role-worker .bnav,body.role-customer .bnav,
            body.role-worker #vaMicWrap,body.role-customer #vaMicWrap,
            body.role-worker .va-panel,body.role-customer .va-panel{display:none!important}
            body.role-worker #wsEffect{display:none!important}
            body.role-customer #roleLogout{display:none!important}
            body.role-customer .hdr{display:none!important}
            body.role-rafpartner #vaMicWrap,body.role-rafpartner .va-panel{display:none!important}
            body.role-rafpartner .hdr{display:none!important}
            body.role-rafpartner .page{padding-top:2.6rem}
            body.role-rafpartner .bnav button:not([onclick*="'archive'"]):not([onclick*="'debts'"]){display:none!important}
            body.role-rafpartner #archFilterBar,body.role-rafpartner #archSearch{display:none!important}
            body.role-rafpartner #archSec-gold,body.role-rafpartner #archSec-doll,body.role-rafpartner #archSec-dubai{display:none!important}
            body.role-rafpartner #rafArchiveList .btndel,
            body.role-rafpartner #rafArchiveList [onclick^="editRafInv"],
            body.role-rafpartner #rafArchiveList [onclick^="waRaf"]{display:none!important}
            body.role-rafpartner #page-debts [onclick="openDebtFix()"],
            body.role-rafpartner #page-debts [onclick="openRenameCust()"],
            body.role-rafpartner #page-debts [onclick="exportDebtsPdf()"]{display:none!important}
            /* محرّر الرافيناج: الرافيناج فقط، بلا رأس/مخزون/ديون/دولار/إعدادات */
            body.role-rafeditor #vaMicWrap,body.role-rafeditor .va-panel{display:none!important}
            body.role-rafeditor .hdr{display:none!important}
            body.role-rafeditor .page{padding-top:2.6rem}
            body.role-rafeditor .bnav button:not([onclick*="'raffinage'"]){display:none!important}
            body.role-rafeditor #hdrCenterWrap{display:none!important}
            body.role-customer .page{padding-top:.6rem}
            body.role-worker #hdrCenterWrap,body.role-customer #hdrCenterWrap{display:none!important}
            #roleLogout{position:fixed;top:.55rem;left:.55rem;z-index:9998;border:1.5px solid var(--rd);
                background:var(--bg);color:var(--rd);border-radius:10px;padding:.4rem .7rem;
                font-family:Tajawal,sans-serif;font-weight:800;font-size:.75rem;cursor:pointer}
        `;
        document.head.appendChild(st);
    }
    /* زر خروج عائم */
    if(!document.getElementById('roleLogout')){
        const b=document.createElement('button');
        b.id='roleLogout';b.textContent='🚪 خروج';b.onclick=doLogout;
        document.body.appendChild(b);
    }
    if(role==='rafpartner'){
        setTimeout(()=>{
            window._archiveFilter='raf';
            if(typeof switchPage==='function')switchPage('archive');
            try{renderArchive();}catch(e){}
            const _v3=document.getElementById('bootVeil'); if(_v3)_v3.style.display='none';
            /* جرس تفعيل الإشعارات */
            if(!document.getElementById('partnerBell')){
                const b=document.createElement('button');
                b.id='partnerBell';b.textContent='🔔 تفعيل الإشعارات';
                b.style.cssText='position:fixed;top:.55rem;right:.55rem;z-index:9998;border:1.5px solid var(--g600);background:var(--bg);color:var(--g600);border-radius:10px;padding:.4rem .7rem;font-family:Tajawal,sans-serif;font-weight:800;font-size:.72rem;cursor:pointer';
                b.onclick=_partnerEnableNotifs;
                document.body.appendChild(b);
            }
        },400);
    }
    if(role==='rafeditor'){
        /* محرّر الرافيناج: يفتح صفحة الرافيناج ويسجّل */
        setTimeout(()=>{
            if(typeof switchPage==='function')switchPage('raffinage');
            try{if(typeof initRaffinage==='function')initRaffinage();}catch(e){}
            const _v4=document.getElementById('bootVeil'); if(_v4)_v4.style.display='none';
        },400);
    }
    if(role==='worker'){
        /* العامل: ورشته فقط */
        setTimeout(()=>{
            if(typeof setWsCur==='function')setWsCur(_sessionWs);
            if(typeof switchPage==='function')switchPage('workshops');
            const _v2=document.getElementById('bootVeil'); if(_v2)_v2.style.display='none';
            /* إخفاء تبويب الورشة الأخرى */
            Object.keys(_WORKERS).forEach(u=>{
                const ws=_WORKERS[u].workshop;
                const b=document.getElementById('wsTab_'+ws);
                if(b)b.style.display=ws===_sessionWs?'':'none';
            });
        },400);
    }else if(role==='customer'){
        /* الزبون: بوابته فقط (قراءة) */
        setTimeout(()=>{
            document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
            const p=document.getElementById('page-customer');
            if(p)p.classList.add('active');
            renderCustomerPortal();
            const _v1=document.getElementById('bootVeil'); if(_v1)_v1.style.display='none';
        },400);
    }
}
window._applyRoleUI=_applyRoleUI;

/* ═══════════════ بوابة الزبون — بأسلوب rafinag ═══════════════ */
let _cpTab='tx';  /* دائماً السجل — تبويب الفواتير أُزيل، الفاتورة تُفتح بالنقر */
window.cpSetTab=function(t){_cpTab='tx';renderCustomerPortal();};
function _cpSeenKey(){return 'gp_cust_seen_'+_sessionCustName;}
/* تعليم الإشعارات كمقروءة — يخفي الشريط والجرس */
window.cpMarkSeen=function(){
    try{localStorage.setItem(_cpSeenKey(),String(window._cpInvCount||0));}catch(e){}
    try{renderCustomerPortal();}catch(e){}
};
/* يعكس نوع العملية من منظور الزبون: ما أعطيتُه هو ما استلمه، والعكس */
function _custPerspective(t){
    const map={
        'أعطيت':'استلمت',
        'استلمت':'أعطيت',
        'بيع بسعر':'شراء بسعر',
        'شراء بسعر':'بيع بسعر',
        'بيع':'شراء',
        'شراء':'بيع',
        'شراء دولار':'بيع دولار',
        'بيع دولار':'شراء دولار'
    };
    return map[t]||t;   /* التصفية/الرافيناج تبقى كما هي */
}
function renderCustomerPortal(){
    const name=_sessionCustName;
    if(!name)return;
    const nEl=document.getElementById('cpName'); if(nEl)nEl.textContent=name;
    const _n=s=>(s||'').trim().replace(/\s+/g,' ');
    const key=_n(name);

    /* ── بطاقتا الرصيد الكبيرتان (دينار/ذهب) بمنظور الزبون ── */
    const bal=tp=>(typeof debts!=='undefined'?debts:[]).filter(d=>_n(d.c)===key&&d.type===tp).reduce((s,d)=>s+(d.a||0),0);
    const dD=bal('دينار'), dG=bal('ذهب 24'), dG7=bal('ذهب 730'), dU=bal('دولار');
    /* موجب في GoldPro = لنا = مطلوب من الزبون */
    const lbl=v=>v>0.001?'مطلوب منك':(v<-0.001?'لك':'مُسوّى');
    const clr=v=>v>0.001?'var(--rd)':(v<-0.001?'var(--gr)':'var(--t3)');
    const card=(title,val,unit,dec)=>`
        <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:14px 16px;text-align:center">
            <div style="font-size:.72rem;color:var(--t3);font-weight:800;margin-bottom:5px">${title}</div>
            <div style="font-size:1.4rem;font-weight:900;font-family:monospace;color:${clr(val)}">${fmt(Math.abs(val),dec)} <span style="font-size:.75rem">${unit}</span></div>
            <div style="font-size:.72rem;font-weight:800;color:${clr(val)};margin-top:3px">${lbl(val)}</div>
        </div>`;
    const cards=document.getElementById('cpCards');
    if(cards){
        let htmlc=card('الرصيد (دينار)',dD,'دج',0)+card('الرصيد (ذهب)',dG,'غ',2);
        if(Math.abs(dG7)>0.001)htmlc+=card('ذهب 730',dG7,'غ',2);
        if(Math.abs(dU)>0.001)htmlc+=card('دولار',dU,'$',2);
        cards.innerHTML=htmlc;
    }

    /* ── الفواتير + الجديد منها ── */
    const rafs=(typeof rafInvoices!=='undefined'?rafInvoices:[]).filter(r=>_n(r.c)===key)
        .map(r=>({kind:'raf',id:r.id,dt:r.dt,status:r.mode==='customer'?(r.settled?'خالصة':'على الحساب'):'رافيناج'}));
    const invs=(typeof invoices!=='undefined'?invoices:[]).filter(i=>_n(i.c)===key)
        .map(i=>({kind:'inv',id:i.id,dt:i.dt,status:i.recv?'قبض 730':(i.t==='sell'?'بيع':'شراء')}));
    const allInv=[...rafs,...invs];
    let seen=0;try{seen=parseInt(localStorage.getItem(_cpSeenKey())||'0',10)||0;}catch(e){}
    const newCount=Math.max(0,allInv.length-seen);
    /* تبويب الفواتير أُزيل (v232) — التعليم كمقروء صار بنقر الشريط أو الجرس */
    window._cpInvCount=allInv.length;
    const showNew=newCount>0;
    const bell=document.getElementById('cpBell');
    if(bell){bell.style.display=showNew?'flex':'none';bell.textContent=newCount;}
    const dot=document.getElementById('cpTabDot'); if(dot)dot.style.display=showNew?'block':'none';
    const nb=document.getElementById('cpNotifBanner');
    if(nb)nb.style.display=(typeof Notification!=='undefined'&&Notification.permission!=='granted')?'flex':'none';
    const pb=document.getElementById('cpNotifBanner');
    if(pb){
        const can=('Notification' in window)&&Notification.permission!=='granted';
        pb.style.display=can?'flex':'none';
    }
    const bn=document.getElementById('cpNewBanner');
    if(bn){bn.style.display=showNew?'flex':'none';
        const tx=document.getElementById('cpNewTxt');if(tx)tx.textContent='لديك '+newCount+' فاتورة جديدة';}

    /* ── التبويبان ── */
    const acc='var(--g600)';
    [['cpTab_tx','tx'],['cpTab_inv','inv']].forEach(([id,k])=>{
        const b=document.getElementById(id);if(!b)return;
        const on=_cpTab===k;
        b.style.background=on?'rgba(217,119,6,.14)':'var(--card)';
        b.style.borderColor=on?'#d97706':'var(--border)';
        b.style.color=on?acc:'var(--t2)';
    });

    const body=document.getElementById('cpBody');
    if(!body)return;
    const thead=cols=>`<thead><tr>${cols.map(c=>`<th style="padding:.55rem .4rem;font-size:.68rem">${c}</th>`).join('')}</tr></thead>`;
    if(_cpTab==='tx'){
        const mine=(typeof ops!=='undefined'?ops:[]).filter(o=>_n(o.c)===key).slice(0,100);
        window._cpOpsMap={}; mine.forEach((o,_i)=>{window._cpOpsMap[o.id!=null?o.id:('idx'+_i)]=o;});
        /* بصمة المحتوى: إن لم يتغيّر السجل، لا تُعِد بناءه — يمنع قفز التمرير للأعلى
           عند كل مزامنة من السحابة أثناء تصفّح الزبون لسجله. */
        const _sig=mine.map(o=>(o.id||'')+':'+(o.dt||'')+':'+(o.a||0)+':'+(o.t||'')).join('|');
        if(body.getAttribute('data-sig')===_sig && body.children.length){ /* لا تغيير — اترك السجل والتمرير كما هما */ }
        else{
        body.setAttribute('data-sig',_sig);
        body.innerHTML=mine.length?`
        <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden"><div class="tbl-scroll">
        <table style="width:100%;border-collapse:collapse">${thead(['التاريخ','النوع','الذهب','المبلغ'])}<tbody>
        ${mine.map(o=>{
            /* تصحيح الفاتورة: عمود الذهب = فرق الخالص الحقيقي (diffG) فقط لا o.a الملغومة،
               وفرق الأجرة (diffD) يظهر في عمود المبلغ حيث ينتمي. */
            const _isFix=(o.t==='تصحيح فاتورة');
            const isG=!_isFix&&(o.m||'').includes('ذهب');
            const gv=_isFix
                ? (o.diffG?((o.diffG>0?'+':'−')+fmt(Math.abs(o.diffG),2)+' غ'):'—')
                : (isG?fmt(Math.abs(o.a||0),2)+' غ':'—');
            /* عمود المبلغ: تصحيح → فرق الأجرة؛ رافيناج → الأجرة؛ وإلا القيمة النقدية */
            const dv=_isFix
                ? (o.diffD?fmt(Math.abs(o.diffD),0)+' دج':'—')
                : ((o.fee&&o.fee>0)?fmt(o.fee,0)+' دج'
                :(!isG?fmt(Math.abs(o.a||0),(o.m==='دولار')?2:0)+((o.m==='دولار')?' $':' دج'):'—'));
            const _hasInv=!!(o.rid||o.iid||o.did);
            return `<tr style="border-bottom:1px solid var(--border);cursor:${_hasInv?'pointer':'default'}" ${_hasInv?`onclick="(function(){const _o=window._cpOpsMap&&window._cpOpsMap['${o.id}'];if(_o)cpOpenOpInvoice(_o);})()"`:''}>
                <td style="padding:.55rem .3rem;text-align:center;font-family:monospace;font-size:.64rem;color:var(--t3)">${o.dt||''}${_hasInv?'<div style=\'font-size:.55rem;color:#0ea5e9;margin-top:2px\'>👁 عرض</div>':''}</td>
                <td style="padding:.55rem .3rem;text-align:center"><span style="display:inline-block;background:rgba(217,119,6,.12);border:1px solid rgba(217,119,6,.35);color:var(--g600);border-radius:8px;padding:.15rem .5rem;font-size:.66rem;font-weight:800">${_custPerspective(o.t)||'—'}</span>${(()=>{const dl=(o.xferTo?['🔁 تحويل إلى: '+o.xferTo]:(o.xferFrom?['🔁 تحويل وارد من: '+o.xferFrom]:((typeof opDetailLines==='function')?opDetailLines(o,true):[])));return dl.length?`<div style="margin-top:.25rem;font-size:.62rem;font-weight:700;color:var(--t2);line-height:1.7;text-align:right">${dl.join('<br>')}</div>`:'';})()}</td>
                <td style="padding:.55rem .3rem;text-align:center;font-family:monospace;font-weight:800;color:var(--g600)">${gv}</td>
                <td style="padding:.55rem .3rem;text-align:center;font-family:monospace;font-weight:900">${dv}</td>
            </tr>`;}).join('')}
        </tbody></table></div></div>`
        :'<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1.6rem;text-align:center;color:var(--t3);font-weight:700">لا توجد معاملات بعد.</div>';
        }   /* نهاية حارس البصمة */
    }else{
        body.innerHTML=allInv.length?`
        <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden"><div class="tbl-scroll">
        <table style="width:100%;border-collapse:collapse">${thead(['رقم','التاريخ','الحالة','عرض'])}<tbody>
        ${allInv.map(v=>{
            const good=v.status==='خالصة'||v.status==='رافيناج';
            return `<tr style="border-bottom:1px solid var(--border)">
                <td style="padding:.55rem .3rem;text-align:center;font-family:monospace;font-weight:800;color:var(--g600)">#${String(v.id).slice(-6)}</td>
                <td style="padding:.55rem .3rem;text-align:center;font-family:monospace;font-size:.64rem;color:var(--t3)">${v.dt||''}</td>
                <td style="padding:.55rem .3rem;text-align:center"><span style="display:inline-block;background:${good?'rgba(22,163,74,.12)':'rgba(239,68,68,.12)'};border:1px solid ${good?'rgba(22,163,74,.4)':'rgba(239,68,68,.4)'};color:${good?'var(--gr)':'var(--rd)'};border-radius:8px;padding:.15rem .5rem;font-size:.66rem;font-weight:800">${v.status}</span></td>
                <td style="padding:.55rem .3rem;text-align:center">
                    <button onclick="cpViewInvoice('${v.kind}','${v.id}')"
                        style="background:rgba(217,119,6,.12);border:1px solid rgba(217,119,6,.35);border-radius:8px;padding:.3rem .8rem;font-size:.7rem;color:var(--g600);font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif">عرض</button>
                </td></tr>`;}).join('')}
        </tbody></table></div></div>`
        :'<div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:1.6rem;text-align:center;color:var(--t3);font-weight:700">لا توجد فواتير.</div>';
    }
}
window.renderCustomerPortal=renderCustomerPortal;

/* ═══════════════ حسابات الزبائن (رقم هاتف → اسم) — للمسؤول ═══════════════ */
let _custAccCache={};
async function addCustomerAccount(){
    const phone=(document.getElementById('newCustPhone').value||'').replace(/[^0-9]/g,'');
    const name=(document.getElementById('newCustName').value||'').trim();
    const pw=(document.getElementById('newCustPw').value||'').trim();
    if(phone.length<6)return toast('رقم الهاتف قصير','error');
    if(!name)return toast('أدخل اسم الزبون كما هو في الديون','error');
    if(pw.length<4)return toast('اختر كلمة سر (4 خانات فأكثر)','error');
    const pwHash=await _sha256(pw);
    await _db.ref(_CUSTS_PATH+'/'+phone).set({name,pwHash});
    _custAccCache[phone]={name,pwHash};
    document.getElementById('newCustPhone').value='';document.getElementById('newCustName').value='';document.getElementById('newCustPw').value='';
    toast('✅ رُبط الزبون: '+name+' ← '+phone,'success');
    renderCustAccounts();
}
async function deleteCustomerAccount(phone){
    if(!confirm('حذف حساب الزبون المرتبط بالرقم '+phone+'؟'))return;
    await _db.ref(_CUSTS_PATH+'/'+phone).remove();
    delete _custAccCache[phone];
    toast('✅ تم الحذف','success');renderCustAccounts();
}
function renderCustAccounts(){
    const box=document.getElementById('custAccList');if(!box)return;
    _db.ref(_CUSTS_PATH).once('value',snap=>{
        _custAccCache=snap.val()||{};
        const ks=Object.keys(_custAccCache);
        box.innerHTML=ks.length?ks.map(ph=>`
            <div style="display:flex;justify-content:space-between;align-items:center;padding:.3rem .5rem;border:1px solid var(--border);border-radius:8px;margin-bottom:.25rem;font-size:.76rem">
                <span style="font-weight:800">👤 ${_custAccCache[ph].name} <span dir="ltr" style="color:var(--t3);font-weight:700">📱 ${ph}</span></span>
                <span style="display:flex;gap:.4rem;align-items:center">
                    <button onclick="resetCustomerPw('${ph}')" title="إعادة تعيين كلمة السر" style="border:none;background:transparent;color:var(--g600);cursor:pointer;font-size:.9rem;padding:0">🔑</button>
                    <button onclick="deleteCustomerAccount('${ph}')" style="border:none;background:transparent;color:var(--rd);cursor:pointer;font-size:.82rem;padding:0">🗑️</button>
                </span>
            </div>`).join('')
            :'<div style="font-size:.72rem;color:var(--t3);text-align:center;padding:.3rem">لا توجد حسابات زبائن بعد</div>';
    });
}
async function resetCustomerPw(phone){
    const rec=_custAccCache[phone]; if(!rec)return;
    const np=prompt('كلمة سر جديدة للزبون «'+rec.name+'» (4 خانات فأكثر):');
    if(np===null)return;                       /* أُلغي */
    const pw=(np||'').trim();
    if(pw.length<4)return toast('كلمة السر قصيرة (4 خانات فأكثر)','error');
    try{
        const pwHash=await _sha256(pw);
        await _db.ref(_CUSTS_PATH+'/'+phone).update({pwHash});
        _custAccCache[phone].pwHash=pwHash;
        toast('✅ عُيّنت كلمة سر جديدة للزبون «'+rec.name+'» — أبلغه بها','success');
    }catch(e){ toast('تعذّر الحفظ — تحقّق من الاتصال','error'); }
}
window.resetCustomerPw=resetCustomerPw;
window.addCustomerAccount=addCustomerAccount;
window.deleteCustomerAccount=deleteCustomerAccount;
window.renderCustAccounts=renderCustAccounts;
window.doLoginWorker=doLoginWorker;
window.doLoginCustomer=doLoginCustomer;

/* ═══════════════ إشعارات الدفع (FCM) ═══════════════ */
const FCM_VAPID='BO0TOLG2VHa1hM3awaUr2d9evQYqTw-221BjpdZujy7wjVbd-C_SOpsQQLX2nS-p8_A-BhdgREWXBOjbrsEh_sk';

/* من عملية في السجل → افتح فاتورتها المرتبطة (شراء/بيع/رافيناج/دولار/دبي) */
/* المجموع التراكمي لليوم: عند نقر سطر، احسب رصيد الزبون بعد كل عمليات ذلك اليوم */

window.cpOpenOpInvoice=function(op){
    try{
        if(!op)return;
        if(op.rid){ return cpViewInvoice('raf',op.rid); }
        if(op.iid){ return cpViewInvoice('inv',op.iid); }
        if(op.did){ return cpViewInvoice('doll',op.did); }
        /* عمليات بلا فاتورة (استلام/تسليم/تسوية): رسالة لطيفة */
        toast('هذه المعاملة لا فاتورة مرتبطة بها','info');
    }catch(e){ toast('تعذّر فتح الفاتورة','error'); }
};

/* نافذة إرشاد عند حظر الإشعارات — تشرح كيف يفعّلها الزبون يدوياً */
function _showNotifBlockedHelp(){
    let m=document.getElementById('notifHelpModal'); if(m)m.remove();
    m=document.createElement('div');m.id='notifHelpModal';
    m.style.cssText='position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:1.2rem';
    m.innerHTML=`<div style="background:#fff;border-radius:16px;max-width:400px;width:100%;padding:1.3rem;font-family:Tajawal,sans-serif;text-align:right;max-height:85vh;overflow:auto">
        <div style="font-size:1.05rem;font-weight:900;color:#d97706;margin-bottom:.8rem">🔔 تفعيل الإشعارات محظور</div>
        <div style="font-size:.82rem;line-height:1.9;color:#333">
            الإشعارات محظورة في إعدادات جهازك. لتفعيلها:
            <div style="background:#fef3e7;border-radius:10px;padding:.8rem;margin:.7rem 0;font-weight:700">
                1️⃣ افتح <b>إعدادات الهاتف</b><br>
                2️⃣ <b>التطبيقات</b> ← ابحث عن <b>Chrome</b><br>
                3️⃣ <b>الإشعارات</b> ← فعّلها<br>
                4️⃣ ثم في نفس صفحة Chrome: <b>الإشعarات</b> ← <b>المواقع</b> ← تأكد أن موقع GoldPro مسموح<br>
                5️⃣ ارجع للتطبيق واضغط «تفعيل الإشعارات» مجدداً
            </div>
            <div style="font-size:.74rem;color:#888">إن كان جهازك شاومي/أوبو/هواوي: تأكد أيضاً من إزالة Chrome من قيود «توفير البطارية».</div>
        </div>
        <button onclick="document.getElementById('notifHelpModal').remove()" style="width:100%;margin-top:1rem;background:#d97706;color:#fff;border:none;border-radius:10px;padding:.7rem;font-weight:800;font-family:Tajawal,sans-serif;cursor:pointer">فهمت</button>
    </div>`;
    document.body.appendChild(m);
}
window._showNotifBlockedHelp=_showNotifBlockedHelp;

/* تفعيل الإشعارات — من بوابة الزبون */
window.cpEnableNotifs=async function(){
    try{
        if(typeof Notification==='undefined')return toast('هذا المتصفح لا يدعم الإشعارات','error');
        /* إن كان محظوراً مسبقاً: requestPermission لا يُظهر نافذة — نرشد الزبون للإعدادات */
        if(Notification.permission==='denied'){ _showNotifBlockedHelp(); return; }
        const perm=await Notification.requestPermission();
        if(perm==='denied'){ _showNotifBlockedHelp(); return; }
        if(perm!=='granted')return toast('لم يُمنح إذن الإشعارات — أعد المحاولة','error');
        toast('⏳ جارٍ التفعيل…','info');
        const reg=await navigator.serviceWorker.register('./firebase-messaging-sw.js',{scope:'./firebase-cloud-messaging-push-scope'});
        /* حرج على أندرويد/سامسونغ: انتظر تفعيل SW فعلياً قبل getToken (رمز 20=AbortError يحدث لو لم يُفعّل بعد) */
        await navigator.serviceWorker.ready;
        if(reg.installing||reg.waiting){
            await new Promise(res=>{
                const w=reg.installing||reg.waiting;
                if(!w)return res();
                w.addEventListener('statechange',()=>{ if(w.state==='activated')res(); });
                setTimeout(res,4000);   /* مهلة أمان */
            });
        }
        const messaging=firebase.messaging();
        /* محاولتان: بعض أجهزة سامسونغ تفشل أول اشتراك push ثم تنجح */
        let token=null, lastErr=null;
        for(let attempt=0; attempt<2 && !token; attempt++){
            try{ token=await messaging.getToken({vapidKey:FCM_VAPID,serviceWorkerRegistration:reg}); }
            catch(err){ lastErr=err; await new Promise(r=>setTimeout(r,1200)); }
        }
        if(!token){
            const code=lastErr&&(lastErr.code||lastErr.name||lastErr.message)||'';
            if(String(code).includes('20')||/abort/i.test(String(code))){
                toast('⚠️ تعذّر الاشتراك في الإشعارات. على هاتف سامسونغ: تأكّد أن «خدمات Google Play» مفعّلة وغير مقيّدة بتوفير البطارية، ثم أعد المحاولة','error');
            }else{
                toast('تعذّر الحصول على رمز الجهاز: '+code,'error');
            }
            return;
        }
        const phone=(_currentUser||'').replace(/^c/,'');
        await _db.ref('goldpro/_tokens/'+token).set({phone,name:_sessionCustName||'',ts:Date.now()});
        const b=document.getElementById('cpNotifBanner'); if(b)b.style.display='none';
        toast('✅ فُعّلت الإشعارات — ستصلك الفواتير الجديدة فور تسجيلها','success');
        /* اختبار ذاتي فوري: يعرض إشعاراً محلياً — إن ظهر فالاستقبال يعمل */
        setTimeout(async ()=>{
            try{
                const r=await navigator.serviceWorker.getRegistration('./firebase-cloud-messaging-push-scope')||await navigator.serviceWorker.ready;
                await r.showNotification('✅ تجربة GoldPro',{body:'إن رأيت هذا الإشعار، فجهازك يستقبل الإشعارات بنجاح',icon:'./icon-192.png',dir:'rtl',lang:'ar',tag:'gp-test-'+Date.now(),requireInteraction:false});
            }catch(e){ toast('⚠️ جهازك لا يعرض الإشعارات: '+(e&&e.message||'')+' — تحقّق من إعدادات إشعارات المتصفح في نظام الهاتف','error'); }
        },1500);
        /* إشعار المقدّمة: يعرض حتى والتطبيق مفتوح (data-only لا يظهر تلقائياً) */
        try{
            messaging.onMessage(payload=>{
                const d=(payload&&payload.data)||{};
                if(Notification.permission==='granted'&&navigator.serviceWorker.ready){
                    navigator.serviceWorker.ready.then(reg=>{
                        reg.showNotification(d.title||'GoldPro',{
                            body:d.body||'',icon:'./icon-192.png',badge:'./icon-192.png',
                            dir:'rtl',lang:'ar',tag:'gp-'+Date.now(),renotify:true,
                            data:{url:d.url||'./'}
                        });
                    });
                }
            });
        }catch(e){}
    }catch(e){ toast('تعذّر التفعيل: '+(e&&e.code||''),'error'); }
};

/* تفعيل إشعارات شريك الرافيناج (نفس قناة الزبائن بمفتاح 'ali') */
window._partnerEnableNotifs=async function(){
    try{
        if(typeof Notification==='undefined')return toast('هذا المتصفح لا يدعم الإشعارات','error');
        if(Notification.permission==='denied'){ if(typeof _showNotifBlockedHelp==='function')_showNotifBlockedHelp(); return; }
        const perm=await Notification.requestPermission();
        if(perm!=='granted')return toast('لم يُمنح إذن الإشعارات','error');
        toast('⏳ جارٍ التفعيل…','info');
        const reg=await navigator.serviceWorker.register('./firebase-messaging-sw.js',{scope:'./firebase-cloud-messaging-push-scope'});
        await navigator.serviceWorker.ready;
        const messaging=firebase.messaging();
        let token=null,lastErr=null;
        for(let a2=0;a2<2&&!token;a2++){ try{token=await messaging.getToken({vapidKey:FCM_VAPID,serviceWorkerRegistration:reg});}catch(er){lastErr=er;await new Promise(r=>setTimeout(r,1200));} }
        if(!token){ const c=lastErr&&(lastErr.code||lastErr.name)||''; toast((String(c).includes('20')||/abort/i.test(String(c)))?'⚠️ تأكّد أن «خدمات Google Play» مفعّلة وغير مقيّدة بالبطارية، ثم أعد المحاولة':'تعذّر رمز الجهاز: '+c,'error'); return; }
        await _db.ref('goldpro/_tokens/'+token).set({phone:'ali',name:'Ali',ts:Date.now()});
        const b=document.getElementById('partnerBell'); if(b)b.textContent='🔔 مفعّلة ✓';
        toast('✅ ستصلك فواتير الرافيناج فور تسجيلها','success');
    }catch(e){ toast('تعذّر التفعيل: '+(e&&e.code||''),'error'); }
};
window._sendPartnerPush=async function(title,body){
    try{ await _db.ref('goldpro/_push').push({phone:'ali',title:title||'GoldPro',body:body||'',ts:Date.now()}); }catch(e){}
};

/* إرسال إشعار لزبون باسمه (من جهاز المسؤول) — يكتب طلباً تلتقطه الدالة السحابية */
/* ═══ تجديد رمز الجهاز عند كل فتح ═══
   رموز FCM تنتهي صلاحيتها وتتغيّر (تحديث متصفح/تنظيف تخزين/خمول طويل).
   كانت تُسجَّل مرة واحدة فقط عند الضغط على «تفعيل»، فإن تبدّل الرمز:
   يفشل الإرسال ← تحذفه الدالة السحابية ← تتوقف إشعارات ذلك الزبون صامتة.
   الحل: أعِد تسجيله بهدوء كلما فُتح التطبيق وكان الإذن ممنوحاً. */
window._refreshPushToken=async function(){
    try{
        if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
        if(typeof firebase==='undefined'||!firebase.messaging)return;
        const role=(typeof _sessionRole!=='undefined')?_sessionRole:'';
        let phone=null,nm='';
        if(role==='customer'){ phone=(_currentUser||'').replace(/^c/,''); nm=(typeof _sessionCustName!=='undefined'?_sessionCustName:'')||''; }
        else if(role==='rafpartner'){ phone='ali'; nm='Ali'; }
        if(!phone)return;                       /* المسؤول والعامل لا يحتاجان */
        if(!_db)return;
        const reg=await navigator.serviceWorker.register('./firebase-messaging-sw.js',{scope:'./firebase-cloud-messaging-push-scope'});
        await navigator.serviceWorker.ready;
        const messaging=firebase.messaging();
        let token=null;
        for(let a=0;a<2&&!token;a++){
            try{ token=await messaging.getToken({vapidKey:FCM_VAPID,serviceWorkerRegistration:reg}); }
            catch(e){ await new Promise(r=>setTimeout(r,1500)); }
        }
        if(!token){
            /* الإذن ممنوح لكن تعذّر الرمز ← أظهر اللافتة، وإلا ظنّ الزبون أن الإشعارات تعمل */
            try{ const b=document.getElementById('cpNotifBanner'); if(b)b.style.display='flex'; }catch(e){}
            return;
        }
        const prev=localStorage.getItem('gp12_fcmtok')||'';
        /* إن تبدّل الرمز: احذف القديم لئلا يتراكم ميتاً */
        if(prev&&prev!==token){ try{ await _db.ref('goldpro/_tokens/'+prev).remove(); }catch(e){} }
        await _db.ref('goldpro/_tokens/'+token).set({phone,name:nm,ts:Date.now()});
        try{ localStorage.setItem('gp12_fcmtok',token); }catch(e){}
        try{ const b=document.getElementById('cpNotifBanner'); if(b)b.style.display='none'; }catch(e){}
        console.log('[GoldPro] جُدِّد رمز الإشعارات');
    }catch(e){ console.warn('[GoldPro] تعذّر تجديد رمز الإشعارات:',e&&(e.code||e.message)); }
};
/* شغّله بعد استقرار الصفحة، وكلما عاد المستخدم للتطبيق */
setTimeout(()=>{try{window._refreshPushToken();}catch(e){}},3000);
document.addEventListener('visibilitychange',()=>{
    if(!document.hidden){
        const last=+(localStorage.getItem('gp12_fcmtok_ts')||0);
        if(Date.now()-last>6*3600*1000){          /* مرة كل 6 ساعات على الأكثر */
            try{ localStorage.setItem('gp12_fcmtok_ts',String(Date.now())); }catch(e){}
            setTimeout(()=>{try{window._refreshPushToken();}catch(e){}},1500);
        }
    }
});

/* ربط دائم لإشعار المقدّمة عند كل فتح (للزبون/الشريك الذي فعّل سابقاً) */
(function _bindFgPush(){
    try{
        if(typeof Notification==='undefined'||Notification.permission!=='granted')return;
        if(typeof firebase==='undefined'||!firebase.messaging)return;
        const m=firebase.messaging();
        m.onMessage(payload=>{
            const d=(payload&&payload.data)||{};
            navigator.serviceWorker.getRegistration('./firebase-cloud-messaging-push-scope').then(reg=>{
                (reg||navigator.serviceWorker.ready).showNotification?
                    reg.showNotification(d.title||'GoldPro',{body:d.body||'',icon:'./icon-192.png',badge:'./icon-192.png',dir:'rtl',lang:'ar',tag:'gp-'+Date.now(),renotify:true,data:{url:d.url||'./'}})
                    :navigator.serviceWorker.ready.then(r=>r.showNotification(d.title||'GoldPro',{body:d.body||'',icon:'./icon-192.png',dir:'rtl',lang:'ar'}));
            }).catch(()=>{});
        });
    }catch(e){}
})();

window._sendCustomerPush=async function(custName,title,body){
    try{
        /* تطبيع عربي: الهمزات والتاء المربوطة والألف المقصورة والتشكيل والتطويل
           — اختلاف كتابة الاسم كان يمنع العثور على رقم الزبون فلا يصله إشعار. */
        const _n=s=>(s||'').toString().trim()
            .replace(/[\u064B-\u0652\u0670\u0640]/g,'')   /* تشكيل + تطويل */
            .replace(/[أإآٱ]/g,'ا')
            .replace(/ة/g,'ه')
            .replace(/[ىي]/g,'ي')
            .replace(/ؤ/g,'و').replace(/ئ/g,'ي')
            .replace(/\s+/g,' ')
            .toLowerCase();
        let phone=null;
        /* ابحث في الربط المحمَّل، وإن كان فارغاً حمِّله مرة */
        if(!Object.keys(_custAccCache).length){
            const snap=await new Promise(res=>{const t=setTimeout(()=>res(null),4000);
                _db.ref(_CUSTS_PATH).once('value',s=>{clearTimeout(t);res(s.val());},()=>{clearTimeout(t);res(null);});});
            if(snap)_custAccCache=snap;
        }
        Object.keys(_custAccCache).forEach(ph=>{
            if(_n(_custAccCache[ph].name)===_n(custName))phone=ph;
        });
        if(!phone){
            /* زبون غير مربوط بحساب/هاتف — الإشعار يحتاج ربطاً */
            if(_sessionRole==='admin'&&typeof toast==='function')
                toast('🔕 «'+custName+'» غير مربوط بحساب زبون — لن يصله إشعار حتى يُنشئ حسابه ويفعّل الإشعارات','info');
            return;
        }
        await _db.ref('goldpro/_push').push({phone,title:title||'GoldPro',body:body||'لديك فاتورة جديدة',ts:Date.now()});
        /* تحقّق صادق: هل لهذا الزبون جهاز مسجَّل فعلاً؟ (المسؤول وحده يقرأ _tokens) */
        if(_sessionRole==='admin'&&typeof toast==='function'){
            let _cnt=null;
            try{
                const ts=await _db.ref('goldpro/_tokens').orderByChild('phone').equalTo(String(phone)).get();
                _cnt=ts.exists()?Object.keys(ts.val()).length:0;
            }catch(e){}
            if(_cnt===0)
                toast('🔕 «'+custName+'» لم يعُد له جهاز مفعَّل — يفتح حسابه ويضغط «تفعيل الإشعارات»','error');
            else if(_cnt>0)
                toast('📤 أُرسل إشعار إلى '+custName+' ('+_cnt+' جهاز)','success');
            else
                toast('📤 أُرسل إشعار إلى '+custName,'success');
        }
    }catch(e){/* الإشعار كماليّ — لا يعطّل الحفظ */
        if(_sessionRole==='admin'&&typeof toast==='function')toast('⚠️ تعذّر دفع الإشعار: '+(e&&e.code||e&&e.message||''),'error');
    }
};


/* ═══ عارض فاتورة داخل الشاشة (لبوابة الزبون) ═══
   المسؤول يستعمل الحفظ المشفّر؛ الزبون يحتاج العرض المباشر. */
/* مؤشر نسخة صغير في بوابة الزبون (الرأس مخفي عنه) */
(function(){
    try{
        fetch('./sw.js?_='+Date.now(),{cache:'no-store'}).then(r=>r.text()).then(t=>{
            const m=t.match(/goldpro-(v\d+)/);
            const el=document.getElementById('cpVerTag');
            if(m&&el)el.textContent='· '+m[1];
        }).catch(()=>{});
    }catch(e){}
})();
window.cpViewInvoice=async function(kind,id){
    let html='';
    let _lazyPhotos=null;   /* الصور تُحمَّل في الخلفية وتُلحق — لا تُعطّل العرض */
    try{
        if(kind==='raf'){
            const r=(typeof rafInvoices!=='undefined'?rafInvoices:[]).find(x=>x.id===id);
            if(!r)return toast('الفاتورة غير موجودة','error');
            html=buildRafHtml(r)+'<div id="cpLazyPhotos" style="text-align:center;color:#9ca3af;font-size:11px;padding:6px">📷 جارٍ تحميل الصور…</div>';
            _lazyPhotos=id;
        }else{
            if(kind==='doll'){
                const dv=(typeof dollInvoices!=='undefined'?dollInvoices:[]).find(x=>x.id===id);
                if(!dv)return toast('الفاتورة غير موجودة','error');
                html=buildDollHtml(dv);
            }else if(kind==='dubai'){
                const dv=(typeof dubaiInvoices!=='undefined'?dubaiInvoices:[]).find(x=>x.id===id);
                if(!dv)return toast('الفاتورة غير موجودة','error');
                html=buildDubaiHtml(dv);
            }else{
                const inv=(typeof invoices!=='undefined'?invoices:[]).find(x=>x.id===id);
                if(!inv)return toast('الفاتورة غير موجودة','error');
                html=buildInvHtml(inv)+'<div id="cpLazyPhotos" style="text-align:center;color:#9ca3af;font-size:11px;padding:6px">📷 جارٍ تحميل الصور…</div>';
                _lazyPhotos='INV:'+id;
            }
        }
    }catch(e){console.error('cpViewInvoice',e);return toast('تعذّر عرض الفاتورة: '+(e&&e.message||e),'error');}
    let m=document.getElementById('cpViewModal');
    if(!m){
        m=document.createElement('div');m.id='cpViewModal';
        m.style.cssText='position:fixed;inset:0;z-index:99999;background:#fff;display:none;overflow:hidden';
        m.innerHTML=`<button onclick="document.getElementById('cpViewModal').style.display='none'"
                style="position:fixed;top:.55rem;inset-inline-start:.55rem;z-index:2;background:var(--rd);color:#fff;border:none;border-radius:10px;padding:.4rem .85rem;font-weight:900;font-family:Tajawal,sans-serif;cursor:pointer">✕ إغلاق</button>
            <div id="cpViewScale" style="position:absolute;top:0;right:0;transform-origin:top right">
                <div id="cpViewBody" style="background:#fff;width:520px;padding:8px"></div>
            </div>`;
        document.body.appendChild(m);
    }
    /* افتح فوراً بهيكل ثم احقن المحتوى في الإطار التالي — إحساس لحظي */
    document.getElementById('cpViewBody').innerHTML='<div style="text-align:center;padding:2rem;color:#9ca3af;font-family:Tajawal,sans-serif;font-weight:800">⏳ جارٍ التحضير…</div>';
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    document.getElementById('cpViewBody').innerHTML=html;
    if(_lazyPhotos){
        const _isInv=String(_lazyPhotos).startsWith('INV:');
        const _pid=_isInv?_lazyPhotos.slice(4):_lazyPhotos;
        const _loader=_isInv?(typeof _invLoadPhotos==='function'?_invLoadPhotos:null):(typeof _rafLoadPhotos==='function'?_rafLoadPhotos:null);
        if(_loader)_loader(_pid).then(ph=>{
            const slot=document.getElementById('cpLazyPhotos');
            if(!slot)return;
            slot.outerHTML=(ph&&ph.length&&typeof _rafPhotosHtml==='function')?_rafPhotosHtml(ph):'';
            if(typeof _cpViewRescale==='function')try{_cpViewRescale();}catch(e){}
        }).catch(()=>{const s=document.getElementById('cpLazyPhotos');if(s)s.remove();});
    }
    m.style.display='block';
    /* تحجيم الفاتورة لتملأ الشاشة كاملة بلا أي تمرير */
    const _fit=()=>{
        const body=document.getElementById('cpViewBody');
        const sc=document.getElementById('cpViewScale');
        const cw=Math.max(body.scrollWidth,body.offsetWidth)||520;
        const ch=Math.max(body.scrollHeight,body.offsetHeight)||1;
        const s=Math.min(window.innerWidth/cw, window.innerHeight/ch);
        sc.style.transform='scale('+s+')';
        /* توسيط أفقي بعد التحجيم */
        sc.style.right=Math.max(0,(window.innerWidth-cw*s)/2)+'px';
    };
    requestAnimationFrame(_fit);
    setTimeout(_fit,350);   /* بعد تحميل الخطوط/الصور */
    setTimeout(_fit,900);
};


/* دخول سريع لعامل كلمته محفوظة محلياً */
window._wsQuickLogin=function(u){
    const pw=localStorage.getItem('gp12_wpw_'+u);
    if(!pw)return;
    const ue=document.getElementById('loginUser'),pe=document.getElementById('loginPw');
    if(ue)ue.value=u; if(pe)pe.value=pw;
    doLoginWorker(u,pw);
};
