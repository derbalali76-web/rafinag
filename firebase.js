window.FB_JS_VER='v322';
/* ═══════════ FIREBASE ═══════════ */
const _fbConfig={
    apiKey:"AIzaSyDevHwoNCKXGm-G8GJc_Z5eZwcSPuQS9wI",
    authDomain:"rafinag-157d2.firebaseapp.com",
    databaseURL:"https://rafinag-157d2-default-rtdb.europe-west1.firebasedatabase.app",
    projectId:"rafinag-157d2",
    storageBucket:"rafinag-157d2.firebasestorage.app",
    messagingSenderId:"335646681403",
    appId:"1:335646681403:web:0b58e844426e0055b86f1e"
};
firebase.initializeApp(_fbConfig);
const _db=firebase.database();
const _auth=firebase.auth();
let _authReady=false;
/* لا ندخل بحساب مجهول بعد الآن — المصادقة تتم بالبريد فقط عند تسجيل الدخول */
const _authReadyPromise=new Promise(res=>{
    const t=setTimeout(()=>{_authReady=true;res();},3000);
    _auth.onAuthStateChanged(()=>{ clearTimeout(t); _authReady=true; res(); });
});
_db.goOffline();_db.goOnline();
firebase.database.enableLogging(false);

/* مفتاح Vision المشترك — عقدة عامة لكل المستخدمين المصادَقين */
window._sharedVisionKey='';
window._saveSharedVisionKey=(v)=>{ try{return _db.ref('goldpro/_appcfg/visionKey').set(v||'');}catch(e){return Promise.reject(e);} };
_auth.onAuthStateChanged(u=>{
    if(!u)return;
    try{
        _db.ref('goldpro/_appcfg/visionKey').on('value',s=>{
            const v=s.val()||'';
            window._sharedVisionKey=v;
            if(v){ try{localStorage.setItem('gp_vision_key',v);}catch(e){} }
        });
    }catch(e){}
});

let _baseRef=null;
let _fbOnline=false;
let _fbLoaded=false;

/* ── تتبع الأحداث التي لم تُرفع بعد للسحابة ── */
const _unsyncedIds=new Set();
/* نقرة على شارة المزامنة = تشخيص فوري + دفعة يدوية */
window._syncDiag=function(){
    const n=(typeof _unsyncedIds!=='undefined')?_unsyncedIds.size:0;
    const err=window._lastFbErr||'لا أخطاء مسجلة';
    const authOk=!!(_auth&&_auth.currentUser);
    /* أوفلاين رغم وجود النت → إعادة اتصال فورية صامتة (الحالة الشائعة على الحاسوب) */
    if(!_fbOnline&&navigator.onLine){
        try{toast('🔄 إعادة الاتصال…','info');}catch(_){}
        try{ _db.goOffline(); setTimeout(()=>{try{_db.goOnline();}catch(e){}},700); }catch(e){}
        if(!authOk&&typeof window._silentReauth==='function')setTimeout(()=>window._silentReauth().then(()=>_retryUnsynced()),1400);
        else setTimeout(_retryUnsynced,1600);
        setTimeout(()=>{ if(_fbOnline)toast('🟢 عاد الاتصال','success'); },2500);
        return;
    }
    const msg='حالة المزامنة:\n'
        +'• معلّق: '+n+' قيد\n'
        +'• جلسة Firebase: '+(authOk?'نشطة ✓':'ساقطة ✗ (سأعيد فتحها)')+'\n'
        +'• آخر خطأ: '+err+'\n\nسأعيد المحاولة الآن…';
    try{if(typeof appAlert==='function')appAlert(msg);else alert(msg);}catch(_){alert(msg);}
    if(!authOk&&typeof window._silentReauth==='function')window._silentReauth().then(()=>setTimeout(_retryUnsynced,1200));
    else{_fbReconnect();setTimeout(_retryUnsynced,1500);}
};
function _updSyncIndicator(){
    let txt,clr;
    if(!_fbOnline){txt='🔴 أوفلاين';clr='var(--rd)';}
    else if(_unsyncedIds.size>0||(typeof _outboxCount==='function'&&_outboxCount()>0)){
        const _n=Math.max(_unsyncedIds.size,(typeof _outboxCount==='function'?_outboxCount():0));
        txt=`🟡 غير محفوظ (${_n})`;clr='#e6a817';
    }
    else{txt='🟢 متصل';clr='var(--gr)';}
    const el=document.getElementById('syncIndicator');
    if(el){el.textContent=txt;el.style.color=clr;}
    /* شارة عائمة للعامل والزبون (رأسهم مخفي) — تُنشأ عند الحاجة */
    if(window._roleLock==='worker'||window._roleLock==='customer'||window._roleLock==='rafpartner'){
        let f=document.getElementById('roleSyncBadge');
        if(!f){
            f=document.createElement('div');f.id='roleSyncBadge';
            f.style.cssText=(window._roleLock==='rafpartner'
                ?'position:fixed;top:.7rem;left:50%;transform:translateX(-50%);z-index:9997;'
                :'position:fixed;bottom:calc(64px + env(safe-area-inset-bottom,0px));left:.6rem;z-index:9997;')
                +'background:var(--card);border:1.5px solid var(--border);border-radius:999px;'
                +'padding:.28rem .65rem;font-family:Tajawal,sans-serif;font-weight:900;font-size:.68rem;'
                +'box-shadow:0 3px 12px rgba(0,0,0,.22);cursor:pointer';
            f.onclick=_syncDiag;
            document.body.appendChild(f);
        }
        f.textContent=txt;f.style.color=clr;
    }
}
function _pushUnsyncedToFb(){
    if(!_baseRef||!_unsyncedIds.size)return;
    const pending=[..._unsyncedIds];
    pending.forEach(eid=>{
        const evt=_allEvents.find(e=>e.id===eid);
        if(!evt){_unsyncedIds.delete(eid);return;}
        try{
            _baseRef.child('events/'+eid).set(_withOwner(evt))
                .then(()=>{_unsyncedIds.delete(eid);_updSyncIndicator();})
                .catch(_fbErr);
        }catch(e){}
    });
}

/* رفع حدث واحد لـ Firebase مع تتبّع حالة المزامنة — المسار الموحَّد لكل عمليات الرفع */
function _fbSetEvent(evt){
    if(!_baseRef||!evt||!evt.id)return;
    _unsyncedIds.add(evt.id);
    _updSyncIndicator();
    try{
        /* معقّم شامل: أي حقل undefined يُسقَط (Firebase يرفض الحمولة كلها بسببه) */
        const _clean=JSON.parse(JSON.stringify(_withOwner(evt)));
        _baseRef.child('events/'+evt.id).set(_clean)
            .then(()=>{_unsyncedIds.delete(evt.id);_outboxDrop(evt.id);_updSyncIndicator();})
            .catch(e=>{_fbErr(e);});
    }catch(e){_fbErr(e);}
}

/* حارس الاستيراد: يوقف معالِجات المزامنة أثناء استبدال كامل البيانات */
let _importing=false;

/* تفريغ صندوق الصادر دورياً: يضمن رفع ما تركه عامل سابق على نفس الجهاز */
setInterval(function(){
    try{ if(_fbOnline&&_baseRef&&_outboxCount()>0)_outboxFlush(); }catch(e){}
},20000);

/* تنظيف دوري لمؤقتات Firebase الفاشلة (previous_websocket_failure تتراكم وتملأ التخزين) */
setInterval(function(){
    try{
        for(var i=localStorage.length-1;i>=0;i--){
            var k=localStorage.key(i);
            if(k&&k.indexOf('previous_websocket_failure')>=0){ try{localStorage.removeItem(k);}catch(_){}}
        }
    }catch(e){}
},30000);

_db.ref('.info/connected').on('value',s=>{
    const wasOffline=!_fbOnline;
    _fbOnline=!!s.val();
    _updSyncIndicator();
    if(_fbOnline){ window._offlineSince=0; }
    else if(!window._offlineSince){ window._offlineSince=Date.now(); }
    /* عند استعادة الاتصال: ارفع الأحداث المعلقة */
    /* ارفع المعلّق فور عودة الاتصال — حتى لو لم يكتمل التحميل الأولي بعد
       (حالة العامل الذي فتح التطبيق والنت مقطوع ثم حفظ جلسته). */
    if(_fbOnline&&wasOffline&&_baseRef){_pushUnsyncedToFb();_outboxFlush();}
});

/* ═══ كشف القابس الزومبي: النت موجود (navigator.onLine) لكن Firebase عالق أوفلاين ═══
   شائع على الحاسوب بعد نوم النظام أو تغيّر الشبكة — نعيد بناء القابس تلقائياً. */
window._offlineSince=0;
setInterval(function(){
    try{
        if(_fbOnline)return;                         /* متصل — لا شيء */
        if(!navigator.onLine)return;                 /* لا نت فعلاً — الأوفلاين صحيح */
        if(!_fbLoaded)return;
        const off=window._offlineSince||0;
        /* أوفلاين رغم وجود النت لأكثر من 6 ثوانٍ = قابس زومبي → أعد بناءه */
        if(off&&Date.now()-off>6000){
            window._offlineSince=Date.now();         /* منع تكرار سريع */
            try{ _db.goOffline(); setTimeout(()=>{try{_db.goOnline();}catch(e){}},800); }catch(e){}
            /* إن كانت الجلسة ساقطة أيضاً، أعِد الدخول */
            if(_auth&&!_auth.currentUser&&typeof window._silentReauth==='function')
                setTimeout(()=>window._silentReauth().catch(()=>{}),1500);
        }
    }catch(e){}
},4000);

/* عند عودة النت للنظام (حدث المتصفح) — أعد بناء القابس فوراً */
window.addEventListener('online',function(){
    try{ if(_fbLoaded){ _db.goOffline(); setTimeout(()=>{try{_db.goOnline();}catch(e){}},500); } }catch(e){}
    /* حدّث لافتة الاتصال في بوابة الزبون فوراً */
    if(window._roleLock==='customer'&&typeof renderCustomerPortal==='function'){try{renderCustomerPortal();}catch(e){}}
});
window.addEventListener('offline',function(){
    if(window._roleLock==='customer'&&typeof renderCustomerPortal==='function'){try{renderCustomerPortal();}catch(e){}}
});

/* حارس الجلسة: لحظة سقوطها (والتطبيق داخل) — أعد الدخول فوراً وادفع المعلق */
_auth.onAuthStateChanged(u=>{
    if(!u&&localStorage.getItem('gp12_auth')==='1'){
        setTimeout(()=>{ if(typeof window._silentReauth==='function')window._silentReauth().then(ok=>{ if(ok)setTimeout(_retryUnsynced,1200); }); },400);
    }
});

let _fbErrShown=false;
function _fbErr(e){
    try{console.warn('[GoldPro sync] فشل الكتابة في Firebase:',(e&&e.code)||e);}catch(_){}
    try{window._lastFbErr=(e&&e.code)||String(e);
        const el=document.getElementById('syncIndicator');
        if(el)el.title='آخر خطأ: '+window._lastFbErr;}catch(_){}
    /* لا تُزعِج الزبون برسائل المزامنة — حسابه للقراءة فقط، والمسؤول وحده يعنيه هذا */
    const _isCust=(window._roleLock==='customer');
    if(!_fbErrShown&&!_isCust){
        _fbErrShown=true;
        try{toast('⚠️ تعذّر حفظ بعض البيانات في السحابة','error');}catch(_){}
        setTimeout(()=>{_fbErrShown=false;},60000);
    }
}

/* ═══════════ ENCRYPTION ═══════════ */
let _encKey='';
function _lsSet(key,obj){
    try{
        const plain=JSON.stringify(obj);
        const stored=_encKey?CryptoJS.AES.encrypt(plain,_encKey).toString():plain;
        localStorage.setItem(key,stored);
    }catch(e){}
}
function _lsGet(key){
    try{
        const raw=localStorage.getItem(key);
        if(!raw)return null;
        if(_encKey){
            try{
                const bytes=CryptoJS.AES.decrypt(raw,_encKey);
                const plain=bytes.toString(CryptoJS.enc.Utf8);
                if(plain)return JSON.parse(plain);
            }catch(e2){}
        }
        return JSON.parse(raw);
    }catch(e){return null;}
}

