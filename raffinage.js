window.RAF_JS_VER='v298';
/* ═══════════ RAFFINAGE ═══════════ */
let rafRows=4;
const _rafSentIds=new Set();

/* ═══ وضع الرافيناج: مصفّي (عثمان) أو تصفية زبون ═══ */
let _rafMode='customer';  /* الافتراضي: تصفية زبون (زرا خالص/غير خالص ظاهران) — كتابة «عثمان» تقلبه تلقائياً */
let _rafSettled=true;     /* فرع الزبون فقط: خالصة (true) أم على الحساب/دين (false) */
window.setRafMode=function(m){ _rafMode=(m==='customer'?'customer':'refiner'); applyRafModeUI(); calcRaf(); };
/* اختيار تلقائي: الاسم فيه «عثمان» = مصفٍّ، غيره = تصفية زبون */
window.autoRafMode=function(){
    const n=(document.getElementById('rafCustomer')?.value||'').trim().replace(/\s+/g,' ');
    if(n){
        const m=n.includes('عثمان')?'refiner':'customer';
        if(m!==_rafMode)setRafMode(m);
    }
    calcRaf();   /* الرصيد السابق يتحدّث مع كل حرف من الاسم */
};
window.setRafSettled=function(s){ _rafSettled=!!s; applyRafModeUI(); calcRaf(); };
function applyRafModeUI(){
    const on='raf-mode-on';
    const bRef=document.getElementById('rafModeRefiner'), bCus=document.getElementById('rafModeCustomer');
    if(bRef)bRef.classList.toggle(on,_rafMode==='refiner');
    if(bCus)bCus.classList.toggle(on,_rafMode==='customer');
    const sw=document.getElementById('rafSettledWrap');
    if(sw)sw.style.display=_rafMode==='customer'?'flex':'none';
    const bPaid=document.getElementById('rafSettledPaid'), bDebt=document.getElementById('rafSettledDebt');
    if(bPaid)bPaid.classList.toggle(on,_rafSettled);
    if(bDebt)bDebt.classList.toggle(on,!_rafSettled);
    /* الشبكة موحّدة للجميع كنموذج عثمان: صفا الرصيد السابق ظاهران دائماً.
       صوارد/لانقو (مدفوعات عثمان) وحدهما يبقيان لفرع المصفّي. */
    const rowPrev=document.querySelector('#page-raffinage .raf-row-prev');
    const rowLbls=document.querySelector('#page-raffinage .raf-row-labels');
    if(rowPrev)rowPrev.style.display='';
    if(rowLbls)rowLbls.style.display='';
    /* صوارد/لانقو ظاهران للجميع (تطابق تام مع عثمان) — يُعطَّلان في «خالصة» */
    const _lockSL=(_rafMode==='customer'&&_rafSettled);
    ['rafSawared','rafLanqo'].forEach(id=>{
        const e=document.getElementById(id);
        if(!e)return;
        const cell=e.closest('div'); if(cell)cell.style.display='';
        e.disabled=_lockSL;
        if(_lockSL)e.value='';
        e.style.opacity=_lockSL?'.4':'1';
    });
    const ci=document.getElementById('rafCustomer');
    if(ci)ci.placeholder=_rafMode==='refiner'?'🏭 المصفّي (عثمان)...':'👤 الزبون...';
}

/* ═══ محرّك رسوم الزبائن (مطابق لِـ rafinag) ═══
   عبد الله شلف: الأجرة على الصافي 24 | صلاح: بلا أجرة | الباقي: على الخام */
