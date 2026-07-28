/* ═══════════════ WORKSHOPS — الورشات ═══════════════
   منقولة من منظومة الرفاينج. كل ورشة لها سبائكها الخاصة (ميزان/عيار)
   وجلسات محفوظة. الجلسة تحسب: الخام، الصافي 24، السلعة الواجدة، ولابارت.
   كل شيء عبر أحداث event-sourcing (قابلة للتراجع + متزامنة). */

const WS_LIST = { workshop1:'ورشة دحمون', workshop2:'ورشة صلاح' };
const WS_ACCENT = { workshop1:'#0ea5e9', workshop2:'#a855f7' };
const WS_SHORT = { workshop1:'دحمون', workshop2:'صلاح' };
const WS_DESC  = { workshop1:'ورشة دحمون للصياغة والتصنيع', workshop2:'ورشة صلاح للصياغة والتصنيع' };
let _wsCur = 'workshop1';

function _wsBarsOf(ws){ return (typeof wsBars!=='undefined' && wsBars[ws]) ? wsBars[ws] : []; }
function _wsSessOf(ws){ return (typeof wsSessions!=='undefined' && wsSessions[ws]) ? wsSessions[ws] : []; }
function _wsWBarsOf(ws){ return (typeof wsWorkerBars!=='undefined' && wsWorkerBars[ws]) ? wsWorkerBars[ws] : []; }
function _wsWSessOf(ws){ return (typeof wsWorkerSessions!=='undefined' && wsWorkerSessions[ws]) ? wsWorkerSessions[ws] : []; }
const _wsIsWorker=()=>window._roleLock==='worker';
/* القائمة النشطة حسب الدور: العامل قائمته المنفصلة، المسؤول قائمة المخزون */
function _wsActiveBars(ws){ return _wsIsWorker()? _wsWBarsOf(ws) : _wsBarsOf(ws); }
function _wsActiveSess(ws){ return _wsIsWorker()? _wsWSessOf(ws) : _wsSessOf(ws); }
/* الروتور — محلي كما في rafinag (لا يُزامن؛ يُحفظ داخل الجلسة عند الحفظ) */
let _wsRotor={workshop1:[],workshop2:[]};
window.wsAddRotor=function(){
    const w=parseFloat(document.getElementById('rotorW')?.value)||0;
    const k=parseFloat(document.getElementById('rotorK')?.value)||0;
    if(w<=0||k<=0)return toast('أدخل ميزان وعيار الروتور','error');
    _wsRotor[_wsCur].unshift({id:'r'+Date.now(),w,k});
    const a=document.getElementById('rotorW'),bq=document.getElementById('rotorK');
    if(a)a.value='';if(bq)bq.value='';a?.focus();
    renderWorkshops();
};
window.wsDelRotor=function(id){
    _wsRotor[_wsCur]=_wsRotor[_wsCur].filter(r=>r.id!==id);
    renderWorkshops();
};
function _wsRotorRaw(){return _wsRotor[_wsCur].reduce((s,r)=>s+(r.w||0),0);}
function _wsRotorPure(){return _wsRotor[_wsCur].reduce((s,r)=>s+(r.w*r.k/1000),0);}

window.setWsCur = function(ws){
    if(window._wsLock && ws!==window._wsLock) ws=window._wsLock;   /* العامل مقفول على ورشته */
    _wsCur = WS_LIST[ws] ? ws : 'workshop1';
    renderWorkshops();
    setTimeout(()=>document.getElementById('wsW')?.focus(),30);
};

window.wsAddBar = function(){
    const w = parseFloat(document.getElementById('wsW')?.value)||0;
    const k = parseFloat(document.getElementById('wsK')?.value)||0;
    if(w<=0||k<=0) return toast('أدخل ميزان وعيار صحيحين','error');
    if(_wsIsWorker())emitEvent('WS_WBARADD',{ws:_wsCur,id:uid(),w,k},null);
    else emitEvent('WS_BARADD',{ws:_wsCur,id:uid(),w,k,src730:true},null);   /* رصيد/إيداع مباشر — لا يمسّ مخزون 730 */
    const wi=document.getElementById('wsW'), ki=document.getElementById('wsK');
    if(wi)wi.value=''; if(ki)ki.value='';
    wi?.focus();
};

window.wsDelBar = function(id){
    if(_wsIsWorker()){ emitEvent('WS_WBARDEL',{ws:_wsCur,id},null); return; }
    const bar=_wsBarsOf(_wsCur).find(b=>b.id===id);
    if(bar&&bar.src730){
        /* محوَّلة من المخزون → تعود إليه، لا تختفي */
        emitEvent('WS_RETURN',{ws:_wsCur,barId:id,wsName:WS_LIST[_wsCur]},null);
        toast('📦 أُرجعت السبيكة إلى مخزون 730','info');
        return;
    }
    emitEvent('WS_BARDEL',{ws:_wsCur,id},null);
};

/* ═══ السلعة المبدئية: تدخل مخزون 24 فوراً قبل حفظ الحساب ═══ */
window.wsProvisionalAdd = function(){
    const mfg=parseFloat(document.getElementById('wsMfg')?.value)||0;
    if(mfg<=0)return toast('اكتب وزن السلعة أولاً','error');
    /* ألغِ أي مبدئي سابق لهذه الورشة (استبدال لا تراكم) */
    emitEvent('WS_PROVISIONAL_DEL',{ws:_wsCur},null);
    const dt=new Date().toLocaleDateString('fr-FR');
    const bid='PROV-'+uid();
    const barsAdd24=[{id:bid,pool:'24',w:mfg,k:1000}];
    const dispBars={[bid]:{desc:'سلعة مبدئية - ورشة '+WS_LIST[_wsCur],dt,src:'مبدئي'}};
    emitEvent('WS_PROVISIONAL',{ws:_wsCur,barsAdd24},{bars:dispBars});
    toast('✅ دخلت '+fmt(mfg,2)+' غ للمخزون (مبدئياً)','success');
    if(typeof updAll==='function')updAll();
    wsUpdateProvBadge();
};
/* تحديث شارة الحالة: كم سلعة مبدئية بالمخزون لهذه الورشة */
window.wsUpdateProvBadge = function(){
    const badge=document.getElementById('wsProvBadge'); if(!badge)return;
    let provW=0;
    try{
        const _g24=(typeof g24!=='undefined'&&Array.isArray(g24))?g24:[];
        provW=_g24.filter(b=>b._prov&&b._provWs===_wsCur).reduce((s,b)=>s+(b.w||0),0);
    }catch(e){}
    if(provW>0.001){ badge.style.display='block'; badge.textContent='⏳ مبدئي بالمخزون: '+fmt(provW,2)+' غ (يُلغى عند حفظ الحساب)'; }
    else badge.style.display='none';
};

