/* ═══════════ INVENTORY ═══════════ */
function addBar(type,w,k,desc,src){
    const bar={id:uid(),w,k:k||(type==='24'?1000:730),desc:desc||(type==='24'?'سبيكة':'قطعة'),dt:new Date().toLocaleDateString('fr-FR'),src:src||'يدوي',_ts:Date.now()};
    if(type==='24')g24.push(bar);else g730.push(bar);
    /* لا تستدع syncBal() هنا — تُستدعى هذه الدالة من _applyEvt أثناء _reproject،
       وsyncBal() تُنفَّذ مرة واحدة في نهاية _reproject بعد اكتمال كل الأحداث */
}
function removeFromInventory(type,weight){
    const bars=type==='24'?g24:g730;
    let rem=weight;
    for(let i=bars.length-1;i>=0&&rem>0.001;i--){
        if(bars[i].w<=rem+0.001){rem-=bars[i].w;bars.splice(i,1)}
        else{bars[i].w-=rem;rem=0}
    }
    /* لا تستدع syncBal() هنا — راجع التعليق في addBar */
}
window.openInventory=(type)=>{
    window._invSearchW='';
    if(window._invSel)window._invSel.clear();
    invType=type;
    document.getElementById('invModalTitle').textContent=type==='24'?'💎 مخزون سبائك الذهب (24)':'👑 مخزون ذهب 730';
    document.getElementById('invModal').classList.add('active');
    renderInvModal();
};
function renderInvModal(){
    let bars=invType==='24'?g24:g730;
    const tw=bars.reduce((s,b)=>s+(b.w||0),0);
    /* إعادة بناء شريط المعلومات صراحةً حسب النوع — يُصلح التلوث بين 24 و730 */
    try{
        const _box=document.querySelector('#invModal .infobox')||document.getElementById('invCount')?.closest('.infobox');
        if(_box){
            if(invType==='24'){
                _box.innerHTML='الرصيد الإجمالي: <strong id="invTotalW">0 g</strong>';
            }else{
                _box.innerHTML='عدد القطع: <strong id="invCount">'+bars.length+'</strong> | الوزن: <strong id="invTotalW">0 g</strong>';
            }
        }
    }catch(e){}
    { const _c=document.getElementById('invCount'); if(_c)_c.textContent=bars.length; }
    /* مخزون 730: الوزن المعروض = مكافئ 730 (Σ وزن×عيار÷730) لا الخام */
    if(invType==='730'){
        const eq730=bars.reduce((s,b)=>s+(b.w||0)*((b.k||730)/730),0);
        document.getElementById('invTotalW').textContent=fmt(eq730,2)+' غ (مكافئ 730)';
    }else{
        document.getElementById('invTotalW').textContent=fmt(tw,2)+' g';
    }
    const c=document.getElementById('invBarsList');
    if(!bars.length){c.innerHTML='<div style="text-align:center;padding:2rem;color:var(--t3)"><i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:.5rem"></i>المخزون فارغ</div>';return}
    /* بحث بالوزن (730) */
    const q=(window._invSearchW||'').trim();
    if(invType==='730'&&q){
        const qn=parseFloat(q.replace(',','.'));
        bars=bars.filter(b=>{
            const ws=String(b.w), wf=fmt(b.w,2);
            if(ws.includes(q)||wf.includes(q))return true;
            return !isNaN(qn)&&Math.abs(b.w-qn)<0.01;
        });
    }
    /* مخزون 24: رقم واحد فقط (المجموع في الأعلى) + زر التصحيح — بلا تفاصيل سبائك */
    if(invType==='24'){
        c.innerHTML=`
        <div style="display:flex;justify-content:center;margin:.3rem 0 .2rem">
            <button onclick="invFixAdd()" title="إدخال تصحيحي: سبيكة تدخل المخزون دون المساس بأي زبون أو دين"
                style="border:1.5px dashed #d97706;border-radius:8px;background:rgba(217,119,6,.07);color:#d97706;padding:.5rem 1rem;font-size:.78rem;font-weight:800;font-family:Tajawal,sans-serif;cursor:pointer">🩹 تصحيح المخزون</button>
        </div>
        <div style="text-align:center;padding:1rem;color:var(--t3);font-size:.72rem;font-weight:700">💎 الرصيد الإجمالي معروض في الأعلى</div>`;
        return;
    }
    c.innerHTML=''
      +(invType==='730'?`
        <input type="text" id="invSearchW" inputmode="decimal" placeholder="🔍 بحث بوزن السبيكة…" value="${(window._invSearchW||'').replace(/"/g,'')}"
            oninput="window._invSearchW=this.value;renderInvModal();if(window.wsUpdSel)wsUpdSel();setTimeout(()=>{const e=document.getElementById('invSearchW');if(e){e.focus();e.setSelectionRange(e.value.length,e.value.length);}},0)"
            style="width:100%;box-sizing:border-box;margin-bottom:.45rem;padding:.5rem .7rem;border-radius:9px;border:1.5px solid var(--border);background:var(--card2);color:var(--t);font-family:Tajawal,monospace;font-weight:800;font-size:.85rem;text-align:center">`:'')
      +(invType==='730'?`
        <div id="wsBulkBar" style="display:flex;align-items:center;gap:.5rem;padding:.45rem .6rem;border:1.5px dashed #0ea5e9;border-radius:10px;margin-bottom:.5rem;background:rgba(14,165,233,.05)">
            <label style="display:flex;align-items:center;gap:.35rem;font-size:.74rem;font-weight:800;color:#0ea5e9;cursor:pointer">
                <input type="checkbox" id="wsSelAll" onchange="wsToggleAll(this.checked)" style="width:16px;height:16px;accent-color:#0ea5e9"> تحديد الكل
            </label>
            <span id="wsSelCount" style="font-size:.7rem;color:var(--t3);font-weight:700;flex:1;text-align:center"></span>
            <button onclick="wsBulkXfer()" style="border:none;border-radius:8px;background:#0ea5e9;color:#fff;padding:.4rem .7rem;font-size:.72rem;font-weight:800;font-family:Tajawal,sans-serif;cursor:pointer">🔨 تحويل المحدد لورشة</button>
            <button onclick="sellBarsToInvoice([...(window._invSel||[])])" style="border:none;border-radius:8px;background:#16a34a;color:#fff;padding:.4rem .7rem;font-size:.72rem;font-weight:800;font-family:Tajawal,sans-serif;cursor:pointer">🛒 بيع المحدد</button>
        </div>`:'')
      +[...bars].reverse().map(b=>`
        <div class="bar-item">
            ${invType==='730'?`<input type="checkbox" class="wsSel" data-bid="${b.id}" ${window._invSel&&window._invSel.has(b.id)?'checked':''} onchange="wsUpdSel(this)" style="width:17px;height:17px;accent-color:#0ea5e9;flex:0 0 auto;margin-left:.4rem">`:''}
            <div class="bar-info">
                <strong>${fmt(b.w,2)} غ</strong>
                <span style="font-size:.66rem;color:var(--g600);font-weight:700"> — عيار ${fmt(b.k||0,1)}</span>
                <small>${b.desc||''} | ${b.dt||''}</small>
            </div>
            <div class="bar-actions">
                ${invType==='730'
                    ?`<button class="bsm sell${window._invSel&&window._invSel.has(b.id)?' on':''}" onclick="toggleBarSell('${b.id}')" title="أضِفها للتحديد ثم اضغط «بيع المحدد»">${window._invSel&&window._invSel.has(b.id)?'✓ محددة':'بيع'}</button>`
                    :`<button class="bsm sell" onclick="startSell('${invType}','${b.id}')">بيع</button>`}
                <button class="bsm loan" onclick="startLoan('${invType}','${b.id}')">سلف</button>
                ${invType==='730'?(_rafSentIds.has(b.id)?`<button class="bsm" disabled style="border-color:#6b7280;color:#6b7280;background:rgba(107,114,128,.08);opacity:.5;cursor:not-allowed" title="أُضيفت للرافيناج">✅ أُضيفت</button>`:`<button class="bsm" onclick="sendBarToRaf('730','${b.id}')" style="border-color:#ea580c;color:#ea580c;background:rgba(234,88,12,.08)" title="تحويل للرافيناج">🔥 رافيناج</button>`):''}
                ${invType==='730'?`<button class="bsm" onclick="wsPickWorkshop('${b.id}')" style="border-color:#0ea5e9;color:#0ea5e9;background:rgba(14,165,233,.08)" title="تحويل للورشة">🔨 ورشة</button>`:''}
            </div>
        </div>`).join('');
}