const CUST_FEE_RULES = {
    'عبد الله شلف': { invoiceFee:'net'  },
    'صلاح':         { invoiceFee:'none' }
};
function _normName(n){ return (n||'').trim().replace(/\s+/g,' '); }
function custFeeMode(name){
    const r=CUST_FEE_RULES[_normName(name)];
    return (r&&r.invoiceFee)?r.invoiceFee:'raw';
}
/* يُرجع قيمة الأجرة بالدينار حسب قاعدة الزبون */
function calcCustFee(name,rawW,eq24,feeRate){
    const m=custFeeMode(name);
    if(m==='none')return 0;
    if(m==='net') return eq24*feeRate;
    return rawW*feeRate;
}
function _feeRuleLabel(name){
    const m=custFeeMode(name);
    return m==='none'?'بدون أجرة (صلاح)':m==='net'?'الأجرة على الصافي 24':'الأجرة على الخام';
}
function rafInputRow(i){
    /* اسم عشوائي لكل رسم: كروم يفهرس اقتراحاته بالاسم الثابت — العشوائية تعدمها */
    const rnd=Math.random().toString(36).slice(2,9);
    return`<tr>
        <td class="inv-rn">${i}</td>
        <td><input type="text" inputmode="decimal" class="inv-ci" id="rafW_${i}" name="w_${rnd}_${i}" placeholder="" autocomplete="off"
            oninput="calcRaf()" onkeydown="rafNav(event,${i},'w')"></td>
        <td><input type="text" inputmode="decimal" class="inv-ci" id="rafK_${i}" name="k_${rnd}_${i}" autocomplete="off"
            oninput="calcRaf()" onkeydown="rafNav(event,${i},'k')"></td>
        <td class="raf-pure-cell" id="rafPure_${i}"></td>
    </tr>`;
}
window.rafNav=(e,row,col)=>{
    const order=['w','k'];
    const ci=order.indexOf(col);
    const gel=(c,r)=>document.getElementById((c==='w'?'rafW_':'rafK_')+r);
    /* تركيز + إحضار السطر لوسط الشاشة (النزول لا يخفي ما تكتب) */
    const gfoc=(c,r)=>{const e=gel(c,r);if(e){e.focus();try{e.scrollIntoView({block:'center',behavior:'smooth'});}catch(_){}}};
    if(e.key==='Enter'||e.key==='Tab'){
        e.preventDefault();
        if(col==='w')gfoc('k',row);
        else if(row<rafRows)gfoc('w',row+1);
        else addRafRow();
    }else if(e.key==='ArrowDown'){
        e.preventDefault();
        if(row<rafRows)gfoc(col,row+1);
    }else if(e.key==='ArrowUp'){
        e.preventDefault();
        if(row>1)gfoc(col,row-1);
    }else if(e.key==='ArrowRight'){
        /* RTL: يمين = عمود سابق (الوزن يمين العيار) */
        e.preventDefault();
        if(ci>0)gfoc(order[ci-1],row);
    }else if(e.key==='ArrowLeft'){
        /* RTL: يسار = عمود تالي */
        e.preventDefault();
        if(ci<order.length-1)gfoc(order[ci+1],row);
    }
};
window.addRafRow=function(noFocus){
    rafRows++;
    const tbody=document.getElementById('rafTableBody');
    tbody.insertAdjacentHTML('beforeend',rafInputRow(rafRows));
    if(!noFocus)_rafFocusRow('rafW_'+rafRows);
};
/* تركيز يُحضر السطر لوسط الشاشة — النزول لم يعد يخفي ما تكتبه */
window._rafFocusRow=function(id){
    const el=document.getElementById(id);
    if(!el)return;
    el.focus();
    try{el.scrollIntoView({block:'center',behavior:'smooth'});}catch(e){el.scrollIntoView();}
};
window.initRafTable=()=>{
    rafRows=4;
    let h='';for(let i=1;i<=rafRows;i++)h+=rafInputRow(i);
    document.getElementById('rafTableBody').innerHTML=h;
};
window.showRafBalance=()=>calcRaf();
function _checkRafDupes(){
    const seen={};
    for(let i=1;i<=rafRows;i++){
        const w=parseFloat(String(document.getElementById('rafW_'+i)?.value||'').replace(',','.'))||0;
        if(!w)continue;
        const k=parseFloat(String(document.getElementById('rafK_'+i)?.value||'').replace(',','.'))||730;
        const key=`${Math.round(w*1000)}|${Math.round(k*10)}`;
        (seen[key]=seen[key]||[]).push(i);
    }
    const rows=document.querySelectorAll('#rafTableBody tr');
    rows.forEach((tr,idx)=>{
        const i=idx+1;
        const w=parseFloat(String(document.getElementById('rafW_'+i)?.value||'').replace(',','.'))||0;
        const k=parseFloat(String(document.getElementById('rafK_'+i)?.value||'').replace(',','.'))||730;
        const key=`${Math.round(w*1000)}|${Math.round(k*10)}`;
        const isDup=w>0&&seen[key]&&seen[key].length>1;
        tr.style.background=isDup?'rgba(239,68,68,.13)':'';
        tr.style.outline=isDup?'1.5px solid rgba(239,68,68,.4)':'';
        tr.title=isDup?'⚠️ وزن وعيار مكرر!':'';
    });
}
window.calcRaf=()=>{
    try{_checkRafDupes();}catch(e){}
    try{const _f=document.getElementById('rafFee'),_b=document.getElementById('rafFeeBtn');
        if(_f&&_b){const v=parseFloat(_f.value)||0;_b.textContent=v?v.toLocaleString('fr-FR'):'0';}}catch(e){}
    const c=document.getElementById('rafCustomer').value.trim();
    let totalPure=0,totalW=0;
    for(let i=1;i<=rafRows;i++){
        const w=parseFloat(String(document.getElementById('rafW_'+i)?.value||'').replace(',','.'))||0;
        const k=parseFloat(String(document.getElementById('rafK_'+i)?.value||'').replace(',','.'))||730;
        const pure=w*k/1000;
        totalW+=w;totalPure+=pure;
        const cell=document.getElementById('rafPure_'+i);
        if(cell)cell.textContent=pure>0?fmt(pure,2):'';
    }
    /* نمو تلقائي: بمجرّد امتلاء الصف الأخير يُضاف صف جديد */
    if((parseFloat(document.getElementById('rafW_'+rafRows)?.value)||0)>0)addRafRow(true);
    const feeRate=parseFloat(document.getElementById('rafFee')?.value)||0;
    const totalDinar=totalW*feeRate;
    document.getElementById('rafDinarTotal').textContent=fmt(totalDinar,0);
    document.getElementById('rafPureTotal').textContent=fmt(totalPure,2)+' غ';
    const gEl=document.getElementById('rafFinalGold');
    const dEl=document.getElementById('rafFinalDinar');

    if(_rafMode==='customer'){
        /* ── فرع الزبون: أجرة حسب قاعدة الزبون ── */
        const totalFee=calcCustFee(c,totalW,totalPure,feeRate);
        document.getElementById('rafDinarTotal').textContent=fmt(totalFee,0);
        const ruleEl=document.getElementById('rafFeeRule');
        if(ruleEl){ruleEl.textContent='⚖️ '+_feeRuleLabel(c);ruleEl.style.display=_rafMode==='customer'?'block':'none';}
        /* الرصيد السابق للزبون — يُعرض في نفس خانتَي عثمان */
        const _pd=c?getCustBal(c,'دينار'):0;
        const _pg=c?getCustBal(c,'ذهب 24'):0;
        const pd1=document.getElementById('rafPrevDinarDisp'); if(pd1)pd1.textContent=fmt(_pd,0);
        const pg1=document.getElementById('rafPrevGoldDisp'); if(pg1)pg1.textContent=fmt(_pg,2)+' غ';
        const pv=document.getElementById('rafCustPrev'); if(pv)pv.style.display='none';
        const avail24=g24.reduce((s,b)=>s+(b.w||0),0);
        /* النهائي تراكمي كنموذج عثمان — بالمرآة: صوارد يدفعها الزبون نقداً، لانقو نعطيه ذهباً */
        const _sw=_rafSettled?0:(parseFloat(String(document.getElementById('rafSawared')?.value||'').replace(/\s/g,'').replace(',','.'))||0);
        const _lq=_rafSettled?0:(parseFloat(document.getElementById('rafLanqo')?.value)||0);
        const _fd=(totalFee-_sw)+_pd, _fg=-(totalPure-_lq)+_pg;
        const short=(_rafSettled&&totalPure>avail24+0.001)||(!_rafSettled&&_lq>avail24+0.001);
        dEl.textContent=fmt(_fd,0)+' دج';
        dEl.style.color=_fd>=0?'var(--g400)':'var(--rd)';
        gEl.textContent=fmt(_fg,2)+' غ'+(short?(' ⚠️ الكوفر غير كافٍ ('+fmt(avail24,2)+'غ)'):'');
        gEl.style.color=_fg>=0?'var(--gr)':'var(--rd)';
    }else{
        /* ── فرع المصفّي/عثمان: كما كان ── */
        const ruleEl=document.getElementById('rafFeeRule'); if(ruleEl)ruleEl.style.display='none';
        const pv2=document.getElementById('rafCustPrev'); if(pv2)pv2.style.display='none';
        const sawared=parseFloat(String(document.getElementById('rafSawared')?.value||'').replace(/\s/g,'').replace(',','.'))||0;
        const lanqo=parseFloat(document.getElementById('rafLanqo')?.value)||0;
        const prevDinar=c?getCustBal(c,'دينار'):0;
        const prevGold=c?getCustBal(c,'ذهب 24'):0;
        const finalDinar=-totalDinar+sawared+prevDinar;
        const finalGold=totalPure-lanqo+prevGold;
        const pd=document.getElementById('rafPrevDinarDisp'); if(pd)pd.textContent=fmt(prevDinar,0);
        const pg=document.getElementById('rafPrevGoldDisp'); if(pg)pg.textContent=fmt(prevGold,2)+' غ';
        dEl.textContent=fmt(finalDinar,0);
        dEl.style.color='var(--g400)';
        gEl.textContent=fmt(finalGold,2)+' غ';
        gEl.style.color=finalGold>=0?'var(--gr)':'var(--rd)';
    }
    const d=document.getElementById('rafDate');
    if(d)d.textContent=new Date().toLocaleDateString('fr-FR');
    _checkRafDupes();
};
window.saveSimpleRaf=()=>{
    const c=document.getElementById('rafCustomer').value.trim();
    if(!c)return toast('أدخل اسم الزبون أو المصفى','error');
    let totalSentW=0,totalSentEq24=0;
    const rows=[];
    for(let i=1;i<=rafRows;i++){
        const w=parseFloat(String(document.getElementById('rafW_'+i)?.value||'').replace(',','.'))||0;
        const k=parseFloat(String(document.getElementById('rafK_'+i)?.value||'').replace(',','.'))||730;
        if(w>0){totalSentW+=w;totalSentEq24+=w*k/1000;rows.push({w,k,pure:w*k/1000});}
    }
    if(totalSentW<=0)return toast('أدخل وزن الكسر المرسل','error');
    const avail730=g730.reduce((s,b)=>s+(b.w||0),0);
    if(totalSentW>avail730+0.001)return toast(`⚠️ مخزون 730 غير كافٍ (متاح: ${fmt(avail730,2)} غ)`,'error');
    const feeRate=parseFloat(document.getElementById('rafFee')?.value)||0;
    if(feeRate<=0)return toast('أدخل سعر الأجرة (دج/غ)','error');
    const totalDinar=totalSentW*feeRate;
    const sawared=parseFloat(String(document.getElementById('rafSawared')?.value||'').replace(/\s/g,'').replace(',','.'))||0;
    const lanqo=parseFloat(document.getElementById('rafLanqo')?.value)||0;

    /* ═══ وضع تعديل فاتورة عثمان (نموذج rafinag): تسوية الفروقات في مكانها ═══ */
    const _em=window._rafEditMeta;
    if(_em&&_em.rid&&_em.refiner){
        const o=_em.orig, oRows=_em.origRows||[];
        const dEq=totalSentEq24-(o.eq24||0);
        const newFee=totalSentW*feeRate;
        const dFee=newFee-(o.fee||0);
        /* فروقات السبائك سطراً بسطر: نقصان/حذف = ترجع سبيكته {وزنه،عياره} حرفياً؛ زيادة/إضافة = تُستهلك من 730 */
        const rets=[],consW=[];
        const n=Math.max(rows.length,oRows.length);
        for(let i=0;i<n;i++){
            const nw=rows[i]?rows[i].w:0, nk=rows[i]?rows[i].k:0;
            const ow=oRows[i]?oRows[i].w:0, ok=oRows[i]?oRows[i].k:730;
            if(ow>nw+0.0001)rets.push({w:parseFloat((ow-nw).toFixed(4)),k:ok});
            else if(nw>ow+0.0001)consW.push(parseFloat((nw-ow).toFixed(4)));
        }
        const addW=consW.reduce((s,x)=>s+x,0);
        if(addW>0.001){
            const avail=g730.reduce((s,b)=>s+(b.w||0),0);
            if(addW>avail+0.001)return toast(`⚠️ مخزون 730 غير كافٍ للزيادة (متاح: ${fmt(avail,2)} غ)`,'error');
        }
        const barsRemove730e=[],barUpdates730e=[];
        if(addW>0.001){
            let rem=addW;
            const srcL=[...g730].sort((x,y)=>((y._ts||0)-(x._ts||0)));
            for(let i=0;i<srcL.length&&rem>0.001;i++){const bar=srcL[i];
                if(bar.w<=rem+0.001){barsRemove730e.push(bar.id);rem-=bar.w;}
                else{barUpdates730e.push({id:bar.id,pool:'730',prevW:bar.w,newW:parseFloat((bar.w-rem).toFixed(4))});rem=0;}}
        }
        const barsAdd730New=rets.map(x=>({id:uid(),pool:'730',w:x.w,k:x.k}));
        const patch={rows,sentW:totalSentW,eq24:totalSentEq24,fee:newFee,feeRate,
            finalDinar:-newFee+(_em.origSawared||0)+(_em.origPrevD||0),
            finalGold:totalSentEq24-(_em.origLanqo||0)+(_em.origPrevG||0),
            edited:{reason:_em.reason,orig:{sentW:o.sentW,eq24:o.eq24,fee:o.fee},at:new Date().toLocaleDateString('fr-FR')}};
        const _now=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
        emitEvent('RAF_EDIT',
            {rid:_em.rid,mode:'refiner',c,oldEq24:o.eq24||0,newEq24:totalSentEq24,oldFee:o.fee||0,newFee,
             barsAdd730New:(barsAdd730New.length?barsAdd730New:undefined),
             barsRemove730:(barsRemove730e.length?barsRemove730e:undefined),
             barUpdates730:(barUpdates730e.length?barUpdates730e:undefined)},
            {rafPatch:patch,
             op:{c,t:'تصحيح فاتورة',m:'ذهب 24',a:Math.abs(dEq)||Math.abs(dFee)||0,_ts:Date.now(),dt:_now,
                 rid:_em.rid,diffG:dEq,diffD:-dFee,note:_em.reason}});
        window._rafEditMeta=null;
        if(typeof _hideRafEditBanner==='function')_hideRafEditBanner();
        resetRafForm();
        if(rets.length)toast(`↩️ عادت للكوفر ${rets.length} سبيكة: `+rets.map(x=>`${fmt(x.w,2)}غ@${x.k}`).join(' · '),'success');
        toast(`✅ عُدِّلت فاتورة عثمان — فرق الخالص ${dEq>=0?'+':'−'}${fmt(Math.abs(dEq),2)}غ · فرق الأجرة ${dFee>=0?'+':'−'}${fmt(Math.abs(dFee),0)}دج`);
        return;
    }
    const prevD=getCustBal(c,'دينار');
    const prevG=getCustBal(c,'ذهب 24');
    const finalDinar=-totalDinar+sawared+prevD;
    const finalGold=totalSentEq24-lanqo+prevG;
    /* حركة المخزون — تُستهلَك السبائك المختارة (_rafSentIds) أولاً بمعرّفاتها،
       فلا تُمسّ أي سبيكة لم تخترها. وإن لم تكفِ المختارة الوزنَ المرسل يُؤخذ الباقي من غيرها احتياطاً. */
    const barsRemove730=[], barUpdates730=[];
    {
        let rem=totalSentW;
        const _consume=list=>{
            for(let i=0;i<list.length && rem>0.001;i++){
                const bar=list[i];
                if(bar.w<=rem+0.001){ barsRemove730.push(bar.id); rem-=bar.w; }
                else { barUpdates730.push({id:bar.id,pool:'730',prevW:bar.w,newW:parseFloat((bar.w-rem).toFixed(4))}); rem=0; }
            }
        };
        _consume(g730.filter(b=>_rafSentIds.has(b.id)));            /* المختارة أولاً */
        if(rem>0.001) _consume(g730.filter(b=>!_rafSentIds.has(b.id))); /* احتياط عند النقص فقط */
    }
    const barsAdd24=[];
    const dispBars={};
    const dt=new Date().toLocaleDateString('fr-FR');
    if(lanqo>0){
        const bid=uid();
        barsAdd24.push({id:bid,pool:'24',w:lanqo,k:1000});
        dispBars[bid]={desc:'رافيناج - استلام لانقو',dt,src:'رافيناج'};
    }
    const rid='RAF-'+uid();
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const musallim=(document.getElementById('rafMusallim')?.value||'').trim();
    const _raf={id:rid,c,rows,sentW:totalSentW,eq24:totalSentEq24,fee:totalDinar,feeRate,sawared,lanqo,prevD,prevG,finalDinar,finalGold,dt,musallim};
    _attachEditMeta(_raf);
    if(!_raf.edited)try{if(typeof _sendPartnerPush==='function')_sendPartnerPush('🔥 فاتورة رافيناج جديدة',`${c} — خالص ${fmt(totalSentEq24,2)} غ · أجرة ${fmt(totalDinar,0)} دج`);}catch(e){}
    emitEvent('RAF',
        {c,rid,rows,totalSentW,eq24:totalSentEq24,feeRate,totalDinar,fee:totalDinar,sawared,lanqo,prevD,prevG,barsRemove730,barUpdates730,barsAdd24},
        {
            rafInvoice:_raf,
            bars:Object.keys(dispBars).length?dispBars:undefined,
            op:{c,t:'رافيناج',m:'ذهب 24',a:totalSentEq24,_ts:Date.now(),dt:nowStr,sentW:totalSentW,rec24:lanqo,fee:totalDinar,prevD,prevG,rid,
                ...(sawared>0?{sawared}:{}),
                ...(musallim?{musallim}:{})}
        }
    );
    window._editRestore=null;
    if(typeof _hideRafEditBanner==='function')_hideRafEditBanner();
    _rafSavePhotos(rid);
    resetRafForm();
    toast('🔥 تم حفظ الرافيناج بنجاح');
    /* لا تنزيل تلقائي بعد الحفظ */
};
/* ═══ موزّع الحفظ: يوجّه حسب الوضع المختار ═══ */
window.saveRaf=function(){
    return _rafMode==='customer' ? saveCustomerRaf() : saveSimpleRaf();
};