/* مفتاح تشفير النسخ الاحتياطية = اسم المستخدم + كلمة المرور (في الذاكرة فقط أثناء الجلسة) */
function _backupKey(){ return (_currentUser||'')+'::'+(_encKey||''); }
const _KDF_ITER=100000;
/* تشفير كائن نسخة احتياطية: AES-256 بمفتاح مشتقّ PBKDF2-SHA256 (ملح وIV عشوائيان لكل نسخة) */
function _encryptBackup(dataObj){
    const salt=CryptoJS.lib.WordArray.random(16), iv=CryptoJS.lib.WordArray.random(16);
    const key=CryptoJS.PBKDF2(_backupKey(),salt,{keySize:256/32,iterations:_KDF_ITER,hasher:CryptoJS.algo.SHA256});
    const ct=CryptoJS.AES.encrypt(JSON.stringify(dataObj),key,{iv:iv}).toString();
    return JSON.stringify({_gpenc:2,kdf:'PBKDF2-SHA256',iter:_KDF_ITER,_user:_currentUser,_exported:Date.now(),
        salt:salt.toString(CryptoJS.enc.Hex),iv:iv.toString(CryptoJS.enc.Hex),blob:ct},null,2);
}
/* فكّ نسخة احتياطية → كائن البيانات أو null عند الفشل. يدعم v2(PBKDF2) وv1(عبارة سر) */
function _decryptBackup(parsed){
    try{
        if(parsed._gpenc===2&&parsed.blob&&parsed.salt&&parsed.iv){
            const salt=CryptoJS.enc.Hex.parse(parsed.salt), iv=CryptoJS.enc.Hex.parse(parsed.iv);
            const key=CryptoJS.PBKDF2(_backupKey(),salt,{keySize:256/32,iterations:parsed.iter||_KDF_ITER,hasher:CryptoJS.algo.SHA256});
            const plain=CryptoJS.AES.decrypt(parsed.blob,key,{iv:iv}).toString(CryptoJS.enc.Utf8);
            return plain?JSON.parse(plain):null;
        }
        if(parsed._gpenc&&parsed.blob){ /* v1: عبارة سر مباشرة */
            const plain=CryptoJS.AES.decrypt(parsed.blob,_backupKey()).toString(CryptoJS.enc.Utf8);
            return plain?JSON.parse(plain):null;
        }
    }catch(_){}
    return null;
}

/* ── مساعد: يُضيف ownerUid لكل كائن يُرفع لـ Firebase ── */
function _withOwner(obj){
    const u=firebase.auth().currentUser?.uid;
    return u?{...obj,ownerUid:u}:obj;
}

/* ═══════════ EVENT STORE — المصدر الوحيد للحقيقة ═══════════ */
let _allEvents=[];
let _fbListening=false;

function _getEvLsKey(){return 'gp_ev_'+(_currentUser||'');}

/* تخزين صورة محلياً بأمان: يحدّ العدد ويحذف الأقدم عند الامتلاء،
   ولا يمسّ مفاتيح الأحداث (gp_ev_) أبداً. يحمي من QuotaExceeded. */
window._cachePhotoSafe=function(key,imgs){
    try{
        localStorage.setItem(key,JSON.stringify(imgs));
    }catch(e){
        /* امتلأ التخزين — احذف أقدم صور مخزّنة (gp_ph_) حتى ينجح */
        try{
            const phKeys=[];
            for(let i=0;i<localStorage.length;i++){
                const k=localStorage.key(i);
                if(k&&k.indexOf('gp_ph_')===0)phKeys.push(k);
            }
            /* احذف نصفها (الأقدم إدراجاً غالباً في المقدمة) */
            phKeys.slice(0,Math.ceil(phKeys.length/2)).forEach(k=>{try{localStorage.removeItem(k);}catch(_){}});
            localStorage.setItem(key,JSON.stringify(imgs));
        }catch(e2){ /* تعذّر — نتجاهل، الصورة ستُحمّل من Firebase لاحقاً */ }
    }
};

let _lsSaveWarned=false;
function _lsSaveEvents(){
    try{
        _lsSet(_getEvLsKey(),_allEvents);
        /* تحقّق فعلي أن الكتابة نجحت — _lsSet يبتلع الأخطاء بصمت */
        const _chk=localStorage.getItem((window.__GP_NS||'')+_getEvLsKey());
        if(!_chk||_chk.length<10)throw new Error('empty-after-write');
        _lsSaveWarned=false;
    }catch(e){
        /* فشل الحفظ المحلي = خطر فقدان العمليات عند إعادة التحميل */
        try{
            /* حرّر مساحة: احذف مؤقتات Firebase ثم أعد المحاولة مرة واحدة */
            for(let i=localStorage.length-1;i>=0;i--){
                const k=localStorage.key(i);
                if(k&&k.indexOf('firebase')>=0)localStorage.removeItem(k);
            }
            _lsSet(_getEvLsKey(),_allEvents);
            const _c2=localStorage.getItem((window.__GP_NS||'')+_getEvLsKey());
            if(_c2&&_c2.length>10){_lsSaveWarned=false;return;}
        }catch(_){}
        /* الزبون لا يكتب عمليات — لا معنى لتحذيره عن فقدان الحفظ */
        if(!_lsSaveWarned&&window._roleLock!=='customer'){
            _lsSaveWarned=true;
            const m='⚠️ تعذّر حفظ العمليات على هذا الجهاز (المساحة ممتلئة).\n\n'
                +'خطر: قد تضيع العمليات عند إعادة تحميل التطبيق.\n\n'
                +'لا تُعِد تحميل الصفحة قبل أن تصير شارة المزامنة خضراء.';
            try{ if(typeof appAlert==='function')appAlert(m); else alert(m); }catch(_){}
        }
    }
}
function _lsLoadEvents(){
    try{
        const stored=_lsGet(_getEvLsKey());
        if(Array.isArray(stored))_allEvents=stored;
    }catch(e){}
}

/* ═══════════ PICK BARS (خالص — لا تعديل للحالة) ═══════════ */
function _pickBarsToRemove(pool,weight){
    if(pool==='24'){
        /* مخزون 24 سائل: لا قوائم سبائك في الحدث — فقط الكمية الخارجة.
           المُسقط يستنزفها تسلسلياً وقت البناء (آمن للحذف بالبناء). */
        const phys=g24.reduce((s,b)=>s+(b.w||0),0);
        const covered=Math.min(weight,phys);
        return {barsRemove:[],barUpdates:[],out24:parseFloat(covered.toFixed(4)),
                shortfall:Math.max(0,parseFloat((weight-covered).toFixed(4)))};
    }
    const bars=g730;
    const result={barsRemove:[],barUpdates:[]};
    let rem=weight;
    for(let i=bars.length-1;i>=0&&rem>0.001;i--){
        const bar=bars[i];
        if(bar.w<=rem+0.001){
            result.barsRemove.push(bar.id);
            rem-=bar.w;
        }else{
            result.barUpdates.push({id:bar.id,pool,prevW:bar.w,newW:parseFloat((bar.w-rem).toFixed(4))});
            rem=0;
        }
    }
    result.shortfall=Math.max(0,parseFloat(rem.toFixed(4)));
    return result;
}