window.wsSaveSession = function(){
    if(_wsIsWorker()){
        /* جلسة العامل: أرشيف خاص به — لا تحرّك المخزون إطلاقاً */
        const bars=_wsWBarsOf(_wsCur).filter(b=>(b.w||0)>0.001);
        if(!bars.length) return toast('لا توجد سبائك مسجّلة','error');
        const mfg=parseFloat(document.getElementById('wsMfg')?.value)||0;
        if(mfg<=0) return toast('أدخل السلعة الواجدة قبل الحفظ','error');
        const totalRaw=bars.reduce((s,b)=>s+(b.w||0),0);
        const totalPure=bars.reduce((s,b)=>s+(b.w*b.k/1000),0);
        const remRaw=Math.max(0,totalRaw-_wsRotorRaw());
        const remPure=Math.max(0,totalPure-_wsRotorPure());
        const _consumedW=bars.map(b=>b.id).filter(Boolean);
        emitEvent('WS_WSESSION',{ws:_wsCur,clearBars:true,consumedBarIds:_consumedW,session:{
            id:'WSKW-'+uid(),date:new Date().toLocaleDateString('fr-FR'),
            rawWeight:remRaw,pure24:remPure,mfgWeight:mfg,lapart:mfg-remPure,
            lingotsCount:bars.length,lingots:bars.map(b=>({weight:b.w,karat:b.k})),
            rotorItems:_wsRotor[_wsCur].map(r=>({weight:r.w,karat:r.k})),
            wsTitle:WS_LIST[_wsCur]}},null);
        _wsRotor[_wsCur]=[];
        const mi=document.getElementById('wsMfg'); if(mi)mi.value='';
        toast('✅ حُفظت جلستك في أرشيفك');
        try{_wsMakeSessionPdf(_wsWSessOf(_wsCur)[0]||null);}catch(e){}
        return;
    }
    const bars = _wsBarsOf(_wsCur).filter(b=>(b.w||0)>0.001);
    if(!bars.length) return toast('لا توجد سبائك مسجّلة','error');
    const mfg = parseFloat(document.getElementById('wsMfg')?.value)||0;
    if(mfg<=0) return toast('أدخل السلعة الواجدة قبل الحفظ','error');
    const totalRaw  = bars.reduce((s,b)=>s+(b.w||0),0);
    const totalPure = bars.reduce((s,b)=>s+(b.w*b.k/1000),0);
    const lapart = mfg - totalPure;
    /* المخزون: تُخصم من 730 فقط السبائك المُدخلة يدوياً —
       المحوَّلة من المخزون (src730) خرجت منه لحظة التحويل، فخصمها هنا ازدواج */
    const manualRaw = bars.filter(b=>!b.src730).reduce((s,b)=>s+(b.w||0),0);
    const avail730 = g730.reduce((s,b)=>s+(b.w||0),0);
    if(manualRaw > avail730+0.001) return toast(`⚠️ مخزون 730 غير كافٍ (متاح: ${fmt(avail730,2)} غ)`,'error');
    const {barsRemove:barsRemove730,barUpdates:barUpdates730} = manualRaw>0.001 ? _pickBarsToRemove('730',manualRaw) : {barsRemove:[],barUpdates:[]};
    /* السلعة الواجدة تدخل مخزون 24 */
    const dt=new Date().toLocaleDateString('fr-FR');
    const bid=uid();
    const barsAdd24=[{id:bid,pool:'24',w:mfg,k:1000}];
    const dispBars={[bid]:{desc:'ورشة '+WS_LIST[_wsCur]+' - سلعة واجدة',dt,src:'ورشة'}};
    const remRaw=Math.max(0,totalRaw-_wsRotorRaw());
    const remPure=Math.max(0,totalPure-_wsRotorPure());
    /* الروتور: سبائك 730 ناتجة تعود لمخزون الـ730 */
    const rotorBars730=_wsRotor[_wsCur].map(r=>({id:uid(),pool:'730',w:r.w,k:r.k}));
    rotorBars730.forEach(rb=>{ dispBars[rb.id]={desc:'روتور ورشة '+WS_LIST[_wsCur],dt,src:'روتور'}; });
    const session = {
        id:'WSK-'+uid(), date:dt,
        rawWeight:remRaw, pure24:remPure, mfgWeight:mfg, lapart:mfg-remPure,
        lingotsCount:bars.length, lingots:bars.map(b=>({weight:b.w,karat:b.k})),
        rotorItems:_wsRotor[_wsCur].map(r=>({weight:r.w,karat:r.k})),
        wsTitle:WS_LIST[_wsCur]
    };
    /* معرّفات السبائك المستهلكة — لإزالة دقيقة (لا تفريغ أعمى) تسمح باستعادة صحيحة */
    const consumedBarIds=bars.map(b=>b.id).filter(Boolean);
    emitEvent('WS_SESSION',
        {ws:_wsCur,session,barsRemove730,barUpdates730,barsAdd24,
         ...(rotorBars730.length?{barsAdd730:rotorBars730}:{}),
         consumedBarIds,clearBars:true},
        {bars:dispBars}
    );
    _wsRotor[_wsCur]=[];
    const mi=document.getElementById('wsMfg'); if(mi)mi.value='';
    toast('✅ الجلسة محفوظة: 730 −'+fmt(totalRaw,2)+'غ · 24 +'+fmt(mfg,2)+'غ · لابارت '+fmt(lapart,3)+'غ');
    try{_wsMakeSessionPdf(session);}catch(e){console.error('session pdf',e);}
};