/* ═══ حفظ فرع الزبون (تصفية) ═══
   كسر الزبون يدخل مخزون 730. إن كانت خالصة: يخرج مكافئ 24 من الكوفر والأجرة للسيولة.
   إن كانت غير خالصة: نُسجّل ديناً (نحن مدينون له بمكافئ 24، وهو مدين لنا بالأجرة). */
window.saveCustomerRaf=async function(){
    window._rafOut24=0; window._lanqoOut24=0;   /* تصفير حتمي — منع تسرّب قيمة الفاتورة السابقة */
    const c=document.getElementById('rafCustomer').value.trim();
    if(!c)return toast('أدخل اسم الزبون','error');
    let totalW=0,eq24=0;const rows=[];
    for(let i=1;i<=rafRows;i++){
        const w=parseFloat(String(document.getElementById('rafW_'+i)?.value||'').replace(',','.'))||0;
        const k=parseFloat(String(document.getElementById('rafK_'+i)?.value||'').replace(',','.'))||730;
        if(w>0){totalW+=w;eq24+=w*k/1000;rows.push({w,k,pure:w*k/1000});}
    }
    if(totalW<=0)return toast('أدخل وزن كسر الزبون','error');
    const feeRate=parseFloat(document.getElementById('rafFee')?.value)||0;
    /* لا حفظ بلا أجرة — إلا لزبونٍ قاعدته «بلا أجرة» (مثل صلاح) */
    if(custFeeMode(c)!=='none'&&feeRate<=0){
        document.getElementById('rafFee')?.focus();
        return toast('⚠️ أدخل أجرة الرافيناج (دج/غ) قبل الحفظ','error');
    }
    const totalFee=calcCustFee(c,totalW,eq24,feeRate);
    const settled=_rafSettled;
    const sawared=settled?0:(parseFloat(String(document.getElementById('rafSawared')?.value||'').replace(/\s/g,'').replace(',','.'))||0);
    let lanqo  =settled?0:(parseFloat(String(document.getElementById('rafLanqo')?.value||'').replace(/\s/g,'').replace(',','.'))||0);
    let lanqoPhys=0,lanqoVirt=0;
    if(!settled&&lanqo>0){
        /* الرصيد الكامل = سبائك فيزيائية + ذهب بيع افتراضي (vg24) */
        const physSum=g24.reduce((s,b)=>s+(b.w||0),0);
        const virt=(B&&B.vg24)||0;
        if(lanqo>physSum+virt+0.001)
            return toast(`⚠️ رصيد 24 غير كافٍ لدفع اللانقو — متاح: ${fmt(physSum+virt,2)} غ (سبائك ${fmt(physSum,2)} + بيع ${fmt(virt,2)})`,'error');
        if(lanqo>eq24+0.011){
            /* لانقو يتجاوز خالص الفاتورة: الفائض يسدَّد من رصيده السابق (أو ينقلب له) — باستئذان */
            const over=lanqo-eq24;
            const prevG0=getCustBal(c,'ذهب 24');
            const after=-(eq24-lanqo)+prevG0;
            const ok=await appConfirm(
                `اللانقو (${fmt(lanqo,2)}غ) أكبر من خالص الفاتورة (${fmt(eq24,2)}غ).\n\n`+
                `الفائض ${fmt(over,2)}غ سيُخصم من رصيده السابق (${fmt(prevG0,2)}غ)\n`+
                `فيصبح رصيد الذهب النهائي: ${fmt(after,2)}غ ${after>0.001?'(له عليك)':after<-0.001?'(لك عليه)':'(صفر)'}\n\nمتابعة؟`,
                '✔️ ادفع اللانقو كاملاً');
            if(!ok)return;
        }else if(lanqo>eq24)lanqo=eq24;
        lanqoPhys=Math.min(lanqo,physSum);
        lanqoVirt=parseFloat((lanqo-lanqoPhys).toFixed(4));
    }
    const dt=new Date().toLocaleDateString('fr-FR');
    const dispBars={};
    /* كسر الزبون يُضاف إلى مخزون 730 (سطر لكل بند) */
    const barsAdd730=rows.map(r=>{
        const bid=uid();
        dispBars[bid]={desc:'رافيناج - كسر زبون '+c,dt,src:'رافيناج'};
        return {id:bid,pool:'730',w:r.w,k:r.k};
    });
    /* ═══ وضع التعديل (نموذج rafinag): RAF_EDIT يحدّث نفس السبيكة والفاتورة + قيد فرق ═══ */
    const _em=window._rafEditMeta;
    if(_em&&_em.rid){
        const sFrom=!!_em.origSettled, sTo=!!settled;      /* يجوز تحويل خالصة ↔ دين أثناء التعديل */
        const oldEq=_em.orig.eq24||0, oldFee=_em.orig.fee||0;
        const dG=eq24-oldEq, dF=totalFee-oldFee;
        /* دين → خالصة: نحتاج مكافئ 24 الجديد من الكوفر الآن */
        let cRemove24,cUpdates24,cV24Out=0;
        if(!sFrom&&sTo){
            const physSum=g24.reduce((s,b)=>s+(b.w||0),0);
            const virt=(B&&B.vg24)||0;
            if(eq24>physSum+virt+0.001)return toast(`⚠️ رصيد 24 غير كافٍ للتسوية — متاح: ${fmt(physSum+virt,2)} غ (سبائك ${fmt(physSum,2)} + بيع ${fmt(virt,2)})`,'error');
            const physOut=Math.min(eq24,physSum);
            cV24Out=parseFloat((eq24-physOut).toFixed(4));
            cRemove24=[];cUpdates24=[];window._rafOut24=physOut;   /* سائل */
        }
        const settled0=sTo;
        const barIds=_em.barIds||[];
        const barUpdates730=[],barsAdd730New=[],removedIds=[];
        rows.forEach((r2,i)=>{
            if(i<barIds.length)barUpdates730.push({id:barIds[i],newW:r2.w,newK:r2.k});
            else barsAdd730New.push({id:uid(),pool:'730',w:r2.w,k:r2.k});
        });
        for(let i=rows.length;i<barIds.length;i++)removedIds.push(barIds[i]);
        const _now=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
        const _opd=_em.origPrevD||0,_opg=_em.origPrevG||0;
        const patch={rows,sentW:totalW,eq24,fee:totalFee,feeRate,settled:settled0,
            prevD:_opd,prevG:_opg,
            finalDinar:totalFee+_opd,finalGold:-eq24+_opg,
            edited:{reason:_em.reason,orig:{sentW:_em.orig.sentW,eq24:oldEq,fee:oldFee},at:new Date().toLocaleDateString('fr-FR')}};
        emitEvent('RAF_EDIT',
            {rid:_em.rid,mode:'customer',c,oldEq24:oldEq,newEq24:eq24,oldFee,newFee:totalFee,
             settledFrom:sFrom,settledTo:sTo,
             restoreBarId:(sFrom&&!sTo?uid():undefined),
             v24Out:(cV24Out||undefined),...((window._rafOut24||0)>0?{out24:window._rafOut24}:{}),
             barsRemove24:(cRemove24&&cRemove24.length?cRemove24:undefined),
             barUpdates24:(cUpdates24&&cUpdates24.length?cUpdates24:undefined),
             barUpdates730,
             barsAdd730New:(barsAdd730New.length?barsAdd730New:undefined),
             barsRemove730:(removedIds.length?removedIds:undefined)},
            {rafPatch:patch,
             op:{c,t:'تصحيح فاتورة',m:'ذهب 24',a:Math.abs(dG)||Math.abs(dF)||0,_ts:Date.now(),dt:_now,
                 rid:_em.rid,diffG:dG,diffD:dF,note:_em.reason}});
        const _rid=_em.rid;
        window._rafEditMeta=null;
        if(typeof _hideRafEditBanner==='function')_hideRafEditBanner();
        _rafSavePhotos(_rid);
        resetRafForm();
        if(sFrom&&!sTo)toast(`↩️ حُوِّلت الفاتورة من خالصة إلى دين: عاد ${fmt(oldEq,2)}غ للكوفر وسُحب ${fmt(oldFee,0)}دج من السيولة، وفُتح الدين بالأرقام الجديدة`);
        else if(!sFrom&&sTo)toast(`✅ حُوِّلت الفاتورة من دين إلى خالصة: خرج ${fmt(eq24,2)}غ من الكوفر ودخلت الأجرة ${fmt(totalFee,0)}دج، وأُغلق الدين`);
        else{
            toast(`✅ عُدِّلت الفاتورة في مكانها — فرق الخالص ${dG>=0?'+':'−'}${fmt(Math.abs(dG),2)}غ · فرق الأجرة ${dF>=0?'+':'−'}${fmt(Math.abs(dF),0)}دج`);
            if(Math.abs(dG)>0.0001||Math.abs(dF)>0.0001)toast('📒 سُجِّل الفرق في دفتر الديون','info');
        }
        if(typeof _sendCustomerPush==='function')_sendCustomerPush(c,'تصحيح فاتورة','عُدِّلت فاتورتك — افتح حسابك للاطلاع');
        return;
    }
    let barsRemove24=[],barUpdates24=[];
    if(!settled&&lanqoPhys>0){
        const r=_pickBarsToRemove('24',lanqoPhys);
        barsRemove24=r.barsRemove;barUpdates24=r.barUpdates;window._lanqoOut24=r.out24||0;
    }
    let settledVirt=0;
    if(settled){
        /* الرصيد الكامل = سبائك فيزيائية + ذهب بيع افتراضي (vg24) */
        const physSum=g24.reduce((s,b)=>s+(b.w||0),0);
        const virt=(B&&B.vg24)||0;
        if(eq24>physSum+virt+0.001)
            return toast(`⚠️ رصيد 24 غير كافٍ — متاح: ${fmt(physSum+virt,2)} غ (سبائك ${fmt(physSum,2)} + بيع ${fmt(virt,2)}) · مطلوب: ${fmt(eq24,2)} غ`,'error');
        const physOut=Math.min(eq24,physSum);
        settledVirt=parseFloat((eq24-physOut).toFixed(4));
        /* استهلاك الجزء الفيزيائي — من الأحدث للأقدم */
        let rem=physOut;
        const src=[...g24].sort((a,b)=>((b._ts||0)-(a._ts||0)));
        for(let i=0;i<src.length&&rem>0.001;i++){
            const bar=src[i];
            if(bar.w<=rem+0.001){barsRemove24.push(bar.id);rem-=bar.w;}
            else{barUpdates24.push({id:bar.id,pool:'24',prevW:bar.w,newW:parseFloat((bar.w-rem).toFixed(4))});rem=0;}
        }
    }
    const rid='RAF-'+uid();
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    /* الرصيد السابق من الدفتر (قبل هذه الفاتورة) — لعرض الفاتورة كنموذج عثمان */
    const prevD=getCustBal(c,'دينار');
    const prevG=getCustBal(c,'ذهب 24');
    const musallim=(document.getElementById('rafMusallim')?.value||'').trim();
    const _raf={id:rid,c,mode:'customer',settled,rows,sentW:totalW,eq24,fee:totalFee,feeRate,
                musallim,
                sawared,lanqo,prevD,prevG,
                finalDinar:(totalFee-sawared)+prevD,finalGold:-(eq24-lanqo)+prevG,dt};
    _attachEditMeta(_raf);
    if(!_raf.edited)try{if(typeof _sendPartnerPush==='function')_sendPartnerPush('🔥 فاتورة رافيناج جديدة',`${c} — خالص ${fmt(eq24,2)} غ · أجرة ${fmt(totalFee,0)} دج`);}catch(e){}
    emitEvent('RAF',
        {mode:'customer',settled,c,rid,rows,totalSentW:totalW,eq24,feeRate,fee:totalFee,
         sawared,lanqo,
         v24Out:((settled?settledVirt:lanqoVirt)||undefined),
         barsAdd730,barsRemove24,barUpdates24,...((window._lanqoOut24||0)>0?{out24:window._lanqoOut24}:{})},
        {
            rafInvoice:_raf,
            bars:Object.keys(dispBars).length?dispBars:undefined,
            op:{c,t:settled?'رافيناج زبون (خالصة)':'رافيناج زبون (دين)',m:'ذهب 24',a:eq24,
                _ts:Date.now(),dt:nowStr,sentW:totalW,fee:totalFee,rid,
                ...(sawared>0?{sawared}:{}),
                ...(lanqo>0?{lanqo}:{}),
                ...(musallim?{musallim}:{})}
        }
    );
    _rafSavePhotos(rid);
    resetRafForm();
    toast(settled?'✅ تم حفظ تصفية الزبون (خالصة)':'📋 تم حفظ تصفية الزبون (دين)');
    if(typeof _sendCustomerPush==='function')
        _sendCustomerPush(c,'فاتورة تصفية جديدة',
            'سُجّلت لك تصفية '+fmt(eq24,2)+' غ صافي'+(settled?' (خالصة)':' (على الحساب)')+' — افتح حسابك للتفاصيل');
    /* لا تنزيل تلقائي بعد الحفظ */
};