/* ═══════════ APPLY EVENT (مُطبِّق الأحداث على حالة st) ═══════════ */
function _applyEvt(st,evt){
    const d=evt.data||{};
    const disp=evt.display||{};

    /* خصم سائل من مخزون 24: يُستنزف من السبائك تسلسلياً (الأقدم أولاً) وقت البناء.
       لا أوزان مطلقة في الحدث → حذف أي حدث يعيد أثره تلقائياً. العجز → vg24. */
    function _drain24(w){
        let rem=+w||0; if(rem<=0)return;
        for(const b of st.g24){
            if(rem<=0.0001)break;
            const take=Math.min(b.w,rem);
            b.w=parseFloat((b.w-take).toFixed(4)); rem=parseFloat((rem-take).toFixed(4));
        }
        st.g24=st.g24.filter(b=>b.w>0.0005);
        if(rem>0.0001)st.B.vg24=Math.max(0,parseFloat(((st.B.vg24||0)-rem).toFixed(4)));
    }
    function applyBars(){
        if(d.out24!=null)_drain24(d.out24);   /* النمط السائل الجديد لمخزون 24 */
        if(d.barsRemove&&d.barsRemove.length){
            const ids=new Set(d.barsRemove);
            st.g730=st.g730.filter(b=>!ids.has(b.id));
            st.g24=st.g24.filter(b=>!ids.has(b.id));
        }
        if(d.barUpdates&&d.barUpdates.length){
            d.barUpdates.forEach(upd=>{
                const bar=st.g730.find(b=>b.id===upd.id)||st.g24.find(b=>b.id===upd.id);
                if(bar){ if(upd.prevW!=null){ bar.w=parseFloat((bar.w-(upd.prevW-upd.newW)).toFixed(4)); } else { bar.w=upd.newW; } }
            });
        }
        if(d.barsAdd&&d.barsAdd.length){
            d.barsAdd.forEach(bar=>{
                const meta=disp.bars&&disp.bars[bar.id];
                const nb={...bar,desc:meta?.desc||'',dt:meta?.dt||'',src:meta?.src||'',_ts:evt.ts};
                if(bar.pool==='24')st.g24.push(nb);else st.g730.push(nb);
            });
        }
        /* حقول خاصة بالرافيناج */
        if(d.barsRemove730&&d.barsRemove730.length){
            const ids=new Set(d.barsRemove730);
            st.g730=st.g730.filter(b=>!ids.has(b.id));
        }
        if(d.barUpdates730&&d.barUpdates730.length){
            d.barUpdates730.forEach(upd=>{
                const bar=st.g730.find(b=>b.id===upd.id);
                if(bar){ if(upd.prevW!=null){ bar.w=parseFloat((bar.w-(upd.prevW-upd.newW)).toFixed(4)); } else { bar.w=upd.newW; } }
            });
        }
        if(d.barsAdd24&&d.barsAdd24.length){
            d.barsAdd24.forEach(bar=>{
                const meta=disp.bars&&disp.bars[bar.id];
                const nb={...bar,desc:meta?.desc||'',dt:meta?.dt||'',src:meta?.src||'',_ts:evt.ts};
                st.g24.push(nb);
            });
        }
    }

    function stUpdDebt(c,m,a){
        const x=st.debts.find(dd=>dd.c===c&&dd.type===m);
        if(x){
            x.a+=a;
            if(Math.abs(x.a)<0.001)st.debts=st.debts.filter(dd=>dd!==x);
        }else if(Math.abs(a)>0.001){
            st.debts.push({c,type:m,a});
        }
    }
    function stClearDebt(c,m){
        st.debts=st.debts.filter(dd=>!(dd.c===c&&dd.type===m));
    }

    /* تسجيل العملية في السجل */
    if(disp.op){
        let _op={...disp.op,id:evt.id};
        /* تصحيح رجعي شامل: أي عملية معها فاتورة/وصل ولا تحمل رابطه → اربطه من الحدث نفسه.
           يشمل وصولات قبض 730 القديمة (GT / SETTLE_730_REC) فيفتحها الزبون بالنقر. */
        if(!_op.iid&&disp.invoice&&disp.invoice.id)_op.iid=disp.invoice.id;
        else if(!_op.iid&&evt.type==='GT'&&d.gtType==='take'&&d.m==='ذهب 730'&&(d.realW>0||d.finalAmount>0))_op.iid='INV-'+evt.id;
        if(!_op.rid&&disp.rafInvoice&&disp.rafInvoice.id)_op.rid=disp.rafInvoice.id;
        if(!_op.did&&disp.dollInvoice&&disp.dollInvoice.id)_op.did=disp.dollInvoice.id;
        /* تصحيح رجعي: أحداث SETTLE_GSM القديمة لم تحمل تفاصيل البيع في op — نبنيها من data */
        if(evt.type==='SETTLE_GSM'&&d.ppg&&!_op.ppg){
            const _isBuy=d.freeBuy?true:!!d.isBuy;
            _op.t=d.freeBuy?'شراء':(_isBuy?'شراء بسعر':'بيع بسعر');
            _op.cashSettle=true; _op.ppg=d.ppg; _op.eqW=d.w;
            _op.cashVal=Math.abs(Math.round((d.w*((d.k||730)/730))*d.ppg));
            _op.paid=!!d.paid;
            if(Math.abs(d.remaining||0)>0.001)_op.partial=true;
        }
        st.ops.push(_op);
    }

    switch(evt.type){

        case 'INV_FIX':{
            /* تصحيح مخزون: يكتب في st مباشرة — دون المساس بأي زبون/دين.
               موجب = إضافة سبيكة؛ سالب (لمخزون 24 السائل فقط) = خصم من المجموع. */
            if(d.w>0){
                const bar={id:'FIX-'+evt.id,w:d.w,k:d.k||(d.pool==='24'?1000:730),
                    desc:'تصحيح مخزون',dt:(disp&&disp.op&&disp.op.dt)||'',src:'تصحيح',_ts:evt.ts};
                if(d.pool==='24')st.g24.push(bar);else st.g730.push(bar);
            }else if(d.w<0 && d.pool==='24'){
                _drain24(Math.abs(d.w));   /* خصم سائل من باقي لانقو */
            }
            break;
        }
        case 'DEBT_FIX':{
            /* تصحيح رصيد: يضبط رصيد النوع للقيمة المستهدفة (موجب=لنا، سالب=علينا) — بلا مساس بالسيولة/المخزون */
            stClearDebt(d.c,d.type);
            if(Math.abs(d.target||0)>0.0001)stUpdDebt(d.c,d.type,d.target);
            break;
        }
        case 'TARBAH_ADD':{
            if(!st.tarbah)st.tarbah=[];
            /* حصانة ازدواج: نفس هوية القيد لا تُضاف مرتين (هجرة من جهازين مثلاً) */
            if(d.entry&&!st.tarbah.some(x=>x&&x.id===d.entry.id))st.tarbah.unshift(d.entry);
            break;
        }
        case 'TARBAH_DEL':{
            if(st.tarbah)st.tarbah=st.tarbah.filter(x=>x.id!==d.id);
            break;
        }
        case 'CUST_RENAME':{
            /* تصحيح اسم زبون في دفتر الديون: تُنقل كل أرصدته للاسم الجديد (وتُدمج إن وُجد) */
            const olds=st.debts.filter(x=>x.c===d.from);
            olds.forEach(x=>stUpdDebt(d.to,x.type,x.a));
            st.debts=st.debts.filter(x=>x.c!==d.from);
            break;
        }
        case 'OPENING':{
            if(d.dinar>0)st.B.دينار+=d.dinar;
            if(d.dollar>0)st.B.دولار+=d.dollar;
            applyBars();
            /* سبائك افتتاحية داخل الورشتين (src730: تعود لمخزون 730 عند الإرجاع) */
            (d.wsBarsAdd||[]).forEach(b=>{
                if(!st.wsBars[b.ws])st.wsBars[b.ws]=[];
                st.wsBars[b.ws].push({id:b.id,w:b.w,k:b.k,src730:true,desc:'رصيد افتتاحي',srcTag:'افتتاحي'});
            });
            (d.debtRows||[]).forEach(r=>{
                const sign=r.dir==='لنا'?1:-1;
                stUpdDebt(r.c,r.type,sign*r.amt);
            });
            break;
        }

        case 'GT':{
            if(d.gtType==='give'){
                applyBars();
                if(d.m!=='ذهب 730'&&d.m!=='ذهب 24')st.B[d.m]=(st.B[d.m]||0)-d.finalAmount;
                /* تسليم 24: ما لم تغطّه السبائك الفيزيائية يُخصم من الافتراضي vg24 */
                if(d.m==='ذهب 24'&&(d.v24Out||0)>0)st.B.vg24=Math.max(0,(st.B.vg24||0)-d.v24Out);
                stUpdDebt(d.c,d.m,d.finalAmount);
            }else{
                applyBars();
                if(d.m!=='ذهب 730'&&d.m!=='ذهب 24')st.B[d.m]=(st.B[d.m]||0)+d.finalAmount;
                stUpdDebt(d.c,d.m,-d.finalAmount);
            }
            /* فاتورة وصل القبض (v141) — كانت تُبثّ ولا تُلتقط هنا */
            if(disp.invoice)st.invoices.unshift(disp.invoice);
            else if(d.gtType==='take'&&d.m==='ذهب 730'&&(d.realW>0||d.finalAmount>0)){
                /* توليد رجعي: قبضات 730 قديمة سُجّلت قبل ميزة الوصل — نبني وصلها من data */
                const _bl=(disp.op&&disp.op.barsList&&disp.op.barsList.length)
                    ? disp.op.barsList
                    : [{w:d.realW||d.finalAmount,k:d.realK||730}];
                st.invoices.unshift({id:'INV-'+evt.id,c:d.c,t:'buy',recv:true,ps:'full',
                    dt:(disp.op&&disp.op.dt)||'',
                    items:_bl.map(b=>({w:b.w,k:b.k,is1000:false,price:0,total:0})),
                    tp:0,akhd:0,prevBal:0});
            }
            break;
        }

        case 'DOLLAR':{
            if(d.isBuy){
                if(d.party)stUpdDebt(d.party,'دولار',d.a);else st.B.دولار+=d.a;
                if(d.paid)st.B.دينار-=d.dinarVal;else stUpdDebt(d.c,'دينار',-d.dinarVal);
            }else{
                if(d.paid){
                    if(d.party)stUpdDebt(d.party,'دولار',-d.a);else st.B.دولار-=d.a;
                    st.B.دينار+=d.dinarVal;
                }else{
                    if(d.party)stUpdDebt(d.party,'دولار',-d.a);else st.B.دولار-=d.a;
                    stUpdDebt(d.c,'دينار',d.dinarVal);
                }
            }
            if(disp.dollInvoice)st.dollInvoices.unshift(disp.dollInvoice);
            /* سطر سجل للطرف (من أخذه/المسلم) كي تظهر العملية في سجلّه أيضاً */
            if(d.party){
                st.ops.push({
                    c:d.party, t:d.isBuy?'دولار وارد':'دولار صادر', m:'دولار', a:d.a,
                    _ts:(disp.op&&disp.op._ts)||evt.ts||Date.now(),
                    dt:(disp.op&&disp.op.dt)||'',
                    dollFrom:d.c, dr:d.r, id:evt.id+'_pty'
                });
            }
            break;
        }

        case 'SHIP':{
            applyBars();
            stUpdDebt(d.o,'ذهب 24',d.rc);
            /* ثمن الشحن ($/غ × المكرر) يُقيَّد ديناً بالدولار لحساب «شحن» */
            if(d.su>0)stUpdDebt('شحن','دولار',-(d.rc*d.su));
            else if(d.p>0)stUpdDebt('شحن','دولار',-(d.rc*d.p));   /* قيود قديمة قبل v188 */
            break;
        }

        case 'EXPENSE':{
            if(d.cur==='دولار')stUpdDebt(d.cust,'دولار',-d.a);   // علينا للزبون (نحن مدينون له)
            else st.B.دينار-=d.a;
            break;
        }

        case 'DUBAI':{
            if(d.fromDebt>0.001)stUpdDebt(d.o,'ذهب 24',-d.fromDebt);
            applyBars();
            stUpdDebt(d.o,'دولار',d.usd);
            if(disp.dubaiInvoice)st.dubaiInvoices.unshift(disp.dubaiInvoice);
            break;
        }

        case 'DUBAI_RATE':{
            /* سعر دولار يدوي لفاتورة دبي (عرض/حساب فقط، لا يمسّ الأرصدة) */
            const inv=st.dubaiInvoices.find(x=>x.id===d.id);
            if(inv){ if(d.usdRate>0)inv.usdRate=d.usdRate; else delete inv.usdRate; }
            break;
        }

        case 'INVOICE_BUY':{
            applyBars();
            st.B.دينار-=d.akhd;
            const remB=d.tp-d.akhd;
            if(remB>0.001)stUpdDebt(d.c,'دينار',-remB);
            else if(remB<-0.001)stUpdDebt(d.c,'دينار',Math.abs(remB));
            if(disp.invoice)st.invoices.unshift(disp.invoice);
            break;
        }

        case 'INVOICE_SELL':{
            applyBars();   /* يخصم out24 تلقائياً لعيار 1000 (بيع يدوي) */
            st.B.دينار+=d.akhd;
            const remS=d.tp-d.akhd;
            if(remS>0.001)stUpdDebt(d.c,'دينار',remS);
            if(disp.invoice)st.invoices.unshift(disp.invoice);
            break;
        }

        case 'RAF':{
            /* حركة المخزون المشتركة */
            if(d.barsRemove730&&d.barsRemove730.length){const ids=new Set(d.barsRemove730);st.g730=st.g730.filter(b=>!ids.has(b.id));}
            if(d.barUpdates730&&d.barUpdates730.length){d.barUpdates730.forEach(upd=>{const bar=st.g730.find(b=>b.id===upd.id);if(bar){ if(upd.prevW!=null){ bar.w=parseFloat((bar.w-(upd.prevW-upd.newW)).toFixed(4)); } else { bar.w=upd.newW; } }});}
            if(d.barsAdd24&&d.barsAdd24.length){d.barsAdd24.forEach(bar=>{const meta=disp.bars&&disp.bars[bar.id];st.g24.push({...bar,desc:meta?.desc||'رافيناج',dt:meta?.dt||'',src:meta?.src||'رافيناج',_ts:evt.ts});});}
            /* حركة مخزون خاصة بفرع الزبون */
            if(d.barsAdd730&&d.barsAdd730.length){d.barsAdd730.forEach(bar=>{const meta=disp.bars&&disp.bars[bar.id];st.g730.push({...bar,desc:meta?.desc||'رافيناج - كسر زبون',dt:meta?.dt||'',src:meta?.src||'رافيناج',_ts:evt.ts});});}
            if(d.barsRemove24&&d.barsRemove24.length){const ids=new Set(d.barsRemove24);st.g24=st.g24.filter(b=>!ids.has(b.id));}
            if(d.barUpdates24&&d.barUpdates24.length){d.barUpdates24.forEach(upd=>{const bar=st.g24.find(b=>b.id===upd.id);if(bar){ if(upd.prevW!=null){ bar.w=parseFloat((bar.w-(upd.prevW-upd.newW)).toFixed(4)); } else { bar.w=upd.newW; } }});}
            if(d.out24!=null)_drain24(d.out24);   /* دفع لانقو بالنمط السائل من مخزون 24 */
            /* جزء الدفع من ذهب البيع الافتراضي (vg24) — عندما لا تكفي السبائك الفيزيائية */
            if((d.v24Out||0)>0)st.B.vg24=Math.max(0,(st.B.vg24||0)-d.v24Out);

            if(d.mode==='customer'){
                /* ── فرع الزبون: كسره دخل مخزون 730 (barsAdd730) ── */
                if(d.settled){
                    /* خالصة: خرج مكافئ 24 من الكوفر، والأجرة تدخل السيولة
                       (عند تعديل خالصة: النقد الداخل = أجرة التسوية الأصلية settleCashIn) */
                    const _cin=(d.settleCashIn!=null?d.settleCashIn:d.fee);
                    if(_cin>0)st.B.دينار+=_cin;
                }else{
                    /* غير خالصة: علينا مكافئ 24 (سالب) وله علينا... معكوس عثمان:
                       صوارد = دفع لنا نقداً الآن (سيولة+ ، ينقص دين أجرته)
                       لانقو = أعطيناه ذهباً من كوفر24 الآن (barsRemove24 أعلاه، ينقص دين الذهب علينا) */
                    if((d.sawared||0)>0)st.B.دينار+=d.sawared;
                    stUpdDebt(d.c,'ذهب 24',-(d.eq24-(d.lanqo||0)));
                    const _netFee=(d.fee||0)-(d.sawared||0);
                    if(Math.abs(_netFee)>0.001)stUpdDebt(d.c,'دينار',_netFee);
                }
            }else{
                /* ── فرع عثمان/المصفّي: السلوك الأصلي (توافق مع الأحداث القديمة) ── */
                stUpdDebt(d.c,'ذهب 24',d.eq24-d.lanqo);
                if(d.fee>0)stUpdDebt(d.c,'دينار',-d.fee);
                if(d.sawared>0){
                    stUpdDebt(d.c,'دينار',d.sawared);
                    st.B.دينار-=d.sawared;   /* دفعناها نقداً — تخرج من السيولة (كان التسريب هنا) */
                }
            }
            /* فروقات تعديل فاتورة خالصة → دفتر الديون */
            (d.debtAdj||[]).forEach(adj=>{ if(Math.abs(adj.delta||0)>0.0001) stUpdDebt(adj.c,adj.type,adj.delta); });
            if(disp.rafInvoice)st.rafInvoices.unshift(disp.rafInvoice);
            break;
        }
        case 'RAF_EDIT':{
            /* تعديل فاتورة زبون بأسلوب rafinag: نفس السبيكة تُحدَّث في مكانها
               (كوفر أو ورشة) + قيد فرق في الديون + ترقيع الفاتورة ذاتها.
               إن حُذفت الفاتورة الأصلية (VOID) يسقط هذا التعديل كاملاً. */
            const inv=st.rafInvoices.find(x=>x.id===d.rid);
            if(!inv)break;
            (d.barUpdates730||[]).forEach(u=>{
                let b=st.g730.find(x=>x.id===u.id);
                if(!b){for(const w of Object.keys(st.wsBars)){b=(st.wsBars[w]||[]).find(x=>x.id===u.id);if(b)break;}}
                if(b){ if(u.prevW!=null){b.w=parseFloat((b.w-(u.prevW-u.newW)).toFixed(4));} else {b.w=u.newW;} if(u.newK!=null)b.k=u.newK; }
            });
            (d.barsAdd730New||[]).forEach(b=>st.g730.push({...b,desc:'رافيناج - كسر زبون (تعديل)',src:'رافيناج',_ts:evt.ts}));
            if(d.barsRemove730&&d.barsRemove730.length){
                const ids=new Set(d.barsRemove730);
                st.g730=st.g730.filter(b=>!ids.has(b.id));
                Object.keys(st.wsBars).forEach(w=>{st.wsBars[w]=(st.wsBars[w]||[]).filter(b=>!ids.has(b.id));});
            }
            if((d.v24Out||0)>0)st.B.vg24=Math.max(0,(st.B.vg24||0)-d.v24Out);
            if(d.mode==='refiner'){
                /* عثمان: الخالص لنا (+) والأجرة علينا (−) — نقيّد الفروقات */
                const dG=(d.newEq24||0)-(d.oldEq24||0);
                const dF=(d.newFee ||0)-(d.oldFee ||0);
                if(Math.abs(dG)>0.0001)stUpdDebt(d.c,'ذهب 24', dG);
                if(Math.abs(dF)>0.001) stUpdDebt(d.c,'دينار', -dF);
            }
            else if(d.mode==='customer'){
                const sF=!!d.settledFrom, sT=!!d.settledTo;
                if(sF===sT){
                    const dG=(d.newEq24||0)-(d.oldEq24||0);
                    const dF=(d.newFee ||0)-(d.oldFee ||0);
                    /* نفس الحالة: قيد الفرق فقط.
                       ⚠️ لا تُغيَّر هذه الدلالة أبداً: تصحيح فاتورة (خالصة أو دين) يُقيَّد فرقُه
                       في دفتر الديون ليُصفَّى بعملية مستقلة. تغييرها بأثر رجعي يُبطل التصفيات
                       التي سُجّلت بعدها فيعود الرصيد القديم للظهور (خطأ v278–v280). */
                    if(Math.abs(dG)>0.0001)stUpdDebt(d.c,'ذهب 24',-dG);
                    if(Math.abs(dF)>0.0001)stUpdDebt(d.c,'دينار', dF);
                }else if(sF&&!sT){
                    /* خالصة → دين: التسوية سُجّلت خطأً — اعكس المادي وافتح الدين بالجديد */
                    if((d.oldEq24||0)>0.0001)st.g24.push({id:d.restoreBarId||('RB-'+evt.id),w:d.oldEq24,k:1000,desc:'استرجاع تصفية (تحويل لدين)',src:'رافيناج',_ts:evt.ts});
                    st.B.دينار-=(d.oldFee||0);
                    stUpdDebt(d.c,'ذهب 24',-(d.newEq24||0));
                    stUpdDebt(d.c,'دينار', (d.newFee||0));
                }else{
                    /* دين → خالصة: أغلق الدين القديم ونفّذ التسوية بالجديد */
                    if(d.barsRemove24&&d.barsRemove24.length){const ids=new Set(d.barsRemove24);st.g24=st.g24.filter(b=>!ids.has(b.id));}
                    if(d.barUpdates24&&d.barUpdates24.length){d.barUpdates24.forEach(u=>{const b=st.g24.find(x=>x.id===u.id);if(b)b.w=u.newW;});}
                    st.B.دينار+=(d.newFee||0);
                    stUpdDebt(d.c,'ذهب 24', (d.oldEq24||0));
                    stUpdDebt(d.c,'دينار',-(d.oldFee||0));
                }
            }
            if(disp.rafPatch)Object.assign(inv,disp.rafPatch);
            break;
        }
        case 'WS_BARADD':{
            if(!st.wsBars[d.ws])st.wsBars[d.ws]=[];
            st.wsBars[d.ws].push({id:d.id,w:d.w,k:d.k,src730:!!d.src730,_ts:evt.ts});
            break;
        }
        case 'WS_XFER':{
            /* تحويل سبيكة من مخزون 730 إلى الورشة — تخرج من 730 فوراً */
            const bar=st.g730.find(b=>b.id===d.barId);
            if(bar){
                st.g730=st.g730.filter(b=>b.id!==d.barId);
                if(!st.wsBars[d.ws])st.wsBars[d.ws]=[];
                st.wsBars[d.ws].push({id:d.barId,w:bar.w,k:bar.k||730,src730:true,
                    desc:bar.desc||'',srcTag:bar.src||'',_ts:evt.ts});
            }
            break;
        }
        case 'WS_XFER_BULK':{
            /* تحويل دفعة سبائك من مخزون 730 إلى الورشة — حدث واحد قابل للتراجع */
            (d.barIds||[]).forEach(bid=>{
                const bar=st.g730.find(b=>b.id===bid);
                if(bar){
                    st.g730=st.g730.filter(b=>b.id!==bid);
                    if(!st.wsBars[d.ws])st.wsBars[d.ws]=[];
                    st.wsBars[d.ws].push({id:bid,w:bar.w,k:bar.k||730,src730:true,desc:bar.desc||'',srcTag:bar.src||'',_ts:evt.ts});
                }
            });
            break;
        }
        case 'WS_RETURN':{
            /* إرجاع سبيكة محوَّلة من الورشة إلى مخزون 730 */
            const wsb=(st.wsBars[d.ws]||[]).find(b=>b.id===d.barId);
            if(wsb){
                st.wsBars[d.ws]=st.wsBars[d.ws].filter(b=>b.id!==d.barId);
                st.g730.push({id:wsb.id,w:wsb.w,k:wsb.k||730,desc:'مرتجع من '+(d.wsName||'الورشة'),dt:'',src:'ورشة',_ts:evt.ts});
            }
            break;
        }
        case 'WS_BARDEL':{
            if(st.wsBars[d.ws])st.wsBars[d.ws]=st.wsBars[d.ws].filter(b=>b.id!==d.id);
            break;
        }
        case 'WS_PROVISIONAL':{
            /* سلعة مبدئية: تدخل مخزون 24 فوراً (قبل حفظ الحساب) — تُلغى عند الحفظ النهائي */
            if(d.barsAdd24&&d.barsAdd24.length){d.barsAdd24.forEach(bar=>{const meta=disp.bars&&disp.bars[bar.id];st.g24.push({...bar,desc:meta?.desc||'سلعة مبدئية (ورشة)',dt:meta?.dt||'',src:meta?.src||'مبدئي',_prov:true,_provWs:d.ws,_ts:evt.ts});});}
            break;
        }
        case 'WS_PROVISIONAL_DEL':{
            /* إلغاء سلعة مبدئية (يدوياً أو عند الحفظ النهائي) */
            if(d.provIds&&d.provIds.length){const ps=new Set(d.provIds);st.g24=st.g24.filter(b=>!ps.has(b.id));}
            else if(d.ws){ st.g24=st.g24.filter(b=>!(b._prov&&b._provWs===d.ws)); }   /* كل مبدئيات هذه الورشة */
            break;
        }
        case 'WS_SESSION':{
            /* أولاً: ألغِ أي سلعة مبدئية لهذه الورشة (لمنع الازدواج) */
            st.g24=st.g24.filter(b=>!(b._prov&&b._provWs===d.ws));
            /* حركة المخزون: سبائك الجلسة تخرج من 730، والسلعة الواجدة تدخل 24 */
            if(d.barsRemove730&&d.barsRemove730.length){const ids=new Set(d.barsRemove730);st.g730=st.g730.filter(b=>!ids.has(b.id));}
            if(d.barUpdates730&&d.barUpdates730.length){d.barUpdates730.forEach(upd=>{const bar=st.g730.find(b=>b.id===upd.id);if(bar){ if(upd.prevW!=null){ bar.w=parseFloat((bar.w-(upd.prevW-upd.newW)).toFixed(4)); } else { bar.w=upd.newW; } }});}
            if(d.barsAdd24&&d.barsAdd24.length){d.barsAdd24.forEach(bar=>{const meta=disp.bars&&disp.bars[bar.id];st.g24.push({...bar,desc:meta?.desc||'ورشة - سلعة واجدة',dt:meta?.dt||'',src:meta?.src||'ورشة',_ts:evt.ts});});}
            /* الروتور: سبائك 730 ناتجة تعود لمخزون الـ730 */
            if(d.barsAdd730&&d.barsAdd730.length){d.barsAdd730.forEach(bar=>{const meta=disp.bars&&disp.bars[bar.id];st.g730.push({...bar,desc:meta?.desc||'روتور ورشة',dt:meta?.dt||'',src:meta?.src||'روتور',_ts:evt.ts});});}
            /* الدفعة استُهلكت — أزِل السبائك المستهلكة بمعرّفاتها (لا تفريغ أعمى) */
            if(d.consumedBarIds&&d.consumedBarIds.length){
                const cs=new Set(d.consumedBarIds);
                st.wsBars[d.ws]=(st.wsBars[d.ws]||[]).filter(b=>!cs.has(b.id));
            }else if(d.clearBars){st.wsBars[d.ws]=[];}   /* توافق مع جلسات قديمة */
            if(!st.wsSessions[d.ws])st.wsSessions[d.ws]=[];
            st.wsSessions[d.ws].unshift(d.session);
            break;
        }
        case 'WS_SESSIONDEL':{
            if(st.wsSessions[d.ws])st.wsSessions[d.ws]=st.wsSessions[d.ws].filter(s=>s.id!==d.id);
            break;
        }
        case 'WS_WBARADD':{
            if(!st.wsWorkerBars[d.ws])st.wsWorkerBars[d.ws]=[];
            st.wsWorkerBars[d.ws].push({id:d.id,w:d.w,k:d.k,_ts:evt.ts});
            break;
        }
        case 'WS_WBAREDIT':{
            /* تعديل سبيكة العامل (وزن/عيار) في مكانها */
            const wb=(st.wsWorkerBars[d.ws]||[]).find(b=>b.id===d.id);
            if(wb){ if(d.w>0)wb.w=d.w; if(d.k>0)wb.k=d.k; }
            break;
        }
        case 'WS_WBARDEL':{
            if(st.wsWorkerBars[d.ws])st.wsWorkerBars[d.ws]=st.wsWorkerBars[d.ws].filter(b=>b.id!==d.id);
            break;
        }
        case 'WS_WSESSION':{
            /* جلسة العامل: أرشيفية فقط — لا تمسّ المخزون إطلاقاً */
            if(d.consumedBarIds&&d.consumedBarIds.length){
                const cs=new Set(d.consumedBarIds);
                st.wsWorkerBars[d.ws]=(st.wsWorkerBars[d.ws]||[]).filter(b=>!cs.has(b.id));
            }else if(d.clearBars){st.wsWorkerBars[d.ws]=[];}
            if(!st.wsWorkerSessions[d.ws])st.wsWorkerSessions[d.ws]=[];
            st.wsWorkerSessions[d.ws].unshift(d.session);
            break;
        }
        case 'WS_WSESSIONDEL':{
            if(st.wsWorkerSessions[d.ws])st.wsWorkerSessions[d.ws]=st.wsWorkerSessions[d.ws].filter(s=>s.id!==d.id);
            break;
        }

        case 'SETTLE':{
            const {c,type,net}=d;
            if(type==='دينار')st.B.دينار+=net;
            else if(type==='دولار')st.B.دولار+=net;
            else if(type==='ذهب 730'){
                if(net<0)st.B.vg730=(st.B.vg730||0)+Math.abs(net);
                else applyBars();
            }else if(type==='ذهب 24'){
                if(net<0)st.B.vg24=(st.B.vg24||0)+Math.abs(net);
                else applyBars();
            }
            stClearDebt(c,type);
            break;
        }

        case 'SETTLE_GSM':{
            const {c,type,net,isBuy,cashTotal,remaining}=d;
            /* خالص: النقد يُدفع/يُقبض فوراً من السيولة — لا قيد دينار */
            const _cashFn=d.paid
                ?(v=>{st.B.دينار+=v;})
                :(v=>{stUpdDebt(c,'دينار',v);});
            if(d.freeSell){
                /* بيع حرّ: مرآة الشراء الحر تماماً — أنت تدين للزبون بالذهب (−)،
                   والزبون يدين لك بالنقد (+ عبر cashTotal). لا يمسّ المخزون إطلاقاً. */
                stUpdDebt(c,type,-d.w);
                _cashFn(cashTotal);
            }else if(d.freeBuy){
                /* شراء حرّ: الزبون مدين لك بالذهب (+) ، والنقد بحسب خالص/غير خالص */
                stUpdDebt(c,type,d.w);
                _cashFn(cashTotal);
            }else{
                if(!isBuy)applyBars();
                stClearDebt(c,type);
                if(Math.abs(remaining)>0.001)stUpdDebt(c,type,net>0?remaining:-remaining);
                _cashFn(cashTotal);
            }
            if(disp.invoice)st.invoices.unshift(disp.invoice);
            break;
        }

        case 'SETTLE_730_24':{
            const {c,partial,net,remaining}=d;
            applyBars();
            stClearDebt(c,'ذهب 730');
            if(remaining>0.001)stUpdDebt(c,'ذهب 730',net>0?remaining:-remaining);
            break;
        }

        case 'SETTLE_24_INV':{
            const {c,net,remaining}=d;
            applyBars();
            if((d.v24Out||0)>0)st.B.vg24=Math.max(0,(st.B.vg24||0)-d.v24Out);
            stClearDebt(c,'ذهب 24');
            if(remaining>0.001)stUpdDebt(c,'ذهب 24',net>0?remaining:-remaining);
            break;
        }

        case 'SETTLE_730_REC':{
            const {c,net,remaining}=d;
            applyBars();
            stClearDebt(c,'ذهب 730');
            if(remaining>0.001)stUpdDebt(c,'ذهب 730',remaining);
            if(disp.invoice)st.invoices.unshift(disp.invoice);   /* وصل القبض يظهر للزبون */
            break;
        }

        case 'BAR_ADD':
        case 'BAR_REMOVE':{
            applyBars();
            break;
        }

        case 'LOAN':{
            applyBars();
            const lm=d.bt==='24'?'ذهب 24':'ذهب 730';
            if(d.loanEntry)st.loans.push(d.loanEntry);
            /* الدين بمكافئ 730 (d.eq) — والقيود القديمة بلا eq تبقى كما سُجّلت (خام) */
            stUpdDebt(d.c,lm,(d.eq!=null?d.eq:d.w));
            break;
        }

        case 'SELL':{
            applyBars();
            if(d.paid)st.B.دينار+=d.total;
            else stUpdDebt(d.c,'دينار',d.total);
            if(disp.invoice)st.invoices.unshift(disp.invoice);
            break;
        }

        case 'XFER':{
            /* تحويل رصيد ذهب من حساب زبون إلى آخر — لا يمسّ المخزون إطلاقاً */
            stUpdDebt(d.from, d.srcType, -d.srcDelta);   // إنقاص من حساب المصدر
            stUpdDebt(d.to,   d.dstType,  d.dstDelta);   // إضافة لحساب الهدف (بنفس الاتجاه)
            /* رسوم التحويل الخاصة (بإشارة GoldPro: المُحوِّل ندين له = −، المستلِم يدين لنا = +) */
            if(d.feeFrom>0)stUpdDebt(d.from,'دينار',-d.feeFrom);
            if(d.feeTo>0)  stUpdDebt(d.to,  'دينار', d.feeTo);
            /* أجرة التحويل النوعي 24→730 على نفس الزبون: يدين لنا (+) */
            if(d.convFee>0)stUpdDebt(d.from,'دينار', d.convFee);
            /* سطر سجل للهدف (تحويل وارد) كي يظهر في كشف حسابه أيضاً.
               استثناء: التحويل النوعي داخل حساب الزبون نفسه (730 ⇄ 24) — سطر واحد يكفي
               لأنه يعرض الطرفين معاً، وإضافة سطر ثانٍ تبدو تكراراً في سجله. */
            const _nrm=s=>String(s||'').trim().toLowerCase();
            const _selfXfer=_nrm(d.from)===_nrm(d.to);
            if(!_selfXfer){
                st.ops.push({
                    c: d.to, t:'تحويل وارد', m: d.dstType, a: (d.wDst!=null?d.wDst:d.w),
                    _ts:(disp.op&&disp.op._ts)||evt.ts||Date.now(),
                    dt:(disp.op&&disp.op.dt)||'',
                    xferFrom: d.from, xferInType: d.dstType,
                    id: evt.id+'_in'
                });
            }
            break;
        }

        case 'HIST':{
            if(disp.invoice)st.invoices.unshift(disp.invoice);
            if(disp.dollInvoice)st.dollInvoices.unshift(disp.dollInvoice);
            if(disp.rafInvoice)st.rafInvoices.unshift(disp.rafInvoice);
            if(disp.dubaiInvoice)st.dubaiInvoices.unshift(disp.dubaiInvoice);
            if(d.loans)(d.loans).forEach(l=>st.loans.push(l));
            break;
        }
    }
}