/* ═══════════ LOAN ═══════════ */
window.startLoan=(type,id)=>{
    const bars=type==='24'?g24:g730;targetBar=bars.find(b=>b.id===id);targetBarType=type;
    if(!targetBar)return;
    const _eq=invType==='24'?targetBar.w:targetBar.w*(targetBar.k||730)/730;
    document.getElementById('loanInfo').innerHTML=`📦 ${targetBar.desc||'قطعة'} | الوزن: <strong>${fmt(targetBar.w,2)} غ</strong> | العيار: <strong>${fmt(targetBar.k||0,1)}</strong>`+
        (invType==='730'?` | يُقيَّد: <strong style="color:var(--g600)">${fmt(_eq,2)} غ (مكافئ 730)</strong>`:'');
    document.getElementById('loanAmount').value=targetBar.w;
    document.getElementById('loanCustomer').value='';
    document.getElementById('loanBalBox').style.display='none';
    document.getElementById('loanModal').classList.add('active');
    closeModal('invModal');
    setTimeout(()=>document.getElementById('loanCustomer').focus(),350);
};
window.confirmLoan=()=>{
    if(!targetBar)return;
    const c=document.getElementById('loanCustomer').value.trim();
    const a=parseFloat(document.getElementById('loanAmount').value);
    if(!c)return toast('أدخل اسم الزبون','error');
    if(isNaN(a)||a<=0||a>targetBar.w+0.001)return toast('كمية غير صالحة','error');
    const realA=Math.min(a,targetBar.w);
    /* حساب حركة السبيكة */
    let barsRemove=[],barUpdates=[];
    if(realA>=targetBar.w-0.001){
        barsRemove=[targetBar.id];
    }else{
        barUpdates=[{id:targetBar.id,pool:targetBarType,newW:parseFloat((targetBar.w-realA).toFixed(4))}];
    }
    /* الدين يُقيَّد بمكافئ 730 (وزن × عيار ÷ 730) لا بالخام */
    const _k=targetBar.k||(targetBarType==='24'?1000:730);
    const eq=targetBarType==='24'?realA:parseFloat((realA*_k/730).toFixed(4));
    const loanEntry={id:uid(),c,w:realA,k:_k,eq,desc:targetBar.desc||'',bt:targetBarType,dt:new Date().toLocaleDateString('fr-FR'),ret:false};
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const bt=targetBarType;
    targetBar=null;targetBarType=null;
    emitEvent('LOAN',
        {c,bt,w:realA,eq,loanEntry,barsRemove,barUpdates},
        {op:{c,t:'سلف',m:bt==='24'?'ذهب 24':'ذهب 730',a:eq,_ts:Date.now(),dt:nowStr,
             ...(bt==='730'?{realW:realA,realK:_k}:{})}}
    );
    closeModal('loanModal');
    toast('🤝 تم التسليف بنجاح');
};
window.showLoanBalance=()=>{
    const c=document.getElementById('loanCustomer').value.trim(),box=document.getElementById('loanBalBox');
    if(!c){box.style.display='none';return}
    const m=targetBarType==='24'?'ذهب 24':'ذهب 730',b=getCustBal(c,m);
    box.innerHTML=`👤 رصيد ${m}: <strong>${fmt(b,2)} غ</strong>`;box.style.display='block';
};

