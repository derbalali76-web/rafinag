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

let _loginMode='admin';
window.setLoginMode=function(m){
    _loginMode=m;
    ['admin','worker','customer'].forEach(k=>{
        const t=document.getElementById('lmTab_'+k),p=document.getElementById('lmPanel_'+k);
        if(t)t.classList.toggle('on',k===m);
        if(p)p.style.display=k===m?'block':'none';
    });
    const sub=document.getElementById('loginSub');
    if(sub)sub.textContent=m==='admin'?'نظام إدارة الذهب — دخول المسؤول':m==='worker'?'دخول عامل الورشة':'كشف حساب الزبون';
    const err=document.getElementById('loginErr'); if(err)err.style.display='none';
    setTimeout(()=>{
        const f=m==='admin'?'loginPw':m==='worker'?'wkUser':'custPhone';
        document.getElementById(f)?.focus();
    },100);
};

/* ── Firebase Email/Password Auth ──
   كل مستخدم يحصل على بريد افتراضي: username@goldpro.local
   هذا يضمن نفس الـ UID على كل الأجهزة بدل Anonymous الذي يعطي UID مختلف لكل جهاز */
const _FB_DOMAIN='@goldpro.local';
/* Firebase يشترط كلمة مرور ≥6 أحرف؛ نوسّع كلمة مرور المستخدم بلاحقة ثابتة لـ Firebase فقط.
   الأمان يبقى في كلمة المرور الأصلية (المهاجم يحتاجها أصلاً). كلمتك القصيرة تبقى كما هي في الدخول. */
const _FB_PW_SUFFIX='__GoldPro$ok';
const _fbPw=(pw)=>String(pw||'')+_FB_PW_SUFFIX;