/* ═══════════ REPROJECT — يُعيد بناء كامل الحالة من الأحداث ═══════════ */
/* رصيد زبون حتى طابع زمني معيّن — بإعادة إسقاط الأحداث الحقيقية حتى ذلك الوقت.
   يُستعمل للحساب التراكمي في سجل الزبون (يطابق getCustBal تماماً لأنه نفس المنطق). */
/* رصيد زبون (دينار) قبل فاتورة محدّدة — بحساب الأحداث حتى ما قبل حدث تلك الفاتورة.
   للفواتير القديمة التي حُفظت بـprevBal=0 خطأً، ليظهر مجموعها النهائي صحيحاً. */
window._custBalBeforeInv=function(cust,invId){
    if(!invId)return null;
    /* جد حدث هذه الفاتورة (iid يطابق invId) */
    const evt=_allEvents.find(e=>e&&e.data&&(e.data.iid===invId)&&e.type!=='VOID');
    if(!evt)return null;
    const beforeTs=(evt.ts||0)-1;   /* لحظة قبل الفاتورة */
    const bal=window._custBalUpToTs(cust,beforeTs);
    return bal?(bal['دينار']||0):0;
};

/* مصاريف شهر معيّن (مفتاح mk مثل '2026-08') — بالدينار والدولار منفصلين.
   تُقرأ من أحداث EXPENSE الحيّة (غير المُلغاة) عبر طابعها الزمني. */