window.resetRafForm=()=>{
    window._rafEditMeta=null;
    /* لا نلمس _rafEditWs هنا — الحفظ ينظفه؛ الاسترجاع ينظفه في app.js */
    _rafSentIds.clear();
    document.getElementById('rafCustomer').value='';
    const _rbb=document.getElementById('rafBalBox');if(_rbb)_rbb.style.display='none';
    initRafTable();
    ['rafFee','rafSawared','rafLanqo'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='0';});
    const _fb=document.getElementById('rafFeeBtn'); if(_fb)_fb.textContent='0';
    const _ms=document.getElementById('rafMusallim'); if(_ms)_ms.value='';
    ['rafDinarTotal','rafPureTotal','rafPrevDinarDisp','rafPrevGoldDisp'].forEach(id=>{
        const el=document.getElementById(id);if(el)el.textContent='0';
    });
    document.getElementById('rafFinalDinar').textContent='0';
    document.getElementById('rafFinalGold').textContent='0,00 غ';
    applyRafModeUI();
};


/* ═══ PDF الرافيناج ═══ */
function buildRafHtml(r){
    const n=(r.rows||[]).length;
    /* حجم الخط يتقلص تلقائياً كلما زادت الأسطر حتى تتسع كلها في A4 */
    const fs=n<=8?15:n<=14?13:n<=20?11:n<=28?9.5:8;
    const pd=n<=8?7:n<=14?5:n<=20?3.5:n<=28?2.5:2;
    const hdr=n<=8?22:n<=14?18:16;
    const tot=n<=8?18:n<=14?15:13;
    const fin=n<=8?24:n<=14?20:16;
    return`<div style="position:relative;overflow:hidden;padding:14px 18px;font-family:Tajawal,sans-serif;direction:rtl;width:190mm;box-sizing:border-box">
        ${typeof _wmLayer==='function'?_wmLayer():''}
        <div style="position:relative;z-index:1">
        <div style="text-align:center;border-bottom:2px solid #c2410c;padding-bottom:8px;margin-bottom:10px">
            <div style="font-size:${hdr+4}px;font-weight:900;color:#c2410c">🔥 فاتورة رافيناج</div>
            <div style="font-size:${hdr-2}px;color:#555">${r.c} — ${r.dt}${r.musallim?` · ✍️ المسلِّم: ${r.musallim}`:''}</div>
            ${r.edited?`<div style="margin-top:6px;background:#fef3c7;border:1px solid #f59e0b;border-radius:8px;padding:5px 8px;font-size:${hdr-6}px;text-align:right">
                ✏️ <b>فاتورة معدَّلة</b> — السبب: <b>${r.edited.reason}</b> (${r.edited.at||''})<br>
                ${(()=>{const o=r.edited.orig||{};const row=(lbl,ov,nv,dec,un)=>{const d=(nv||0)-(ov||0);if(Math.abs(d)<0.001)return '';const c=d>0?'#16a34a':'#dc2626';return `<span style="margin-inline-start:10px">${lbl}: ${fmt(ov||0,dec)}${un} ← <b>${fmt(nv||0,dec)}${un}</b> <b style="color:${c}">(${d>0?'+':'−'}${fmt(Math.abs(d),dec)})</b></span>`;};
                return [row('المرسل',o.sentW,r.sentW,2,'غ'),row('الصافي',o.eq24,r.eq24,2,'غ'),row('الأجرة',o.fee,r.fee,0,'دج')].filter(Boolean).join('<br>')||'<span style="color:#92400e">بلا تغيّر في الأرقام</span>';})()}
            </div>`:''}
        </div>
        <table border="1" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;border-color:#aaa;margin-bottom:8px">
            <thead><tr style="background:#1a1a1a;color:#fff;font-weight:800;font-size:${fs+1}px">
                <th style="padding:${pd}px ${pd+2}px;border:1px solid #555;width:8%">#</th>
                <th style="padding:${pd}px ${pd+2}px;border:1px solid #555">الوزن (غ)</th>
                <th style="padding:${pd}px ${pd+2}px;border:1px solid #555">العيار</th>
                <th style="padding:${pd}px ${pd+2}px;border:1px solid #555">خالص (غ)</th>
            </tr></thead>
            <tbody>
                ${(r.rows||[]).map((row,i)=>`<tr style="text-align:center;background:${i%2?'#f9f9f9':'#fff'}">
                    <td style="border:1px solid #ccc;padding:${pd}px;color:#888;font-size:${fs-1}px">${i+1}</td>
                    <td style="border:1px solid #ccc;padding:${pd}px;font-size:${fs+2}px;font-weight:700">${fmt(row.w,2)}</td>
                    <td style="border:1px solid #ccc;padding:${pd}px;font-size:${fs+2}px;font-weight:700">${row.k}</td>
                    <td style="border:1px solid #ccc;padding:${pd}px;font-size:${fs+4}px;font-weight:900">${fmt(row.pure,3)}</td>
                </tr>`).join('')}
                <tr style="background:#e5e5e5;text-align:center;font-weight:900">
                    <td style="border:1px solid #777;padding:${pd+1}px;font-size:${tot-2}px">المجموع</td>
                    <td style="border:1px solid #777;padding:${pd+1}px;font-size:${tot+2}px">${fmt(r.sentW,2)}</td>
                    <td style="border:1px solid #777;padding:${pd+1}px;font-size:${tot}px">—</td>
                    <td style="border:1px solid #777;padding:${pd+1}px;font-size:${tot+4}px">${fmt(r.eq24,3)}</td>
                </tr>
            </tbody>
        </table>
        <div style="font-size:${tot}px;border:1px solid #aaa;padding:${pd+4}px ${pd+6}px;border-radius:4px">
            <div style="display:flex;justify-content:space-between;margin-bottom:${pd}px"><span>الأجرة (دج/غ):</span><span style="font-size:${tot+2}px;font-weight:700">${fmt(r.feeRate,0)}</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:${pd}px"><span>قيمة دج:</span><span style="font-size:${tot+4}px;font-weight:900">${fmt(r.fee,0)} دج</span></div>
            ${r.sawared>0?`<div style="display:flex;justify-content:space-between;margin-bottom:${pd}px"><span>دفع صوارد:</span><span style="font-size:${tot+2}px;font-weight:700">${fmt(r.sawared,0)} دج</span></div>`:''}
            ${r.lanqo>0?`<div style="display:flex;justify-content:space-between;margin-bottom:${pd}px"><span>دفع لانقو:</span><span style="font-size:${tot+2}px;font-weight:700">${fmt(r.lanqo,2)} غ</span></div>`:''}
            ${(r.prevD&&r.prevD!==0)?`<div style="display:flex;justify-content:space-between;margin-bottom:${pd}px"><span>رصيد دينار سابق:</span><span style="font-size:${tot+2}px;font-weight:700">${fmt(r.prevD,0)} دج</span></div>`:''}
            ${(r.prevG&&r.prevG!==0)?`<div style="display:flex;justify-content:space-between;margin-bottom:${pd}px"><span>رصيد ذهب سابق:</span><span style="font-size:${tot+2}px;font-weight:700">${fmt(r.prevG,3)} غ</span></div>`:''}
            <div style="display:flex;justify-content:space-between;border-top:2px solid #777;padding-top:${pd+2}px;font-weight:900">
                <span style="font-size:${tot}px;align-self:center">النهائي دينار:</span><span style="font-size:${fin}px">${fmt(r.finalDinar,0)} دج</span>
            </div>
            <div style="display:flex;justify-content:space-between;font-weight:900">
                <span style="font-size:${tot}px;align-self:center">النهائي ذهب 24:</span><span style="font-size:${fin}px">${fmt(r.finalGold,3)} غ</span>
            </div>
        </div>
        <div style="text-align:center;margin-top:${pd+4}px;font-size:11px;color:#666">توقيع: _______________</div>
        </div>
    </div>`;
}
const _rafPdfOpts=(r)=>({
    margin:[6,8,6,8],
    filename:`رافيناج_${r.c}_${r.dt}.pdf`,
    image:{type:'jpeg',quality:.98},
    html2canvas:{scale:2,useCORS:true},
    jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}
});
window.printRaf=async (id)=>{
    const r=rafInvoices.find(x=>x.id===id);if(!r)return;
    /* عرض داخلي فوري بلا تنزيل — الصور تُحمّل خلفياً */
    if(typeof _openInternalView==='function'){
        _openInternalView(buildRafHtml(r)+'<div id="rafLazyPh" style="text-align:center;color:#9ca3af;font-size:11px;padding:6px">📷 جارٍ تحميل الصور…</div>','فاتورة رافيناج '+(r.c||''));
        _rafLoadPhotos(id).then(ph=>{const s=document.getElementById('rafLazyPh');if(s)s.outerHTML=(ph&&ph.length)?_rafPhotosHtml(ph):'';}).catch(()=>{const s=document.getElementById('rafLazyPh');if(s)s.remove();});
        return;
    }
    /* احتياط: عرض في تبويب */
    const photos=await _rafLoadPhotos(id);
    const w=window.open('','_blank');
    if(w){w.document.write('<div dir=rtl>'+buildRafHtml(r)+_rafPhotosHtml(photos)+'</div>');w.document.close();}
};
window._rafPhotosHtml=_rafPhotosHtml;
function _rafPhotosHtml(photos){
    if(!photos||!photos.length)return '';
    return `<div style="margin-top:8px;page-break-inside:avoid">
        <div style="font-size:11px;font-weight:900;color:#c2410c;margin-bottom:4px">📷 صور السبائك</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
            ${photos.map(p=>`<img src="${p}" style="width:100%;border-radius:6px;border:1px solid #ddd">`).join('')}
        </div></div>`;
}
window.waRaf=(id)=>{
    const r=rafInvoices.find(x=>x.id===id);if(!r)return;
    const fname=`رافيناج_${r.c}_${r.dt}.pdf`;
    toast('⏳ جارٍ تحضير PDF…','info');
    html2pdf().set(_rafPdfOpts(r)).from(buildRafHtml(r)).outputPdf('blob')
        .then(blob=>{ _showShareCard(blob,fname,`رافيناج ${r.c}`); })
        .catch(e=>toast('❌ خطأ في توليد PDF: '+(e&&e.message||e),'error'));
};
window.delRaf=async (id)=>{
    const r0=rafInvoices.find(x=>x.id===id);
    if(!(await appConfirm('حذف هذه الفاتورة وعكس أثرها؟','🗑️ حذف')))return;
    const ok=_voidByInvId('rafInvoice',id);
    if(!ok){
        /* فاتورة بلا حدث (مرحّلة/قديمة): الحذف الصامت خداع — نوقف ونصارح */
        appAlert('⚠️ هذه الفاتورة قديمة/مرحّلة بلا حدث مؤتمت — حذفها لن يعكس أثرها على المخزون والحسابات.\nإن كان أثرها خاطئاً صحّحه بأداة 🩹 تصحيح المخزون وقيود الدفتر.');
        return;
    }
    /* تحقق بعد إعادة البناء + كشف التوائم المكررة (من الاستعادة) */
    setTimeout(()=>{
        try{renderArchive();}catch(e){}
        try{if(typeof updAll==='function')updAll();}catch(e){}
        const still=rafInvoices.find(x=>x.id===id);
        if(still){appAlert('⚠️ الفاتورة ما زالت موجودة بعد الحذف — أرسل لقطة للمطوّر.');return;}
        if(r0){
            const twin=rafInvoices.find(x=>x.c===r0.c&&Math.abs((x.eq24||0)-(r0.eq24||0))<0.01&&Math.abs((x.fee||0)-(r0.fee||0))<0.5&&x.dt===r0.dt);
            if(twin)toast('⚠️ انتبه: توجد فاتورة أخرى مطابقة لنفس الزبون بنفس الأرقام (مكررة من الاستعادة؟) — أثرها ما زال قائماً حتى تحذفها هي أيضاً','error');
        }
        toast('🗑️ حُذفت الفاتورة وانعكس أثرها','info');
    },300);
};


