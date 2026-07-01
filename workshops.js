/* ═══════════════ WORKSHOPS — الورشات ═══════════════
   منقولة من منظومة الرفاينج. كل ورشة لها سبائكها الخاصة (ميزان/عيار)
   وجلسات محفوظة. الجلسة تحسب: الخام، الصافي 24، السلعة الواجدة، ولابارت.
   كل شيء عبر أحداث event-sourcing (قابلة للتراجع + متزامنة). */

const WS_LIST = { workshop1:'ورشة دحمون', workshop2:'ورشة صلاح' };
const WS_ACCENT = { workshop1:'#0ea5e9', workshop2:'#a855f7' };
let _wsCur = 'workshop1';

function _wsBarsOf(ws){ return (typeof wsBars!=='undefined' && wsBars[ws]) ? wsBars[ws] : []; }
function _wsSessOf(ws){ return (typeof wsSessions!=='undefined' && wsSessions[ws]) ? wsSessions[ws] : []; }

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
    emitEvent('WS_BARADD',{ws:_wsCur,id:uid(),w,k},null);
    const wi=document.getElementById('wsW'), ki=document.getElementById('wsK');
    if(wi)wi.value=''; if(ki)ki.value='';
    wi?.focus();
};

window.wsDelBar = function(id){
    emitEvent('WS_BARDEL',{ws:_wsCur,id},null);
};

window.wsSaveSession = function(){
    const bars = _wsBarsOf(_wsCur).filter(b=>(b.w||0)>0.001);
    if(!bars.length) return toast('لا توجد سبائك مسجّلة','error');
    const mfg = parseFloat(document.getElementById('wsMfg')?.value)||0;
    if(mfg<=0) return toast('أدخل السلعة الواجدة قبل الحفظ','error');
    const totalRaw  = bars.reduce((s,b)=>s+(b.w||0),0);
    const totalPure = bars.reduce((s,b)=>s+(b.w*b.k/1000),0);
    const lapart = mfg - totalPure;
    /* المخزون: سبائك الجلسة تخرج من 730 */
    const avail730 = g730.reduce((s,b)=>s+(b.w||0),0);
    if(totalRaw > avail730+0.001) return toast(`⚠️ مخزون 730 غير كافٍ (متاح: ${fmt(avail730,2)} غ)`,'error');
    const {barsRemove:barsRemove730,barUpdates:barUpdates730} = _pickBarsToRemove('730',totalRaw);
    /* السلعة الواجدة تدخل مخزون 24 */
    const dt=new Date().toLocaleDateString('fr-FR');
    const bid=uid();
    const barsAdd24=[{id:bid,pool:'24',w:mfg,k:1000}];
    const dispBars={[bid]:{desc:'ورشة '+WS_LIST[_wsCur]+' - سلعة واجدة',dt,src:'ورشة'}};
    const session = {
        id:'WSK-'+uid(), date:dt,
        rawWeight:totalRaw, pure24:totalPure, mfgWeight:mfg, lapart,
        lingotsCount:bars.length, lingots:bars.map(b=>({weight:b.w,karat:b.k})),
        wsTitle:WS_LIST[_wsCur]
    };
    emitEvent('WS_SESSION',
        {ws:_wsCur,session,barsRemove730,barUpdates730,barsAdd24,clearBars:true},
        {bars:dispBars}
    );
    const mi=document.getElementById('wsMfg'); if(mi)mi.value='';
    toast('✅ الجلسة محفوظة: 730 −'+fmt(totalRaw,2)+'غ · 24 +'+fmt(mfg,2)+'غ · لابارت '+fmt(lapart,3)+'غ');
};

window.wsDelSession = function(id){
    if(!confirm('حذف الجلسة وعكس أثرها على المخزون (730 يعود، 24 ينقص)؟')) return;
    if(typeof _voidWsSession==='function' && _voidWsSession(id)){
        toast('↩️ أُلغيت الجلسة وعُكس أثر المخزون','info');
    }else{
        emitEvent('WS_SESSIONDEL',{ws:_wsCur,id},null);
        toast('🗑️ حُذفت الجلسة','info');
    }
};

/* حساب لابارت الحيّ + معاينة أثر المخزون عند تغيير السلعة الواجدة */
window.wsCalc = function(){
    const bars = _wsBarsOf(_wsCur).filter(b=>(b.w||0)>0.001);
    const totalRaw  = bars.reduce((s,b)=>s+(b.w||0),0);
    const totalPure = bars.reduce((s,b)=>s+(b.w*b.k/1000),0);
    const mfg = parseFloat(document.getElementById('wsMfg')?.value)||0;
    const lapart = mfg - totalPure;
    const el = document.getElementById('wsLapart');
    if(el){ el.textContent = fmt(lapart,3)+' غ'; el.style.color = lapart>=0?'var(--gr)':'var(--rd)'; }
    const eff = document.getElementById('wsEffect');
    if(eff){
        const avail730 = (typeof g730!=='undefined'?g730:[]).reduce((s,b)=>s+(b.w||0),0);
        const short = totalRaw>avail730+0.001;
        eff.innerHTML = totalRaw>0
            ? `عند الحفظ: مخزون 730 <b style="color:var(--rd)">−${fmt(totalRaw,2)}غ</b>`
              + (short?` <span style="color:var(--rd)">⚠️ غير كافٍ (${fmt(avail730,2)})</span>`:'')
              + ` · مخزون 24 <b style="color:var(--gr)">+${fmt(mfg,2)}غ</b>`
            : 'أضف سبائك الجلسة ثم السلعة الواجدة';
    }
};