window._monthExpenses=function(mk){
    let dz=0, usd=0;
    try{
        const vE=_allEvents.filter(e=>e.type==='VOID');
        const vT=new Set(vE.map(e=>e.data&&e.data.voids).filter(Boolean));
        const dead=new Set(vE.filter(e=>!vT.has(e.id)).map(e=>e.data&&e.data.voids).filter(Boolean));
        _allEvents.filter(e=>e.type==='EXPENSE'&&!dead.has(e.id)).forEach(e=>{
            const ts=e.ts||(e.display&&e.display.op&&e.display.op._ts)||0;
            if(!ts)return;
            const dd=new Date(ts);
            const k=dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0');
            if(k!==mk)return;
            const a=(e.data&&e.data.a)||0;
            if((e.data&&e.data.cur)==='دولار')usd+=a; else dz+=a;
        });
    }catch(e){}
    return {dz,usd};
};

window._custBalUpToTs=function(cust,uptoTs){
    const _vE=_allEvents.filter(e=>e.type==='VOID');
    const _vT=new Set(_vE.map(e=>e.data?.voids).filter(Boolean));
    const voidedIds=new Set(_vE.filter(e=>!_vT.has(e.id)).map(e=>e.data?.voids).filter(Boolean));
    const live=_allEvents
        .filter(e=>e.type!=='VOID'&&!voidedIds.has(e.id))
        .filter(e=>(e.ts||0)<=uptoTs)
        .sort((a,b)=>((a.ts||0)-(b.ts||0))||String(a.id).localeCompare(String(b.id)));
    const st={
        B:{دينار:0,دولار:0,'ذهب 730':0,'ذهب 24':0,vg730:0,vg24:0},
        g730:[],g24:[],debts:[],loans:[],
        ops:[],invoices:[],dollInvoices:[],rafInvoices:[],dubaiInvoices:[],
        wsBars:{workshop1:[],workshop2:[]},wsSessions:{workshop1:[],workshop2:[]},
        wsWorkerBars:{workshop1:[],workshop2:[]},wsWorkerSessions:{workshop1:[],workshop2:[]}
    };
    live.forEach(evt=>_applyEvt(st,evt));
    const _n=s=>String(s||'').trim().toLowerCase();
    const res={'دينار':0,'دولار':0,'ذهب 730':0,'ذهب 24':0};
    st.debts.forEach(d=>{ if(_n(d.c)===_n(cust)&&res[d.type]!=null)res[d.type]+=d.a; });
    return res;
};

function _reproject(){
    /* الإلغاءات الحية فقط: إلغاءٌ أُلغي (استرجاع من السلة) لا يُعتدّ به */
    const _vE=_allEvents.filter(e=>e.type==='VOID');
    const _vT=new Set(_vE.map(e=>e.data?.voids).filter(Boolean));
    const voidedIds=new Set(_vE.filter(e=>!_vT.has(e.id)).map(e=>e.data?.voids).filter(Boolean));
    const live=_allEvents
        .filter(e=>e.type!=='VOID'&&!voidedIds.has(e.id))
        .sort((a,b)=>((a.ts||0)-(b.ts||0))||String(a.id).localeCompare(String(b.id)));

    const st={
        B:{دينار:0,دولار:0,'ذهب 730':0,'ذهب 24':0,vg730:0,vg24:0},
        g730:[],g24:[],debts:[],loans:[],
        ops:[],invoices:[],dollInvoices:[],rafInvoices:[],dubaiInvoices:[],
        wsBars:{workshop1:[],workshop2:[]},wsSessions:{workshop1:[],workshop2:[]},
        wsWorkerBars:{workshop1:[],workshop2:[]},wsWorkerSessions:{workshop1:[],workshop2:[]}
    };
    live.forEach(evt=>_applyEvt(st,evt));

    B=st.B;
    g730=st.g730;g24=st.g24;
    debts=st.debts;loans=st.loans;
    ops=st.ops.sort((a,b)=>((b._ts||0)-(a._ts||0))||String(b.id||'').localeCompare(String(a.id||'')));
    invoices=st.invoices;
    dollInvoices=st.dollInvoices;
    rafInvoices=st.rafInvoices;
    dubaiInvoices=st.dubaiInvoices;
    wsBars=st.wsBars;wsSessions=st.wsSessions;
    wsWorkerBars=st.wsWorkerBars;wsWorkerSessions=st.wsWorkerSessions;
    window._tarbahList=st.tarbah||[];
    try{if(typeof _renderTarbahList==='function')_renderTarbahList();}catch(e){}

    syncBal();
    if(typeof updAll==='function')updAll();
    /* بوابة الزبون تعيش على الشاشة — أنعشها مع كل حدث وارد (تصحيح فاتورة، رصيد، قيد جديد...) */
    if(window._roleLock==='customer'&&typeof renderCustomerPortal==='function'){
        try{renderCustomerPortal();}catch(e){}
    }
}

/* ═══════════ تدقيق السيولة: دلتا كل حدث ورصيد جارٍ ═══════════ */
window.cashAudit=function(){
    /* الإلغاءات الحية فقط: إلغاءٌ أُلغي هو نفسه (استرجاع من السلة) لا يُعتدّ به */
    const _vE=_allEvents.filter(e=>e.type==='VOID');
    const _vTargets=new Set(_vE.map(e=>e.data?.voids).filter(Boolean));
    const voided=new Set(_vE.filter(e=>!_vTargets.has(e.id)).map(e=>e.data?.voids).filter(Boolean));
    const live=_allEvents.filter(e=>e.type!=='VOID'&&!voided.has(e.id))
        .sort((a,b)=>((a.ts||0)-(b.ts||0))||String(a.id).localeCompare(String(b.id)));
    const st={B:{'دينار':0,'دولار':0,'ذهب 730':0,'ذهب 24':0,vg730:0,vg24:0},
        g730:[],g24:[],debts:[],loans:[],ops:[],invoices:[],dollInvoices:[],rafInvoices:[],dubaiInvoices:[],
        wsBars:{workshop1:[],workshop2:[]},wsSessions:{workshop1:[],workshop2:[]},
        wsWorkerBars:{workshop1:[],workshop2:[]},wsWorkerSessions:{workshop1:[],workshop2:[]},tarbah:[]};
    const rows=[];
    live.forEach(e=>{
        const before=st.B.دينار;
        try{_applyEvt(st,e);}catch(_){}
        const delta=st.B.دينار-before;
        if(Math.abs(delta)>0.001){
            const op=(e.display&&e.display.op)||{};
            rows.push({dt:op.dt||new Date(e.ts||0).toLocaleDateString('fr-FR'),
                t:op.t||e.type,c:op.c||e.data?.c||'',delta,bal:st.B.دينار});
        }
    });
    return{rows,final:st.B.دينار};
};

window.g24Audit=function(){
    const _vE=_allEvents.filter(e=>e.type==='VOID');
    const _vT=new Set(_vE.map(e=>e.data?.voids).filter(Boolean));
    const voided=new Set(_vE.filter(e=>!_vT.has(e.id)).map(e=>e.data?.voids).filter(Boolean));
    const live=_allEvents.filter(e=>e.type!=='VOID'&&!voided.has(e.id))
        .sort((a,b)=>((a.ts||0)-(b.ts||0))||String(a.id).localeCompare(String(b.id)));
    const st={B:{'دينار':0,'دولار':0,'ذهب 730':0,'ذهب 24':0,vg730:0,vg24:0},
        g730:[],g24:[],debts:[],loans:[],ops:[],invoices:[],dollInvoices:[],rafInvoices:[],dubaiInvoices:[],
        wsBars:{workshop1:[],workshop2:[]},wsSessions:{workshop1:[],workshop2:[]},
        wsWorkerBars:{workshop1:[],workshop2:[]},wsWorkerSessions:{workshop1:[],workshop2:[]},tarbah:[]};
    const tot24=s=>{const phys=s.g24.reduce((a,b)=>a+(b.w||0),0);return phys+(s.B.vg24||0)+(s.B['ذهب 24']||0);};
    const rows=[];
    live.forEach(e=>{
        const before=tot24(st);
        try{_applyEvt(st,e);}catch(_){}
        const after=tot24(st);
        const delta=after-before;
        if(Math.abs(delta)>0.001){
            const op=(e.display&&e.display.op)||{};
            rows.push({dt:op.dt||new Date(e.ts||0).toLocaleDateString('fr-FR'),
                t:op.t||e.type,c:op.c||e.data?.c||'',delta,bal:after});
        }
    });
    return{rows,final:tot24(st)};
};