/* ═══════════ تصوير السبائك (فاتورة الرافيناج) ═══════════
   الصور تُضغط (≤700px) وتُحفظ في goldpro/_photos/{rid} عقدةً منفصلة —
   خارج مجرى الأحداث حتى لا تُثقل المزامنة — وتُدمج في PDF الفاتورة. */
let _rafPhotos=[];
const RAF_MAX_PHOTOS=4;

window.rafAddPhotos=function(files){
    [...files].slice(0,RAF_MAX_PHOTOS-_rafPhotos.length).forEach(f=>{
        const img=new Image();
        img.onload=()=>{
            /* وضوح أعلى (كان 500px/0.42 فتبهت الملصقات). الصور في عقدة _photos
               المنفصلة خارج مجرى الأحداث، فلا تُثقل المزامنة. */
            const MAX=1000;
            const sc=Math.min(1,MAX/Math.max(img.width,img.height));
            const cv=document.createElement('canvas');
            cv.width=Math.round(img.width*sc);cv.height=Math.round(img.height*sc);
            const _cx=cv.getContext('2d');
            _cx.imageSmoothingEnabled=true;_cx.imageSmoothingQuality='high';
            _cx.fillStyle='#fff';_cx.fillRect(0,0,cv.width,cv.height);
            _cx.drawImage(img,0,0,cv.width,cv.height);
            _rafPhotos.push(cv.toDataURL('image/jpeg',0.75));
            URL.revokeObjectURL(img.src);
            _renderRafPhotoStrip();
        };
        img.src=URL.createObjectURL(f);
    });
    if(files.length>RAF_MAX_PHOTOS-_rafPhotos.length)toast('الحد الأقصى '+RAF_MAX_PHOTOS+' صور','info');
};
window.rafDelPhoto=function(i){ _rafPhotos.splice(i,1); _renderRafPhotoStrip(); };
function _renderRafPhotoStrip(){
    const s=document.getElementById('rafPhotoStrip');if(!s)return;
    s.innerHTML=_rafPhotos.map((d,i)=>`
        <div style="position:relative;width:52px;height:52px;border-radius:8px;overflow:hidden;border:1.5px solid var(--g500)">
            <img src="${d}" style="width:100%;height:100%;object-fit:cover">
            <button onclick="rafDelPhoto(${i})" style="position:absolute;top:1px;left:1px;width:17px;height:17px;border:none;border-radius:50%;background:rgba(239,68,68,.9);color:#fff;font-size:.6rem;font-weight:900;cursor:pointer;line-height:1;padding:0">✕</button>
        </div>`).join('');
}
/* حفظ صور فاتورةٍ ما وإفراغ الشريط — يُستدعى بعد الحفظ بالمعرّف */
function _rafSavePhotos(rid){
    if(!_rafPhotos.length)return 0;
    const n=_rafPhotos.length;
    try{_db.ref('goldpro/_photos/'+rid).set({imgs:_rafPhotos,ts:Date.now()});}catch(e){}
    _rafPhotos=[];_renderRafPhotoStrip();
    return n;
}
/* جلب صور فاتورة للعرض/الطباعة */
window._rafLoadPhotos=function(rid){
    return new Promise(res=>{
        const t=setTimeout(()=>res([]),5000);
        try{_db.ref('goldpro/_photos/'+rid).once('value',s=>{clearTimeout(t);const v=s.val();res(v&&v.imgs?v.imgs:[]);},()=>{clearTimeout(t);res([]);});}
        catch(e){clearTimeout(t);res([]);}
    });
};