function renderWorkshops(){
    const page = document.getElementById('page-workshops');
    if(!page) return;
    const accent = WS_ACCENT[_wsCur];

    /* أزرار اختيار الورشة */
    Object.keys(WS_LIST).forEach(ws=>{
        const b=document.getElementById('wsTab_'+ws);
        if(b){
            const on = ws===_wsCur;
            b.style.background = on ? WS_ACCENT[ws]+'22' : 'var(--card)';
            b.style.borderColor = on ? WS_ACCENT[ws] : 'var(--border)';
            b.style.color = on ? 'var(--t)' : 'var(--t2)';
            b.style.boxShadow = on ? ('0 0 0 1px '+WS_ACCENT[ws]+' inset') : 'none';
        }
    });

    const bars = _wsBarsOf(_wsCur).filter(b=>(b.w||0)>0.001);
    const totalRaw  = bars.reduce((s,b)=>s+(b.w||0),0);
    const totalPure = bars.reduce((s,b)=>s+(b.w*b.k/1000),0);

    /* عنوان + إحصاءات */
    const ttl=document.getElementById('wsTitle'); if(ttl){ttl.textContent=WS_LIST[_wsCur];ttl.style.color=accent;}
    const cnt=document.getElementById('wsCount'); if(cnt)cnt.textContent=bars.length;
    const rw=document.getElementById('wsRaw'); if(rw)rw.textContent=fmt(totalRaw,3)+' غ';
    const pr=document.getElementById('wsPure'); if(pr){pr.textContent=fmt(totalPure,3)+' غ';pr.style.color=accent;}
    wsCalc();

    /* جدول السبائك */
    const tb=document.getElementById('wsBarsBody');
    if(tb){
        tb.innerHTML = bars.length ? bars.map(b=>`<tr style="border-bottom:1px solid var(--border)">
            <td style="padding:.5rem;text-align:center;font-weight:800">${fmt(b.w,3)}</td>
            <td style="padding:.5rem;text-align:center;font-weight:700;color:var(--g600)">${b.k}</td>
            <td style="padding:.5rem;text-align:center;font-weight:800;color:var(--gr)">${fmt(b.w*b.k/1000,3)}</td>
            <td style="padding:.5rem;text-align:center">
                <button onclick="wsDelBar('${b.id}')" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.35);border-radius:6px;padding:.25rem .55rem;color:var(--rd);font-weight:800;cursor:pointer;font-family:Tajawal,sans-serif;font-size:.72rem">🗑️</button>
            </td></tr>`).join('')
            : `<tr><td colspan="4" style="padding:1.4rem;text-align:center;color:var(--t3);font-weight:700">لا توجد سبائك — أضف من الأعلى</td></tr>`;
    }

    /* أرشيف الجلسات */
    const sc=document.getElementById('wsSessions');
    if(sc){
        const sess=_wsSessOf(_wsCur);
        sc.innerHTML = sess.length ? sess.map(s=>`
            <div style="border:1px solid var(--border);border-radius:10px;padding:.6rem .7rem;margin-bottom:.5rem;background:var(--card)">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.35rem">
                    <span style="font-weight:800;font-size:.78rem">📅 ${s.date} — ${s.lingotsCount||0} سبيكة</span>
                    <button onclick="wsDelSession('${s.id}')" style="background:none;border:none;color:var(--rd);cursor:pointer;font-size:.85rem">🗑️</button>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:.35rem;font-size:.72rem;text-align:center">
                    <div><div style="color:var(--t3);font-weight:700">خام</div><div style="font-weight:800">${fmt(s.rawWeight,2)}</div></div>
                    <div><div style="color:var(--t3);font-weight:700">صافي 24</div><div style="font-weight:800;color:var(--g600)">${fmt(s.pure24,2)}</div></div>
                    <div><div style="color:var(--t3);font-weight:700">السلعة</div><div style="font-weight:800">${fmt(s.mfgWeight,2)}</div></div>
                    <div><div style="color:var(--t3);font-weight:700">لابارت</div><div style="font-weight:800;color:${(s.lapart||0)>=0?'var(--gr)':'var(--rd)'}">${fmt(s.lapart,3)}</div></div>
                </div>
            </div>`).join('')
            : `<div style="padding:1rem;text-align:center;color:var(--t3);font-weight:700">لا توجد جلسات محفوظة بعد</div>`;
    }
}
window.renderWorkshops = renderWorkshops;