/* ═══════════ SELL FROM INVENTORY ═══════════ */
let _sellPaid=true;
function setSellPaid(paid){
    _sellPaid=paid;
    document.getElementById('sellPaidBtn').style.background=paid?'var(--gr)':'transparent';
    document.getElementById('sellPaidBtn').style.color=paid?'#fff':'var(--t2)';
    document.getElementById('sellPaidBtn').style.borderColor=paid?'var(--gr)':'var(--border)';
    document.getElementById('sellUnpaidBtn').style.background=paid?'transparent':'var(--rd)';
    document.getElementById('sellUnpaidBtn').style.color=paid?'var(--t2)':'#fff';
    document.getElementById('sellUnpaidBtn').style.borderColor=paid?'var(--border)':'var(--rd)';
}
window.setSellPaid=setSellPaid;
window.startSell=(type,id)=>{
    const bars=type==='24'?g24:g730;targetBar=bars.find(b=>b.id===id);targetBarType=type;
    if(!targetBar)return;
    const k=targetBar.k||0;
    document.getElementById('sellInfo').innerHTML=`📦 ${targetBar.desc||'قطعة'} | الوزن: <strong>${fmt(targetBar.w,2)} غ</strong> | العيار: <strong>${fmt(k,1)}</strong>`;
    document.getElementById('sellCustomer').value='';
    document.getElementById('sellAmount').value=targetBar.w;
    document.getElementById('sellPrice').value=goldPrice;
    document.getElementById('sellTotal').textContent=fmt(targetBar.w*k/730*goldPrice,0)+' DZD';
    setSellPaid(true);
    document.getElementById('sellModal').classList.add('active');
    closeModal('invModal');
    setTimeout(()=>document.getElementById('sellCustomer').focus(),350);
};
window.confirmSell=()=>{
    if(!targetBar)return;
    const c=document.getElementById('sellCustomer').value.trim();
    if(!c)return toast('أدخل اسم الزبون','error');
    const a=parseFloat(document.getElementById('sellAmount').value);
    const p=parseFloat(document.getElementById('sellPrice').value);
    if(isNaN(a)||a<=0||a>targetBar.w+0.001)return toast('كمية غير صالحة','error');
    if(isNaN(p)||p<=0)return toast('السعر غير صالح','error');
    const k=targetBar.k||0,realA=Math.min(a,targetBar.w);
    const eq730=realA*k/730,total=Math.round(eq730*p),is1000=k>=999;
    const paid=_sellPaid;
    /* حساب حركة السبيكة */
    let barsRemove=[],barUpdates=[];
    if(realA>=targetBar.w-0.001){
        barsRemove=[targetBar.id];
    }else{
        barUpdates=[{id:targetBar.id,pool:targetBarType,newW:parseFloat((targetBar.w-realA).toFixed(4))}];
    }
    const iid='INV-'+uid();
    const dt=new Date().toLocaleDateString('fr-FR');
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const _inv={
        id:iid,c,t:'sell',ps:paid?'full':'credit',dt,
        items:[{id:uid(),w:realA,k,is1000,eq730,ppg:p,total,sbt:targetBarType,desc:targetBar.desc||''}],
        tp:total,akhd:paid?total:0
    };
    const _sbt=targetBarType; /* نحفظ القيمة قبل الإعادة لـ null */
    targetBar=null;targetBarType=null;
    emitEvent('SELL',
        {c,paid,total,barsRemove,barUpdates,iid},
        {invoice:_inv,op:{c,t:'بيع',m:'دينار',a:total,_ts:Date.now(),dt:nowStr,ppg:p,total,paid,eq730,iid,sbt:_sbt}}
    );
    closeModal('sellModal');
    toast(paid?'✅ تم البيع — خالص':'✅ تم البيع — غير خالص');
    setTimeout(()=>printInv(iid),400);
};