/* ═══════════ EMIT EVENT — الكتابة الوحيدة المسموح بها ═══════════ */
/* ═══════════ صندوق الصادر المشترك ═══════════
   مشكلة الجهاز الواحد بعدّة عمّال: كل مستخدم له مفتاح أحداث خاص، وطابور الرفع
   في الذاكرة فقط — فإن خرج العامل قبل عودة النت ضاعت جلسته ولم تصل للسحابة.
   الحل: صندوق صادر واحد لا يتبع مستخدماً؛ أي جلسة يعود لها النت ترفع ما فيه. */
const _OUTBOX='gp_outbox';
function _outboxRead(){
    try{ const r=localStorage.getItem(_OUTBOX); const a=r?JSON.parse(r):[]; return Array.isArray(a)?a:[]; }
    catch(e){ return []; }
}
function _outboxWrite(arr){
    try{ localStorage.setItem(_OUTBOX,JSON.stringify(arr||[])); }catch(e){}
}
function _outboxAdd(evt){
    try{
        const a=_outboxRead();
        if(a.some(e=>e&&e.id===evt.id))return;
        a.push(evt);
        if(a.length>400)a.splice(0,a.length-400);   /* حدّ أمان */
        _outboxWrite(a);
    }catch(e){}
}
function _outboxDrop(id){
    try{ _outboxWrite(_outboxRead().filter(e=>e&&e.id!==id)); }catch(e){}
}
/* يُستدعى عند عودة الاتصال ومع كل محاولة رفع */
function _outboxFlush(){
    if(!_baseRef)return;
    const a=_outboxRead();
    if(!a.length)return;
    a.forEach(evt=>{
        if(!evt||!evt.id)return;
        try{
            const _clean=JSON.parse(JSON.stringify(_withOwner(evt)));
            _baseRef.child('events/'+evt.id).set(_clean)
                .then(()=>{ _outboxDrop(evt.id); try{_unsyncedIds.delete(evt.id);_updSyncIndicator();}catch(_){} })
                .catch(()=>{});
        }catch(e){}
    });
}
window._outboxCount=()=>_outboxRead().length;

function emitEvent(type,data,display){
    const evt={id:uid(),ts:Date.now(),type,data:data||{},display:display||null};
    _allEvents.push(evt);
    _lsSaveEvents();
    /* الصندوق المشترك أولاً: يضمن الرفع حتى لو خرج المستخدم قبل عودة النت */
    _outboxAdd(evt);
    if(_baseRef&&_fbLoaded)_fbSetEvent(evt);
    else{
        try{ _unsyncedIds.add(evt.id); _updSyncIndicator(); }catch(e){}
    }
    _reproject();
}

/* ═══════════ إعادة رفع تلقائية: ما فشل رفعه يُعاد كل 25 ثانية وعند عودة الاتصال ═══════════ */
let _retryStrikes=0,_healFails=0,_healAlerted=false;
function _fbReconnect(){
    /* إعادة بناء قابس الاتصال — نفس مفعول F5 دون إعادة تحميل */
    try{
        _db.goOffline();
        setTimeout(()=>{try{_db.goOnline();}catch(e){}},700);
    }catch(e){}
}
function _retryUnsynced(){
    try{
        if(!_baseRef||typeof _unsyncedIds==='undefined'||_unsyncedIds.size===0){_retryStrikes=0;_healFails=0;return;}
        _retryStrikes++;
        if(_retryStrikes>=2){
            _retryStrikes=0;
            /* أولاً: هل الجلسة ساقطة؟ (القواعد ترفض كل كتابة بلا auth) */
            if(!_auth.currentUser&&typeof window._silentReauth==='function'){
                window._silentReauth().then(ok=>{ if(ok)setTimeout(_retryUnsynced,1200); });
                return;
            }
            /* وإلا: القابس زومبي على الأرجح — أعد بناءه ثم ادفع */
            _healFails++;
            if(_healFails>=2&&!_healAlerted){
                /* دورتا علاج كاملتان والمعلق باقٍ ← أنطق السبب تلقائياً */
                _healAlerted=true;
                const code=window._lastFbErr||'بلا رمز (كتابة معلقة بلا رد)';
                const msg='⚠️ المزامنة متعثرة رغم محاولات العلاج الذاتي.\n\n'
                    +'آخر خطأ: '+code+'\n'
                    +'معلّق: '+_unsyncedIds.size+' قيد\n\n'
                    +'صوّر هذه الرسالة وأرسلها للمطوّر.';
                try{if(typeof appAlert==='function')appAlert(msg);else alert(msg);}catch(_){}
                setTimeout(()=>{_healAlerted=false;},10*60*1000);
            }
            _fbReconnect();
            setTimeout(()=>{
                try{[..._unsyncedIds].forEach(id=>{const e=_allEvents.find(x=>x.id===id);if(e)_fbSetEvent(e);});}catch(e){}
            },1800);
            return;
        }
        [..._unsyncedIds].forEach(id=>{
            const e=_allEvents.find(x=>x.id===id);
            if(e)_fbSetEvent(e);
        });
    }catch(e){}
}
setInterval(_retryUnsynced,25000);
/* استباقي: إن بقي معلّق أكثر من 20 ثانية أظهر السبب تلقائياً (مرة كل دقيقة كحد أقصى) */
let _stuckSince=0,_stuckToastT=0;
setInterval(()=>{
    try{
        const n=(typeof _unsyncedIds!=='undefined')?_unsyncedIds.size:0;
        if(n===0){_stuckSince=0;return;}
        if(!_stuckSince)_stuckSince=Date.now();
        if(Date.now()-_stuckSince>20000&&Date.now()-_stuckToastT>60000){
            _stuckToastT=Date.now();
            const err=window._lastFbErr||'؟';
            const authOk=!!(_auth&&_auth.currentUser);
            toast(`⚠️ ${n} قيد عالق منذ ${Math.round((Date.now()-_stuckSince)/1000)}ث — جلسة:${authOk?'✓':'✗'} · خطأ: ${err}`,'error');
        }
    }catch(e){}
},5000);
window.addEventListener('online',()=>setTimeout(_retryUnsynced,1500));
document.addEventListener('visibilitychange',()=>{
    if(document.hidden)return;
    /* عودة من السكون/الخلفية ومعنا معلّق ← أعد بناء القابس فوراً وادفع */
    if(typeof _unsyncedIds!=='undefined'&&_unsyncedIds.size>0){
        _fbReconnect();
        setTimeout(_retryUnsynced,2000);
    }
});

/* ═══════════ LOAD — تحميل من localStorage ثم إعادة الإسقاط ═══════════ */
function load(){
    _lsLoadEvents();
    /* تحميل الإعدادات */
    try{
        const raw=localStorage.getItem('gp_settings_'+(_currentUser||''));
        if(raw){
            const s=JSON.parse(raw);
            if(s.goldPrice)goldPrice=s.goldPrice;
            if(s.dollarRate)dollarRate=s.dollarRate;
            if(typeof s.darkMode==='boolean'){darkMode=s.darkMode;if(darkMode)applyDark();}
        }
    }catch(e){}
    if(_allEvents.length>0)_reproject();
}

/* ═══════════ SAVE — يحفظ الإعدادات فقط ═══════════ */
function save(){
    const _dc=(typeof _dubaiCalcVals!=='undefined')?_dubaiCalcVals:null;
    const _tb=JSON.stringify((typeof _tarbahList!=='undefined'&&_tarbahList)?_tarbahList:[]);
    try{localStorage.setItem('gp_settings_'+(_currentUser||''),JSON.stringify({goldPrice,dollarRate,darkMode}));}catch(e){}
    if(!_baseRef||!_fbLoaded)return;
    try{_baseRef.child('settings').set(_withOwner({goldPrice,dollarRate,darkMode,dubaiCalc:_dc,tarbah:_tb,_ts:firebase.database.ServerValue.TIMESTAMP})).catch(_fbErr);}catch(e){}
}

let _saveTimer=null;
function _scheduleSave(){clearTimeout(_saveTimer);_saveTimer=setTimeout(save,1200);}

/* ═══════════ FIREBASE INITIAL LOAD — مزامنة الأحداث أول مرة ═══════════ */
function _fbInitialLoad(){
    if(!_baseRef)return;
    /* تحميل الإعدادات من Firebase */
    _baseRef.child('settings').once('value',s=>{
        const cfg=s.val();
        if(cfg){
            if(cfg.goldPrice)goldPrice=cfg.goldPrice;
            if(cfg.dollarRate)dollarRate=cfg.dollarRate;
            if(typeof cfg.darkMode==='boolean'){darkMode=cfg.darkMode;if(darkMode)applyDark();}
            try{localStorage.setItem('gp_settings_'+(_currentUser||''),JSON.stringify({goldPrice,dollarRate,darkMode}));}catch(e){}
            if(cfg.dubaiCalc&&typeof _applyDubaiCalcSettings==='function')_applyDubaiCalcSettings(cfg.dubaiCalc);
            if(typeof cfg.tarbah==='string'&&typeof _applyTarbah==='function')_applyTarbah(cfg.tarbah);
        }
    });

    /* شاهدة المسح الشامل: إن كانت أحدث من إقرارنا المحلي، امسح المحلي ولا ترفعه */
    _baseRef.child('resetAt').once('value',rs=>{
        const rAt=rs.val()||0;
        let ack=0; try{ack=parseInt(localStorage.getItem('gp12_resetAck')||'0')||0;}catch(e){}
        if(rAt>ack){
            /* تحصين: قيود ما بعد المسح تنجو دائماً؛ وما قبله لا يُحذف عند المسؤول إلا بإذنه */
            const pre =_allEvents.filter(e=>(e.ts||0)<=rAt);
            const post=_allEvents.filter(e=>(e.ts||0)> rAt);
            let keepPre=false;
            if(pre.length&&!window._roleLock){
                keepPre=!confirm('🧹 وُجد مسح شامل نُفِّذ من جهاز آخر.\n\nهذا الجهاز يحمل '+pre.length+' قيداً سابقاً للمسح.\n\n[موافق] حذفها — إتمام المسح\n[إلغاء] إبقاؤها ورفعها للسحابة — استرجاع البيانات');
            }
            if(!keepPre){
                _allEvents=post;
                toast(post.length?('🧹 نُفِّذ المسح — أُبقيت '+post.length+' قيداً أحدث منه'):'🧹 نُفِّذ مسح شامل — بدأ هذا الجهاز من صفر','info');
            }else{
                toast('↩️ أُبقيت القيود وسيُعاد رفعها للسحابة (استرجاع)','success');
            }
            try{localStorage.setItem('gp12_resetAck',String(rAt));}catch(e){}
            try{_lsSaveEvents();}catch(e){}
            _reproject();
        }

    /* تحميل الأحداث من Firebase.
       الزبون (قراءة فقط) يستعمل تحميلاً تزايدياً: يجلب فقط ما هو أحدث من
       آخر حدث محفوظ محلياً — توفير هائل في خطة Blaze (بدل سحب كل الأحداث كل مرة).
       الأدمين/العامل (يحذف ويصحّح) يبقى على التحميل الكامل لضمان التطابق. */
    const _isCustomer=(window._roleLock==='customer');
    let _lastLocalTs=0;
    if(_allEvents.length>0){
        _allEvents.forEach(e=>{ if((e.ts||0)>_lastLocalTs)_lastLocalTs=e.ts||0; });
    }
    /* التحميل التزايدي لكل الأدوار (توفير هائل، خاصة الأدمين على عدة أجهزة).
       التصحيح في النظام يتم بحدث VOID جديد (لا حذف فعلي)، فالتزايدي يلتقطه.
       تحميل كامل دوري كضمان: الزبون كل 24س، الأدمين/العامل كل 6س (يصحّحون أكثر). */
    const _fullEveryMs = _isCustomer ? 24*3600*1000 : 6*3600*1000;
    let _fullReload=true;
    try{
        const _lastFull=+(localStorage.getItem('gp_fullsync_'+(_currentUser||''))||0);
        if(_lastLocalTs>0 && (Date.now()-_lastFull)<_fullEveryMs)_fullReload=false;
    }catch(e){}
    const _incremental=(_lastLocalTs>0 && !_fullReload);
    /* هامش أمان ساعة: يلتقط أحداث الأجهزة الأخرى التي سُجّلت بـts أقدم قليلاً
       (فروق ساعات الأجهزة، أو تسجيل متزامن أوفلاين). التكرار يُزال بالـid. */
    const _SYNC_MARGIN=3600*1000;
    const _evQuery=_incremental
        ? _baseRef.child('events').orderByChild('ts').startAt(_lastLocalTs-_SYNC_MARGIN)
        : _baseRef.child('events');                                            /* الكل */
    if(_fullReload){ try{localStorage.setItem('gp_fullsync_'+(_currentUser||''),String(Date.now()));}catch(e){} }
    _evQuery.once('value',snap=>{
        const evData=snap.val();
        if(evData){
            const remoteEvents=Object.values(evData).filter(Boolean);
            const localIds=new Set(_allEvents.map(e=>e.id));
            let _added=0;
            remoteEvents.forEach(e=>{
                if(e&&e.id&&!localIds.has(e.id)){_allEvents.push(e);localIds.add(e.id);_added++;}
            });
            /* المزامنة العكسية (رفع المحلي الناقص) للأدمين/العامل فقط —
               الزبون لا يرفع ولا يحذف، والتحميل التزايدي لا يرى كل البعيد. */
            /* المزامنة العكسية والحذف: فقط في التحميل الكامل (لا التزايدي) */
            if(!_incremental){
                const remoteIds=new Set(remoteEvents.map(e=>e?.id).filter(Boolean));
                if(!_isCustomer){
                    _allEvents.forEach(e=>{
                        if(e&&e.id&&!remoteIds.has(e.id))_fbSetEvent(e);
                    });
                }else{
                    /* الزبون في تحميل كامل: احذف محلياً ما لم يعد في السحابة (تصحيحات) */
                    _allEvents=_allEvents.filter(e=>!e.id||remoteIds.has(e.id));
                }
            }
            _lsSaveEvents();
            _reproject();
            if(_added>0||!_isCustomer)toast('☁️ تمت المزامنة مع السحابة','info');
        }else if(_allEvents.length>0 && !_isCustomer){
            /* لا توجد أحداث في Firebase — ارفع المحلية (الأدمين/العامل فقط) */
            _allEvents.forEach(e=>_fbSetEvent(e));
        }else if(_allEvents.length===0){
            /* لا توجد بيانات إطلاقاً — جرّب الترحيل من الصيغة القديمة */
            _migrateToEvents();
        }
        _fbLoaded=true;
        _startFbSync();
        _startSettingsSync();
    }).catch(e=>{
        _fbErr(e);
        _fbLoaded=true;
        _startFbSync();
        _startSettingsSync();
    });
    });   /* نهاية غلاف resetAt */
}