window.wsDelSession = function(id){
    if(_wsIsWorker()){
        if(!confirm('حذف هذه الجلسة من أرشيفك؟'))return;
        emitEvent('WS_WSESSIONDEL',{ws:_wsCur,id},null);
        toast('🗑️ حُذفت الجلسة','info');return;
    }
    if(!confirm('حذف الجلسة وعكس أثرها على المخزون (730 يعود، 24 ينقص)؟')) return;
    if(typeof _voidWsSession==='function' && _voidWsSession(id)){
        toast('↩️ أُلغيت الجلسة وعُكس أثر المخزون','info');
    }else{
        emitEvent('WS_SESSIONDEL',{ws:_wsCur,id},null);
        toast('🗑️ حُذفت الجلسة','info');
    }
};

/* حساب لابارت الحيّ (بمنطق rafinag: بعد خصم الروتور) + معاينة أثر المخزون */
window.wsCalc = function(){
    const bars = _wsActiveBars(_wsCur).filter(b=>(b.w||0)>0.001);
    const totalRaw  = bars.reduce((s,b)=>s+(b.w||0),0);
    const totalPure = bars.reduce((s,b)=>s+(b.w*b.k/1000),0);
    const remRaw =Math.max(0,totalRaw -_wsRotorRaw());
    const remPure=Math.max(0,totalPure-_wsRotorPure());
    const mfg = parseFloat(document.getElementById('wsMfg')?.value)||0;
    const lapart = mfg - remPure;
    const sr=document.getElementById('wsStRaw'); if(sr)sr.textContent=fmt(remRaw,2)+' غ';
    const sp=document.getElementById('wsStPure');if(sp)sp.textContent=fmt(remPure,2)+' غ';
    const el = document.getElementById('wsLapart');
    if(el){ el.textContent = fmt(lapart,3)+' غ'; el.style.color = lapart>=0?'var(--gr)':'var(--rd)'; }
    /* زر الحفظ يتفعّل فقط عند إدخال السلعة الواجدة — كما في rafinag */
    const sb=document.getElementById('wsSaveBtn');
    if(sb){const ok=mfg>0;sb.style.background=ok?'#16a34a':'#888';sb.style.opacity=ok?'1':'.5';sb.style.cursor=ok?'pointer':'not-allowed';}
    const eff = document.getElementById('wsEffect');
    if(eff){
        if(_wsIsWorker()){eff.style.display='none';}
        else{
            eff.style.display='';
            const manualRaw=bars.filter(b=>!b.src730).reduce((s,b)=>s+(b.w||0),0);
            const avail730 = (typeof g730!=='undefined'?g730:[]).reduce((s,b)=>s+(b.w||0),0);
            const short = manualRaw>avail730+0.001;
            eff.innerHTML = totalRaw>0
                ? `عند الحفظ: مخزون 730 <b style="color:var(--rd)">−${fmt(manualRaw,2)}غ</b>`
                  + (short?` <span style="color:var(--rd)">⚠️ غير كافٍ (${fmt(avail730,2)})</span>`:'')
                  + ` · مخزون 24 <b style="color:var(--gr)">+${fmt(mfg,2)}غ</b>`
                  + ` <small style="color:var(--t3)">(المحوَّلة من المخزون خرجت مسبقاً)</small>`
                : 'انقل سبائك من المخزون ثم أدخل السلعة الواجدة';
        }
    }
};