/* ═══════════ تحويل سبيكة مباشرة للرافيناج (بدون تنقل) ═══════════ */
window.sendBarToRaf=(type,id)=>{
    const bars=type==='24'?g24:g730;
    const bar=bars.find(b=>b.id===id);
    if(!bar)return;
    /* إيجاد أول صف فارغ في جدول الرافيناج */
    let targetRow=-1;
    for(let i=1;i<=rafRows;i++){
        const wEl=document.getElementById('rafW_'+i);
        if(wEl&&wEl.value.trim()===''){targetRow=i;break;}
    }
    /* إذا لا يوجد صف فارغ، أضف صفاً جديداً */
    if(targetRow===-1){
        addRafRow();
        targetRow=rafRows;
    }
    /* تعبئة الصف */
    const wEl=document.getElementById('rafW_'+targetRow);
    const kEl=document.getElementById('rafK_'+targetRow);
    if(wEl)wEl.value=bar.w;
    if(kEl)kEl.value=bar.k||730;
    if(typeof calcRaf==='function')calcRaf();
    /* تسجيل الـ ID لمنع الإضافة مرة ثانية */
    _rafSentIds.add(id);
    renderInvModal();
    /* رسالة تأكيد — بدون إغلاق المودال أو التنقل */
    toast(`🔥 أُضيفت للرافيناج — الصف ${targetRow}`,'success');
};
document.getElementById('sellAmount').addEventListener('input',function(){
    const a=parseFloat(this.value)||0,k=targetBar?.k||0,p=parseFloat(document.getElementById('sellPrice').value)||0;
    document.getElementById('sellTotal').textContent=fmt(a*k/730*p,0)+' DZD';
});
document.getElementById('sellPrice').addEventListener('input',function(){
    const a=parseFloat(document.getElementById('sellAmount').value)||0,k=targetBar?.k||0;
    document.getElementById('sellTotal').textContent=fmt(a*k/730*(parseFloat(this.value)||0),0)+' DZD';
});