async function _fbSignInEmail(uname,pw,allowCreate){
    const email=uname+_FB_DOMAIN;
    try{
        await firebase.auth().signInWithEmailAndPassword(email,_fbPw(pw));
        return true;
    }catch(e){
        /* حسابات قديمة أُنشئت بكلمة المرور الخام قبل التوسيع */
        try{ await firebase.auth().signInWithEmailAndPassword(email,pw); return true; }catch(_){}
        /* مستخدم معروف فقد حسابه (حُذف) → أعِد إنشاءه بكلمة مروره */
        if(allowCreate){
            try{ await firebase.auth().createUserWithEmailAndPassword(email,_fbPw(pw)); return true; }catch(_){}
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

function _showLoginErr(msg){
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

    /* قاعدة جديدة فارغة: أول دخول يُنشئ حساب admin بكلمة السر المُدخَلة */
    if(!users[uname]){
        if(Object.keys(users).length===0){
            try{ await _saveUser(uname,true); users=_usersCache; }
            catch(e){ if(btn){btn.disabled=false;btn.textContent=origTxt;} return _showLoginErr('تعذّر إنشاء حساب المسؤول — تحقّق من الاتصال'); }
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
    window._wsLock=role==='worker'?ws:null;
    _encKey=pw;
    sessionStorage.setItem('gp12_ek',pw);
    sessionStorage.setItem('gp12_role',role);
    if(ws)sessionStorage.setItem('gp12_ws',ws);else sessionStorage.removeItem('gp12_ws');
    if(custName)sessionStorage.setItem('gp12_cname',custName);else sessionStorage.removeItem('gp12_cname');
    const _isMobile=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if(!_isMobile&&document.documentElement.requestFullscreen&&!document.fullscreenElement)
        document.documentElement.requestFullscreen().catch(()=>{});
    _currentUser=uname;
    _LSKEY='gp12_'+(_SITE?_SITE+'_':'')+uname;
    _LSDRAFT='gp12_draft_'+(_SITE?_SITE+'_':'')+uname;
    _baseRef=_db.ref((_SITE?`goldpro/${_SITE}/`:'goldpro/')+'admin/data');
    sessionStorage.setItem('gp12_auth','1');sessionStorage.setItem('gp12_user',uname);
    const ud=document.getElementById('currentUserDisplay');if(ud)ud.textContent=uname;
    const ov=document.getElementById('loginOverlay');
    if(ov){ov.classList.add('fade-out');setTimeout(()=>ov.remove(),520);}
    _fbInitialLoad();_afterLogin();
    _applyRoleUI();
}

/* ═══ دخول عامل الورشة (dahmoun / salah) ═══ */
async function doLoginWorker(){
    const uname=(document.getElementById('wkUser').value||'').trim().toLowerCase();
    const pw=document.getElementById('wkPw').value;
    document.getElementById('loginErr').style.display='none';
    const seed=_WORKERS[uname];
    if(!seed)return _showLoginErr('حساب ورشة غير معروف (dahmoun أو salah)');
    if(!pw)return _showLoginErr('أدخل كلمة المرور');
    let users;
    try{users=await _loadUsers();}catch(e){users=_usersCache;}
    if(!users[uname]){
        /* أول دخول لهذا العامل: كلمة السر يجب أن تطابق كلمة rafinag الأصلية */
        if(pw!==seed.pw)return _showLoginErr('كلمة المرور خاطئة');
        try{await _saveUserMeta(uname,{isAdmin:false,role:'worker',workshop:seed.workshop});}
        catch(e){return _showLoginErr('تعذّر إنشاء الحساب — تحقّق من الاتصال');}
    }
    const _ok=await _fbSignInEmail(uname,pw,true);
    if(!_ok)return _showLoginErr('كلمة المرور خاطئة');
    _finishLogin(uname,pw,'worker',seed.workshop,'');
}

/* ═══ دخول الزبون برقم الهاتف ═══ */
async function doLoginCustomer(){
    const phone=(document.getElementById('custPhone').value||'').replace(/[^0-9]/g,'');
    document.getElementById('loginErr').style.display='none';
    if(phone.length<6)return _showLoginErr('أدخل رقم هاتف صحيحاً');
    /* الرقم لا بد أن يكون مربوطاً باسم زبون من المسؤول */
    const rec=await new Promise(res=>{
        const t=setTimeout(()=>res(null),6000);
        _db.ref(_CUSTS_PATH+'/'+phone).once('value',s=>{clearTimeout(t);res(s.val());},()=>{clearTimeout(t);res(null);});
    });
    if(!rec||!rec.name)return _showLoginErr('الرقم غير مسجّل — تواصل مع المسؤول');
    const uname='c'+phone;
    const _ok=await _fbSignInEmail(uname,phone,true);
    if(!_ok)return _showLoginErr('تعذّر الدخول — أعد المحاولة');
    _finishLogin(uname,phone,'customer',null,rec.name);
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
    sessionStorage.removeItem('gp12_auth');
    sessionStorage.removeItem('gp12_user');
    sessionStorage.removeItem('gp12_ek');
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
    sessionStorage.setItem('gp12_ek',n1);
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
    const savedUser=sessionStorage.getItem('gp12_user');
    if(sessionStorage.getItem('gp12_auth')==='1'&&savedUser){
        _encKey=sessionStorage.getItem('gp12_ek')||'';
        _sessionRole=sessionStorage.getItem('gp12_role')||'admin';
        _sessionWs=sessionStorage.getItem('gp12_ws')||null;
        _sessionCustName=sessionStorage.getItem('gp12_cname')||'';
        window._roleLock=_sessionRole==='admin'?null:_sessionRole;
        window._wsLock=_sessionRole==='worker'?_sessionWs:null;
        _currentUser=savedUser;
        _LSKEY='gp12_'+(_SITE?_SITE+'_':'')+savedUser;
        _LSDRAFT='gp12_draft_'+(_SITE?_SITE+'_':'')+savedUser;
        _baseRef=_db.ref((_SITE?`goldpro/${_SITE}/`:'goldpro/')+'admin/data');
        const ud=document.getElementById('currentUserDisplay');if(ud)ud.textContent=savedUser;
        document.getElementById('loginOverlay').remove();
        _loadUsers().catch(()=>{});
        /* انتظر اكتمال Firebase Auth قبل تحميل البيانات */
        if(_encKey) await _fbSignInEmail(savedUser,_encKey).catch(()=>{});
        _fbInitialLoad();_afterLogin();
        _applyRoleUI();
        return;
    }
    let users;
    try{users=await _loadUsers();}catch(e){users={};}
    if(Object.keys(users).length===0){
        /* وضع المسؤول الوحيد: لا لوحة إعداد — أول دخول بكلمة السر يُنشئ حساب admin تلقائياً */
        setTimeout(()=>{const e=document.getElementById('loginPw');if(e)e.focus();},200);
    }else{
        setTimeout(()=>{const e=document.getElementById('loginPw');if(e)e.focus();},200);
    }
}

/* ═══════════ SERIAL NUMBER (حماية النسخة) ═══════════ */
const _SN_LS='gp12_sn';
const _SERIALS={
    'aff63724d67973681f4b2274fd723fd270b69bdd655c65700e4797429b99744d':'',
    'a4378c41b30faff270e9bb853650168a56aa9110bf00a35fb10072314659c5ad':'S2',
    '88b10f66cf0b46016ff518d0335b9ff969c55de520a92c8e5d8192c1f0fff336':'S3',
};

async function _snHash(s){
    const buf=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function _applySite(site){
    _SITE=site||'';
    _USERS_PATH=_SITE?`goldpro/${_SITE}/_users`:'goldpro/_users';
}
async function _checkSerial(){
    const stored=localStorage.getItem(_SN_LS);
    if(stored){
        const sep=stored.lastIndexOf(':');
        const hash=stored.slice(0,sep);
        const site=stored.slice(sep+1);
        if(hash in _SERIALS && _SERIALS[hash]===(site||'')){
            _applySite(site);
            /* السيريال صالح — أزل الـ overlay (أو أخفه إن كان مخفياً أصلاً) */
            const ov=document.getElementById('serialOverlay');
            if(ov)ov.remove();
            _checkAuth();return;
        }
        /* هاش مخزّن لكنه غير صالح — احذفه وأظهر الشاشة */
        localStorage.removeItem(_SN_LS);
    }
    /* لا سيريال مخزّن — أظهر الشاشة وانتظر الإدخال */
    const ov=document.getElementById('serialOverlay');
    if(ov)ov.style.display='flex';
    setTimeout(()=>{const e=document.getElementById('serialInput');if(e)e.focus();},200);
}
function _showSerialError(msg){
    const el=document.getElementById('serialErr');
    if(!el)return;
    el.textContent=msg;el.style.display='block';
    el.style.animation='none';requestAnimationFrame(()=>{el.style.animation='';});
}
async function activateSerial(){
    const entered=(document.getElementById('serialInput').value||'').trim().toUpperCase();
    if(!entered)return _showSerialError('❌ أدخل رمز التفعيل');
    document.getElementById('serialErr').style.display='none';
    const h=await _snHash(entered);
    if(!(h in _SERIALS))return _showSerialError('❌ رمز التفعيل غير صحيح');
    const site=_SERIALS[h];
    localStorage.setItem(_SN_LS, h+':'+(site||''));
    sessionStorage.removeItem('gp12_auth');
    sessionStorage.removeItem('gp12_user');
    _applySite(site);
    const ov=document.getElementById('serialOverlay');
    ov.classList.add('fade-out');
    setTimeout(()=>{ov.remove();_checkAuth();},520);
}

window._changeSN=function(){
    if(!confirm('هل تريد تغيير رمز التفعيل؟\nسيتم تسجيل الخروج من الحساب الحالي.'))return;
    localStorage.removeItem(_SN_LS);
    sessionStorage.removeItem('gp12_auth');
    sessionStorage.removeItem('gp12_user');
    location.reload();
};

window.doLogin=doLogin;window.changePw=changePw;window.doLogout=doLogout;
window.setupFirstUser=setupFirstUser;window.addUser=addUser;
window.activateSerial=activateSerial;
window.deleteUser=deleteUser;window.renderUsersList=renderUsersList;
window.onload=()=>{ _authReadyPromise.then(()=>_checkSerial()); };

/* ═══════════════ ROLE UI — تقييد الواجهة حسب الدور ═══════════════ */
function _applyRoleUI(){
    const role=_sessionRole;
    if(role==='admin')return;
    document.body.classList.add('role-'+role);
    /* حقن CSS الإخفاء مرة واحدة */
    if(!document.getElementById('roleCss')){
        const st=document.createElement('style');st.id='roleCss';
        st.textContent=`
            body.role-worker .bnav,body.role-customer .bnav,
            body.role-worker #vaMicWrap,body.role-customer #vaMicWrap,
            body.role-worker .va-panel,body.role-customer .va-panel{display:none!important}
            body.role-worker #wsEffect{display:none!important}
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
    if(role==='worker'){
        /* العامل: ورشته فقط */
        setTimeout(()=>{
            if(typeof setWsCur==='function')setWsCur(_sessionWs);
            if(typeof switchPage==='function')switchPage('workshops');
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
        },400);
    }
}
window._applyRoleUI=_applyRoleUI;

/* ═══════════════ بوابة الزبون (قراءة فقط) ═══════════════ */
function renderCustomerPortal(){
    const name=_sessionCustName;
    if(!name)return;
    const nEl=document.getElementById('cpName'); if(nEl)nEl.textContent=name;
    const _n=s=>(s||'').trim().replace(/\s+/g,' ');
    const key=_n(name);
    /* الأرصدة — من منظور الزبون: موجب (لنا) = مطلوب منك | سالب (علينا) = لك */
    const types=[['دينار','دج',0,'💵'],['دولار','$',2,'💲'],['ذهب 730','غ',3,'👑'],['ذهب 24','غ',3,'💎']];
    const cards=document.getElementById('cpCards');
    if(cards){
        cards.innerHTML=types.map(([tp,un,dec,ic])=>{
            const bal=(typeof debts!=='undefined'?debts:[]).filter(d=>_n(d.c)===key&&d.type===tp).reduce((s,d)=>s+(d.a||0),0);
            if(Math.abs(bal)<0.001)return '';
            const owes=bal>0; /* موجب = الزبون مدين لنا */
            return `<div style="border:1px solid var(--border);border-radius:12px;padding:.6rem .7rem;background:var(--card)">
                <div style="font-size:.7rem;color:var(--t3);font-weight:700">${ic} ${tp}</div>
                <div style="font-size:1.05rem;font-weight:900;color:${owes?'var(--rd)':'var(--gr)'}">${fmt(Math.abs(bal),dec)} ${un}</div>
                <div style="font-size:.68rem;font-weight:800;color:${owes?'var(--rd)':'var(--gr)'}">${owes?'مطلوب منك':'لك'}</div>
            </div>`;
        }).join('')||'<div style="grid-column:1/-1;text-align:center;padding:.8rem;color:var(--t3);font-weight:700">رصيدك مُسوّى ✅</div>';
    }
    /* المعاملات */
    const box=document.getElementById('cpOps');
    if(box){
        const mine=(typeof ops!=='undefined'?ops:[]).filter(o=>_n(o.c)===key).slice(0,80);
        box.innerHTML=mine.length?mine.map(o=>`
            <div style="border:1px solid var(--border);border-radius:10px;padding:.5rem .65rem;margin-bottom:.4rem;background:var(--card);display:flex;justify-content:space-between;align-items:center">
                <div>
                    <div style="font-weight:800;font-size:.78rem">${o.t||''} — ${o.m||''}</div>
                    <div style="font-size:.68rem;color:var(--t3)">${o.dt||''}</div>
                </div>
                <div style="font-weight:900;font-size:.85rem">${fmt(o.a||0,(o.m==='دينار')?0:3)}</div>
            </div>`).join('')
            :'<div style="text-align:center;padding:1rem;color:var(--t3);font-weight:700">لا توجد معاملات</div>';
    }
}
window.renderCustomerPortal=renderCustomerPortal;

/* ═══════════════ حسابات الزبائن (رقم هاتف → اسم) — للمسؤول ═══════════════ */
let _custAccCache={};
async function addCustomerAccount(){
    const phone=(document.getElementById('newCustPhone').value||'').replace(/[^0-9]/g,'');
    const name=(document.getElementById('newCustName').value||'').trim();
    if(phone.length<6)return toast('رقم الهاتف قصير','error');
    if(!name)return toast('أدخل اسم الزبون كما هو في الديون','error');
    await _db.ref(_CUSTS_PATH+'/'+phone).set({name});
    _custAccCache[phone]={name};
    document.getElementById('newCustPhone').value='';document.getElementById('newCustName').value='';
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
                <button onclick="deleteCustomerAccount('${ph}')" style="border:none;background:transparent;color:var(--rd);cursor:pointer;font-size:.82rem;padding:0">🗑️</button>
            </div>`).join('')
            :'<div style="font-size:.72rem;color:var(--t3);text-align:center;padding:.3rem">لا توجد حسابات زبائن بعد</div>';
    });
}
window.addCustomerAccount=addCustomerAccount;
window.deleteCustomerAccount=deleteCustomerAccount;
window.renderCustAccounts=renderCustAccounts;
window.doLoginWorker=doLoginWorker;
window.doLoginCustomer=doLoginCustomer;