/* ═══ تعديل الفاتورة: سبب بأزرار + فروقات موقَّعة (منطق rafinag) ═══ */
window._rafEditMeta=null;
const RAF_EDIT_REASONS=['خطأ في الميزان','خطأ في العيار','خطأ في الأجرة'];
function _askEditReason(cb){
    let m=document.getElementById('rafReasonModal');
    if(!m){
        m=document.createElement('div');m.id='rafReasonModal';m.className='modal-overlay';
        m.style.cssText='position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;padding:1rem';
        m.innerHTML=`<div style="background:var(--card);border:1.5px solid var(--g500);border-radius:16px;max-width:330px;width:100%;box-shadow:0 14px 50px rgba(0,0,0,.55);overflow:hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:.8rem 1rem;border-bottom:1px solid var(--border);background:rgba(217,119,6,.12)">
                <h3 style="margin:0;font-size:.95rem;font-weight:900;color:var(--g600)">✏️ سبب التعديل</h3>
                <button onclick="closeModal('rafReasonModal')" style="background:transparent;border:none;color:var(--t2);font-size:1.1rem;cursor:pointer;font-weight:900">✕</button>
            </div>
            <div id="rafReasonBtns" style="padding:1rem;display:flex;flex-direction:column;gap:.6rem"></div></div>`;
        document.body.appendChild(m);
    }
    document.getElementById('rafReasonBtns').innerHTML=
        RAF_EDIT_REASONS.map((r,i)=>
        `<label style="display:flex;align-items:center;gap:.6rem;padding:.7rem .85rem;border-radius:12px;border:1.5px solid var(--g500);background:rgba(217,119,6,.08);cursor:pointer;font-weight:800;font-family:Tajawal,sans-serif;font-size:.9rem">
            <input type="checkbox" class="rafReasonChk" value="${r}" style="width:19px;height:19px;accent-color:#d97706;flex:0 0 auto">
            <span>${r}</span>
        </label>`).join('')
        +`<button onclick="window._rafReasonConfirm()" style="margin-top:.4rem;padding:.85rem;border-radius:12px;border:none;background:#16a34a;color:#fff;font-weight:900;font-family:Tajawal,sans-serif;cursor:pointer;font-size:.95rem">✅ تأكيد الأسباب</button>`;
    window._rafReasonConfirm=()=>{
        const sel=[...document.querySelectorAll('.rafReasonChk:checked')].map(c=>c.value);
        if(!sel.length){ toast('اختر سبباً واحداً على الأقل','error'); return; }
        m.style.display='none';m.classList.remove('active');
        cb(sel.join('، '));   /* أسباب متعددة مفصولة بفاصلة */
    };
    m.classList.add('active');
    m.style.display='flex';
}
/* يلتف حول الحفظ: إن كنا في تعديل بلا سبب، اسأل أولاً ثم أكمل */
const _origSaveRaf=window.saveRaf;
window.saveRaf=function(){
    if(window._rafEditMeta&&!window._rafEditMeta.reason){
        _askEditReason(r=>{window._rafEditMeta.reason=r;_origSaveRaf();});
        return;
    }
    return _origSaveRaf();
};
/* إرفاق بيانات التعديل بالفاتورة قبل البثّ */
function _attachEditMeta(raf){
    if(window._rafEditMeta&&window._rafEditMeta.reason){
        raf.edited={reason:window._rafEditMeta.reason,orig:window._rafEditMeta.orig,at:new Date().toLocaleDateString('fr-FR')};
        window._rafEditMeta=null;
    }
    return raf;
}