function renderWorkshops(){
    const page = document.getElementById('page-workshops');
    if(!page) return;
    setTimeout(()=>{try{wsUpdateProvBadge();}catch(e){}},50);
    const accent = WS_ACCENT[_wsCur];
    const isWorker=_wsIsWorker();

    /* أزرار اختيار الورشة (المسؤول فقط يبدّل) */
    const tr=document.getElementById('wsTabsRow');
    if(tr)tr.style.display=isWorker?'none':'flex';
    Object.keys(WS_LIST).forEach(ws=>{
        const b=document.getElementById('wsTab_'+ws);
        if(b){
            const on = ws===_wsCur;
            b.style.background = on ? WS_ACCENT[ws]+'22' : 'var(--card)';
            b.style.borderColor = on ? WS_ACCENT[ws] : 'var(--border)';
            b.style.color = on ? 'var(--t)' : 'var(--t2)';
        }
    });

    /* تبويبا الورشة/الأرشيف */
    const wv=document.getElementById('wsView_work'),av=document.getElementById('wsView_archive');
    const wb=document.getElementById('wsWorkBox'),ab=document.getElementById('wsArchiveBox');
    const _on=(b,on,c)=>{if(!b)return;b.style.background=on?(c+'22'):'var(--card)';b.style.borderColor=on?c:'var(--border)';b.style.color=on?'var(--t)':'var(--t2)';};
    _on(wv,_wsView==='work',accent);_on(av,_wsView==='archive',accent);
    if(wb)wb.style.display=_wsView==='work'?'flex':'none';
    if(ab)ab.style.display=_wsView==='archive'?'':'none';

    /* أدوار: العامل يضيف يدوياً، المسؤول ينقل ويطابق */
    const ma=document.getElementById('wsManualAdd');
    if(ma)ma.style.display=isWorker?'flex':'none';   /* الإدخال اليدوي للعامل فقط (أُزيل من المسؤول بطلب المستخدم) */
    const fsb=document.getElementById('wsFromStockBtn');
    if(fsb)fsb.style.display=isWorker?'none':'inline-block';
    const rcb=document.getElementById('wsReconBtn');
    if(rcb)rcb.style.display=isWorker?'none':'inline-flex';

    if(_wsView==='archive'){renderWsArchive();return;}

    const bars = _wsActiveBars(_wsCur).filter(b=>(b.w||0)>0.001);
    const totalPure = bars.reduce((s,b)=>s+(b.w*b.k/1000),0);
    const remPure=Math.max(0,totalPure-_wsRotorPure());

    /* اللافتة — WorkshopTab الإداري في rafinag */
    const bn=document.getElementById('wsBanner');
    if(bn){bn.style.background=`linear-gradient(135deg,${accent}22 0%,${accent}08 60%,transparent 100%)`;bn.style.border=`1px solid ${accent}30`;}
    const bg=document.getElementById('wsBgText');
    if(bg){bg.textContent=WS_SHORT[_wsCur];bg.style.color=accent+'14';bg.style.display=isWorker?'none':'block';}
    const bi=document.getElementById('wsBnIco');
    if(bi){bi.style.background=accent+'20';bi.style.border=`2px solid ${accent}40`;bi.style.boxShadow=`0 4px 20px ${accent}30`;}
    const bl=document.getElementById('wsBnLbl'); if(bl){bl.style.color=accent;bl.textContent=isWorker?'ورشتي':'ورشة التصنيع';}
    const ds=document.getElementById('wsDesc');
    if(ds){ if(isWorker){ds.textContent=WS_LIST[_wsCur];ds.style.color=accent;ds.style.fontSize='1.4rem';ds.style.fontWeight='900';}
            else{ds.textContent=WS_DESC[_wsCur];ds.style.color='var(--t2)';ds.style.fontSize='.76rem';ds.style.fontWeight='600';} }
    const tw=document.getElementById('wsTitleWrap'); if(tw)tw.style.display=isWorker?'none':'block';
    const ttl=document.getElementById('wsTitle');
    if(ttl){ttl.textContent=WS_SHORT[_wsCur];ttl.style.color=accent;ttl.style.textShadow=`0 0 40px ${accent}50`;}
    ['wsChip1','wsChip2'].forEach(id=>{const c=document.getElementById(id);if(c){c.style.background=accent+'15';c.style.border=`1px solid ${accent}30`;}});
    const bc=document.getElementById('wsBnCount'); if(bc){bc.textContent=bars.length;bc.style.color=accent;}
    const bp=document.getElementById('wsBnPure'); if(bp){bp.textContent=fmt(remPure,2);bp.style.color=accent;}
    const abtn=document.getElementById('wsAddBtn'); if(abtn)abtn.style.background=accent;
    const bt=document.getElementById('wsBarsTitle');
    if(bt)bt.textContent=isWorker?('سبائكي في ورشة '+WS_SHORT[_wsCur]):('موازين وحسابات ورشة '+WS_SHORT[_wsCur]);
    const mp=document.getElementById('wsMissPill');
    if(mp){const n=(_wsMiss[_wsCur]||[]).length;mp.style.display=n>0?'inline-block':'none';mp.textContent=n;}

    wsCalc();

    /* جدول السبائك */
    const tb=document.getElementById('wsBarsBody');
    if(tb){
        /* بحث بالوزن/العيار — ينجو من إعادة الرسم */
        const _q=String(window._wsSearchW||'').replace(/\s/g,'').replace(',','.');
        const _barsF=_q?bars.filter(b=>String(b.w).includes(_q)||String(b.k).startsWith(_q)):bars;
        const _si=document.getElementById('wsSearchW');
        if(_si&&_si.value!==String(window._wsSearchW||''))_si.value=window._wsSearchW||'';
        /* بعد المطابقة: غير المطابق يتصدر القائمة */
        const _msSet=new Set(_wsMiss[_wsCur]||[]);
        const _barsSorted=isWorker?_barsF:[..._barsF].sort((a,b)=>((_msSet.has(b.id)?1:0)-(_msSet.has(a.id)?1:0)));
        tb.innerHTML = _barsF.length ? _barsSorted.map(b=>{
            const _miss=!isWorker&&_msSet.has(b.id);
            return `<tr style="border-bottom:1px solid var(--border)${_miss?';background:rgba(239,68,68,.14)':''}">
            <td style="padding:.6rem;text-align:center;font-family:monospace;font-weight:900">${fmt(b.w,3)} غ${b.src730?' <span style="font-size:.56rem;color:#0ea5e9;font-weight:800">📦</span>':''}${(!isWorker)?`<div style="font-size:.56rem;font-weight:700;color:var(--t3);font-family:Tajawal,sans-serif;margin-top:.12rem">${b.desc||(b.src730?'من المخزون':'—')}</div>`:''}</td>
            <td style="padding:.6rem;text-align:center;font-family:monospace;font-weight:800;color:var(--g600)">${b.k}</td>
            <td style="padding:.6rem;text-align:center;font-family:monospace;font-weight:900;color:var(--gr)">${fmt(b.w*b.k/1000,3)} غ</td>
            <td style="padding:.6rem;text-align:center">
                ${(!isWorker&&b.src730)
                    ?`<button onclick="wsDelBar('${b.id}')" style="background:var(--card2);border:1px solid var(--border);border-radius:7px;padding:.3rem .65rem;color:var(--t2);font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;font-size:.72rem">↩️ إرجاع للمخزون</button>`
                    :`${isWorker?`<button onclick="wsEditBar('${b.id}')" style="background:rgba(14,165,233,.1);border:1px solid rgba(14,165,233,.35);border-radius:7px;padding:.3rem .55rem;color:#0ea5e9;font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;font-size:.72rem;margin-left:.3rem">✏️ تعديل</button>`:''}<button onclick="wsDelBar('${b.id}')" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);border-radius:7px;padding:.3rem .65rem;color:var(--rd);font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;font-size:.72rem">🗑️ حذف</button>`}
            </td></tr>`;}).join('')
            : `<tr><td colspan="4" style="padding:1.6rem;text-align:center;color:var(--t3);font-weight:700">${isWorker?'لا توجد سبائك. أضف سبائكك من الأعلى.':'لا توجد سبائك مودعة. حدّد سبائك من مخزون 730 واضغط "نقل".'}</td></tr>`;
    }

    /* الروتور */
    const rc=document.getElementById('rotorCount'); if(rc)rc.textContent='('+_wsRotor[_wsCur].length+')';
    const rb=document.getElementById('rotorBody');
    if(rb){
        rb.innerHTML=_wsRotor[_wsCur].length?_wsRotor[_wsCur].map(r=>`<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:.45rem;text-align:center;font-family:monospace;font-weight:900">${fmt(r.w,3)} غ</td>
            <td style="padding:.45rem;text-align:center;font-family:monospace;font-weight:800;color:var(--g600)">${r.k}</td>
            <td style="padding:.45rem;text-align:center"><button onclick="wsDelRotor('${r.id}')" style="background:transparent;border:none;color:var(--rd);cursor:pointer">🗑️</button></td>
        </tr>`).join('')
        :'<tr><td colspan="3" style="padding:1rem;text-align:center;color:var(--t3);font-size:.74rem;font-weight:700">الروتور فارغ</td></tr>';
    }
}
window.renderWorkshops = renderWorkshops;

/* ═══ تحويل سبيكة من مخزون 730 إلى ورشة ═══ */
window.wsPickWorkshop=function(barId){
    const bar=g730.find(b=>b.id===barId);
    if(!bar)return toast('السبيكة غير موجودة','error');
    let m=document.getElementById('wsPickModal');
    if(!m){
        m=document.createElement('div');m.id='wsPickModal';m.className='modal-overlay';
        m.innerHTML=`<div class="modal-box" style="max-width:300px">
            <div class="modal-header"><h3 style="font-size:.9rem">🔨 تحويل السبيكة إلى ورشة</h3>
            <button class="close-btn" onclick="closeModal('wsPickModal')">✕</button></div>
            <div style="padding:1rem;display:flex;flex-direction:column;gap:.6rem">
                <div id="wsPickInfo" style="background:var(--card2);border-radius:8px;padding:.6rem;font-size:.8rem;text-align:center"></div>
                <button onclick="wsDoXfer('workshop1')" style="padding:.7rem;border-radius:10px;border:1.5px solid #0ea5e9;background:rgba(14,165,233,.1);color:#0ea5e9;font-weight:800;font-family:Tajawal,sans-serif;cursor:pointer">🔨 ورشة دحمون</button>
                <button onclick="wsDoXfer('workshop2')" style="padding:.7rem;border-radius:10px;border:1.5px solid #a855f7;background:rgba(168,85,247,.1);color:#a855f7;font-weight:800;font-family:Tajawal,sans-serif;cursor:pointer">🔨 ورشة صلاح</button>
            </div></div>`;
        document.body.appendChild(m);
    }
    window._wsPickBarId=barId;
    document.getElementById('wsPickInfo').innerHTML=`الوزن: <strong>${fmt(bar.w,2)} غ</strong> — عيار <strong>${fmt(bar.k||730,1)}</strong><br><small style="color:var(--t3)">ستخرج من مخزون 730 وتدخل سبائك الورشة</small>`;
    m.classList.add('active');
};
window.wsDoXfer=function(ws){
    /* وضع جماعي؟ */
    const bulk=window._wsBulkIds;
    if(bulk&&bulk.length&&!window._wsPickBarId){
        const bars=g730.filter(b=>bulk.includes(b.id));
        if(!bars.length)return toast('السبائك غير موجودة','error');
        const tw=bars.reduce((s,b)=>s+(b.w||0),0);
        emitEvent('WS_XFER_BULK',{ws,barIds:bars.map(b=>b.id)},
            {op:{c:WS_LIST[ws],t:'تحويل لورشة',m:'ذهب 730',a:tw,_ts:Date.now(),
                 dt:new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}),
                 bulkCount:bars.length}});
        window._wsBulkIds=null;
        closeModal('wsPickModal');closeModal('invModal');
        toast(`🔨 حُوّلت ${bars.length} سبيكة (${fmt(tw,2)}غ) إلى ${WS_LIST[ws]}`,'success');
        return;
    }
    const barId=window._wsPickBarId;
    const bar=g730.find(b=>b.id===barId);
    if(!bar)return toast('السبيكة غير موجودة','error');
    emitEvent('WS_XFER',{ws,barId},
        {op:{c:WS_LIST[ws],t:'تحويل لورشة',m:'ذهب 730',a:bar.w,_ts:Date.now(),
             dt:new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})}});
    closeModal('wsPickModal');closeModal('invModal');
    toast(`🔨 حُوّلت ${fmt(bar.w,2)}غ إلى ${WS_LIST[ws]}`,'success');
};

/* ═══ تبويب أرشيف الورشة (تجميع شهري كما في rafinag) ═══ */
let _wsView='work';
window.setWsView=function(v){
    _wsView=v==='archive'?'archive':'work';
    renderWorkshops();
};
function _wsMonthKey(dt){ /* dd/mm/yyyy → yyyy-mm */
    const p=(dt||'').split('/');return p.length===3?(p[2]+'-'+p[1]):'غير مؤرّخ';
}
window._wsArchMonth=window._wsArchMonth||'all';
window._wsArchSetMonth=function(v){window._wsArchMonth=v;renderWsArchive();};
function renderWsArchive(){
    const box=document.getElementById('wsArchiveBox');if(!box)return;
    const sessAll=_wsActiveSess(_wsCur);
    if(!sessAll.length){box.innerHTML='<div style="padding:1.2rem;text-align:center;color:var(--t3);font-weight:700">لا توجد جلسات محفوظة بعد</div>';return;}
    /* البطاقات الثلاث: فلترة الشهر + مجموعا السلعة الواجدة ولابارت (للاختيار الحالي) */
    const monthsAll=[...new Set(sessAll.map(s=>_wsMonthKey(s.date)))].sort().reverse();
    const mSel=window._wsArchMonth;
    const sess=(mSel==='all')?sessAll:sessAll.filter(s=>_wsMonthKey(s.date)===mSel);
    const sumM=sess.reduce((a,s)=>a+(s.mfgWeight||0),0);
    const sumL=sess.reduce((a,s)=>a+(s.lapart||0),0);
    /* بطاقة «الكل»: الورشتان معاً (بنفس فلترة الشهر) */
    const bothAll=[..._wsActiveSess('workshop1'),..._wsActiveSess('workshop2')];
    const both=(mSel==='all')?bothAll:bothAll.filter(s=>_wsMonthKey(s.date)===mSel);
    const bM=both.reduce((a,s)=>a+(s.mfgWeight||0),0);
    const bL=both.reduce((a,s)=>a+(s.lapart||0),0);
    const cards=`
    <div style="background:linear-gradient(135deg,#1f2937,#111827);border:1.5px solid #f59e0b55;border-radius:14px;padding:.75rem 1rem;margin-bottom:.6rem;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.5rem">
        <span style="font-weight:900;font-size:.85rem;color:#f59e0b">🏭 الكل — الورشتان معاً <small style="color:#9ca3af;font-weight:700">(${both.length} جلسة)</small></span>
        <span style="display:flex;gap:1.1rem">
            <span style="font-size:.78rem;color:#e5e7eb;font-weight:800">📦 السلعة: <b style="font-family:monospace;color:#fbbf24;letter-spacing:.5px">${fmt(bM,2)} غ</b></span>
            <span style="font-size:.78rem;color:#e5e7eb;font-weight:800">⚖️ لابارت: <b style="font-family:monospace;color:${bL>=0?'#34d399':'#f87171'};letter-spacing:.5px">${fmt(bL,2)} غ</b></span>
        </span>
    </div>`+`
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin-bottom:.9rem">
        <div style="background:var(--card);border:1.5px solid var(--border);border-radius:14px;padding:.7rem;text-align:center">
            <div style="font-size:.68rem;font-weight:800;color:var(--t3);margin-bottom:.35rem">📅 الشهر (فلترة)</div>
            <select onchange="_wsArchSetMonth(this.value)"
                style="width:100%;padding:.5rem;border-radius:10px;border:1.5px solid var(--border);background:var(--card2);color:var(--t);font-family:Tajawal,sans-serif;font-weight:900;font-size:.88rem;text-align:center">
                <option value="all" ${mSel==='all'?'selected':''}>كل الشهور</option>
                ${monthsAll.map(m=>`<option value="${m}" ${mSel===m?'selected':''}>${m}</option>`).join('')}
            </select>
        </div>
        <div style="background:var(--card);border:1.5px solid rgba(217,119,6,.4);border-radius:14px;padding:.7rem;text-align:center">
            <div style="font-size:.68rem;font-weight:800;color:var(--t3);margin-bottom:.35rem">📦 مجموع السلعة الواجدة</div>
            <div style="font-family:monospace;font-weight:900;font-size:1.25rem;color:var(--g600);letter-spacing:.5px">${fmt(sumM,2)} غ</div>
        </div>
        <div style="background:var(--card);border:1.5px solid ${sumL>=0?'rgba(22,163,74,.4)':'rgba(239,68,68,.4)'};border-radius:14px;padding:.7rem;text-align:center">
            <div style="font-size:.68rem;font-weight:800;color:var(--t3);margin-bottom:.35rem">⚖️ مجموع لابارت</div>
            <div style="font-family:monospace;font-weight:900;font-size:1.25rem;color:${sumL>=0?'var(--gr)':'var(--rd)'};letter-spacing:.5px">${fmt(sumL,2)} غ</div>
        </div>
    </div>`;
    if(!sess.length){box.innerHTML=cards+'<div style="padding:1rem;text-align:center;color:var(--t3);font-weight:700">لا جلسات في هذا الشهر</div>';return;}
    const groups={};
    sess.forEach(s=>{const k=_wsMonthKey(s.date);(groups[k]=groups[k]||[]).push(s);});
    box.innerHTML=cards+Object.keys(groups).sort().reverse().map(mk=>{
        const list=groups[mk];
        const tR=list.reduce((a,s)=>a+(s.rawWeight||0),0);
        const tP=list.reduce((a,s)=>a+(s.pure24||0),0);
        const tM=list.reduce((a,s)=>a+(s.mfgWeight||0),0);
        const tL=list.reduce((a,s)=>a+(s.lapart||0),0);
        return `<div style="margin-bottom:.8rem">
            ${list.map(s=>`<div style="border:1px solid var(--border);border-radius:10px;padding:.55rem .7rem;margin-bottom:.4rem;background:var(--card)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.3rem">
                    <span style="font-weight:800;font-size:.76rem">${s.date} — ${s.lingotsCount||0} سبيكة</span>
                    <span>
                        <button onclick="wsSessionPdf('${s.id}')" title="حفظ الحساب PDF" style="background:none;border:none;color:var(--bl);cursor:pointer;font-size:.9rem">📄</button>
                        <button onclick="wsDelSession('${s.id}')" style="background:none;border:none;color:var(--rd);cursor:pointer;font-size:.85rem">🗑️</button>
                    </span>
                </div>
                <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.3rem;font-size:.7rem;text-align:center">
                    <div><div style="color:var(--t3)">خام</div><b>${fmt(s.rawWeight,2)}</b></div>
                    <div><div style="color:var(--t3)">صافي 24</div><b style="color:var(--g600)">${fmt(s.pure24,2)}</b></div>
                    <div><div style="color:var(--t3)">السلعة</div><b>${fmt(s.mfgWeight,2)}</b></div>
                    <div><div style="color:var(--t3)">لابارت</div><b style="color:${(s.lapart||0)>=0?'var(--gr)':'var(--rd)'}">${fmt(s.lapart,3)}</b></div>
                </div>
            </div>`).join('')}
        </div>`;
    }).join('');
}

/* ═══ تحديد متعدد + تحويل جماعي من مخزون 730 ═══ */
/* التحديد محفوظ في مجموعة دائمة — لا يسقط عند البحث/إعادة البناء */
window._invSel=window._invSel||new Set();
window.wsToggleAll=function(on){
    document.querySelectorAll('.wsSel').forEach(cb=>{
        cb.checked=on;
        if(on)window._invSel.add(cb.dataset.bid); else window._invSel.delete(cb.dataset.bid);
    });
    wsUpdSel();
};
window.wsUpdSel=function(cb){
    if(cb&&cb.dataset){ if(cb.checked)window._invSel.add(cb.dataset.bid); else window._invSel.delete(cb.dataset.bid); }
    /* نظّف المجموعة من سبائك لم تعد موجودة */
    const live=new Set(g730.map(b=>b.id));
    [...window._invSel].forEach(id=>{ if(!live.has(id))window._invSel.delete(id); });
    const n=window._invSel.size;
    const tw=g730.filter(b=>window._invSel.has(b.id)).reduce((s,b)=>s+(b.w||0),0);
    const el=document.getElementById('wsSelCount');
    if(el)el.textContent=n?`${n} سبيكة — ${fmt(tw,2)} غ`:'';
    const all=document.querySelectorAll('.wsSel');
    const visSel=[...all].filter(c=>c.checked);
    const sa=document.getElementById('wsSelAll');
    if(sa)sa.checked=all.length>0&&visSel.length===all.length;
};
window.wsBulkXfer=function(){
    const ids=[...window._invSel];
    if(!ids.length)return toast('حدّد سبيكة واحدة على الأقل','error');
    window._wsBulkIds=ids;
    /* نفس نافذة اختيار الورشة — بوضع جماعي */
    let m=document.getElementById('wsPickModal');
    if(!m){wsPickWorkshop(ids[0]);m=document.getElementById('wsPickModal');m.classList.remove('active');}
    window._wsPickBarId=null;
    const tw=g730.filter(b=>ids.includes(b.id)).reduce((s,b)=>s+(b.w||0),0);
    document.getElementById('wsPickInfo').innerHTML=`<strong>${ids.length} سبيكة</strong> — المجموع <strong>${fmt(tw,2)} غ</strong><br><small style="color:var(--t3)">ستخرج كلها من مخزون 730 وتدخل سبائك الورشة</small>`;
    m.classList.add('active');
};

/* ═══ مطابقة مع العامل — خوارزمية rafinag الحرفية ═══
   لكل سبيكة عند المسؤول نبحث عن نظير عند العامل: نفس العيار ووزن ±0.005غ.
   ما لا نظير له = غير مطابق (أحمر). */
let _wsMiss={workshop1:[],workshop2:[]};
function reconcileBars(adminBars,workerBars){
    /* اتجاهان: ما لا نظير له عندي (أحمر عندي) + ما لا نظير له عند العامل (أحمر عنده) */
    const pool=(workerBars||[]).filter(b=>(b.w||0)>0.001).map(b=>({id:b.id,w:b.w,k:b.k,used:false}));
    const miss=[];
    (adminBars||[]).filter(b=>(b.w||0)>0.001).forEach(b=>{
        const i=pool.findIndex(p=>!p.used&&p.k===b.k&&Math.abs(p.w-b.w)<0.005);
        if(i>=0)pool[i].used=true;else miss.push(b.id);
    });
    const missW=pool.filter(p=>!p.used).map(p=>p.id);
    return {miss,missW};
}
window.wsReconcile=function(){
    const adminBars=_wsBarsOf(_wsCur);
    const workerBars=_wsWBarsOf(_wsCur);
    if(!workerBars.length&&!adminBars.length)return toast('لا سبائك للمقارنة','info');
    const r=reconcileBars(adminBars,workerBars);
    _wsMiss[_wsCur]=r.miss;
    renderWorkshops();
    _wsShowReconcileReport(adminBars,workerBars,r);
};
/* ═══ تقرير المطابقة: عمودان، غير المتطابق أولاً وبالأحمر ═══ */
function _wsShowReconcileReport(adminBars,workerBars,r){
    const mi=new Set(r.miss), mw=new Set(r.missW);
    const sortF=(arr,ms)=>[...arr].filter(b=>(b.w||0)>0.001)
        .sort((a,b)=>((ms.has(b.id)?1:0)-(ms.has(a.id)?1:0))||((b.w||0)-(a.w||0)));
    const row=(b,bad)=>`<div style="display:flex;justify-content:space-between;padding:.34rem .55rem;border-radius:8px;margin-bottom:.25rem;font-family:monospace;font-weight:800;font-size:.82rem;
        ${bad?'background:rgba(239,68,68,.14);border:1.5px solid rgba(239,68,68,.5);color:#ef4444':'background:rgba(52,211,153,.07);border:1px solid rgba(52,211,153,.25);color:var(--t2)'}">
        <span>${fmt(b.w,2)} غ</span><span>عيار ${b.k}</span>${bad?'<span>⚠️</span>':'<span>✓</span>'}</div>`;
    const colA=sortF(adminBars,mi).map(b=>row(b,mi.has(b.id))).join('')||'<div style="color:var(--t3);text-align:center;font-size:.75rem">لا سبائك</div>';
    const colW=sortF(workerBars,mw).map(b=>row(b,mw.has(b.id))).join('')||'<div style="color:var(--t3);text-align:center;font-size:.75rem">لا سبائك</div>';
    const ok=(r.miss.length===0&&r.missW.length===0);
    let m=document.getElementById('wsRecModal'); if(m)m.remove();
    m=document.createElement('div');m.id='wsRecModal';
    m.style.cssText='position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:1rem';
    m.innerHTML=`<div style="background:var(--card);border:1.5px solid var(--border);border-radius:16px;max-width:560px;width:100%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 14px 50px rgba(0,0,0,.55);padding:1rem;font-family:Tajawal,sans-serif">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
            <h3 style="margin:0;font-size:.95rem;color:${ok?'var(--gr)':'#ef4444'}">${ok?'✅ الميزانان متطابقان':'⚠️ مطابقة الميزانين — غير المتطابق أولاً'}</h3>
            <button onclick="document.getElementById('wsRecModal').remove()" style="border:none;background:rgba(239,68,68,.1);color:#ef4444;border-radius:8px;width:30px;height:30px;font-weight:900;cursor:pointer">✕</button>
        </div>
        <div style="display:flex;gap:.7rem;overflow:hidden;flex:1">
            <div style="flex:1;display:flex;flex-direction:column;min-width:0">
                <div style="font-weight:900;font-size:.76rem;color:var(--t2);text-align:center;margin-bottom:.35rem">🧑‍💼 سبائكي (${adminBars.length}) — غير مطابق: <b style="color:#ef4444">${r.miss.length}</b></div>
                <div style="overflow-y:auto">${colA}</div>
            </div>
            <div style="width:1.5px;background:var(--border)"></div>
            <div style="flex:1;display:flex;flex-direction:column;min-width:0">
                <div style="font-weight:900;font-size:.76rem;color:var(--t2);text-align:center;margin-bottom:.35rem">👷 سبائك العامل (${workerBars.length}) — غير مطابق: <b style="color:#ef4444">${r.missW.length}</b></div>
                <div style="overflow-y:auto">${colW}</div>
            </div>
        </div></div>`;
    m.onclick=e=>{if(e.target===m)m.remove();};
    document.body.appendChild(m);
}


/* ═══════════ PDF حساب الجلسة (الورشة) ═══════════ */
window.wsSessionPdf=function(sid){
    const s=_wsActiveSess(_wsCur).find(x=>x.id===sid);
    if(!s)return toast('الجلسة غير موجودة','error');
    _wsMakeSessionPdf(s);
};
function _wsMakeSessionPdf(s){
    const wsName=(typeof WS_LIST!=='undefined'&&WS_LIST[_wsCur])||'الورشة';
    const _lings=(s.lingots||s.bars||[]).map(b=>({w:b.weight!=null?b.weight:b.w,k:b.karat!=null?b.karat:(b.k||730)}));
    const rows=_lings.map((b,i)=>
        `<tr><td style="padding:5px;border:1px solid #ddd;text-align:center">${i+1}</td>
             <td style="padding:5px;border:1px solid #ddd;text-align:center;font-weight:700">${fmt(b.w,2)} غ</td>
             <td style="padding:5px;border:1px solid #ddd;text-align:center">${b.k}</td>
             <td style="padding:5px;border:1px solid #ddd;text-align:center">${fmt((b.w||0)*(b.k||0)/1000,2)} غ</td></tr>`).join('');
    const html=`
    <div dir="rtl" style="font-family:Tajawal,Arial,sans-serif;padding:16px;color:#222;max-width:560px">
        <div style="text-align:center;border-bottom:2.5px solid #b45309;padding-bottom:8px;margin-bottom:10px">
            <div style="font-size:20px;font-weight:900;color:#b45309">🔨 حساب جلسة — ${wsName}</div>
            <div style="font-size:12px;color:#666">${s.date} · ${s.lingotsCount||_lings.length} سبيكة</div>
        </div>
        ${rows?`<table style="width:100%;border-collapse:collapse;font-size:12px;margin-bottom:10px">
            <tr style="background:#7f1d1d;color:#fbbf24">
                <th style="padding:6px;border:1px solid #ddd">#</th>
                <th style="padding:6px;border:1px solid #ddd">الوزن</th>
                <th style="padding:6px;border:1px solid #ddd">العيار</th>
                <th style="padding:6px;border:1px solid #ddd">الخالص</th></tr>
            ${rows}</table>`:''}
        <table style="width:100%;border-collapse:collapse;font-size:14px;font-weight:900">
            <tr>
                <td style="padding:8px;border:1px solid #ccc;background:#fafafa;text-align:center">الخام<br><span style="font-size:17px">${fmt(s.rawWeight,2)} غ</span></td>
                <td style="padding:8px;border:1px solid #ccc;background:#fff7ed;text-align:center;color:#b45309">صافي 24<br><span style="font-size:17px">${fmt(s.pure24,2)} غ</span></td>
                <td style="padding:8px;border:1px solid #ccc;background:#fafafa;text-align:center">السلعة<br><span style="font-size:17px">${fmt(s.mfgWeight,2)} غ</span></td>
                <td style="padding:8px;border:1px solid #ccc;background:${(s.lapart||0)>=0?'#f0fdf4':'#fef2f2'};text-align:center;color:${(s.lapart||0)>=0?'#16a34a':'#dc2626'}">لابارت<br><span style="font-size:17px">${fmt(s.lapart,3)} غ</span></td>
            </tr>
        </table>
        <div style="margin-top:14px;font-size:11px;color:#888;text-align:left">GoldPro · ${new Date().toLocaleString('fr-FR')}</div>
    </div>`;
    const opts={margin:6,filename:`جلسة-${wsName}-${(s.date||'').replace(/[/:]/g,'-')}.pdf`,
        html2canvas:{scale:2},jsPDF:{format:'a5',orientation:'portrait'}};
    html2pdf().set(opts).from(html).save();
    toast('📄 جارٍ حفظ PDF الجلسة','info');
}


/* ═══════════ تعديل سبيكة العامل (وزن/عيار) — نافذة داخلية ═══════════ */
window.wsEditBar=function(id){
    if(!_wsIsWorker())return;
    const b=_wsWBarsOf(_wsCur).find(x=>x.id===id);
    if(!b)return toast('السبيكة غير موجودة','error');
    let m=document.getElementById('wsEditBarModal'); if(m)m.remove();
    m=document.createElement('div');m.id='wsEditBarModal';
    m.style.cssText='position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:1rem';
    m.innerHTML=`<div style="background:var(--card);border:1.5px solid #0ea5e9;border-radius:16px;max-width:300px;width:100%;box-shadow:0 14px 50px rgba(0,0,0,.55);padding:1rem;font-family:Tajawal,sans-serif">
        <div style="font-weight:900;color:#0ea5e9;text-align:center;margin-bottom:.7rem;font-size:.9rem">✏️ تعديل السبيكة</div>
        <label style="font-size:.68rem;font-weight:800;color:var(--t2)">الميزان (غ)</label>
        <input id="wsEbW" type="text" inputmode="decimal" dir="ltr" value="${String(b.w).replace('.',',')}"
            style="width:100%;box-sizing:border-box;padding:.55rem;border-radius:9px;border:1.5px solid var(--border);background:var(--card2);color:var(--t);font-family:monospace;font-weight:900;font-size:1rem;text-align:center;margin:.25rem 0 .6rem">
        <label style="font-size:.68rem;font-weight:800;color:var(--t2)">العيار</label>
        <input id="wsEbK" type="text" inputmode="numeric" dir="ltr" value="${b.k}"
            style="width:100%;box-sizing:border-box;padding:.55rem;border-radius:9px;border:1.5px solid var(--border);background:var(--card2);color:var(--t);font-family:monospace;font-weight:900;font-size:1rem;text-align:center;margin:.25rem 0 .8rem">
        <div style="display:flex;gap:.5rem">
            <button onclick="_wsEbSave('${id}')" style="flex:1;padding:.6rem;border:none;border-radius:10px;background:#0ea5e9;color:#fff;font-weight:900;font-family:Tajawal,sans-serif;cursor:pointer">✔️ حفظ</button>
            <button onclick="document.getElementById('wsEditBarModal').remove()" style="flex:1;padding:.6rem;border:1.5px solid var(--border);border-radius:10px;background:transparent;color:var(--t2);font-weight:800;font-family:Tajawal,sans-serif;cursor:pointer">إلغاء</button>
        </div></div>`;
    m.onclick=e=>{if(e.target===m)m.remove();};
    document.body.appendChild(m);
    setTimeout(()=>{const w=document.getElementById('wsEbW');if(w){w.focus();w.select&&w.select();}},80);
};
window._wsEbSave=function(id){
    const w=parseFloat(String(document.getElementById('wsEbW').value||'').replace(/\s/g,'').replace(',','.'));
    const k=parseFloat(String(document.getElementById('wsEbK').value||'').replace(',','.'));
    if(!w||w<=0)return toast('ميزان غير صالح','error');
    if(!k||k<=0||k>1000)return toast('عيار غير صالح','error');
    emitEvent('WS_WBAREDIT',{ws:_wsCur,id,w,k},null);
    const m=document.getElementById('wsEditBarModal'); if(m)m.remove();
    renderWorkshops();
    toast(`✏️ عُدِّلت السبيكة: ${fmt(w,2)} غ @ ${k}`,'success');
};
