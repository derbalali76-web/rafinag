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
function _updSyncIndicator(){
    const el=document.getElementById('syncIndicator');
    if(!el)return;
    if(!_fbOnline){el.textContent='🔴 أوفلاين';el.style.color='var(--rd)';return;}
    if(_unsyncedIds.size>0){
        el.textContent=`🟡 غير محفوظ (${_unsyncedIds.size})`;el.style.color='#e6a817';
    }else{
        el.textContent='🟢 متصل';el.style.color='var(--gr)';
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
        _baseRef.child('events/'+evt.id).set(_withOwner(evt))
            .then(()=>{_unsyncedIds.delete(evt.id);_updSyncIndicator();})
            .catch(e=>{_fbErr(e);});
    }catch(e){_fbErr(e);}
}

/* حارس الاستيراد: يوقف معالِجات المزامنة أثناء استبدال كامل البيانات */
let _importing=false;

_db.ref('.info/connected').on('value',s=>{
    const wasOffline=!_fbOnline;
    _fbOnline=!!s.val();
    _updSyncIndicator();
    /* عند استعادة الاتصال: ارفع الأحداث المعلقة */
    if(_fbOnline&&wasOffline&&_fbLoaded)_pushUnsyncedToFb();
});

let _fbErrShown=false;
function _fbErr(e){
    try{console.warn('[GoldPro sync] فشل الكتابة في Firebase:',(e&&e.code)||e);}catch(_){}
    if(!_fbErrShown){
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

function _lsSaveEvents(){
    try{_lsSet(_getEvLsKey(),_allEvents);}catch(e){}
}
function _lsLoadEvents(){
    try{
        const stored=_lsGet(_getEvLsKey());
        if(Array.isArray(stored))_allEvents=stored;
    }catch(e){}
}

/* ═══════════ PICK BARS (خالص — لا تعديل للحالة) ═══════════ */
function _pickBarsToRemove(pool,weight){
    const bars=pool==='24'?g24:g730;
    const result={barsRemove:[],barUpdates:[]};
    let rem=weight;
    for(let i=bars.length-1;i>=0&&rem>0.001;i--){
        const bar=bars[i];
        if(bar.w<=rem+0.001){
            result.barsRemove.push(bar.id);
            rem-=bar.w;
        }else{
            result.barUpdates.push({id:bar.id,pool,newW:parseFloat((bar.w-rem).toFixed(4))});
            rem=0;
        }
    }
    return result;
}

/* ═══════════ APPLY EVENT (مُطبِّق الأحداث على حالة st) ═══════════ */
function _applyEvt(st,evt){
    const d=evt.data||{};
    const disp=evt.display||{};

    function applyBars(){
        if(d.barsRemove&&d.barsRemove.length){
            const ids=new Set(d.barsRemove);
            st.g730=st.g730.filter(b=>!ids.has(b.id));
            st.g24=st.g24.filter(b=>!ids.has(b.id));
        }
        if(d.barUpdates&&d.barUpdates.length){
            d.barUpdates.forEach(upd=>{
                const bar=st.g730.find(b=>b.id===upd.id)||st.g24.find(b=>b.id===upd.id);
                if(bar)bar.w=upd.newW;
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
                if(bar)bar.w=upd.newW;
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
    if(disp.op){st.ops.push({...disp.op,id:evt.id});}

    switch(evt.type){

        case 'OPENING':{
            if(d.dinar>0)st.B.دينار+=d.dinar;
            if(d.dollar>0)st.B.دولار+=d.dollar;
            applyBars();
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
                stUpdDebt(d.c,d.m,d.finalAmount);
            }else{
                applyBars();
                if(d.m!=='ذهب 730'&&d.m!=='ذهب 24')st.B[d.m]=(st.B[d.m]||0)+d.finalAmount;
                stUpdDebt(d.c,d.m,-d.finalAmount);
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
            if(d.p>0)stUpdDebt('شحن','دولار',-(d.rc*d.p));
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
            applyBars();
            st.B.دينار+=d.akhd;
            const remS=d.tp-d.akhd;
            if(remS>0.001)stUpdDebt(d.c,'دينار',remS);
            if(disp.invoice)st.invoices.unshift(disp.invoice);
            break;
        }

        case 'RAF':{
            /* حركة المخزون المشتركة */
            if(d.barsRemove730&&d.barsRemove730.length){const ids=new Set(d.barsRemove730);st.g730=st.g730.filter(b=>!ids.has(b.id));}
            if(d.barUpdates730&&d.barUpdates730.length){d.barUpdates730.forEach(upd=>{const bar=st.g730.find(b=>b.id===upd.id);if(bar)bar.w=upd.newW;});}
            if(d.barsAdd24&&d.barsAdd24.length){d.barsAdd24.forEach(bar=>{const meta=disp.bars&&disp.bars[bar.id];st.g24.push({...bar,desc:meta?.desc||'رافيناج',dt:meta?.dt||'',src:meta?.src||'رافيناج',_ts:evt.ts});});}
            /* حركة مخزون خاصة بفرع الزبون */
            if(d.barsAdd730&&d.barsAdd730.length){d.barsAdd730.forEach(bar=>{const meta=disp.bars&&disp.bars[bar.id];st.g730.push({...bar,desc:meta?.desc||'رافيناج - كسر زبون',dt:meta?.dt||'',src:meta?.src||'رافيناج',_ts:evt.ts});});}
            if(d.barsRemove24&&d.barsRemove24.length){const ids=new Set(d.barsRemove24);st.g24=st.g24.filter(b=>!ids.has(b.id));}
            if(d.barUpdates24&&d.barUpdates24.length){d.barUpdates24.forEach(upd=>{const bar=st.g24.find(b=>b.id===upd.id);if(bar)bar.w=upd.newW;});}

            if(d.mode==='customer'){
                /* ── فرع الزبون: كسره دخل مخزون 730 (barsAdd730) ── */
                if(d.settled){
                    /* خالصة: خرج مكافئ 24 من الكوفر (barsRemove24/barUpdates24)، والأجرة تدخل السيولة */
                    if(d.fee>0)st.B.دينار+=d.fee;
                }else{
                    /* غير خالصة: نحن مدينون له بمكافئ 24 (سالب=علينا)، وهو مدين لنا بالأجرة (موجب=لنا) */
                    stUpdDebt(d.c,'ذهب 24',-d.eq24);
                    if(d.fee>0)stUpdDebt(d.c,'دينار',d.fee);
                }
            }else{
                /* ── فرع عثمان/المصفّي: السلوك الأصلي (توافق مع الأحداث القديمة) ── */
                stUpdDebt(d.c,'ذهب 24',d.eq24-d.lanqo);
                if(d.fee>0)stUpdDebt(d.c,'دينار',-d.fee);
                if(d.sawared>0)stUpdDebt(d.c,'دينار',d.sawared);
            }
            if(disp.rafInvoice)st.rafInvoices.unshift(disp.rafInvoice);
            break;
        }
        case 'WS_BARADD':{
            if(!st.wsBars[d.ws])st.wsBars[d.ws]=[];
            st.wsBars[d.ws].push({id:d.id,w:d.w,k:d.k,_ts:evt.ts});
            break;
        }
        case 'WS_BARDEL':{
            if(st.wsBars[d.ws])st.wsBars[d.ws]=st.wsBars[d.ws].filter(b=>b.id!==d.id);
            break;
        }
        case 'WS_SESSION':{
            /* حركة المخزون: سبائك الجلسة تخرج من 730، والسلعة الواجدة تدخل 24 */
            if(d.barsRemove730&&d.barsRemove730.length){const ids=new Set(d.barsRemove730);st.g730=st.g730.filter(b=>!ids.has(b.id));}
            if(d.barUpdates730&&d.barUpdates730.length){d.barUpdates730.forEach(upd=>{const bar=st.g730.find(b=>b.id===upd.id);if(bar)bar.w=upd.newW;});}
            if(d.barsAdd24&&d.barsAdd24.length){d.barsAdd24.forEach(bar=>{const meta=disp.bars&&disp.bars[bar.id];st.g24.push({...bar,desc:meta?.desc||'ورشة - سلعة واجدة',dt:meta?.dt||'',src:meta?.src||'ورشة',_ts:evt.ts});});}
            /* الدفعة استُهلكت — تُفرَّغ سبائك الورشة الحالية */
            if(d.clearBars)st.wsBars[d.ws]=[];
            if(!st.wsSessions[d.ws])st.wsSessions[d.ws]=[];
            st.wsSessions[d.ws].unshift(d.session);
            break;
        }
        case 'WS_SESSIONDEL':{
            if(st.wsSessions[d.ws])st.wsSessions[d.ws]=st.wsSessions[d.ws].filter(s=>s.id!==d.id);
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
            if(d.freeBuy){
                /* شراء حرّ: الزبون مدين لك بالذهب (+) ، وأنا مدين للزبون بالنقد (−) */
                stUpdDebt(c,type,d.w);
                stUpdDebt(c,'دينار',cashTotal);
            }else{
                if(!isBuy)applyBars();
                stClearDebt(c,type);
                if(Math.abs(remaining)>0.001)stUpdDebt(c,type,net>0?remaining:-remaining);
                stUpdDebt(c,'دينار',cashTotal);
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
            stClearDebt(c,'ذهب 24');
            if(remaining>0.001)stUpdDebt(c,'ذهب 24',net>0?remaining:-remaining);
            break;
        }

        case 'SETTLE_730_REC':{
            const {c,net,remaining}=d;
            applyBars();
            stClearDebt(c,'ذهب 730');
            if(remaining>0.001)stUpdDebt(c,'ذهب 730',remaining);
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
            stUpdDebt(d.c,lm,d.w);
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
            /* سطر سجل للهدف (تحويل وارد) كي يظهر في كشف حسابه أيضاً */
            st.ops.push({
                c: d.to, t:'تحويل وارد', m: d.dstType, a: (d.wDst!=null?d.wDst:d.w),
                _ts:(disp.op&&disp.op._ts)||evt.ts||Date.now(),
                dt:(disp.op&&disp.op.dt)||'',
                xferFrom: d.from, xferInType: d.dstType,
                id: evt.id+'_in'
            });
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
function _reproject(){
    const voidedIds=new Set(
        _allEvents.filter(e=>e.type==='VOID').map(e=>e.data?.voids).filter(Boolean)
    );
    const live=_allEvents
        .filter(e=>e.type!=='VOID'&&!voidedIds.has(e.id))
        .sort((a,b)=>((a.ts||0)-(b.ts||0))||String(a.id).localeCompare(String(b.id)));

    const st={
        B:{دينار:0,دولار:0,'ذهب 730':0,'ذهب 24':0,vg730:0,vg24:0},
        g730:[],g24:[],debts:[],loans:[],
        ops:[],invoices:[],dollInvoices:[],rafInvoices:[],dubaiInvoices:[],
        wsBars:{workshop1:[],workshop2:[]},wsSessions:{workshop1:[],workshop2:[]}
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

    syncBal();
    if(typeof updAll==='function')updAll();
}

/* ═══════════ EMIT EVENT — الكتابة الوحيدة المسموح بها ═══════════ */
function emitEvent(type,data,display){
    const evt={id:uid(),ts:Date.now(),type,data:data||{},display:display||null};
    _allEvents.push(evt);
    _lsSaveEvents();
    if(_baseRef&&_fbLoaded)_fbSetEvent(evt);
    _reproject();
}

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

    /* تحميل الأحداث من Firebase */
    _baseRef.child('events').once('value',snap=>{
        const evData=snap.val();
        if(evData){
            const remoteEvents=Object.values(evData).filter(Boolean);
            const localIds=new Set(_allEvents.map(e=>e.id));
            remoteEvents.forEach(e=>{
                if(e&&e.id&&!localIds.has(e.id)){_allEvents.push(e);localIds.add(e.id);}
            });
            const remoteIds=new Set(remoteEvents.map(e=>e?.id).filter(Boolean));
            _allEvents.forEach(e=>{
                if(e&&e.id&&!remoteIds.has(e.id))_fbSetEvent(e);
            });
            _lsSaveEvents();
            _reproject();
            toast('☁️ تمت المزامنة مع السحابة','info');
        }else if(_allEvents.length>0){
            /* لا توجد أحداث في Firebase — ارفع المحلية */
            _allEvents.forEach(e=>_fbSetEvent(e));
        }else{
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
    window.addEventListener('beforeunload',_flushLsSave);
}catch(e){}

/* ═══════════ REALTIME SYNC — استماع للأحداث الجديدة من أجهزة أخرى ═══════════ */
function _startFbSync(){
    if(_fbListening)return;
    _fbListening=true;
    _baseRef.child('events').on('child_added',snap=>{
        if(_importing)return;
        const evt=snap.val();
        if(!evt||!evt.id)return;
        if(_allEvents.find(e=>e.id===evt.id))return;
        _allEvents.push(evt);
        _debouncedReproject();
    },_fbErr);
    _baseRef.child('events').on('child_removed',snap=>{
        if(_importing)return;
        const evt=snap.val();
        if(!evt||!evt.id)return;
        _allEvents=_allEvents.filter(e=>e.id!==evt.id);
        _debouncedReproject();
    },_fbErr);
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
    if(!_encKey){toast('⚠️ سجّل الخروج ثم الدخول من جديد لتفعيل التشفير قبل التصدير','error');return;}
    toast('🔒 جاري التشفير...','info');
    setTimeout(()=>{
        try{
            const out=_encryptBackup({events:_allEvents,_exported:Date.now(),_user:_currentUser});
            const blob=new Blob([out],{type:'application/json'});
            const url=URL.createObjectURL(blob);
            const dt=new Date().toLocaleDateString('fr-FR').replace(/\//g,'-');
            const a=document.createElement('a');
            a.href=url;a.download=`GoldPro_${_currentUser}_${dt}.json`;a.click();
            setTimeout(()=>URL.revokeObjectURL(url),2000);
            toast('🔒 تم تحميل النسخة الاحتياطية المشفّرة','info');
        }catch(e){toast('⚠️ فشل التشفير','error');}
    },50);
}

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
function resetAllData(){
    if(!confirm('⚠️ سيتم حذف جميع البيانات نهائياً — المخزون، السجل، الديون، الرصيد. هل أنت متأكد؟'))return;
    if(!confirm('⚠️ تأكيد أخير: لا يمكن التراجع. هل تريد المتابعة؟'))return;
    try{if(_baseRef){_baseRef.off();_baseRef.remove().catch(()=>{});}_fbListening=false;}catch(e){}
    const toDel=[];
    for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&(k.startsWith('gp12_')||k.startsWith('gp_ev_')||k.startsWith('gp_settings_')))toDel.push(k);
    }
    toDel.forEach(k=>localStorage.removeItem(k));
    location.reload();
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