/* ═══════════ إدخال تصحيحي للمخزون (لا يمسّ الزبائن ولا الديون) ═══════════ */
window.invFixAdd=function(){
    const pool=invType==='24'?'24':'730';
    const _hint=pool==='24'?'\n(موجب = إضافة · سالب = خصم من المجموع)':'';
    const w=parseFloat(String(prompt(`🩹 إدخال تصحيحي لمخزون ${pool}\nأدخل الوزن (غ) — لن يُمسّ أي زبون أو دين:${_hint}`)||'').replace(',','.'));
    if(!w||Math.abs(w)<0.0001)return;
    /* السالب مسموح لمخزون 24 فقط (سائل: يُخصم من المجموع).
       مخزون 730 سبائك مفردة — السالب لا معنى له (لا سبيكة بوزن سالب). */
    if(w<0 && pool!=='24'){ toast('⚠️ السالب غير مسموح لمخزون 730 (سبائك مفردة). للخصم استعمل البيع أو الرافيناج.','error'); return; }
    if(w<0){
        const avail=g24.reduce((s,b)=>s+(b.w||0),0);
        if(Math.abs(w)>avail+0.001){ toast(`⚠️ الخصم (${fmt(Math.abs(w),2)}غ) أكبر من باقي لانقو المتاح (${fmt(avail,2)}غ)`,'error'); return; }
    }
    let k=pool==='24'?1000:730;
    if(pool==='730'){
        const kk=parseFloat(String(prompt('العيار؟ (افتراضي 730)')||'730').replace(',','.'));
        if(kk>0)k=kk;
    }
    const _verb=w<0?'خصم':'إدخال';
    if(!confirm(`${_verb} تصحيحي: ${fmt(Math.abs(w),2)} غ ${w<0?'من':'إلى'} مخزون ${pool}؟`))return;
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    emitEvent('INV_FIX',{pool,w,k},
        {op:{c:'النظام',t:'تصحيح مخزون',m:pool==='24'?'ذهب 24':'ذهب 730',a:w,_ts:Date.now(),dt:nowStr,note:'تصحيح مخزون — بلا أثر على الديون'}});
    renderInvModal();
    toast(`🩹 ${_verb} تصحيحي ${fmt(Math.abs(w),2)} غ ${w<0?'من':'لـ'}مخزون ${pool}`,'success');
};
