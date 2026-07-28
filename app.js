window.APP_JS_VER='v294';
/* ═══════════ STATE ═══════════ */
let B={دينار:0,'ذهب 730':0,'ذهب 24':0,دولار:0,vg730:0,vg24:0};
let ops=[],invoices=[],debts=[],loans=[],rafInvoices=[],dollInvoices=[],dubaiInvoices=[];
let goldPrice=12500,dollarRate=24800,liveSpotPrice=0;
let g24=[],g730=[];
let wsBars={workshop1:[],workshop2:[]},wsSessions={workshop1:[],workshop2:[]};
let wsWorkerBars={workshop1:[],workshop2:[]},wsWorkerSessions={workshop1:[],workshop2:[]};
let invItems=[],currentRafBars=[];
let targetBar=null,targetBarType=null;
let invType='24',gtType='give',darkMode=false;
/* ── نطاق المستخدم الحالي (يُعيَّن بعد تسجيل الدخول) ── */
let _currentUser='',_LSKEY='gp12',_LSDRAFT='gp12_draft',_SITE='';

/* ═══════════ UTILS ═══════════ */
/* ── تنسيق حي للأرقام أثناء الكتابة ── */
function liveNum(el){
    const raw=el.value.replace(/\s/g,'').replace(/,/g,'.');
    if(raw===''||raw==='-'||raw==='.')return;
    const neg=raw.startsWith('-');
    const abs=neg?raw.slice(1):raw;
    const dotIdx=abs.indexOf('.');
    const intPart=dotIdx>=0?abs.slice(0,dotIdx):abs;
    const decPart=dotIdx>=0?abs.slice(dotIdx+1):null;
    const intFmt=intPart.replace(/\B(?=(\d{3})+(?!\d))/g,' ');
    el.value=(neg?'-':'')+intFmt+(decPart!==null?','+decPart:'');
}
/* إدخال بدون فاصلة — آخر رقمين هما الكسر (÷100) */
function liveNum2(el){
    const sel=el.selectionStart;
    const digits=el.value.replace(/[^\d]/g,'');
    if(!digits){el.value='';return;}
    const num=parseInt(digits,10)/100;
    const intPart=Math.floor(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g,' ');
    const decPart=(num%1).toFixed(2).slice(2);
    const prev=el.value;
    el.value=intPart+','+decPart;
    /* حافظ على موضع المؤشر تقريباً */
    const diff=el.value.length-prev.length;
    try{el.setSelectionRange(sel+diff,sel+diff);}catch(e){}
}
function readNum(id){
    const el=document.getElementById(id);
    if(!el)return 0;
    return parseFloat(el.value.replace(/\s/g,'').replace(/,/g,'.').replace(/[−–]/g,'-'))||0;
}
function liveSet(id,val){
    const el=document.getElementById(id);if(!el)return;
    el.value=String(val);liveNum(el);
}
function fmt(n,d=2){
    if(typeof n!=='number')return n;
    d=d>0?2:0;   /* توحيد: الأوزان بخانتين عشريتين فقط، والدينار صحيح بلا فاصلة */
    const neg=n<0;
    const abs=Math.abs(n);
    const fixed=abs.toFixed(d);
    const [int,dec]=fixed.split('.');
    const intFmt=int.replace(/\B(?=(\d{3})+(?!\d))/g,'\u202F');
    return (neg?'−':'')+intFmt+(d>0?','+dec:'');
}
/* FIX: uid() غير قابل للاستخدام في onclick بدون quotes — نستخدم base36 نظيف */
function uid(){return '_'+Math.random().toString(36).slice(2,9)+Date.now().toString(36)}


/* ═══════════ VOICE INPUT ═══════════ */
let _voiceActive=false;
window.startVoice=function(target){
    if(!('webkitSpeechRecognition' in window||'SpeechRecognition' in window))
        return toast('⚠️ المتصفح لا يدعم الإدخال الصوتي (جرّب Chrome)','error');
    if(_voiceActive)return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const r=new SR();
    r.lang='ar-DZ';
    r.continuous=false;
    r.interimResults=false;
    const btn=document.getElementById(target==='inv'?'voiceBtnInv':'voiceBtnRaf');
    const origStyle=btn?btn.style.cssText:'';
    function setListening(on){
        _voiceActive=on;
        if(!btn)return;
        if(on){btn.textContent='🔴';btn.style.borderColor='#ef4444';btn.style.color='#ef4444';}
        else{btn.textContent='🎙️';btn.style.cssText=origStyle;}
    }
    r.onstart=()=>{setListening(true);toast('🎙️ استمع... تكلم الآن','info');};
    r.onend=()=>setListening(false);
    r.onerror=()=>{setListening(false);toast('⚠️ لم يتم التعرف على الصوت — حاول مجدداً','error');};
    r.onresult=(e)=>{
        const txt=e.results[0][0].transcript||'';
        _applyVoice(txt,target);
    };
    r.start();
};
/* ═══════════ محرّك الأرقام العربية المنطوقة ═══════════
   يحوّل: الأرقام الهندية (٣٤٥→345)، الكلمات (ثلاثة، خمسمية، تمنطاش)،
   المضاعفات (ألف/مليون/مليار + جموعها ملاير/ملايين/آلاف)، والأرقام المركّبة
   المعطوفة بـ"و" (3 ملاير و650 مليون و400 ألف → 3650400000 بالجمع الصحيح). */
function _arNormTok(t){
    return t.replace(/[أإآٱ]/g,'ا').replace(/ة/g,'ه').replace(/ؤ/g,'و').replace(/ئ/g,'ي').replace(/ء/g,'');
}
const _AR_ONES={'صفر':0,'واحد':1,'واحده':1,'وحد':1,'وحده':1,'اثنان':2,'اثنين':2,'اثنتين':2,'ثنين':2,'اتنين':2,'زوج':2,'جوج':2,'ثلاثه':3,'ثلاث':3,'تلاته':3,'تلات':3,'تلاث':3,'اربعه':4,'اربع':4,'ربعه':4,'خمسه':5,'خمس':5,'سته':6,'ست':6,'سبعه':7,'سبع':7,'ثمانيه':8,'ثمان':8,'تمنيه':8,'تمن':8,'تسعه':9,'تسع':9};
const _AR_TEENS={'عشره':10,'عشر':10,'احدعشر':11,'حداش':11,'احداش':11,'اثناعشر':12,'طناش':12,'اثناش':12,'تلطاش':13,'ربعطاش':14,'اربعطاش':14,'خمسطاش':15,'ستطاش':16,'سبعطاش':17,'تمنطاش':18,'ثمنطاش':18,'تسعطاش':19};
const _AR_TENS={'عشرين':20,'ثلاثين':30,'تلاتين':30,'اربعين':40,'ربعين':40,'خمسين':50,'ستين':60,'سبعين':70,'ثمانين':80,'تمانين':80,'تسعين':90};
const _AR_HUND={'ميتين':200,'مياتين':200,'ثلاثميه':300,'تلاتميه':300,'اربعميه':400,'ربعميه':400,'خمسميه':500,'ستميه':600,'سبعميه':700,'تمنميه':800,'ثمنميه':800,'تسعميه':900};
const _AR_HUNDRED_WORD=new Set(['ميه','مايه','مئه']); /* تضرب ما قبلها ×100 */
const _AR_FRAC={'نص':0.5,'نصف':0.5,'ربع':0.25,'ثلث':1/3};
const _AR_DUAL={'الفين':2000,'الفان':2000,'مليونين':2000000,'مليارين':2000000000};
const _AR_MULT={'الف':1e3,'الاف':1e3,'اله':1e3,'مليون':1e6,'ملاين':1e6,'ملايين':1e6,'مليار':1e9,'مليارد':1e9,'ملاير':1e9,'ملايير':1e9};
function _arClass(raw){
    if(/^\d+(?:\.\d+)?$/.test(raw)) return {t:'num',v:parseFloat(raw)};
    const w=_arNormTok(raw);
    if(w in _AR_DUAL) return {t:'num',v:_AR_DUAL[w]};
    if(w in _AR_FRAC) return {t:'add',v:_AR_FRAC[w]};
    if(w in _AR_ONES) return {t:'add',v:_AR_ONES[w]};
    if(w in _AR_TEENS) return {t:'add',v:_AR_TEENS[w]};
    if(w in _AR_TENS) return {t:'add',v:_AR_TENS[w]};
    if(_AR_HUNDRED_WORD.has(w)) return {t:'hund'};
    if(w in _AR_HUND) return {t:'add',v:_AR_HUND[w]};
    if(w in _AR_MULT) return {t:'mult',v:_AR_MULT[w]};
    return null;
}
function _arIsNumTok(raw){ return raw!=='و'&&raw!==''&&_arClass(raw)!==null; }
function _arEvalRun(toks){
    let total=0,current=0;
    for(const tok of toks){
        if(tok==='و'||tok==='') continue;
        const c=_arClass(tok); if(!c) continue;
        if(c.t==='num'||c.t==='add'){ current+=c.v; }
        else if(c.t==='hund'){ current=(current||1)*100; }
        else if(c.t==='mult'){ if(current===0)current=1; current*=c.v; total+=current; current=0; }
    }
    return total+current;
}
function _arNumberize(s){
    /* فاصل الآلاف: 600,000 → 600000 و 1,234,567 → 1234567 (لا يمسّ الكسور مثل 3,5) */
    s=s.replace(/[,،](?=\d{3}(?:\D|$))/g,'');
    /* كسور بصيغة عبارة قبل التقطيع */
    s=s.replace(/نص\s*مليار/g,'500000000').replace(/ربع\s*مليار/g,'250000000')
       .replace(/نص\s*مليون/g,'500000').replace(/ربع\s*مليون/g,'250000').replace(/ثلث\s*مليون/g,'333333')
       .replace(/مليار\s*ونص/g,'1500000000').replace(/مليون\s*ونص/g,'1500000').replace(/مليون\s*وربع/g,'1250000');
    /* فصل "و" الملتصقة بعدد أو كلمة-عدد دون لمس "واحد/وحد" */
    const parts=s.split(/\s+/), expanded=[];
    for(const p of parts){
        if(p.length>1&&p[0]==='و'){
            const rest=p.slice(1);
            if(/^\d/.test(rest)||_arIsNumTok(rest)){ expanded.push('و'); expanded.push(rest); continue; }
        }
        expanded.push(p);
    }
    /* اجمع مقاطع الأرقام المتتالية (عدد و عدد ...) في رقم واحد */
    const out=[]; let i=0;
    while(i<expanded.length){
        if(_arIsNumTok(expanded[i])){
            const run=[expanded[i]]; let j=i+1;
            while(j<expanded.length){
                if(_arIsNumTok(expanded[j])){ run.push(expanded[j]); j++; }
                else if(expanded[j]==='و'&&j+1<expanded.length&&_arIsNumTok(expanded[j+1])){ run.push('و'); j++; }
                else break;
            }
            out.push(String(Math.round(_arEvalRun(run)*1000)/1000)); i=j;
        }else{ out.push(expanded[i]); i++; }
    }
    return out.join(' ');
}
function _parseArabicNum(s){
    /* أرقام هندية/فارسية → لاتينية */
    s=(s||'').replace(/[٠-٩]/g,d=>d.charCodeAt(0)-0x0660).replace(/[۰-۹]/g,d=>d.charCodeAt(0)-0x06F0);
    /* فصل الرقم عن الحرف الملتصق: "100غ"→"100 غ" ، "عيار750"→"عيار 750" */
    s=s.replace(/(\d)([\u0621-\u064A])/g,'$1 $2').replace(/([\u0621-\u064A])(\d)/g,'$1 $2');
    return _arNumberize(s).replace(/\s+/g,' ').trim();
}
function _extractVoice(txt){
    const t=_parseArabicNum(txt);
    /* وزن: رقم قبل "غ"/"غرام" أو رقم بعد "ميزان"/"وزن"/"يزن" */
    let wm=t.match(/([\d]+(?:[.,][\d]+)?)\s*(?:غ\b|غرام)/i);
    if(!wm) wm=t.match(/(?:الميزان|ميزان|الوزن|وزن|يزن)\s*([\d]+(?:[.,][\d]+)?)/i);
    /* عيار: رقم بعد "عيار" أو "قيراط" أو "عير" */
    const km=t.match(/(?:عيار|قيراط|عير)\s*([\d]+)/i);
    /* سعر: رقم بعد "سعر" أو "بـ" (يسمح بمسافة) */
    const pm=t.match(/(?:سعر|بـ)\s*([\d]+(?:[.,][\d]+)?)/i);
    /* fallback: أول عددين في النص */
    const nums=(t.match(/[\d]+(?:[.,][\d]+)?/g)||[]).map(n=>parseFloat(n.replace(',','.')));
    const w=wm?parseFloat(wm[1].replace(',','.')):nums[0]||null;
    const k=km?parseInt(km[1]):nums[1]||null;
    const p=pm?parseFloat(pm[1].replace(',','.')):null;
    return{w,k,p,raw:txt};
}
function _applyVoice(txt,target){
    const{w,k,p,raw}=_extractVoice(txt);
    if(!w&&!k)return toast(`⚠️ لم أفهم: "${raw}"  — قل مثلاً: 100 غ عيار 750`,'error');
    if(target==='raf'){
        /* أجد أول سطر فارغ في الرافيناج */
        let placed=false;
        for(let i=1;i<=rafRows;i++){
            const wEl=document.getElementById('rafW_'+i);
            if(wEl&&!wEl.value){
                if(w!=null)wEl.value=w;
                const kEl=document.getElementById('rafK_'+i);
                if(kEl&&k!=null)kEl.value=k;
                calcRaf();
                placed=true;
                toast(`✅ ${w??''}غ عيار ${k??''}`,'info');
                break;
            }
        }
        if(!placed){addRafRow();setTimeout(()=>_applyVoice(txt,target),150);}
    }else{
        /* أجد أول سطر فارغ في الفاتورة */
        let placed=false;
        for(let i=1;i<=invRows;i++){
            const wEl=document.getElementById('inv_w_'+i);
            if(wEl&&!wEl.value){
                if(w!=null)wEl.value=w;
                const kEl=document.getElementById('inv_k_'+i);
                if(kEl&&k!=null)kEl.value=k;
                const pEl=document.getElementById('inv_p_'+i);
                if(pEl&&p!=null)pEl.value=p;
                calcInvRow(i);
                placed=true;
                toast(`✅ ${w??''}غ عيار ${k??''}${p?' سعر '+p:''}`,'info');
                break;
            }
        }
        if(!placed){addInvRow();setTimeout(()=>_applyVoice(txt,target),150);}
    }
}
/* ═══════════ VOICE — HOME ═══════════ */
window.startHomeVoice=function(){
    if(!('webkitSpeechRecognition' in window||'SpeechRecognition' in window))
        return toast('⚠️ المتصفح لا يدعم الإدخال الصوتي (جرّب Chrome)','error');
    if(_voiceActive)return;
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    const r=new SR();
    r.lang='ar-DZ';r.continuous=false;r.interimResults=false;
    const btn=document.getElementById('voiceBtnHome');
    const origText=btn?btn.innerHTML:'';
    function setListening(on){
        _voiceActive=on;
        if(!btn)return;
        if(on){
            btn.innerHTML='<span style="font-size:1.15rem">🔴</span><span>يستمع... تكلم الآن</span>';
            btn.style.borderColor='#ef4444';btn.style.color='#fca5a5';
        }else{
            btn.innerHTML=origText;
            btn.style.borderColor='#8b5cf6';btn.style.color='#c4b5fd';
        }
    }
    r.onstart=()=>setListening(true);
    r.onend=()=>setListening(false);
    r.onerror=()=>{setListening(false);toast('⚠️ لم يتم التعرف على الصوت — حاول مجدداً','error');};
    r.onresult=(e)=>{const txt=e.results[0][0].transcript||'';console.log('🎙️ Chrome قال:',txt);toast(`🎙️ سمع: "${txt}"`,'info');_applyHomeVoice(txt);};
    r.start();
};

/* تحويل الأعداد المكتوبة بكلمات إلى أرقام (عربي + درجة جزائرية) */
function _wordToNum(txt){
    /* نفصل "و" المُلصقة بأرقام أو وحيدة بين كلمات (‌\bو\b لا يعمل مع عربي) */
    const T=_parseArabicNum(txt)
        .replace(/و(\d)/g,' $1')   /* و4  →  4  */
        .replace(/(\d)و/g,'$1 ')   /* 4و  →  4  */
        .replace(/\s+و\s+|\sو$|^و\s/g,' ');
    const W={
        'صفر':0,'واحد':1,'وحدة':1,'اثنين':2,'اثنان':2,'جوج':2,'ثلاثة':3,'ثلاث':3,
        'أربعة':4,'أربع':4,'خمسة':5,'خمس':5,'ستة':6,'ست':6,'سبعة':7,'سبع':7,
        'ثمانية':8,'ثماني':8,'تسعة':9,'تسع':9,
        'عشرة':10,'عشر':10,
        'عشرين':20,'ثلاثين':30,'أربعين':40,'خمسين':50,
        'ستين':60,'سبعين':70,'ثمانين':80,'تسعين':90,
        'مية':100,'مئة':100,'مائة':100,
        'ميتين':200,'مئتين':200,'مئتان':200,'ويتين':200,'مياتين':200,'ميتان':200,
        'ثلاثمية':300,'ثلاثمائة':300,'ثلثمية':300,
        'أربعمية':400,'أربعمائة':400,'ربعمية':400,
        'خمسمية':500,'خمسمائة':500,
        'ستمية':600,'ستمائة':600,
        'سبعمية':700,'سبعمائة':700,
        'ثمانمية':800,'ثمانمائة':800,
        'تسعمية':900,'تسعمائة':900,
        'ألف':1000,'آلاف':1000,'الف':1000,
        /* كيلو = مضاعف ×1000 مثل ألف */
        'كيلو':1000,'كيلوغرام':1000,'كغ':1000,
        'مليون':1000000,'مليار':1000000000
    };
    /* نقرأ التوكنات بالترتيب — كل توكن قد يكون رقماً أو كلمة */
    let total=0,cur=0;
    const tokens=T.split(/\s+/).filter(Boolean);
    for(const w of tokens){
        /* رقم مباشر (Chrome غالباً يعيد الأعداد الكبيرة بالأرقام) */
        const dv=parseFloat(w.replace(',','.'));
        if(!isNaN(dv)&&/^\d/.test(w)){
            /* إن كان cur مُجمَّع (مثل ميتين) نعطيه الرقم المباشر كمضاعف */
            if(cur>0)cur+=dv; else cur=dv;
            continue;
        }
        const v=W[w];
        if(v===undefined)continue;
        if(v===1000){
            /* ألف: تضاعف cur أو تبدأ من 1 */
            cur=cur===0?1000:cur*1000;
        }else if(v>=1000000){
            /* مليون/مليار: cur×مقياس → يُضاف لـtotal */
            if(cur===0)cur=1;
            cur*=v;total+=cur;cur=0;
        }else{
            cur+=v;
        }
    }
    total+=cur;
    return total>0?total:null;
}

/* يصحّح اسم الزبون المنطوق بمقارنته مع دفتر الأسماء في VA */
function _normCust(spoken){
    if(!spoken||!window.VA?.matchName)return spoken;
    const res=VA.matchName(spoken);
    if(res.ok){
        if(res.name!==spoken)toast(`🔁 صُحِّح الاسم: "${spoken}" ← "${res.name}"`,'info');
        return res.name;
    }
    /* اسم غير موجود بالحرف: اقترح زبوناً جديداً بدل التمرير الصامت */
    toast(`⚠️ «${spoken}» غير موجود في أسمائك — إن كان زبوناً جديداً أكمل الحفظ، وإلا صحّح الاسم`,'info');
    return spoken;
}
/* ═══════════ حصيلة الفترة (تقديرية) — اليوم/الشهر ═══════════ */
function _periodSummary(fromTs,toTs){
    const inR=o=>(o._ts||0)>=fromTs&&(o._ts||0)<=toTs;
    let buyG=0,sellGlocal=0,dubaiUSD=0,dubaiDZD=0,expDZD=0,expUSD=0,shipW=0,dubaiCount=0,buyCount=0;
    (ops||[]).forEach(o=>{
        if(!inR(o))return;
        const a=Number(o.a)||0;
        switch(o.t){
            case 'شراء': buyG+=a; buyCount++; break;
            case 'بيع': sellGlocal+=a; break;
            case 'بيع دبي': dubaiUSD+=a; dubaiDZD+=a*(Number(o.rate)||dollarRate||0); dubaiCount++; break;
            case 'شحن': shipW+=a; break;
            case 'مصاريف': if(o.m==='دولار')expUSD+=a; else expDZD+=a; break;
        }
    });
    const expUSDtoDZD=expUSD*(dollarRate||0);
    const net=(dubaiDZD+sellGlocal)-(buyG+expDZD+expUSDtoDZD);
    return {buyG,sellGlocal,dubaiUSD,dubaiDZD,expDZD,expUSD,expUSDtoDZD,shipW,dubaiCount,buyCount,net};
}
function _dayRange(d){const s=new Date(d);s.setHours(0,0,0,0);const e=new Date(d);e.setHours(23,59,59,999);return [s.getTime(),e.getTime()];}
function _monthRange(d){const s=new Date(d.getFullYear(),d.getMonth(),1,0,0,0,0);const e=new Date(d.getFullYear(),d.getMonth()+1,0,23,59,59,999);return [s.getTime(),e.getTime()];}
window.showPeriodSummary=(scope)=>{
    const now=new Date();
    const [from,to]=scope==='month'?_monthRange(now):_dayRange(now);
    const r=_periodSummary(from,to);
    const lbl=scope==='month'?'هذا الشهر':'اليوم';
    const f0=n=>Math.round(n).toLocaleString('fr-FR');
    let m=document.getElementById('periodSumModal');
    if(!m){m=document.createElement('div');m.id='periodSumModal';m.className='modal-overlay';document.body.appendChild(m);}
    m.innerHTML=`<div class="modal-box" style="max-width:430px">
        <div class="modal-header"><h3 style="font-size:.95rem">📊 حصيلة ${lbl}</h3><button class="close-btn" onclick="closeModal('periodSumModal')">✕</button></div>
        <div style="padding:.9rem;font-family:Tajawal,sans-serif;text-align:right;direction:rtl">
          <table style="width:100%;border-collapse:collapse;font-size:.84rem">
            <tr><td style="padding:.35rem 0">🏙️ مبيعات دبي${r.dubaiCount?` (${r.dubaiCount})`:''}</td><td style="text-align:left;font-weight:800">${f0(r.dubaiDZD)} دج <span style="color:var(--t3);font-size:.74rem">(${f0(r.dubaiUSD)} $)</span></td></tr>
            ${r.sellGlocal?`<tr><td style="padding:.35rem 0">🟡 مبيعات محلية</td><td style="text-align:left;font-weight:800">${f0(r.sellGlocal)} دج</td></tr>`:''}
            <tr><td style="padding:.35rem 0">🛒 مشتريات الذهب${r.buyCount?` (${r.buyCount})`:''}</td><td style="text-align:left;font-weight:800;color:#dc2626">− ${f0(r.buyG)} دج</td></tr>
            ${(r.expDZD||r.expUSD)?`<tr><td style="padding:.35rem 0">💸 مصاريف</td><td style="text-align:left;font-weight:800;color:#dc2626">− ${f0(r.expDZD+r.expUSDtoDZD)} دج</td></tr>`:''}
            ${r.shipW?`<tr><td style="padding:.35rem 0;color:var(--t3)">🚢 وزن مشحون</td><td style="text-align:left;color:var(--t3)">${fmt(r.shipW,2)} غ</td></tr>`:''}
            <tr><td colspan="2"><hr style="border:none;border-top:1px solid var(--border);margin:.45rem 0"></td></tr>
            <tr><td style="padding:.35rem 0;font-weight:800">📊 صافي تقديري</td><td style="text-align:left;font-weight:900;font-size:1.05rem;color:${r.net>=0?'#16a34a':'#dc2626'}">${f0(r.net)} دج</td></tr>
          </table>
          <div style="font-size:.66rem;color:var(--t3);margin-top:.7rem;line-height:1.6">⚠️ رقم تقديري يجمع حركات ${lbl} فقط. قد يتأثّر إن اشتريت في فترة وبِعت في أخرى — الشهري أدقّ من اليومي. مبيعات دبي محوّلة بسعر صرف كل فاتورة وقت بيعها.</div>
        </div></div>`;
    m.classList.add('active');
};

function _applyHomeVoice(rawTxt){
    const txt=_parseArabicNum(rawTxt);

    /* ══════════════════════════════════════════════════════
       📊  الفائدة/الحصيلة — يومية أو شهرية
       أمثلة: "الفائدة اليوم" · "حصيلة الشهر" · "كم ربحت اليوم"
    ══════════════════════════════════════════════════════ */
    if(/(فايده|حصيله|ربح|ارباح|مربوح|الربح)/.test(txt.replace(/[إأآٱ]/g,'ا').replace(/[ؤئ]/g,'ي').replace(/ء/g,'').replace(/ى/g,'ي').replace(/ة/g,'ه'))){
        const _nt=txt.replace(/ة/g,'ه');
        const isMonth=/(شهر|شهري)/.test(_nt);
        showPeriodSummary(isMonth?'month':'day');
        return;
    }

    /* ══════════════════════════════════════════════════════
       🚢  شحن — مثال: "شحن 4004 سعر 3.1 مكتب خليل"
    ══════════════════════════════════════════════════════ */
    if(/^شحن|^ارسل|^أرسل|^بعثت\b|شحنة/.test(txt)){
        /* الوزن: أول رقم في الجملة */
        const allNums=(txt.match(/\d+(?:[.,]\d+)?/g)||[]).map(n=>parseFloat(n.replace(',','.')));
        const weight=allNums[0]||null;
        /* السعر: الرقم بعد كلمة "سعر" */
        let price=0;
        const sM=txt.match(/سعر\s*(\d+(?:[.,]\d+)?)/);
        if(sM)price=parseFloat(sM[1].replace(',','.'));
        /* المكتب: النص بعد "مكتب" أو ما تبقى بعد حذف الكلمات المعروفة */
        let office='';
        const oM=txt.match(/مكتب\s+([\u0600-\u06FF][^\d\n]*?)(?:\s*\d|$)/);
        if(oM)office=oM[1].trim();
        if(!office){
            office=txt.replace(/شحن|ارسل|أرسل|سعر/g,'')
                       .replace(/\d+(?:[.,]\d+)?/g,'')
                       .replace(/\s+/g,' ').trim();
        }
        if(!weight)return toast('⚠️ لم أفهم الوزن — قل: شحن 4000 سعر 3.1 مكتب خليل','error');
        if(!office)return toast('⚠️ لم أفهم اسم المكتب','error');
        openShipping();
        setTimeout(()=>{
            document.getElementById('shipWeight').value=weight;
            {const _e=document.getElementById('shipPrice'); if(_e)_e.value=price||'';}
            document.getElementById('shipOffice').value=office;
            toast(`🚢 شحن ${weight} غ — سعر ${price} — مكتب ${office} | اضغط حفظ للتأكيد`,'info');
        },400);
        return;
    }

    /* ══════════════════════════════════════════════════════
       💲  بيع / شراء دولار
       مثال بيع : "بيع دولار طاهر لعلمة 150000 سعر 24800"
       مثال شراء: "شراء دولار علي 500 سعر 24500"
    ══════════════════════════════════════════════════════ */
    const isBuyDoll =/(?:شراء|اشتريت|اشتري|جبت|جيبي)\s+دولار/.test(txt);
    const isSellDoll=/(?:بيع|بعت|بيعت)\s+دولار/.test(txt);
    if(isBuyDoll||isSellDoll){
        /* السعر: الرقم بعد "سعر" */
        let rate=dollarRate;
        const sM=txt.match(/سعر\s*(\d+(?:[.,]\d+)?)/);
        if(sM)rate=parseFloat(sM[1].replace(',','.'));
        /* المبلغ: آخر رقم قبل كلمة "سعر" (أو آخر رقم في الجملة) */
        const txtBeforeSeur=sM?txt.slice(0,txt.indexOf('سعر')):txt;
        const amNums=(txtBeforeSeur.match(/\d+(?:[.,]\d+)?/g)||[]).map(n=>parseFloat(n.replace(',','.')));
        const amount=amNums.length?amNums[amNums.length-1]:null;
        /* الزبون: النص العربي بين "دولار" وأول رقم */
        let customer='';
        const dollPos=txt.search(/دولار/);
        if(dollPos>-1){
            const afterDollar=txt.slice(dollPos+5).trim();
            const cM=afterDollar.match(/^([\u0600-\u06FF][^\d]*?)(?=\d)/);
            if(cM)customer=cM[1].replace(/سعر|شراء|بيع|من|إلى/g,'').trim();
        }
        customer=_normCust(customer);
        if(!customer||!amount)
            return toast('⚠️ قل مثلاً: بيع دولار طاهر 150000 سعر 24800','error');
        openDollar(isBuyDoll?'buy':'sell');
        setTimeout(()=>{
            document.getElementById('dollarCustomer').value=customer;
            liveSet('dollarAmount',amount);
            liveSet('dollarRate',rate);
            document.getElementById('dinarEq').textContent='= '+fmt(amount*rate,0)+' DZD';
            toast(`💲 ${isBuyDoll?'شراء':'بيع'} دولار — ${customer}: ${fmt(amount,0)}$ × ${fmt(rate,0)} = ${fmt(amount*rate,0)} دج | اضغط حفظ للتأكيد`,'info');
        },420);
        return;
    }

    /* ── اتجاه العملية (أخذ / إعطاء) ── */
    const giveRe=/أعطيت|سلّمت|سلمت|دفعت|أدفعت|وزّعت|أخذ|اخذ|خذ|ياخذ|يأخذ|آخذ/;
    const recvRe=/دفع|سلّم|سلم|أعطى|أعطا|أرسل|ارسل|جاب|ودع|أودع/;
    let action=giveRe.test(txt)?'give':recvRe.test(txt)?'receive':null;
    if(!action)action='receive'; /* افتراضي */
    /* ── نوع المعدن ── */
    const typeMap=[
        /* لانقو / لانكو / لانجو / لينجو / لانغو + langou/lango/lanjo (نطق STT) */
        {re:/ل[اي]?ن[قكغجءأ][وى]|لن[قكغجء][وى]|لانق|لانك|لانجو|لينجو|لانغو|langou?|lanjo|lanko|langu|lingot|سبيكة|سبائك|ذهب.?24|عيار.?ألف|عيار.?1000/i,val:'ذهب 24'},
        /* طرونط / سات طرونط / sept trente = كلها تعني ذهب 730 */
        {re:/مكسر|730|ذهب.?730|ذهب.?مكسر|طرونط|ترونط|ترونت|tront|trente|سبعمية.?ثلاثين/i,val:'ذهب 730'},
        {re:/دولار|دلار|\$/,val:'دولار'},
        {re:/دينار|دج|فلوس/,val:'دينار'},
        {re:/ذهب/,val:'ذهب 730'},
    ];
    let metal='دينار';
    for(const{re,val}of typeMap){if(re.test(txt)){metal=val;break;}}
    /* ── المبلغ ── */
    const amount=_wordToNum(txt);
    /* ── اسم الزبون ── */
    /* جملة من نوع: "[اسم] دفع X" أو "دفعت/سلّمت [اسم] X" */
    let customer='';
    const custBefore=txt.match(/^([\u0600-\u06FF ]+?)\s+(?:دفع|سلّم|سلم|أعطى|أعطا|أرسل|جاب|ودع|أخذ|اخذ|خذ|ياخذ|يأخذ)/);
    const custAfter=txt.match(/(?:أعطيت|سلّمت|سلمت|دفعت|أدفعت)\s+([\u0600-\u06FF ]+?)\s+\d/);
    if(custBefore) customer=custBefore[1].trim();
    else if(custAfter) customer=custAfter[1].trim();
    /* تنظيف الكلمات غير الاسمية */
    const stripWords=/\b(دينار|ذهب|دولار|لانقو|لينقو|لانجو|لينجو|لانغو|مكسر|سبيكة|كيلو|فلوس|دج)\b/g;
    customer=customer.replace(stripWords,'').replace(/\s+/g,' ').trim();
    /* fallback: أول كلمة عربية في النص إن لم نجد */
    if(!customer){
        const firstWord=txt.match(/^([\u0600-\u06FF]+)/);
        if(firstWord)customer=firstWord[1];
    }
    /* تصحيح الاسم من دفتر الأسماء */
    customer=_normCust(customer);
    if(!customer||!amount){
        return toast(`⚠️ لم أفهم جيداً: "${rawTxt}" — قل مثلاً: عثمان دفع 5000 دينار`,'error');
    }
    /* ── فتح المودال وملء الحقول ── */
    openGiveTake(action);
    setTimeout(()=>{
        document.getElementById('gtCustomer').value=customer;
        document.getElementById('gtMetal').value=metal;
        liveSet('gtAmount',amount);
        showGTBalance&&showGTBalance();
        window.toggleGTKarat&&window.toggleGTKarat();  /* يضبط التسمية والعرض */
        toast(`✅ ${action==='give'?'تسليم':'استلام'} — ${customer}: ${fmt(amount,(metal==='دينار')?0:2)} ${metal}`,'info');
    },420);
}
/* ═══════════ EXPORT / IMPORT — مُعرَّف في firebase.js ═══════════ */
/* exportData و importData مُعرَّفتان في firebase.js وتعملان على متجر الأحداث */
/* ═══════════ DARK MODE ═══════════ */
function applyDark(){
    document.body.classList.toggle('dark',darkMode);
    document.getElementById('darkBtn').innerHTML=darkMode?'<i class="fas fa-sun"></i>':'<i class="fas fa-moon"></i>';
}
function toggleDark(){darkMode=!darkMode;applyDark();save()}
function toggleFullscreen(){
    const btn=document.getElementById('fsBtn');
    if(!document.fullscreenElement){
        document.documentElement.requestFullscreen().catch(()=>{});
        if(btn)btn.innerHTML='<i class="fas fa-compress"></i>';
    }else{
        document.exitFullscreen().catch(()=>{});
        if(btn)btn.innerHTML='<i class="fas fa-expand"></i>';
    }
}
document.addEventListener('fullscreenchange',()=>{
    const btn=document.getElementById('fsBtn');
    if(btn)btn.innerHTML=document.fullscreenElement
        ?'<i class="fas fa-compress"></i>'
        :'<i class="fas fa-expand"></i>';
});

/* ═══════════ SETTINGS ═══════════ */
function openSettings(){
    document.getElementById('settingGoldPrice').value=goldPrice;
    document.getElementById('settingDollarRate').value=dollarRate;
    /* لوحة الأدمن */
    const isAdmin=_usersCache[_currentUser]?.isAdmin;
    const ap=document.getElementById('adminPanel');
    if(ap)ap.style.display=isAdmin?'block':'none';
    if(isAdmin){renderUsersList();if(typeof renderCustAccounts==='function')renderCustAccounts();}
    try{ const vi=document.getElementById('visionKeyInput'); if(vi)vi.value=_getVisionKey(); }catch(e){}
    document.getElementById('settingsModal').classList.add('active');
    setTimeout(()=>document.getElementById('settingGoldPrice').focus(),320);
}
function saveSettings(){
    const gp=parseFloat(document.getElementById('settingGoldPrice').value);
    const dr=parseFloat(document.getElementById('settingDollarRate').value);
    if(!isNaN(gp)&&gp>0)goldPrice=gp;
    if(!isNaN(dr)&&dr>0)dollarRate=dr;
    closeModal('settingsModal');updAll();save();toast('✅ تم حفظ الإعدادات');
}

/* ═══════════ OPENING BALANCES (مرة واحدة فقط) ═══════════ */
const _LIQ_USED_KEY='gp12_liq_set';
let _liqDebtCnt=0;
let _liq730Cnt=0,_liq24Cnt=0,_liqWsCnt=0;
window._addLiqWsRow=function(ws,w,k){
    _liqWsCnt++; const i=_liqWsCnt;
    const box=document.getElementById('liqWsBars_'+ws); if(!box)return;
    const ac=ws==='workshop1'?'#0ea5e9':'#a855f7';
    const row=document.createElement('div'); row.id='liqWsRow_'+i;
    row.dataset.ws=ws;
    row.style.cssText='display:flex;gap:.4rem;margin-bottom:.35rem;align-items:center';
    row.innerHTML=`
        <input type="text" inputmode="decimal" id="liqWsW_${i}" placeholder="الوزن (غ)" value="${w!=null?w:''}" dir="ltr" oninput="liveNum(this)"
            style="flex:1;padding:.45rem .6rem;border-radius:8px;border:1.5px solid ${ac}55;background:var(--card2);color:${ac};font-family:monospace;font-weight:900;font-size:.85rem;text-align:center">
        <input type="text" inputmode="numeric" id="liqWsK_${i}" placeholder="العيار" value="${k!=null?k:730}" dir="ltr"
            style="width:80px;padding:.45rem .4rem;border-radius:8px;border:1.5px solid var(--border);background:var(--card2);color:var(--t);font-family:monospace;font-weight:800;font-size:.8rem;text-align:center">
        <button type="button" onclick="document.getElementById('liqWsRow_${i}').remove()"
            style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:7px;color:#EF4444;font-size:.8rem;cursor:pointer;font-weight:900;width:26px;height:26px;flex:0 0 auto">✕</button>`;
    box.appendChild(row);
    const wEl=document.getElementById('liqWsW_'+i); if(wEl)wEl.focus();
};
window._addLiq24Row=function(w){
    _liq24Cnt++; const i=_liq24Cnt;
    const box=document.getElementById('liq24Bars'); if(!box)return;
    const row=document.createElement('div'); row.id='liq24Row_'+i;
    row.style.cssText='display:flex;gap:.4rem;margin-bottom:.35rem;align-items:center';
    row.innerHTML=`
        <input type="text" inputmode="decimal" id="liq24W_${i}" placeholder="الوزن (غ)" value="${w!=null?w:''}" dir="ltr" oninput="liveNum(this)"
            style="flex:1;padding:.45rem .6rem;border-radius:8px;border:1.5px solid rgba(59,130,246,.35);background:var(--card2);color:var(--bl);font-family:monospace;font-weight:900;font-size:.85rem;text-align:center">
        <span style="font-size:.68rem;color:var(--t3);font-weight:800;white-space:nowrap">عيار 1000</span>
        <button type="button" onclick="document.getElementById('liq24Row_${i}').remove()"
            style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:7px;color:#EF4444;font-size:.8rem;cursor:pointer;font-weight:900;width:26px;height:26px;flex:0 0 auto">✕</button>`;
    box.appendChild(row);
    const wEl=document.getElementById('liq24W_'+i); if(wEl)wEl.focus();
};
window._add730BarRow=(w,k)=>{
    _liq730Cnt++; const i=_liq730Cnt;
    const box=document.getElementById('liq730Bars'); if(!box)return;
    const row=document.createElement('div'); row.id='liq730Row_'+i;
    row.style.cssText='display:flex;gap:.35rem;margin-bottom:.3rem;align-items:center';
    row.innerHTML=`
        <input type="text" inputmode="decimal" id="liq730W_${i}" placeholder="الوزن (غ)" value="${w!=null?w:''}" dir="ltr" oninput="liveNum(this)"
            style="flex:2;padding:.4rem;border-radius:7px;border:1px solid var(--border);background:var(--card2);color:var(--t);font-family:Tajawal,sans-serif;font-size:.74rem;font-weight:800;text-align:right">
        <input type="text" inputmode="numeric" id="liq730K_${i}" placeholder="العيار" value="${k!=null?k:730}" dir="ltr"
            style="flex:1;padding:.4rem;border-radius:7px;border:1px solid var(--border);background:var(--card2);color:var(--t);font-family:Tajawal,sans-serif;font-size:.74rem;font-weight:800;text-align:center">
        <button type="button" onclick="document.getElementById('liq730Row_${i}').remove()"
            style="border:none;background:transparent;color:var(--rd);cursor:pointer;font-size:.9rem;padding:.1rem .3rem">🗑️</button>`;
    box.appendChild(row);
    const wEl=document.getElementById('liq730W_'+i); if(wEl)wEl.focus();
};

window.openLiqEdit=()=>{
    /* السماح بإعادة الإدخال إذا كانت جميع الأرصدة صفراً (استعادة بعد فقدان بيانات) */
    const allZero=B.دينار===0&&B.دولار===0&&g730.length===0&&g24.length===0;
    if(localStorage.getItem(_LIQ_USED_KEY)&&!allZero){
        toast('⚠️ تم اعتماد الأرصدة الافتتاحية مسبقاً — لا يمكن التكرار إلا عند صفر الرصيد','error');
        return;
    }
    /* تصفير الحقول */
    ['liqDinar','liqDollar','liqG24'].forEach(id=>{
        const el=document.getElementById(id);if(el)el.value='';
    });
    /* تصفير قائمة سبائك 730 وإضافة صفّ فارغ */
    _liq730Cnt=0;_liq24Cnt=0;
    const b730=document.getElementById('liq730Bars'); if(b730)b730.innerHTML='';
    const b24=document.getElementById('liq24Bars'); if(b24)b24.innerHTML='';
    _liqWsCnt=0;
    ['workshop1','workshop2'].forEach(ws=>{const e=document.getElementById('liqWsBars_'+ws);if(e)e.innerHTML='';});
    if(typeof _add730BarRow==='function')_add730BarRow();
    /* تصفير جدول الديون */
    _liqDebtCnt=0;
    const tbody=document.getElementById('liqDebtRows');
    if(tbody)tbody.innerHTML='';
    document.getElementById('liqModal').classList.add('active');
    setTimeout(()=>document.getElementById('liqDinar').focus(),320);
};

window._addLiqDebtRow=()=>{
    _liqDebtCnt++;
    const i=_liqDebtCnt;
    const tbody=document.getElementById('liqDebtRows');
    if(!tbody)return;
    const tr=document.createElement('tr');
    tr.id='liqRow_'+i;
    tr.innerHTML=`
        <td style="padding:.22rem .25rem">
            <input type="text" id="liqDC_${i}" placeholder="اسم الزبون..."
                style="width:100%;min-width:100px;padding:.38rem .5rem;border-radius:8px;border:1px solid var(--border);background:var(--card2);color:var(--t);font-family:Tajawal,sans-serif;font-size:.76rem;font-weight:700;text-align:right;box-sizing:border-box">
        </td>
        <td style="padding:.22rem .25rem">
            <input type="text" id="liqDN_${i}" placeholder="0" inputmode="numeric" dir="ltr"
                oninput="liveNum(this);_liqPaint(this)"
                style="width:100%;min-width:70px;padding:.38rem .3rem;border-radius:8px;border:1px solid rgba(237,184,74,.25);background:var(--card2);color:#EDB84A;font-family:monospace;font-size:.76rem;font-weight:900;text-align:center;box-sizing:border-box">
        </td>
        <td style="padding:.22rem .25rem">
            <input type="number" step="0.001" id="liqD7_${i}" placeholder="0.000" inputmode="decimal"
                oninput="_liqPaint(this)"
                style="width:100%;min-width:70px;padding:.38rem .3rem;border-radius:8px;border:1px solid rgba(245,158,11,.25);background:var(--card2);color:#f59e0b;font-family:monospace;font-size:.76rem;font-weight:900;text-align:center;box-sizing:border-box">
        </td>
        <td style="padding:.22rem .25rem">
            <input type="number" step="0.001" id="liqDG_${i}" placeholder="0.000" inputmode="decimal"
                oninput="_liqPaint(this)"
                style="width:100%;min-width:70px;padding:.38rem .3rem;border-radius:8px;border:1px solid rgba(52,211,153,.25);background:var(--card2);color:#34D399;font-family:monospace;font-size:.76rem;font-weight:900;text-align:center;box-sizing:border-box">
        </td>
        <td style="padding:.22rem .25rem">
            <input type="text" id="liqDU_${i}" placeholder="0" inputmode="decimal" dir="ltr"
                oninput="liveNum(this);_liqPaint(this)"
                style="width:100%;min-width:70px;padding:.38rem .3rem;border-radius:8px;border:1px solid rgba(34,197,94,.25);background:var(--card2);color:#22c55e;font-family:monospace;font-size:.76rem;font-weight:900;text-align:center;box-sizing:border-box">
        </td>
        <td style="padding:.22rem .25rem;text-align:center">
            <button onclick="document.getElementById('liqRow_${i}').remove()"
                style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.25);border-radius:7px;color:#EF4444;font-size:.8rem;cursor:pointer;font-weight:900;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center">✕</button>
        </td>`;
    tbody.appendChild(tr);
    setTimeout(()=>document.getElementById('liqDC_'+i)?.focus(),40);
};
/* تلوين حيّ: موجب = لنا (أخضر) · سالب = علينا (أحمر) — كما rafinag لكن باصطلاح GoldPro */
window._liqPaint=function(el){
    const v=parseFloat(String(el.value).replace(/\s/g,'').replace(',','.'));
    if(isNaN(v)||v===0){
        const base=el.id.startsWith('liqDN')?['#EDB84A','rgba(237,184,74,.25)']
                 :el.id.startsWith('liqDU')?['#22c55e','rgba(34,197,94,.25)']
                 :el.id.startsWith('liqD7')?['#f59e0b','rgba(245,158,11,.25)']
                 :['#34D399','rgba(52,211,153,.25)'];
        el.style.color=base[0];el.style.borderColor=base[1];return;
    }
    el.style.color=v>0?'#22c55e':'#EF4444';
    el.style.borderColor=v>0?'rgba(34,197,94,.45)':'rgba(239,68,68,.45)';
};
window.confirmLiqEdit=()=>{
    const allZero=B.دينار===0&&B.دولار===0&&g730.length===0&&g24.length===0;
    if(localStorage.getItem(_LIQ_USED_KEY)&&!allZero){
        toast('⚠️ تم اعتماد الأرصدة مسبقاً','error');return;
    }
    const dinar  = readNum('liqDinar');
    const dollar = readNum('liqDollar');
    /* جمع سبائك 730 المتعددة (وزن + عيار لكل سبيكة) */
    const bars730=[];
    document.querySelectorAll('#liq730Bars [id^="liq730Row_"]').forEach(row=>{
        const i=row.id.replace('liq730Row_','');
        const w=readNum('liq730W_'+i);
        const k=parseFloat(String(document.getElementById('liq730K_'+i)?.value||'730').replace(',','.'))||730;
        if(w>0)bars730.push({w,k});
    });
    /* ذهب 24 الافتتاحي: وزن إجمالي واحد (عيار 1000) */
    const g24raw=readNum('liqG24');
    const bars24=g24raw>0?[{w:g24raw}]:[];
    /* سبائك الورشتين الافتتاحية */
    const wsAdds=[];
    document.querySelectorAll('[id^="liqWsRow_"]').forEach(row=>{
        const i=row.id.replace('liqWsRow_','');
        const w=readNum('liqWsW_'+i);
        const k=parseFloat(String(document.getElementById('liqWsK_'+i)?.value||'730').replace(',','.'))||730;
        if(w>0)wsAdds.push({ws:row.dataset.ws,w,k});
    });
    const g730raw = bars730.reduce((s,b)=>s+b.w,0);
    const g730v   = bars730.reduce((s,b)=>s+b.w*(b.k/730),0);
    if(dinar<0||dollar<0)
        return toast('القيم يجب أن تكون موجبة أو صفراً','error');

    const debtRows=[];
    document.querySelectorAll('#liqDebtRows tr[id^="liqRow_"]').forEach(tr=>{
        const i=tr.id.replace('liqRow_','');
        const c=(document.getElementById('liqDC_'+i)?.value||'').trim();
        if(!c)return;
        const dv=parseFloat(String(document.getElementById('liqDN_'+i)?.value||'').replace(/\s/g,'').replace(',','.'))||0;
        const gv=parseFloat(String(document.getElementById('liqDG_'+i)?.value||'').replace(',','.'))||0;
        /* الإشارة تحمل الاتجاه: موجب = لنا · سالب = علينا */
        const g7=parseFloat(String(document.getElementById('liqD7_'+i)?.value||'').replace(',','.'))||0;
        const du=parseFloat(String(document.getElementById('liqDU_'+i)?.value||'').replace(/\s/g,'').replace(',','.'))||0;
        if(dv)debtRows.push({c,type:'دينار',  amt:Math.abs(dv),dir:dv>0?'لنا':'علينا'});
        if(du)debtRows.push({c,type:'دولار',  amt:Math.abs(du),dir:du>0?'لنا':'علينا'});
        if(g7)debtRows.push({c,type:'ذهب 730',amt:Math.abs(g7),dir:g7>0?'لنا':'علينا'});
        if(gv)debtRows.push({c,type:'ذهب 24', amt:Math.abs(gv),dir:gv>0?'لنا':'علينا'});
    });

    const sumLines=[];
    if(dinar >0) sumLines.push(`💵 دينار: ${fmt(dinar,0)} دج`);
    if(dollar>0) sumLines.push(`💲 دولار: ${fmt(dollar,2)} $`);
    if(g730v >0) sumLines.push(`👑 ذهب 730: ${bars730.length} سبيكة — ${fmt(g730raw,2)} غ`);
    if(g24raw>0) sumLines.push(`💎 ذهب 24: ${fmt(g24raw,2)} غ`);
    ['workshop1','workshop2'].forEach(ws=>{
        const arr=wsAdds.filter(x=>x.ws===ws);
        if(arr.length)sumLines.push(`🔨 ${ws==='workshop1'?'ورشة دحمون':'ورشة صلاح'}: ${arr.length} سبيكة — ${fmt(arr.reduce((s,b)=>s+b.w,0),2)} غ`);
    });
    if(debtRows.length){
        sumLines.push('');sumLines.push('ديون الزبائن:');
        debtRows.forEach(r=>sumLines.push(
            `  ${r.dir==='لنا'?'🟢':'🔴'} ${r.c}: ${fmt(r.amt,2)} ${r.type} (${r.dir})`
        ));
    }
    if(!sumLines.length) return toast('أدخل رصيداً أو ديناً واحداً على الأقل','error');
    if(!confirm(`سيتم اعتماد الأرصدة الافتتاحية التالية:\n\n${sumLines.join('\n')}\n\nهذه العملية لا يمكن تكرارها. هل أنت متأكد؟`))return;

    const dt=new Date().toLocaleDateString('fr-FR');
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const barsAdd=[];
    const dispBars={};
    bars730.forEach(b=>{
        const bid=uid();
        barsAdd.push({id:bid,pool:'730',w:b.w,k:b.k});
        dispBars[bid]={desc:'رصيد افتتاحي',dt,src:'افتتاحي'};
    });
    bars24.forEach(b=>{
        const bid=uid();
        barsAdd.push({id:bid,pool:'24',w:b.w,k:1000});
        dispBars[bid]={desc:'رصيد افتتاحي (24)',dt,src:'افتتاحي'};
    });
    const wsBarsAdd=wsAdds.map(b=>({ws:b.ws,id:uid(),w:b.w,k:b.k}));
    emitEvent('OPENING',
        {dinar,dollar,g730v,debtRows,barsAdd,wsBarsAdd:(wsBarsAdd.length?wsBarsAdd:undefined)},
        {
            bars:Object.keys(dispBars).length?dispBars:undefined,
            op:{c:'النظام',t:'رصيد افتتاحي',m:'متعدد',a:dinar||dollar||g730v,
                _ts:Date.now(),dt:nowStr}
        }
    );

    try{localStorage.setItem(_LIQ_USED_KEY,'1');}catch(e){}
    ['liqEditBtn','liqSettingsBtn'].forEach(id=>{
        const el=document.getElementById(id);if(el)el.style.display='none';
    });
    closeModal('liqModal');
    toast(`✅ تم اعتماد الأرصدة الافتتاحية${debtRows.length?' مع '+debtRows.length+' دين':''}`);
};

/* ═══════════ BALANCE ═══════════ */
function syncBal(){
    B['ذهب 24'] =g24.reduce((s,b)=>s+(b.w||0),0);
    /* المخزون 730 = مجموع (وزن × عيار ÷ 730) لكل قطعة */
    B['ذهب 730']=g730.reduce((s,b)=>s+(b.w||0)*((b.k||730)/730),0);
}
function _netBuckets(){
    const d_din =debts.reduce((s,d)=>d.type==='دينار'  ?s+(d.a||0):s,0);
    const d_dol =debts.reduce((s,d)=>d.type==='دولار'  ?s+(d.a||0):s,0);
    const d_730 =debts.reduce((s,d)=>d.type==='ذهب 730'?s+(d.a||0):s,0);
    /* ذهب 24 = مخزون + ما نسالو (موجب) − ما يسالوني (سالب) */
    const d_24  =debts.reduce((s,d)=>d.type==='ذهب 24' ?s+(d.a||0):s,0);
    const raw_din  = B.دينار      + d_din;
    const raw_dol  = B.دولار      + d_dol;
    let _wsEq=0;
    try{Object.keys(wsBars||{}).forEach(w=>(wsBars[w]||[]).forEach(b=>{_wsEq+=(b.w||0)*((b.k||730)/730);}));}catch(e){}
    const raw_730  = B['ذهب 730'] + (B.vg730||0) + d_730 + _wsEq;
    const raw_24   = B['ذهب 24']  + (B.vg24||0)  + d_24;
    const din  = raw_din;
    const dol  = raw_dol  * dollarRate / 100;
    const g730 = raw_730  * goldPrice;
    const g24  = raw_24   * (1000/730) * goldPrice;            /* يُضاف مثل ذهب 730 */
    return{din,dol,g730,g24, raw_din,raw_dol,raw_730,raw_24};
}
function net(){
    const{din,dol,g730,g24}=_netBuckets();
    return din+dol+g730+g24;
}
function getCustBal(c,metal){return debts.filter(d=>d.c===c&&d.type===metal).reduce((s,d)=>s+(d.a||0),0)}

/* ═══════════ UI ═══════════ */
function upd(){
    document.getElementById('dinarBal').innerHTML=fmt(B.دينار,0)+'<small> DZD</small>';
    document.getElementById('g730Bal').innerHTML=fmt(B['ذهب 730']+(B.vg730||0),2)+'<small> g</small>';
    /* رقم واحد جامع: الفيزيائي + الافتراضي (لا فصل) */
    document.getElementById('g24Bal').innerHTML=fmt((B['ذهب 24']||0)+(B.vg24||0),2)+'<small> g</small>';
    document.getElementById('usdBal').innerHTML=fmt(B.دولار,0)+'<small> USD</small>';
    const _bk=_netBuckets();
    /* ذهب البيع: مخزون 730 + 24 (محوّلاً لـ730) + سبائكك داخل الورشتين (ما زالت ملكك) */
    const _gst=document.getElementById('goldSaleTotal');
    if(_gst){
        /* ذهب الورشات داخل raw_730 (v141) + صافي ذهب ترباح (شراء − بيع) */
        let _tb=0;
        try{(window._tarbahList||[]).forEach(x=>{
            const w=parseFloat(String(x.weight||'').replace(/\s/g,'').replace(',','.'))||0;
            _tb+=(x.type==='sell'?-w:w);
        });}catch(e){}
        const _total730=_bk.raw_730 + _bk.raw_24*(1000/730) + _tb;
        _gst.textContent=fmt(_total730,2)+' غ';
        /* متوسط سعر الشراء المرجّح بالأوزان (مكافئ 730): Σ(eq730×ppg) ÷ Σ(eq730) */
        try{
            const _avgEl=document.getElementById('goldSaleAvg');
            if(_avgEl){
                let _sumWP=0,_sumW=0;
                (invoices||[]).filter(i=>i.t==='buy'&&!i.recv).forEach(inv=>{
                    (inv.items||[]).forEach(it=>{
                        const eq=+it.eq730||0, p=+it.ppg||0;
                        if(eq>0&&p>0){_sumWP+=eq*p;_sumW+=eq;}
                    });
                });
                if(_sumW>0){
                    const _avg=Math.round(_sumWP/_sumW);   /* السعر الحقيقي — بلا تقريب للوحدة */
                    _avgEl.textContent=fmt(_avg,0)+' دج/غ';
                    _avgEl.title='متوسط شراء مرجّح على '+fmt(_sumW,2)+' غ';
                }else{ _avgEl.textContent='—'; }
            }
        }catch(e){}
    }
    try{ if(typeof _updBuyAvg==='function')_updBuyAvg(); }catch(e){}
    const _nv=net();
    const _nwEl=document.getElementById('netWorth');
    _nwEl.textContent=fmt(_nv,0)+' DZD';
    _nwEl.style.color=_nv<0?'var(--rd)':'var(--g400)';
    /* تفاصيل كل وعاء بالدينار */
    const _parts=[];
    if(Math.abs(_bk.din )>0.001) _parts.push(`💵 ${fmt(_bk.din,0)} دج`);
    if(Math.abs(_bk.dol )>0.001) _parts.push(`💲 ${fmt(_bk.dol,0)} دج (${fmt(_bk.raw_dol,2)}$)`);
    if(Math.abs(_bk.g730)>0.001) _parts.push(`🏅 ${fmt(_bk.g730,0)} دج (${fmt(_bk.raw_730,3)}غ)`);
    if(Math.abs(_bk.g24 )>0.001) _parts.push(`💎 ${fmt(_bk.g24,0)} دج (${fmt(_bk.raw_24,3)}غ24)`);
    document.getElementById('netWorthDetails').textContent=_parts.length?_parts.join(' | '):'—';
    document.getElementById('goldPriceDisplay').textContent=fmt(goldPrice,0);
    try{ if(typeof _captureMonthlyAsset==='function')_captureMonthlyAsset(); }catch(e){}
}
function addOp(c,t,m,a,ex={}){
    /* no-op — الكتابة تتم عبر emitEvent() فقط */
}
function updDebt(c,m,a){
    const x=debts.find(d=>d.c===c&&d.type===m);
    if(x){x.a+=a;if(Math.abs(x.a)<0.001)debts=debts.filter(d=>d!==x)}
    else if(Math.abs(a)>0.001)debts.push({c,type:m,a});
}
function updAll(){
    upd(); updDL();                 /* لوحة الأرقام وقائمة الأسماء — خفيفة ودائماً مفيدة */
    const act=(document.querySelector('.page.active')||{}).id||'';
    if(act==='page-log') renderLog();
    else if(act==='page-archive') renderArchive();
    else if(act==='page-debts') renderDebts();
    else if(act==='page-workshops'&&typeof renderWorkshops==='function') renderWorkshops();
    else if(act==='page-customer'&&typeof renderCustomerPortal==='function') renderCustomerPortal();
    /* الصفحات غير النشطة تُرسَم عند التبديل إليها عبر switchPage — فلا داعي لرسمها هنا */
}
function updDL(){
    const names=[...new Set([...debts.map(d=>d.c),...loans.map(l=>l.c)])].filter(Boolean);
    document.getElementById('customersDatalist').innerHTML=names.map(n=>`<option value="${n}">`).join('');
}
function toast(m,t='success'){
    const el=document.getElementById('toast');
    const icon=t==='success'?'check-circle':t==='error'?'exclamation-circle':'info-circle';
    el.innerHTML=`<i class="fas fa-${icon}"></i> ${m}`;
    el.className=`toast ${t} show`;
    clearTimeout(el._t);
    el._t=setTimeout(()=>el.classList.remove('show'),2800);
}
function closeModal(id){
    const er=window._editRestore;
    if(er&&er.modalId===id){ window._editRestore=null; if(typeof _reemitSnapshot==='function')_reemitSnapshot(er.snap); toast('↩️ أُلغي التعديل واستُعيدت الفاتورة','info'); }
    document.getElementById(id).classList.remove('active');
}
/* window.resetAllData مُعرَّفة في firebase.js */


/* ═══════════ GIVE / TAKE ═══════════ */
window.toggleGTKarat=()=>{
    const m=document.getElementById('gtMetal').value;
    const l=document.getElementById('gtAmountLabel');
    const eq=document.getElementById('gtEqBox');
    const kr=document.getElementById('gtKaratRow');
    const ex=document.getElementById('gt730Extra');
    if(m==='ذهب 730'){
        l.textContent='الوزن (غ)';
        if(kr)kr.style.display='';
        eq.style.display='block';
        /* قائمة سبائك إضافية تظهر فقط عند الاستلام (قبضت) */
        if(ex)ex.style.display=(gtType==='take')?'block':'none';
        calcGTEq();
    }else{
        l.textContent='الكمية / المبلغ';
        if(kr)kr.style.display='none';
        eq.style.display='none';
        if(ex)ex.style.display='none';
    }
};
let _gt730Cnt=0;
window._addGT730Bar=(w,k,noFocus)=>{
    _gt730Cnt++; const i=_gt730Cnt;
    const box=document.getElementById('gt730Bars'); if(!box)return;
    const row=document.createElement('div'); row.id='gt730Row_'+i;
    row.style.cssText='display:flex;gap:.35rem;margin-bottom:.3rem;align-items:center';
    row.innerHTML=`
        <input type="text" inputmode="decimal" id="gt730W_${i}" placeholder="وزن إضافي (غ)" value="${w!=null?w:''}" dir="ltr" oninput="liveNum(this);window._gt730Auto();window.calcGTEq()"
            style="flex:2;padding:.4rem;border-radius:7px;border:1px solid var(--border);background:var(--card2);color:var(--t);font-family:Tajawal,sans-serif;font-size:.74rem;font-weight:800;text-align:right">
        <input type="text" inputmode="numeric" id="gt730K_${i}" placeholder="العيار" value="${k!=null?k:''}" dir="ltr" oninput="window._gt730Auto();window.calcGTEq()"
            style="flex:1;padding:.4rem;border-radius:7px;border:1px solid var(--border);background:var(--card2);color:var(--t);font-family:Tajawal,sans-serif;font-size:.74rem;font-weight:800;text-align:center">
        <button type="button" onclick="document.getElementById('gt730Row_${i}').remove();window.calcGTEq()"
            style="border:none;background:transparent;color:var(--rd);cursor:pointer;font-size:.9rem;padding:.1rem .3rem">🗑️</button>`;
    box.appendChild(row);
    if(!noFocus){const wEl=document.getElementById('gt730W_'+i); if(wEl)wEl.focus();}
};
/* أسطر تلقائية: حين يمتلئ آخر سطر (أو الحقل الرئيسي) يظهر سطر جديد — بلا سرقة التركيز */
window._gt730Auto=function(){
    try{
        if(document.getElementById('gtMetal').value!=='ذهب 730')return;
        const rows=[...document.querySelectorAll('#gt730Bars [id^="gt730Row_"]')];
        let w,k;
        if(rows.length){
            const i=rows[rows.length-1].id.replace('gt730Row_','');
            w=readNum('gt730W_'+i);
            k=parseFloat(String(document.getElementById('gt730K_'+i)?.value||'').replace(',','.'))||0;
        }else{
            w=readNum('gtAmount');
            k=parseFloat(String(document.getElementById('gtKarat')?.value||'').replace(',','.'))||0;
        }
        if(w>0&&k>0)_addGT730Bar(null,null,true);   /* سطر فارغ جديد بلا تركيز */
    }catch(e){}
};
/* يجمع كل سبائك 730 المُدخَلة: الحقل الرئيسي + الصفوف الإضافية */
function _collectGT730Bars(){
    const bars=[];
    const aw=readNum('gtAmount');
    const ak=parseFloat(String(document.getElementById('gtKarat')?.value||'').replace(',','.'))||0;
    if(aw>0)bars.push({w:aw,k:ak});
    document.querySelectorAll('#gt730Bars [id^="gt730Row_"]').forEach(row=>{
        const i=row.id.replace('gt730Row_','');
        const w=readNum('gt730W_'+i);
        const k=parseFloat(String(document.getElementById('gt730K_'+i)?.value||'').replace(',','.'))||0;
        if(w>0)bars.push({w,k});
    });
    return bars;
}
window.calcGTEq=()=>{
    if(document.getElementById('gtMetal').value!=='ذهب 730')return;
    /* عند الاستلام: اجمع كل السبائك (الرئيسي + الإضافية) */
    if(gtType==='take'){
        const bars=_collectGT730Bars();
        if(bars.length>1){
            const tw=bars.reduce((s,b)=>s+b.w,0);
            const pure=bars.reduce((s,b)=>s+b.w*b.k/1000,0);
            const eq730=bars.reduce((s,b)=>s+b.w*b.k/730,0);
            document.getElementById('gtEqBox').innerHTML=
                `${bars.length} سبيكة | الوزن الكلي: <strong>${fmt(tw,2)} غ</strong> | خالص م.24: <strong>${fmt(pure,3)} غ</strong> | مكافئ 730: <strong>${fmt(eq730,3)} غ</strong>`;
            return;
        }
    }
    const w=readNum('gtAmount');
    const k=parseFloat(document.getElementById('gtKarat')?.value)||730;
    const pure=w*k/1000;
    document.getElementById('gtEqBox').innerHTML=
        `الوزن: <strong>${fmt(w,2)} غ</strong> | عيار: <strong>${k}</strong> | خالص م.24: <strong>${fmt(pure,3)} غ</strong>`;
};
document.getElementById('gtAmount').addEventListener('input',window.calcGTEq);
window.showGTBalance=()=>{
    const c=document.getElementById('gtCustomer').value.trim();
    const m=document.getElementById('gtMetal').value;
    const box=document.getElementById('gtBalBox');
    if(!c){box.style.display='none';return}
    const b=getCustBal(c,m),unit=m==='دينار'?'دج':m==='دولار'?'USD':'غ';
    box.innerHTML=`👤 رصيد ${m}: <strong style="color:${b>=0?'var(--gr)':'var(--rd)'}">${fmt(b,2)} ${unit}</strong>`;
    box.style.display='block';
};
window.openGiveTake=(t)=>{
    window._editingRecvId=null;   /* تصفير حتمي — منع تسرّب التعديل لعملية تالية */
    gtType=(t==='give')?'give':'take';
    document.getElementById('gtTitle').textContent=(t==='give'?'🟢 تسليم (أعطيت)':'🔴 استلام (قبضت)')+' • v36';
    document.getElementById('gtSaveBtn').className=t==='give'?'bg':'br';
    document.getElementById('gtCustomer').value='';
    document.getElementById('gtAmount').value='';
    document.getElementById('gtMetal').value='دينار';
    document.getElementById('gtNote').value='';
    const kEl=document.getElementById('gtKarat');if(kEl)kEl.value='';   /* بلا اقتراح 730 */
    /* تصفير قائمة سبائك 730 الإضافية */
    _gt730Cnt=0; const gb=document.getElementById('gt730Bars'); if(gb)gb.innerHTML='';
    window.toggleGTKarat();
    document.getElementById('gtBalBox').style.display='none';
    document.getElementById('gtModal').classList.add('active');
    setTimeout(()=>document.getElementById('gtCustomer').focus(),350);
};
window.saveGT=()=>{
    const c=document.getElementById('gtCustomer').value.trim();
    const m=document.getElementById('gtMetal').value;
    const a=readNum('gtAmount');
    const k=m==='ذهب 730'?(parseFloat(document.getElementById('gtKarat')?.value)||730):730;
    const isG730=m==='ذهب 730',isG24=m==='ذهب 24';
    /* استلام ذهب 730: قد يكون عدّة سبائك */
    let gt730Bars=null;
    if(isG730&&gtType==='take'){
        gt730Bars=_collectGT730Bars();
        if(!c||!gt730Bars.length)return toast('أدخل الاسم ووزن سبيكة واحدة على الأقل','error');
        /* حارس العيار: لا يُسجَّل وزن بلا عيار (بعد حذف اقتراح 730) */
        const _noK=gt730Bars.find(b=>!b.k||b.k<100||b.k>1000);
        if(_noK)return toast(`⚠️ أدخل عيار السبيكة ${fmt(_noK.w,2)} غ (بين 100 و1000)`,'error');
    }else{
        if(!c||isNaN(a)||a<=0)return toast('تأكد من البيانات','error');
    }
    const totW = gt730Bars?gt730Bars.reduce((s,b)=>s+b.w,0):a;
    const uniformK = gt730Bars?(gt730Bars.every(b=>b.k===gt730Bars[0].k)?gt730Bars[0].k:0):k;
    const finalAmount = gt730Bars
        ? gt730Bars.reduce((s,b)=>s+b.w*b.k/730,0)
        : (isG730?(a*k)/730:a);
    const note=document.getElementById('gtNote').value.trim();
    const dt=new Date().toLocaleDateString('fr-FR');
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});

    let barsAdd=[],barsRemove=[],barUpdates=[];
    let _v24Out=0; window._out24Tmp=0;
    if(gtType==='give'){
        /* الحارس يشمل الافتراضي: الفيزيائي + vg24 (للـ24) */
        const avail = isG24 ? ((g24.reduce((s,b)=>s+(b.w||0),0))+(B.vg24||0)) : (B[m]||0);
        if(avail<finalAmount-0.001)return toast('⚠️ رصيد غير كافٍ','error');
        if(isG730){
            /* تسليم 730: لا يُعامل المخزون كسائل — يجب أن يطابق الوزن سبيكة/سبائك موجودة كاملة */
            const _k730=parseFloat(document.getElementById('gtKarat')?.value)||730;
            /* جِد سبيكة موجودة تطابق الوزن (±0.05غ) والعيار (±1) */
            let _match=g730.find(b=>Math.abs(b.w-a)<0.05 && Math.abs((b.k||730)-_k730)<1.5);
            if(!_match){
                /* حاول تجميع سبائك كاملة تطابق الوزن المطلوب تماماً */
                const _byK=g730.filter(b=>Math.abs((b.k||730)-_k730)<1.5).sort((x,y)=>y.w-x.w);
                let _sum=0,_ids=[],_ok=false;
                for(const b of _byK){ if(_sum+b.w<=a+0.05){_sum+=b.w;_ids.push(b.id);} if(Math.abs(_sum-a)<0.05){_ok=true;break;} }
                if(_ok){ barsRemove=_ids; }
                else{
                    return toast('⚠️ لا توجد سبيكة عيار '+fmt(_k730,0)+' بوزن '+fmt(a,2)+' غ في المخزون. تسليم 730 يجب أن يطابق سبيكة موجودة كاملة (لا يُقتطع من المخزون).','error');
                }
            }else{
                barsRemove=[_match.id];   /* السبيكة الكاملة تخرج */
            }
        }else if(isG24){
            const r=_pickBarsToRemove('24',a);
            barsRemove=r.barsRemove;barUpdates=r.barUpdates;
            window._out24Tmp=r.out24||0;   /* النمط السائل */
            _v24Out=r.shortfall||0;   /* ما لم تغطّه السبائك ← يُخصم من vg24 */
        }
    }else{
        if(isG730){ gt730Bars.forEach(b=>{ barsAdd.push({id:uid(),pool:'730',w:b.w,k:b.k}); }); }
        else if(isG24){const bid=uid();barsAdd.push({id:bid,pool:'24',w:a,k:1000});}
    }
    const dispBars={};
    barsAdd.forEach(b=>{
        dispBars[b.id]={
            desc:gtType==='take'?`استلام من ${c} (عيار ${b.k})`:`تسليم لـ ${c}`,
            dt,src:gtType==='take'?'استلام':'تسليم'
        };
    });
    /* قبض سبائك 730 ← فاتورة وصل في الأرشيف (نفس الحدث — حذفه يسقطها) */
    let _recvInv;
    if(gtType==='take'&&isG730&&gt730Bars.length){
        _recvInv={id:'INV-'+uid(),c,t:'buy',recv:true,ps:'full',dt,
            items:gt730Bars.map(b=>({w:b.w,k:b.k,is1000:false,price:0,total:0})),
            tp:0,akhd:0,prevBal:getCustBal(c,'دينار')};
    }
    /* تعديل وصل قبض: ألغِ الوصل القديم قبل بثّ الجديد */
    if(window._editingRecvId){
        try{ _voidByInvId('invoice',window._editingRecvId); }catch(e){}
        window._editingRecvId=null;
    }
    emitEvent('GT',
        {gtType,c,m,finalAmount,...(isG730?{realW:totW,realK:(uniformK||730)}:{}),...(_v24Out>0?{v24Out:_v24Out}:{}),...((window._out24Tmp||0)>0?{out24:window._out24Tmp}:{}),note,barsAdd,barsRemove,barUpdates},
        {
            invoice:_recvInv,
            bars:Object.keys(dispBars).length?dispBars:undefined,
            op:{c,t:gtType==='give'?'أعطيت':'استلمت',m,a:finalAmount,
                _ts:Date.now(),dt:nowStr,
                ...(_recvInv?{iid:_recvInv.id}:{}),   /* رابط الوصل — ليفتحه الزبون من سجله */
                ...(isG730?{realW:totW,realK:(uniformK||'متعدد'),note}:{note}),
                ...(gtType==='take'&&isG730&&gt730Bars.length?{barsList:gt730Bars.map(b=>({w:b.w,k:b.k}))}:{})}
        }
    );
    document.getElementById('gtCustomer').value='';
    document.getElementById('gtAmount').value='';
    document.getElementById('gtNote').value='';
    const gb=document.getElementById('gt730Bars'); if(gb)gb.innerHTML=''; _gt730Cnt=0;
    document.getElementById('gtBalBox').style.display='none';
    closeModal('gtModal');
    if(typeof _sendCustomerPush==='function'){
        const _unit=m==='دينار'?'دج':(m==='دولار'?'$':'غ');
        const _act=gtType==='give'?'أعطيناك':'استلمنا منك';
        _sendCustomerPush(c,'حركة على حسابك',`${_act} ${fmt(finalAmount,2)} ${_unit} — افتح حسابك للاطلاع`);
    }
    toast(gt730Bars&&gt730Bars.length>1?`✅ تم استلام ${gt730Bars.length} سبيكة`:'✅ تم الحفظ بنجاح');
};

/* ═══════════ DOLLAR ═══════════ */
/* ── حالة خالص/غير خالص للدولار ── */
let _dollPaid=true; /* افتراضي: خالص */
window.setDollPaid=(v)=>{
    _dollPaid=v;
    const isBuy=document.getElementById('dollarTitle').textContent.includes('شراء');
    document.getElementById('dollPaidBtn').style.background   =v?'var(--gr)':'transparent';
    document.getElementById('dollPaidBtn').style.color        =v?'#fff':'var(--t2)';
    document.getElementById('dollPaidBtn').style.borderColor  =v?'var(--gr)':'var(--border)';
    document.getElementById('dollUnpaidBtn').style.background =v?'transparent':'var(--rd)';
    document.getElementById('dollUnpaidBtn').style.color      =v?'var(--t2)':'#fff';
    document.getElementById('dollUnpaidBtn').style.borderColor=v?'var(--border)':'var(--rd)';
    const info=document.getElementById('dollPaidInfo');
    if(v){
        info.style.display='none';
    } else {
        if(isBuy){
            info.textContent='📋 غير خالص: الدولار يضاف لمخزونك والدينار يُسجَّل دَيناً على الزبون';
        } else {
            info.textContent='📋 غير خالص: الدينار يضاف لمخزونك والدولار يُسجَّل دَيناً على الزبون';
        }
        info.style.display='block';
    }
};
function _updDollarEq(){
    document.getElementById('dinarEq').textContent='= '+fmt(readNum('dollarAmount')*readNum('dollarRate')/100,2)+' DZD';
}
window.showDollarBalance=()=>{
    const c=document.getElementById('dollarCustomer').value.trim(),box=document.getElementById('dollarBalBox');
    if(!c){box.style.display='none';return}
    const bd=getCustBal(c,'دينار');
    const bu=getCustBal(c,'دولار');
    let html=`👤 `;
    if(Math.abs(bd)>0.001) html+=`دينار: <strong style="color:${bd>=0?'var(--gr)':'var(--rd)'}">${fmt(bd,0)} دج</strong>  `;
    if(Math.abs(bu)>0.001) html+=`دولار: <strong style="color:${bu>=0?'var(--gr)':'var(--rd)'}">${fmt(bu,2)} $</strong>`;
    if(Math.abs(bd)<0.001&&Math.abs(bu)<0.001) html+='لا يوجد رصيد سابق';
    box.innerHTML=html;
    box.style.display='block';
};
window.openDollar=(t)=>{
    document.getElementById('dollarTitle').textContent=t==='buy'?'💲 شراء دولار':'💲 بيع دولار';
    document.getElementById('dollarCustomer').value='';
    document.getElementById('dollarAmount').value='';
    document.getElementById('dollarRate').value=dollarRate;
    document.getElementById('dollarParty').value='';
    document.getElementById('dollarParty').placeholder=t==='buy'?'👤 من أخذه (اختياري)':'👤 المسلم — من أعطاك الدولار (اختياري)';
    document.getElementById('dollarBalBox').style.display='none';
    document.getElementById('dinarEq').textContent='= 0 DZD';
    document.getElementById('dollPaidInfo').style.display='none';
    _dollPaid=true; /* إعادة ضبط لخالص */
    setDollPaid(true);
    document.getElementById('dollarModal').classList.add('active');
    setTimeout(()=>document.getElementById('dollarCustomer').focus(),350);
};
window.saveDollar=()=>{
    const c=document.getElementById('dollarCustomer').value.trim();
    const a=readNum('dollarAmount');
    const r=readNum('dollarRate')||dollarRate;
    const party=document.getElementById('dollarParty').value.trim();
    if(!c||isNaN(a)||a<=0)return toast('تأكد من البيانات','error');
    const isBuy=document.getElementById('dollarTitle').textContent.includes('شراء');
    const paid=_dollPaid;
    const dinarVal=a*r/100;
    if(isBuy&&paid&&B.دينار<dinarVal-0.001)return toast('⚠️ رصيد الدينار غير كافٍ','error');
    if(!isBuy&&B.دولار<a-0.001&&!party)return toast('⚠️ رصيد الدولار غير كافٍ','error');
    dollarRate=r;save();
    const did='DOLL-'+uid();
    const dt=new Date().toLocaleDateString('fr-FR');
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const _di={id:did,c,party,isBuy,paid,a,r,dinar:dinarVal,dt};
    emitEvent('DOLLAR',
        {c,isBuy,paid,a,r,dinarVal,party},
        {dollInvoice:_di,op:{c,t:isBuy?'شراء دولار':'بيع دولار',m:'دولار',a,_ts:Date.now(),dt:nowStr,dr:r,party,paid,did}}
    );
    window._editRestore=null;
    document.getElementById('dollarCustomer').value='';
    document.getElementById('dollarAmount').value='';
    document.getElementById('dollarParty').value='';
    document.getElementById('dollarBalBox').style.display='none';
    closeModal('dollarModal');
    if(typeof _sendCustomerPush==='function'&&c)_sendCustomerPush(c,'عملية دولار','سُجّلت لك عملية '+(isBuy?'شراء':'بيع')+' دولار — افتح حسابك للاطلاع');
    toast(paid?'✅ تمت عملية الدولار (خالص)':'📋 تمت عملية الدولار (غير خالص — أُضيفت للديون)');
};
document.getElementById('dollarAmount').addEventListener('input',_updDollarEq);
document.getElementById('dollarRate').addEventListener('input',_updDollarEq);


/* ═══════════ تعديل الفواتير (دولار/دبي/رافيناج) — إبطال ثم فتح معبّأ، مع استرجاع عند الإلغاء ═══════════ */
window._editRestore=null;
window._flushPendingEdit=()=>{
    const er=window._editRestore; if(!er)return;
    window._editRestore=null;window._rafEditMeta=null;window._rafEditWs=null;
    if(typeof _reemitSnapshot==='function')_reemitSnapshot(er.snap);
    if(er.page==='raffinage'&&typeof resetRafForm==='function')resetRafForm();
    if(typeof _hideRafEditBanner==='function')_hideRafEditBanner();
};
window.editDoll=(id)=>{
    _flushPendingEdit();
    const d=dollInvoices.find(x=>x.id===id); if(!d)return;
    if(!confirm('تعديل عملية الدولار؟ ستُحذف القديمة وتُفتح للتعديل، ثم احفظ.'))return;
    const snap=_invSnapshot('dollInvoice',id); if(!snap){toast('تعذّر التعديل','error');return;}
    _voidByInvId('dollInvoice',id);
    openDollar(d.isBuy?'buy':'sell');
    document.getElementById('dollarCustomer').value=d.c||'';
    document.getElementById('dollarAmount').value=d.a!=null?d.a:'';
    document.getElementById('dollarRate').value=d.r!=null?d.r:dollarRate;
    document.getElementById('dollarParty').value=d.party||'';
    if(typeof setDollPaid==='function')setDollPaid(d.paid!==false);
    if(typeof _updDollarEq==='function')_updDollarEq();
    window._editRestore={modalId:'dollarModal',snap};
    toast('✏️ عدّل ثم احفظ','info');
};
window.editDubInv=(id)=>{
    _flushPendingEdit();
    const d=dubaiInvoices.find(x=>x.id===id); if(!d)return;
    if(!confirm('تعديل عملية دبي؟ ستُحذف القديمة وتُفتح للتعديل، ثم احفظ.'))return;
    const snap=_invSnapshot('dubaiInvoice',id); if(!snap){toast('تعذّر التعديل','error');return;}
    _voidByInvId('dubaiInvoice',id);
    openDubai();
    document.getElementById('dubaiOffice').value=d.c||'';
    document.getElementById('dubaiWeight').value=d.w!=null?d.w:'';
    document.getElementById('dubaiPrice').value=d.sp!=null?d.sp:'';
    document.getElementById('dubaiDisc').value=d.disc!=null?d.disc:'0';
    try{document.getElementById('dubaiWeight').dispatchEvent(new Event('input'));}catch(e){}
    window._editRestore={modalId:'dubaiModal',snap};
    toast('✏️ عدّل ثم احفظ','info');
};
window.editRafInv=(id)=>{
    _flushPendingEdit();
    const r=rafInvoices.find(x=>x.id===id); if(!r)return;
    if(typeof _invBarsConsumedF==='function' && _invBarsConsumedF('rafInvoice',id)){
        toast('🚫 لا يمكن تعديل رافيناج خرج اللانقو المستلَم منه من الكوفر حتى لا تتلخبط الحسابات','error');
        return;
    }
    if(!confirm('تعديل عملية الرافيناج؟ ستُحذف القديمة وتُفتح للتعديل، ثم احفظ.'))return;
    const snap=_invSnapshot('rafInvoice',id); if(!snap){toast('تعذّر التعديل','error');return;}
    /* أين تعيش سبائك هذه الفاتورة؟ مفقودة (بيعت/استُهلكت) ← منع التعديل */
    {
        const prod=[...(snap.data.barsAdd730||[]),...(snap.data.barsAdd24||[])].map(b=>b.id);
        if(prod.length){
            const in730=new Set(g730.map(b=>b.id)), in24=new Set(g24.map(b=>b.id));
            const wsOf={}; Object.keys(wsBars||{}).forEach(w=>(wsBars[w]||[]).forEach(b=>wsOf[b.id]=w));
            const missing=prod.filter(bid=>!in730.has(bid)&&!in24.has(bid)&&!wsOf[bid]);
            if(missing.length){
                toast('🚫 لا يمكن التعديل: سبيكة من هذه الفاتورة استُهلكت (بيع/جلسة ورشة/…) — احذف العملية المستهلِكة أولاً','error');
                return;
            }
            const wsHit=prod.map(bid=>wsOf[bid]).find(Boolean);
            if(wsHit)toast('ℹ️ سبيكة هذه الفاتورة في '+(WS_LIST[wsHit]||'الورشة')+' — ستُعدَّل هناك في مكانها','info');
        }
    }
    if(r.mode==='customer'){
        /* ═ نموذج rafinag: لا إلغاء — الحفظ يبثّ RAF_EDIT يحدّث نفس السبيكة والفاتورة ═ */
        window._editRestore=null;
        window._rafEditMeta={reason:null,rid:id,origSettled:!!r.settled,
            origPrevD:r.prevD||0,origPrevG:r.prevG||0,
            orig:{sentW:r.sentW||0,eq24:r.eq24||0,fee:r.fee||0,dt:r.dt||''},
            barIds:(snap.data.barsAdd730||[]).map(b=>b.id)};
    }else{
        /* ═ فرع عثمان أيضاً على نموذج rafinag: بلا إلغاء — RAF_EDIT يسوّي الفروقات ═ */
        window._editRestore=null;
        window._rafEditMeta={reason:null,rid:id,refiner:true,
            origPrevD:r.prevD||0,origPrevG:r.prevG||0,
            origSawared:r.sawared||0,origLanqo:r.lanqo||0,
            origRows:(r.rows||[]).map(x=>({w:x.w,k:x.k})),
            orig:{sentW:r.sentW||0,eq24:r.eq24||0,fee:r.fee||0,feeRate:r.feeRate||0,dt:r.dt||''}};
    }
    switchPage('raffinage');
    document.getElementById('rafCustomer').value=r.c||'';
    const rows=r.rows||[];
    if(typeof rafRows!=='undefined'){ rafRows=Math.max(rafRows||5,rows.length); }
    if(typeof initRafTable==='function')initRafTable();
    while(rows.length>rafRows)addRafRow(true);
    rows.forEach((row,idx)=>{
        const i=idx+1;
        const we=document.getElementById('rafW_'+i), ke=document.getElementById('rafK_'+i);
        if(we)we.value=row.w!=null?row.w:'';
        if(ke)ke.value=row.k!=null?row.k:'';
    });
    const setV=(id,v)=>{const el=document.getElementById(id);if(el)el.value=(v!=null?v:'0');};
    setV('rafFee',r.feeRate); setV('rafSawared',r.sawared); setV('rafLanqo',r.lanqo);
    /* استعادة وضع الفاتورة (مصفّي/زبون) حتى تُعاد الكتابة بالفرع الصحيح */
    if(typeof setRafMode==='function'){
        if(r.mode==='customer'){ setRafMode('customer'); if(typeof setRafSettled==='function')setRafSettled(r.settled!==false); }
        else setRafMode('refiner');
    }
    if(typeof calcRaf==='function')calcRaf();

    _showRafEditBanner();
    toast('✏️ عدّل ثم احفظ','info');
};
function _showRafEditBanner(){
    let b=document.getElementById('rafEditBanner');
    if(!b){
        b=document.createElement('div');
        b.id='rafEditBanner';
        b.style.cssText='position:fixed;top:8px;left:50%;transform:translateX(-50%);z-index:9999;background:#c2410c;color:#fff;border-radius:10px;padding:.45rem .8rem;display:flex;align-items:center;gap:.7rem;box-shadow:0 4px 16px rgba(194,65,12,.4);font-family:Tajawal,sans-serif;font-size:.82rem';
        document.body.appendChild(b);
    }
    b.innerHTML=`✏️ وضع تعديل الرافيناج <button onclick="cancelRafEdit()" style="background:rgba(255,255,255,.25);border:none;color:#fff;border-radius:6px;padding:.2rem .65rem;font-weight:800;cursor:pointer;font-family:inherit">إلغاء</button>`;
    b.style.display='flex';
}
window._hideRafEditBanner=()=>{ const b=document.getElementById('rafEditBanner'); if(b)b.style.display='none'; };
window.cancelRafEdit=()=>{ _flushPendingEdit(); if(typeof resetRafForm==='function')resetRafForm(); toast('↩️ أُلغي التعديل واستُعيدت الفاتورة','info'); };

/* ═══════════ SHIPPING ═══════════ */
window.openShipping=()=>{
    document.getElementById('shipWeight').value='';document.getElementById('shipOffice').value='';
    const _su=document.getElementById('shipUsdRate'); if(_su)_su.value=localStorage.getItem('gp12_shiprate')||'';
    document.getElementById('shipModal').classList.add('active');
    setTimeout(()=>document.getElementById('shipWeight').focus(),350);
};
window.saveShip=()=>{
    const w=parseFloat(document.getElementById('shipWeight').value);
    const o=document.getElementById('shipOffice').value.trim();
    if(isNaN(w)||w<=0||!o)return toast('تأكد من البيانات','error');
    if(B['ذهب 24']<w-0.001)return toast('⚠️ مخزون سبائك 24 غير كافٍ','error');
    const rc=Math.round(w*999/1000*100)/100;
    const {barsRemove,barUpdates,out24}=_pickBarsToRemove('24',w);
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const su=readNum('shipUsdRate')||0;   /* سعر الشحن $/غ — مرجع حساب غرام دبي */
    if(su>0)try{localStorage.setItem('gp12_shiprate',String(su).replace('.',','));}catch(e){}
    emitEvent('SHIP',
        {o,w,rc,su,barsRemove,barUpdates,...(out24>0?{out24}:{})},
        {op:{c:o,t:'شحن',m:'ذهب 24',a:w,_ts:Date.now(),dt:nowStr,su,rc}}
    );
    closeModal('shipModal');
    toast('🚢 تم إرسال الشحنة');
    printShipPDF({office:o,weight:w,received:rc,price:p});
};

function printShipPDF({office,weight,received,price}){
    const now=new Date();
    const dateStr=now.toLocaleDateString('ar-DZ',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
    const timeStr=now.toLocaleTimeString('ar-DZ',{hour:'2-digit',minute:'2-digit'});
    const user=document.getElementById('currentUserDisplay').textContent||'—';
    const totalUSD=price>0?(received*price).toFixed(2):null;
    const invoiceNum='SH-'+Date.now().toString().slice(-6);

    const html=`<!doctype html>
<html dir="rtl" lang="ar">
<head>
<meta charset="utf-8">
<title>فاتورة شحن ${invoiceNum}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#111;padding:2cm;font-size:14px}
.logo{text-align:center;margin-bottom:1.5rem}
.logo h1{font-size:2rem;color:#b8860b;letter-spacing:1px}
.logo p{color:#666;font-size:.9rem}
.title{text-align:center;font-size:1.4rem;font-weight:700;color:#b8860b;margin:1rem 0;
       border-top:2px solid #b8860b;border-bottom:2px solid #b8860b;padding:.5rem}
.meta{display:flex;justify-content:space-between;margin-bottom:1.5rem;color:#555;font-size:.85rem}
table{width:100%;border-collapse:collapse;margin:1rem 0}
th{background:#b8860b;color:#fff;padding:.6rem 1rem;text-align:right;font-size:.95rem}
td{padding:.6rem 1rem;border-bottom:1px solid #e5e0d0;font-size:.95rem}
tr:last-child td{border-bottom:none}
.total-row td{font-weight:700;font-size:1.1rem;color:#b8860b;border-top:2px solid #b8860b}
.footer{margin-top:2rem;text-align:center;color:#999;font-size:.8rem;border-top:1px solid #ddd;padding-top:1rem}
.sign{margin-top:3rem;display:flex;justify-content:space-between}
.sign div{text-align:center;width:40%}
.sign div p:first-child{border-top:1px solid #aaa;padding-top:.3rem;color:#555;font-size:.85rem}
@media print{body{padding:1cm}.no-print{display:none}}
</style>
</head>
<body>
<div class="logo">
    <h1>🥇 GoldPro</h1>
    <p>نظام إدارة الذهب</p>
</div>
<div class="title">🚢 فاتورة شحن</div>
<div class="meta">
    <span>رقم الفاتورة: <strong>${invoiceNum}</strong></span>
    <span>${dateStr} — ${timeStr}</span>
    <span>المستخدم: <strong>${user}</strong></span>
</div>
<table>
    <thead><tr><th>البيان</th><th>القيمة</th></tr></thead>
    <tbody>
        <tr><td>المكتب / الجهة المستلِمة</td><td><strong>${office}</strong></td></tr>
        <tr><td>الوزن المُرسَل</td><td><strong>${weight.toFixed(3)} غ</strong> (ذهب 24)</td></tr>
        <tr><td>الوزن المستلَم (بعد خصم 0.1٪)</td><td><strong>${received.toFixed(3)} غ</strong></td></tr>
        ${price>0?`<tr><td>سعر الغرام</td><td>${price} $/غ</td></tr>`:''}
        ${totalUSD?`<tr class="total-row"><td>القيمة الإجمالية</td><td>${totalUSD} $</td></tr>`:''}
    </tbody>
</table>
<div class="sign">
    <div><p>توقيع المُرسِل</p><br><br></div>
    <div><p>توقيع المُستلِم</p><br><br></div>
</div>
<div class="footer">GoldPro — وثيقة رسمية للشحن | ${dateStr}</div>
<script>window.onload=()=>{window.print();}<\/script>
</body></html>`;

    const w2=window.open('','_blank','width=800,height=700');
    if(w2){w2.document.write(html);w2.document.close();}
    else toast('فعّل النوافذ المنبثقة لطباعة الفاتورة','error');
}

/* ═══════════ EXPENSE ═══════════ */
window.toggleExpCur=()=>{
    const isDzd=document.querySelector('input[name="expCur"]:checked').value==='دينار';
    document.getElementById('expLblDzd').style.background=isDzd?'var(--gold)':'var(--card2)';
    document.getElementById('expLblDzd').style.color=isDzd?'#fff':'var(--t)';
    document.getElementById('expLblUsd').style.background=isDzd?'var(--card2)':'var(--gold)';
    document.getElementById('expLblUsd').style.color=isDzd?'var(--t)':'#fff';
    document.getElementById('expCustomerWrap').style.display=isDzd?'none':'block';
    document.getElementById('expAmount').placeholder=isDzd?'💰 القيمة (دج)':'💰 القيمة ($)';
    if(!isDzd)setTimeout(()=>document.getElementById('expCustomer').focus(),100);
};
window.openExpense=()=>{
    document.getElementById('expAmount').value='';
    document.getElementById('expNote').value='';
    document.getElementById('expCustomer').value='';
    /* إعادة ضبط على دينار */
    document.querySelector('input[name="expCur"][value="دينار"]').checked=true;
    document.getElementById('expLblDzd').style.background='var(--gold)';
    document.getElementById('expLblDzd').style.color='#fff';
    document.getElementById('expLblUsd').style.background='var(--card2)';
    document.getElementById('expLblUsd').style.color='var(--t)';
    document.getElementById('expCustomerWrap').style.display='none';
    document.getElementById('expAmount').placeholder='💰 القيمة (دج)';
    document.getElementById('expModal').classList.add('active');
    setTimeout(()=>document.getElementById('expAmount').focus(),350);
};
window.saveExp=()=>{
    const a=readNum('expAmount');
    const n=document.getElementById('expNote').value.trim();
    const cur=document.querySelector('input[name="expCur"]:checked').value;
    if(!a||a<=0)return toast('حدد قيمة المصروف','error');
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    if(cur==='دولار'){
        const cust=document.getElementById('expCustomer').value.trim();
        if(!cust)return toast('أدخل اسم الزبون للمصاريف بالدولار','error');
        emitEvent('EXPENSE',{cur,a,n,cust},{op:{c:cust,t:'مصاريف',m:'دولار',a,_ts:Date.now(),dt:nowStr,note:n}});
        closeModal('expModal');
        toast(`💸 مصاريف ${a.toLocaleString('fr-FR')}$ — مسجّلة لصالح ${cust} (علينا له)`);
    }else{
        if(B.دينار<a-0.001)return toast('⚠️ السيولة غير كافية','error');
        emitEvent('EXPENSE',{cur,a,n},{op:{c:n||'مصاريف',t:'مصاريف',m:'دينار',a,_ts:Date.now(),dt:nowStr}});
        closeModal('expModal');toast('💸 تم خصم المصروف');
    }
};

/* ═══════════ DUBAI ═══════════ */
window.openDubai=()=>{
    document.getElementById('dubaiOffice').value='';document.getElementById('dubaiWeight').value='';
    /* تعبئة سعر الشاشة اللحظي تلقائياً */
    document.getElementById('dubaiPrice').value=liveSpotPrice>0?liveSpotPrice:'';
    document.getElementById('dubaiDisc').value='0';
    document.getElementById('dubaiTotal').textContent='💰 0 USD';
    document.getElementById('dubaiModal').classList.add('active');
    setTimeout(()=>document.getElementById('dubaiOffice').focus(),350);
};
const _modalFields={
    dubaiFields:['dubaiOffice','dubaiWeight','dubaiPrice','dubaiDisc'],
    dollarFields:['dollarCustomer','dollarAmount','dollarRate','dollarParty'],
    shipFields:['shipWeight','shipUsdRate','shipOffice'],
};
const _modalSave={
    dubaiFields:()=>saveDubai(),
    dollarFields:()=>saveDollar(),
    shipFields:()=>saveShip(),
};
window.modalNav=(e,group,idx)=>{
    const fields=_modalFields[group];
    if(e.key==='ArrowDown'||e.key==='Enter'){
        e.preventDefault();
        if(idx<fields.length-1)document.getElementById(fields[idx+1]).focus();
        else _modalSave[group]();
    }else if(e.key==='ArrowUp'){
        e.preventDefault();
        if(idx>0)document.getElementById(fields[idx-1]).focus();
    }
};
/* alias للتوافق مع dubaiNav القديم */
window.dubaiNav=(e,idx)=>modalNav(e,'dubaiFields',idx);
/* ══ حاسبة سعر البيع في دبي ══ */
/* مفتاح خاص بحاسبة دبي — خارج نطاق gp12_ حتى لا يُمسح عند إعادة الضبط */
const _dcKey=()=>'dc_calc_vals_'+(typeof _SITE!=='undefined'&&_SITE?_SITE+'_':'')+(_currentUser||'_');
window._dubaiCalcVals=null;
window._loadDubaiCalc=()=>{ try{ window._dubaiCalcVals=JSON.parse(localStorage.getItem(_dcKey())||'null'); }catch(e){ window._dubaiCalcVals=null; } if(window._dubaiCalcVals&&typeof _applyDubaiCalcSettings==='function')_applyDubaiCalcSettings(window._dubaiCalcVals); };
function _saveDubaiCalcInputs(){
    const vals={
        disc    :document.getElementById('dcDisc').value,
        ship    :document.getElementById('dcShip').value,
        dollar  :document.getElementById('dcDollar').value,
        expenses:document.getElementById('dcExpenses').value
    };
    try{localStorage.setItem(_dcKey(),JSON.stringify(vals));}catch(e){}
    window._dubaiCalcVals=vals;
    /* مزامنة عبر الأجهزة: تُحفظ ضمن إعدادات Firebase */
    if(typeof _scheduleSave==='function')_scheduleSave();
}
/* تطبيق إعدادات دبي الواردة من جهاز آخر */
window._applyDubaiCalcSettings=(vals)=>{
    if(!vals||typeof vals!=='object')return;
    try{localStorage.setItem(_dcKey(),JSON.stringify(vals));}catch(e){}
    window._dubaiCalcVals=vals;
    const set=(id,v)=>{const e=document.getElementById(id); if(e&&v!==undefined&&document.activeElement!==e)e.value=v;};
    set('dcDisc',vals.disc); set('dcShip',vals.ship); set('dcDollar',vals.dollar); set('dcExpenses',vals.expenses);
    if(typeof _refreshDubaiSell==='function')_refreshDubaiSell();
    const m=document.getElementById('dubaiCalcModal');
    if(m&&m.classList.contains('active')&&typeof calcDubaiSell==='function')calcDubaiSell();
};

/* ═══════════ تصوير السبائك → Google Vision OCR → تعبئة الفاتورة ═══════════ */
const _VISION_KEY='gp_vision_key';
function _getVisionKey(){
    const s=(typeof window!=='undefined'&&window._sharedVisionKey)||'';
    if(s)return s;
    try{return localStorage.getItem(_VISION_KEY)||'';}catch(e){return '';}
}
window.saveVisionKey=()=>{
    const v=(document.getElementById('visionKeyInput').value||'').trim();
    try{localStorage.setItem(_VISION_KEY,v);}catch(e){}
    if(typeof _saveSharedVisionKey==='function'){
        _saveSharedVisionKey(v)
            .then(()=>toast(v?'✅ حُفظ المفتاح لكل المستخدمين':'تم مسح المفتاح','success'))
            .catch(()=>toast('✅ حُفظ بجهازك (تعذّر الحفظ المشترك — تأكّد من القواعد)','info'));
    }else{
        toast(v?'✅ حُفظ المفتاح':'تم مسح المفتاح','info');
    }
};
window.onRafPhotoScan=(e)=>{
    const files=e.target.files;
    if(!files||!files.length)return;
    /* أبقِ الإرفاق كما هو (شريط صور الفاتورة) */
    try{if(typeof rafAddPhotos==='function')rafAddPhotos(files);}catch(_){}
    /* ثم اقرأ الأولى بالذكاء واملأ السطور (كفاتورة الشراء) */
    window._visionTarget='raf';
    onBarPhoto({target:{files:[files[0]],value:''}});
    e.target.value='';
};
window.onBarPhoto=(e)=>{
    const file=e.target.files&&e.target.files[0]; if(!file)return; e.target.value='';
    const key=_getVisionKey();
    if(!key){ toast('⚠️ أدخل مفتاح Google Vision في الإعدادات أولاً','error'); return; }
    toast('📷 جاري قراءة الصورة...','info');
    const fr=new FileReader();
    fr.onload=async ev=>{
        const b64=String(ev.target.result).split(',')[1];
        let res,raw;
        try{
            res=await fetch('https://vision.googleapis.com/v1/images:annotate?key='+encodeURIComponent(key),{
                method:'POST',headers:{'Content-Type':'application/json'},
                body:JSON.stringify({requests:[{image:{content:b64},features:[{type:'DOCUMENT_TEXT_DETECTION'}]}]})
            });
        }catch(err){ alert('🚫 تعذّر الاتصال بـ Vision (شبكة أو منع):\n'+((err&&err.message)||err)); return; }
        try{ raw=await res.text(); }catch(_){ raw=''; }
        let data={}; try{ data=JSON.parse(raw); }catch(_){}
        const errMsg=(data.error&&data.error.message)||(data.responses&&data.responses[0]&&data.responses[0].error&&data.responses[0].error.message);
        if(!res.ok||errMsg){ alert('🚫 خطأ Vision (HTTP '+res.status+'):\n'+(errMsg||raw||'بلا تفاصيل')); return; }
        const fta=(data.responses&&data.responses[0]&&data.responses[0].fullTextAnnotation)||null;
        const text=(fta&&fta.text)||'';
        if(!text){ alert('Vision لم يُرجِع أي نص — جرّب صورة أوضح وأقرب.'); return; }
        let bars=fta?_parseBarsFromBlocks(fta):[];
        if(!bars.length)bars=_parseBars(text);
        if(!bars.length){ alert('قرأ Vision النصّ التالي لكن لم أجد أزواج عيار/وزن:\n\n'+text); return; }
        _showBarsReview(bars);
    };
    fr.readAsDataURL(file);
};
/* ═ محلل الكتل المكانية: كل ملصق سبيكة = كتلة Vision مستقلة ═
   يعزل زوج (عيار/وزن) داخل كتلته — فلا يقترن عيار ملصق بوزن جاره؛
   ويجرّد التواريخ والساعات (21-06-2026 يتفكك لأرقام خادعة) ويستأنس بلاحقة g للوزن. */
function _pairFromBlockText(t){
    let s=String(t)
        .replace(/\b\d{1,2}\s*[-\/.]\s*\d{1,2}\s*[-\/.]\s*\d{2,4}\b/g,' ')
        .replace(/\b\d{4}\s*[-\/.]\s*\d{1,2}\s*[-\/.]\s*\d{1,2}\b/g,' ')
        .replace(/\b\d{1,2}\s*:\s*\d{2}(?::\d{2})?\b/g,' ');
    const isK=v=>v>=500&&v<1000, isW=v=>v>0.3&&v<500;
    /* الأوزان الموسومة بـ g أولوية قاطعة */
    const gW=[...s.matchAll(/(\d+(?:[.,]\d+)?)\s*g\b/gi)].map(m=>parseFloat(m[1].replace(',','.'))).filter(isW);
    s=s.replace(/(\d+(?:[.,]\d+)?)\s*g\b/gi,' ');
    const nums=[...s.matchAll(/\d+(?:[.,]\d+)?/g)].map(m=>parseFloat(m[0].replace(',','.')));
    const ks=nums.filter(isK), ws=nums.filter(isW);
    let k=null,w=null;
    if(ks.length===1)k=ks[0];
    if(gW.length===1)w=gW[0];
    else if(gW.length===0&&ws.length===1)w=ws[0];
    if(k!=null&&w!=null)return{w:parseFloat(w.toFixed(2)),k:parseFloat(k.toFixed(1))};
    return null;
}
function _parseBarsFromBlocks(fta){
    const out=[];
    try{
        (fta.pages||[]).forEach(pg=>(pg.blocks||[]).forEach(bl=>{
            let txt='';
            (bl.paragraphs||[]).forEach(pa=>(pa.words||[]).forEach(wd=>{
                txt+=(wd.symbols||[]).map(sy=>sy.text).join('')+' ';
            }));
            const p=_pairFromBlockText(txt);
            if(p)out.push(p);
        }));
    }catch(e){}
    return out;
}
window._parseBarsFromBlocks=_parseBarsFromBlocks;

/* ═ المحلل السطري الذكي: زوج (عيار 500–999,9 بكسور + وزن <500) في السطر = سبيكة ═
   يتجاهل سطور رؤوس التحويل (705/730/750/1000) وسطور قيمها (3+ أرقام من نفس الفئة) */
function _parseLinePairs(text){
    const out=[];
    const isK=v=>v>=500&&v<1000;
    const isW=v=>v>0.3&&v<500;
    String(text).split(/\n+/).forEach(line=>{
        const nums=[...line.matchAll(/\d+(?:[.,]\d+)?/g)]
            .map(m=>parseFloat(m[0].replace(',','.')))
            .filter(v=>!isNaN(v)&&v>0);
        if(!nums.length)return;
        const ks=nums.filter(isK), ws=nums.filter(isW);
        /* سطر رؤوس التحويل أو قيمه: 3+ من نفس الفئة → تجاهل */
        if(ks.length>=3||ws.length>=3)return;
        if(ks.length===1&&ws.length===1){
            const k=parseFloat(ks[0].toFixed(1));
            const w=parseFloat(ws[0].toFixed(2));
            out.push({w,k});
        }
    });
    return out;
}
/* العيار = عدد صحيح 500–999، الوزن = رقم عشري؛ يُقرنان بأي ترتيب */
function _parseBars(text){
    /* أولاً: المحلل السطري (أوراق XRF متعددة في صورة واحدة) */
    const lp=_parseLinePairs(text);
    if(lp.length)return lp;
    const raw=String(text);
    /* ورقة تحليل XRF: فيها Au + وزن بجانبه g → سبيكة واحدة بقيم دقيقة */
    if(/\bAu\b/i.test(raw) && /(Poids|\d+(?:[.,]\d+)?\s*g\b)/i.test(raw)){
        const xb=_parseXrf(raw);
        if(xb.length) return xb;
    }
    /* ملصقات برتقالية: العيار صحيح 500–999، الوزن عشري، يُقرنان بأي ترتيب */
    const toks=(raw.replace(/,/g,'.').match(/\d+(?:\.\d+)?/g)||[]);
    const bars=[]; let cur={k:0,w:0};
    const push=()=>{ if(cur.k||cur.w){bars.push(cur);cur={k:0,w:0};} };
    for(const t of toks){
        const n=parseFloat(t);
        const isKarat=(t.indexOf('.')<0 && n>=500 && n<=999);
        if(isKarat){ if(cur.k) push(); cur.k=n; }
        else { if(cur.w) push(); cur.w=n; }
        if(cur.k&&cur.w) push();
    }
    push();
    return bars.filter(b=>b.w>0);
}
/* ورقة/أوراق تحليل: لكل Au عياره، ويُقرن بأقرب وزن (Poids/g) — يدعم عدّة أوراق */
function _parseXrf(raw){
    const s=String(raw).replace(/,/g,'.');
    /* مواضع كل العيارات: "Au <رقم>" */
    const karats=[]; let m;
    const reAu=/\bAu\b[^0-9]{0,6}(\d{3}(?:\.\d+)?)/gi;
    while((m=reAu.exec(s))!==null){ karats.push({pos:m.index, k:Math.round(parseFloat(m[1]))}); }
    /* مواضع كل الأوزان: "Poids : <رقم>" أو "<رقم> g" */
    const weights=[];
    const reP=/Poids[^0-9]{0,6}(\d+(?:\.\d+)?)/gi;
    while((m=reP.exec(s))!==null){ weights.push({pos:m.index, w:parseFloat(m[1])}); }
    if(!weights.length){
        const reG=/(\d+(?:\.\d+)?)\s*g\b/gi;
        while((m=reG.exec(s))!==null){ weights.push({pos:m.index, w:parseFloat(m[1])}); }
    }
    /* لكل عيار: اقرن بأقرب وزن يأتي بعده (وإلا أقرب وزن مطلقاً) */
    const usedW=new Set(); const bars=[];
    for(const ka of karats){
        let best=-1,bestD=Infinity;
        for(let i=0;i<weights.length;i++){
            if(usedW.has(i))continue;
            const after=weights[i].pos>=ka.pos;
            const d=(after?0:1e9)+Math.abs(weights[i].pos-ka.pos);
            if(d<bestD){bestD=d;best=i;}
        }
        const w=best>=0?weights[best].w:0; if(best>=0)usedW.add(best);
        if(ka.k>0||w>0)bars.push({k:ka.k||0,w:w||0});
    }
    /* لو لم نجد أي Au لكن وُجدت أوزان فقط */
    if(!bars.length){ for(const wt of weights){ if(wt.w>0)bars.push({k:0,w:wt.w}); } }
    return bars;
}
function _showBarsReview(bars){
    let m=document.getElementById('barsReviewModal');
    if(!m){ m=document.createElement('div'); m.id='barsReviewModal'; m.className='modal-overlay'; document.body.appendChild(m); }
    const rows=bars.map((b,i)=>`
        <div class="brRow" style="display:flex;gap:.4rem;align-items:center;margin-bottom:.4rem">
            <span style="color:var(--t2);font-size:.8rem;width:1.3rem">${i+1}</span>
            <input id="brK_${i}" value="${b.k||''}" inputmode="numeric" placeholder="العيار" style="flex:1;padding:.5rem;border:1.5px solid var(--border);border-radius:8px;text-align:center;background:var(--card);color:var(--t);font-family:inherit">
            <input id="brW_${i}" value="${b.w||''}" inputmode="decimal" placeholder="الوزن" style="flex:1;padding:.5rem;border:1.5px solid var(--border);border-radius:8px;text-align:center;background:var(--card);color:var(--t);font-family:inherit">
            <button onclick="this.closest('.brRow').remove()" style="background:transparent;border:none;color:#dc2626;font-size:1.1rem;cursor:pointer">🗑</button>
        </div>`).join('');
    m.innerHTML=`<div class="modal-box" style="max-width:430px">
        <div class="modal-header"><h3 style="font-size:.95rem">📷 مراجعة السبائك (${bars.length})</h3><button class="close-btn" onclick="closeModal('barsReviewModal')">✕</button></div>
        <div style="padding:.9rem">
            <div style="font-size:.72rem;color:var(--t2);text-align:center;margin-bottom:.6rem">راجع الأرقام وعدّلها ثم أدرجها في الفاتورة</div>
            <div style="display:flex;gap:.4rem;margin-bottom:.3rem;font-size:.7rem;color:var(--t3)"><span style="width:1.3rem"></span><span style="flex:1;text-align:center">العيار</span><span style="flex:1;text-align:center">الوزن (غ)</span><span style="width:1.3rem"></span></div>
            <div id="barsReviewList" style="max-height:48vh;overflow-y:auto">${rows}</div>
            <button onclick="confirmBarsReview(${bars.length})" style="width:100%;margin-top:.6rem;padding:.65rem;border:none;border-radius:10px;background:#16a34a;color:#fff;font-weight:800;font-size:.9rem;font-family:inherit;cursor:pointer">✅ إدراج في الفاتورة</button>
        </div></div>`;
    m.classList.add('active');
}
window.confirmBarsReview=(n)=>{
    const out=[];
    for(let i=0;i<n;i++){
        const ke=document.getElementById('brK_'+i), we=document.getElementById('brW_'+i);
        if(!ke||!we)continue;
        const k=parseFloat(String(ke.value||'').replace(',','.'))||0;
        const w=parseFloat(String(we.value||'').replace(',','.'))||0;
        if(w>0) out.push({k,w});
    }
    if(!out.length){ toast('لا سبائك للإدراج','error'); return; }
    (window._visionTarget==='raf'?_fillRafFromBars:_fillInvFromBars)(out);
    window._visionTarget=null;
    closeModal('barsReviewModal');
    toast('✅ أُدرجت '+out.length+' سبيكة','success');
};
/* تعبئة جدول الرافيناج من السبائك المقروءة (نفس نمط فاتورة الشراء) */
window._fillRafFromBars=function(bars){
    for(const b of bars){
        let target=null;
        for(let i=1;i<=rafRows;i++){
            const we=document.getElementById('rafW_'+i);
            if(we && !(parseFloat(String(we.value).replace(',','.'))>0)){ target=i; break; }
        }
        if(target==null){ addRafRow(true); target=rafRows; }
        const we=document.getElementById('rafW_'+target), ke=document.getElementById('rafK_'+target);
        if(we) we.value=String(b.w);          /* نقطة عشرية — قارئ الحفظ parseFloat لا يفهم الفاصلة */
        if(ke && b.k>0) ke.value=String(b.k);
    }
    if(typeof calcRaf==='function') calcRaf();
    toast('✅ مُلئت '+bars.length+' سطراً من الصورة — راجعها قبل الحفظ','success');
};
function _fillInvFromBars(bars){
    for(const b of bars){
        let target=null;
        for(let i=1;i<=invRows;i++){
            const we=document.getElementById('inv_w_'+i);
            if(we && !(parseInvNum(we.value)>0)){ target=i; break; }
        }
        if(target==null){ addInvRow(true); target=invRows; }
        const we=document.getElementById('inv_w_'+target), ke=document.getElementById('inv_k_'+target);
        if(we) we.value=String(b.w);
        if(ke && b.k>0) ke.value=String(b.k);
        if(typeof calcInvRow==='function') calcInvRow(target);
    }
    if(typeof saveDraft==='function') saveDraft();
}

/* ═══════════ ترباح — ملاحظات حرّة (لا تدخل أي حساب أو رصيد) ═══════════ */
const _tarbahKey=()=>'tarbah_notes_'+(typeof _SITE!=='undefined'&&_SITE?_SITE+'_':'')+(_currentUser||'_');
window._tarbahList=[];
window._loadTarbah=()=>{
    try{ window._tarbahList=JSON.parse(localStorage.getItem(_tarbahKey())||'[]')||[]; }catch(e){ window._tarbahList=[]; }
    if(typeof _renderTarbahList==='function')_renderTarbahList();
};
window._migrateTarbahOnce=function(){
    try{
        const mk='tarbah_migr_'+(_currentUser||'_');
        if(localStorage.getItem(mk))return;
        const old=JSON.parse(localStorage.getItem(_tarbahKey())||'[]')||[];
        const has=(typeof _allEvents!=='undefined')&&_allEvents.some(e=>e.type==='TARBAH_ADD');
        if(old.length&&!has){
            old.slice().reverse().forEach(x=>emitEvent('TARBAH_ADD',{entry:x},null));
            toast('📒 رُحّلت ملاحظات ترباح للحفظ السحابي ('+old.length+')','success');
        }
        localStorage.setItem(mk,'1');
    }catch(e){}
};
function _tarbahPersist(){
    try{localStorage.setItem(_tarbahKey(),JSON.stringify(window._tarbahList));}catch(e){}
    if(typeof _scheduleSave==='function')_scheduleSave();   /* مزامنة عبر الأجهزة عبر إعدادات Firebase */
}
window._applyTarbah=(jsonStr)=>{
    try{ const arr=JSON.parse(jsonStr); if(Array.isArray(arr)){ window._tarbahList=arr; try{localStorage.setItem(_tarbahKey(),jsonStr);}catch(e){} _renderTarbahList(); } }catch(e){}
};
let _tbType='buy';
window._setTbType=(t)=>{
    _tbType=t;
    const b=document.getElementById('tbBuyBtn'), s=document.getElementById('tbSellBtn');
    if(!b||!s)return;
    const base='flex:1;padding:.5rem;border-radius:8px;font-weight:800;font-size:.85rem;cursor:pointer;font-family:inherit;border:1.5px solid;';
    b.style.cssText=base+(t==='buy'?'background:#16a34a;color:#fff;border-color:#16a34a':'background:transparent;color:#16a34a;border-color:#16a34a');
    s.style.cssText=base+(t==='sell'?'background:#dc2626;color:#fff;border-color:#dc2626':'background:transparent;color:#dc2626;border-color:#dc2626');
};
function _ensureTarbahModal(){
    if(document.getElementById('tarbahModal'))return;
    const div=document.createElement('div');
    div.id='tarbahModal'; div.className='modal-overlay';
    div.onclick=(e)=>{ if(e.target===div) closeModal('tarbahModal'); };  /* ضغط الخلفية يُغلق */
    div.innerHTML=`
    <div class="modal-box" style="max-width:420px">
        <div class="modal-header">
            <h3 style="font-size:.95rem">📒 ترباح — ملاحظات</h3>
            <button class="close-btn" onclick="closeModal('tarbahModal')">✕</button>
        </div>
        <div style="padding:.9rem;display:flex;flex-direction:column;gap:.7rem">
            <div style="font-size:.72rem;color:var(--t2);text-align:center">ملاحظات حرّة فقط — لا تدخل في أي حساب أو رصيد</div>
            <div style="display:flex;gap:.4rem">
                <button id="tbBuyBtn" onclick="_setTbType('buy')">🟢 شراء</button>
                <button id="tbSellBtn" onclick="_setTbType('sell')">🔴 بيع</button>
            </div>
            <input id="tbName" type="text" placeholder="الاسم" autocomplete="off" style="padding:.6rem;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:.9rem;box-sizing:border-box;background:var(--card);color:var(--t)">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:.4rem">
                <input id="tbWeight" type="text" inputmode="decimal" placeholder="الميزان (غ)" style="padding:.6rem;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:.9rem;box-sizing:border-box;text-align:center;background:var(--card);color:var(--t)">
                <input id="tbPrice" type="text" inputmode="decimal" placeholder="السعر" style="padding:.6rem;border:1.5px solid var(--border);border-radius:8px;font-family:inherit;font-size:.9rem;box-sizing:border-box;text-align:center;background:var(--card);color:var(--t)">
            </div>
            <button onclick="addTarbah()" style="width:100%;padding:.6rem;border:none;border-radius:10px;background:#7c3aed;color:#fff;font-weight:800;font-size:.9rem;font-family:inherit;cursor:pointer">➕ إضافة</button>
            <div id="tarbahList" style="display:flex;flex-direction:column;gap:.4rem;max-height:42vh;overflow-y:auto"></div>
        </div>
    </div>`;
    document.body.appendChild(div);
}
window.openTarbah=()=>{
    _ensureTarbahModal();
    _setTbType('buy');
    _renderTarbahList();
    document.getElementById('tarbahModal').classList.add('active');
    setTimeout(()=>document.getElementById('tbName')?.focus(),300);
};
window.addTarbah=()=>{
    const g=id=>(document.getElementById(id).value||'').trim();
    const name=g('tbName'),weight=g('tbWeight'),price=g('tbPrice');
    if(!name&&!weight&&!price){ toast('اكتب شيئاً أولاً','error'); return; }
    const _e={id:'tb'+Date.now()+Math.random().toString(36).slice(2,6),type:_tbType,name,weight,price};
    emitEvent('TARBAH_ADD',{entry:_e},null);   /* حفظ سحابي فوري كأي قيد */
    ['tbName','tbWeight','tbPrice'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('tbName').focus();
};
window.delTarbah=(id)=>{
    emitEvent('TARBAH_DEL',{id},null);
};
function _renderTarbahList(){
    const box=document.getElementById('tarbahList'); if(!box)return;
    const L=window._tarbahList||[];
    if(!L.length){ box.innerHTML='<div style="text-align:center;color:var(--t2);font-size:.8rem;padding:1rem">لا ملاحظات بعد</div>'; return; }
    const num=v=>{ const n=parseFloat(String(v||'').replace(/\s/g,'').replace(',','.')); return isFinite(n)?n:0; };
    let totW=0, wpSum=0, wSum=0, pSum=0, pCount=0;
    L.forEach(x=>{ const w=num(x.weight), p=num(x.price);
        const isSell=(x.type==='sell');
        if(w>0) totW+=(isSell?-1:1)*w;          /* الشراء يُضاف والبيع يُخصم */
        if(isSell)return;                        /* المتوسط من قيود الشراء فقط */
        if(w>0&&p>0){ wpSum+=w*p; wSum+=w; }
        if(p>0){ pSum+=p; pCount++; }
    });
    const avg = wSum>0 ? wpSum/wSum : (pCount>0 ? pSum/pCount : 0);
    const summary=`<div style="position:sticky;top:0;z-index:1;display:flex;justify-content:space-around;gap:.5rem;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:.55rem;margin-bottom:.2rem">
        <div style="text-align:center;color:var(--t)"><div style="color:var(--t2);font-size:.68rem">مجموع الميزان</div><strong style="font-size:.9rem">${fmt(totW,2)} غ</strong></div>
        <div style="text-align:center;color:var(--t)"><div style="color:var(--t2);font-size:.68rem">متوسط الشراء</div><strong style="font-size:.9rem">${avg>0?fmt(avg,0):'—'}</strong></div>
    </div>`;
    const items=L.map(x=>{
        const badge=x.type==='sell'
            ?'<span style="color:#dc2626;font-weight:800">بيع</span> · '
            :x.type==='buy'?'<span style="color:#16a34a;font-weight:800">شراء</span> · ':'';
        return `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:.55rem .7rem">
            <div style="font-size:.85rem;line-height:1.5;color:var(--t)">
                ${badge}<strong style="color:var(--t)">${x.name||'—'}</strong>${x.weight?` · ⚖️ ${x.weight}`:''}${x.price?` · 💵 ${x.price}`:''}
            </div>
            <button onclick="delTarbah('${x.id}')" style="background:transparent;border:none;color:#dc2626;font-size:1.05rem;cursor:pointer;padding:.2rem">🗑</button>
        </div>`;
    }).join('');
    box.innerHTML=summary+items;
}
window._renderTarbahList=_renderTarbahList;
function _restoreDubaiCalcInputs(){
    try{
        const raw=localStorage.getItem(_dcKey());
        if(!raw)return false;
        const v=JSON.parse(raw);
        if(v.disc    !==undefined) document.getElementById('dcDisc').value    =v.disc;
        if(v.ship    !==undefined) document.getElementById('dcShip').value    =v.ship;
        if(v.dollar  !==undefined) document.getElementById('dcDollar').value  =v.dollar;
        if(v.expenses!==undefined) document.getElementById('dcExpenses').value=v.expenses;
        return !!(v.disc||v.ship||v.dollar||v.expenses);
    }catch(e){return false;}
}
window.openDubaiCalc=()=>{
    /* استعادة القيم المحفوظة */
    const hadSaved=_restoreDubaiCalcInputs();
    /* إذا لم تكن قيمة للدولار محفوظة، نأخذها من الإعدادات */
    const dEl=document.getElementById('dcDollar');
    if(!dEl.value) dEl.value=dollarRate;
    /* ربط الحفظ التلقائي عند كل تغيير (مرة واحدة فقط لكل حقل) */
    ['dcDisc','dcShip','dcDollar','dcExpenses'].forEach(id=>{
        const el=document.getElementById(id);
        if(el&&!el._dcSave){el._dcSave=true;el.addEventListener('input',_saveDubaiCalcInputs);}
    });
    /* احفظ فوراً (تشمل قيمة الدولار المُعبَّأة برمجياً) */
    _saveDubaiCalcInputs();
    document.getElementById('dubaiCalcModal').classList.add('active');
    autoCalcDubai();
};
/* تحديث تلقائي عند تغيّر السعر اللحظي إذا كانت النافذة مفتوحة وبها قيم */
function autoCalcDubai(){
    /* حدّث حقل السعر في نموذج دبي إذا كان مفتوحاً */
    const dubaiMod=document.getElementById('dubaiModal');
    if(dubaiMod&&dubaiMod.classList.contains('active')&&liveSpotPrice>0){
        const prEl=document.getElementById('dubaiPrice');
        if(prEl&&!prEl._userEdited) prEl.value=liveSpotPrice;
    }
    const modal=document.getElementById('dubaiCalcModal');
    if(!modal||!modal.classList.contains('active'))return;
    const disc=document.getElementById('dcDisc').value;
    if(!disc)return; /* لا تحسب بدون قيم */
    calcDubaiSell();
}
window.calcDubaiSell=()=>{
    const spot    =liveSpotPrice;
    const disc    =parseFloat(document.getElementById('dcDisc').value)||0;
    const ship    =parseFloat(document.getElementById('dcShip').value)||0;
    const dollar  =parseFloat(document.getElementById('dcDollar').value)||dollarRate;
    const expenses=parseFloat(document.getElementById('dcExpenses').value)||0;
    const res=document.getElementById('dcResult');
    if(!spot){
        res.textContent='⚠️ سعر الشاشة اللحظي غير متاح بعد';
        res.style.color='var(--rd)';
        return;
    }
    /* المعادلة: ((سعر الشاشة - الخصم) × 32.15 - الشحن) ÷ 100 × الدولار × 0.73 - المصاريف */
    const result=((spot-disc)*32.15 - ship)/100*dollar*0.73 - expenses;
    /* تقريب النتيجة للألف الأعلى وحذف الكسر */
    const rounded=Math.ceil(result/1000)*1000;
    const fmt=v=>v.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:0});
    res.innerHTML=`<span style="font-size:.72rem;color:var(--t2)">سعر الشاشة: ${fmt(spot,2)} $/أوقية</span><br>
        <span style="font-size:1.4rem;color:var(--gr);font-weight:900">${fmt(rounded)}</span>`;
    /* تحديث الشارة في الهيدر */
    document.getElementById('dubaiSellResult').textContent=fmt(rounded);
};

/* يحسب سعر بيع دبي تلقائياً من القيم المحفوظة + السعر اللحظي، دون فتح الحاسبة */
window._refreshDubaiSell=()=>{
    const el=document.getElementById('dubaiSellResult');
    if(!el||!liveSpotPrice)return;
    let disc=0,ship=0,dollar=dollarRate,expenses=0;
    try{
        const raw=localStorage.getItem(_dcKey());
        if(raw){const v=JSON.parse(raw);
            disc=parseFloat(v.disc)||0; ship=parseFloat(v.ship)||0;
            dollar=parseFloat(v.dollar)||dollarRate; expenses=parseFloat(v.expenses)||0;}
    }catch(e){}
    const result=((liveSpotPrice-disc)*32.15 - ship)/100*dollar*0.73 - expenses;
    const rounded=Math.ceil(result/1000)*1000;
    el.textContent=rounded.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:0});
};

window.saveDubai=()=>{
    const o=document.getElementById('dubaiOffice').value.trim();
    const w=parseFloat(document.getElementById('dubaiWeight').value);
    const sp=parseFloat(document.getElementById('dubaiPrice').value);
    const disc=parseFloat(document.getElementById('dubaiDisc').value)||0;
    if(!o||isNaN(w)||w<=0||isNaN(sp)||sp<=0)return toast('تأكد من البيانات','error');
    const usd=Math.max(0,(sp-disc)*w/31.1035);
    const _cur24=getCustBal(o,'ذهب 24');
    const fromDebt=Math.min(w,Math.max(0,_cur24));
    const fromInv=w-fromDebt;
    let barsRemove=[],barUpdates=[],_dubOut24=0;
    if(fromInv>0.001){
        if(B['ذهب 24']<fromInv-0.001)return toast('⚠️ مخزون 24 أو دين المكتب غير كافٍ','error');
        const r=_pickBarsToRemove('24',fromInv);
        barsRemove=r.barsRemove;barUpdates=r.barUpdates;_dubOut24=r.out24||0;
    }
    const did='DUB-'+uid();
    const dt=new Date().toLocaleDateString('fr-FR');
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    const _dub={id:did,c:o,w,sp,disc,usd,dt,rate:dollarRate};
    emitEvent('DUBAI',
        {o,w,sp,disc,usd,rate:dollarRate,fromDebt,fromInv,barsRemove,barUpdates,...(_dubOut24>0?{out24:_dubOut24}:{})},
        {dubaiInvoice:_dub,op:{c:o,t:'بيع دبي',m:'دولار',a:usd,_ts:Date.now(),dt:nowStr,sentW:w,sp,disc,did,rate:dollarRate}}
    );
    window._editRestore=null;
    closeModal('dubaiModal');
    toast('🏙️ تم ترحيل عملية دبي');
};
['dubaiWeight','dubaiPrice','dubaiDisc'].forEach(id=>{
    document.getElementById(id).addEventListener('input',()=>{
        /* إذا عدّل المستخدم السعر يدوياً — لا نعيد الكتابة فوقه */
        if(id==='dubaiPrice') document.getElementById('dubaiPrice')._userEdited=true;
        const w=parseFloat(document.getElementById('dubaiWeight').value)||0;
        const sp=parseFloat(document.getElementById('dubaiPrice').value)||0;
        const disc=parseFloat(document.getElementById('dubaiDisc').value)||0;
        document.getElementById('dubaiTotal').textContent='💰 '+fmt(Math.max(0,(sp-disc)*w/31.1035),2)+' USD';
    });
});

/* ═══ تفاصيل العملية (helper مشترك بين السجل والفاتورة) ═══ */
function opDetailLines(o,cust){
    const f=(n,d=2)=>fmt(n||0,d);
    const lines=[];
    const t=o.t||'';
    if(t==='بيع دولار'||t==='شراء دولار'){
        if(o.dr) lines.push(`💱 سعر الصرف: ${f(o.dr,0)} دج/$`);
        lines.push(`💵 بالدينار: ${f((o.a||0)*(o.dr||0)/100,0)} دج`);
        lines.push(o.paid===false?'⏳ غير خالص — مُضاف للديون':'✅ خالص — تمت المقاصة مباشرة');
        if(o.party) lines.push(`👤 ${t==='شراء دولار'?'من أخذه':'المسلم'}: ${o.party}`);
    } else if(t==='دولار وارد'||t==='دولار صادر'){
        if(o.dollFrom) lines.push(`👤 ${t==='دولار وارد'?'من':'إلى'}: ${o.dollFrom}`);
        if(o.dr&&t==='دولار وارد') lines.push(`💱 سعر الصرف: ${f(o.dr,0)} دج/$`);
    } else if((t==='شراء'||t==='بيع')&&o.iid){
        const inv=(typeof invoices!=='undefined'?invoices:[]).find(i=>i.id===o.iid);
        if(inv&&inv.items){
            inv.items.forEach(b=>{
                lines.push(`• عيار ${b.k||'?'} — ${f(b.w,2)}غ × ${f(b.ppg||b.p||0,0)} دج/غ = ${f(b.total||b.tot||0,0)} دج`);
            });
            lines.push(`📋 ${inv.ps==='full'?'💵 نقداً':'🔖 دين'} | الإجمالي: ${f(inv.tp,0)} دج`);
            if(inv.akhd) lines.push(`✅ المقبوض: ${f(inv.akhd,0)} دج`);
        }
    } else if(t==='شحن'){
        if(o.sp) lines.push(`💲 السعر: ${o.sp} $/100غ`);
        if(o.rc) lines.push(`📦 المستلم: ${f(o.rc,2)} غ`);
    } else if(t==='رافيناج'){
        if(o.sentW) lines.push(`⚖️ المرسل: ${f(o.sentW,2)} غ 730`);
        if(o.rec24!=null) lines.push(`✨ المستلم: ${f(o.rec24,2)} غ 24 خالص`);
        if(o.fee) lines.push(`💸 الأجرة: ${f(o.fee,0)} دج`);
    } else if(t==='بيع دبي'){
        if(o.sentW) lines.push(`⚖️ الوزن: ${f(o.sentW,2)} غ 24`);
        if(o.sp)    lines.push(`📺 سعر الشاشة: ${f(o.sp,2)} $/أوقية`);
        if(o.disc)  lines.push(`🏷️ الخصم: ${f(o.disc,2)} $/أوقية`);
    }
    if(o.realW&&o.realK) lines.push(`⚖️ الحقيقي: ${f(o.realW,2)} غ عيار ${o.realK}`);
    if(o.barsList&&o.barsList.length){
        o.barsList.forEach((b,i)=>{
            lines.push(`⚖️ سبيكة ${i+1}: ${fmt(b.w,2)} غ × عيار ${b.k} = خالص ${fmt(b.w*b.k/1000,2)} غ`);
        });
        if(o.barsList.length>1){
            const tw=o.barsList.reduce((s,b)=>s+b.w,0);
            const tp=o.barsList.reduce((s,b)=>s+b.w*b.k/1000,0);
            lines.push(`Σ المجموع: ${fmt(tw,2)} غ | خالص ${fmt(tp,2)} غ`);
        }
    }
    /* الصوارد/اللانقو: من القيد، وإلا من الفاتورة المرتبطة (رجعياً للقيود القديمة) */
    {
        const _inv=(o.rid&&typeof rafInvoices!=='undefined')?rafInvoices.find(r=>r&&r.id===o.rid):null;
        const _sw=(o.sawared>0)?o.sawared:((_inv&&_inv.sawared>0)?_inv.sawared:0);
        const _lq=(o.lanqo>0)?o.lanqo:((_inv&&_inv.lanqo>0&&o.rec24==null)?_inv.lanqo:0);
        if(_sw>0)lines.push(`💰 دفع صوارد نقداً: ${fmt(_sw,0)} دج`);
        if(_lq>0)lines.push(`🥇 دفع لانقو ذهباً: ${fmt(_lq,2)} غ (24)`);
    }
    if(o.musallim)lines.push(`✍️ المسلِّم: ${o.musallim}`);
    if(o.diffG!=null||o.diffD!=null){
        if(o.diffG)lines.push(`⚖️ فرق الخالص: ${o.diffG>0?'+':'−'}${fmt(Math.abs(o.diffG),2)} غ`);
        if(o.diffD)lines.push(`💰 فرق الأجرة: ${o.diffD>0?'+':'−'}${fmt(Math.abs(o.diffD),0)} دج`);
    }
    if(o.xferTo){
        const _xa=(amt,ty)=>ty==='دينار'?`${f(amt,0)} دج`:ty==='دولار'?`${f(amt,2)} $`:`${f(amt,3)} غ ${ty}`;
        lines.push(`🔁 تحويل إلى: ${o.xferTo}`);
        lines.push(`📦 المبلغ: ${_xa(o.a,o.m)}`+((o.xferDstType&&o.xferDstType!==o.m)?` ← ${_xa(o.xferWDst||0,o.xferDstType)}`:''));
        if(o.xferFeeFrom) lines.push(`💸 أجرة المُحوِّل (له): ${f(o.xferFeeFrom,0)} دج`);
        if(o.xferFeeTo)   lines.push(`💸 أجرة المستلِم (عليه): ${f(o.xferFeeTo,0)} دج`);
    }
    if(o.xferFrom){
        const _xa=(amt,ty)=>ty==='دينار'?`${f(amt,0)} دج`:ty==='دولار'?`${f(amt,2)} $`:`${f(amt,3)} غ ${ty}`;
        lines.push(`🔁 تحويل وارد من: ${o.xferFrom}`);
        lines.push(`📥 المبلغ: ${_xa(o.a,o.m)}`);
    }
    if(o.crossKarat)      lines.push(`🔄 تسوية 730 بـ24 — دُفع: ${f(o.paid24||0,3)} غ ذهب 24`);
    if(o.fromInv)         lines.push(cust?`📦 استلمت ${f(Math.abs(o.a)||0,3)} غ ذهب 24 (خصماً من دينك)`:`📦 سلّمنا ${f(Math.abs(o.a)||0,3)} غ ذهب 24 من المخزون (خصماً من دينه)`);
    if(o.receivePhysical) lines.push(`📥 استلام فيزيائي — ${f(o.actualW||0,3)} غ عيار ${o.actualK||730}`);
    if(o.cashSettle&&o.ppg){const _isBuy=o.t==='شراء بسعر';const _lbl=cust?(_isBuy?'بيع':'شراء'):(_isBuy?'شراء':'بيع');lines.push(`💰 ${_lbl} ${f(o.eqW||0,3)} غ × ${fmt(o.ppg,0)} دج/غ = ${fmt(o.cashVal||0,0)} دج ${o.paid?'(خالص نقداً)':'(على الحساب)'}`);}
    if(o.partial)         lines.push(`⚡ تصفية جزئية — بقي جزء من الدين قائماً`);
    if(o.note) lines.push(`📝 ${o.t==='تصحيح فاتورة'?'سبب التصحيح: ':''}${o.note}`);
    return lines;
}

/* ═══════════ LOG ═══════════ */
window.showShipLog=()=>{
    const ships=(ops||[]).filter(o=>o.t==='شحن').slice().sort((a,b)=>(b._ts||0)-(a._ts||0));
    const totW=ships.reduce((s,o)=>s+(Number(o.a)||0),0);
    const totRc=ships.reduce((s,o)=>s+(Number(o.rc)||0),0);
    const totCost=ships.reduce((s,o)=>s+((Number(o.rc)||0)*(Number(o.sp)||0)),0);
    let m=document.getElementById('shipLogModal');
    if(!m){m=document.createElement('div');m.id='shipLogModal';m.className='modal-overlay';document.body.appendChild(m);}
    const rows=ships.length?ships.map(o=>{
        const w=Number(o.a)||0, rc=Number(o.rc)||0, p=Number(o.sp)||0, cost=rc*p;
        return `
        <div style="padding:.55rem .2rem;border-bottom:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;align-items:center">
                <div style="font-weight:800;font-size:.84rem">🏢 ${(o.c||'—')}</div>
                <div style="font-size:.68rem;color:var(--t3)">${o.dt||''}</div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:.72rem;color:var(--t2);margin-top:.25rem">
                <span>مشحون: <strong>${fmt(w,2)} غ</strong></span>
                <span>استلم (خالص): <strong style="color:#16a34a">${fmt(rc,2)} غ</strong></span>
            </div>
            ${p?`<div style="display:flex;justify-content:space-between;font-size:.7rem;color:var(--t3);margin-top:.2rem">
                <span>السعر: ${fmt(p,2)}</span>
                <span>التكلفة: ${fmt(cost,2)} $</span>
            </div>`:''}
        </div>`;
    }).join(''):'<div style="text-align:center;padding:2rem;color:var(--t3)">لا توجد عمليات شحن</div>';
    m.innerHTML=`<div class="modal-box" style="max-width:460px">
        <div class="modal-header"><h3 style="font-size:.95rem">🚢 سجل الشحن</h3><button class="close-btn" onclick="closeModal('shipLogModal')">✕</button></div>
        <div style="padding:.9rem">
          <div class="infobox" style="margin-bottom:.6rem;font-size:.74rem">عدد الشحنات: <strong>${ships.length}</strong> · مشحون: <strong>${fmt(totW,2)} غ</strong> · استلم: <strong style="color:#16a34a">${fmt(totRc,2)} غ</strong>${totCost?` · تكلفة: <strong>${fmt(totCost,2)} $</strong>`:''}</div>
          <div style="max-height:55vh;overflow-y:auto">${rows}</div>
        </div></div>`;
    m.classList.add('active');
};

/* ═══════════ LOG (الرئيسي) ═══════════ */
/* الحساب التراكمي لليوم (الأدمين): نقر عملية في السجل → حركة ذلك الزبون في ذلك اليوم */
window._custLogRowNet=function(c,rowIdx){
    if(!c||rowIdx==null)return;
    const _n=s=>String(s||'').trim();
    const custOps=(ops||[]).filter(o=>_n(o.c).toLowerCase()===_n(c).toLowerCase()&&o.t!=='شحن');
    if(!custOps[rowIdx])return;
    const clicked=custOps[rowIdx];
    /* الطابع الزمني للعملية المضغوطة — نحسب الرصيد الحقيقي حتى تلك اللحظة */
    const upto=clicked._ts||clicked.ts||Date.now();
    let bal={'دينار':0,'دولار':0,'ذهب 730':0,'ذهب 24':0};
    if(typeof window._custBalUpToTs==='function'){
        try{ bal=window._custBalUpToTs(c,upto); }catch(e){ console.warn('balUpTo failed',e); }
    }
    const _units={'دينار':'دج','دولار':'$','ذهب 730':'غ','ذهب 24':'غ'};
    const order=['دينار','دولار','ذهب 730','ذهب 24'];
    const rows=order.map(m=>{
        const v=bal[m]||0;
        const col=v>0?'#16a34a':v<0?'#dc2626':'#9ca3af';
        const lbl=v>0?'له':v<0?'عليه':'صافٍ';
        return `<div style="display:flex;justify-content:space-between;padding:.5rem .2rem;border-bottom:1px solid var(--border)"><span style="font-weight:700;color:var(--t2)">${m}</span><span style="font-weight:900;color:${col};font-family:monospace">${fmt(Math.abs(v),m==='دينار'?0:2)} ${_units[m]} <small style="font-weight:600;color:var(--t3)">(${lbl})</small></span></div>`;
    }).join('');
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:2147483300;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;padding:1rem';
    ov.onclick=e=>{if(e.target===ov)ov.remove();};
    ov.innerHTML=`<div style="background:var(--card);border-radius:16px;padding:1.2rem;max-width:340px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3)">
        <div style="text-align:center;font-weight:900;color:var(--g600);font-size:1rem;margin-bottom:.2rem">📊 الرصيد حتى هذا السطر</div>
        <div style="text-align:center;font-size:.66rem;color:var(--t3);margin-bottom:.7rem">${clicked.dt||''} · ${clicked.t||''} · ${c}</div>
        ${rows}
        <button onclick="this.closest('[style*=fixed]').remove()" style="width:100%;margin-top:1rem;padding:.6rem;border:1.5px solid var(--border);border-radius:10px;background:transparent;color:var(--t2);font-weight:800;font-family:Tajawal,sans-serif;cursor:pointer">إغلاق</button>
    </div>`;
    document.body.appendChild(ov);
};

function renderLog(){
    const s=(document.getElementById('logSearch')?.value||'').toLowerCase();
    const f=document.getElementById('logFilter')?.value||'all';
    const day=document.getElementById('logDay')?.value||'';   /* yyyy-mm-dd */
    const month=document.getElementById('logMonth')?.value||'';  /* yyyy-mm */
    let fl=ops;
    if(s)fl=fl.filter(o=>(o.c||'').toLowerCase().includes(s));
    if(f!=='all')fl=fl.filter(o=>o.t===f);
    if(month){
        const _p=month.split('-').map(Number);
        const start=new Date(_p[0],_p[1]-1,1,0,0,0,0).getTime();
        const end=new Date(_p[0],_p[1],1,0,0,0,0).getTime();
        fl=fl.filter(o=>{
            const t=o._ts||0;
            if(t)return t>=start&&t<end;
            const mm=String(_p[1]).padStart(2,'0'),yy=String(_p[0]),d2=String(o.dt||'');
            return d2.includes('/'+mm+'/'+yy)||d2.includes('-'+mm+'-'+yy)||d2.includes('/'+mm+'/');
        });
    }
    if(day){
        /* اليوم المختار → نطاق [بداية اليوم، بدايته+24س) على الطابع الزمني _ts */
        const _p=day.split('-').map(Number);
        const start=new Date(_p[0],_p[1]-1,_p[2],0,0,0,0).getTime();
        const end=start+86400000;
        fl=fl.filter(o=>{
            const t=o._ts||0;
            if(t)return t>=start&&t<end;
            /* احتياط للعمليات القديمة بلا _ts: طابق يوم/شهر النصي */
            const d2=String(o.dt||'');
            const dd=String(_p[2]).padStart(2,'0');
            return d2.startsWith(dd+' ')||d2.startsWith(dd+'/');
        });
    }
    const list=document.getElementById('logList');
    if(!fl.length){list.innerHTML='<div style="text-align:center;padding:2.5rem;color:var(--t3)"><i class="fas fa-inbox" style="font-size:2rem;display:block;margin-bottom:.5rem"></i>لا توجد عمليات</div>';return}
    const outTypes=new Set(['أعطيت','بيع','بيع دولار','شحن','مصاريف','سلف','دولار صادر']);
    const colors={'سلف':'#f97316','رافيناج':'#ea580c','مصاريف':'#dc2626','شحن':'#8b5cf6','بيع دبي':'#14b8a6'};
    list.innerHTML=fl.map((o,_li)=>{
        const out=outTypes.has(o.t);
        const bg=colors[o.t]||(out?'var(--rd)':'var(--gr)');
        const unit=o.m==='دينار'?'DZD':o.m==='دولار'?'USD':'g';
        const dlines=opDetailLines(o);
        const detailHtml=dlines.length
            ?dlines.map(l=>`<br><span style="color:var(--t2);font-size:.7rem;font-weight:600;line-height:1.6">${l}</span>`).join('')
            :'';
        return`<div class="log-item" style="align-items:flex-start">
            <div class="log-avatar" style="background:${bg};margin-top:.15rem">${(o.c||'?').substring(0,2)}</div>
            <span style="flex:1;min-width:0">
                <strong style="font-size:.84rem;font-weight:900">${o.c||''}</strong>
                <br><small style="color:var(--t2);font-size:.68rem;font-weight:700">${o.dt||''} · <span style="color:${bg};font-weight:800">${o.t||''}</span></small>${detailHtml}
            </span>
            <span style="color:${o.t==='تصحيح فاتورة'?'var(--g600)':(out?'var(--rd)':'var(--gr)')};font-weight:900;font-size:clamp(.86rem,1.8vw,1.05rem);white-space:nowrap;margin-top:.1rem;font-family:'Tajawal',monospace,sans-serif">
                ${o.t==='تصحيح فاتورة'
                    ?(o.diffG?`${o.diffG>0?'+':'−'}${fmt(Math.abs(o.diffG),2)} g`:(o.diffD?`${fmt(Math.abs(o.diffD),0)} DZD`:'✏️ تصحيح'))
                    :`${out?'−':'+'}${fmt(o.a||0,2)} ${unit}`}
            </span>
            <button class="btn-pdf" onclick="showCustomerLog('${(o.c||'').replace(/'/g,"\\'")}')" style="background:rgba(14,165,233,.12);color:#0ea5e9;margin-top:.1rem" title="سجل الزبون"><i class="fas fa-eye"></i></button>
            <button class="btndel" onclick="delOp('${o.id}')" style="margin-top:.1rem"><i class="fas fa-trash-alt"></i></button>
        </div>`;
    }).join('');
    /* علامة مائية باسم المستخدم خلف السجل */
    const _wmEl=document.getElementById('logWm');
    if(_wmEl){
        const u=((typeof _currentUser!=='undefined'&&_currentUser)?_currentUser:(sessionStorage.getItem('gp12_user')||'')).toString();
        const row=u?(u+' • ').repeat(4):'';
        const ln=`<div style="transform:rotate(-26deg);white-space:nowrap;font-size:40px;font-weight:900;color:#d4af37;opacity:.06;letter-spacing:2px;margin:26px 0">${row}</div>`;
        _wmEl.innerHTML=u?ln+ln+ln+ln:'';
    }
}
/* ═══ إرسال سجل زبون ═══ */
window.openSendLog=()=>{
    document.getElementById('sendLogCustomer').value='';
    document.getElementById('sendLogPreview').textContent='';
    document.getElementById('sendLogPeriod').value='all';
    document.getElementById('sendLogModal').classList.add('active');
    setTimeout(()=>document.getElementById('sendLogCustomer').focus(),350);
};
window.previewSendLog=()=>{
    const c=document.getElementById('sendLogCustomer').value.trim();
    const days=document.getElementById('sendLogPeriod').value;
    if(!c){document.getElementById('sendLogPreview').textContent='';return;}
    const cutoff=days==='all'?0:Date.now()-days*86400000;
    const custOps=ops.filter(o=>{
        if((o.c||'').toLowerCase()!==c.toLowerCase())return false;
        if(o.t==='شحن')return false; /* الشحن له سجلّ مستقلّ */
        if(cutoff>0){
            /* نحاول تحليل التاريخ من dt */
            return true; /* نُظهر الكل ونفلتر بالعرض */
        }
        return true;
    });
    document.getElementById('sendLogPreview').textContent=
        custOps.length?`✅ ${custOps.length} معاملة للزبون "${c}"`:`⚠️ لا توجد معاملات للزبون "${c}"`;
};
window.sendCustomerLog=()=>{
    const c=document.getElementById('sendLogCustomer').value.trim();
    if(!c)return toast('اختر زبوناً أولاً','error');
    const custOps=ops.filter(o=>(o.c||'').toLowerCase()===c.toLowerCase()&&o.t!=='شحن');
    if(!custOps.length)return toast('لا توجد معاملات لهذا الزبون','error');

    const outTypes=new Set(['أعطيت','بيع','بيع دولار','شحن','مصاريف','سلف','دولار صادر']);
    const typeColors={'أعطيت':'#ef4444','استلمت':'#22c55e','شراء':'#3b82f6','بيع':'#ef4444',
        'سلف':'#f97316','رافيناج':'#ea580c','مصاريف':'#dc2626','شحن':'#8b5cf6','تحويل لزبون':'#7c3aed'};
    const user=document.getElementById('currentUserDisplay').textContent||'';
    const now=new Date().toLocaleDateString('ar-DZ',{year:'numeric',month:'long',day:'numeric'});

    const rows=custOps.map((o,i)=>{
        const out=outTypes.has(o.t);
        const unit=o.m==='دينار'?'DZD':o.m==='دولار'?'$':'g';
        const clr=typeColors[o.t]||(out?'#ef4444':'#22c55e');
        const dlines=opDetailLines(o);
        const detailCell=dlines.length
            ?`<td style="font-size:.72rem;color:#555;line-height:1.8">${dlines.map(l=>`<span style="display:block">${l}</span>`).join('')}</td>`
            :'<td style="color:#ccc">—</td>';
        return`<tr style="background:${i%2?'#f9f7f0':'#fff'}">
            <td style="color:#999;font-size:.75rem">${custOps.length-i}</td>
            <td style="font-size:.78rem">${o.dt||''}</td>
            <td><span style="background:${clr};color:#fff;padding:.1rem .45rem;border-radius:4px;font-size:.72rem;white-space:nowrap">${o.t}</span></td>
            <td style="font-size:.78rem">${o.m||''}</td>
            <td style="font-weight:700;color:${clr};white-space:nowrap">${out?'−':'+'}${(o.a||0).toLocaleString('fr-FR',{maximumFractionDigits:2})} ${unit}</td>
            ${detailCell}
        </tr>`;
    }).join('');

    /* الرصيد الصافي الحقيقي من جدول الديون */
    const _metals=['دينار','دولار','ذهب 730','ذهب 24'];
    const _units={دينار:'DZD',دولار:'$','ذهب 730':'g','ذهب 24':'g'};
    const _custDebts=_metals.map(m=>({m,v:getCustBal(c,m)})).filter(x=>Math.abs(x.v)>0.001);
    const netBalHtml=_custDebts.length?`
<h2 style="border-color:#b8860b;color:#b8860b">💰 الرصيد الصافي الحالي</h2>
<div style="display:flex;flex-wrap:wrap;gap:.5rem;margin-bottom:1.2rem">
${_custDebts.map(({m,v})=>{
    const owed=v>0;
    const unit=_units[m];
    const lbl=owed?'يَدين لنا':'نَدين له';
    const clr=owed?'#16a34a':'#dc2626';
    const bg=owed?'#f0fdf4':'#fef2f2';
    const border=owed?'#86efac':'#fca5a5';
    return`<div style="flex:1;min-width:140px;background:${bg};border:2px solid ${border};border-radius:8px;padding:.6rem .8rem;text-align:center">
        <div style="font-size:.72rem;color:#666;margin-bottom:.2rem">${m}</div>
        <div style="font-size:1.25rem;font-weight:900;color:${clr}">${Math.abs(v).toLocaleString('fr-FR',{maximumFractionDigits:2})} ${unit}</div>
        <div style="font-size:.7rem;font-weight:700;color:${clr};margin-top:.15rem">${lbl}</div>
    </div>`;
}).join('')}
</div>`
:`<div style="background:#f9f7f0;border:1px dashed #c8b87a;border-radius:6px;padding:.7rem;text-align:center;color:#888;font-size:.82rem;margin-bottom:1rem">✅ لا توجد أرصدة مستحقة — الحساب صافٍ</div>`;

    const html=`<!doctype html><html dir="rtl" lang="ar"><head><meta charset="utf-8">
<title>سجل معاملات — ${c}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',Tahoma,Arial,sans-serif;background:#fff;color:#111;padding:1.2cm;font-size:13px}
h1{color:#b8860b;font-size:1.5rem;text-align:center;margin-bottom:.2rem}
.sub{text-align:center;color:#777;font-size:.78rem;margin-bottom:1rem}
h2{font-size:.95rem;color:#555;margin:1rem 0 .35rem;border-bottom:2px solid #e5e0d0;padding-bottom:.25rem}
table{width:100%;border-collapse:collapse;margin-bottom:1rem;font-size:.8rem}
th{background:#b8860b;color:#fff;padding:.4rem .5rem;text-align:right}
td{padding:.35rem .5rem;border-bottom:1px solid #f0ece0;vertical-align:top}
.detail-line{display:block;color:#555;font-size:.72rem;line-height:1.8}
.footer{text-align:center;color:#aaa;font-size:.7rem;margin-top:1.5rem;border-top:1px solid #eee;padding-top:.5rem}
@media print{body{padding:.8cm}th{-webkit-print-color-adjust:exact;print-color-adjust:exact}div{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body>
<h1>🥇 GoldPro</h1>
<div class="sub">سجل معاملات الزبون: <strong>${c}</strong> | طُبع بتاريخ ${now} | المستخدم: ${user}</div>

<h2>📋 تفاصيل المعاملات (${custOps.length})</h2>
<table><thead><tr><th>#</th><th>التاريخ</th><th>النوع</th><th>العملة</th><th>المبلغ</th><th>التفاصيل</th></tr></thead>
<tbody>${rows}</tbody></table>

${netBalHtml}

<div class="footer">GoldPro — وثيقة خاصة بالزبون ${c} | ${now}</div>
<script>window.onload=()=>window.print()<\/script>
</body></html>`;

    const w2=window.open('','_blank','width=900,height=750');
    if(w2){w2.document.write(html);w2.document.close();closeModal('sendLogModal');}
    else toast('فعّل النوافذ المنبثقة لطباعة السجل','error');
};

/* ═══ واتساب — PDF عبر Web Share API (جوال) أو نافذة طباعة (كمبيوتر) ═══ */
/* ══ بناء HTML سجل الزبون — يُستخدَم مع html2pdf مثل الفاتورة تماماً ══ */
function buildCustomerLogHtml(c,custOps){
    const f=(n,d=2)=>fmt(n||0,d);
    const now=new Date().toLocaleDateString('ar-DZ',{year:'numeric',month:'long',day:'numeric'});
    const user=document.getElementById('currentUserDisplay')?.textContent||'';
    const outTypes=new Set(['أعطيت','بيع','بيع دولار','شحن','مصاريف','سلف','دولار صادر']);
    const tColor={'أعطيت':'#dc2626','استلمت':'#16a34a','شراء':'#2563eb','بيع':'#dc2626',
        'سلف':'#ea580c','رافيناج':'#92400e','مصاريف':'#dc2626','شحن':'#7c3aed','بيع دبي':'#0d9488',
        'بيع دولار':'#dc2626','شراء دولار':'#2563eb','تحويل لزبون':'#7c3aed','تحويل وارد':'#16a34a','دولار وارد':'#16a34a','دولار صادر':'#dc2626'};

    /* أرصدة الزبون */
    const _modes=['دينار','دولار','ذهب 730','ذهب 24'];
    const _units={دينار:'DZD',دولار:'$','ذهب 730':'g','ذهب 24':'g'};
    const balances=_modes.map(m=>({m,v:getCustBal(c,m)})).filter(x=>Math.abs(x.v)>0.001);

    const balHtml=balances.length
        ?balances.map(({m,v})=>{
            const owed=v>0;
            const bg=owed?'#fef2f2':'#f0fdf4';
            const border=owed?'#fca5a5':'#86efac';
            const col=owed?'#b91c1c':'#15803d';
            const lbl=owed?'يدين لنا':'ندين له';
            return`<td style="width:${100/balances.length}%;padding:8px;background:${bg};
                border:2px solid ${border};border-radius:6px;text-align:center;vertical-align:middle">
                <div style="font-size:18px;font-weight:900;color:${col};white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${f(Math.abs(v),2)} ${_units[m]}</div>
                <div style="font-size:11px;color:#555;margin-top:2px">${m}</div>
                <div style="font-size:11px;font-weight:700;color:${col}">${lbl}</div>
            </td>`;}).join('')
        :`<td style="text-align:center;color:#6b7280;padding:10px;font-size:13px">
            ✅ لا توجد أرصدة مستحقة — الحساب صافٍ</td>`;

    /* صفوف الجدول */
    const rows=custOps.map((o,i)=>{
        const out=outTypes.has(o.t);
        const unit=o.m==='دينار'?'DZD':o.m==='دولار'?'$':'g';
        const amtColor=out?'#dc2626':'#16a34a';
        const amtSign=out?'−':'+';
        const tc=tColor[o.t]||'#374151';
        const bg=i%2===0?'#fff':'#fafaf7';
        const dlines=opDetailLines(o);
        const detailHtml=dlines.length
            ?`<div style="margin-top:4px;font-size:10px;color:#555;line-height:1.7;border-top:1px dashed #d1d5db;padding-top:3px">${
                dlines.map(l=>`<span style="display:block">${l}</span>`).join('')}</div>`:'';
        return`<tr style="background:${bg};cursor:pointer" onclick="window._custLogRowNet&&window._custLogRowNet('${(c||'').replace(/'/g,"\\'")}',${i})">
            <td style="padding:7px 5px;text-align:center;color:#9ca3af;font-size:12px;border-bottom:1px solid #e5e7eb">${custOps.length-i}</td>
            <td style="padding:7px 6px;font-size:11px;color:#374151;border-bottom:1px solid #e5e7eb;white-space:nowrap">${o.dt||'—'}</td>
            <td style="padding:7px 6px;font-size:12px;font-weight:700;color:${tc};border-bottom:1px solid #e5e7eb">${o.t||'—'}</td>
            <td style="padding:7px 6px;font-size:13px;font-weight:900;color:${o.t==='تصحيح فاتورة'?'#0d9488':amtColor};border-bottom:1px solid #e5e7eb;white-space:nowrap">${
                o.t==='تصحيح فاتورة'
                    ? ((o.diffG?`${o.diffG>0?'+':'−'}${f(Math.abs(o.diffG),2)} g`:'')
                       +((o.diffG&&o.diffD)?' · ':'')
                       +(o.diffD?`${o.diffD>0?'+':'−'}${f(Math.abs(o.diffD),0)} DZD`:'')
                       ||'✏️ تصحيح')
                    : `${amtSign}${f(o.a,2)} ${unit}`}</td>
            <td style="padding:7px 6px;font-size:11px;border-bottom:1px solid #e5e7eb">${detailHtml}</td>
        </tr>`;}).join('');

    const _wmRow=user?(user+' • ').repeat(5):'';
    const _wmLine=`<div style="transform:rotate(-26deg);white-space:nowrap;text-align:center;font-size:52px;font-weight:900;color:#b8860b;opacity:.06;letter-spacing:2px;margin:30px 0">${_wmRow}</div>`;
    return`<div style="position:relative;overflow:hidden;padding:14px;font-family:'Tajawal',Arial,sans-serif;direction:rtl;max-width:720px;margin:auto;font-size:13px">
        <!-- علامة مائية (لوقو) باسم المستخدم خلف السجل -->
        <div style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden">
            ${user?_wmLine+_wmLine+_wmLine+_wmLine:''}
        </div>
        <div style="position:relative;z-index:1">
        <!-- ترويسة -->
        <div style="background:#b8860b;color:#fff;border-radius:8px 8px 0 0;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;margin-bottom:0">
            <span style="font-size:20px;font-weight:900;letter-spacing:1px">GoldPro</span>
            <span style="font-size:14px;font-weight:700">${c}</span>
            <span style="font-size:11px;opacity:.85">${now}</span>
        </div>
        <div style="background:#7a5c00;color:#ffe;padding:4px 16px;font-size:10px;text-align:left;margin-bottom:10px">${user}</div>

        <!-- أرصدة -->
        <div style="margin-bottom:10px">
            <div style="background:#b8860b;color:#fff;padding:5px 10px;font-weight:700;font-size:12px;border-radius:4px 4px 0 0">
                💰 الرصيد الصافي الحالي
            </div>
            <table style="width:100%;border-collapse:separate;border-spacing:4px;background:#f9f6ef;padding:6px;border-radius:0 0 6px 6px">
                <tr>${balHtml}</tr>
            </table>
        </div>

        <!-- جدول المعاملات -->
        <table style="width:100%;border-collapse:collapse;font-size:12px">
            <thead>
                <tr style="background:#374151;color:#fff">
                    <th style="padding:8px 5px;text-align:center;width:28px">#</th>
                    <th style="padding:8px 6px;text-align:right">التاريخ</th>
                    <th style="padding:8px 6px;text-align:right">النوع</th>
                    <th style="padding:8px 6px;text-align:right">المبلغ</th>
                    <th style="padding:8px 6px;text-align:right">التفاصيل</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>

        <!-- تذييل -->
        <div style="margin-top:10px;text-align:center;font-size:10px;color:#9ca3af">
            GoldPro | ${c} | ${now} | ${custOps.length} عملية
        </div>
        </div>
    </div>`;
}
function _logPdfOpts(c){
    const safe=c.replace(/\s+/g,'_');
    return{margin:4,filename:`سجل_${safe}.pdf`,image:{type:'jpeg',quality:.97},
        html2canvas:{scale:2,useCORS:true},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}};
}

window.sendCustomerLogWA=async()=>{
    const c=document.getElementById('sendLogCustomer').value.trim();
    if(!c)return toast('اختر زبوناً أولاً','error');
    const custOps=ops.filter(o=>(o.c||'').toLowerCase()===c.toLowerCase()&&o.t!=='شحن');
    if(!custOps.length)return toast('لا توجد معاملات لهذا الزبون','error');

    toast('⏳ جاري إنشاء PDF...','info');
    const safeC=c.replace(/\s+/g,'_');
    const fname=`سجل_${safeC}.pdf`;
    closeModal('sendLogModal');

    html2pdf().set(_logPdfOpts(c)).from(buildCustomerLogHtml(c,custOps)).outputPdf('blob')
        .then(blob=>_showShareCard(blob,fname,`سجل معاملات ${c}`))
        .catch(e=>toast('❌ خطأ في توليد PDF: '+(e&&e.message||e),'error'));
};

window.delOp=async (id)=>{
    const _evt=(typeof _allEvents!=='undefined')&&_allEvents.find(e=>e.id===id);
    if(!_evt){
        appAlert('⚠️ هذه العملية قديمة (سُجّلت قبل نظام الأحداث) — حذفها لن يعكس أثرها تلقائياً.\nصحّح أثرها يدوياً إن لزم.');
        return;
    }
    if(!(await appConfirm('حذف هذه العملية وعكس أثرها على الحسابات؟','🗑️ حذف')))return;
    const _target=_allEvents.find(e=>e.id===id);
    emitEvent('VOID',{voids:id},{});
    /* حدّث الشاشات + مشخّص ذاتي: هل زال القيد فعلاً؟ */
    setTimeout(()=>{
        try{if(typeof updAll==='function')updAll();}catch(e){}
        try{
            const im=document.getElementById('invModal');
            if(im&&im.classList.contains('active')&&typeof renderInvModal==='function')renderInvModal();
        }catch(e){}
        try{if(typeof renderLog==='function')renderLog();}catch(e){}
        try{if(typeof renderDebts==='function')renderDebts();}catch(e){}
        /* ═ تحقق ذاتي ═ */
        try{
            const stillOp=ops.find(o=>o.id===id);
            if(stillOp){
                appAlert('⚠️ القيد لم يُحذف رغم الإلغاء — أرسل هذه اللقطة للمطوّر:\nid='+id+'\ntype='+(_target?_target.type:'؟')+'\nts='+(_target?_target.ts:'؟'));
                return;
            }
            /* توأم بنفس المضمون بهوية أخرى؟ (بقايا دمج الاستعادة) */
            if(_target){
                const tw=ops.find(o=>o.id!==id
                    &&o.t===(_target.display&&_target.display.op&&_target.display.op.t)
                    &&Math.abs((o.a||0)-((_target.display&&_target.display.op&&_target.display.op.a)||0))<0.01
                    &&o.c===((_target.display&&_target.display.op&&_target.display.op.c)||''));
                if(tw)alert('⚠️ انتبه: يوجد قيد آخر مطابق تماماً لنفس العملية (مكرر من الاستعادة؟)\nأثره ما زال قائماً — إن كان مكرراً احذفه هو أيضاً:\n'+tw.t+' · '+(tw.c||'')+' · '+fmt(tw.a||0,2)+' · '+(tw.dt||''));
            }
        }catch(e){}
    },400);
    toast('↩️ تم حذف العملية وعكس أثرها','info');
};

/* ═══════════ DEBTS ═══════════ */
function renderDebts(){
    const tb=document.getElementById('debtsBody');
    /* شريك الرافيناج: ذهب 24 فقط + دينار لمن له حساب 24 */
    let _dsrc=debts;
    /* بحث باسم الزبون */
    const _dq=String(window._debtQ||'').trim().replace(/\s+/g,' ');
    if(_dq)_dsrc=_dsrc.filter(d=>String(d.c||'').includes(_dq));
    const _dsi=document.getElementById('debtSearch');
    if(_dsi&&_dsi.value!==String(window._debtQ||''))_dsi.value=window._debtQ||'';
    if(window._roleLock==='rafpartner'){
        const has24=new Set(debts.filter(d=>d.type==='ذهب 24'&&Math.abs(d.a||0)>0.001).map(d=>d.c));
        _dsrc=_dsrc.filter(d=>d.type==='ذهب 24'||(d.type==='دينار'&&has24.has(d.c)));   /* فوق نتيجة البحث لا بدلها */
    }
    if(!_dsrc.length){tb.innerHTML='<tr><td colspan="6" style="padding:2rem;color:var(--t3)">'+(_dq?'🔍 لا نتائج لـ«'+_dq+'»':'<i class="fas fa-check-circle" style="color:var(--gr)"></i> لا توجد ديون')+'</td></tr>';return}
    const cd={};
    _dsrc.forEach(d=>{
        if(!cd[d.c])cd[d.c]={di:0,do:0,g7:0,g2:0};
        cd[d.c][d.type==='دينار'?'di':d.type==='دولار'?'do':d.type==='ذهب 730'?'g7':'g2']+=(d.a||0);
    });
    /* وقت آخر معاملة لكل زبون (من سجلّ العمليات) للترتيب */
    const lastTx={};
    ops.forEach(o=>{ if(o&&o.c){ const t=o._ts||0; if(t>(lastTx[o.c]||0)) lastTx[o.c]=t; } });
    const fD=(v,d=0,unit='')=>{
        if(!v||Math.abs(v)<0.001)return'—';
        return`<span class="${v>0?'debt-pos':'debt-neg'}">${fmt(v,d)}</span>${unit?`<small style="font-size:.65rem;color:var(--t3);margin-right:.15rem"> ${unit}</small>`:''}`;
    };
    tb.innerHTML=Object.entries(cd)
        .sort((a,b)=>{
            const ta=lastTx[a[0]]||0, tb2=lastTx[b[0]]||0;
            if(tb2!==ta) return tb2-ta;                          /* الأحدث معاملةً أولاً */
            return Math.abs(b[1].di)-Math.abs(a[1].di);          /* عند التساوي: حسب الدين */
        })
        .map(([n,v])=>`<tr>
            <td><strong>${n}</strong></td>
            <td>${fD(v.di,0,'Da')}</td><td>${fD(v.do,2,'$')}</td>
            <td>${fD(v.g7,2,'غ (730)')}</td><td>${fD(v.g2,2,'غ (24)')}</td>
            <td><button class="btn-settle" onclick="openSettle('${n.replace(/'/g,"\\'")}')">✅ تصفية</button></td>
        </tr>`).join('');
}

function _logPdfOpts(c){
    const safe=c.replace(/\s+/g,'_');
    return{margin:4,filename:`سجل_${safe}.pdf`,image:{type:'jpeg',quality:.97},
        html2canvas:{scale:2,useCORS:true},jsPDF:{unit:'mm',format:'a4',orientation:'portrait'}};
}

window.sendCustomerLogWA=async()=>{
    const c=document.getElementById('sendLogCustomer').value.trim();
    if(!c)return toast('اختر زبوناً أولاً','error');
    const custOps=ops.filter(o=>(o.c||'').toLowerCase()===c.toLowerCase()&&o.t!=='شحن');
    if(!custOps.length)return toast('لا توجد معاملات لهذا الزبون','error');

    toast('⏳ جاري إنشاء PDF...','info');
    const safeC=c.replace(/\s+/g,'_');
    const fname=`سجل_${safeC}.pdf`;
    closeModal('sendLogModal');

    html2pdf().set(_logPdfOpts(c)).from(buildCustomerLogHtml(c,custOps)).outputPdf('blob')
        .then(blob=>_showShareCard(blob,fname,`سجل معاملات ${c}`))
        .catch(e=>toast('❌ خطأ في توليد PDF: '+(e&&e.message||e),'error'));
};

window.delOp=async (id)=>{
    const _evt=(typeof _allEvents!=='undefined')&&_allEvents.find(e=>e.id===id);
    if(!_evt){
        appAlert('⚠️ هذه العملية قديمة (سُجّلت قبل نظام الأحداث) — حذفها لن يعكس أثرها تلقائياً.\nصحّح أثرها يدوياً إن لزم.');
        return;
    }
    if(!(await appConfirm('حذف هذه العملية وعكس أثرها على الحسابات؟','🗑️ حذف')))return;
    const _target=_allEvents.find(e=>e.id===id);
    emitEvent('VOID',{voids:id},{});
    /* حدّث الشاشات + مشخّص ذاتي: هل زال القيد فعلاً؟ */
    setTimeout(()=>{
        try{if(typeof updAll==='function')updAll();}catch(e){}
        try{
            const im=document.getElementById('invModal');
            if(im&&im.classList.contains('active')&&typeof renderInvModal==='function')renderInvModal();
        }catch(e){}
        try{if(typeof renderLog==='function')renderLog();}catch(e){}
        try{if(typeof renderDebts==='function')renderDebts();}catch(e){}
        /* ═ تحقق ذاتي ═ */
        try{
            const stillOp=ops.find(o=>o.id===id);
            if(stillOp){
                appAlert('⚠️ القيد لم يُحذف رغم الإلغاء — أرسل هذه اللقطة للمطوّر:\nid='+id+'\ntype='+(_target?_target.type:'؟')+'\nts='+(_target?_target.ts:'؟'));
                return;
            }
            /* توأم بنفس المضمون بهوية أخرى؟ (بقايا دمج الاستعادة) */
            if(_target){
                const tw=ops.find(o=>o.id!==id
                    &&o.t===(_target.display&&_target.display.op&&_target.display.op.t)
                    &&Math.abs((o.a||0)-((_target.display&&_target.display.op&&_target.display.op.a)||0))<0.01
                    &&o.c===((_target.display&&_target.display.op&&_target.display.op.c)||''));
                if(tw)alert('⚠️ انتبه: يوجد قيد آخر مطابق تماماً لنفس العملية (مكرر من الاستعادة؟)\nأثره ما زال قائماً — إن كان مكرراً احذفه هو أيضاً:\n'+tw.t+' · '+(tw.c||'')+' · '+fmt(tw.a||0,2)+' · '+(tw.dt||''));
            }
        }catch(e){}
    },400);
    toast('↩️ تم حذف العملية وعكس أثرها','info');
};

/* ═══════════ DEBTS ═══════════ */
function renderDebts(){
    const tb=document.getElementById('debtsBody');
    /* شريك الرافيناج: ذهب 24 فقط + دينار لمن له حساب 24 */
    let _dsrc=debts;
    /* بحث باسم الزبون */
    const _dq=String(window._debtQ||'').trim().replace(/\s+/g,' ');
    if(_dq)_dsrc=_dsrc.filter(d=>String(d.c||'').includes(_dq));
    const _dsi=document.getElementById('debtSearch');
    if(_dsi&&_dsi.value!==String(window._debtQ||''))_dsi.value=window._debtQ||'';
    if(window._roleLock==='rafpartner'){
        const has24=new Set(debts.filter(d=>d.type==='ذهب 24'&&Math.abs(d.a||0)>0.001).map(d=>d.c));
        _dsrc=_dsrc.filter(d=>d.type==='ذهب 24'||(d.type==='دينار'&&has24.has(d.c)));   /* فوق نتيجة البحث لا بدلها */
    }
    if(!_dsrc.length){tb.innerHTML='<tr><td colspan="6" style="padding:2rem;color:var(--t3)">'+(_dq?'🔍 لا نتائج لـ«'+_dq+'»':'<i class="fas fa-check-circle" style="color:var(--gr)"></i> لا توجد ديون')+'</td></tr>';return}
    const cd={};
    _dsrc.forEach(d=>{
        if(!cd[d.c])cd[d.c]={di:0,do:0,g7:0,g2:0};
        cd[d.c][d.type==='دينار'?'di':d.type==='دولار'?'do':d.type==='ذهب 730'?'g7':'g2']+=(d.a||0);
    });
    /* وقت آخر معاملة لكل زبون (من سجلّ العمليات) للترتيب */
    const lastTx={};
    ops.forEach(o=>{ if(o&&o.c){ const t=o._ts||0; if(t>(lastTx[o.c]||0)) lastTx[o.c]=t; } });
    const fD=(v,d=0,unit='')=>{
        if(!v||Math.abs(v)<0.001)return'—';
        return`<span class="${v>0?'debt-pos':'debt-neg'}">${fmt(v,d)}</span>${unit?`<small style="font-size:.65rem;color:var(--t3);margin-right:.15rem"> ${unit}</small>`:''}`;
    };
    tb.innerHTML=Object.entries(cd)
        .sort((a,b)=>{
            const ta=lastTx[a[0]]||0, tb2=lastTx[b[0]]||0;
            if(tb2!==ta) return tb2-ta;                          /* الأحدث معاملةً أولاً */
            return Math.abs(b[1].di)-Math.abs(a[1].di);          /* عند التساوي: حسب الدين */
        })
        .map(([n,v])=>`<tr>
            <td><strong>${n}</strong></td>
            <td>${fD(v.di,0,'Da')}</td><td>${fD(v.do,2,'$')}</td>
            <td>${fD(v.g7,2,'غ (730)')}</td><td>${fD(v.g2,2,'غ (24)')}</td>
            <td><button class="btn-settle" onclick="openSettle('${n.replace(/'/g,"\\'")}')">✅ تصفية</button></td>
        </tr>`).join('');
}
window.exportDebtsPdf=function(){
    if(!debts.length){toast('لا توجد ديون للتصدير','info');return;}
    const cd={};
    debts.forEach(d=>{
        if(!cd[d.c])cd[d.c]={di:0,do:0,g7:0,g2:0};
        cd[d.c][d.type==='دينار'?'di':d.type==='دولار'?'do':d.type==='ذهب 730'?'g7':'g2']+=(d.a||0);
    });
    const rows=Object.entries(cd).filter(([n,v])=>Math.abs(v.di)>0.001||Math.abs(v.do)>0.001||Math.abs(v.g7)>0.001||Math.abs(v.g2)>0.001).sort((a,b)=>Math.abs(b[1].di)-Math.abs(a[1].di));
    const tot={di:0,do:0,g7:0,g2:0};
    rows.forEach(([n,v])=>{tot.di+=v.di;tot.do+=v.do;tot.g7+=v.g7;tot.g2+=v.g2;});
    const fV=(v,d)=>{ if(!v||Math.abs(v)<0.001)return'<span style="color:#bbb">\u2014</span>'; const col=v>0?'#16a34a':'#dc2626'; return'<span style="color:'+col+';font-weight:700">'+(v>0?'+':'\u2212')+fmt(Math.abs(v),d)+'</span>'; };
    const _bk=_netBuckets();
    const _gp=(typeof goldPrice!=='undefined'?goldPrice:0)||0;
    const _dr=(typeof dollarRate!=='undefined'?dollarRate:0)||0;
    const goldTotalG=(_bk.raw_730||0)+(_bk.raw_24||0)*(1000/730);
    let saleGoldG=0,saleAvg=0;
    try{
        let _tb=0;(window._tarbahList||[]).forEach(x=>{const w=parseFloat(String(x.weight||'').replace(/\s/g,'').replace(',','.'))||0;_tb+=(x.type==='sell'?-w:w);});
        saleGoldG=(_bk.raw_730||0)+(_bk.raw_24||0)*(1000/730)+_tb;
        let sWP=0,sW=0;(invoices||[]).filter(i=>i.t==='buy'&&!i.recv).forEach(inv=>{(inv.items||[]).forEach(it=>{const eq=+it.eq730||0,pp=+it.ppg||0;if(eq>0&&pp>0){sWP+=eq*pp;sW+=eq;}});});
        saleAvg=sW>0?Math.round(sWP/sW):0;
    }catch(e){}
    const totalAssets=net();
    let monthProfit=null;
    try{ const _now=new Date(); const _mk=_now.getFullYear()+'-'+String(_now.getMonth()+1).padStart(2,'0'); monthProfit=_calcMonthProfit(_mk); }catch(e){}
    const _isFirstMonth=false;   /* الفائدة الشهرية = ربح التداول+الرافيناج (لا مفهوم الأصول) */
    /* ذاكرة الأشهر السابقة: ربح كل شهر منقضٍ */
    let histRows='';
    try{
        const hist=_getMonthlyHistory();
        const keys=Object.keys(hist).sort().reverse();   /* الأحدث أولاً */
        const _mName=k=>{ const p=k.split('-'); const nm=['يناير','فبراير','مارس','أبريل','ماي','جوان','جويلية','أوت','سبتمبر','أكتوبر','نوفمبر','ديسمبر']; return (nm[(+p[1])-1]||p[1])+' '+p[0]; };
        histRows=keys.map(k=>{
            const h=hist[k]; const pr=h.profit||0; const col=pr>=0?'#16a34a':'#dc2626';
            return '<tr style="text-align:center"><td style="border:1px solid #ddd;padding:6px;font-weight:800;text-align:right">'+_mName(k)+'</td>'
                +'<td style="border:1px solid #ddd;padding:6px;color:'+col+';font-weight:800">'+(pr>=0?'+':'\u2212')+fmt(Math.abs(pr),0)+' \u062f\u062c</td></tr>';
        }).join('');
    }catch(e){}
    const dt=new Date().toLocaleDateString('fr-FR');
    const mpCol=(monthProfit==null?'#888':(monthProfit>=0?'#16a34a':'#dc2626'));
    const bigCard=(label,val,sub,color)=>'<div style="background:'+color+'12;border:1.5px solid '+color+';border-radius:12px;padding:11px 13px;text-align:center"><div style="font-size:11px;color:#555;font-weight:800;margin-bottom:4px">'+label+'</div><div style="font-size:17px;font-weight:900;color:'+color+';line-height:1.2">'+val+'</div>'+(sub?'<div style="font-size:10px;color:#888;font-weight:700;margin-top:3px">'+sub+'</div>':'')+'</div>';
    const rowsHtml=rows.map((e,idx)=>{const n=e[0],v=e[1];return '<tr style="text-align:center;background:'+(idx%2?'#f9f9f9':'#fff')+'"><td style="border:1px solid #ccc;padding:6px;font-weight:800;text-align:right">'+n+'</td><td style="border:1px solid #ccc;padding:6px">'+fV(v.di,0)+'</td><td style="border:1px solid #ccc;padding:6px">'+fV(v.do,2)+'</td><td style="border:1px solid #ccc;padding:6px">'+fV(v.g7,2)+'</td><td style="border:1px solid #ccc;padding:6px">'+fV(v.g2,2)+'</td></tr>';}).join('');
    const html='<div style="direction:rtl;font-family:Tajawal,sans-serif;padding:14px;color:#1a1a1a">'
        +'<div style="text-align:center;margin-bottom:12px"><div style="font-size:22px;font-weight:900;color:#b45309">\ud83d\udcd2 \u062f\u0641\u062a\u0631 \u0627\u0644\u062f\u064a\u0648\u0646</div><div style="font-size:12px;color:#888">'+dt+'</div></div>'
        +'<div style="background:linear-gradient(135deg,#b45309,#d97706);border-radius:14px;padding:14px;text-align:center;margin-bottom:11px;color:#fff"><div style="font-size:12px;font-weight:800;opacity:.9;margin-bottom:4px">\ud83d\udc8e \u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u0623\u0635\u0648\u0644 \u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a</div><div style="font-size:26px;font-weight:900">'+fmt(totalAssets,0)+' \u062f\u062c</div></div>'
        +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:11px">'
        +bigCard('\ud83d\udc51 \u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u0630\u0647\u0628 (730 + \u0645\u0643\u0627\u0641\u0626 24)',fmt(goldTotalG,2)+' \u063a','\u0633\u0639\u0631 \u0627\u0644\u0630\u0647\u0628: '+fmt(_gp,0)+' \u062f\u062c/\u063a','#16a34a')
        +bigCard('\u2696\ufe0f \u0630\u0647\u0628 \u0627\u0644\u0628\u064a\u0639',fmt(saleGoldG,2)+' \u063a','\u0645\u062a\u0648\u0633\u0637 \u0627\u0644\u0634\u0631\u0627\u0621: '+(saleAvg>0?fmt(saleAvg,0)+' \u062f\u062c/\u063a':'\u2014'),'#0ea5e9')
        +bigCard('\ud83d\udcb2 \u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u062f\u0648\u0644\u0627\u0631',fmt(_bk.raw_dol||0,2)+' $','\u0633\u0639\u0631 \u0627\u0644\u0635\u0631\u0641: '+fmt(_dr,0),'#7c3aed')
        +bigCard('\ud83d\udcb5 \u0645\u062c\u0645\u0648\u0639 \u0627\u0644\u062f\u064a\u0646\u0627\u0631',fmt(_bk.raw_din||0,0)+' \u062f\u062c','','#d97706')
        +'</div>'
        +'<div style="background:'+mpCol+'12;border:1.5px solid '+mpCol+';border-radius:12px;padding:11px;text-align:center;margin-bottom:12px"><div style="font-size:11px;color:#555;font-weight:800;margin-bottom:4px">\ud83d\udcc8 \u0641\u0627\u0626\u062f\u0629 \u0647\u0630\u0627 \u0627\u0644\u0634\u0647\u0631 '+'(\u0623\u062c\u0631\u0629 \u0631\u0627\u0641\u064a\u0646\u0627\u062c + \u0631\u0628\u062d \u0627\u0644\u062a\u062f\u0627\u0648\u0644)'+'</div><div style="font-size:20px;font-weight:900;color:'+mpCol+'">'+(monthProfit==null?'\u2014':((monthProfit>=0?'+':'\u2212')+fmt(Math.abs(monthProfit),0)+' \u062f\u062c'))+'</div></div>'
        +(histRows?('<div style="margin-bottom:12px"><div style="font-size:11px;color:#666;font-weight:800;margin-bottom:5px;text-align:right">\ud83d\udcc5 \u0623\u0631\u0628\u0627\u062d \u0627\u0644\u0623\u0634\u0647\u0631 \u0627\u0644\u0633\u0627\u0628\u0642\u0629</div><table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#f3f4f6"><th style="border:1px solid #ddd;padding:6px">\u0627\u0644\u0634\u0647\u0631</th><th style="border:1px solid #ddd;padding:6px">\u0627\u0644\u0631\u0628\u062d</th></tr></thead><tbody>'+histRows+'</tbody></table></div>'):'')
        +'<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:#1a1a1a;color:#fff;text-align:center"><th style="padding:7px;border:1px solid #555">\u0627\u0644\u0632\u0628\u0648\u0646</th><th style="padding:7px;border:1px solid #555">\u062f\u064a\u0646\u0627\u0631</th><th style="padding:7px;border:1px solid #555">\u062f\u0648\u0644\u0627\u0631</th><th style="padding:7px;border:1px solid #555">\u0630\u0647\u0628 730</th><th style="padding:7px;border:1px solid #555">\u0630\u0647\u0628 24</th></tr></thead><tbody>'+rowsHtml
        +'<tr style="text-align:center;background:#fef3c7;font-weight:900"><td style="border:2px solid #b45309;padding:7px;text-align:right">\u0627\u0644\u0625\u062c\u0645\u0627\u0644\u064a</td><td style="border:2px solid #b45309;padding:7px">'+fV(tot.di,0)+'</td><td style="border:2px solid #b45309;padding:7px">'+fV(tot.do,2)+'</td><td style="border:2px solid #b45309;padding:7px">'+fV(tot.g7,2)+'</td><td style="border:2px solid #b45309;padding:7px">'+fV(tot.g2,2)+'</td></tr>'
        +'</tbody></table>'
        +'<div style="margin-top:10px;font-size:10px;color:#888;text-align:center">\u0625\u064a\u062c\u0627\u0628\u064a (\u0623\u062e\u0636\u0631) = \u0627\u0644\u0632\u0628\u0648\u0646 \u0645\u062f\u064a\u0646 \u0644\u0643 &nbsp;|&nbsp; \u0633\u0627\u0644\u0628 (\u0623\u062d\u0645\u0631) = \u0623\u0646\u062a \u0627\u0644\u0645\u062f\u064a\u0646</div>'
        +'</div>';
    if(typeof _openInternalView==='function'){ _openInternalView(html,'دفتر الديون'); return; }
    const wrap=document.createElement('div');wrap.style.cssText='position:fixed;inset:0;z-index:99999;background:#fff;overflow:auto;padding:10px';
    wrap.innerHTML=html+'<button onclick="this.parentNode.remove()" style="display:block;margin:14px auto;padding:9px 22px;background:#dc2626;color:#fff;border:none;border-radius:9px;font-weight:800;font-family:Tajawal,sans-serif;cursor:pointer">\u2715 \u0625\u063a\u0644\u0627\u0642</button>';
    document.body.appendChild(wrap);
};

let _settleCustomer='';
window.openSettle=(name)=>{
    _settleCustomer=name;
    document.getElementById('settleCustomerName').textContent=name;
    _renderSettleRows();
    document.getElementById('settleModal').classList.add('active');
};
function _renderSettleRows(){
    const rows=document.getElementById('settleRows');
    const cd={دينار:0,دولار:0,'ذهب 730':0,'ذهب 24':0};
    debts.filter(d=>d.c===_settleCustomer).forEach(d=>{cd[d.type]=(cd[d.type]||0)+(d.a||0)});
    const icons={دينار:'💵',دولار:'💲','ذهب 730':'👑','ذهب 24':'💎'};
    const units={دينار:'دج',دولار:'$','ذهب 730':'غ','ذهب 24':'غ'};
    const decs={دينار:0,دولار:2,'ذهب 730':2,'ذهب 24':2};
    let active=Object.entries(cd).filter(([,v])=>Math.abs(v)>0.001);
    /* شريك الرافيناج: نوعاه فقط */
    const _rp=(window._roleLock==='rafpartner');
    if(_rp)active=active.filter(([t])=>t==='دينار'||t==='ذهب 24');
    const buyGoldBox=`<div style="margin-top:.7rem;padding-top:.7rem;border-top:1px dashed var(--border)">
        <div style="font-size:.72rem;color:var(--t3);margin-bottom:.4rem">🛒 شراء ذهب من الزبون (حتى بلا رصيد):</div>
        <div style="display:flex;gap:.4rem;margin-bottom:.4rem">
            <button class="btn-settle" style="flex:1;background:rgba(16,185,129,.12);color:#059669;border-color:#059669" onclick="_openGoldSettleModal('ذهب 730',true)">🛒 شراء 730</button>
            <button class="btn-settle" style="flex:1;background:rgba(16,185,129,.12);color:#059669;border-color:#059669" onclick="_openGoldSettleModal('ذهب 24',true)">🛒 شراء 24</button>
        </div>
        <div style="font-size:.72rem;color:var(--t3);margin-bottom:.4rem">💰 بيع ذهب للزبون (من مخزونك):</div>
        <div style="display:flex;gap:.4rem">
            <button class="btn-settle" style="flex:1;background:rgba(220,38,38,.12);color:#dc2626;border-color:#dc2626" onclick="_openGoldSettleModal('ذهب 730',false,true)">💰 بيع 730</button>
            <button class="btn-settle" style="flex:1;background:rgba(220,38,38,.12);color:#dc2626;border-color:#dc2626" onclick="_openGoldSettleModal('ذهب 24',false,true)">💰 بيع 24</button>
        </div>
    </div>`;
    if(!active.length){rows.innerHTML='<div style="text-align:center;padding:1rem;color:var(--t3)">لا توجد أرصدة للتصفية</div>'+(_rp?'':buyGoldBox);return}
    rows.innerHTML=active.map(([type,val])=>{
        const cls=val>0?'debt-pos':'debt-neg';
        /* موجب = تسالو (هو مدين لك) ، سالب = يسالك (أنت مدين له) */
        const dir=val>0?'تسالو':'يسالك';
        const isGold=type==='ذهب 730'||type==='ذهب 24';
        const btnLabel=isGold?(val<0?'🛒 شراء':'💰 بيع'):'صفّي';
        /* أزرار التسوية الإضافية للذهب */
        const extraBtn=type==='ذهب 730'
            ?`<button class="btn-settle" style="background:rgba(217,119,6,.12);color:#d97706;border-color:#d97706;font-size:.72rem;padding:.3rem .5rem" onclick="settle730With24()">🔄 بـ24</button>`
             +(val>0?`<button class="btn-settle" style="background:rgba(16,185,129,.12);color:#059669;border-color:#059669;font-size:.72rem;padding:.3rem .5rem" onclick="receiveSettle730()">📥 استلام</button>`:'')
            :type==='ذهب 24'
            ?`<button class="btn-settle" style="background:rgba(59,130,246,.1);color:#3b82f6;border-color:#3b82f6;font-size:.72rem;padding:.3rem .5rem" onclick="settle24FromInv()">📦 مخزون</button>`
            :'';
        const xferBtn=_rp?'':`<button class="btn-settle" style="background:rgba(139,92,246,.12);color:#7c3aed;border-color:#7c3aed;font-size:.72rem;padding:.3rem .5rem" onclick="openXfer('${type}')">🔁 تحويل لزبون</button>`;
        return`<div class="settle-row">
            <div>
                <div class="sr-info">${icons[type]} ${type} — <span style="font-size:.7rem;color:var(--t2)">${dir}</span></div>
                <div class="sr-val ${cls}">${fmt(Math.abs(val),decs[type])} ${units[type]}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:.3rem;align-items:flex-end">
                ${(_rp&&type==='ذهب 24')?'':`<button class="btn-settle" onclick="settleOne('${type}')">${btnLabel}</button>`}
                ${extraBtn}
                ${xferBtn}
            </div>
        </div>`;
    }).join('')+(_rp?'':buyGoldBox);
}

/* ═══════════ تحويل رصيد ذهب لحساب زبون آخر (لا يمسّ المخزون) ═══════════ */
/* رسوم التحويل الخاصة (مطابقة لِـ rafinag) — تسري على الذهب فقط وعند اختيار «بأجرة»:
   أجرة المُحوِّل (له) = الوزن × 1000  — لعبد الله شلف فقط
   أجرة المستلِم (عليه) = (الوزن ÷ 0.705) × 2000 — دائماً عند السريان
   بإشارة GoldPro: المُحوِّل نحن ندين له (−)، المستلِم يدين لنا (+). */
const XFER_FEE_SENDERS = {
    'عبد الله شلف': { sender:true,  recipient:true },
    'صلاح':         { sender:false, recipient:true }
};
function _xNorm(n){ return (n||'').trim().replace(/\s+/g,' '); }
function xferFeeRule(name){ return XFER_FEE_SENDERS[_xNorm(name)]||null; }
let _xferWithFee=false;
window.setXferFee=(v)=>{
    _xferWithFee=!!v;
    const on=document.getElementById('xferFeeOn'), off=document.getElementById('xferFeeOff');
    const base='flex:1;padding:.5rem;border:1.5px solid #d97706;border-radius:8px;font-size:.76rem;font-weight:800;cursor:pointer;font-family:inherit;';
    if(on)on.style.cssText=base+(_xferWithFee?'background:#d97706;color:#fff':'background:transparent;color:#d97706');
    if(off)off.style.cssText=base+(!_xferWithFee?'background:#d97706;color:#fff':'background:transparent;color:#d97706');
    _xferCalc();
};
let _xferSrcType=null,_xferSrcBal=0,_xferMode='same';
window.openXfer=(srcType)=>{
    const bal=debts.filter(x=>x.c===_settleCustomer&&x.type===srcType).reduce((s,x)=>s+(x.a||0),0);
    if(Math.abs(bal)<0.001){toast('لا يوجد رصيد لهذا النوع','info');return;}
    _xferSrcType=srcType; _xferSrcBal=bal; _xferMode='same';
    _ensureXferModal();
    const isGold=srcType==='ذهب 730'||srcType==='ذهب 24';
    const unit=srcType==='دينار'?'دج':srcType==='دولار'?'$':'غ';
    const dec=srcType==='دينار'?0:srcType==='دولار'?2:3;
    const dir=bal>0?'تسالو (مدين لك)':'يسالك (أنت مدين له)';
    document.getElementById('xferFrom').textContent=_settleCustomer;
    document.getElementById('xferSrcInfo').textContent=`${srcType} — ${fmt(Math.abs(bal),dec)} ${unit} · ${dir}`;
    document.getElementById('xferTarget').value='';
    document.getElementById('xferW').value=Math.abs(bal).toFixed(2).replace('.',',');
    document.getElementById('xferWLabel').textContent=`المبلغ المحوّل (${unit})`;
    /* خيار التحويل بين العيارين للذهب فقط */
    const modeRow=document.getElementById('xferModeRow');
    if(isGold){
        modeRow.style.display='flex';
        const other=srcType==='ذهب 730'?'ذهب 24':'ذهب 730';
        document.getElementById('xferModeSame').textContent=`كما هي (${srcType})`;
        document.getElementById('xferModeConv').textContent=`حوّل لـ${other}`;
        _setXferMode('same');
    }else{
        modeRow.style.display='none';
        _xferMode='same';
        _xferCalc();
    }
    /* صف الأجرة الخاصة — يظهر فقط لتحويل الذهب من زبون له قاعدة رسوم */
    const feeRow=document.getElementById('xferFeeRow');
    if(feeRow){
        const rule=xferFeeRule(_settleCustomer);
        const showFee=isGold && !!rule;
        feeRow.style.display=showFee?'flex':'none';
        _xferWithFee=false; setXferFee(false);
        const hint=document.getElementById('xferFeeHint');
        if(hint&&showFee){
            hint.textContent=rule.sender
                ? 'أجرة المُحوِّل (له) + أجرة المستلِم (عليه)'
                : 'أجرة المستلِم فقط (عليه) — لا أجرة للمُحوِّل';
        }
    }
    document.getElementById('xferModal').classList.add('active');
    if(window._acAttach)_acAttach('xferTarget');
    setTimeout(()=>document.getElementById('xferTarget').focus(),320);
};
window._setXferMode=(m)=>{
    _xferMode=m;
    const a=document.getElementById('xferModeSame'),b=document.getElementById('xferModeConv');
    const base='flex:1;padding:.55rem;border:1.5px solid;border-radius:8px;font-size:.78rem;font-weight:700;cursor:pointer;';
    const on='background:#7c3aed;color:#fff;border-color:#7c3aed', off='background:transparent;color:#7c3aed;border-color:#7c3aed';
    a.style.cssText=base+(m==='same'?on:off);
    b.style.cssText=base+(m==='conv'?on:off);
    _xferCalc();
};
function _xferCalc(){
    const isGold=_xferSrcType==='ذهب 730'||_xferSrcType==='ذهب 24';
    const W=readNum('xferW');
    let dstType=_xferSrcType,wDst=W;
    if(isGold&&_xferMode==='conv'){
        if(_xferSrcType==='ذهب 730'){dstType='ذهب 24';wDst=W*730/1000;}
        else{dstType='ذهب 730';wDst=W*1000/730;}
    }
    const dec=dstType==='دينار'?0:dstType==='دولار'?2:3;
    const txt=isGold?`${fmt(wDst,dec)} غ ${dstType}`:`${fmt(wDst,dec)} ${dstType==='دينار'?'دج':'$'}`;
    const el=document.getElementById('xferPreview'); if(!el)return;
    let feeHtml='';
    const _r=(typeof xferFeeRule==='function')?xferFeeRule(_settleCustomer):null;
    if(isGold && _xferWithFee && _r){
        const fF=_r.sender?Math.round(W*1000):0;
        const fT=_r.recipient?Math.round((W/0.705)*2000):0;
        feeHtml=`<br><span style="font-size:.72rem;color:#d97706;font-weight:700">`
            +(fF?`أجرة للمُحوِّل: ${fmt(fF,0)} دج (ندين له)`:'')
            +(fF&&fT?' · ':'')
            +(fT?`أجرة على المستلِم: ${fmt(fT,0)} دج (يدين لنا)`:'')
            +`</span>`;
    }
    el.innerHTML=`يستلم الزبون الهدف: <strong style="color:#7c3aed">${txt}</strong>`
        +((isGold&&_xferMode==='conv')?`<br><span style="font-size:.7rem;color:var(--t3)">${_xferSrcType==='ذهب 730'?'المكافئ = الكمية × 730 ÷ 1000':'المكافئ = الكمية × 1000 ÷ 730'}</span>`:'')
        +feeHtml;
}
window._xferCalc=_xferCalc;
window.doXfer=async ()=>{
    const to=(document.getElementById('xferTarget').value||'').trim();
    if(!to){toast('⚠️ اكتب اسم الزبون الهدف','error');return;}
    const isGold0=_xferSrcType==='ذهب 730'||_xferSrcType==='ذهب 24';
    const _selfConv=(to===_settleCustomer);
    if(_selfConv&&!(isGold0&&_xferMode==='conv')){
        toast('⚠️ التحويل لنفس الزبون يكون تحويلاً نوعياً فقط (730 ↔ 24) — فعّل «تحويل نوعي»','error');return;
    }
    const W=readNum('xferW');
    if(!W||W<=0){toast('⚠️ أدخل كمية صحيحة','error');return;}
    const unit=_xferSrcType==='دينار'?'دج':_xferSrcType==='دولار'?'$':'غ';
    const dec=_xferSrcType==='دينار'?0:_xferSrcType==='دولار'?2:3;
    /* تحويل أكبر من الرصيد: مسموح باستئذان — الفارق ينقلب ديناً معاكساً على المصدر */
    if(W>Math.abs(_xferSrcBal)+0.001){
        const over=W-Math.abs(_xferSrcBal);
        const ok=await appConfirm(
            `المبلغ أكبر من رصيد «${_settleCustomer}» (${fmt(Math.abs(_xferSrcBal),dec)} ${unit}).\n\n`+
            `سيُحوَّل ${fmt(W,dec)} ${unit} كاملاً، وينقلب حساب المصدر بالفارق:\n`+
            `${fmt(over,dec)} ${unit} ${_xferSrcBal<0?'ديناً لك عليه':'ديناً له عليك'}.\n\nمتابعة؟`,
            '✔️ حوّل واقلب الفارق');
        if(!ok)return;
    }
    const sign=_xferSrcBal>0?1:-1;
    const isGold=_xferSrcType==='ذهب 730'||_xferSrcType==='ذهب 24';
    let dstType=_xferSrcType,wDst=W;
    if(isGold&&_xferMode==='conv'){
        if(_xferSrcType==='ذهب 730'){dstType='ذهب 24';wDst=W*730/1000;}
        else{dstType='ذهب 730';wDst=W*1000/730;}
    }
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    /* رسوم التحويل الخاصة (ذهب فقط + بأجرة + زبون له قاعدة) */
    let feeFrom=0, feeTo=0;
    const _rule=xferFeeRule(_settleCustomer);
    if(!_selfConv && isGold && _xferWithFee && _rule){
        if(_rule.sender)    feeFrom=Math.round(W*1000);
        if(_rule.recipient) feeTo  =Math.round((W/0.705)*2000);
    }
    emitEvent('XFER',
        {from:_settleCustomer,to,srcType:_xferSrcType,dstType,srcDelta:sign*W,dstDelta:sign*wDst,w:W,wDst,feeFrom,feeTo},
        {op:{c:_settleCustomer,t:'تحويل لزبون',m:_xferSrcType,a:W,_ts:Date.now(),dt:nowStr,
             xferTo:to,xferDstType:dstType,xferWDst:wDst,xferSign:sign,xferFeeFrom:feeFrom,xferFeeTo:feeTo}}
    );
    closeModal('xferModal');closeModal('settleModal');
    if(typeof _sendCustomerPush==='function'&&!_selfConv)_sendCustomerPush(_settleCustomer,'تسوية حساب','سُجّلت حركة تسوية على حسابك — افتح حسابك للاطلاع');
    if(_selfConv)toast(`🔁 تحويل نوعي داخل حساب ${_settleCustomer}: ${fmt(W,dec)} غ ${_xferSrcType} ← ${fmt(wDst,3)} غ ${dstType} (المخزون لم يُمسّ)`,'success');
    else toast(`🔁 حُوّل ${fmt(W,dec)} ${unit} من ${_settleCustomer} إلى ${to}`+((isGold&&_xferMode==='conv')?` (محوّل لـ${dstType})`:'')+((feeFrom||feeTo)?' + أجرة':''),'success');
};
function _ensureXferModal(){
    if(document.getElementById('xferModal'))return;
    const div=document.createElement('div');
    div.id='xferModal'; div.className='modal-overlay';
    div.innerHTML=`
    <div class="modal-box" style="max-width:340px">
        <div class="modal-header">
            <h3 style="font-size:.9rem">🔁 تحويل رصيد لحساب زبون آخر</h3>
            <button class="close-btn" onclick="closeModal('xferModal')">✕</button>
        </div>
        <div style="padding:1rem;display:flex;flex-direction:column;gap:.7rem">
            <div style="background:var(--card2);border-radius:8px;padding:.7rem;font-size:.82rem;display:flex;flex-direction:column;gap:.3rem">
                <div><span style="color:var(--t2)">من حساب:</span> <strong id="xferFrom"></strong></div>
                <div><span style="color:var(--t2)">الرصيد:</span> <span id="xferSrcInfo" style="font-weight:700"></span></div>
            </div>
            <div>
                <label style="font-size:.78rem;color:var(--t2);display:block;margin-bottom:.3rem">الزبون الهدف</label>
                <input id="xferTarget" type="text" placeholder="اسم الزبون" autocomplete="off"
                    style="width:100%;padding:.65rem;border:1.5px solid var(--border);border-radius:8px;font-size:1rem;font-family:inherit;box-sizing:border-box" />
            </div>
            <div>
                <label id="xferWLabel" style="font-size:.78rem;color:var(--t2);display:block;margin-bottom:.3rem">المبلغ المحوّل (غ)</label>
                <input id="xferW" type="text" inputmode="decimal" dir="ltr" placeholder="0,000"
                    style="width:100%;padding:.65rem;border:1.5px solid var(--border);border-radius:8px;font-size:1rem;font-family:inherit;text-align:right;box-sizing:border-box"
                    oninput="liveNum(this);_xferCalc()" />
            </div>
            <div id="xferModeRow" style="display:flex;gap:.5rem">
                <button id="xferModeSame" onclick="_setXferMode('same')"></button>
                <button id="xferModeConv" onclick="_setXferMode('conv')"></button>
            </div>
            <div id="xferFeeRow" style="display:none;flex-direction:column;gap:.35rem">
                <label style="font-size:.76rem;color:var(--t2);font-weight:700">أجرة التحويل الخاصة</label>
                <div style="display:flex;gap:.5rem">
                    <button id="xferFeeOn" onclick="setXferFee(true)">بأجرة</button>
                    <button id="xferFeeOff" onclick="setXferFee(false)">بدون</button>
                </div>
                <div id="xferFeeHint" style="font-size:.68rem;color:var(--t3);text-align:center"></div>
            </div>
            <div id="xferPreview" style="background:rgba(124,58,237,.07);border-radius:8px;padding:.6rem;text-align:center;font-size:.85rem;line-height:1.6"></div>
            <div style="font-size:.72rem;color:var(--t3);text-align:center;line-height:1.5">يُخصم من حساب المصدر ويُضاف لحساب الهدف — دون أي تأثير على المخزون</div>
            <button class="bg" style="width:100%;padding:.7rem;font-size:.93rem" onclick="doXfer()">✅ تأكيد التحويل</button>
        </div>
    </div>`;
    document.body.appendChild(div);
}

function _applySettle(type){
    const net=debts.filter(x=>x.c===_settleCustomer&&x.type===type).reduce((s,x)=>s+(x.a||0),0);
    if(Math.abs(net)<0.001)return false;
    if(type==='دينار'&&net<0&&B.دينار<Math.abs(net)-0.001)
        {toast(`⚠️ رصيد الدينار غير كافٍ للتصفية (متاح: ${fmt(B.دينار,0)} دج)`,'error');return false;}
    if(type==='دولار'&&net<0&&B.دولار<Math.abs(net)-0.001)
        {toast('⚠️ رصيد الدولار غير كافٍ للتصفية','error');return false;}
    if(type==='ذهب 730'&&net>0){const av=g730.reduce((s,b)=>s+(b.w||0),0);if(av<net-0.001){toast(`⚠️ مخزون 730 غير كافٍ للبيع (متاح: ${fmt(av,2)} غ)`,'error');return false;}}
    if(type==='ذهب 24' &&net>0){const av=g24.reduce((s,b)=>s+(b.w||0),0);if(av<net-0.001){toast(`⚠️ مخزون 24 غير كافٍ للبيع (متاح: ${fmt(av,2)} غ)`,'error');return false;}}
    let barsRemove=[],barUpdates=[];
    if(type==='ذهب 730'&&net>0){const r=_pickBarsToRemove('730',net);barsRemove=r.barsRemove;barUpdates=r.barUpdates;}
    let _sOut24=0;
    if(type==='ذهب 24' &&net>0){const r=_pickBarsToRemove('24',net);barsRemove=r.barsRemove;barUpdates=r.barUpdates;_sOut24=r.out24||0;}
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    emitEvent('SETTLE',
        {c:_settleCustomer,type,net,barsRemove,barUpdates,...(_sOut24>0?{out24:_sOut24}:{})},
        {op:{c:_settleCustomer,t:'تصفية',m:type,a:net,_ts:Date.now(),dt:nowStr}}
    );
    return true;
}
window.settleOne=(type)=>{
    if(type==='ذهب 730'||type==='ذهب 24'){_openGoldSettleModal(type);return;}
    if(!_applySettle(type))return;
    /* emitEvent داخل _applySettle يستدعي _reproject ← syncBal+updAll+save تلقائياً */
    _renderSettleRows();
    toast(`✅ تم تصفية ${type} مع ${_settleCustomer}`);
};
window.settleAll=()=>{
    const types=['دينار','دولار','ذهب 730','ذهب 24'];
    let done=0;
    types.forEach(t=>{const ok=_applySettle(t);if(ok)done++;});
    /* emitEvent داخل _applySettle يستدعي _reproject ← syncBal+updAll+save تلقائياً */
    _renderSettleRows();
    if(done)toast(`✅ تم تصفية جميع أرصدة ${_settleCustomer}`);
    else toast('لا توجد أرصدة','info');
};

/* ═══════════ GOLD SETTLE WITH PRICE + INVOICE ═══════════ */
let _gsType='',_gsNet=0,_gsCustomer='',_gsForceBuy=false,_gsForceSell=false;

function _ensureGoldSettleModal(){
    if(document.getElementById('goldSettleModal'))return;
    const div=document.createElement('div');
    div.id='goldSettleModal';
    div.className='modal-overlay';
    div.innerHTML=`
    <div class="modal-box" style="max-width:340px">
        <div class="modal-header">
            <h3 id="gsmTitle" style="font-size:.95rem"></h3>
            <button class="close-btn" onclick="closeModal('goldSettleModal')">✕</button>
        </div>
        <div style="padding:1rem;display:flex;flex-direction:column;gap:.75rem">
            <div style="background:var(--card2);border-radius:8px;padding:.6rem;display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:.78rem;color:var(--t2)">إجمالي الدين</span>
                <strong id="gsmQty" style="color:var(--rd);font-size:1rem"></strong>
            </div>
            <div>
                <label style="font-size:.78rem;color:var(--t2);display:block;margin-bottom:.3rem">كمية التصفية (غ)</label>
                <input id="gsmPartialW" type="text" inputmode="decimal" dir="ltr" placeholder="0,000"
                    style="width:100%;padding:.65rem;border:1.5px solid var(--border);border-radius:8px;font-size:1rem;font-family:inherit;text-align:right;box-sizing:border-box"
                    oninput="liveNum(this);_gsmCalc()" />
            </div>
            <div>
                <label style="font-size:.78rem;color:var(--t2);display:block;margin-bottom:.3rem">سعر الغرام (دج)</label>
                <div style="display:flex;gap:.45rem;margin-bottom:.55rem">
                    <button type="button" id="gsmPaidBtn" onclick="_gsmSetPaid(true)"
                        style="flex:1;padding:.5rem;border-radius:9px;border:1.5px solid var(--gr);background:transparent;color:var(--gr);font-weight:900;font-family:Tajawal,sans-serif;font-size:.78rem;cursor:pointer">✅ خالص<br><small style="font-weight:700;opacity:.75">نقداً من/إلى السيولة الآن</small></button>
                    <button type="button" id="gsmDebtBtn" onclick="_gsmSetPaid(false)"
                        style="flex:1;padding:.5rem;border-radius:9px;border:1.5px solid var(--g600);background:rgba(217,119,6,.12);color:var(--g600);font-weight:900;font-family:Tajawal,sans-serif;font-size:.78rem;cursor:pointer">📋 غير خالص<br><small style="font-weight:700;opacity:.75">يُسجَّل في الديون</small></button>
                </div>
                                <input id="gsmPrice" type="text" inputmode="numeric" dir="ltr" placeholder="مثال: 12 500"
                    style="width:100%;padding:.65rem;border:1.5px solid var(--border);border-radius:8px;font-size:1rem;font-family:inherit;text-align:right;box-sizing:border-box"
                    oninput="liveNum(this);_gsmCalc()" />
            </div>
            <div id="gsmTotalBox" style="display:none;background:var(--card2);border-radius:8px;padding:.6rem;display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:.78rem;color:var(--t2)">المجموع</span>
                <strong id="gsmTotal" style="color:var(--g600);font-size:1rem"></strong>
            </div>
            <button class="bg" style="width:100%;padding:.75rem;font-size:.95rem" onclick="_gsmConfirm()">✅ تأكيد وحفظ الفاتورة</button>
        </div>
    </div>`;
    document.body.appendChild(div);
}

function _openGoldSettleModal(type,forceBuy,forceSell){
    const net=debts.filter(x=>x.c===_settleCustomer&&x.type===type).reduce((s,x)=>s+(x.a||0),0);
    if(Math.abs(net)<0.001&&!forceBuy&&!forceSell){toast('لا توجد أرصدة','info');return;}
    _ensureGoldSettleModal();
    _gsType=type; _gsNet=net; _gsCustomer=_settleCustomer; _gsForceBuy=!!forceBuy; _gsForceSell=!!forceSell;
    const isBuy=forceSell?false:(forceBuy?true:(net<0));
    const icon=isBuy?'🛒':'💰';
    const action=isBuy?'شراء':'بيع';
    document.getElementById('gsmTitle').textContent=`${icon} ${action} ${type} — ${_settleCustomer}`;
    const _free=(forceBuy||forceSell)&&Math.abs(net)<0.001;
    document.getElementById('gsmQty').textContent=_free?(forceSell?'بيع حر':'شراء حر'):fmt(Math.abs(net),2)+' غ';
    document.getElementById('gsmPartialW').value=_free?'':Math.abs(net).toFixed(2).replace('.',',');
    document.getElementById('gsmPrice').value='';
    window._gsmPaid=false; if(typeof _gsmSetPaid==='function')_gsmSetPaid(false);
    document.getElementById('gsmTotalBox').style.display='none';
    document.getElementById('goldSettleModal').classList.add('active');
    setTimeout(()=>document.getElementById('gsmPartialW').focus(),320);
}

window._gsmCalc=function(){
    const ppg=readNum('gsmPrice');
    const w=readNum('gsmPartialW')||0;
    const k=_gsType==='ذهب 24'?1000:730;
    const total=w*(k/730)*ppg;
    const box=document.getElementById('gsmTotalBox');
    if(ppg>0&&w>0){
        box.style.display='flex';
        document.getElementById('gsmTotal').textContent=fmt(total,0)+' دج';
        const net=_gsNet, isBuy=_gsForceSell?false:(_gsForceBuy?true:(net<0));
        let prev=document.getElementById('gsmDirPreview');
        if(!prev){prev=document.createElement('div');prev.id='gsmDirPreview';prev.style.cssText='font-size:.72rem;line-height:1.7;background:var(--card2);border-radius:8px;padding:.55rem;margin-top:.1rem';box.parentNode.insertBefore(prev,box.nextSibling);}
        let cashTxt,gTxt;
        if(_gsForceSell){
            cashTxt=window._gsmPaid?`سيدفع لك نقداً الآن <b>${fmt(total,0)} دج</b> (إلى السيولة)`:`الزبون سيدين لك بـ <b>${fmt(total,0)} دج</b>`;
            gTxt=`ستدين له بـ <b>${fmt(w,3)} غ</b> ذهب (لا يُخصم من المخزون)`;
        }else if(_gsForceBuy){
            cashTxt=window._gsmPaid?`ستدفع له نقداً الآن <b>${fmt(total,0)} دج</b> (من السيولة)`:`ستدين للزبون بـ <b>${fmt(total,0)} دج</b>`;
            gTxt=`الزبون سيدين لك <b>${fmt(w,3)} غ</b> ذهب`;
        }else{
            const goldNew=net>0?(net-w):(net+w);
            cashTxt=window._gsmPaid
                ?(isBuy?`ستدفع له نقداً الآن <b>${fmt(total,0)} دج</b> (من السيولة)`:`سيدفع لك نقداً الآن <b>${fmt(total,0)} دج</b> (إلى السيولة)`)
                :(isBuy?`ستدين للزبون بـ <b>${fmt(total,0)} دج</b>`:`الزبون سيدين لك بـ <b>${fmt(total,0)} دج</b>`);
            gTxt=Math.abs(goldNew)<0.001?'رصيد الذهب: صفر':(goldNew>0?`الزبون سيدين لك <b>${fmt(Math.abs(goldNew),3)} غ</b> ذهب`:`ستدين للزبون <b>${fmt(Math.abs(goldNew),3)} غ</b> ذهب`);
        }
        prev.innerHTML=`💵 ${cashTxt}<br>👑 ${gTxt}`;
    }else{
        box.style.display='none';
        const prev=document.getElementById('gsmDirPreview'); if(prev)prev.innerHTML='';
    }
};

window._gsmConfirm=function(){
    const ppg=readNum('gsmPrice');
    if(!ppg||ppg<=0){toast('⚠️ أدخل سعر الغرام','error');return;}
    const w=readNum('gsmPartialW');
    if(!w||w<=0){toast('⚠️ أدخل كمية التصفية','error');return;}
    const type=_gsType, net=_gsNet, c=_gsCustomer;
    if(w<0.001){closeModal('goldSettleModal');return;}
    const isBuy=_gsForceSell?false:(_gsForceBuy?true:(net<0));
    const k=type==='ذهب 24'?1000:730;
    const eq730=w*(k/730);
    const total=Math.round(eq730*ppg);
    const prevBal=getCustBal(c,'دينار');
    const iid='INV-'+uid();
    /* شراء حر: أنا مدين للزبون نقداً (−). بيع حر: الزبون مدين لي نقداً (+) */
    const cashTotal=_gsForceSell?total:(_gsForceBuy?-total:(isBuy?-total:total));
    const settledAmt=isBuy?-w:w;
    const remaining=_gsForceSell?0:parseFloat((Math.abs(net)-w).toFixed(4));
    const item={w,k,ppg,eq730,total,is1000:k===1000,sbt:type==='ذهب 24'?'24':'730'};
    const _inv={
        id:iid,c,t:isBuy?'buy':'sell',ps:(window._gsmPaid?'full':'debt'),
        dt:new Date().toLocaleDateString('fr-FR'),
        items:[item],tp:total,akhd:0,prevBal,
        note:_gsForceSell?'بيع ذهب للزبون':(_gsForceBuy?'شراء ذهب من الزبون':(remaining>0.001?`تصفية جزئية (باقٍ ${fmt(remaining,3)} غ)`:'تصفية ديون'))
    };
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    emitEvent('SETTLE_GSM',
        {c,type,net,isBuy,cashTotal,remaining,w,k,ppg,iid,freeBuy:_gsForceBuy,freeSell:_gsForceSell,paid:!!window._gsmPaid},
        {invoice:_inv,op:{c,t:_gsForceSell?'بيع':(_gsForceBuy?'شراء':(isBuy?'شراء بسعر':'بيع بسعر')),m:type,a:settledAmt,_ts:Date.now(),dt:nowStr,cashSettle:true,iid,cashTotal,partial:remaining>0.001,ppg,eqW:w,cashVal:Math.abs(total),paid:!!window._gsmPaid}}
    );
    closeModal('goldSettleModal');
    if(typeof _sendCustomerPush==='function')_sendCustomerPush(_settleCustomer,'تسوية حساب','سُجّلت حركة على حسابك — افتح حسابك للاطلاع');
    _renderSettleRows();
    const msg=remaining>0.001
        ?`✅ تم تصفية ${fmt(w,3)} غ — الباقي: ${fmt(remaining,3)} غ`
        :`✅ تم تصفية ${type} مع ${c} وحفظ الفاتورة`;
    toast(msg);
};

/* ═══════════ تسوية ذهب 730 بـ ذهب 24 (تحويل بالعيار) ═══════════ */
window.settle730With24=function(){
    const net=debts.filter(x=>x.c===_settleCustomer&&x.type==='ذهب 730').reduce((s,x)=>s+(x.a||0),0);
    if(Math.abs(net)<0.001){toast('لا يوجد دين ذهب 730','info');return;}
    const w730=Math.abs(net);
    const avail24=g24.reduce((s,b)=>s+(b.w||0),0);
    _ensureSettle730Modal();
    document.getElementById('s730cName').textContent=_settleCustomer;
    document.getElementById('s730cDir').textContent=net>0?'تسالو':'يسالك';
    document.getElementById('s730cW730').textContent=fmt(w730,3)+' غ';
    document.getElementById('s730cAvail').textContent=fmt(avail24,2)+' غ';
    document.getElementById('s730cPartial').value=(+w730).toFixed(2).replace('.',',');
    _s730cCalcEquiv();
    document.getElementById('s730cModal').classList.add('active');
    setTimeout(()=>document.getElementById('s730cPartial').focus(),320);
};
function _ensureSettle730Modal(){
    if(document.getElementById('s730cModal'))return;
    const div=document.createElement('div');
    div.id='s730cModal';div.className='modal-overlay';
    div.innerHTML=`
    <div class="modal-box" style="max-width:320px">
        <div class="modal-header">
            <h3 style="font-size:.9rem">🔄 تسوية ذهب 730 بـ ذهب 24</h3>
            <button class="close-btn" onclick="closeModal('s730cModal')">✕</button>
        </div>
        <div style="padding:1rem;display:flex;flex-direction:column;gap:.65rem">
            <div style="background:var(--card2);border-radius:8px;padding:.75rem;display:grid;grid-template-columns:auto 1fr;gap:.45rem .9rem;font-size:.82rem;align-items:center">
                <span style="color:var(--t2)">الزبون</span><strong id="s730cName"></strong>
                <span style="color:var(--t2)">الاتجاه</span><span id="s730cDir" style="color:#f59e0b;font-weight:700"></span>
                <span style="color:var(--t2)">إجمالي دين 730</span><strong id="s730cW730" style="color:#ef4444"></strong>
                <span style="color:var(--t2)">متاح بمخزون 24</span><strong id="s730cAvail" style="color:#16a34a"></strong>
            </div>
            <div>
                <label style="font-size:.78rem;color:var(--t2);display:block;margin-bottom:.3rem">كمية التصفية (معيار 730)</label>
                <input id="s730cPartial" type="text" inputmode="decimal" dir="ltr" placeholder="0,000"
                    style="width:100%;padding:.65rem;border:1.5px solid var(--border);border-radius:8px;font-size:1rem;font-family:inherit;text-align:right;box-sizing:border-box"
                    oninput="liveNum(this);_s730cCalcEquiv()" />
            </div>
            <div style="background:var(--card2);border-radius:8px;padding:.6rem;display:flex;justify-content:space-between;align-items:center">
                <span style="font-size:.78rem;color:var(--t2)">مكافئ 24k يُخصم</span>
                <strong id="s730cEquiv" style="color:#d97706;font-size:1rem"></strong>
            </div>
            <div style="font-size:.74rem;color:var(--t3);text-align:center;line-height:1.5;background:rgba(217,119,6,.07);border-radius:6px;padding:.45rem">
                المكافئ = كمية التصفية × (730 ÷ 1000)<br>يُخصم من مخزون الـ24 والباقي يبقى ديناً
            </div>
            <button class="bg" style="width:100%;padding:.7rem;font-size:.93rem" onclick="_confirm730With24()">✅ تأكيد التسوية</button>
        </div>
    </div>`;
    document.body.appendChild(div);
}
window._s730cCalcEquiv=function(){
    let partial=readNum('s730cPartial')||0;
    const eq=parseFloat((partial*730/1000).toFixed(3));
    const el=document.getElementById('s730cEquiv');
    if(el) el.textContent=fmt(eq,3)+' غ';
};
window._confirm730With24=function(){
    let partial=readNum('s730cPartial');
    if(!partial||partial<=0){toast('⚠️ أدخل كمية التصفية','error');return;}
    const net=debts.filter(x=>x.c===_settleCustomer&&x.type==='ذهب 730').reduce((s,x)=>s+(x.a||0),0);
    if(Math.abs(net)<0.001){closeModal('s730cModal');return;}
    /* تسامح تقريب العرض: الدين الفعلي 754,0151 يُعرض 754,02 — نقبل ونقصّ على الفعلي */
    if(partial>Math.abs(net)+0.011){toast(`⚠️ الكمية أكبر من الدين (${fmt(Math.abs(net),2)} غ)`,'error');return;}
    if(partial>Math.abs(net))partial=Math.abs(net);
    const equiv24=parseFloat((partial*730/1000).toFixed(3));
    const avail24=g24.reduce((s,b)=>s+(b.w||0),0);
    if(avail24<equiv24-0.001){toast(`⚠️ مخزون الـ24 غير كافٍ — متاح: ${fmt(avail24,2)} غ — مطلوب: ${fmt(equiv24,3)} غ`,'error');return;}
    const {barsRemove,barUpdates,out24}=_pickBarsToRemove('24',equiv24);
    const remaining=parseFloat((Math.abs(net)-partial).toFixed(4));
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    emitEvent('SETTLE_730_24',
        {c:_settleCustomer,partial,net,equiv24,remaining,barsRemove,barUpdates},
        {op:{c:_settleCustomer,t:'تصفية',m:'ذهب 730',a:net>0?partial:-partial,_ts:Date.now(),dt:nowStr,crossKarat:true,paid24:equiv24,partial:remaining>0.001}}
    );
    closeModal('s730cModal');
    _renderSettleRows();
    const msg=remaining>0.001
        ?`✅ تم: ${fmt(partial,3)} غ 730 ← ${fmt(equiv24,3)} غ 24 — الباقي: ${fmt(remaining,3)} غ`
        :`✅ تم: ${fmt(partial,3)} غ 730 ← ${fmt(equiv24,3)} غ 24 خُصمت من المخزون`;
    toast(msg);
};

/* ═══════════ تسوية ذهب 24 من المخزون مباشرة ═══════════ */
window.settle24FromInv=function(){
    const net=debts.filter(x=>x.c===_settleCustomer&&x.type==='ذهب 24').reduce((s,x)=>s+(x.a||0),0);
    if(Math.abs(net)<0.001){toast('لا يوجد دين ذهب 24','info');return;}
    const w=Math.abs(net);
    const avail24=g24.reduce((s,b)=>s+(b.w||0),0)+((B&&B.vg24)||0);
    const isGiving=net<0;
    _ensure24InvModal();
    document.getElementById('i24cName').textContent=_settleCustomer;
    document.getElementById('i24cW').textContent=fmt(w,3)+' غ';
    const _d24el=document.getElementById('i24cDir');
    _d24el.textContent=isGiving?'تعطيه ← يخرج من المخزون':'يعطيك ← يدخل المخزون';
    _d24el.style.color=isGiving?'#ef4444':'#16a34a';
    document.getElementById('i24cAvail').textContent=fmt(avail24,2)+' غ';
    document.getElementById('i24cPartial').value=(+w).toFixed(2).replace('.',',');
    document.getElementById('i24cModal').classList.add('active');
    setTimeout(()=>document.getElementById('i24cPartial').focus(),320);
};
function _ensure24InvModal(){
    if(document.getElementById('i24cModal'))return;
    const div=document.createElement('div');
    div.id='i24cModal';div.className='modal-overlay';
    div.innerHTML=`
    <div class="modal-box" style="max-width:320px">
        <div class="modal-header">
            <h3 style="font-size:.9rem">📦 تسوية ذهب 24 من المخزون</h3>
            <button class="close-btn" onclick="closeModal('i24cModal')">✕</button>
        </div>
        <div style="padding:1rem;display:flex;flex-direction:column;gap:.65rem">
            <div style="background:var(--card2);border-radius:8px;padding:.75rem;display:grid;grid-template-columns:auto 1fr;gap:.45rem .9rem;font-size:.82rem;align-items:center">
                <span style="color:var(--t2)">الزبون</span><strong id="i24cName"></strong>
                <span style="color:var(--t2)">إجمالي الدين</span><strong id="i24cW" style="color:#ef4444"></strong>
                <span style="color:var(--t2)">الاتجاه</span><strong id="i24cDir"></strong>
                <span style="color:var(--t2)">مخزون الـ24</span><strong id="i24cAvail" style="color:#16a34a"></strong>
            </div>
            <div>
                <label style="font-size:.78rem;color:var(--t2);display:block;margin-bottom:.3rem">كمية التصفية (غ)</label>
                <input id="i24cPartial" type="text" inputmode="decimal" dir="ltr" placeholder="0,000"
                    style="width:100%;padding:.65rem;border:1.5px solid var(--border);border-radius:8px;font-size:1rem;font-family:inherit;text-align:right;box-sizing:border-box"
                    oninput="liveNum(this)" />
            </div>
            <div style="font-size:.74rem;color:var(--t3);text-align:center;line-height:1.5;background:rgba(59,130,246,.07);border-radius:6px;padding:.45rem">
                تسوية فيزيائية — يُعدَّل مخزون الـ24 والباقي يبقى ديناً
            </div>
            <button class="bg" style="width:100%;padding:.7rem;font-size:.93rem" onclick="_confirm24FromInv()">✅ تأكيد التسوية</button>
        </div>
    </div>`;
    document.body.appendChild(div);
}
window._confirm24FromInv=function(){
    let partial=readNum('i24cPartial');
    if(!partial||partial<=0){toast('⚠️ أدخل كمية التصفية','error');return;}
    const net=debts.filter(x=>x.c===_settleCustomer&&x.type==='ذهب 24').reduce((s,x)=>s+(x.a||0),0);
    if(Math.abs(net)<0.001){closeModal('i24cModal');return;}
    /* تسامح تقريب العرض: الدين الفعلي 754,0151 يُعرض 754,02 — نقبل ونقصّ على الفعلي */
    if(partial>Math.abs(net)+0.011){toast(`⚠️ الكمية أكبر من الدين (${fmt(Math.abs(net),2)} غ)`,'error');return;}
    if(partial>Math.abs(net))partial=Math.abs(net);
    const physSum=g24.reduce((s,b)=>s+(b.w||0),0);
    const virt=(B&&B.vg24)||0;
    const isGiving=net<0;
    if(isGiving&&physSum+virt<partial-0.001){toast(`⚠️ رصيد الـ24 غير كافٍ — متاح: ${fmt(physSum+virt,2)} غ (سبائك ${fmt(physSum,2)} + بيع ${fmt(virt,2)})`,'error');return;}
    let barsRemove=[],barUpdates=[],barsAdd=[],v24Out=0,_settleOut24=0;
    const dt=new Date().toLocaleDateString('fr-FR');
    const dispBars={};
    if(isGiving){
        /* فيزيائي أولاً ثم من ذهب البيع الافتراضي */
        const physOut=Math.min(partial,physSum);
        v24Out=parseFloat((partial-physOut).toFixed(4));
        if(physOut>0.0001){
            const r=_pickBarsToRemove('24',physOut);
            barsRemove=r.barsRemove;barUpdates=r.barUpdates;_settleOut24=r.out24||0;
        }
    }else{
        const bid=uid();
        barsAdd=[{id:bid,pool:'24',w:partial,k:1000}];
        dispBars[bid]={desc:`استلام من ${_settleCustomer}`,dt,src:'تصفية'};
    }
    const remaining=parseFloat((Math.abs(net)-partial).toFixed(4));
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    emitEvent('SETTLE_24_INV',
        {c:_settleCustomer,partial,net,remaining,isGiving,v24Out:v24Out||undefined,...(_settleOut24>0?{out24:_settleOut24}:{}),barsRemove,barUpdates,barsAdd},
        {bars:Object.keys(dispBars).length?dispBars:undefined,
         op:{c:_settleCustomer,t:'تصفية',m:'ذهب 24',a:net>0?partial:-partial,_ts:Date.now(),dt:nowStr,fromInv:true,partial:remaining>0.001}}
    );
    closeModal('i24cModal');
    _renderSettleRows();
    const msg=remaining>0.001
        ?`✅ تم: ${fmt(partial,3)} غ ${isGiving?'خُصمت':'أُضيفت'} — الباقي: ${fmt(remaining,3)} غ`
        :`✅ تم: ${fmt(partial,3)} غ ذهب 24 ${isGiving?'خُصمت من المخزون':'أُضيفت للمخزون'}`;
    toast(msg);
};

/* ═══════════ استلام ذهب 730 فيزيائي لتسوية الدين ═══════════ */
let _rs730Net=0;
window.receiveSettle730=function(){
    const net=debts.filter(x=>x.c===_settleCustomer&&x.type==='ذهب 730').reduce((s,x)=>s+(x.a||0),0);
    if(net<=0.001){toast('لا يوجد دين ذهب 730 للاستلام','info');return;}
    _rs730Net=net;
    _ensureReceive730Modal();
    document.getElementById('rs730cName').textContent=_settleCustomer;
    document.getElementById('rs730cDebt').textContent=fmt(net,3)+' غ (معيار 730)';
    /* أسطر جديدة فارغة — بلا اقتراح عيار */
    const box=document.getElementById('rs730Rows'); if(box)box.innerHTML='';
    _rs730AddRow(false);
    _rs730Calc();
    document.getElementById('rs730Modal').classList.add('active');
    setTimeout(()=>{const f=document.querySelector('#rs730Rows .rs730W'); if(f)f.focus();},320);
};
function _ensureReceive730Modal(){
    if(document.getElementById('rs730Modal'))return;
    const div=document.createElement('div');
    div.id='rs730Modal';div.className='modal-overlay';
    div.innerHTML=`
    <div class="modal-box" style="max-width:340px">
        <div class="modal-header">
            <h3 style="font-size:.9rem">📥 استلام ذهب 730 (تسوية دين)</h3>
            <button class="close-btn" onclick="closeModal('rs730Modal')">✕</button>
        </div>
        <div style="padding:1rem;display:flex;flex-direction:column;gap:.65rem">
            <div style="background:var(--card2);border-radius:8px;padding:.75rem;display:grid;grid-template-columns:auto 1fr;gap:.45rem .9rem;font-size:.82rem;align-items:center">
                <span style="color:var(--t2)">الزبون</span><strong id="rs730cName"></strong>
                <span style="color:var(--t2)">إجمالي الدين (معيار 730)</span><strong id="rs730cDebt" style="color:#ef4444"></strong>
            </div>
            <div>
                <label style="font-size:.78rem;color:var(--t2);display:block;margin-bottom:.3rem">السبائك المُستلَمة (الوزن + العيار)</label>
                <div id="rs730Rows" style="display:flex;flex-direction:column;gap:.4rem"></div>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(16,185,129,.09);border-radius:8px;padding:.5rem .7rem;font-size:.82rem">
                <span style="color:var(--t2);font-weight:700">المجموع (معيار 730)</span>
                <strong id="rs730Total" style="color:#16a34a">0,000 غ</strong>
            </div>
            <div style="font-size:.74rem;color:var(--t3);text-align:center;line-height:1.5;background:rgba(16,185,129,.07);border-radius:6px;padding:.45rem">
                مكافئ كل سبيكة = الوزن × العيار ÷ 730<br>السبائك تُضاف للمخزون بأوزانها، والباقي يبقى ديناً
            </div>
            <button class="bg" style="width:100%;padding:.7rem;font-size:.93rem" onclick="_confirmReceive730()">✅ تأكيد الاستلام</button>
        </div>
    </div>`;
    document.body.appendChild(div);
}
/* ═══ أسطر قبض 730: تزيد تلقائياً، بلا اقتراح عيار ═══ */
window._rs730AddRow=function(focus){
    const box=document.getElementById('rs730Rows'); if(!box)return;
    const i=box.children.length;
    const row=document.createElement('div');
    row.style.cssText='display:flex;gap:.4rem;align-items:center';
    row.innerHTML=`
        <input type="text" inputmode="decimal" dir="ltr" placeholder="الوزن" class="rs730W"
            style="flex:1.3;padding:.6rem;border:1.5px solid var(--border);border-radius:8px;font-size:.95rem;font-family:inherit;text-align:right;box-sizing:border-box"
            oninput="liveNum(this);_rs730Sync(this)">
        <input type="number" inputmode="numeric" placeholder="العيار" min="100" max="1000" class="rs730K"
            style="flex:1;padding:.6rem;border:1.5px solid var(--border);border-radius:8px;font-size:.95rem;font-family:inherit;text-align:center;box-sizing:border-box"
            oninput="_rs730Sync(this)">
        <button type="button" onclick="this.parentNode.remove();_rs730Calc()" title="حذف السطر"
            style="flex:0 0 auto;width:28px;height:28px;border:none;border-radius:7px;background:rgba(239,68,68,.12);color:#ef4444;font-weight:900;cursor:pointer;${i===0?'visibility:hidden':''}">✕</button>`;
    box.appendChild(row);
    if(focus)row.querySelector('.rs730W').focus();
};
/* عند ملء آخر سطر → أضف سطراً جديداً تلقائياً */
window._rs730Sync=function(el){
    const box=document.getElementById('rs730Rows'); if(!box)return;
    const rows=[...box.children];
    const last=rows[rows.length-1];
    if(last&&last.contains(el)){
        const w=parseFloat(String(last.querySelector('.rs730W').value||'').replace(',','.'))||0;
        const k=parseFloat(last.querySelector('.rs730K').value)||0;
        if(w>0&&k>0)_rs730AddRow(false);
    }
    _rs730Calc();
};
window._rs730Calc=function(){
    const box=document.getElementById('rs730Rows');
    let eq=0;
    if(box)[...box.children].forEach(r=>{
        const w=parseFloat(String(r.querySelector('.rs730W').value||'').replace(',','.'))||0;
        const k=parseFloat(r.querySelector('.rs730K').value)||0;
        if(w>0&&k>0)eq+=w*k/730;
    });
    const t=document.getElementById('rs730Total');
    if(t)t.textContent=fmt(eq,3)+' غ';
    window._rs730Eq=parseFloat(eq.toFixed(4));
    return eq;
};
window._rs730Bars=function(){
    const box=document.getElementById('rs730Rows'); const out=[];
    if(box)[...box.children].forEach(r=>{
        const w=parseFloat(String(r.querySelector('.rs730W').value||'').replace(',','.'))||0;
        const k=parseFloat(r.querySelector('.rs730K').value)||0;
        if(w>0&&k>0)out.push({w:parseFloat(w.toFixed(3)),k});
    });
    return out;
};
window._confirmReceive730=function(){
    const bars=_rs730Bars();
    if(!bars.length){toast('⚠️ أدخل وزن وعيار سبيكة واحدة على الأقل','error');return;}
    const bad=bars.find(b=>b.k<100||b.k>1000);
    if(bad){toast('⚠️ عيار غير صالح: '+bad.k,'error');return;}
    let partial=parseFloat(bars.reduce((s,b)=>s+b.w*b.k/730,0).toFixed(4));
    const net=debts.filter(x=>x.c===_settleCustomer&&x.type==='ذهب 730').reduce((s,x)=>s+(x.a||0),0);
    if(net<=0.001){closeModal('rs730Modal');return;}
    if(partial>net+0.011){toast(`⚠️ المجموع (${fmt(partial,3)} غ) أكبر من الدين (${fmt(net,2)} غ)`,'error');return;}
    if(partial>net)partial=net;
    const dt=new Date().toLocaleDateString('fr-FR');
    const barsAdd=[],dispBars={};
    bars.forEach(b=>{
        const bid=uid();
        barsAdd.push({id:bid,pool:'730',w:b.w,k:b.k});
        dispBars[bid]={desc:`استلام تصفية من ${_settleCustomer}`,dt,src:'تصفية'};
    });
    const totW=parseFloat(bars.reduce((s,b)=>s+b.w,0).toFixed(3));
    const uniK=bars.every(b=>b.k===bars[0].k)?bars[0].k:0;
    const remaining=parseFloat((net-partial).toFixed(4));
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    /* وصل قبض 730 ← فاتورة تظهر للزبون في حسابه (نفس الحدث — حذفه يُسقطها) */
    const _recvInv={id:'INV-'+uid(),c:_settleCustomer,t:'buy',recv:true,ps:'full',dt,
        items:bars.map(b=>({w:b.w,k:b.k,is1000:false,price:0,total:0})),
        tp:0,akhd:0,prevBal:getCustBal(_settleCustomer,'دينار')};
    emitEvent('SETTLE_730_REC',
        {c:_settleCustomer,partial,net,k:uniK||undefined,reqW:totW,remaining,barsAdd,recBars:bars,iid:_recvInv.id},
        {invoice:_recvInv,bars:dispBars,op:{c:_settleCustomer,t:'تصفية',m:'ذهب 730',a:partial,_ts:Date.now(),dt:nowStr,receivePhysical:true,actualW:totW,actualK:uniK||undefined,nBars:bars.length,iid:_recvInv.id,partial:remaining>0.001}}
    );
    closeModal('rs730Modal');
    _renderSettleRows();
    toast(remaining>0.001
        ? `✅ استُلمت ${bars.length} سبيكة (${fmt(totW,3)} غ) — الباقي: ${fmt(remaining,3)} غ معيار 730`
        : `✅ استُلمت ${bars.length} سبيكة (${fmt(totW,3)} غ) من ${_settleCustomer} — أُضيفت للمخزون`);
};

/* ═══════════ ARCHIVE ═══════════ */
let _archiveFilter='all';
window.setArchiveFilter=(f)=>{ _archiveFilter=f; renderArchive(); };
function _renderArchiveChips(){
    const bar=document.getElementById('archFilterBar'); if(!bar)return;
    const chips=[['all','📋 الكل'],['buy','🟢 شراء'],['sell','🔴 بيع'],['recv','📥 قبض 730'],['raf','🔥 رافيناج'],['doll','💲 دولار'],['dubai','🏙️ دبي']];
    bar.innerHTML=chips.map(([k,l])=>{
        const on=_archiveFilter===k;
        return `<button onclick="setArchiveFilter('${k}')" style="white-space:nowrap;padding:.35rem .75rem;border-radius:999px;border:1.5px solid var(--g600);font-size:.76rem;font-weight:800;cursor:pointer;font-family:inherit;${on?'background:var(--g600);color:#fff':'background:transparent;color:var(--g600)'}">${l}</button>`;
    }).join('');
}
/* آخر سعر بيع دولار فعلي (من فواتير الدولار) — لتقييم دولار دبي بالدينار.
   يُفضّل على سعر الإعدادات لأنه السعر الذي ستبيع به دولارك فعلاً. */
window._lastDollarSellRate=function(beforeTs){
    try{
        const sells=(dollInvoices||[]).filter(d=>d && d.isBuy===false && (+d.r>0));
        if(!sells.length)return 0;
        /* رتّب بالتاريخ تنازلياً، خذ أحدث بيع (قبل beforeTs إن حُدّد) */
        const _ts=d=>{ const m=String(d.dt||'').match(/(\d{2})\/(\d{2})\/(\d{4})/); return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():0; };
        let cand=sells;
        if(beforeTs)cand=sells.filter(d=>_ts(d)<=beforeTs);
        if(!cand.length)cand=sells;
        cand.sort((a,b)=>_ts(b)-_ts(a));
        return +cand[0].r||0;
    }catch(e){return 0;}
};

function renderArchive(){
    const empty='<div style="text-align:center;padding:1.5rem;color:var(--t3);font-size:.8rem"><i class="fas fa-folder-open"></i> لا توجد سجلات</div>';
    _renderArchiveChips();
    const f=_archiveFilter;
    const _sec=(id,vis)=>{const e=document.getElementById(id);if(e)e.style.display=vis?'':'none';};
    _sec('archSec-gold', f==='all'||f==='buy'||f==='sell'||f==='recv');
    _sec('archSec-raf',  f==='all'||f==='raf');
    _sec('archSec-doll', f==='all'||f==='doll');
    _sec('archSec-dubai',f==='all'||f==='dubai');
    /* ═══ فلترة التاريخ (يوم أو شهر) — مثل سجل المعاملات ═══ */
    const _day=document.getElementById('archDay')?.value||'';      /* yyyy-mm-dd */
    const _month=document.getElementById('archMonth')?.value||'';  /* yyyy-mm */
    const _dateOK=(inv)=>{
        if(!_day&&!_month)return true;
        const t=inv._ts||inv.ts||0;
        if(_day){
            const p=_day.split('-').map(Number);
            const start=new Date(p[0],p[1]-1,p[2],0,0,0,0).getTime(), end=start+86400000;
            if(t)return t>=start&&t<end;
            /* احتياط للفواتير القديمة بلا _ts: طابق يوم/شهر نصياً (dd/mm/yyyy أو dd-mm) */
            const dd=String(p[2]).padStart(2,'0'),mm=String(p[1]).padStart(2,'0'),s=String(inv.dt||'');
            return s.includes(dd+'/'+mm)||s.startsWith(dd+'/')||s.startsWith(dd+'-'+mm)||s.startsWith(dd+' ');
        }
        if(_month){
            const p=_month.split('-').map(Number);
            const start=new Date(p[0],p[1]-1,1,0,0,0,0).getTime(), end=new Date(p[0],p[1],1,0,0,0,0).getTime();
            if(t)return t>=start&&t<end;
            const mm=String(p[1]).padStart(2,'0'),yy=String(p[0]),s=String(inv.dt||'');
            return s.includes('/'+mm+'/'+yy)||s.includes('-'+mm+'-'+yy)||s.includes('/'+mm+'/')||s.includes(mm+'/'+yy);
        }
        return true;
    };
    /* فواتير الشراء/البيع */
    const _q=String(window._archQ||'').trim().replace(/\s+/g,' ');
    const _byC=arr=>{ let r=_q?arr.filter(x=>String(x.c||'').includes(_q)):arr; return r.filter(_dateOK); };
    const _si=document.getElementById('archSearch');
    if(_si&&_si.value!==String(window._archQ||''))_si.value=window._archQ||'';
    /* بطاقة إجمالية تتغيّر مع الفلترة: مجموع رئيسي + متوسط/صادر تحته بخط صغير */
    const _sumCard=(mainLabel,mainVal,subLabel,subVal,color)=>
        '<div style="background:'+color+'14;border:1.5px solid '+color+';border-radius:12px;padding:.6rem .8rem;margin:.3rem 0 .6rem;text-align:center">'
        +'<div style="font-size:.66rem;color:var(--t2);font-weight:800;margin-bottom:.15rem">'+mainLabel+'</div>'
        +'<div style="font-size:1.1rem;font-weight:900;color:'+color+'">'+mainVal+'</div>'
        +(subVal?'<div style="font-size:.66rem;color:var(--t2);font-weight:700;margin-top:.2rem">'+subLabel+': <b style="color:'+color+'">'+subVal+'</b></div>':'')
        +'</div>';

    const goldList=_byC(f==='buy'?invoices.filter(i=>i.t==='buy'&&!i.recv)
                 :f==='sell'?invoices.filter(i=>i.t==='sell')
                 :f==='recv'?invoices.filter(i=>i.recv)
                 :invoices);
    /* بطاقة الذهب (شراء/بيع/قبض): مجموع الوزن الخام + متوسط السعر الصحيح.
       المتوسط = مجموع المبالغ ÷ مجموع الوزن المكافئ 730 (لأن السعر يُحسب على مكافئ 730، لا الوزن الخام). */
    (function(){
        const box=document.getElementById('archiveSummary'); if(!box)return;
        let totW=0, totEq=0, totDz=0;
        goldList.forEach(inv=>{
            (inv.items||[]).forEach(it=>{
                const w=+it.w||0, k=+it.k||730;
                totW+=w;
                totEq+=(+it.eq730||(w*k/730));   /* الوزن المكافئ 730 */
            });
            totDz+=(+inv.tp||0);
        });
        const avg=totEq>0?Math.round(totDz/totEq):0;   /* السعر لكل غرام مكافئ 730 */
        const lbl=f==='buy'?'إجمالي الشراء':f==='sell'?'إجمالي البيع':f==='recv'?'إجمالي القبض':'إجمالي الذهب';
        const col=f==='sell'?'#dc2626':f==='recv'?'#0ea5e9':'#16a34a';
        box.innerHTML=goldList.length?_sumCard(lbl+' — الوزن',fmt(totW,2)+' غ','متوسط السعر',avg>0?fmt(avg,0)+' دج/غ':'—',col):'';
    })();
    document.getElementById('archiveCount').textContent=goldList.length;
    document.getElementById('archiveList').innerHTML=goldList.length?goldList.map(inv=>`
        <div class="saved-card">
            <div>
                <strong>${inv.c}</strong>
                <span style="color:${inv.recv?'#0ea5e9':inv.t==='buy'?'var(--gr)':'var(--rd)'};font-weight:800;margin-right:.25rem">${inv.recv?'قبض 730':inv.t==='buy'?'شراء':'بيع'}</span>
                <span style="color:var(--g600);font-weight:900">${fmt(inv.tp||0,0)} DZD</span>
                <small style="color:var(--t2);display:block">${inv.dt} · ${inv.ps==='full'?'💵 نقداً':'🔖 دين'} · ${(inv.items||[]).length} بند</small>
                ${(()=>{ if(inv.recv)return'';
                    let eq=0,dz=0;(inv.items||[]).forEach(it=>{eq+=(+it.eq730||((+it.w||0)*((+it.k||730)/730)));dz+=(+it.total||0);});
                    if(!(dz>0))dz=+inv.tp||0;
                    const pg=eq>0?Math.round(dz/eq):0;
                    return eq>0?`<small style="color:var(--t3);display:block;font-size:.66rem">⚖️ ${fmt(eq,2)} غ (مكافئ 730) · 🏷️ ${fmt(pg,0)} دج/غ</small>`:'';
                })()}
            </div>
            <div style="display:flex;gap:.3rem">
                <button class="btn-pdf" onclick="cpViewInvoice('inv','${inv.id}')" style="background:rgba(14,165,233,.12);color:#0ea5e9" title="عرض الفاتورة"><i class="fas fa-eye"></i></button>
                ${inv.note?'':`<button class="btn-pdf" onclick="${inv.recv?`editRecvInv('${inv.id}')`:`editInv('${inv.id}')`}" style="background:rgba(124,58,237,.12);color:#7c3aed" title="تعديل"><i class="fas fa-pen"></i></button>`}
                <button class="btn-wa"  onclick="waInv('${inv.id}')"><i class="fab fa-whatsapp"></i></button>
                <button class="btndel" onclick="delInv('${inv.id}')"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>`).join(''):empty;
    /* أرشيف الرافيناج */
    document.getElementById('rafArchiveCount').textContent=rafInvoices.length;
    const _rafL=_byC(rafInvoices);
    (function(){
        const box=document.getElementById('rafSummary'); if(!box)return;
        let totEq=0,totFee=0;
        _rafL.forEach(r=>{ totEq+=(+r.eq24||0); totFee+=(+r.fee||0); });
        box.innerHTML=_rafL.length?_sumCard('إجمالي الخالص',fmt(totEq,2)+' غ','مجموع الأجرة',fmt(totFee,0)+' دج','#c2410c'):'';
    })();
    document.getElementById('rafArchiveList').innerHTML=_rafL.length?_rafL.map(r=>`
        <div class="saved-card">
            <div>
                <strong>${r.c}</strong>
                <span style="color:#c2410c;font-weight:800;margin-right:.25rem">🔥 خالص</span>
                <span style="color:var(--g600);font-weight:900">${fmt(r.eq24||0,2)} غ</span>
                <small style="color:var(--t2);display:block">${r.dt} · ${r.rows.length} قطعة · رافيناج: ${fmt(r.sentW||0,2)} غ</small>
                ${(r.eq24>0&&r.fee>0)?`<small style="color:var(--t3);display:block;font-size:.66rem">🏷️ الأجرة: ${fmt(r.fee,0)} دج · ${fmt(r.fee/r.eq24,0)} دج/غ خالص</small>`:''}
            </div>
            <div style="display:flex;gap:.3rem">
                <button class="btn-pdf" onclick="cpViewInvoice('raf','${r.id}')" style="background:rgba(14,165,233,.12);color:#0ea5e9" title="عرض الفاتورة"><i class="fas fa-eye"></i></button>
                <button class="btn-pdf" onclick="editRafInv('${r.id}')" style="background:rgba(124,58,237,.12);color:#7c3aed" title="تعديل"><i class="fas fa-pen"></i></button>
                <button class="btn-wa"  onclick="waRaf('${r.id}')"><i class="fab fa-whatsapp"></i></button>
                <button class="btndel" onclick="delRaf('${r.id}')"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>`).join(''):empty;
    /* أرشيف الدولار */
    document.getElementById('dollArchiveCount').textContent=dollInvoices.length;
    const _dolL=_byC(dollInvoices);
    (function(){
        const box=document.getElementById('dollSummary'); if(!box)return;
        let totUsd=0,totDin=0;
        _dolL.forEach(d=>{ totUsd+=(+d.a||0); totDin+=(+d.dinar||0); });
        const avg=totUsd>0?Math.round(totDin/totUsd):0;
        box.innerHTML=_dolL.length?_sumCard('إجمالي الدولار',fmt(totUsd,2)+' $','متوسط الصرف',avg>0?fmt(avg,0)+' دج/$':'—','#0369a1'):'';
    })();
    document.getElementById('dollArchiveList').innerHTML=_dolL.length?_dolL.map(d=>`
        <div class="saved-card">
            <div>
                <strong>${d.c}</strong>
                <span style="color:${d.isBuy?'var(--gr)':'#0369a1'};font-weight:800;margin-right:.25rem">${d.isBuy?'شراء $':'بيع $'}</span>
                <span style="color:var(--g600);font-weight:900">${fmt(d.a||0,2)} $</span>
                <small style="color:var(--t2);display:block">${d.dt} · ${fmt(d.dinar||0,0)} دج${d.party?' · '+d.party:''}</small>
            </div>
            <div style="display:flex;gap:.3rem">
                <button class="btn-pdf" onclick="editDoll('${d.id}')" style="background:rgba(124,58,237,.12);color:#7c3aed" title="تعديل"><i class="fas fa-pen"></i></button>
                <button class="btn-pdf" onclick="cpViewInvoice('doll','${d.id}')" style="background:rgba(14,165,233,.12);color:#0ea5e9" title="عرض الفاتورة"><i class="fas fa-eye"></i></button>
                <button class="btn-wa"  onclick="waDoll('${d.id}')"><i class="fab fa-whatsapp"></i></button>
                <button class="btndel" onclick="delDoll('${d.id}')"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>`).join(''):empty;
    /* أرشيف دبي */
    document.getElementById('dubaiArchiveCount').textContent=dubaiInvoices.length;
    const _dubL=_byC(dubaiInvoices);
    (function(){
        const box=document.getElementById('dubaiSummary'); if(!box)return;
        let totUsd=0,totW=0,totDinG_w=0,totDinG_sum=0;
        const _shp=((ops.find(o=>o&&o.t==='شحن'&&(o.su||0)>0)||{}).su)||parseFloat(String(localStorage.getItem('gp12_shiprate')||'').replace(',','.'))||0;
        const _gp=(typeof goldPrice!=='undefined'?goldPrice:0)||0;
        const _ded=_gp*0.001/0.730;   /* خصم خسارة التكرير 1‰ */
        _dubL.forEach(d=>{
            totUsd+=(+d.usd||0); totW+=(+d.w||0);
            /* متوسط سعر الغرام بالدينار (نفس صيغة الفاتورة: شحن + ÷100 + خصم التكرير) */
            if(d.usd>0&&d.w>0){
                const _dts=(()=>{const m=String(d.dt||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():0;})();
                const rt=_lastDollarSellRate(_dts)||(d.rate||0)||dollarRate||0;
                if(rt>0){
                    const eq730=Math.round((d.w/0.730)*10)/10;
                    const gpr=(d.usd-d.w*_shp)*rt/eq730/100;
                    const gprR=Math.round((gpr-_ded)/1000)*1000;
                    totDinG_sum+=gprR*eq730; totDinG_w+=eq730;   /* موزون بالمكافئ */
                }
            }
        });
        const avgDinG=totDinG_w>0?Math.round(totDinG_sum/totDinG_w):0;   /* متوسط دج/غ مرجّح */
        box.innerHTML=_dubL.length?_sumCard('إجمالي دبي — الوزن',fmt(totW,2)+' غ','مجموع $ / متوسط دج للغرام',fmt(totUsd,2)+' $ · '+(avgDinG>0?fmt(avgDinG,0)+' دج/غ':'—'),'#0f766e'):'';
    })();
    document.getElementById('dubaiArchiveList').innerHTML=_dubL.length?_dubL.map(d=>`
        <div class="saved-card">
            <div>
                <strong>${d.c}</strong>
                <span style="color:#0f766e;font-weight:800;margin-right:.25rem">🏙️ دبي</span>
                <span style="color:var(--g600);font-weight:900">${fmt(d.usd||0,2)} $</span>
                <small style="color:var(--t3);display:block;font-size:.66rem">💵 سعر بيع الدولار: ${fmt((()=>{const m=String(d.dt||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);const ts=m?new Date(+m[3],+m[2]-1,+m[1]).getTime():0;return _lastDollarSellRate(ts)||(d.rate||0)||dollarRate||0;})(),0)} · ${fmt((d.w||0)>0?(d.usd/d.w):0,2)} $/غ</small>
                <small style="color:var(--t2);display:block">${d.dt} · ${fmt(d.w||0,2)} غ · شاشة ${fmt(d.sp||0,2)}${d.disc?' · خصم '+fmt(d.disc,2):''}${(()=>{
                    if(!(d.usd>0&&d.w>0))return'';
                    /* سعر الدولار: آخر بيع دولار وقت الفاتورة (لا سعر الإعدادات) */
                    const _dts=(()=>{const m=String(d.dt||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():0;})();
                    const rt=_lastDollarSellRate(_dts)||(d.rate||0)||dollarRate||0;
                    if(!(rt>0))return'';
                    /* الشحن ($/غ): آخر فاتورة شحن ← وإلا حقل الإعدادات */
                    const shp=((ops.find(o=>o&&o.t==='شحن'&&(o.su||0)>0)||{}).su)
                        ||parseFloat(String(localStorage.getItem('gp12_shiprate')||'').replace(',','.'))||0;
                    /* السعر لكل 100$ ← ÷100 */
                    const gpr=(d.usd-d.w*shp)*rt/(Math.round((d.w/0.730)*10)/10)/100;
                    /* خصم خسارة التكرير 1‰: (الوزن×0,001 ÷0,730)×سعر الذهب ÷الوزن = سعر الذهب×0,001÷0,730 */
                    const _gp=(typeof goldPrice!=='undefined'?goldPrice:0)||0;
                    const ded=_gp*0.001/0.730;
                    const gprR=Math.round((gpr-ded)/1000)*1000;
                    return` · <b style="color:var(--g600)">⚖️ ${gprR.toLocaleString('fr-FR')} دج/غ${shp>0?'':' <small style="color:#ef4444">(بلا شحن)</small>'}</b>`;})()}</small>
            </div>
            <div style="display:flex;gap:.3rem">
                <button class="btn-pdf" onclick="editDubInv('${d.id}')" style="background:rgba(124,58,237,.12);color:#7c3aed" title="تعديل"><i class="fas fa-pen"></i></button>
                <button class="btn-pdf" onclick="cpViewInvoice('dubai','${d.id}')" style="background:rgba(14,165,233,.12);color:#0ea5e9" title="عرض الفاتورة"><i class="fas fa-eye"></i></button>
                <button class="btn-wa"  onclick="waDubai('${d.id}')"><i class="fab fa-whatsapp"></i></button>
                <button class="btndel" onclick="delDubai('${d.id}')"><i class="fas fa-trash-alt"></i></button>
            </div>
        </div>`).join(''):empty;
}
/* فتح واتساب — whatsapp:// يعبر WebView مباشرة لنظام أندرويد */
function _waOpen(){
    const isMobile=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    if(isMobile){ window.location.href='whatsapp://send'; }
    else { window.open('https://web.whatsapp.com','_blank'); }
}

/* ══ بطاقة المشاركة — مستقلة كلياً، تحل مشكلة user gesture مع html2pdf ══ */
let _pendingBlob=null, _pendingFname='', _pendingTitle='';

function _closeShareCard(){
    const ov=document.getElementById('_waShareOv');
    if(!ov)return;
    ov.style.opacity='0';
    setTimeout(()=>{if(ov.parentNode)ov.parentNode.removeChild(ov);},260);
}

window._doWaShare=async function(){
    if(!_pendingBlob)return;
    const blob=_pendingBlob, fname=_pendingFname, title=_pendingTitle;
    _pendingBlob=null;
    _closeShareCard();
    const file=new File([blob],fname,{type:'application/pdf'});
    /* جوال يدعم Web Share API مع ملفات */
    if(navigator.canShare&&navigator.canShare({files:[file]})){
        try{ await navigator.share({files:[file],title}); return; }
        catch(e){ if(e.name==='AbortError')return; }
    }
    /* لا تنزيل: افتح الـPDF للعرض في تبويب (يشاركه المستخدم من عارضه) */
    const u=URL.createObjectURL(blob);
    const w=window.open(u,'_blank');
    if(!w)toast('⚠️ اسمح بالنوافذ المنبثقة لعرض الفاتورة','error');
    else toast('👁 فُتحت الفاتورة — شاركها من عارض PDF','info');
    setTimeout(()=>URL.revokeObjectURL(u),60000);
};

window._doDownload=function(){
    /* سياسة: لا تنزيلات — عرض داخلي فقط */
    if(!_pendingBlob)return;
    const blob=_pendingBlob;
    _pendingBlob=null;_closeShareCard();
    const u=URL.createObjectURL(blob);
    const w=window.open(u,'_blank');
    if(!w)toast('⚠️ اسمح بالنوافذ المنبثقة','error');
    setTimeout(()=>URL.revokeObjectURL(u),60000);
};

window._closeWaCard=function(){_pendingBlob=null;_closeShareCard();};

function _showShareCard(blob,fname,title){
    _pendingBlob=blob;_pendingFname=fname;_pendingTitle=title;
    /* أزل أي بطاقة سابقة */
    const old=document.getElementById('_waShareOv');
    if(old&&old.parentNode)old.parentNode.removeChild(old);

    const ov=document.createElement('div');
    ov.id='_waShareOv';
    Object.assign(ov.style,{
        position:'fixed',inset:'0',zIndex:'2147483647',
        background:'rgba(0,0,0,.6)',display:'flex',
        alignItems:'center',justifyContent:'center',
        padding:'1rem',opacity:'0',transition:'opacity .22s',
        fontFamily:'Tajawal,sans-serif',direction:'rtl'
    });
    const isMob=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const hasNativeShare=!!(navigator.canShare);
    ov.innerHTML=`
    <div style="background:var(--card,#fff);border-radius:16px;padding:1.4rem 1.3rem;
                max-width:320px;width:100%;box-shadow:0 8px 40px rgba(0,0,0,.35);
                border:1px solid var(--border,#e2e8f0)">
        <div style="font-weight:900;font-size:1rem;color:var(--g400,#f59e0b);
                    text-align:center;margin-bottom:1rem">📄 ${title}</div>
        <div style="display:flex;flex-direction:column;gap:.6rem">
            ${hasNativeShare?`
            <button onclick="window._doWaShare()"
                style="padding:.75rem;border-radius:10px;border:none;cursor:pointer;
                       background:#25d366;color:#fff;font-size:.95rem;font-weight:900;
                       font-family:Tajawal,sans-serif;display:flex;align-items:center;
                       justify-content:center;gap:.4rem">
                <i class="fab fa-whatsapp"></i> إرسال مباشر
            </button>`:''}
            <button onclick="window._doDownload()"
                style="padding:.75rem;border-radius:10px;border:none;cursor:pointer;
                       background:#128c7e;color:#fff;font-size:.95rem;font-weight:900;
                       font-family:Tajawal,sans-serif;display:flex;align-items:center;
                       justify-content:center;gap:.4rem">
                📥 تنزيل PDF
            </button>
            <button onclick="window._doDownload();setTimeout(()=>{const m=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);if(m)window.location.href='whatsapp://send';else window.open('https://web.whatsapp.com','_blank');},1800)"
                style="padding:.7rem;border-radius:10px;border:1px solid #25d366;
                       cursor:pointer;background:#fff;color:#25d366;font-size:.9rem;
                       font-weight:900;font-family:Tajawal,sans-serif;text-decoration:none;
                       display:flex;align-items:center;justify-content:center;gap:.4rem;
                       text-align:center;border:none">
                <i class="fab fa-whatsapp"></i> تنزيل وفتح واتساب
            </button>
            <button onclick="window._closeWaCard()"
                style="padding:.5rem;border-radius:10px;border:none;cursor:pointer;
                       background:rgba(239,68,68,.12);color:#ef4444;
                       font-size:.82rem;font-weight:700;font-family:Tajawal,sans-serif">
                إغلاق
            </button>
        </div>
    </div>`;
    ov.addEventListener('click',e=>{if(e.target===ov)window._closeWaCard();});
    document.body.appendChild(ov);
    requestAnimationFrame(()=>ov.style.opacity='1');
}
window.waInv=(id)=>{
    const inv=invoices.find(i=>i.id===id);if(!inv)return;
    const fname=`فاتورة_${inv.c}_${inv.dt}.pdf`;
    toast('⏳ جارٍ تحضير PDF…','info');
    html2pdf().set(pdfOpts(inv)).from(buildInvHtml(inv)).outputPdf('blob')
        .then(blob=>{ _showShareCard(blob,fname,`فاتورة ${inv.c}`); })
        .catch(e=>toast('❌ خطأ في توليد PDF: '+(e&&e.message||e),'error'));
};
/* delInv مُعرَّفة في invoice.js */
/* علامة مائية (لوغو) باسم المستخدم الحالي — مشتركة لكل الفواتير */
function _wmText(){ return ((typeof _currentUser!=='undefined'&&_currentUser)?_currentUser:(sessionStorage.getItem('gp12_user')||'')).toString(); }
function _wmLayer(){
    const u=_wmText(); if(!u) return '';
    const row=(u+' • ').repeat(4);
    const line=`<div style="transform:rotate(-26deg);white-space:nowrap;text-align:center;font-size:42px;font-weight:900;color:#d4af37;opacity:.07;letter-spacing:2px;margin:22px 0">${row}</div>`;
    return `<div style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden">${line+line+line}</div>`;
}

function buildInvHtml(inv){
    /* ═ وصل قبض 730: قالب مستقل — الميزان | العيار | مكافئ 730 + مجموع ما دُفع ═ */
    if(inv.recv){
        const items=(inv.items||[]);
        const eqOf=it=>(it.w||0)*((it.k||730)/730);
        const totW=items.reduce((s,it)=>s+(it.w||0),0);
        const totEq=items.reduce((s,it)=>s+eqOf(it),0);
        const rows=items.map((it,i)=>`
            <tr>
                <td style="padding:6px;border:1px solid #ddd;text-align:center">${i+1}</td>
                <td style="padding:6px;border:1px solid #ddd;text-align:center;font-weight:800">${fmt(it.w,2)} غ</td>
                <td style="padding:6px;border:1px solid #ddd;text-align:center;font-weight:800">${it.k}</td>
                <td style="padding:6px;border:1px solid #ddd;text-align:center;font-weight:900;color:#b45309">${fmt(eqOf(it),2)} غ</td>
            </tr>`).join('');
        return`<div style="position:relative;overflow:hidden;padding:10px 12px;font-family:'Tajawal',Arial,sans-serif;direction:rtl;max-width:520px;margin:auto;font-size:13px">
            ${_wmLayer()}
            <div style="position:relative;z-index:1">
                <div style="text-align:center;font-size:17px;font-weight:900;color:#b45309;margin-bottom:2px">📥 وصل قبض سبائك 730</div>
                <div style="text-align:center;font-size:12px;color:#555;margin-bottom:10px">
                    ${inv.c} — ${inv.dt}
                </div>
                <table style="width:100%;border-collapse:collapse;margin-bottom:10px">
                    <thead><tr style="background:#7f1d1d;color:#fff">
                        <th style="padding:6px;border:1px solid #7f1d1d">#</th>
                        <th style="padding:6px;border:1px solid #7f1d1d">الميزان (غ)</th>
                        <th style="padding:6px;border:1px solid #7f1d1d">العيار</th>
                        <th style="padding:6px;border:1px solid #7f1d1d">مكافئ 730 (غ)</th>
                    </tr></thead>
                    <tbody>${rows}
                    <tr style="background:#f8f4ec;font-weight:900">
                        <td style="padding:6px;border:1px solid #ddd;text-align:center">المجموع</td>
                        <td style="padding:6px;border:1px solid #ddd;text-align:center">${fmt(totW,2)} غ</td>
                        <td style="padding:6px;border:1px solid #ddd;text-align:center">—</td>
                        <td style="padding:6px;border:1px solid #ddd;text-align:center;color:#b45309">${fmt(totEq,2)} غ</td>
                    </tr></tbody>
                </table>
                <div style="border:1.5px solid #b45309;border-radius:9px;padding:8px;text-align:center;font-weight:900;font-size:14px;color:#b45309">
                    💰 مجموع ما دُفع لي: ${fmt(totEq,2)} غ (مكافئ 730)
                </div>
                <div style="margin-top:14px;font-size:11px;color:#888;text-align:center">توقيع: ______________</div>
            </div>
        </div>`;
    }
    const taken=inv.akhd!=null?inv.akhd:(inv.ps==='full'?inv.tp:0);
    /* prevBal محفوظ عند الإنشاء. الفواتير القديمة حُفظت بصفر (قبل إضافة الميزة)،
       فنحسب الرصيد الحقيقي حتى لحظة قبل الفاتورة من الأحداث — كي يظهر المجموع صحيحاً. */
    let prevBal=inv.prevBal!=null?inv.prevBal:0;
    if((prevBal===0||inv.prevBal==null) && inv.id && typeof window._custBalBeforeInv==='function'){
        try{ const _pb=window._custBalBeforeInv(inv.c,inv.id); if(_pb!=null)prevBal=_pb; }catch(e){}
    }
    const isBuy=inv.t==='buy';
    /* المجموع النهائي — مطابق تماماً لحساب التطبيق (invoice.js):
       بيع: tp + prevBal   |   شراء: tp − prevBal
       (كان معكوساً هنا فظهر PDF عكس شاشة التطبيق) */
    const finalTotal=isBuy?(inv.tp-prevBal-taken):(inv.tp+prevBal-taken);
    const isPaid=inv.ps==='full';
    const typeLabel=inv.recv?'قبض 730':isBuy?'شراء':'بيع';
    const paidLabel=inv.recv?'وصل قبض':isPaid?'خالص':'غير خالص';
    const _wm=((typeof _currentUser!=='undefined'&&_currentUser)?_currentUser:(sessionStorage.getItem('gp12_user')||'')).toString();
    const _wmRow=_wm?(_wm+' • ').repeat(4):'';
    const _wmLine=`<div style="transform:rotate(-26deg);white-space:nowrap;text-align:center;font-size:44px;font-weight:900;color:#d4af37;opacity:.07;letter-spacing:2px;margin:22px 0">${_wmRow}</div>`;
    return`<div style="position:relative;overflow:hidden;padding:8px 10px;font-family:'Tajawal',Arial,sans-serif;direction:rtl;max-width:540px;margin:auto;font-size:13px">
        <!-- علامة مائية (لوقو) باسم المستخدم خلف الفاتورة -->
        <div style="position:absolute;top:0;left:0;right:0;bottom:0;z-index:0;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden">
            ${_wm?_wmLine+_wmLine+_wmLine:''}
        </div>
        <div style="position:relative;z-index:1">
        <!-- ترويسة: نوع الفاتورة + اسم الزبون + حالة الدفع -->
        <div style="display:flex;justify-content:space-between;align-items:stretch;margin-bottom:7px;gap:5px">
            <span style="background:#dc2626;color:#fff;padding:5px 10px;font-weight:900;font-size:13px;border-radius:5px;display:flex;align-items:center">${paidLabel}</span>
            <span style="flex:1;background:#f8f8f8;border:1px solid #ccc;color:#1a1a1a;padding:5px 10px;font-weight:900;font-size:16px;border-radius:5px;display:flex;align-items:center;justify-content:center">${inv.c}</span>
            <span style="background:#dc2626;color:#fff;padding:5px 10px;font-weight:900;font-size:13px;border-radius:5px;display:flex;align-items:center">${typeLabel}</span>
        </div>
        <!-- رقم الفاتورة والتاريخ — RTL: التاريخ يسار، الرقم يمين -->
        <div style="display:flex;justify-content:space-between;margin-bottom:7px;font-size:11px;color:#333;border-bottom:1px solid #ddd;padding-bottom:5px">
            <span>التاريخ: <strong>${inv.dt}</strong></span>
            <span>رقم: <strong>${inv.id.replace('INV-','')}</strong></span>
        </div>
        <!-- جدول البنود — RTL: الميزان يمين، المجموع يسار -->
        <table style="width:100%;border-collapse:collapse;table-layout:fixed">
            <thead>
                <tr style="background:#1a1a1a;color:#fff;font-weight:800;font-size:11px;text-align:center">
                    <th style="padding:5px 3px;border:1px solid #555;width:22%">الميزان</th>
                    <th style="padding:5px 3px;border:1px solid #555;width:12%">القيراط</th>
                    <th style="padding:5px 3px;border:1px solid #555;width:18%">ال730</th>
                    <th style="padding:5px 3px;border:1px solid #555;width:20%">السعر</th>
                    <th style="padding:5px 3px;border:1px solid #555;width:28%">المجموع</th>
                </tr>
            </thead>
            <tbody>
                ${(inv.items||[]).map((b,idx)=>`<tr style="text-align:center;background:${idx%2?'#fff':'#fafafa'}">
                    <td style="border:1px solid #bbb;padding:5px 3px;font-size:13px;font-weight:700">${fmt(b.w||0,2)}</td>
                    <td style="border:1px solid #bbb;padding:5px 3px;font-size:12px">${b.k||0}</td>
                    <td style="border:1px solid #bbb;padding:5px 3px;font-size:13px;font-weight:700">${fmt(b.eq730||0,2)}</td>
                    <td style="border:1px solid #bbb;padding:5px 3px;font-size:12px">${fmt(b.ppg||0,0)}</td>
                    <td style="border:1px solid #bbb;padding:5px 3px;font-weight:900;font-size:15px">${fmt(b.total||0,0)}</td>
                </tr>`).join('')}
                <tr style="background:#e5e5e5;text-align:center;font-weight:900">
                    <td style="border:1px solid #999;padding:6px 3px;font-size:14px">${fmt(inv.items.reduce((s,b)=>s+(b.w||0),0),2)}</td>
                    <td style="border:1px solid #999;padding:6px 3px;font-size:12px">—</td>
                    <td style="border:1px solid #999;padding:6px 3px;font-size:14px">${fmt(inv.items.reduce((s,b)=>s+(b.eq730||0),0),2)}</td>
                    <td style="border:1px solid #999;padding:6px 3px;font-size:12px">—</td>
                    <td style="border:1px solid #999;padding:6px 3px;font-size:16px">${fmt(inv.tp||0,0)}</td>
                </tr>
            </tbody>
        </table>
        <!-- الرصيد والمجموع النهائي -->
        <div style="margin-top:8px;border:1px solid #bbb;border-radius:4px;overflow:hidden">
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px">
                <span style="color:#555">الرصيد السابق:</span>
                <span style="font-size:15px;font-weight:800;color:${prevBal>0?'#16a34a':prevBal<0?'#dc2626':'#555'}">${fmt(Math.abs(prevBal),0)}${prevBal>0?' (مدين لك)':prevBal<0?' (أنت مدين له)':''}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-bottom:1px solid #ddd;font-size:13px">
                <span style="color:#555">أخذ:</span>
                <span style="font-size:15px;font-weight:800">${fmt(taken,0)}</span>
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:#1a1a1a;color:#fff">
                <span style="font-size:13px">المجموع النهائي:</span>
                <span style="font-size:18px;font-weight:900">${fmt(finalTotal,0)}</span>
            </div>
        </div>
        <div style="text-align:center;margin-top:10px;font-size:11px;color:#888">
            توقيع: ___________________________
        </div>
        </div>
    </div>`;
}
function pdfOpts(inv){
    return{margin:4,filename:`فاتورة_${inv.c}_${inv.dt}.pdf`,image:{type:'jpeg',quality:.98},html2canvas:{scale:2},jsPDF:{unit:'mm',format:'a5',orientation:'portrait'}};
}
/* ═══════════ قفل الفواتير PDF بتشفير AES-256 حقيقي (ملف .gpdf) ═══════════ */
function _waToU8(wa){ const w=wa.words,s=wa.sigBytes,u=new Uint8Array(s); for(let i=0;i<s;i++)u[i]=(w[i>>>2]>>>(24-(i%4)*8))&0xff; return u; }
function _dlBlob(blob,name){ /* لا تنزيل — عرض داخلي */ const url=URL.createObjectURL(blob); const w=window.open(url,'_blank'); if(!w)toast('⚠️ اسمح بالنوافذ المنبثقة','error'); setTimeout(()=>URL.revokeObjectURL(url),60000); }
/* يشفّر بايتات الـ PDF بـ AES-256 (مفتاح PBKDF2 من المستخدم+كلمة المرور) ويحفظها كـ .gpdf */
function _savePdfLocked(blob,filename){
    if(typeof _encKey==='undefined'||!_encKey){ _dlBlob(blob,filename); toast('⚠️ حُفظت بدون قفل — سجّل الدخول لتفعيل التشفير','error'); return; }
    const fr=new FileReader();
    fr.onload=()=>{
        try{
            const wa=CryptoJS.lib.WordArray.create(fr.result);
            const salt=CryptoJS.lib.WordArray.random(16), iv=CryptoJS.lib.WordArray.random(16);
            const key=CryptoJS.PBKDF2(_backupKey(),salt,{keySize:256/32,iterations:100000,hasher:CryptoJS.algo.SHA256});
            const ct=CryptoJS.AES.encrypt(wa,key,{iv:iv}).toString();
            const out=JSON.stringify({_gpdf:1,kdf:'PBKDF2-SHA256',iter:100000,_user:_currentUser,name:filename,
                salt:salt.toString(CryptoJS.enc.Hex),iv:iv.toString(CryptoJS.enc.Hex),blob:ct});
            _dlBlob(new Blob([out],{type:'application/octet-stream'}), filename.replace(/\.pdf$/i,'')+'.gpdf');
            toast('🔒 حُفظت الفاتورة مشفّرة AES-256','info');
        }catch(e){ toast('⚠️ فشل التشفير','error'); }
    };
    fr.readAsArrayBuffer(blob);
}
/* يولّد PDF من HTML ثم يحفظه مقفلاً (AES-256) */
function _makeLockedPdf(opts,html){
    toast('🔒 جاري التشفير...','info');
    html2pdf().set(opts).from(html).outputPdf('blob')
        .then(b=>_savePdfLocked(b,opts.filename||'فاتورة.pdf'))
        .catch(e=>toast('❌ خطأ في توليد PDF','error'));
}
/* فتح فاتورة مقفلة (.gpdf): يفكّ بمفتاح المستخدم النشط ويعرض الـ PDF */
let _pendingGpdf=null;
/* يفكّ نصّ ملف .gpdf ويعرض الـ PDF. إن لم يكن المستخدم داخلاً بعد، يخزّنه لما بعد الدخول */
function _openGpdfText(text){
    let p=null; try{p=JSON.parse(text);}catch(_){p=null;}
    if(!p||!p._gpdf||!p.blob){ toast('⚠️ ملف غير صالح','error'); return; }
    if(typeof _encKey==='undefined'||!_encKey){
        _pendingGpdf=text;
        toast('🔑 سجّل الدخول لفتح الفاتورة المقفلة','info');
        return;
    }
    toast('🔓 جاري فك القفل...','info');
    setTimeout(()=>{
        try{
            const salt=CryptoJS.enc.Hex.parse(p.salt), iv=CryptoJS.enc.Hex.parse(p.iv);
            const key=CryptoJS.PBKDF2(_backupKey(),salt,{keySize:256/32,iterations:p.iter||100000,hasher:CryptoJS.algo.SHA256});
            const dec=CryptoJS.AES.decrypt(p.blob,key,{iv:iv});
            const u8=_waToU8(dec);
            if(u8.length<4||u8[0]!==0x25||u8[1]!==0x50||u8[2]!==0x44||u8[3]!==0x46){ toast('🚫 فشل الفتح — كلمة المرور خاطئة أو الملف لا يخصّك','error'); return; }
            const pblob=new Blob([u8],{type:'application/pdf'});
            const url=URL.createObjectURL(pblob);
            const w=window.open(url,'_blank');
            if(!w) _dlBlob(pblob,(p.name||'فاتورة.pdf'));
            setTimeout(()=>URL.revokeObjectURL(url),60000);
            toast('✅ تم فك القفل','info');
        }catch(_){ toast('🚫 فشل الفتح — كلمة المرور خاطئة أو الملف تالف','error'); }
    },50);
}
window._processPendingGpdf=()=>{ if(_pendingGpdf){ const t=_pendingGpdf; _pendingGpdf=null; _openGpdfText(t); } };
window.openLockedPdf=(e)=>{
    const file=e.target.files[0]; if(!file)return; e.target.value='';
    const fr=new FileReader();
    fr.onload=ev=>_openGpdfText(ev.target.result);
    fr.readAsText(file);
};
/* استقبال ملفّات .gpdf المفتوحة عبر «الفتح بواسطة» (File Handling API) */
if('launchQueue' in window && 'setConsumer' in window.launchQueue){
    try{
        window.launchQueue.setConsumer(async (lp)=>{
            if(!lp||!lp.files||!lp.files.length)return;
            try{ const f=await lp.files[0].getFile(); _openGpdfText(await f.text()); }catch(e){}
        });
    }catch(e){}
}
window.printInv=(id)=>{
    /* سياسة لا-تنزيل: عرض داخلي بدل PDF مقفل */
    const _i=invoices.find(x=>x.id===id);
    if(_i){ _openInternalView(buildInvHtml(_i), 'فاتورة '+(_i.c||'')); return; }
    const inv=invoices.find(i=>i.id===id);if(!inv)return;
    _makeLockedPdf(pdfOpts(inv),buildInvHtml(inv));
};


/* ═══ PDF الدولار ═══ */
function buildDollHtml(d){
    const lbl=d.isBuy?'شراء دولار':'بيع دولار';
    const col=d.isBuy?'#16a34a':'#0369a1';
    return`<div style="position:relative;overflow:hidden;padding:12px;font-family:Tajawal,sans-serif;direction:rtl;max-width:480px;margin:auto">
        ${_wmLayer()}
        <div style="position:relative;z-index:1">
        <div style="text-align:center;border-bottom:2px solid ${col};padding-bottom:8px;margin-bottom:10px">
            <div style="font-size:19px;font-weight:900;color:${col}">💲 ${lbl}</div>
            <div style="font-size:13px;color:#555">${d.c} — ${d.dt}</div>
        </div>
        <div style="font-size:14px;border:1px solid #aaa;padding:10px;border-radius:4px">
            <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span>نوع العملية:</span><span style="font-weight:900;color:${col}">${lbl}</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span>الطرف:</span><span style="font-weight:800">${d.c}</span></div>
            ${d.party?`<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span>${d.isBuy?'من أخذه':'المسلم'}:</span><span style="font-weight:800">${d.party}</span></div>`:''}
            <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span>المبلغ:</span><span style="font-weight:900;font-size:16px">${fmt(d.a,2)} $</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span>سعر الصرف:</span><span>${fmt(d.r,2)} دج/$</span></div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid #aaa;padding-top:5px;font-weight:900;font-size:16px">
                <span>المجموع بالدينار:</span><span>${fmt(d.dinar,0)} دج</span>
            </div>
        </div>
        <div style="text-align:center;margin-top:12px;font-size:12px;color:#666"><p>توقيع: _______________</p></div>
        </div>
    </div>`;
}
const _dollPdfOpts=(d)=>({margin:4,filename:`دولار_${d.c}_${d.dt}.pdf`,image:{type:'jpeg',quality:.98},html2canvas:{scale:2},jsPDF:{unit:'mm',format:'a5',orientation:'portrait'}});
window.printDoll=(id)=>{
    const _d=dollInvoices.find(x=>x.id===id);
    if(_d){ _openInternalView(buildDollHtml(_d), 'فاتورة دولار '+(_d.c||'')); return; }
    const d=dollInvoices.find(x=>x.id===id);if(!d)return;
    _makeLockedPdf(_dollPdfOpts(d),buildDollHtml(d));
};
window.waDoll=(id)=>{
    const d=dollInvoices.find(x=>x.id===id);if(!d)return;
    const fname=`دولار_${d.c}_${d.dt}.pdf`;
    toast('⏳ جارٍ تحضير PDF…','info');
    html2pdf().set(_dollPdfOpts(d)).from(buildDollHtml(d)).outputPdf('blob')
        .then(blob=>{ _showShareCard(blob,fname,`دولار ${d.c}`); })
        .catch(e=>toast('❌ خطأ في توليد PDF: '+(e&&e.message||e),'error'));
};
/* delDoll مُعرَّفة في firebase.js */

/* ═══ PDF دبي ═══ */
function buildDubaiHtml(d){
    const netPrice=(d.sp||0)-(d.disc||0);
    const totalUsd=Math.max(0,netPrice*(d.w||0)/31.1035);
    return`<div style="position:relative;overflow:hidden;padding:12px;font-family:Tajawal,sans-serif;direction:rtl;max-width:480px;margin:auto">
        ${_wmLayer()}
        <div style="position:relative;z-index:1">
        <div style="text-align:center;border-bottom:2px solid #0f766e;padding-bottom:8px;margin-bottom:10px">
            <div style="font-size:19px;font-weight:900;color:#0f766e">🏙️ بيع دبي</div>
            <div style="font-size:13px;color:#555">${d.c} — ${d.dt}</div>
        </div>
        <div style="font-size:14px;border:1px solid #aaa;padding:10px;border-radius:4px">
            <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span>المكتب:</span><span style="font-weight:800">${d.c}</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span>الوزن المرسل:</span><span style="font-weight:900;font-size:15px">${fmt(d.w,3)} غ 24</span></div>
            <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span>سعر الشاشة:</span><span>${fmt(d.sp,2)} $/أوقية</span></div>
            ${d.disc?`<div style="display:flex;justify-content:space-between;margin-bottom:5px"><span>الخصم:</span><span style="color:#dc2626">−${fmt(d.disc,2)} $/أوقية</span></div>`:''}
            <div style="display:flex;justify-content:space-between;margin-bottom:5px"><span>السعر الصافي:</span><span>${fmt(netPrice,2)} $/أوقية</span></div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid #aaa;padding-top:5px;font-weight:900;font-size:16px">
                <span>الإجمالي:</span><span style="color:#0f766e">${fmt(totalUsd,4)} $</span>
            </div>
        </div>
        <div style="text-align:center;margin-top:12px;font-size:12px;color:#666"><p>توقيع: _______________</p></div>
        </div>
    </div>`;
}
const _dubaiPdfOpts=(d)=>({margin:4,filename:`دبي_${d.c}_${d.dt}.pdf`,image:{type:'jpeg',quality:.98},html2canvas:{scale:2},jsPDF:{unit:'mm',format:'a5',orientation:'portrait'}});
window.printDubai=(id)=>{
    const _d=dubaiInvoices.find(x=>x.id===id);
    if(_d){ _openInternalView(buildDubaiHtml(_d), 'فاتورة دبي '+(_d.o||'')); return; }
    const d=dubaiInvoices.find(x=>x.id===id);if(!d)return;
    _makeLockedPdf(_dubaiPdfOpts(d),buildDubaiHtml(d));
};
window.waDubai=(id)=>{
    const d=dubaiInvoices.find(x=>x.id===id);if(!d)return;
    const fname=`دبي_${d.c}_${d.dt}.pdf`;
    toast('⏳ جارٍ تحضير PDF…','info');
    html2pdf().set(_dubaiPdfOpts(d)).from(buildDubaiHtml(d)).outputPdf('blob')
        .then(blob=>{ _showShareCard(blob,fname,`دبي ${d.c}`); })
        .catch(e=>toast('❌ خطأ في توليد PDF: '+(e&&e.message||e),'error'));
};
/* delDubai مُعرَّفة في firebase.js */

/* ═══════════ NAVIGATION ═══════════ */
window.switchPage=(p)=>{
    /* تقييد الأدوار: العامل ورشته فقط، الزبون بوابته فقط */
    if(window._roleLock==='worker'&&p!=='workshops')p='workshops';
    if(window._roleLock==='customer')return;
    /* تعديل فاتورة زبون (بلا VOID): مغادرة الصفحة تلغي وضع التعديل فحسب */
    if(window._rafEditMeta&&window._rafEditMeta.rid&&p!=='raffinage'){
        window._rafEditMeta=null;
        if(typeof resetRafForm==='function')resetRafForm();
        if(typeof _hideRafEditBanner==='function')_hideRafEditBanner();
        toast('↩️ أُلغي وضع التعديل — الفاتورة الأصلية لم تُمسّ','info');
    }
    const er=window._editRestore;
    if(er&&er.page&&er.page!==p){ window._editRestore=null;window._rafEditMeta=null;window._rafEditWs=null; if(typeof _reemitSnapshot==='function')_reemitSnapshot(er.snap); if(typeof _hideRafEditBanner==='function')_hideRafEditBanner(); if(er.page==='raffinage'&&typeof resetRafForm==='function')resetRafForm(); toast('↩️ أُلغي التعديل واستُعيدت الفاتورة الأصلية — النموذج فُرِّغ','info'); }
    document.querySelectorAll('.page').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.ni').forEach(x=>x.classList.remove('active'));
    const pe=document.getElementById('page-'+p),ne=document.getElementById('nav-'+p);
    if(pe)pe.classList.add('active');if(ne)ne.classList.add('active');
    if(p==='invoice'){updateInvDate();}
    if(p==='raffinage'){if(typeof applyRafModeUI==='function')applyRafModeUI();calcRaf();}
    if(p==='workshops'&&typeof renderWorkshops==='function')renderWorkshops();
    if(p==='log')renderLog();
    if(p==='archive')renderArchive();
    if(p==='debts')renderDebts();
    /* كرة السعر: تظهر في الواجهة الرئيسية فقط */
    const _ball=document.getElementById('hdrCenterWrap');
    if(_ball){
        if(p==='home'){ _ball.style.display=''; }
        else { _ball.style.display='none'; _ball.classList.remove('open'); }
    }
};

/* ═══════════ LIVE SPOT PRICE ═══════════ */
async function fetchSpotPrice(){
    const el=document.getElementById('spotPriceDisplay');
    const badge=document.getElementById('spotBadge');
    const fmt2=v=>fmt(v,2);
    const show=(price)=>{
        el.textContent='XAU '+fmt2(price)+' $/أوقية';
        badge.classList.remove('spot-loading');
        badge.title='سعر الذهب العالمي اللحظي (XAU/USD) — آخر تحديث: '+new Date().toLocaleTimeString('ar-DZ');
        if(typeof _refreshDubaiSell==='function') _refreshDubaiSell();
    };
    /* 1. gold-api.com — مجاني، يدعم CORS */
    try{
        const r=await fetch('https://api.gold-api.com/price/XAU',{cache:'no-store'});
        if(!r.ok)throw new Error();
        const d=await r.json();
        const price=d?.price;
        if(price&&!isNaN(price)){liveSpotPrice=price;show(price);autoCalcDubai();return}
    }catch{}
    /* 2. metals.live — احتياطي */
    try{
        const r=await fetch('https://api.metals.live/v1/spot/gold',{cache:'no-store'});
        if(!r.ok)throw new Error();
        const d=await r.json();
        const price=d?.price??d?.gold??d?.[0]?.gold;
        if(price&&!isNaN(price)){liveSpotPrice=price;show(price);autoCalcDubai();return}
    }catch{}
    /* 3. فشل كلا المصدرين */
    el.textContent='السعر غير متاح';
    badge.classList.add('spot-loading');
}


/* ═══ إكمال تلقائي مخصّص للأسماء — بديل datalist لا يعيق كتابة اسم جديد على الهاتف ═══ */
(function(){
    let _acEl=null,_acInp=null;
    function _acNames(){
        try{ return [...new Set([
            ...((typeof debts!=='undefined'?debts:[])||[]).map(d=>d.c),
            ...((typeof loans!=='undefined'?loans:[])||[]).map(l=>l.c),
            ...((typeof invoices!=='undefined'?invoices:[])||[]).map(i=>i.c),
            ...((typeof ops!=='undefined'?ops:[])||[]).map(o=>o.c)
        ])].filter(Boolean); }catch(e){ return []; }
    }
    /* مطابقة الاسم المُدخَل (صوتاً أو كتابةً) مع زبائنك عند مغادرة الحقل */
    function _snapName(inp){
        const v=(inp.value||'').trim(); if(!v)return;
        try{
            if(!(window.VA&&VA.matchName))return;
            const r=VA.matchName(v);
            if(r&&r.ok&&r.name&&r.name!==v&&(r.dist==null||r.dist<=2)){
                inp.value=r.name;
                if(typeof toast==='function')toast(`🔁 صُحِّح الاسم: "${v}" ← "${r.name}"`,'info');
                inp.dispatchEvent(new Event('input',{bubbles:true}));
            }
        }catch(e){}
    }
    function _box(){ if(!_acEl){ _acEl=document.createElement('div'); _acEl.className='ac-box'; _acEl.style.cssText='position:fixed;display:none;z-index:99999'; document.body.appendChild(_acEl);} return _acEl; }
    function _hide(){ if(_acEl)_acEl.style.display='none'; }
    /* قائمة صغيرة (اقتراحان كحدّ أقصى) أسفل الحقل — لا تغطّي الكتابة ولا تسرق التركيز */
    function _show(inp){
        const v=(inp.value||'').trim().toLowerCase(); const box=_box();
        if(!v){ _hide(); return; }
        const all=_acNames();
        let m=all.filter(n=>n.toLowerCase().startsWith(v)&&n.toLowerCase()!==v);
        if(m.length<2){ all.forEach(n=>{ const ln=n.toLowerCase(); if(ln.includes(v)&&ln!==v&&!m.includes(n))m.push(n); }); }
        m=m.slice(0,2);
        if(!m.length){ _hide(); return; }
        box.innerHTML=m.map(n=>`<div class="ac-item">${String(n).replace(/</g,'&lt;')}</div>`).join('');
        Array.from(box.children).forEach((el,k)=>{ el.onmousedown=ev=>{ ev.preventDefault(); inp.value=m[k]; _hide(); inp.dispatchEvent(new Event('input',{bubbles:true})); }; });
        const r=inp.getBoundingClientRect();
        box.style.left=r.left+'px'; box.style.top=(r.bottom+2)+'px'; box.style.width=r.width+'px'; box.style.display='block';
        _acInp=inp;
    }
    function _attach(id){ const inp=document.getElementById(id); if(!inp||inp._acOn) return; inp._acOn=true;
        inp.removeAttribute('list'); inp.setAttribute('autocomplete','off');
        inp.addEventListener('input',()=>_show(inp));
        inp.addEventListener('focus',()=>_show(inp));
        inp.addEventListener('blur',()=>{ setTimeout(_hide,160); _snapName(inp); });
    }
    function init(){ ['invCustomer','rafCustomer','loanCustomer','sellCustomer','gtCustomer','dollarCustomer','dollarParty','expCustomer','sendLogCustomer','shipOffice','dubaiOffice'].forEach(_attach); }
    window._acAttach=_attach;
    if(document.readyState!=='loading') init(); else document.addEventListener('DOMContentLoaded',init);
    setTimeout(init,800);
    window.addEventListener('scroll',_hide,true);
})();

/* ═══════════ تنقّل الأسهم العام (هندسي — كما في الرفاينج) ═══════════
   ↑↓ دائماً بين الحقول. ←→ في الحقول الرقمية فقط (النصية تحتاجهما للمؤشر).
   النطاق: النافذة المفتوحة إن وُجدت، وإلا الصفحة النشطة. */
(function(){
    function _navContainer(){
        return document.querySelector('.modal-overlay.active .modal, .modal-overlay.active .modal-box')
            || document.querySelector('.page.active')
            || document.getElementById('loginMainPanel')
            || document.body;
    }
    function _isNumericInput(el){
        return el.type==='number'||/decimal|numeric/.test(el.getAttribute('inputmode')||'');
    }
    function _candidates(box){
        return [...box.querySelectorAll('input,select')].filter(el=>{
            if(el.disabled||el.type==='hidden')return false;
            const r=el.getBoundingClientRect();
            return r.width>0&&r.height>0&&el.offsetParent!==null;
        });
    }
    /* اختيار أفضل هدف في اتجاه السهم بتقييم هندسي: مسافة المحور الرئيسي + عقوبة الانحراف الجانبي */
    function _pickTarget(cur,dir,list){
        const cr=cur.getBoundingClientRect();
        const cx=cr.left+cr.width/2, cy=cr.top+cr.height/2;
        let best=null,bestScore=Infinity;
        list.forEach(el=>{
            if(el===cur)return;
            const r=el.getBoundingClientRect();
            const x=r.left+r.width/2, y=r.top+r.height/2;
            const dx=x-cx, dy=y-cy;
            let main,side;
            if(dir==='up'){   if(dy>=-4)return; main=-dy; side=Math.abs(dx); }
            if(dir==='down'){ if(dy<= 4)return; main= dy; side=Math.abs(dx); }
            if(dir==='left'){ if(dx>=-4)return; main=-dx; side=Math.abs(dy); }
            if(dir==='right'){if(dx<= 4)return; main= dx; side=Math.abs(dy); }
            const score=main+side*2.5;
            if(score<bestScore){bestScore=score;best=el;}
        });
        return best;
    }
    document.addEventListener('keydown',function(e){
        const el=document.activeElement;
        if(!el||el.tagName!=='INPUT')return;
        const map={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};
        const dir=map[e.key]; if(!dir)return;
        /* الحقول النصية: ← → تحرّك المؤشر داخل النص، وتنتقل للحقل التالي عند حدّه
           (أو إذا كان النص كله محدّداً أو الحقل فارغاً) */
        if((dir==='left'||dir==='right')&&!_isNumericInput(el)){
            const len=(el.value||'').length;
            let s=0,e2=0;try{s=el.selectionStart;e2=el.selectionEnd;}catch(_){}
            const allSel=len>0&&s===0&&e2===len;
            const atEnd=s===len&&e2===len;
            const atStart=s===0&&e2===0;
            const ok=len===0||allSel||(dir==='left'?atEnd:atStart);
            if(!ok)return;
        }
        const box=_navContainer();
        if(!box.contains(el))return;
        const target=_pickTarget(el,dir,_candidates(box));
        if(target){
            e.preventDefault();
            target.focus();
            if(target.select)try{target.select();}catch(_){}
        }
    },true);
})();

/* ═══════════ شاشة التمويه (Decoy) — منقولة من rafinag حرفياً ═══════════
   ٣ ضغطات متتالية على المسافة (خلال 800ms، خارج حقول الكتابة) تُظهر
   صفحة "Google" وهمية فوق كل شيء — ونفس الإيماءة تخفيها. */
(function(){
    let _times=[];
    let _on=false;
    function _build(){
        let d=document.getElementById('decoyScreen');
        if(d)return d;
        d=document.createElement('div');
        d.id='decoyScreen';
        d.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#fff;direction:ltr;display:none;flex-direction:column;align-items:center;font-family:Arial,Helvetica,sans-serif;overflow:auto';
        const L=[['G','#4285F4'],['o','#EA4335'],['o','#FBBC05'],['g','#4285F4'],['l','#34A853'],['e','#EA4335']];
        d.innerHTML=`
            <div style="width:100%;display:flex;justify-content:flex-end;align-items:center;gap:18px;padding:12px 18px;box-sizing:border-box;font-size:13px;color:#3c4043">
                <span>Gmail</span><span>Images</span>
                <span style="display:inline-grid;grid-template-columns:repeat(3,4px);gap:2px">${Array.from({length:9}).map(()=>'<span style="width:4px;height:4px;background:#5f6368;border-radius:1px"></span>').join('')}</span>
                <span style="width:30px;height:30px;border-radius:50%;background:#1a73e8;color:#fff;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:14px">R</span>
            </div>
            <div style="margin-top:13vh;width:100%;max-width:560px;padding:0 20px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center">
                <div style="font-size:clamp(54px,9vw,90px);font-weight:500;letter-spacing:-3px;margin-bottom:24px">${L.map(([c,col])=>`<span style="color:${col}">${c}</span>`).join('')}</div>
                <div style="width:100%;display:flex;align-items:center;gap:13px;border:1px solid #dfe1e5;border-radius:24px;padding:10px 16px;box-shadow:0 1px 6px rgba(32,33,36,.18);box-sizing:border-box">
                    <span style="color:#9aa0a6;font-size:18px">&#128269;</span>
                    <input style="flex:1;border:none;outline:none;font-size:16px;background:transparent;color:#202124">
                    <span style="color:#4285f4;font-size:18px">&#127908;</span>
                </div>
                <div style="display:flex;gap:11px;margin-top:28px">
                    <span style="background:#f8f9fa;border:1px solid #f8f9fa;border-radius:4px;padding:9px 16px;font-size:14px;color:#3c4043">Google Search</span>
                    <span style="background:#f8f9fa;border:1px solid #f8f9fa;border-radius:4px;padding:9px 16px;font-size:14px;color:#3c4043">I'm Feeling Lucky</span>
                </div>
            </div>`;
        document.body.appendChild(d);
        return d;
    }
    window._toggleDecoy=function(){
        _on=!_on;
        _build().style.display=_on?'flex':'none';
    };
    /* ═ داخل التمويه: مسافتان سريعتان = إغلاق التطبيق نهائياً · Esc = حقل كلمة سر الأدمين للعودة ═ */
    let _dSpN=0,_dSpT=0;
    function _decoyPwBox(){
        let b=document.getElementById('decoyPwBox');
        if(b){b.querySelector('input').focus();return;}
        b=document.createElement('div');b.id='decoyPwBox';
        b.style.cssText='position:fixed;bottom:14px;left:14px;z-index:2147483300;background:#fff;border:1px solid #dadce0;border-radius:8px;padding:6px 8px;box-shadow:0 2px 8px rgba(0,0,0,.15);display:flex;gap:6px;align-items:center';
        b.innerHTML='<input type="password" placeholder="••••" style="width:110px;border:1px solid #dadce0;border-radius:6px;padding:5px 8px;font-size:13px;outline:none">';
        const inp=b.querySelector('input');
        inp.addEventListener('keydown',ev=>{
            ev.stopPropagation();
            if(ev.key==='Escape'){b.remove();return;}
            if(ev.key==='Enter'){
                const ok=(inp.value&&inp.value===localStorage.getItem('gp12_ek'));
                if(ok){b.remove();_toggleDecoy();}
                else{inp.value='';inp.style.borderColor='#ef4444';setTimeout(()=>inp.style.borderColor='#dadce0',700);}
            }
        });
        document.body.appendChild(b);
        setTimeout(()=>inp.focus(),60);
    }
    document.addEventListener('keydown',function(e){
        if(_on){
            /* داخل التمويه */
            const inPw=e.target&&e.target.closest&&e.target.closest('#decoyPwBox');
            if(inPw)return;
            if(e.key==='Escape'||e.code==='Escape'){
                e.preventDefault();e.stopPropagation();
                _decoyPwBox();               /* العودة بكلمة سر الأدمين فقط */
                return;
            }
            if(e.key===' '||e.code==='Space'){
                e.preventDefault();e.stopPropagation();
                const now=Date.now();
                _dSpN=(now-_dSpT<650)?_dSpN+1:1;
                _dSpT=now;
                if(_dSpN>=2){ try{window.close();}catch(_){} try{location.href='about:blank';}catch(_){} }
                return;
            }
            return;   /* أي مفتاح آخر داخل التمويه لا يفعل شيئاً */
        }
        const el=document.activeElement||{};
        const tag=(el.tagName||'').toLowerCase();
        const typing=tag==='input'||tag==='textarea'||tag==='select'||el.isContentEditable;
        if((e.key===' '||e.code==='Space')&&(!typing||_on)){
            if(_on)e.preventDefault();
            const now=Date.now();
            _times=[..._times.filter(t=>now-t<800),now];
            if(_times.length>=3){_times=[];_toggleDecoy();}
        }
    },true);
})();


/* ═══════════ استيراد الأرصدة الافتتاحية من ملف JSON ═══════════
   الصيغة: {dinar, dollar, g24, bars730:[{w,k}], debts:[{c, d, g7, g24}]}
   (d=دينار، g7=730، g24=ذهب24 — الإشارة تحدد الاتجاه: موجب=لنا، سالب=علينا)
   يملأ الحقول فقط — المراجعة والتعديل بيدك، والحفظ بزر الاعتماد كالمعتاد. */
window._liqImport=function(inp){
    const f=inp.files&&inp.files[0]; inp.value='';
    if(!f)return;
    const rd=new FileReader();
    rd.onload=()=>{
        try{
            const j=JSON.parse(rd.result);
            const setV=(id,v)=>{const e=document.getElementById(id);if(e&&v!=null){e.value=String(v);if(typeof liveNum==='function'&&e.getAttribute('oninput')&&e.getAttribute('oninput').includes('liveNum'))liveNum(e);}};
            setV('liqDinar', j.dinar);
            setV('liqDollar',j.dollar);
            setV('liqG24',  j.g24);
            /* سبائك 730 */
            const b730=document.getElementById('liq730Bars'); if(b730)b730.innerHTML=''; _liq730Cnt=0;
            (j.bars730||[]).forEach(b=>{ if(b&&b.w>0)_add730BarRow(b.w,b.k||730); });
            ['workshop1','workshop2'].forEach((ws,ix)=>{
                const e=document.getElementById('liqWsBars_'+ws); if(e)e.innerHTML='';
                ((ix===0?j.ws1:j.ws2)||[]).forEach(b=>{ if(b&&b.w>0)_addLiqWsRow(ws,b.w,b.k||730); });
            });
            /* صفوف الديون */
            const tb=document.getElementById('liqDebtRows'); if(tb)tb.innerHTML=''; _liqDebtCnt=0;
            (j.debts||[]).forEach(r=>{
                if(!r||!r.c)return;
                _addLiqDebtRow();
                const i=_liqDebtCnt;
                setV('liqDC_'+i, r.c);
                if(r.d)  setV('liqDN_'+i, r.d);
                if(r.usd)setV('liqDU_'+i, r.usd);
                if(r.g7) setV('liqD7_'+i, r.g7);
                if(r.g24)setV('liqDG_'+i, r.g24);
                ['liqDN_','liqDU_','liqD7_','liqDG_'].forEach(p=>{const e=document.getElementById(p+i);if(e&&typeof _liqPaint==='function')_liqPaint(e);});
            });
            toast(`📥 استُورد: ${ (j.debts||[]).length } زبوناً و${(j.bars730||[]).length} سبيكة 730 — راجع وعدّل ثم اضغط اعتماد`,'success');
        }catch(e){console.error(e);toast('ملف غير صالح — أرسله للمطوّر','error');}
    };
    rd.readAsText(f,'utf-8');
};


/* ═══════════ ملء الشاشة تلقائياً على الحاسوب ═══════════
   المتصفح لا يسمح بملء الشاشة إلا بإيماءة من المستخدم —
   فنطلبه عند أول نقرة/لمسة في كل جلسة (مرة واحدة). */
(function(){
    if(window.innerWidth<900)return;                 /* الحاسوب فقط */
    /* إن أُطلق التطبيق بوضع ملء شاشة النافذة (--start-fullscreen / --kiosk)
       فلا حاجة لملء الشاشة البرمجي الهشّ — نتنحى كلياً */
    if(Math.abs(window.innerHeight-screen.height)<=2&&Math.abs(window.innerWidth-screen.width)<=2)return;
    let armed=false;
    function go(){
        if(!armed)return; armed=false;
        try{
            if(!document.fullscreenElement&&document.documentElement.requestFullscreen)
                document.documentElement.requestFullscreen().catch(()=>{});
        }catch(e){}
    }
    function arm(){ if(armed)return; armed=true; }
    document.addEventListener('pointerdown',go,true);
    document.addEventListener('keydown',go,true);
    /* أي خروج من ملء الشاشة (نوافذ تأكيد، تحميل فاتورة، حذف...) → أول نقرة تُعيده */
    document.addEventListener('fullscreenchange',()=>{ if(!document.fullscreenElement)arm(); });
    arm();   /* التسليح الأول عند فتح التطبيق */
})();


/* ═══════════ تصحيح اسم زبون في دفتر الديون (CUST_RENAME) ═══════════ */
window.openRenameCust=function(){
    let m=document.getElementById('renameCustModal');
    if(!m){
        m=document.createElement('div');m.id='renameCustModal';m.className='modal-overlay';
        m.innerHTML=`<div class="modal-box" style="max-width:340px">
            <div class="modal-header"><h3>✏️ تعديل اسم زبون</h3>
            <button class="close-btn" onclick="closeModal('renameCustModal');document.getElementById('renameCustModal').style.display='none'">✕</button></div>
            <div style="display:flex;flex-direction:column;gap:.55rem">
                <label style="font-size:.7rem;font-weight:800;color:var(--t2)">الاسم الحالي (الخاطئ)</label>
                <input type="text" id="rnFrom" list="rnList" placeholder="اختر أو اكتب الاسم"
                    style="padding:.55rem;border-radius:9px;border:1.5px solid var(--border);background:var(--card2);color:var(--t)">
                <datalist id="rnList"></datalist>
                <label style="font-size:.7rem;font-weight:800;color:var(--t2)">الاسم الصحيح</label>
                <input type="text" id="rnTo" placeholder="الاسم الجديد"
                    style="padding:.55rem;border-radius:9px;border:1.5px solid rgba(124,58,237,.4);background:var(--card2);color:var(--t)">
                <div style="font-size:.66rem;color:var(--t3);line-height:1.6">تُنقل كل أرصدة الاسم القديم (دينار/دولار/730/24) إلى الاسم الجديد — وإن كان الجديد موجوداً تُدمج الأرصدة معاً. يُنفَّذ مرة واحدة ولا يُتراجع عنه إلا بتعديل معاكس.</div>
                <button onclick="doRenameCust()" style="border:none;border-radius:10px;background:#7c3aed;color:#fff;padding:.65rem;font-size:.82rem;font-weight:900;font-family:Tajawal,sans-serif;cursor:pointer">✔️ نفّذ التصحيح</button>
            </div></div>`;
        document.body.appendChild(m);
    }
    const dl=document.getElementById('rnList');
    dl.innerHTML=[...new Set(debts.map(d=>d.c))].sort().map(n=>`<option value="${n}">`).join('');
    document.getElementById('rnFrom').value='';document.getElementById('rnTo').value='';
    m.classList.add('active');
    m.style.cssText+=';display:flex!important;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);align-items:center;justify-content:center;padding:1rem';
    setTimeout(()=>document.getElementById('rnFrom').focus(),250);
};
window.doRenameCust=function(){
    const from=(document.getElementById('rnFrom').value||'').trim().replace(/\s+/g,' ');
    const to  =(document.getElementById('rnTo').value||'').trim().replace(/\s+/g,' ');
    if(!from||!to)return toast('أدخل الاسمين','error');
    if(from===to)return toast('الاسمان متطابقان','error');
    const cur=debts.filter(d=>d.c===from);
    if(!cur.length)return toast('لا أرصدة بهذا الاسم في الدفتر','error');
    const merge=debts.some(d=>d.c===to);
    if(!confirm(`نقل أرصدة «${from}» إلى «${to}»${merge?' (سيُدمج مع أرصدته الحالية)':''}؟`))return;
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    emitEvent('CUST_RENAME',{from,to},
        {op:{c:to,t:'تعديل اسم',m:'—',a:0,_ts:Date.now(),dt:nowStr,note:`كان: ${from}`}});
    closeModal('renameCustModal');
    const _rnm=document.getElementById('renameCustModal'); if(_rnm)_rnm.style.display='none';
    toast(`✏️ صُحِّح الاسم: ${from} ← ${to}`,'success');
};


/* ═══════════ تصحيح رصيد زبون (DEBT_FIX) — قيد دفتري بحت ═══════════ */
window.openDebtFix=function(){
    let m=document.getElementById('debtFixModal');
    if(!m){
        m=document.createElement('div');m.id='debtFixModal';m.className='modal-overlay';
        m.innerHTML=`<div class="modal-box" style="max-width:350px">
            <div class="modal-header"><h3>🩹 تصحيح رصيد زبون</h3>
            <button class="close-btn" onclick="closeModal('debtFixModal');document.getElementById('debtFixModal').style.display='none'">✕</button></div>
            <div style="display:flex;flex-direction:column;gap:.55rem">
                <label style="font-size:.7rem;font-weight:800;color:var(--t2)">الزبون</label>
                <input type="text" id="dfCust" list="dfList" placeholder="اختر أو اكتب الاسم" oninput="_dfShowCur()"
                    style="padding:.55rem;border-radius:9px;border:1.5px solid var(--border);background:var(--card2);color:var(--t)">
                <datalist id="dfList"></datalist>
                <label style="font-size:.7rem;font-weight:800;color:var(--t2)">النوع</label>
                <select id="dfType" onchange="_dfShowCur()" style="padding:.55rem;border-radius:9px;border:1.5px solid var(--border);background:var(--card2);color:var(--t);font-family:Tajawal,sans-serif;font-weight:800">
                    <option value="دينار">💵 دينار</option>
                    <option value="دولار">💲 دولار</option>
                    <option value="ذهب 730">👑 ذهب 730</option>
                    <option value="ذهب 24">💎 ذهب 24</option>
                </select>
                <div id="dfCur" style="font-size:.74rem;font-weight:800;color:var(--t2);text-align:center;background:var(--card2);border-radius:8px;padding:.4rem">—</div>
                <label style="font-size:.7rem;font-weight:800;color:var(--t2)">الرصيد الصحيح (موجب = لنا · سالب = علينا)</label>
                <input type="text" id="dfTarget" inputmode="decimal" dir="ltr" placeholder="0"
                    style="padding:.55rem;border-radius:9px;border:1.5px solid rgba(217,119,6,.45);background:var(--card2);color:var(--t);font-family:monospace;font-weight:900;text-align:center;font-size:1rem">
                <div style="font-size:.64rem;color:var(--t3);line-height:1.6">قيد دفتري بحت — لا يمسّ السيولة ولا المخزون. يُسجَّل في السجل ويمكن عكسه بحذفه.</div>
                <button onclick="doDebtFix()" style="border:none;border-radius:10px;background:#d97706;color:#fff;padding:.65rem;font-size:.82rem;font-weight:900;font-family:Tajawal,sans-serif;cursor:pointer">✔️ اضبط الرصيد</button>
            </div></div>`;
        document.body.appendChild(m);
    }
    document.getElementById('dfList').innerHTML=[...new Set(debts.map(d=>d.c))].sort().map(n=>`<option value="${n}">`).join('');
    document.getElementById('dfCust').value='';document.getElementById('dfTarget').value='';
    document.getElementById('dfCur').textContent='—';
    m.classList.add('active');
    m.style.cssText+=';display:flex!important;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);align-items:center;justify-content:center;padding:1rem';
    setTimeout(()=>document.getElementById('dfCust').focus(),250);
};
/* مصيدة: أي عطل داخل الفتح يظهر برسالة بدل الصمت */
const _odf=window.openDebtFix;
window.openDebtFix=function(){try{_odf();}catch(e){alert('خطأ في فتح نافذة تصحيح الرصيد:\n'+e.message);}};
window._dfShowCur=function(){
    const c=(document.getElementById('dfCust').value||'').trim();
    const t=document.getElementById('dfType').value;
    const cur=c?getCustBal(c,t):0;
    const dec=t==='دينار'?0:t==='دولار'?2:3;
    document.getElementById('dfCur').innerHTML=c
        ?`الرصيد الحالي: <b style="color:${cur>0.001?'var(--gr)':cur<-0.001?'var(--rd)':'var(--t2)'}">${fmt(cur,dec)}</b> ${cur>0.001?'(لنا)':cur<-0.001?'(علينا)':''}`
        :'—';
};
window.doDebtFix=function(){
    const c=(document.getElementById('dfCust').value||'').trim().replace(/\s+/g,' ');
    const t=document.getElementById('dfType').value;
    const raw=String(document.getElementById('dfTarget').value||'').replace(/\s/g,'').replace(',','.');
    if(!c)return toast('اكتب اسم الزبون','error');
    if(raw==='')return toast('أدخل الرصيد الصحيح','error');
    const target=parseFloat(raw);
    if(isNaN(target))return toast('قيمة غير صالحة','error');
    const cur=getCustBal(c,t);
    const dec=t==='دينار'?0:t==='دولار'?2:3;
    if(Math.abs(cur-target)<0.0001)return toast('الرصيد الحالي هو نفسه — لا شيء يُصحَّح','info');
    if(!confirm(`ضبط رصيد ${t} للزبون «${c}»:\nمن ${fmt(cur,dec)} إلى ${fmt(target,dec)} ؟`))return;
    const nowStr=new Date().toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
    emitEvent('DEBT_FIX',{c,type:t,target},
        {op:{c,t:'تصحيح رصيد',m:t,a:Math.abs(target-cur),_ts:Date.now(),dt:nowStr,
             note:`كان ${fmt(cur,dec)} → صار ${fmt(target,dec)}`}});
    closeModal('debtFixModal');
    const _dfm=document.getElementById('debtFixModal'); if(_dfm)_dfm.style.display='none';
    try{renderDebts();}catch(e){}
    toast(`🩹 ضُبط رصيد ${t} لـ${c}: ${fmt(target,dec)}`,'success');
};


/* ═══════════ نوافذ تأكيد/تنبيه داخلية — لا تُخرج من ملء الشاشة ═══════════ */
window.appConfirm=function(msg,okTxt,cancelTxt){
    return new Promise(res=>{
        let m=document.getElementById('appConfirmModal');
        if(m)m.remove();
        m=document.createElement('div');m.id='appConfirmModal';
        m.style.cssText='position:fixed;inset:0;z-index:2147483200;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:1rem';
        m.innerHTML=`<div style="background:var(--card);border:1.5px solid var(--border);border-radius:16px;max-width:360px;width:100%;box-shadow:0 14px 50px rgba(0,0,0,.55);padding:1.1rem;font-family:Tajawal,sans-serif">
            <div style="font-weight:800;color:var(--t);font-size:.92rem;line-height:1.9;white-space:pre-line;text-align:right">${msg}</div>
            <div style="display:flex;gap:.55rem;margin-top:1rem">
                <button id="acOk" style="flex:1;padding:.7rem;border:none;border-radius:10px;background:var(--rd);color:#fff;font-weight:900;font-family:Tajawal,sans-serif;font-size:.85rem;cursor:pointer">${okTxt||'تأكيد'}</button>
                <button id="acNo" style="flex:1;padding:.7rem;border:1.5px solid var(--border);border-radius:10px;background:transparent;color:var(--t2);font-weight:800;font-family:Tajawal,sans-serif;font-size:.85rem;cursor:pointer">${cancelTxt||'إلغاء'}</button>
            </div></div>`;
        document.body.appendChild(m);
        const done=v=>{m.remove();document.removeEventListener('keydown',key,true);res(v);};
        const key=e=>{if(e.key==='Enter'){e.preventDefault();done(true);}else if(e.key==='Escape'){e.preventDefault();done(false);}};
        document.addEventListener('keydown',key,true);
        m.querySelector('#acOk').onclick=()=>done(true);
        m.querySelector('#acNo').onclick=()=>done(false);
        m.onclick=e=>{if(e.target===m)done(false);};
        setTimeout(()=>m.querySelector('#acOk').focus(),60);
    });
};
window.appAlert=function(msg){
    return new Promise(res=>{
        appConfirm(msg,'حسناً','إغلاق').then(()=>res());
    });
};


/* ═══════════ نافذة تدقيق السيولة ═══════════ */
window.openCashAudit=function(){
    const r=(typeof cashAudit==='function')?cashAudit():{rows:[],final:0};
    let m=document.getElementById('cashAuditModal'); if(m)m.remove();
    m=document.createElement('div');m.id='cashAuditModal';
    m.style.cssText='position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:1rem';
    const rowsH=r.rows.map(x=>`
        <tr style="border-bottom:1px solid var(--border)">
            <td style="padding:.3rem .45rem;font-size:.68rem;color:var(--t3);white-space:nowrap">${x.dt}</td>
            <td style="padding:.3rem .45rem;font-size:.72rem;font-weight:800">${x.t}${x.c?(' — '+x.c):''}</td>
            <td style="padding:.3rem .45rem;font-family:monospace;font-weight:900;letter-spacing:.5px;text-align:left;direction:ltr;color:${x.delta>=0?'var(--gr)':'var(--rd)'}">${x.delta>=0?'+':''}${fmt(x.delta,0)}</td>
            <td style="padding:.3rem .45rem;font-family:monospace;font-weight:800;letter-spacing:.5px;text-align:left;direction:ltr;color:var(--t2)">${fmt(x.bal,0)}</td>
        </tr>`).join('');
    m.innerHTML=`<div style="background:var(--card);border:1.5px solid var(--border);border-radius:16px;max-width:640px;width:100%;max-height:84vh;display:flex;flex-direction:column;box-shadow:0 14px 50px rgba(0,0,0,.55);padding:1rem;font-family:Tajawal,sans-serif">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.55rem">
            <h3 style="margin:0;font-size:.92rem;color:#0ea5e9">🧮 تدقيق السيولة — ${r.rows.length} عملية</h3>
            <button onclick="document.getElementById('cashAuditModal').remove()" style="border:none;background:rgba(239,68,68,.1);color:#ef4444;border-radius:8px;width:30px;height:30px;font-weight:900;cursor:pointer">✕</button>
        </div>
        <div style="overflow-y:auto;flex:1">
            <table style="width:100%;border-collapse:collapse">
                <thead><tr style="position:sticky;top:0;background:var(--card2)">
                    <th style="padding:.35rem;font-size:.66rem;color:var(--t2)">التاريخ</th>
                    <th style="padding:.35rem;font-size:.66rem;color:var(--t2)">العملية</th>
                    <th style="padding:.35rem;font-size:.66rem;color:var(--t2)">Δ السيولة</th>
                    <th style="padding:.35rem;font-size:.66rem;color:var(--t2)">الرصيد بعده</th>
                </tr></thead>
                <tbody>${rowsH||'<tr><td colspan="4" style="text-align:center;padding:1rem;color:var(--t3)">لا عمليات نقدية</td></tr>'}</tbody>
            </table>
        </div>
        <div style="margin-top:.55rem;text-align:center;font-weight:900;font-size:.92rem">
            الرصيد الختامي: <span style="font-family:monospace;letter-spacing:.5px;direction:ltr;color:var(--g400)">${fmt(r.final,0)} دج</span>
            ${Math.abs(r.final-(B.دينار||0))>0.5?`<div style="color:#ef4444;font-size:.7rem;margin-top:.2rem">⚠️ يخالف المعروض حالياً (${fmt(B.دينار,0)}) — أعد فتح التطبيق</div>`:''}
        </div></div>`;
    m.onclick=e=>{if(e.target===m)m.remove();};
    document.body.appendChild(m);
};


/* ═══ خالص/غير خالص في تسوية الذهب بالسعر (gsm) ═══ */
window._gsmPaid=false;
window._gsmSetPaid=function(p){
    window._gsmPaid=!!p;
    const pb=document.getElementById('gsmPaidBtn'),db=document.getElementById('gsmDebtBtn');
    if(pb){pb.style.background=p?'rgba(22,163,74,.15)':'transparent';}
    if(db){db.style.background=p?'transparent':'rgba(217,119,6,.12)';}
    if(typeof _gsmPreview==='function')try{_gsmPreview();}catch(e){}
    const pw=document.getElementById('gsmPartialW'); if(pw&&pw.dispatchEvent)pw.dispatchEvent(new Event('input'));
};


/* ═══════════ منعش شريط التنقل السفلي ═══════════
   على أندرويد قد يبقى الشريط الثابت خارج الإطار بعد إغلاق لوحة المفاتيح
   أو العودة من الخلفية — إعادة رسم قسرية تعيده لمكانه. */
window._navNudge=function(){
    try{
        const n=document.querySelector('.bnav');
        if(!n||getComputedStyle(n).display==='none')return;   /* لا نمس أدواراً يخفيها CSS */
        /* إجبار إعادة الرسم بلا إخفاء مرئي — كان display:none يسبّب وميض الشريط */
        n.style.transform='translateZ(0)';
        void n.offsetHeight;                 /* قراءة تُجبر reflow دون أي تغيّر بصري */
        n.style.transform='';
    }catch(e){}
};
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(_navNudge,350);});
window.addEventListener('resize',()=>{clearTimeout(window.__nvT);window.__nvT=setTimeout(_navNudge,300);});
window.addEventListener('orientationchange',()=>setTimeout(_navNudge,450));


/* ═══════════ سلة المحذوفات: الإلغاءات الحية + استرجاع = إلغاء الإلغاء ═══════════ */
window.openTrash=function(){
    const vE=_allEvents.filter(e=>e.type==='VOID');
    const vT=new Set(vE.map(e=>e.data&&e.data.voids).filter(Boolean));
    const act=vE.filter(v=>!vT.has(v.id)).sort((a,b)=>(b.ts||0)-(a.ts||0));
    const label=t=>{
        if(!t)return{ic:'؟',tx:'حدث غير موجود (أقدم من هذا الجهاز)'};
        const d=t.display||{};
        if(d.rafInvoice)return{ic:'🔥',tx:`فاتورة رافيناج — ${d.rafInvoice.c} · خالص ${fmt(d.rafInvoice.eq24||0,2)}غ`};
        if(d.invoice)return{ic:d.invoice.recv?'📥':'🧾',tx:`${d.invoice.recv?'وصل قبض 730':d.invoice.t==='sell'?'فاتورة بيع':'فاتورة شراء'} — ${d.invoice.c}`};
        if(d.op)return{ic:'📄',tx:`${d.op.t||t.type} — ${d.op.c||''} · ${fmt(d.op.a||0,2)}`};
        return{ic:'📄',tx:t.type};
    };
    let m=document.getElementById('trashModal'); if(m)m.remove();
    m=document.createElement('div');m.id='trashModal';
    m.style.cssText='position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:1rem';
    const rows=act.map(v=>{
        const t=_allEvents.find(e=>e.id===(v.data&&v.data.voids));
        const L=label(t);
        const when=new Date(v.ts||0).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
        return`<div style="display:flex;justify-content:space-between;align-items:center;gap:.6rem;border-bottom:1px solid var(--border);padding:.5rem .2rem">
            <div style="min-width:0">
                <div style="font-weight:800;font-size:.78rem">${L.ic} ${L.tx}</div>
                <div style="font-size:.64rem;color:var(--t3)">حُذف: ${when}</div>
            </div>
            ${t?`<button onclick="restoreTrash('${v.id}')" style="flex:0 0 auto;border:1.5px solid var(--gr);background:rgba(22,163,74,.08);color:var(--gr);border-radius:9px;padding:.4rem .7rem;font-weight:900;font-family:Tajawal,sans-serif;font-size:.72rem;cursor:pointer">↩️ استرجاع</button>`:''}
        </div>`;
    }).join('');
    m.innerHTML=`<div style="background:var(--card);border:1.5px solid var(--border);border-radius:16px;max-width:520px;width:100%;max-height:82vh;display:flex;flex-direction:column;box-shadow:0 14px 50px rgba(0,0,0,.55);padding:1rem;font-family:Tajawal,sans-serif">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.55rem">
            <h3 style="margin:0;font-size:.92rem;color:#64748b">🗑️ سلة المحذوفات — ${act.length}</h3>
            <button onclick="document.getElementById('trashModal').remove()" style="border:none;background:rgba(239,68,68,.1);color:#ef4444;border-radius:8px;width:30px;height:30px;font-weight:900;cursor:pointer">✕</button>
        </div>
        <div style="font-size:.66rem;color:var(--t3);margin-bottom:.5rem;line-height:1.7">كل معاملة أو فاتورة حُذفت محفوظة هنا — «استرجاع» يعيدها <b>بكامل أثرها المالي</b> (المخزون والديون والسيولة) كأن الحذف لم يكن.</div>
        <div style="overflow-y:auto;flex:1">${rows||'<div style="text-align:center;padding:1.2rem;color:var(--t3)">السلة فارغة</div>'}</div>
    </div>`;
    m.onclick=e=>{if(e.target===m)m.remove();};
    document.body.appendChild(m);
};
window.restoreTrash=async function(voidId){
    if(!(await appConfirm('استرجاع هذا العنصر بكامل أثره المالي؟','↩️ استرجاع')))return;
    emitEvent('VOID',{voids:voidId},{});
    setTimeout(()=>{try{openTrash();}catch(e){} try{updAll();renderLog&&renderLog();renderDebts&&renderDebts();renderArchive&&renderArchive();}catch(e){}},350);
    toast('↩️ استُرجع العنصر وعاد أثره كاملاً','success');
};


/* ═══════════ الفائدة الشهرية (أمر صوتي: «مدلي الفائدة») ═══════════
   رافيناج = مجموع الأجرة · البيع/الشراء = مبيعات − مشتريات الشهر (بالدينار) */
/* ═══ الفائدة الشهرية بمفهوم الأصول: تُلتقط أصول بداية كل شهر، والفائدة = الحالية − أصول بداية الشهر ═══ */
window._assetSnapKey='gp12_asset_snaps';
window._getAssetSnaps=function(){ try{return JSON.parse(localStorage.getItem(window._assetSnapKey)||'{}')||{};}catch(e){return {};} };
window._monthKeyNow=function(d){ d=d||new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'); };
window._captureMonthlyAsset=function(){
    try{
        const snaps=window._getAssetSnaps(); const curM=window._monthKeyNow();
        if(snaps.baseline==null){
            /* أول تشغيل: هذا الشهر استثناء — الفائدة = مجموع الأصول نفسه (لا نمو).
               نضع خط الأساس = 0 فيصير (net()-0)=net()=مجموع الأصول. */
            snaps.baseline=0; snaps.baselineMonth=curM; snaps.firstMonth=curM;
            if(!snaps.history)snaps.history={};
        }
        else if(snaps.baselineMonth!==curM){
            /* دخلنا شهراً جديداً: احفظ ربح الشهر المنقضي */
            if(!snaps.history)snaps.history={};
            const endAssets=(snaps._lastKnown!=null?snaps._lastKnown:net());
            snaps.history[snaps.baselineMonth]={
                start:snaps.baseline,          /* 0 للشهر الأول، وأصول البداية لغيره */
                end:endAssets,
                profit:endAssets-snaps.baseline /* الشهر الأول: الربح = كل الأصول */
            };
            /* من الآن: كل شهر جديد يبدأ من الأصول الحالية (الحساب الصحيح — ربحه يبدأ 0) */
            snaps.baseline=net(); snaps.baselineMonth=curM;
        }
        snaps._lastKnown=net();
        localStorage.setItem(window._assetSnapKey,JSON.stringify(snaps));
    }catch(e){}
};
/* استرجاع ذاكرة الأشهر السابقة (ربح كل شهر منقضٍ) */
window._getMonthlyHistory=function(){
    try{ const s=window._getAssetSnaps(); return s.history||{}; }catch(e){ return {}; }
};
window._monthlyAssetProfit=function(){
    try{
        window._captureMonthlyAsset();
        const s=window._getAssetSnaps();
        if(s.baseline==null)return null;
        /* الشهر الأول (لا يوجد شهر منقضٍ في الذاكرة بعد): الفائدة = مجموع الأصول نفسه.
           من الشهر التالي فصاعداً: الفائدة = النمو (الأصول الآن − أصول بداية الشهر). */
        const hasHistory = s.history && Object.keys(s.history).length>0;
        if(!hasHistory) return net();          /* الشهر الأول: الفائدة = كل الأصول */
        return net()-s.baseline;                /* الأشهر التالية: النمو فقط */
    }catch(e){return null;}
};

/* حساب الفائدة الشهرية — مستقلة (تُستعمل في تصدير الديون وغيره) */
window._calcMonthProfit=function(mk){
    try{
        const inM=dt=>_profitMonthKey(dt)===mk;
        const rafFee=(rafInvoices||[]).filter(r=>inM(r.dt)).reduce((s,r)=>s+(r.fee||0),0);
        const _eqW=inv=>((inv.items||[]).reduce((s,it)=>s+((it.w||0)*((it.k||730)/730)),0));
        let buyDz=0,buyW=0;
        (invoices||[]).filter(i=>inM(i.dt)&&i.t==='buy'&&!i.recv).forEach(i=>{buyDz+=(i.total??i.tp??0);buyW+=_eqW(i);});
        let sellDz=0,sellW=0;
        (invoices||[]).filter(i=>inM(i.dt)&&i.t==='sell').forEach(i=>{sellDz+=(i.total??i.tp??0);sellW+=_eqW(i);});
        const _shpP=(()=>{ const s=((ops||[]).find(o=>o&&o.t==='شحن'&&(o.su||0)>0)||{}).su; return s||parseFloat(String(localStorage.getItem('gp12_shiprate')||'').replace(',','.'))||0; })();
        const _gpNow=(typeof goldPrice!=='undefined'?goldPrice:0)||0;
        const _dedNow=_gpNow*0.001/0.730;
        (dubaiInvoices||[]).filter(x=>inM(x.dt)&&x.usd>0&&x.w>0).forEach(x=>{
            const _xts=(()=>{const m=String(x.dt||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():0;})();
            const rt=(typeof _lastDollarSellRate==='function'?_lastDollarSellRate(_xts):0)||(x.rate||0)||dollarRate||0; if(!(rt>0))return;
            const eq730=Math.round((x.w/0.730)*10)/10;
            const gpr=(x.usd-x.w*_shpP)*rt/eq730/100;
            const gprR=Math.round((gpr-_dedNow)/1000)*1000;
            sellDz+=gprR*eq730;
            sellW+=eq730;
        });
        let trade=0;
        if(buyW>0.001&&sellW>0.001){
            const matchedW=Math.min(sellW,buyW);
            trade=(sellDz/sellW-buyDz/buyW)*matchedW;
        }
        return rafFee+trade;
    }catch(e){return null;}
};

window._profitMonthKey=function(dt){
    const m=String(dt||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m?`${m[3]}-${m[2]}`:null;
};
window.openProfitModal=function(sel){
    const months=new Set();
    (rafInvoices||[]).forEach(r=>{const k=_profitMonthKey(r.dt);if(k)months.add(k);});
    (invoices||[]).forEach(i=>{const k=_profitMonthKey(i.dt);if(k)months.add(k);});
    const list=[...months].sort().reverse();
    if(!list.length)return toast('لا فواتير بعد','info');
    const mk=sel||list[0];
    const inM=dt=>_profitMonthKey(dt)===mk;
    const rafFee=(rafInvoices||[]).filter(r=>inM(r.dt)).reduce((s,r)=>s+(r.fee||0),0);
    /* ═ مبدأ الميزان المتطابق: الفائدة فقط على ما اشتريتَه وبعتَه ═
       ما بِيع زائداً عن المشتريات (أرصدة افتتاحية مثلاً) لا تدخل فائدته */
    const _eqW=inv=>((inv.items||[]).reduce((s,it)=>s+((it.w||0)*((it.k||730)/730)),0));
    let buyDz=0,buyW=0;
    (invoices||[]).filter(i=>inM(i.dt)&&i.t==='buy'&&!i.recv).forEach(i=>{buyDz+=(i.total??i.tp??0);buyW+=_eqW(i);});
    /* ═══ البيع: نفس منطق الأرشيف بالضبط (محلي بالمكافئ 730 + دبي بتقريب 1000/خصم تكرير) ═══ */
    let sellDz=0,sellW=0;
    (invoices||[]).filter(i=>inM(i.dt)&&i.t==='sell').forEach(i=>{sellDz+=(i.total??i.tp??0);sellW+=_eqW(i);});
    const _shpP=(()=>{ const s=((ops||[]).find(o=>o&&o.t==='شحن'&&(o.su||0)>0)||{}).su; return s||parseFloat(String(localStorage.getItem('gp12_shiprate')||'').replace(',','.'))||0; })();
    const _gpNow=(typeof goldPrice!=='undefined'?goldPrice:0)||0;
    const _dedNow=_gpNow*0.001/0.730;   /* خصم خسارة التكرير 1‰ (كالأرشيف) */
    (dubaiInvoices||[]).filter(x=>inM(x.dt)&&x.usd>0&&x.w>0).forEach(x=>{
        const _xts=(()=>{const m=String(x.dt||'').match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?new Date(+m[3],+m[2]-1,+m[1]).getTime():0;})();
        const rt=(typeof _lastDollarSellRate==='function'?_lastDollarSellRate(_xts):0)||(x.rate||0)||dollarRate||0;
        if(!(rt>0))return;
        /* نفس صيغة الأرشيف: سعر الغرام مقرّب لأقرب 1000، مرجّح بالمكافئ 730 */
        const eq730=Math.round((x.w/0.730)*10)/10;
        const gpr=(x.usd-x.w*_shpP)*rt/eq730/100;
        const gprR=Math.round((gpr-_dedNow)/1000)*1000;
        sellDz+=gprR*eq730; sellW+=eq730;
    });
    let trade=0,matchedW=0,avgS=0,avgB=0;
    if(buyW>0.001&&sellW>0.001){
        matchedW=Math.min(sellW,buyW);
        avgS=sellDz/sellW; avgB=buyDz/buyW;
        trade=matchedW*(avgS-avgB);
    }
    const sells=sellDz,buys=buyDz,dubaiDz=0;   /* للتوافق مع الأسطر أدناه */
    const total=rafFee+trade;
    const F=v=>Math.round(v).toLocaleString('fr-FR');
    let m=document.getElementById('profitModal'); if(m)m.remove();
    m=document.createElement('div');m.id='profitModal';
    m.style.cssText='position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.72);display:flex;align-items:center;justify-content:center;padding:1rem';
    m.innerHTML=`<div style="background:var(--card);border:1.5px solid var(--g500);border-radius:16px;max-width:420px;width:100%;box-shadow:0 14px 50px rgba(0,0,0,.55);padding:1.1rem;font-family:Tajawal,sans-serif">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.6rem">
            <h3 style="margin:0;font-size:.95rem;color:var(--g600)">📈 الفائدة الشهرية</h3>
            <select onchange="openProfitModal(this.value)"
                style="padding:.4rem .6rem;border-radius:9px;border:1.5px solid var(--border);background:var(--card2);color:var(--t);font-family:Tajawal,sans-serif;font-weight:900">
                ${list.map(k=>`<option value="${k}" ${k===mk?'selected':''}>${k}</option>`).join('')}
            </select>
        </div>
        <div style="background:linear-gradient(135deg,#1f2937,#111827);border-radius:12px;padding:.85rem;text-align:center;margin-bottom:.7rem">
            <div style="font-size:.68rem;color:#9ca3af;font-weight:800">الفائدة الكلية — ${mk}</div>
            <div style="font-family:monospace;font-weight:900;font-size:1.5rem;color:${total>=0?'#34d399':'#f87171'};letter-spacing:.5px">${F(total)} دج</div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:.6rem">
            <div style="border:1.5px solid var(--border);border-radius:12px;padding:.7rem;text-align:center">
                <div style="font-size:.66rem;font-weight:800;color:var(--t3);margin-bottom:.3rem">🛒 فائدة البيع والشراء</div>
                <div style="font-family:monospace;font-weight:900;font-size:1.05rem;color:${trade>=0?'var(--gr)':'var(--rd)'}">${F(trade)} دج</div>
                <div style="font-size:.6rem;color:var(--t3);margin-top:.25rem">${matchedW>0?`متطابق ${fmt(matchedW,1)}غ × (بيع ${F(avgS)} − شراء ${F(avgB)})/غ`:'لا ميزان متطابق هذا الشهر'}</div>
            </div>
            <div style="border:1.5px solid var(--border);border-radius:12px;padding:.7rem;text-align:center">
                <div style="font-size:.66rem;font-weight:800;color:var(--t3);margin-bottom:.3rem">🔥 فائدة الرافيناج</div>
                <div style="font-family:monospace;font-weight:900;font-size:1.05rem;color:var(--g600)">${F(rafFee)} دج</div>
                <div style="font-size:.6rem;color:var(--t3);margin-top:.25rem">مجموع الأجرة</div>
            </div>
        </div>
        <button onclick="document.getElementById('profitModal').remove()"
            style="width:100%;margin-top:.8rem;padding:.6rem;border:1.5px solid var(--border);border-radius:10px;background:transparent;color:var(--t2);font-weight:800;font-family:Tajawal,sans-serif;cursor:pointer">إغلاق</button>
    </div>`;
    m.onclick=e=>{if(e.target===m)m.remove();};
    document.body.appendChild(m);
};


/* عرض سجل الزبون داخل التطبيق (لا PDF) */
window.showCustomerLog=function(c){
    if(!c)return;
    const custOps=ops.filter(o=>o.c===c);
    if(!custOps.length)return toast('لا عمليات لهذا الزبون','info');
    const html=buildCustomerLogHtml(c,custOps);
    let m=document.getElementById('custLogModal'); if(m)m.remove();
    m=document.createElement('div');m.id='custLogModal';
    m.style.cssText='position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.75);display:flex;flex-direction:column;padding:0';
    m.innerHTML=`<div style="flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;background:var(--card);padding:.6rem .9rem;border-bottom:1px solid var(--border)">
            <strong style="font-family:Tajawal,sans-serif;color:var(--g600)">📒 سجل ${c}</strong>
            <button onclick="document.getElementById('custLogModal').remove()" style="border:none;background:rgba(239,68,68,.12);color:#ef4444;border-radius:8px;width:34px;height:34px;font-weight:900;cursor:pointer">✕</button>
        </div>
        <div style="flex:1;overflow:auto;background:#fff">${html}</div>`;
    document.body.appendChild(m);
};


/* عرض تدقيق مخزون الـ24: كل حركة بدلتاها ورصيد جارٍ */
window.showG24Audit=function(){
    const r=(typeof g24Audit==='function')?g24Audit():{rows:[],final:0};
    let m=document.getElementById('g24AuditModal'); if(m)m.remove();
    m=document.createElement('div');m.id='g24AuditModal';
    m.style.cssText='position:fixed;inset:0;z-index:2147483100;background:rgba(0,0,0,.75);display:flex;flex-direction:column;padding:0';
    const rowsH=r.rows.map(x=>`
        <div style="display:flex;justify-content:space-between;gap:.5rem;padding:.5rem .7rem;border-bottom:1px solid var(--border);font-size:.76rem">
            <span style="color:var(--t2);min-width:0;flex:1"><b>${x.t}</b> ${x.c?('· '+x.c):''}<br><small style="color:var(--t3)">${x.dt}</small></span>
            <span style="font-family:monospace;font-weight:900;color:${x.delta>=0?'var(--gr)':'var(--rd)'};white-space:nowrap">${x.delta>=0?'+':''}${fmt(x.delta,2)}</span>
            <span style="font-family:monospace;font-weight:900;white-space:nowrap;min-width:72px;text-align:left">${fmt(x.bal,2)}</span>
        </div>`).join('');
    m.innerHTML=`<div style="flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;background:var(--card);padding:.7rem .9rem;border-bottom:1px solid var(--border)">
            <strong style="font-family:Tajawal,sans-serif;color:var(--g600)">🔍 تدقيق مخزون 24 — ${r.rows.length} حركة</strong>
            <button onclick="document.getElementById('g24AuditModal').remove()" style="border:none;background:rgba(239,68,68,.12);color:#ef4444;border-radius:8px;width:34px;height:34px;font-weight:900;cursor:pointer">✕</button>
        </div>
        <div style="flex:0 0 auto;background:linear-gradient(135deg,#1f2937,#111827);color:#fbbf24;text-align:center;padding:.6rem;font-family:monospace;font-weight:900;font-size:1.1rem">الرصيد النهائي: ${fmt(r.final,2)} غ</div>
        <div style="flex:0 0 auto;display:flex;justify-content:space-between;padding:.4rem .7rem;background:var(--card2);font-size:.66rem;color:var(--t3);font-weight:800">
            <span style="flex:1">العملية</span><span style="min-width:60px;text-align:center">الحركة</span><span style="min-width:72px;text-align:left">الرصيد</span>
        </div>
        <div style="flex:1;overflow:auto;background:var(--bg)">${rowsH||'<div style="text-align:center;padding:2rem;color:var(--t3)">لا حركات</div>'}</div>`;
    document.body.appendChild(m);
};


/* عرض داخلي موحّد — بديل كل التنزيلات */
window._openInternalView=function(html,title){
    let m=document.getElementById('internalViewModal'); if(m)m.remove();
    m=document.createElement('div');m.id='internalViewModal';
    m.style.cssText='position:fixed;inset:0;z-index:2147483150;background:rgba(0,0,0,.75);display:flex;flex-direction:column';
    m.innerHTML=`<div style="flex:0 0 auto;display:flex;justify-content:space-between;align-items:center;background:var(--card);padding:.55rem .9rem;border-bottom:1px solid var(--border)">
            <strong style="font-family:Tajawal,sans-serif;color:var(--g600);font-size:.85rem">👁 ${title||'عرض'}</strong>
            <div style="display:flex;gap:.4rem">
                <button onclick="window._printA4(document.getElementById('_ivBody').innerHTML,'${(title||'').replace(/'/g,'')}')" style="border:none;background:rgba(180,83,9,.14);color:#b45309;border-radius:8px;padding:0 .7rem;height:32px;font-weight:900;cursor:pointer;font-family:Tajawal,sans-serif;font-size:.8rem">🖨️ طباعة A4</button>
                <button onclick="document.getElementById('internalViewModal').remove()" style="border:none;background:rgba(239,68,68,.12);color:#ef4444;border-radius:8px;width:32px;height:32px;font-weight:900;cursor:pointer">✕</button>
            </div>
        </div>
        <div id="_ivBody" style="flex:1;overflow:auto;background:#fff;padding:.6rem">${html}</div>`;
    document.body.appendChild(m);
};

/* طباعة على ورق A4 عبر نافذة طباعة مخصّصة */
window._printA4=function(innerHtml,title){
    const w=window.open('','_blank');
    if(!w){ toast('اسمح بالنوافذ المنبثقة للطباعة','error'); return; }
    w.document.write('<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>'+(title||'طباعة')+'</title>'
        +'<style>@page{size:A4;margin:12mm}'
        +'*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;color-adjust:exact!important}'
        +'body{font-family:\'Tajawal\',\'Segoe UI\',Tahoma,sans-serif;margin:0;padding:0;background:#fff;direction:rtl}'
        +'table{page-break-inside:auto}tr{page-break-inside:avoid}'
        +'</style></head><body>'+innerHtml+'</body></html>');
    w.document.close();
    /* انتظر رسم المحتوى ثم افتح حوار الطباعة */
    setTimeout(function(){ try{w.focus();w.print();}catch(e){} },400);
};


/* متوسط شراء ذهب البيع — مستقل، يُستدعى بعد كل حفظ/تحديث */
window._updBuyAvg=function(){
    try{
        const el=document.getElementById('goldSaleAvg');
        if(!el)return;
        let sWP=0,sW=0;
        (invoices||[]).filter(i=>i.t==='buy'&&!i.recv).forEach(inv=>{
            (inv.items||[]).forEach(it=>{
                const eq=+it.eq730||0,p=+it.ppg||0;
                if(eq>0&&p>0){sWP+=eq*p;sW+=eq;}
            });
        });
        if(sW>0){
            const avg=Math.round(sWP/sW);   /* السعر الحقيقي — بلا تقريب للوحدة */
            el.textContent=fmt(avg,0)+' دج/غ';
            el.title='متوسط شراء مرجّح على '+fmt(sW,2)+' غ';
        }else{ el.textContent='—'; }
    }catch(e){}
};


/* ═══ شراء/بيع لزبون (ولو لم يكن في دفتر الديون) ═══ */
window.openFreeTrade=function(){
    let m=document.getElementById('freeTradeModal');
    if(!m){
        m=document.createElement('div');m.id='freeTradeModal';m.className='modal-overlay';
        m.innerHTML=`<div class="modal-box" style="max-width:340px">
            <div class="modal-header"><h3>🛒 شراء/بيع لزبون</h3>
            <button class="close-btn" onclick="closeModal('freeTradeModal');document.getElementById('freeTradeModal').style.display='none'">✕</button></div>
            <div style="display:flex;flex-direction:column;gap:.55rem">
                <label style="font-size:.7rem;font-weight:800;color:var(--t2)">اسم الزبون</label>
                <input type="text" id="ftName" list="ftList" placeholder="اكتب اسماً جديداً أو اختر موجوداً"
                    style="padding:.55rem;border-radius:9px;border:1.5px solid var(--border);background:var(--card2);color:var(--t);font-family:Tajawal,sans-serif;font-weight:800">
                <datalist id="ftList"></datalist>
                <div style="font-size:.66rem;color:var(--t3);line-height:1.6">يعمل حتى لو لم يكن الزبون في دفتر الديون — ستفتح لك نافذة التصفية بأزرار الشراء والبيع الحر.</div>
                <button onclick="doFreeTrade()" style="border:none;border-radius:10px;background:#059669;color:#fff;padding:.65rem;font-size:.82rem;font-weight:900;font-family:Tajawal,sans-serif;cursor:pointer">➡️ متابعة</button>
            </div></div>`;
        document.body.appendChild(m);
    }
    /* اقتراحات: كل الأسماء المعروفة (ديون + عمليات) */
    try{
        const names=new Set();
        (debts||[]).forEach(d=>{ if(d.c)names.add(d.c); });
        (ops||[]).forEach(o=>{ if(o.c)names.add(o.c); });
        document.getElementById('ftList').innerHTML=[...names].sort().map(n=>`<option value="${n}">`).join('');
    }catch(e){}
    document.getElementById('ftName').value='';
    m.classList.add('active');
    m.style.cssText+=';display:flex!important;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.72);align-items:center;justify-content:center;padding:1rem';
    setTimeout(()=>document.getElementById('ftName').focus(),300);
};
window.doFreeTrade=function(){
    const n=(document.getElementById('ftName').value||'').trim();
    if(!n)return toast('أدخل اسم الزبون','error');
    closeModal('freeTradeModal');
    const m=document.getElementById('freeTradeModal'); if(m)m.style.display='none';
    openSettle(n);   /* تفتح نافذة التصفية — أزرار الشراء/البيع الحر تظهر ولو بلا رصيد */
};


/* ═══ تعديل وصل قبض 730: يفتح نافذة «قبضت» بالسبائك مملوءة (لا محرّر الفواتير) ═══ */
window.editRecvInv=function(id){
    const inv=(invoices||[]).find(x=>x.id===id);
    if(!inv||!inv.recv)return;
    if(typeof _invBarsConsumed==='function' && _invBarsConsumed(id)){
        toast('🚫 لا يمكن تعديل وصل قبض خرجت سبائكه من مخزون 730 (بيعت أو دخلت رافيناج أو ورشة)','error');
        return;
    }
    if(!confirm('تعديل وصل القبض؟ سيُلغى الوصل القديم ويُسجَّل بالسبائك الجديدة.'))return;
    openGiveTake('take');
    window._editingRecvId=id;
    document.getElementById('gtCustomer').value=inv.c||'';
    document.getElementById('gtMetal').value='ذهب 730';
    window.toggleGTKarat();
    const items=inv.items||[];
    /* البند الأول في الحقل الرئيسي، والباقي أسطراً */
    if(items[0]){
        const aEl=document.getElementById('gtAmount'); if(aEl){aEl.value=String(items[0].w).replace('.',','); if(typeof liveNum==='function')liveNum(aEl);}
        const kEl=document.getElementById('gtKarat'); if(kEl)kEl.value=String(items[0].k||'');
    }
    _gt730Cnt=0; const gb=document.getElementById('gt730Bars'); if(gb)gb.innerHTML='';
    items.slice(1).forEach(it=>_addGT730Bar(String(it.w).replace('.',','),it.k,true));
    _addGT730Bar(null,null,true);   /* سطر فارغ للإضافة */
    try{showGTBalance();window.calcGTEq();}catch(e){}
    toast('✏️ عدّل السبائك ثم احفظ — سيُستبدل الوصل القديم','info');
};