/* ═══════════ DEBOUNCED REPROJECT — لتجنب تجميد الواجهة عند استقبال دفعات من Firebase ═══════════ */
/* الحفظ المحلي يُجمَّع مع إعادة البناء: الأحداث الواردة من Firebase محفوظة سحابياً أصلاً،
   فلا داعي لتشفير كامل السجل في localStorage لكل حدث على حدة. */
let _reprojectTimer=null, _lsSaveTimer=null;
/* الحفظ المحلي (تشفير AES لكامل السجلّ) ثقيل؛ نخنقه بدل تنفيذه عند كل تغيير وارد.
   الأحداث محفوظة في السحابة أصلاً، فالكاش المحلي للعمل دون اتصال فقط. */
function _flushLsSave(){ clearTimeout(_lsSaveTimer); _lsSaveTimer=null; _lsSaveEvents(); }
function _scheduleLsSave(){ clearTimeout(_lsSaveTimer); _lsSaveTimer=setTimeout(_flushLsSave,2500); }
function _debouncedReproject(){
    clearTimeout(_reprojectTimer);
    _reprojectTimer=setTimeout(()=>{ _reproject(); _scheduleLsSave(); },100);
}
/* ضمان عدم فقدان الكاش: احفظ فوراً عند تصغير/إغلاق التطبيق */
try{
    document.addEventListener('visibilitychange',()=>{ if(document.hidden)_flushLsSave(); });
    window.addEventListener('beforeunload',function(e){
        _flushLsSave();
        /* حاجز حماية: امنع الإغلاق إن كانت هناك قيود لم تتزامن مع السحابة (حرج في وضع التخفّي) */
        try{
            if(typeof _unsyncedIds!=='undefined' && _unsyncedIds.size>0){
                /* محاولة رفع أخيرة فورية */
                try{ if(typeof _pushUnsyncedToFb==='function')_pushUnsyncedToFb(); }catch(_){}
                const msg='⚠️ توجد '+_unsyncedIds.size+' عملية لم تُحفظ في السحابة بعد. إغلاق الآن يفقدها نهائياً. انتظر حتى تصبح الشارة خضراء 🟢';
                e.preventDefault(); e.returnValue=msg; return msg;
            }
        }catch(_){}
    });
}catch(e){}

/* ═══════════ REALTIME SYNC — استماع للأحداث الجديدة من أجهزة أخرى ═══════════ */
function _startFbSync(){
    if(_fbListening)return;
    _fbListening=true;
    const _isCust=(window._roleLock==='customer');
    /* كل الأدوار: استمع فقط للأحداث الأحدث من آخر ما عندنا — كي لا يُطلق child_added
       لكل الأحداث القديمة عند الاتصال (يُبطل توفير التحميل التزايدي).
       هذا يوفّر كثيراً للأدمين على عدة أجهزة أيضاً. */
    let _addedRef=_baseRef.child('events');
    let _maxTs=0; _allEvents.forEach(e=>{ if((e.ts||0)>_maxTs)_maxTs=e.ts||0; });
    if(_maxTs>0)_addedRef=_baseRef.child('events').orderByChild('ts').startAt(_maxTs-3600*1000);
    _addedRef.on('child_added',snap=>{
        if(_importing)return;
        const evt=snap.val();
        if(!evt||!evt.id)return;
        if(_allEvents.find(e=>e.id===evt.id))return;
        _allEvents.push(evt);
        _debouncedReproject();
    },_fbErr);
    /* child_removed: يلتقط الحذف الفعلي (استعادة نسخة احتياطية). الأدمين/العامل فقط.
       التصحيح اليومي يتم بحدث VOID (إضافة)، فلا يحتاج هذا المستمع. */
    if(!_isCust){
        _baseRef.child('events').on('child_removed',snap=>{
            if(_importing)return;
            const evt=snap.val();
            if(!evt||!evt.id)return;
            _allEvents=_allEvents.filter(e=>e.id!==evt.id);
            _debouncedReproject();
        },_fbErr);
    }
}

function _startSettingsSync(){
    if(!_baseRef)return;
    _baseRef.child('settings').on('value',snap=>{
        const s=snap.val();
        if(!s)return;
        if(s.goldPrice)goldPrice=s.goldPrice;
        if(s.dollarRate)dollarRate=s.dollarRate;
        if(typeof s.darkMode==='boolean'){darkMode=s.darkMode;if(darkMode)applyDark();}
        try{localStorage.setItem('gp_settings_'+(_currentUser||''),JSON.stringify({goldPrice,dollarRate,darkMode}));}catch(e){}
        if(s.dubaiCalc&&typeof _applyDubaiCalcSettings==='function')_applyDubaiCalcSettings(s.dubaiCalc);
        if(typeof s.tarbah==='string'&&typeof _applyTarbah==='function')_applyTarbah(s.tarbah);
        if(typeof updAll==='function')updAll();
    },_fbErr);
}

/* ═══════════ MIGRATION — ترحيل بيانات الصيغة القديمة ═══════════ */
function _migrateToEvents(){
    try{
        const old=_lsGet(_LSKEY);
        if(!old||!old.B)return;
        const barsAddAll=[];
        const barsMeta={};
        (old.g730||[]).forEach(bar=>{
            const b={id:bar.id||uid(),pool:'730',w:bar.w,k:bar.k||730};
            barsAddAll.push(b);
            barsMeta[b.id]={desc:bar.desc||'رصيد مُرحَّل',dt:bar.dt||'',src:'استيراد'};
        });
        (old.g24||[]).forEach(bar=>{
            const b={id:bar.id||uid(),pool:'24',w:bar.w,k:bar.k||1000};
            barsAddAll.push(b);
            barsMeta[b.id]={desc:bar.desc||'رصيد مُرحَّل',dt:bar.dt||'',src:'استيراد'};
        });
        const openingEvt={
            id:uid(),ts:1,type:'OPENING',
            data:{
                dinar:old.B.دينار||0,
                dollar:old.B.دولار||0,
                barsAdd:barsAddAll,
                debtRows:(old.debts||[]).map(dd=>({c:dd.c,type:dd.type,amt:Math.abs(dd.a||0),dir:(dd.a||0)>=0?'لنا':'علينا'}))
            },
            display:{bars:barsMeta}
        };
        _allEvents.push(openingEvt);
        /* الفواتير والسجل كأحداث تاريخية */
        (old.ops||[]).slice().reverse().forEach(op=>{
            _allEvents.push({id:op.id||uid(),ts:(op._ts||2)+1,type:'HIST',data:{},display:{op}});
        });
        (old.invoices||[]).slice().reverse().forEach(inv=>{
            _allEvents.push({id:uid(),ts:Date.now(),type:'HIST',data:{},display:{invoice:inv}});
        });
        (old.dollInvoices||[]).slice().reverse().forEach(inv=>{
            _allEvents.push({id:uid(),ts:Date.now(),type:'HIST',data:{},display:{dollInvoice:inv}});
        });
        (old.rafInvoices||[]).slice().reverse().forEach(inv=>{
            _allEvents.push({id:uid(),ts:Date.now(),type:'HIST',data:{},display:{rafInvoice:inv}});
        });
        (old.dubaiInvoices||[]).slice().reverse().forEach(inv=>{
            _allEvents.push({id:uid(),ts:Date.now(),type:'HIST',data:{},display:{dubaiInvoice:inv}});
        });
        if(old.loans&&old.loans.length){
            _allEvents.push({id:uid(),ts:1,type:'HIST',data:{loans:old.loans},display:{}});
        }
        _lsSaveEvents();
        /* ارفع لـ Firebase */
        if(_baseRef){
            _allEvents.forEach(e=>_fbSetEvent(e));
        }
        _reproject();
        toast('📋 تم ترحيل البيانات القديمة للنظام الجديد','info');
    }catch(e){console.warn('Migration failed:',e);}
}

/* ترحيل بيانات من ملف JSON بالصيغة القديمة */
function _migrateFromSnapshot(old){
    _allEvents=[];
    _migrateToEvents._old=old;
    /* استبدال _LSKEY مؤقتاً للترحيل */
    const _prev=_lsGet(_LSKEY);
    _lsSet(_LSKEY,old);
    _migrateToEvents();
    if(_prev)_lsSet(_LSKEY,_prev);
}