/* ═══════════ منتقي الأجرة الثلاثي (1000/1500/2000) ═══════════ */
window.openRafFeePick=function(){
    let m=document.getElementById('rafFeePickModal');
    if(!m){
        m=document.createElement('div');m.id='rafFeePickModal';m.className='modal-overlay';
        m.innerHTML=`<div style="background:var(--card);border:1.5px solid var(--rd);border-radius:16px;max-width:280px;width:100%;box-shadow:0 14px 50px rgba(0,0,0,.55);padding:1rem">
            <div style="font-weight:900;color:var(--rd);text-align:center;margin-bottom:.7rem;font-size:.95rem">💰 اختر الأجرة (دج/غ)</div>
            <div style="display:flex;flex-direction:column;gap:.55rem">
                ${[1000,1500,2000].map(v=>`
                <button onclick="_pickRafFee(${v})"
                    style="padding:.85rem;border-radius:12px;border:1.5px solid var(--rd);background:rgba(239,68,68,.08);color:var(--rd);font-weight:900;font-family:monospace;font-size:1.25rem;cursor:pointer">${v.toLocaleString('fr-FR')}</button>`).join('')}
            </div></div>`;
        m.onclick=e=>{if(e.target===m){m.style.display='none';m.classList.remove('active');}};
        document.body.appendChild(m);
    }
    m.classList.add('active');
    m.style.cssText+=';display:flex!important;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);align-items:center;justify-content:center;padding:1rem';
};
window._pickRafFee=function(v){
    const f=document.getElementById('rafFee'); if(f)f.value=String(v);
    const b=document.getElementById('rafFeeBtn'); if(b)b.textContent=v.toLocaleString('fr-FR');
    const m=document.getElementById('rafFeePickModal'); if(m){m.style.display='none';m.classList.remove('active');}
    calcRaf();
};