/* ═══════════ EXPORT / IMPORT ═══════════ */
function exportData(){
    /* الأدمين فقط */
    if(window._roleLock||_currentUser!=='admin'){try{toast&&toast('هذه الميزة للمسؤول فقط','error');}catch(e){}return;}
    try{
        /* نسخة JSON صريحة (بلا تشفير) — تقرؤها وتتبع معاملاتك؛ ويستوردها التطبيق */
        const payload={events:_allEvents,_exported:Date.now(),_user:(_currentUser||'admin'),_plain:true};
        const out=JSON.stringify(payload,null,2);
        const blob=new Blob([out],{type:'application/json'});
        const url=URL.createObjectURL(blob);
        const dt=new Date().toLocaleDateString('fr-FR').replace(/\//g,'-');
        const a=document.createElement('a');
        a.href=url;a.download=`GoldPro_${(_currentUser||'admin')}_${dt}.json`;
        document.body.appendChild(a);a.click();document.body.removeChild(a);
        setTimeout(()=>URL.revokeObjectURL(url),2000);
        toast('📥 تم تحميل النسخة الاحتياطية ('+_allEvents.length+' حدث)','success');
    }catch(e){toast('⚠️ فشل التحميل: '+(e&&e.message||''),'error');}
}

/* ═══════════ نسخة احتياطية تلقائية (الأدمين فقط): كل 24 ساعة ═══════════
   الملف = متجر الأحداث كاملاً (منه تُبنى الأرصدة والديون والفواتير وأرشيفها وكل شيء)
   بنفس صيغة exportData المشفّرة — فالاستيراد الموجود يقرؤها كما هي. */
const _AUTO_BK_MS=12*60*60*1000;   /* كل 12 ساعة — عند الأدمين فقط */
function _autoBackupTick(){
    try{
        /* الأدمين فقط — حارس قاطع من ثلاث إشارات مستقلة */
        if(window._roleLock)return;                        /* أي دور مقيّد */
        if(_currentUser!=='admin')return;                  /* المستخدم يجب أن يكون admin صراحةً */
        if(window._sessionRole&&window._sessionRole!=='admin')return;
        if(!_encKey||!_currentUser||!_fbLoaded)return;
        if(typeof _unsyncedIds!=='undefined'&&_unsyncedIds.size>0)return;  /* لا نلقط نسخة ناقصة */
        if(!_allEvents.length)return;
        const k='gp12_autobk_'+_currentUser;
        const last=parseInt(localStorage.getItem(k)||'0')||0;
        if(Date.now()-last<_AUTO_BK_MS)return;
        const out=_encryptBackup({events:_allEvents,_exported:Date.now(),_user:_currentUser,_auto:true});
        const blob=new Blob([out],{type:'application/json'});
        const url=URL.createObjectURL(blob);
        const dt=new Date().toLocaleDateString('fr-FR').replace(/\//g,'-');
        const a=document.createElement('a');
        a.href=url;a.download=`GoldPro_تلقائية_${_currentUser}_${dt}.json`;
        document.body.appendChild(a);a.click();document.body.removeChild(a);
        setTimeout(()=>URL.revokeObjectURL(url),2000);
        localStorage.setItem(k,String(Date.now()));
        toast('💾 حُفظت نسخة احتياطية كاملة (كل 12 ساعة) في التنزيلات','success');
    }catch(e){}
}
setInterval(_autoBackupTick,60*60*1000);                  /* فحص كل ساعة */
setTimeout(_autoBackupTick,90*1000);                      /* وبعد دقيقة ونصف من الفتح */

function importData(e){
    const file=e.target.files[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
        let parsed=null; try{parsed=JSON.parse(ev.target.result);}catch(_){parsed=null;}
        const apply=(data)=>{
            try{
                if(data&&data.events&&Array.isArray(data.events)){
                    if(!confirm('سيتم استبدال جميع البيانات الحالية بالنسخة الاحتياطية. هل أنت متأكد؟'))return;
                    _allEvents=data.events; _lsSaveEvents();
                    if(_baseRef){
                        _importing=true;
                        _baseRef.child('events').remove().then(()=>{
                            _allEvents.forEach(evt=>_fbSetEvent(evt));
                            setTimeout(()=>{_importing=false;},800);
                        }).catch(e=>{_fbErr(e);_importing=false;});
                    }
                    _reproject();
                    toast('✅ تم استيراد البيانات بنجاح','info');
                    try{closeModal('settingsModal');}catch(x){}
                }else if(data&&data.B){
                    if(!confirm('سيتم استيراد بيانات بالتنسيق القديم وتحويلها. هل أنت متأكد؟'))return;
                    _allEvents=[]; _lsSet(_LSKEY,data); _migrateToEvents();
                    toast('✅ تم استيراد وتحويل البيانات','info');
                    try{closeModal('settingsModal');}catch(x){}
                }else{
                    toast('⚠️ الملف غير صالح','error');
                }
            }catch(err){toast('⚠️ خطأ في معالجة البيانات','error');}
        };
        if(parsed&&parsed._gpenc&&parsed.blob){
            /* ملف مشفّر → فكّ بمفتاح المستخدم النشط حالياً */
            if(!_encKey){toast('⚠️ سجّل الدخول أولاً لتفعيل مفتاح فك التشفير','error');return;}
            toast('🔓 جاري فك التشفير...','info');
            setTimeout(()=>{
                const data=_decryptBackup(parsed);
                if(!data){toast('🚫 فشل فك التشفير — كلمة المرور خاطئة أو الملف لا يخصّك','error');return;}
                apply(data);
            },50);
        }else if(parsed&&(parsed.events||parsed.B)){
            apply(parsed); /* ملف قديم غير مشفّر — توافق رجعي */
        }else{
            toast('⚠️ الملف غير صالح','error');
        }
    };
    reader.readAsText(file);
    e.target.value='';
}

/* ═══════════ AUTO BACKUP ═══════════ */
const _BACKUP_KEY='gp12_lastBackup';
function _startAutoBackup(){
    setTimeout(()=>{
        const last=parseInt(localStorage.getItem(_BACKUP_KEY+'_'+_currentUser)||'0',10);
        if(Date.now()-last>20*3600*1000||!last)_doAutoBackup();
    },60*1000);
    setInterval(()=>{
        const last=parseInt(localStorage.getItem(_BACKUP_KEY+'_'+_currentUser)||'0',10);
        if(Date.now()-last>20*3600*1000)_doAutoBackup();
    },3600*1000);
}
function _doAutoBackup(){
    try{
        /* الأدمين فقط — حارس قاطع (كان مفقوداً: سبب تحميل النسخ عند الزبائن والعمال) */
        if(window._roleLock)return;
        if(_currentUser!=='admin')return;
        if(window._sessionRole&&window._sessionRole!=='admin')return;
        if(!_allEvents.length)return;
        const dataObj={events:_allEvents,_exported:Date.now(),_user:_currentUser};
        const out=_encKey?_encryptBackup(dataObj):JSON.stringify(dataObj,null,2);
        const blob=new Blob([out],{type:'application/json'});
        const url=URL.createObjectURL(blob);
        const dt=new Date().toLocaleDateString('fr-FR').replace(/\//g,'-');
        const a=document.createElement('a');
        a.href=url;a.download=`GoldPro_auto_${_currentUser}_${dt}.json`;
        document.body.appendChild(a);a.click();document.body.removeChild(a);
        setTimeout(()=>URL.revokeObjectURL(url),2000);
        localStorage.setItem(_BACKUP_KEY+'_'+_currentUser,Date.now().toString());
        toast('💾 تم تنزيل نسخة احتياطية تلقائية','info');
    }catch(e){}
}

/* ═══════════ RESET ALL ═══════════ */
async function resetAllData(){
    const pw=prompt('🔐 أدخل كلمة سر إعادة الضبط:');
    if(pw===null)return;
    if(pw!=='19981998')return toast('كلمة السر خاطئة','error');
    if(typeof _unsyncedIds!=='undefined'&&_unsyncedIds.size>0){
        alert('⚠️ يوجد '+_unsyncedIds.size+' حدثاً غير مرفوع من هذا الجهاز.\nانتظر حتى تتحول الشارة إلى «متصل» الخضراء ثم أعد المحاولة — حمايةً من ضياع قيود.');
        return;
    }
    if(!confirm('⚠️ سيُمسح كل شيء نهائياً — محلياً ومن Firebase (السجل، المخزون، الديون، الصور، حسابات الزبائن، الإشعارات). لا رجعة. متابعة؟'))return;
    toast('⏳ جارٍ المسح الشامل...','info');
    try{if(_baseRef){_baseRef.off();}_fbListening=false;}catch(e){}
    /* مسح عقد goldpro ابناً-ابناً (القواعد لا تسمح بحذف الأب دفعة واحدة) */
    /* ملاحظة: الحذف على العقد ذات إذن الكتابة نفسها — حذف الأب (admin) مرفوض قواعدياً */
    const _nodes=['admin/data','_users','_customers','_appcfg','_tokens','_push','_photos'];
    const _fails=[];
    for(const n of _nodes){
        try{ await _db.ref('goldpro/'+n).remove(); }
        catch(e){ console.error('wipe '+n,e); _fails.push(n); }
    }
    /* شاهدة المسح: أي جهاز آخر يراها يمسح بياناته المحلية بدل إعادة رفعها */
    try{ await _db.ref('goldpro/admin/data/resetAt').set(Date.now()); }catch(e){console.error('resetAt',e);_fails.push('resetAt');}
    /* تحقق نهائي: هل زالت الأحداث فعلاً؟ */
    let _left=null;
    try{ _left=(await _db.ref('goldpro/admin/data/events').limitToFirst(1).get()).val(); }catch(e){}
    if(_fails.length||_left){
        alert('⚠️ المسح لم يكتمل!\nفشل في: '+(_fails.join('، ')||'—')+(_left?'\nالأحداث ما زالت موجودة (إذن مرفوض؟)':'')+'\nأرسل لقطة من Console للمطوّر.');
        return;
    }
    /* مسح كل التخزين المحلي للتطبيق */
    try{ localStorage.clear(); }catch(e){}
    try{ sessionStorage.clear(); }catch(e){}
    toast('✅ مُسح كل شيء — إعادة تشغيل','success');
    setTimeout(()=>location.reload(),600);
}

/* ═══════════ DELETE HELPERS (VOID events) ═══════════ */
function _voidWsSession(sessionId){
    const evt=_allEvents.find(e=>e.type==='WS_SESSION'&&e.data&&e.data.session&&e.data.session.id===sessionId);
    if(!evt)return false;
    emitEvent('VOID',{voids:evt.id},null);
    return true;
}
window._voidWsSession=_voidWsSession;
function _voidByInvId(field,id){
    const evt=_allEvents.find(e=>e.display&&e.display[field]&&e.display[field].id===id&&e.type!=='VOID');
    if(!evt){return false;}

    /* ── مفارقة VOID: تحذير إذا استُهلكت سبائك هذا الحدث في عمليات لاحقة حيّة ── */
    const addedBarIds=new Set([
        ...(evt.data?.barsAdd||[]).map(b=>b.id),
        ...(evt.data?.barsAdd24||[]).map(b=>b.id),
    ]);
    if(addedBarIds.size>0){
        const _voided=new Set(_allEvents.filter(e=>e.type==='VOID').map(e=>e.data?.voids).filter(Boolean));
        const _isLater=e=>((e.ts||0)>(evt.ts||0))||((e.ts||0)===(evt.ts||0)&&String(e.id)>String(evt.id));
        const laterConsumed=_allEvents.some(e=>{
            if(e.type==='VOID'||e.id===evt.id||_voided.has(e.id)||!_isLater(e))return false;
            const dd=e.data||{};
            const refIds=[
                ...(dd.barsRemove||[]),
                ...(dd.barsRemove730||[]),
                ...((dd.barUpdates||[]).map(u=>u.id)),
                ...((dd.barUpdates730||[]).map(u=>u.id)),
            ];
            return refIds.some(bid=>addedBarIds.has(bid));
        });
        if(laterConsumed){
            toast('⚠️ تحذير: سبائك من هذه العملية استُهلكت في عمليات لاحقة — راجع الرصيد بعد الحذف','error');
        }
    }

    emitEvent('VOID',{voids:evt.id},null);
    return true;
}
/* هل خرجت سبائك هذه الفاتورة من الكوفر (استُهلكت في بيع/رافيناج لاحق حيّ)؟ */
window._invBarsConsumedF=(field,id)=>{
    const evt=_allEvents.find(e=>e.display&&e.display[field]&&e.display[field].id===id&&e.type!=='VOID');
    if(!evt)return false;
    const added=new Set([...(evt.data?.barsAdd||[]).map(b=>b.id),...(evt.data?.barsAdd24||[]).map(b=>b.id)]);
    if(!added.size)return false;
    const _voided=new Set(_allEvents.filter(e=>e.type==='VOID').map(e=>e.data?.voids).filter(Boolean));
    const _later=e=>((e.ts||0)>(evt.ts||0))||((e.ts||0)===(evt.ts||0)&&String(e.id)>String(evt.id));
    return _allEvents.some(e=>{
        if(e.type==='VOID'||e.id===evt.id||_voided.has(e.id)||!_later(e))return false;
        const dd=e.data||{};
        const ref=[...(dd.barsRemove||[]),...(dd.barsRemove730||[]),...((dd.barUpdates||[]).map(u=>u.id)),...((dd.barUpdates730||[]).map(u=>u.id))];
        return ref.some(bid=>added.has(bid));
    });
};
window._invBarsConsumed=(id)=>window._invBarsConsumedF('invoice',id);
/* لقطة من حدث فاتورة حيّ + إعادة بثّها (لاسترجاع الفاتورة عند إلغاء التعديل) */
window._invSnapshot=(field,id)=>{
    const e=_allEvents.find(ev=>ev.display&&ev.display[field]&&ev.display[field].id===id&&ev.type!=='VOID');
    return e?{type:e.type,data:JSON.parse(JSON.stringify(e.data||{})),display:JSON.parse(JSON.stringify(e.display||{}))}:null;
};
window._reemitSnapshot=(snap)=>{ if(snap&&snap.type)emitEvent(snap.type,snap.data,snap.display); };

window.delDoll=(id)=>{
    if(!confirm('حذف هذه الفاتورة وعكس أثرها؟'))return;
    if(!_voidByInvId('dollInvoice',id)){
        dollInvoices=dollInvoices.filter(x=>x.id!==id);
        renderArchive();
    }
    toast('🗑️ تم الحذف','info');
};

window.delDubai=(id)=>{
    if(!confirm('حذف هذه الفاتورة وعكس أثرها؟'))return;
    if(!_voidByInvId('dubaiInvoice',id)){
        dubaiInvoices=dubaiInvoices.filter(x=>x.id!==id);
        renderArchive();
    }
    toast('🗑️ تم الحذف','info');
};
