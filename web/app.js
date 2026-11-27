const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const NB=' ';
const egp=n=>'EGP'+NB+Math.round(n).toLocaleString('en-US');
const t12=m=>{let h=Math.floor(m/60)%24,mm=m%60,ap=h>=12?'PM':'AM';h=h%12||12;return h+':'+String(mm).padStart(2,'0')+NB+ap};
const TZ='Africa/Cairo';
const ymd=d=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(d);
const nightYmd=(d=new Date())=>ymd(new Date(d.getTime()-6*3600e3));
const addDays=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const dparts=s=>{const d=new Date(s+'T12:00:00Z');return [d.toLocaleDateString('en-GB',{weekday:'short',timeZone:'UTC'}),d.getUTCDate(),d.toLocaleDateString('en-GB',{month:'short',timeZone:'UTC'}),s]};
let DAYS=[0,1,2,3].map(i=>dparts(addDays(nightYmd(),i)));
const dayStr=d=>DAYS[d]?`${DAYS[d][0]} ${DAYS[d][1]} ${DAYS[d][2]}`:'';

/* ---------- brand marks ---------- */
const XP='M0 0H31L50 18L68 0H100V31L83 50L100 66V100H68L50 83L31 100H0V69L17 50L0 31Z';
const LOGO=`<svg class="mark" viewBox="-3 -3 460 106" aria-label="XTRA"><g fill="currentColor" stroke="currentColor" stroke-width="5" stroke-linejoin="round" fill-rule="evenodd"><path d="${XP}"/><path transform="translate(118 0)" d="M0 0H100V50H69V100H31V50H0Z"/><path transform="translate(236 0)" d="M0 0H100V66H83L97 100H55L34 67V100H0Z M34 33V44H71V33Z"/><path transform="translate(354 0)" d="M0 0H100V100H69V67H32V100H0Z M32 34V44H69V34Z"/></g></svg>`;
const BIGX=c=>`<svg class="${c}" viewBox="-3 -3 106 106" aria-hidden="true"><path d="${XP}" fill="currentColor" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/></svg>`;
const ICON={
floor:'<path d="M3 4h18v16H3z"/><circle cx="8.5" cy="9.5" r="2.2"/><circle cx="15.5" cy="9.5" r="2.2"/><path d="M7 15.5h10"/>',
bookings:'<path d="M4 6h16v14H4zM4 10.5h16M8.5 3v5M15.5 3v5"/><path d="M8 14.5l2 2 4-4"/>',
door:'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2.5v2.5H14zM17.5 17.5H20V20h-2.5zM14 20h1M20 14v1"/>',
orders:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
guests:'<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5M16 5.2a3.4 3.4 0 0 1 0 6.6M18 14.8c1.7.7 2.9 2.4 3.4 5.2"/>',
page:'<path d="M7 2.5h10a1 1 0 0 1 1 1v17a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-17a1 1 0 0 1 1-1zM10.5 18.5h3"/>',
setup:'<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
editor:'<path d="M3 21h18M5 17l10-10 3 3-10 10H5z"/><path d="M13 9l3 3"/>',
wa:'<path d="M4 20l1.3-4A8 8 0 1 1 8 18.8z"/><path d="M9 9.2c0 3 2.6 5.6 5.8 5.8l1-1.4-2-1-1 .8a4 4 0 0 1-2.2-2.2l.8-1-1-2z" fill="currentColor" stroke="none"/>',
mail:'<path d="M3 5h18v14H3z"/><path d="M3 6l9 7 9-7"/>',
admin:'<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>'};
const ic=(k,cls='')=>`<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;

/* ---------- furniture drawing ---------- */
const TK=['round','square','long','sofa','couch'];
const KLABEL={round:'Round table',square:'Square table',long:'Long table',sofa:'U-shaped sofa',couch:'Sofa and armchairs',bar:'Bar',dj:'DJ booth',stage:'Stage',entrance:'Entrance',zone:'Area'};
const chair=(x,y,a)=>`<rect class="ch" x="-9" y="-6.5" width="18" height="13" rx="4.5" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a.toFixed(1)})"/>`;
function furn(el,fill,tint){
  const n=el.seats;let o='',top='',bw,bh;
  const topAttr=`fill="${fill}" stroke="${tint?'none':'var(--chairline)'}" stroke-width="1.5"`;
  if(el.kind==='round'){const R=20+n*3;for(let i=0;i<n;i++){const a=(i/n)*Math.PI*2-Math.PI/2;o+=chair(Math.cos(a)*(R+12),Math.sin(a)*(R+12),a*180/Math.PI+90)}top=`<circle r="${R}" ${topAttr}/>`;bw=bh=2*(R+19)}
  else if(el.kind==='square'){const s=n<=2?50:62,d=s/2+11;const pos=n<=2?[[0,-d,0],[0,d,180]]:[[0,-d,0],[d,0,90],[0,d,180],[-d,0,270]];pos.slice(0,n).forEach(([x,y,a])=>o+=chair(x,y,a));top=`<rect x="${-s/2}" y="${-s/2}" width="${s}" height="${s}" rx="8" ${topAttr}/>`;bw=bh=s+36}
  else if(el.kind==='long'){const per=Math.ceil(n/2),w=per*36+16,h=54;for(let i=0;i<n;i++){const side=i<per?-1:1,k=i<per?i:i-per;o+=chair(-w/2+26+k*36,side*(h/2+11),side<0?0:180)}top=`<rect x="${-w/2}" y="${-h/2}" width="${w}" height="${h}" rx="8" ${topAttr}/>`;bw=w+8;bh=h+38}
  else if(el.kind==='sofa'){const tw=76+Math.max(0,n-6)*14,th=44,g=9,t=24,W=tw+2*(g+t),y0=-th/2-g-t,y1=th/2+8;
    const sh=`<path d="M${-W/2} ${y0+10}a10 10 0 0 1 10-10H${W/2-10}a10 10 0 0 1 10 10V${y1-6}a6 6 0 0 1-6 6H${W/2-t+6}a6 6 0 0 1-6-6V${y0+t}H${-W/2+t}V${y1-6}a6 6 0 0 1-6 6H${-W/2+6}a6 6 0 0 1-6-6Z"`;
    o+=`${sh} class="sofa"/>`+(tint?`${sh} fill="${fill}" opacity=".45"/>`:'');
    const seg=Math.max(2,Math.round(n/2));for(let i=1;i<seg;i++){const x=-W/2+t+(W-2*t)*i/seg;o+=`<path class="seam" d="M${x} ${y0+4}V${y0+t-4}"/>`}
    o+=`<path class="seam" d="M${-W/2+4} ${y0+t+(y1-y0-t)/2}H${-W/2+t-4}M${W/2-t+4} ${y0+t+(y1-y0-t)/2}H${W/2-4}"/>`;
    top=`<rect x="${-tw/2}" y="${-th/2}" width="${tw}" height="${th}" rx="8" ${topAttr}/>`;bw=W+6;bh=y1-y0+10}
  else if(el.kind==='couch'){const arm=n>=4?2:0,ns=n-arm,sw=Math.max(2,ns)*34+14,tw=Math.max(56,sw-40),th=34,sy=-th/2-10-26;
    const sh=`<rect x="${-sw/2}" y="${sy}" width="${sw}" height="26" rx="9"`;
    o+=`${sh} class="sofa"/>`+(tint?`${sh} fill="${fill}" opacity=".45"/>`:'');
    for(let i=1;i<Math.max(2,ns);i++){const x=-sw/2+7+34*i;o+=`<path class="seam" d="M${x} ${sy+5}V${sy+21}"/>`}
    if(arm){[-1,1].forEach(sd=>{const ar=`<rect x="${sd*(tw/2+12)-(sd<0?28:0)}" y="-14" width="28" height="28" rx="8"`;o+=`${ar} class="sofa"/>`+(tint?`${ar} fill="${fill}" opacity=".45"/>`:'')})}
    top=`<rect x="${-tw/2}" y="${-th/2}" width="${tw}" height="${th}" rx="8" ${topAttr}/>`;bw=Math.max(sw,arm?tw+80:tw)+6;bh=th/2-sy+8}
  return {svg:o+top,bw,bh,cy:el.kind==='sofa'?-11.5:el.kind==='couch'?-18:0};
}
const isT=el=>TK.includes(el.kind);
const ebox=el=>{if(!isT(el))return {x:el.x,y:el.y,w:el.w,h:el.h};const f=furn(el,'',0),r=el.rot%180!==0,w=r?f.bh:f.bw,h=r?f.bw:f.bh;
  let ox=0,oy=f.cy;const a=el.rot*Math.PI/180,dx=-oy*Math.sin(a),dy=oy*Math.cos(a);ox=dx;oy=dy;return {x:el.x+ox-w/2,y:el.y+oy-h/2,w,h}};

/* ---------- venue data (from the XTRA API) ---------- */
const mk=(kind,name,x,y,seats,rot=0)=>({id:'e'+(++mk.n),kind,name,x,y,seats,rot});mk.n=0;
const fx=(kind,name,x,y,w,h)=>({id:'e'+(++mk.n),kind,name,x,y,w,h,rot:0});
const zn=(area,x,y,w,h)=>({id:'e'+(++mk.n),kind:'zone',area,x,y,w,h,rot:0});
let VENUES=[],VDATA=[],MENU={},ITEMS={},ME=null,PLATFORM={bookingFeeBps:500,feeVatBps:1400},LIVE_INT={};
let S;
const V=()=>{if(S&&S.edEvent&&VIEW==='editor'){const e=(S.events||[]).find(x=>x.id===S.edEvent);if(e)return {...VDATA[S.vi],layout:e.layout,areas:e.tz,ev:e}}return VDATA[S.vi]};
const CFG=()=>V().cfg;
const TABLES=()=>V().layout.filter(isT);
function slots(){const c=CFG(),o=[];for(let m=c.first;m<=c.last;m+=c.step)o.push(m);return o}
const newGP=()=>({day:0,slot:null,party:4,area:null,step:'form',w:0,code:null,st:null,f:{name:'',phone:'',email:'',ig:'',gender:'',consent:true},others:[],err:'',busy:false});

/* ---------- API ---------- */
const store={get:k=>{try{return localStorage.getItem(k)}catch(_){return null}},set:(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(_){}}};
let TOKEN=store.get('xtra.staff'),GTOKEN=store.get('xtra.guest');
async function api(method,url,body,tok){
  const h={};if(body!==undefined)h['content-type']='application/json';const t=tok===undefined?TOKEN:tok;if(t)h.authorization='Bearer '+t;
  const r=await fetch('/api'+url,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body)});
  const data=r.headers.get('content-type')?.includes('json')?await r.json():null;
  if(!r.ok){const e=new Error(data?.message||'Something went wrong. Please try again.');e.status=r.status;e.code=data?.error;throw e}
  return data}
const GET=u=>api('GET',u),POST=(u,b={})=>api('POST',u,b),PUT=(u,b)=>api('PUT',u,b),PATCH=(u,b)=>api('PATCH',u,b),DEL=u=>api('DELETE',u);
const vurl=p=>`/venues/${VENUES[S.vi].id}${p}`;
/** Runs an API call, shows its error as a toast, and reloads the venue. */
async function act(fn,ok,{reload=true}={}){try{const r=await fn();if(reload)await refresh();if(ok)toast(typeof ok==='function'?ok(r):ok);return r}catch(e){toast(e.message);if(e.status===401)signOut();return null}}
const debounced={};function later(k,fn,ms=600){clearTimeout(debounced[k]);debounced[k]=setTimeout(()=>act(fn,null,{reload:false}),ms)}

/* ---------- API to screen shapes ---------- */
const P2E=n=>Math.round((n||0)/100),E2P=n=>Math.round((+n||0)*100);
const cap=s=>s?s[0].toUpperCase()+s.slice(1):'';
const fmtPhone=p=>{if(!p)return '—';const d=p.replace(/\D/g,'');if(d.startsWith('20')&&d.length===12){const l='0'+d.slice(2);return l.slice(0,3)+' '+l.slice(3,7)+' '+l.slice(7)}if(p.startsWith('+')){const [,cc,n]=telSplit(p);return `+${cc} ${n}`}return p};
/* Phone numbers: a country code picker (Egypt first) and the number. Values are kept as +<code><number>. */
const CC_AR=[['EG','Egypt','20'],['SA','Saudi Arabia','966'],['AE','United Arab Emirates','971'],['KW','Kuwait','965'],['QA','Qatar','974'],['BH','Bahrain','973'],['OM','Oman','968'],['JO','Jordan','962'],['LB','Lebanon','961'],['IQ','Iraq','964'],['SY','Syria','963'],['PS','Palestine','970'],['LY','Libya','218'],['SD','Sudan','249'],['TN','Tunisia','216'],['DZ','Algeria','213'],['MA','Morocco','212'],['YE','Yemen','967']];
const CC_W=[['AU','Australia','61'],['AT','Austria','43'],['BE','Belgium','32'],['BR','Brazil','55'],['CA','Canada','1'],['CN','China','86'],['CY','Cyprus','357'],['DK','Denmark','45'],['FR','France','33'],['DE','Germany','49'],['GR','Greece','30'],['IN','India','91'],['IE','Ireland','353'],['IT','Italy','39'],['JP','Japan','81'],['KE','Kenya','254'],['MX','Mexico','52'],['NL','Netherlands','31'],['NG','Nigeria','234'],['NO','Norway','47'],['PK','Pakistan','92'],['PL','Poland','48'],['PT','Portugal','351'],['RU','Russia','7'],['ZA','South Africa','27'],['KR','South Korea','82'],['ES','Spain','34'],['SE','Sweden','46'],['CH','Switzerland','41'],['TR','Turkey','90'],['UA','Ukraine','380'],['GB','United Kingdom','44'],['US','United States','1']];
const CC_ALL=[...CC_AR,...CC_W],CC_BYLEN=[...CC_AR,...CC_W].sort((a,b)=>b[2].length-a[2].length);
/* '+971501234567' → ['AE','971','501234567']; a local number counts as Egypt. */
function telSplit(v){const raw=String(v||'').trim(),d=raw.replace(/\D/g,'');
  if(/^(\+|00)/.test(raw)){const n=raw.startsWith('00')?d.slice(2):d,c=CC_BYLEN.find(c=>n.startsWith(c[2]));if(c)return [c[0],c[2],n.slice(c[2].length)]}
  return ['EG','20',d.replace(/^20(?=1\d{9}$)/,'')]}
const telJoin=(cc,num)=>{const d=String(num||'').replace(/\D/g,'').replace(/^0+/,'');return d?`+${cc}${d}`:''};
/* A full number that looks real: Egypt mobiles are 1X XXXX XXXX, elsewhere 6 to 13 digits. */
const telOk=v=>{if(!v)return false;const [,cc,n]=telSplit(v.startsWith('+')?v:'+20'+v.replace(/\D/g,'').replace(/^0/,''));return cc==='20'?/^1\d{9}$/.test(n):n.length>=6&&n.length<=13};
const telNorm=v=>{const t=String(v||'').trim();if(!t)return '';if(/^(\+|00)/.test(t))return '+'+t.replace(/\D/g,'').replace(/^00/,'');const d=t.replace(/\D/g,'').replace(/^0/,'').replace(/^20(?=1\d{9}$)/,'');return d?'+20'+d:''};
function telField({id='',bind='',value='',ph='',cls='',req=false,dis=false,label='Phone number'}={}){const [iso,cc,num]=telSplit(value);
  const opt=c=>`<option value="${c[2]}" data-iso="${c[0]}" ${c[0]===iso?'selected':''}>${c[1]} +${c[2]}</option>`;
  return `<div class="tel ${cls}"><span class="telcc"><b>${iso}</b> +${cc}<select data-telcc ${bind} aria-label="Country code" ${dis?'disabled':''}><optgroup label="Arab countries">${CC_AR.map(opt).join('')}</optgroup><optgroup label="Other countries">${CC_W.map(opt).join('')}</optgroup></select></span><input type="tel" inputmode="tel" autocomplete="off" ${id?`id="${id}"`:''} ${bind} value="${esc(num)}" placeholder="${esc(ph||(cc==='20'?'10 1234 5678':'Number'))}" aria-label="${esc(label)}" ${req?'required':''} ${dis?'disabled':''}></div>`}
/* The full value of a phone field, from its number box or its country select. */
const telVal=el=>{const w=el?.closest?.('.tel');if(!w)return (el?.value||'').trim();return telJoin(w.querySelector('select').value,w.querySelector('input').value)};
const telRead=id=>telVal($('#'+id));
const fv=el=>el.closest('.tel')?telVal(el):el.value;
document.addEventListener('change',e=>{const sel=e.target;if(!sel.matches?.('select[data-telcc]'))return;const o=sel.selectedOptions[0];
  sel.parentElement.firstChild.textContent=o.dataset.iso;sel.parentElement.childNodes[1].textContent=' +'+sel.value;sel.closest('.tel').querySelector('input').focus()},true);
const hm2min=s=>{const [h,m]=s.split(':').map(Number);let v=h*60+m;if(v<6*60)v+=1440;return v};
const min2hm=m=>String(Math.floor(m/60)%24).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
const dayIdx=d=>DAYS.findIndex(x=>x[3]===d);
const shortDate=iso=>iso?new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short',timeZone:TZ}):'—';
const SRC={online:'Booking page',staff:'Staff'};
const NOTIFY_IN={both:'both',whatsapp:'wa',email:'email'},NOTIFY_OUT={both:'both',wa:'whatsapp',email:'email'};
const TIERCOL=['var(--sky)','#d7dde3','var(--yellow)','var(--teal)','#c9b6ff'];
const STATUS_IN={in_review:'request',accepted:'accepted',confirmed:'confirmed',arrived:'arrived',completed:'done',declined:'declined',cancelled:'cancelled',no_show:'noshow'};
const SHAPES=['round','square','long','sofa','couch'];

function floorToLayout(items){
  const layout=[],areas=[];
  items.forEach(i=>{
    if(i.kind==='zone'){layout.push({id:i.id,kind:'zone',area:i.id,x:i.x,y:i.y,w:i.w,h:i.h,rot:0});areas.push({id:i.id,name:i.label||'Area',min:P2E(i.minSpend),dep:P2E(i.deposit)})}
    else if(i.kind==='table'||i.kind==='sofa')layout.push({id:i.id,kind:SHAPES.includes(i.shape)?i.shape:(i.kind==='sofa'?'sofa':'round'),name:i.label,x:i.x,y:i.y,seats:i.seats||2,rot:i.rotation||0});
    else if(i.kind!=='chair')layout.push({id:i.id,kind:i.kind,name:i.label||KLABEL[i.kind]||'',x:i.x,y:i.y,w:i.w,h:i.h,rot:i.rotation||0});
  });
  return {layout,areas}}
function layoutToFloor(layout,areas){
  return layout.map((e,i)=>{const id=/^e\d+$/.test(e.id)?undefined:e.id,ref=e.id;
    if(e.kind==='zone'){const a=areas.find(a=>a.id===e.area)||{};return {id,ref,kind:'zone',label:a.name||'Area',x:e.x,y:e.y,w:Math.max(1,e.w),h:Math.max(1,e.h),minSpend:E2P(a.min),deposit:E2P(a.dep),sort:i}}
    if(isT(e))return {id,ref,kind:e.kind==='sofa'||e.kind==='couch'?'sofa':'table',shape:e.kind,label:e.name||'T',x:e.x,y:e.y,w:1,h:1,rotation:e.rot||0,seats:e.seats,zoneRef:areaOf2(e,layout,areas),sort:i};
    return {id,ref,kind:e.kind,label:e.name||'',x:e.x,y:e.y,w:Math.max(1,e.w),h:Math.max(1,e.h),rotation:e.rot||0,sort:i}})}
const STARTER=()=>[zn('main',30,120,740,480),fx('bar','Bar',30,20,500,72),fx('dj','DJ',560,20,210,72),fx('entrance','Entrance',30,606,140,10),...[0,1,2,3,4,5].map(i=>mk('round','M'+(i+1),130+(i%3)*220,i<3?250:460,4))];

function cfgFrom(v){const s=v.settings||{};return {
  first:s.firstSlot??21*60,last:s.lastSlot??24*60+30,step:s.slotStep??30,max:s.maxPerSlot??4,notify:'both',
  askNames:s.askNames??true,approval:s.approval||'manual',mapPick:s.mapPick??false,
  socials:{Instagram:'',TikTok:'',Facebook:'',...(v.instagram?{Instagram:v.instagram}:{}),...(s.socials||{})},
  logo:v.logoUrl||null,feePct:PLATFORM.bookingFeeBps/100,vatPct:PLATFORM.feeVatBps/100,serviceBps:v.serviceBps,vatBps:v.vatBps,
  autos:{thanks:false,bday:false,winback:false,...(s.automations||{})},tiers:null}}

function guestFrom(g){const name=[g.firstName,g.lastName].filter(Boolean).join(' ')||'Guest';
  const bd=g.birthDate?(()=>{const n=new Date(),[,m,d]=g.birthDate.split('-').map(Number);let t=Date.UTC(n.getUTCFullYear(),m-1,d);if(t<Date.now()-864e5)t=Date.UTC(n.getUTCFullYear()+1,m-1,d);return (t-Date.now())/864e5<=31})():false;
  return {id:g.id,name,phone:fmtPhone(g.phone),rawPhone:g.phone,email:g.email||'',ig:g.instagram?(g.instagram.startsWith('@')||g.instagram.includes('/')?g.instagram:'@'+g.instagram):'',gender:cap(g.gender||''),
    visits:g.visits||0,spend:P2E(g.totalSpend),noShow:g.noShows||0,tags:[...(g.tags||[]),...(g.blocked?['Blocked']:[])],consent:!!g.whatsappOptIn,emailConsent:!!g.emailOptIn,
    last:g.lastVisitAt?shortDate(g.lastVisitAt):'—',lastAt:g.lastVisitAt,note:g.notes||'',tix:!!g.boughtTickets,bday:bd,pts:g.points||0,ref:g.referralCode||''}}

function msgsFor(r){const at=r.decidedAt?t12(new Date(r.decidedAt).getHours()*60+new Date(r.decidedAt).getMinutes()):nowStr(),m=[{kind:'review',at:t12(new Date(r.createdAt).getHours()*60+new Date(r.createdAt).getMinutes())}];
  if(r.status==='declined')m.push({kind:'declined',at});else if(r.status!=='in_review')m.push({kind:r.depositAmount>0&&!r.depositPaidAt?'accepted':'confirmed',at});
  if(r.depositPaidAt)m.push({kind:'confirmed',at:t12(new Date(r.depositPaidAt).getHours()*60+new Date(r.depositPaidAt).getMinutes())});return m}

function bookingFrom(r,tab,areas){const party=r.party||[];
  return {id:r.id,code:r.code,gid:r.guest.id,party:r.partySize,time:hm2min(r.slotLabel.split(' ')[0]||'21:00'),day:Math.max(0,dayIdx(r.date)),date:r.date,
    area:r.zoneId||areas[0]?.id,table:r.tableId,status:r.status==='arrived'&&tab?'seated':STATUS_IN[r.status]||r.status,src:SRC[r.source]||r.source,
    dep:P2E(r.depositAmount),depPaid:!!r.depositPaidAt&&!r.depositRefundedAt,depRefunded:!!r.depositRefundedAt,depVia:r.depositPaidAt?'Paid':null,msgs:msgsFor(r),
    arrivedN:party.filter(p=>p.checkedInAt).length,others:party.filter(p=>!p.isBooker).map(p=>({name:p.name,phone:p.phone?fmtPhone(p.phone):'',email:p.email||'',ig:p.instagram||'',gender:cap(p.gender||'')})),
    note:r.guestNote||'',tabId:tab?.id||null,raw:r}}

function tabToOrder(t){const lines={},sent={};(t.items||[]).forEach(i=>{if(i.status==='void'||!i.menuItemId)return;lines[i.menuItemId]=(lines[i.menuItemId]||0)+i.qty;if(i.status!=='new')sent[i.menuItemId]=(sent[i.menuItemId]||0)+i.qty});
  return {lines,sent,bill:!!t.billRequestedAt,tabId:t.id,srv:t.bill}}

/* Events: API zones + seats to the editor's layout, ticket types and table zones. */
const ZCOLS=['#2e3192','#0e5f6e','#7a1f5c','#8a5a00','#1f0055'];
function eventFrom(e){
  const st=e.status==='published'?(nightYmd(new Date(e.startsAt))===nightYmd()?'live':'on sale'):e.status==='draft'?'draft':'ended';
  const doorsMin=(()=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(e.startsAt)).split(':').map(Number);return p[0]*60+p[1]})();
  const night=new Date(e.startsAt).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:TZ});
  const layout=[],types=[],tz=[];
  (e.zones||[]).forEach(z=>{
    if(z.kind==='standing'){types.push({zid:z.id,name:z.name,price:P2E(z.price),qty:z.capacity,sold:e.soldByZone?.[z.id]||0,left:z.left,closed:!!z.markedSoldOut});layout.push({id:z.id,kind:'standing',type:types.length-1,name:z.name,x:z.x,y:z.y,w:z.w,h:z.h,rot:0})}
    else if(z.kind==='table'){const i=tz.length;tz.push({id:z.id,name:z.name,price:P2E(z.price),color:z.color||ZCOLS[i%ZCOLS.length],ink:'#fff',closed:!!(z.markedSoldOut||z.closed)});layout.push({id:'zs-'+z.id,kind:'zone',area:z.id,x:z.x,y:z.y,w:z.w,h:z.h,rot:0})}
    else if(z.kind==='seated'){const m=z.meta||{};layout.push({...SM.BDEF,...m,free:!!m.freeSeating,id:z.id,kind:'block',name:z.name,price:P2E(z.price),color:z.color||null,closed:!!(z.markedSoldOut||z.closed),left:z.realLeft??z.left,x:m.x??(z.x+z.w/2),y:m.y??(z.y+z.h/2),seatIds:{}})}
    else if(z.kind==='decor')layout.push({id:z.id,kind:z.shape||'stage',name:z.name,x:z.x,y:z.y,w:z.w,h:z.h,rot:0});
  });
  // Seat states: mine wins later; here only what others hold or bought.
  const paidS=new Set(e.soldSeats||[]),seatSt={};
  (e.seats||[]).forEach(s=>{seatSt[s.id]=s.held&&!paidS.has(s.id)?'held':(s.taken&&s.enabled!==false)||paidS.has(s.id)?'sold':'free'});
  (e.seats||[]).forEach(s=>{const b=layout.find(x=>x.kind==='block'&&x.id===s.zoneId);if(b){if(s.enabled!==false)b.seatIds[s.label]=s.id;return}
    if(tz.some(z=>z.id===s.zoneId))layout.push({id:s.id,kind:SHAPES.includes(s.shape)?s.shape:'round',name:s.label,x:s.x,y:s.y,seats:s.seats||1,rot:s.rotation||0,zone:s.zoneId})});
  const ev={id:e.id,name:e.title,night:(st==='live'?'Tonight · ':'')+night,doors:t12(doorsMin),lineup:e.lineup||'',color:e.color||ZCOLS[0],poster:e.posterUrl||null,status:st,seatMap:e.seatMap,inviteOnly:!!e.inviteOnly,types,tz,layout,
    soldT:e.soldSeats||(e.seats||[]).filter(s=>s.taken).map(s=>s.id),seatSt,startsAt:e.startsAt,orders:e.orders||0,revenue:P2E(e.revenue),checkedIn:e.checkedIn||0,invited:e.invited||0,promos:[],batches:[],views:0,raw:e};
  Object.defineProperty(ev,'tables',{configurable:true,enumerable:false,get(){return ev.layout.filter(isT).map(t=>({id:t.id,name:t.name,zone:evArea(ev,t),seats:t.seats,sold:ev.soldT.includes(t.id)}))}});
  return ev}
function eventToZones(e){
  const zones=[];
  e.types.forEach((t,i)=>{const el=e.layout.find(x=>x.kind==='standing'&&x.type===i)||{x:0,y:0,w:100,h:80};zones.push({...(t.zid?{id:t.zid}:{}),name:t.name,kind:'standing',price:E2P(t.price),capacity:t.qty,x:el.x,y:el.y,w:Math.max(1,el.w),h:Math.max(1,el.h),sort:i})});
  e.tz.forEach((z,i)=>{const sh=e.layout.find(x=>x.kind==='zone'&&x.area===z.id)||{x:0,y:0,w:100,h:80};const real=/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(z.id);
    zones.push({...(real?{id:z.id}:{}),name:z.name,kind:'table',price:E2P(z.price),color:z.color,x:sh.x,y:sh.y,w:Math.max(1,sh.w),h:Math.max(1,sh.h),sort:100+i,
      seats:e.layout.filter(isT).filter(t=>evArea(e,t)===z.id).map(t=>({...(/^e\d+$/.test(t.id)?{}:{id:t.id}),label:t.name,x:t.x,y:t.y,seats:t.seats,shape:t.kind,rotation:t.rot||0}))})});
  e.layout.filter(x=>x.kind==='block').forEach((b,i)=>{const bb=SM.blockBox(b);
    zones.push({...(/^[0-9a-f]{8}-[0-9a-f]{4}-/.test(b.id)?{id:b.id}:{}),name:b.name||'Section',kind:'seated',price:E2P(b.price),color:b.color||null,x:bb.x,y:bb.y,w:Math.max(1,bb.w),h:Math.max(1,bb.h),sort:50+i,
      meta:{x:b.x,y:b.y,rot:b.rot||0,rows:b.rows,cols:b.cols,curve:b.curve||0,taper:b.taper||0,aisle:b.aisle||0,rowStart:b.rowStart||'A',numDir:b.numDir||'ltr',freeSeating:!!b.free},
      seats:SM.blockSeats(b).map(p=>({...(b.seatIds?.[p.label]?{id:b.seatIds[p.label]}:{}),label:p.label,x:p.x,y:p.y}))})});
  e.layout.filter(x=>['stage','bar','dj','entrance'].includes(x.kind)).forEach((f,i)=>zones.push({...(/^e\d+$/.test(f.id)?{}:{id:f.id}),name:f.name||KLABEL[f.kind],kind:'decor',shape:f.kind,x:f.x,y:f.y,w:Math.max(1,f.w),h:Math.max(1,f.h),sort:200+i}));
  return zones}

function promosFrom(list){const map={};list.forEach(p=>{const k=p.eventId||'*';(map[k]=map[k]||[]).push(p)});return map}
function attachPromos(ev,PR){const mine=[...(PR[ev.id]||[]),...(PR['*']||[])];
  ev.promos=mine.map(p=>({id:p.id,code:p.code,off:p.percentOff,used:p.usedCount,limit:p.maxUses,on:p.active,batch:p.batchId,guest:p.lockedPhone?fmtPhone(p.lockedPhone):'',all:!p.eventId}));
  const b={};mine.filter(p=>p.batchId).forEach(p=>{b[p.batchId]=b[p.batchId]||{id:p.batchId,name:p.label||'Unique codes',off:p.percentOff,per:p.maxUses||1,guest:p.lockedPhone?fmtPhone(p.lockedPhone):'',on:false};if(p.active)b[p.batchId].on=true});
  ev.batches=Object.values(b)}

const SEGKEY={all:{},vip:{tags:['VIP']},regular:{minVisits:5},lapsed:{lastVisitBeforeDays:45},tix:{boughtTickets:true},bday:{birthdayWithinDays:31}};
function campFrom(c){const k=c.segment?.key||'all';const when=c.sentAt||c.scheduledAt||c.createdAt;
  return {id:c.id,name:c.name,ch:c.channel==='whatsapp'?'wa':'email',seg:SEG[k]?k:'all',when:new Date(when).toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:TZ}),status:c.status==='draft'?'sending':c.status,sent:c.sentCount,failed:c.failedCount,raw:c}}

/** Loads (or reloads) everything the staff screens need for the current venue. */
async function loadVenue(vi,keepUI){
  const v0=ME.venues[vi],id=v0.id,u=p=>`/venues/${id}${p}`,today=nightYmd();
  DAYS=[0,1,2,3].map(i=>dparts(addDays(today,i)));DATE=new Date(today+'T12:00:00Z').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'});
  const role=ME.user.isSuperAdmin?'owner':v0.role,P=v0.perms||[],F=v0.features||[],can=(...k)=>k.some(x=>P.includes(x));
  const safe=p=>p.catch(()=>[]),none=Promise.resolve([]);
  const [venue,floor,menu,res,tabs,guests,tiersR,events,promos,camps,staff]=await Promise.all([
    GET(u('')),GET(u('/floor')),GET(u('/menu')),F.includes('reservations')&&can('floor','bookings','door')?GET(u(`/reservations?date=${today}&to=${addDays(today,3)}`)):none,
    F.includes('ordering')&&can('floor','orders')?GET(u('/tabs')):none,can('guests','bookings','door','marketing','community')?safe(GET(u('/guests'))):none,GET(u('/tiers')),
    F.includes('ticketing')&&can('events','door')?safe(GET(u('/events'))):none,can('events')?safe(GET(u('/promos'))):none,can('marketing')?safe(GET(u('/campaigns'))):none,can('staff')?safe(GET(u('/staff'))):none]);
  const roles=can('staff')?await GET(u('/roles')).catch(()=>null):null;
  let items=floor;
  if(!items.some(i=>i.kind==='zone')&&can('editor')){const L=STARTER(),z0=L.find(e=>e.kind==='zone');z0.area=z0.id;items=await PUT(u('/floor'),{items:layoutToFloor(L,[{id:z0.id,name:'Main floor',min:5000,dep:0}])})}
  const {layout,areas}=floorToLayout(items);
  if(!areas.length)areas.push({id:'none',name:'Main floor',min:0,dep:0});
  VENUES[vi]={id,name:venue.name,where:venue.settings?.where||venue.address||'',color:venue.settings?.color||'#12153f',slug:venue.slug,role,raw:venue};
  const cfg=cfgFrom(venue);
  cfg.tiers=tiersR.map((t,i)=>({id:t.name.toLowerCase(),name:t.name,min:P2E(t.minSpend),perks:(t.perks||[]).join(', '),color:t.color||TIERCOL[i%TIERCOL.length]}));
  if(!cfg.tiers.length)cfg.tiers=[{id:'member',name:'Member',min:0,perks:'',color:TIERCOL[0]}];
  VDATA[vi]={layout,areas,cfg,slots:VDATA[vi]?.slots};
  MENU={};ITEMS={};menu.filter(m=>m.active).forEach(m=>{(MENU[m.category]=MENU[m.category]||[]).push(m);ITEMS[m.id]={id:m.id,cat:m.category,name:m.name,price:P2E(m.price)}});
  const ui=keepUI&&S&&S.vi===vi?S:null;
  const tabByRes={};tabs.forEach(t=>{if(t.reservationId)tabByRes[t.reservationId]=t});
  const G2=guests.map(guestFrom);
  res.forEach(r=>{if(!G2.some(g=>g.id===r.guest.id))G2.push(guestFrom({...r.guest,visits:0,totalSpend:0}))});
  const bookings=res.map(r=>bookingFrom(r,tabByRes[r.id],areas));
  const orders={};
  tabs.forEach(t=>{const o=tabToOrder(t);
    if(t.reservationId&&bookings.some(b=>b.id===t.reservationId)){orders[t.reservationId]=o;return}
    const wid='w:'+t.id,tb=layout.find(e=>e.id===t.tableId);
    if(t.guestId&&!G2.some(g=>g.id===t.guestId))G2.push(guestFrom({id:t.guestId,firstName:t.guestName||'Walk-in'}));
    const gid=t.guestId||wid;if(!t.guestId)G2.push({...guestFrom({id:wid,firstName:t.guestName||('Walk-in '+(tb?.name||''))}),walkin:true});
    bookings.push({id:wid,code:'WI-'+(tb?.name||'BAR'),gid,party:t.partySize||1,time:hm2min(new Date(t.createdAt).toLocaleTimeString('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'})),day:0,date:today,
      area:tb?areaOf2(tb,layout,areas):areas[0].id,table:t.tableId,status:'seated',src:'Walk-in',dep:0,depPaid:false,depVia:null,msgs:[],arrivedN:t.partySize||1,others:[],note:'',tabId:t.id,walkin:true});
    orders[wid]=o});
  bookings.sort((a,b)=>a.day-b.day||a.time-b.time);
  const PR=promosFrom(promos);
  const evs=events.map(eventFrom);evs.forEach(e=>attachPromos(e,PR));
  const tonightEv=evs.filter(e=>e.status==='live');
  const tickets=(await Promise.all(tonightEv.map(e=>safe(GET(u(`/events/${e.id}/tickets`)))))).flat().map(t=>({id:t.id,code:t.orderCode,name:`${t.firstName} ${t.lastName}`.trim(),type:t.zone,in:!!t.checkedInAt}));
  S={vi,bookings,guests:G2,orders,glist:[],tickets,events:evs,campaigns:camps.map(campFrom),staff,roles,
    autos:[['thanks','Thank you after the visit','Next day at 2 PM, thanks them for coming'],['bday','Birthday offer','7 days before their birthday, invites them back'],['winback','Win back','After 45 days without a visit, invites them to come back']].map(([k,name,desc])=>({k,name,desc,on:!!cfg.autos[k],n:0})),
    bfilter:'request',otable:null,cat:Object.keys(MENU)[0]||null,pay:'Card',gsearch:'',dsearch:'',sheet:null,sel:null,mapMode:'map',gp:newGP(),evSel:null,evp:newEVP(),camp:null,batchOpen:null,edEvent:null,
    ...(ui?{bfilter:ui.bfilter,otable:ui.otable,cat:MENU[ui.cat]?ui.cat:Object.keys(MENU)[0]||null,pay:ui.pay,gsearch:ui.gsearch,dsearch:ui.dsearch,sheet:ui.sheet,sel:ui.sel,gp:ui.gp,evSel:ui.evSel,evp:ui.evp,camp:ui.camp,batchOpen:ui.batchOpen,edEvent:ui.edEvent,sales:ui.sales}:{})};
  // Keep the booking page preview in step with the venue.
  PUB=null;
}
function areaOf2(el,layout,areas){const z=layout.filter(e=>e.kind==='zone');const h=z.find(z=>el.x>=z.x&&el.x<=z.x+z.w&&el.y>=z.y&&el.y<=z.y+z.h);return h?h.area:(areas[0]?.id)}
let refreshing=null;
async function refresh(){if(!S)return;if(refreshing)return refreshing;refreshing=(async()=>{try{await loadVenue(S.vi,true);render()}finally{refreshing=null}})();return refreshing}
let VIEW='floor',ROLE='manager';

/* ---------- derived ---------- */
const G=id=>S.guests.find(g=>g.id===id);
const B=id=>S.bookings.find(b=>b.id===id);
const AR=id=>V().areas.find(a=>a.id===id)||V().areas[0];
const EL=id=>V().layout.find(e=>e.id===id);
const TN=id=>EL(id)?.name||'—';
function areaOf(el){const z=V().layout.filter(e=>e.kind==='zone');const h=z.find(z=>el.x>=z.x&&el.x<=z.x+z.w&&el.y>=z.y&&el.y<=z.y+z.h);if(h)return h.area;let best=null,bd=1e9;z.forEach(z=>{const d=Math.hypot(el.x-(z.x+z.w/2),el.y-(z.y+z.h/2));if(d<bd){bd=d;best=z.area}});return best||V().areas[0].id}
const LIVE=['request','accepted','confirmed','arrived','seated'];
const atTable=tid=>S.bookings.filter(b=>b.table===tid&&!b.day&&LIVE.includes(b.status)).sort((a,b)=>LIVE.indexOf(b.status)-LIVE.indexOf(a.status))[0];
function tstate(t){const b=atTable(t.id);if(!b)return 'free';return {request:'held',accepted:'held',confirmed:'booked',arrived:'arrived',seated:S.orders[b.id]?.bill?'bill':'seated'}[b.status]}
const STL={free:'Free',held:'Accepted, unpaid',booked:'Booked',arrived:'At the door',seated:'Seated',bill:'Bill asked',request:'In review',accepted:'Accepted',confirmed:'Confirmed',done:'Paid',declined:'Declined',noshow:'No-show',cancelled:'Cancelled'};
const SFILL={free:'var(--top)',held:'var(--yellow)',booked:'var(--sky)',arrived:'var(--green)',seated:'var(--teal)',bill:'var(--blue)'};
const pillFor=st=>{const m={request:'pending',accepted:'held',confirmed:'booked',arrived:'arrived',seated:'seated',done:'done',declined:'declined',noshow:'declined',cancelled:'declined'};return `<span class="pill p-${m[st]||st}">${STL[st]}</span>`};
function subtotal(b){const o=S.orders[b.id];if(!o)return 0;if(o.srv)return P2E(o.srv.subtotal);return Object.entries(o.lines).reduce((s,[id,q])=>s+(ITEMS[id]?.price||0)*q,0)}
/* The bill comes from the server (it applies min spend, service, VAT and the deposit). */
function bill(b){const o=S.orders[b.id];if(o&&o.srv){const x=o.srv;return {sub:P2E(x.subtotal),min:P2E(x.minSpend),top:P2E(x.minSpendTopUp),svc:x.service/100,vat:x.vat/100,dep:P2E(x.depositCredit),total:x.total/100}}
  const sub=subtotal(b),min=b.walkin?AR(b.area).min:(b.raw?P2E(b.raw.minSpend):AR(b.area).min),top=Math.max(0,min-sub),base=sub+top,svc=base*(CFG().serviceBps??1200)/1e4,vat=(base+svc)*(CFG().vatBps??1400)/1e4,dep=b.depPaid?b.dep:0;return {sub,min,top,svc,vat,dep,total:Math.max(0,base+svc+vat-dep)}}
const reqCount=()=>S.bookings.filter(b=>b.status==='request').length;
const gN=n=>n+' guest'+(n===1?'':'s');
const egp2=n=>'EGP'+NB+(Math.round(n*100)/100).toLocaleString('en-US',{maximumFractionDigits:2});
const first=b=>G(b.gid).name.split(' ')[0];

/* ---------- shell ---------- */
const NAV=[['floor','Floor','floor','Tonight'],['bookings','Bookings','bookings','Tonight'],['door','Door','door','Tonight'],['orders','Orders','orders','Tonight'],['events','Events','events','Grow'],['marketing','Marketing','marketing','Grow'],['guests','Guests','guests','Grow'],['community','Community','community','Grow'],['messages','Messages','messages','Grow'],['reports','Reports','reports','Grow'],['page','Booking page','page','Set up'],['editor','Floor map','editor','Set up'],['setup','Venue setup','setup','Set up'],['admin','XTRA admin','admin','XTRA']];
/** What this person may open at the current venue (from /auth/me, already limited by the venue's features). */
const PERMS_NOW=()=>ME.venues[S.vi]?.perms||[],FEAT_NOW=()=>ME.venues[S.vi]?.features||[];
const CAN=p=>p==='admin'?!!ME.user.isSuperAdmin:p==='page'?PERMS_NOW().includes('setup')&&FEAT_NOW().includes('reservations'):PERMS_NOW().includes(p);
const HAS=f=>FEAT_NOW().includes(f);
const ROLES={manager:'Manager',door:'Door',waiter:'Waiter'};
const ROLE_NAME={owner:'Owner',manager:'Manager',door:'Door',waiter:'Waiter'};
const whoBox=()=>`<div class="role">Signed in</div><div class="who"><b>${esc(ME.user.name)}</b><span class="mute">${esc(ME.user.isSuperAdmin?'XTRA admin':ME.venues[S.vi]?.roleName||ROLE_NAME[VENUES[S.vi].role]||'')}</span></div><button class="btn ghost sm" data-a="signout">Sign out</button>`;
const MORE=['events','marketing','community','messages','reports','page','editor','setup','admin'];
function shell(){
  const VV=VENUES[S.vi],navs=NAV.filter(n=>CAN(n[2]));ROLE=navs.length>5?'manager':'staff';
  if(!navs.length){$('#rail').innerHTML=`${LOGO}<div class="sp"></div>${whoBox()}`;$('#tabs').innerHTML='';$('#mbar').innerHTML=LOGO;return}
  if(!navs.find(n=>n[0]===VIEW))VIEW=navs[0][0];
  const btn=([k,l])=>`<button class="nav ${VIEW===k?'on':''}" data-a="go" data-v="${k}" ${VIEW===k?'aria-current="page"':''}>${ic(k)}<span>${l}</span>${k==='bookings'&&reqCount()?`<span class="ct">${reqCount()}</span>`:''}${k==='messages'&&msgUnread()?`<span class="ct">${msgUnread()}</span>`:''}</button>`;
  $('#rail').innerHTML=`${LOGO}<button class="venue" data-a="venue" title="Switch venue"><b>${esc(VV.name)}</b><span>${esc(VV.where)} · switch</span></button>${navs.map((n,i)=>(ROLE==='manager'&&(i===0||navs[i-1][3]!==n[3])?`<div class="ngrp">${n[3]}</div>`:'')+btn(n)).join('')}<div class="sp"></div>${whoBox()}`;
  $('#mbar').innerHTML=`${LOGO}<button class="venue" data-a="venue"><b>${esc(VV.name)}</b><span>▾</span></button>`;
  const tabs=navs.filter(n=>!MORE.includes(n[0])||ROLE!=='manager');
  $('#tabs').innerHTML=tabs.map(btn).join('')+`<button class="nav ${MORE.includes(VIEW)?'on':''}" data-a="more">${ic('setup')}<span>More</span></button>`;
}
const head=(t,p,right='')=>`<div class="top"><div><h1>${t}</h1>${p?`<p>${p}</p>`:''}</div>${right}</div>`;
let DATE='';

/* ---------- map drawing ---------- */
function drawLayout({portrait=false,edit=false}={}){
  const W0=1000,H0=620;
  const P=(x,y)=>portrait?[H0-y,x]:[x,y];
  const PR=r=>portrait?{x:H0-(r.y+r.h),y:r.x,w:r.h,h:r.w}:r;
  const L=V().layout;let o='';
  if(edit)o+=`<defs><pattern id="gd" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1.2" fill="var(--grid)"/></pattern></defs><rect width="${W0}" height="${H0+20}" fill="url(#gd)"/>`;
  if(edit&&V().ev){const ev=V().ev;o+=SM.draw(ev,{mode:'edit',zoneOf:t=>evArea(ev,t)}).svg;return o+selBox()}
  L.filter(e=>e.kind==='zone').forEach(z=>{const r=PR(z),A=AR(z.area);o+=`<g class="el" data-id="${z.id}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="18" fill="var(--bg)" opacity="${edit?.85:.7}" ${edit?'stroke="var(--line)" stroke-width="1.5"':''}/>${portrait&&r.w<200?'':`<text x="${r.x+14}" y="${r.y+24}" font-size="${portrait?22:16}" font-weight="700" fill="var(--mute)">${esc(A.name)}${portrait||A.min==null?'':' · min '+A.min.toLocaleString('en-US')}${A.price!=null&&!portrait?' · '+egp(A.price)+' a seat':''}</text>`}</g>`});
  L.filter(e=>!isT(e)&&e.kind!=='zone').forEach(f=>{const r=PR(f);
    if(f.kind==='standing'){const t=V().ev?.types[f.type];o+=`<g class="el" data-id="${f.id}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="14" fill="${ZCOL[f.type%3]}" stroke="var(--chairline)" stroke-width="1.5"/><text x="${r.x+r.w/2}" y="${r.y+r.h/2-2}" text-anchor="middle" font-size="18" font-weight="800" fill="#12153f">${esc(t?t.name:'Standing')}</text><text x="${r.x+r.w/2}" y="${r.y+r.h/2+20}" text-anchor="middle" font-size="13" font-weight="600" fill="#5b6280">Standing${t?' · '+egp(t.price):''}</text></g>`;return}
    if(f.kind==='entrance'){o+=`<g class="el" data-id="${f.id}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="4" fill="var(--teal)"/><text x="${r.x+r.w/2}" y="${portrait?r.y+r.h/2+5:r.y-6}" text-anchor="middle" font-size="14" font-weight="700" fill="var(--mute)" ${portrait?`transform="rotate(-90 ${r.x+r.w/2} ${r.y+r.h/2})"`:''}>${esc(f.name)}</text></g>`;return}
    o+=`<g class="el" data-id="${f.id}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="14" fill="var(--ink)" opacity=".9"/>${f.kind==='bar'?`<rect x="${r.x+8}" y="${r.y+8}" width="${r.w-16}" height="${r.h-16}" rx="8" fill="none" stroke="var(--bg)" stroke-opacity=".25" stroke-dasharray="2 8"/>`:''}<text x="${r.x+r.w/2}" y="${r.y+r.h/2+7}" text-anchor="middle" font-size="20" font-weight="800" fill="var(--bg)" style="font-stretch:115%">${esc(f.name)}</text></g>`});
  L.filter(isT).forEach(t=>{const st=edit?'free':tstate(t),b=edit?null:atTable(t.id),[cx,cy]=P(t.x,t.y),rot=(t.rot+(portrait?90:0))%360;
    const EZ=edit&&V().ev?tz(V().ev,areaOf(t)):null,f=furn(t,EZ?EZ.color:SFILL[st],!!EZ||st!=='free');
    const tc=EZ?EZ.ink:st==='free'?'var(--ink)':st==='bill'?'var(--blueink)':'var(--chipink)';
    const nm=edit?t.seats+' seats':b?first(b):t.seats+' seats';
    o+=`<g class="${edit?'el':'tb'}" data-id="${t.id}" ${edit?'':`tabindex="0" role="button" aria-label="Table ${esc(t.name)}, ${STL[st]}" data-a="table" data-v="${t.id}"`}><g transform="translate(${cx} ${cy}) rotate(${rot})">${f.svg}</g><text x="${cx}" y="${cy-1}" text-anchor="middle" font-size="${portrait?21:17}" font-weight="800" fill="${tc}" style="font-stretch:112%">${esc(t.name)}</text><text x="${cx}" y="${cy+(portrait?17:14)}" text-anchor="middle" font-size="${portrait?14:11.5}" font-weight="600" fill="${tc}" opacity=".85">${esc(nm)}</text>${st==='bill'?`<circle cx="${cx+22}" cy="${cy-20}" r="7" fill="var(--yellow)" stroke="var(--bg)" stroke-width="2"/>`:''}</g>`});
  if(edit)o+=selBox();
  return o;
}
function selBox(){const e=S.sel&&EL(S.sel);if(!e)return '';const r=SM.elBox(e);return `<rect class="selbox" x="${r.x-4}" y="${r.y-4}" width="${r.w+8}" height="${r.h+8}" rx="10" pointer-events="none"/>`+(!isT(e)&&e.kind!=='block'?`<circle class="handle" data-h="${e.id}" cx="${e.x+e.w}" cy="${e.y+e.h}" r="9"/>`:'')}
function mapSVG(portrait){return `<svg viewBox="${portrait?'0 0 620 1000':'20 10 970 620'}" role="img" aria-label="Seat map">${drawLayout({portrait})}</svg>`}

/* ---------- floor ---------- */
function vFloor(){
  const T=TABLES(),counts={};T.forEach(t=>{const s=tstate(t);counts[s]=(counts[s]||0)+1});
  const seated=S.bookings.filter(b=>b.status==='seated');
  const spend=seated.reduce((s,b)=>s+subtotal(b),0);
  const covers=S.bookings.filter(b=>['arrived','seated'].includes(b.status)).reduce((s,b)=>s+b.party,0);
  const next=S.bookings.filter(b=>['confirmed','accepted','request'].includes(b.status)).slice(0,6);
  const lg=['free','held','booked','arrived','seated','bill'];
  return head('Tonight',DATE+' · doors '+t12(CFG().first),CAN('editor')?`<button class="btn ghost" data-a="go" data-v="editor">${ic('editor')}Edit floor map</button>`:'')+
  `<div class="kpis"><div class="kpi"><b class="num">${covers}</b><span>guests in</span></div><div class="kpi"><b class="num">${(counts.seated||0)+(counts.bill||0)}/${T.length}</b><span>tables seated</span></div><div class="kpi"><b class="num">${egp(spend)}</b><span>open orders</span></div><div class="kpi"><b class="num">${reqCount()}</b><span>in review</span></div></div>
  <div class="floorwrap"><div><div class="map" id="map"></div><div class="legend">${lg.map(k=>`<span><i style="background:${SFILL[k]};${k==='free'?'box-shadow:inset 0 0 0 1.5px var(--chairline)':''}"></i>${STL[k]} <b class="num">${counts[k]||0}</b></span>`).join('')}</div></div>
  <div class="side bigbox"><h3>Next up</h3><div class="list">${next.map(b=>`<button class="row" data-a="booking" data-v="${b.id}"><span class="t">${t12(b.time).split(NB)[0]}<small>${b.table?TN(b.table):'no table'}</small></span><span><span class="n">${esc(G(b.gid).name)}</span><span class="s">${gN(b.party)} · ${esc(AR(b.area).name)}</span></span>${pillFor(b.status)}</button>`).join('')||'<div class="empty">Nobody else expected.</div>'}</div></div></div>`;
}
function drawMap(){const m=$('#map');if(m)m.innerHTML=mapSVG(m.clientWidth<560);const c=$('#canvas');if(c)c.innerHTML=drawLayout({edit:true})}

/* ---------- editor ---------- */
const PAL=[['round',4],['round',8],['square',4],['square',2],['long',8],['sofa',8],['couch',5]];
function palIcon(kind,seats){const f=furn({kind,seats,rot:0},'var(--top)',0);const s=Math.max(f.bw,f.bh)/2+4;return `<svg viewBox="${-s} ${-s+f.cy} ${2*s} ${2*s}">${f.svg}</svg>`}
function vEditor(){
  const e=S.sel&&EL(S.sel);
  let insp='<p class="hint">Tap anything on the map to edit it. Drag to move. Arrow keys nudge the selected item.</p>';
  if(e){
    if(isT(e))insp=`<h3>${KLABEL[e.kind]}</h3><div class="stack"><label class="f">Table name<input id="ename" value="${esc(e.name)}" maxlength="6" autocomplete="off"></label><div class="f" style="font-size:14px;font-weight:600">Seats<div class="stepper" style="margin-top:6px"><button data-a="eseat" data-v="-1" aria-label="Fewer seats">−</button><b class="num">${e.seats}</b><button data-a="eseat" data-v="1" aria-label="More seats">+</button></div></div><div class="mute" style="font-size:14px">Area: <b style="color:var(--ink)">${esc(AR(areaOf(e)).name)}</b> (from where it sits)</div><div class="two"><button class="btn ghost sm" data-a="erot">Rotate</button><button class="btn ghost sm" data-a="edup">Duplicate</button></div><button class="btn warn sm" data-a="edel">Delete</button></div>`;
    else if(e.kind==='block'){const n=SM.blockSeats(e).length,sold=Object.values(e.seatIds||{}).filter(id=>V().ev.soldT.includes(id)).length,st=(k,l,step,val)=>`<div class="f" style="font-size:14px;font-weight:600">${l}<div class="stepper" style="margin-top:6px"><button data-a="bk" data-v="${k}:-${step}" aria-label="Less">−</button><b class="num">${val}</b><button data-a="bk" data-v="${k}:${step}" aria-label="More">+</button></div></div>`;
      insp=`<h3>Seated section</h3><div class="stack"><label class="f">Section name<input id="ename" value="${esc(e.name)}" maxlength="30" autocomplete="off"></label><label class="f">Price per seat<input type="number" step="50" min="0" data-bk="price" value="${e.price}" inputmode="numeric"></label>
      <div class="two">${st('rows','Rows',1,e.rows)}${st('cols','Seats per row',1,e.cols)}</div>
      <div class="two">${st('curve','Curve',1,Math.round((e.curve||0)*10))}${st('taper','Wider rows',1,(e.taper>0?'+':'')+(e.taper||0))}</div>
      <div class="two">${st('aisle','Aisles',1,e.aisle?'every '+e.aisle:'none')}${st('rot','Turn',5,(e.rot||0)+'°')}</div>
      <div class="two"><label class="f">First row<input data-bk="rowStart" value="${esc(e.rowStart||'A')}" maxlength="1" autocomplete="off" style="text-transform:uppercase"></label><label class="f">Seat 1 is on the<select data-bk="numDir"><option value="ltr" ${e.numDir!=='rtl'?'selected':''}>Left</option><option value="rtl" ${e.numDir==='rtl'?'selected':''}>Right</option></select></label></div>
      <label class="chk" style="font-size:14px"><input type="checkbox" data-bk="free" ${e.free?'checked':''}><span><b>Free seating</b><br><span class="mute">Guests sit on any seat in this section. Leave off to give everyone their own seat.</span></span></label>
      <p class="hint" style="margin:0">${e.rows} rows · ${n} seats${sold?` · ${sold} taken`:''}. Drag to move. ${e.free?'Tickets say the section, not a seat.':'Every seat gets its own QR ticket.'}</p><div class="two"><button class="btn ghost sm" data-a="edup">Duplicate</button><button class="btn warn sm" data-a="edel">Delete</button></div></div>`}
    else if(e.kind==='standing'){const t=V().ev.types[e.type]||{};insp=`<h3>Standing zone</h3><div class="stack"><label class="f">Ticket name<input data-tt="${e.type}:name" value="${esc(t.name)}" autocomplete="off"></label><div class="two"><label class="f">Price<input type="number" step="50" min="0" data-tt="${e.type}:price" value="${t.price}" inputmode="numeric"></label><label class="f">Tickets<input type="number" min="${t.sold||0}" data-tt="${e.type}:qty" value="${t.qty}" inputmode="numeric"></label></div><p class="hint" style="margin:0">Guests tap this zone to add that ticket. Drag the corner dot to resize.</p><button class="btn warn sm" data-a="edel">Delete</button></div>`}
    else if(e.kind==='zone'&&V().ev)insp=`<h3>Table zone</h3><div class="stack"><label class="f">Zone name<input id="eaname" value="${esc(AR(e.area).name)}" autocomplete="off"></label><label class="f">Price per seat<input type="number" step="100" value="${AR(e.area).price}" data-tzp="${V().ev.id}:${e.area}" inputmode="numeric"></label><p class="hint" style="margin:0">Tables inside sell at this price for every seat. Drag the corner dot to resize.</p><button class="btn warn sm" data-a="edel">Delete zone</button></div>`;
    else if(e.kind==='zone')insp=`<h3>Area</h3><div class="stack"><label class="f">Area name<input id="eaname" value="${esc(AR(e.area).name)}" autocomplete="off"></label><div class="two"><label class="f">Min spend<input type="number" inputmode="numeric" step="500" min="0" data-area="${e.area}" data-k="min" value="${AR(e.area).min}"></label><label class="f">Deposit<input type="number" inputmode="numeric" step="500" min="0" data-area="${e.area}" data-k="dep" value="${AR(e.area).dep}"></label></div><p class="hint" style="margin:0">Drag the corner dot to resize. Tables inside take this area's minimum spend and deposit.</p><button class="btn warn sm" data-a="edel">Delete area</button></div>`;
    else insp=`<h3>${KLABEL[e.kind]}</h3><div class="stack"><label class="f">Label<input id="ename" value="${esc(e.name)}" maxlength="16" autocomplete="off"></label>${e.kind!=='entrance'?'<p class="hint" style="margin:0">Drag the corner dot to resize.</p>':''}<button class="btn warn sm" data-a="edel">Delete</button></div>`;
  }
  const EV=V().ev;
  return (EV?`<button class="back" data-a="evdone">← ${esc(EV.name)}</button>`+head('Seat map',`${esc(EV.name)} · ${esc(EV.night.replace('Tonight · ',''))} · only this event uses this map`,`<button class="btn" data-a="evdone">Done</button>`):head('Floor map',`${esc(VENUES[S.vi].name)} · draw the room once, every screen uses it`,`<button class="btn" data-a="go" data-v="floor">Done</button>`))+
  `<div class="ed"><div class="pal">${EV?`<h3>Start from a layout</h3><div class="tpls">${TPLS.map(([k,l,d])=>`<button data-a="tpl" data-v="${k}" title="${esc(d)}">${tplIcon(k)}<span>${l}</span></button>`).join('')}</div><h3>Seats</h3><button data-a="eadd" data-v="block:0">${tplIcon('block')}<span>Seated section<br><span class="mute" style="font-weight:400">rows of seats</span></span></button>`:''}<h3>Tables</h3>${PAL.map(([k,n])=>`<button data-a="eadd" data-v="${k}:${n}">${palIcon(k,n)}<span>${KLABEL[k]}<br><span class="mute" style="font-weight:400">${n} seats</span></span></button>`).join('')}<h3>Room</h3>${[...(EV?['standing']:[]),'bar','dj','stage','entrance','zone'].map(k=>`<button data-a="eadd" data-v="${k}:0"><svg viewBox="0 0 34 26"><rect x="3" y="${k==='entrance'?11:5}" width="28" height="${k==='entrance'?4:16}" rx="4" fill="${k==='standing'?'#bfeaff':k==='zone'?'var(--bg)':k==='entrance'?'var(--teal)':'var(--ink)'}" stroke="var(--line)"/></svg><span>${k==='standing'?'Standing zone':k==='zone'?(EV?'Table zone':'Area'):KLABEL[k]}</span></button>`).join('')}</div>
  <div><div class="canvaswrap"><svg class="canvas" id="canvas" viewBox="0 0 1000 640" tabindex="0" aria-label="Floor map editor"></svg></div><p class="hint">${EV?`${V().layout.filter(x=>x.kind==='block').reduce((s,b)=>s+SM.blockSeats(b).length,0)} seats in rows · `:''}${TABLES().length} tables · ${TABLES().reduce((s,t)=>s+t.seats,0)} table seats${EV?' · '+V().layout.filter(x=>x.kind==='standing').length+' standing zones':''} · <span id="savest">saved automatically</span></p></div>
  <div class="insp bigbox">${insp}</div></div>`;
}
function nextName(area){const pre=(V().ev?AR(area).id:AR(area).name[0]||'T').toUpperCase();let n=1;const used=new Set(TABLES().map(t=>t.name));while(used.has(pre+n))n++;return pre+n}
let drag=null;
function svgPt(svg,e){const p=svg.createSVGPoint();p.x=e.clientX;p.y=e.clientY;return p.matrixTransform(svg.getScreenCTM().inverse())}
const snap=v=>Math.round(v/10)*10;
document.addEventListener('pointerdown',e=>{const svg=e.target.closest('#canvas');if(!svg)return;
  const h=e.target.closest('[data-h]'),g=e.target.closest('.el'),p=svgPt(svg,e);
  if(h){drag={id:h.dataset.h,mode:'size',sx:p.x,sy:p.y};const el=EL(drag.id);drag.w=el.w;drag.h=el.h}
  else if(g){S.sel=g.dataset.id;const el=EL(S.sel);drag={id:S.sel,mode:'move',dx:p.x-el.x,dy:p.y-el.y,moved:false};render()}
  else{S.sel=null;render();return}
  try{svg.setPointerCapture?.(e.pointerId)}catch(_){}e.preventDefault()});
document.addEventListener('pointermove',e=>{if(!drag)return;const svg=$('#canvas');if(!svg)return;const p=svgPt(svg,e),el=EL(drag.id);
  if(drag.mode==='move'){el.x=Math.max(0,Math.min(1000,snap(p.x-drag.dx)));el.y=Math.max(0,Math.min(630,snap(p.y-drag.dy)));drag.moved=true}
  else{el.w=Math.max(el.kind==='entrance'?40:60,snap(drag.w+p.x-drag.sx));if(el.kind!=='entrance')el.h=Math.max(50,snap(drag.h+p.y-drag.sy))}
  svg.innerHTML=drawLayout({edit:true})});
document.addEventListener('pointerup',()=>{if(drag){const m=drag.moved||drag.mode==='size';drag=null;render();if(m)saveFloor()}});
/* Floor map edits save on their own, a moment after the last change. */
function saveFloor(){const st=$('#savest');if(st)st.textContent='saving…';
  if(V().ev){const e=V().ev;later('evmap',async()=>{if(drag)return saveFloor();await PUT(vurl(`/events/${e.id}/map`),{zones:eventToZones(e)});await refresh();const s2=$('#savest');if(s2)s2.textContent='saved'},900);return}
  later('floor',async()=>{if(drag)return saveFloor();const VD=VDATA[S.vi],old=VD.layout.map(x=>x.id),idx=old.indexOf(S.sel);
    const items=await PUT(vurl('/floor'),{items:layoutToFloor(VD.layout,VD.areas)});const {layout,areas}=floorToLayout(items);
    if(drag)return saveFloor();
    // Bookings and selection follow the new ids.
    VD.layout=layout;if(areas.length)VD.areas=areas;if(idx>=0)S.sel=layout[idx]?.id||null;
    const s2=$('#savest');if(s2)s2.textContent='saved';drawMap()},700)}

/* ---------- bookings ---------- */
function bRow(b){const g=G(b.gid);
  const acts=b.status==='request'?`<button class="btn sm" data-a="approve" data-v="${b.id}">Accept</button><button class="btn sm ghost" data-a="decline" data-v="${b.id}">Decline</button>`:pillFor(b.status);
  const [hm,ap]=t12(b.time).split(NB);
  return `<div class="row"><button style="all:unset;cursor:pointer" data-a="booking" data-v="${b.id}"><span class="t">${hm}<small>${ap}${b.day?' · '+DAYS[b.day][0]:''}</small></span></button><button style="all:unset;cursor:pointer;min-width:0" data-a="booking" data-v="${b.id}"><span class="n">${esc(g.name)} ${g.tags.includes('VIP')?'<span class="tag vip">VIP</span>':''}</span><span class="s">${gN(b.party)} · ${esc(AR(b.area).name)}${b.table?' · '+esc(TN(b.table)):''} · ${esc(b.src)}</span><span class="s">${esc(g.ig)} · ${b.dep?(b.depPaid?`Deposit ${egp(b.dep)} paid`:`Deposit ${egp(b.dep)} due`):'No deposit'}</span></button><div class="acts">${acts}</div></div>`}
function vBookings(){
  const F={request:['In review',b=>b.status==='request'],accepted:['Awaiting payment',b=>b.status==='accepted'],confirmed:['Confirmed',b=>b.status==='confirmed'],in:['Arrived',b=>['arrived','seated'].includes(b.status)],all:['All',()=>true]};
  const list=S.bookings.filter(F[S.bfilter][1]);
  return head('Bookings',DATE+' · '+S.bookings.length+(S.bookings.length===1?' booking':' bookings'),`<button class="btn" data-a="newb">New booking</button>`)+
  `<div class="seg" role="tablist" style="margin-bottom:14px">${Object.entries(F).map(([k,[l,f]])=>`<button class="${S.bfilter===k?'on':''}" data-a="bf" data-v="${k}" role="tab">${l} <span class="num">${S.bookings.filter(f).length}</span></button>`).join('')}</div>
  <div class="bigbox"><div class="list">${list.map(bRow).join('')||`<div class="empty">${S.bfilter==='request'?'All caught up. Requests from your booking page land here for review.':'Nothing here yet.'}</div>`}</div></div>
  ${S.bfilter==='request'&&list.length?`<p class="demo">Accept picks a table and sends the guest a link to pay the deposit. Decline tells them politely. Both go by ${{both:'email and WhatsApp',wa:'WhatsApp',email:'email'}[CFG().notify]}.</p>`:''}`;
}

/* ---------- door ---------- */
function vDoor(){
  const exp=S.bookings.filter(b=>['accepted','confirmed','arrived','seated'].includes(b.status)&&!b.day);
  const inN=exp.reduce((s,b)=>s+b.arrivedN,0)+S.glist.filter(l=>l.in).reduce((s,l)=>s+1+l.plus,0)+S.tickets.filter(t=>t.in).length;
  const totN=exp.reduce((s,b)=>s+b.party,0)+S.glist.reduce((s,l)=>s+1+l.plus,0)+S.tickets.length;
  const q=S.dsearch.trim().toLowerCase();
  const rows=[...exp.map(b=>({k:'b',id:b.id,name:G(b.gid).name,sub:`Table ${b.table?TN(b.table):'—'} · ${gN(b.party)} · ${b.code}${b.status==='accepted'?' · deposit not paid':''}`,in:!['confirmed','accepted'].includes(b.status),phone:G(b.gid).phone})),...S.glist.map(l=>({k:'l',id:l.id,name:l.name,sub:`Guest list · ${l.by}${l.plus?' · +'+l.plus:''}`,in:l.in,phone:''})),...S.tickets.map(t=>({k:'t',id:t.id,name:t.name,sub:`Ticket · ${t.type} · ${t.code}`,in:t.in,phone:''}))]
   .filter(r=>!q||r.name.toLowerCase().includes(q)||r.sub.toLowerCase().includes(q)||r.phone.replace(/\s/g,'').includes(q.replace(/\s/g,'')))
   .sort((a,b)=>a.in-b.in||a.name.localeCompare(b.name));
  return head('Door',DATE)+`<div class="door"><div><button class="scanbtn" data-a="scan">${ic('door','ic')}<span><b>Scan pass</b>Point the camera at the guest's QR</span>${BIGX('bx')}</button>
  <div class="count"><b class="num">${inN}</b><span class="mute">of ${totN} expected are in</span></div><div class="meter"><i style="width:${Math.min(100,inN/Math.max(1,totN)*100)}%"></i></div></div>
  <div class="bigbox"><input class="search" id="dsearch" type="search" placeholder="Search name, phone or code" value="${esc(S.dsearch)}" autocomplete="off"><div class="list">${rows.map(r=>`<div class="row" style="grid-template-columns:minmax(0,1fr) auto"><span><span class="n">${esc(r.name)}</span><span class="s">${esc(r.sub)}</span></span><div class="acts">${r.in?'<span class="pill p-arrived">In</span>':`<button class="btn sm teal" data-a="checkin" data-v="${r.k}:${r.id}">Check in</button>`}</div></div>`).join('')||'<div class="empty">No one by that name. Check the spelling or add them as a walk-in on the floor.</div>'}</div></div></div>`;
}

/* ---------- orders ---------- */
function vOrders(){
  const seated=S.bookings.filter(b=>b.status==='seated');
  if(!seated.find(b=>b.id===S.otable))S.otable=seated[0]?.id||null;
  if(!S.otable)return head('Orders','')+`<div class="bigbox empty">No seated tables yet. Seat a booking or a walk-in from the floor to start an order.</div>`;
  const b=B(S.otable),o=S.orders[b.id]||(S.orders[b.id]={lines:{},sent:{},bill:false}),bl=bill(b),A=AR(b.area);
  const unsent=Object.entries(o.lines).reduce((s,[id,q])=>s+Math.max(0,q-(o.sent[id]||0)),0);
  const pct=Math.min(100,bl.sub/Math.max(1,A.min)*100);
  return head('Orders',`Table ${esc(TN(b.table))} · ${esc(G(b.gid).name)} · ${gN(b.party)}`)+
  `<div class="tblpick">${seated.map(x=>`<button class="chip ${x.id===b.id?'on':''}" data-a="otable" data-v="${x.id}">${esc(TN(x.table))}${S.orders[x.id]?.bill?' · bill':''}</button>`).join('')}</div>
  <div class="order"><div><div class="cats">${Object.keys(MENU).map(c=>`<button class="chip ${S.cat===c?'on':''}" data-a="cat" data-v="${c}">${c==='Soft'?'Soft drinks':c}</button>`).join('')}</div>
  <div class="menu">${Object.values(ITEMS).filter(i=>i.cat===S.cat).map(i=>`<button class="item" data-a="add" data-v="${i.id}"><b>${esc(i.name)}</b><span class="num mute">${egp(i.price)}</span>${o.lines[i.id]?`<span class="q">${o.lines[i.id]}</span>`:''}</button>`).join('')}</div></div>
  <div class="ticket bigbox"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3>Table ${esc(TN(b.table))}</h3>${o.bill?'<span class="pill p-bill">Bill asked</span>':''}</div>
  <div style="margin:10px 0 14px"><div class="sum" style="font-size:14px"><span>Minimum spend ${egp(A.min)}</span><span class="num">${bl.top?egp(bl.top)+' to go':'Reached'}</span></div><div class="meter ${bl.top?'':'ok'}"><i style="width:${pct}%"></i></div></div>
  ${Object.entries(o.lines).map(([id,q])=>{const i=ITEMS[id],ns=q-(o.sent[id]||0);return `<div class="line"><span>${esc(i.name)}${ns>0?` <span class="pill p-pending" style="font-size:11px">new</span>`:''}</span><span class="qb"><button data-a="minus" data-v="${id}" aria-label="Remove one">−</button><b class="num" style="min-width:20px;text-align:center">${q}</b><button data-a="add" data-v="${id}" aria-label="Add one">+</button></span><span class="num">${egp(i.price*q)}</span></div>`}).join('')||'<div class="empty">Tap items on the menu to add them.</div>'}
  <div class="stack"><button class="btn teal" data-a="send" ${unsent?'':'disabled style="opacity:.45"'}>Send ${unsent||''} to bar</button><button class="btn" data-a="openbill" data-v="${b.id}">Bill · ${egp(bl.total)}</button></div></div></div>`;
}

/* ---------- guests ---------- */
function vGuests(){
  const q=S.gsearch.trim().toLowerCase();
  const list=S.guests.filter(g=>!q||[g.name,g.ig,g.email].join(' ').toLowerCase().includes(q)||g.phone.replace(/\s/g,'').includes(q.replace(/\s/g,''))).sort((a,b)=>b.spend-a.spend);
  const vip=S.guests.filter(g=>g.tags.includes('VIP')).length,cons=S.guests.filter(g=>g.consent).length;
  return head('Guests',`${S.guests.length} guests · ${vip} VIP · ${cons} agreed to offers`)+
  `<input class="search" id="gsearch" type="search" placeholder="Search name, phone, email or Instagram" value="${esc(S.gsearch)}" style="max-width:420px" autocomplete="off">
  <div class="bigbox scroll"><table class="gtable"><thead><tr><th>Guest</th><th class="hide">Instagram</th><th class="hide">Phone</th><th>Visits</th><th>Spend</th></tr></thead><tbody>${list.map(g=>`<tr class="click" data-a="guest" data-v="${g.id}" tabindex="0"><td><b>${esc(g.name)}</b><br>${g.tags.map(t=>`<span class="tag ${t==='VIP'?'vip':t==='Blocked'?'bl':''}">${t}</span>`).join('')}${g.noShow?'<span class="tag bl">No-show</span>':''}</td><td class="hide">${esc(g.ig)}</td><td class="hide num">${esc(g.phone)}</td><td class="num">${g.visits}</td><td class="num">${egp(g.spend)}</td></tr>`).join('')}</tbody></table>${list.length?'':'<div class="empty">No guest matches.</div>'}</div>`;
}

/* ---------- notifications ---------- */
function msgText(b,kind){const g=G(b.gid),A=AR(b.area),VN=VENUES[S.vi].name,f=first(b),when=`${dayStr(b.day)} · ${t12(b.time)} · ${gN(b.party)} · ${A.name}`,link=`xtra.eg/b/${b.code}`;
  return {
  review:{sub:`We got your request · ${VN}`,body:`Hi ${f}, we got your table request.\n${when}\nIt's now in review. We'll message you as soon as ${VN} replies.`,cta:'Track your request',link},
  accepted:{sub:`Accepted · pay your deposit · ${VN}`,body:`Good news ${f}, ${VN} accepted your request.\n${when}${b.table?' · Table '+TN(b.table):''}\nPay your ${egp(b.dep)} deposit within 2 hours to lock the table. It comes off your bill. Minimum spend is ${egp(A.min)}.`,cta:`Pay ${egp(b.dep)}`,link},
  declined:{sub:`About your request · ${VN}`,body:`Hi ${f}, sorry, ${VN} can't take your booking for ${dayStr(b.day)} at ${t12(b.time)}. You weren't charged.\nWe hope to see you another night.`,cta:'',link:''},
  confirmed:{sub:`You're confirmed · ${VN}`,body:`You're in, ${f}.\n${when}${b.table?' · Table '+TN(b.table):''}\n${b.dep?`Deposit ${egp(b.dep)} received.`:''} Show your QR pass at the door.`,cta:'Open your pass',link}}[kind]}
function channels(){return {both:['email','wa'],wa:['wa'],email:['email']}[CFG().notify]}
function msgHTML(b,m){const t=msgText(b,m.kind),g=G(b.gid);return m.ch==='email'
  ?`<div class="walbl">${ic('mail')}Email to ${esc(g.email)}</div><div class="mail"><div class="mh"><b>${esc(t.sub)}</b>From ${esc(VENUES[S.vi].name)} via XTRA · ${m.at}</div><div class="mb">${esc(t.body)}${t.cta?`<br><span class="cta">${esc(t.cta)}</span>`:''}</div></div>`
  :`<div class="walbl">${ic('wa')}WhatsApp to ${esc(g.phone)}</div><div class="wa">${esc(t.body)}${t.link?`\n${t.link}`:''}${m.kind==='confirmed'?`<div class="pass"><span class="qr">${qrSVG(b.code)}</span><span><b>${b.code}</b><br><span class="mute" style="font-size:13px">QR pass</span></span></div>`:''}<small>${m.at} ✓✓</small></div>`}
function notify(b,kind){const at=nowStr();channels().forEach(ch=>b.msgs.push({kind,ch,at}))}
function msgsBlock(b){const ms=b.msgs.flatMap(m=>m.ch?[m]:channels().map(ch=>({...m,ch})));const last=ms.slice(-channels().length);return last.length?`<div class="msgs"><h3 style="margin-top:22px">Last message sent</h3>${last.map(m=>msgHTML(b,m)).join('')}</div>`:''}

/* ---------- guest booking page (live, from the public API) ---------- */
let PUB=null;
const pubGet=u=>api('GET','/public'+u,undefined,null),pubPost=(u,b={})=>api('POST','/public'+u,b,null);
async function loadPub(slug){const info=await pubGet(`/venues/${slug}`);
  const layout=(info.layout||[]).map(i=>i.kind==='zone'?{id:i.id,kind:'zone',area:i.id,x:i.x,y:i.y,w:i.w,h:i.h,rot:0}:(i.kind==='table'||i.kind==='sofa')?{id:i.id,kind:SHAPES.includes(i.shape)?i.shape:'round',name:i.label,x:i.x,y:i.y,seats:i.seats,rot:i.rotation||0,zone:i.zoneId}:{id:i.id,kind:i.kind,name:i.label,x:i.x,y:i.y,w:i.w,h:i.h,rot:i.rotation||0});
  PUB={slug,info,layout,areas:info.areas.map(a=>({id:a.id,name:a.name,min:P2E(a.minSpend),dep:P2E(a.deposit)})),days:{}}}
const pubDays=()=>[0,1,2,3,4,5,6].map(i=>dparts(addDays(nightYmd(),i)));
let PDAYS=pubDays();
const pubAR=id=>PUB.areas.find(a=>a.id===id)||PUB.areas[0]||{id:null,name:'Any area',min:0,dep:0};
const pubEL=id=>PUB.layout.find(e=>e.id===id);
const pubSlot=id=>(PUB.days[PDAYS[S.gp.day][3]]?.slots||[]).find(s=>s.id===id);
const slotTxt=s=>s?`${t12(hm2min(s.from))} to ${t12(hm2min(s.to))}`:'';
function ensurePub(){const slug=GUEST?GUEST.slug:VENUES[S.vi].slug;
  if(!PUB||PUB.slug!==slug){if(!ensurePub.busy){ensurePub.busy=loadPub(slug).then(()=>{ensurePub.busy=null;render()}).catch(e=>{ensurePub.busy=null;if(GUEST&&e.status===404){GUEST.err='This venue page does not exist. Check the link with the venue.';render()}else toast(e.message)})}return false}
  const d=PDAYS[S.gp.day][3];if(!PUB.days[d]){PUB.days[d]={loading:true};pubGet(`/venues/${slug}/slots?date=${d}`).then(r=>{PUB.days[d]=r;render()}).catch(e=>toast(e.message));return false}
  return !PUB.days[d].loading}
function wsteps(){const a=[{k:'main',t:'Your booking'}];if(S.gp.party>1&&PUB.info.askNames)a.push({k:'guests',t:'Your guests'});a.push({k:'review',t:'Review and send'});return a}
const STEPS=[['in_review','In review'],['accepted','Accepted, pay deposit'],['confirmed','Confirmed, QR pass ready'],['arrived','At the venue']];
const PILL={in_review:'request',accepted:'accepted',confirmed:'confirmed',arrived:'arrived',completed:'done',declined:'declined',cancelled:'cancelled',no_show:'noshow'};
function phoneStatus(st){
  const order=['in_review','accepted','confirmed','arrived','completed'],idx=order.indexOf(st.status),s=st.status;
  const steps=['declined','cancelled','no_show'].includes(s)?`<div class="done">Request sent</div><div class="now" style="color:#d93a3a"><span>${s==='declined'?'Declined by the venue':s==='no_show'?'Marked as no-show':'Cancelled'}</span></div>`
    :`<div class="done">Request sent</div>`+STEPS.map(([k,l])=>{const si=order.indexOf(k);return `<div class="${idx>si||(k==='arrived'&&idx>=3)?'done':idx===si?'now':''}">${l}</div>`}).join('');
  const dep=P2E(st.deposit.amount),min=P2E(st.minSpend);let action='';
  if(s==='in_review')action=`<p style="margin:0;color:#5b6280;font-size:14px">${esc(st.venue.name)} usually replies within an hour. We'll send you ${{both:'an email and a WhatsApp',whatsapp:'a WhatsApp',email:'an email'}[st.notifyChannel]||'a message'}.</p>`;
  if(s==='accepted'&&st.deposit.due)action=`<div class="amount"><span style="font-size:13px;color:#5b6280">Deposit to pay now</span><div class="big num">${egp(dep)}</div><span style="font-size:13px;color:#5b6280">Comes off your bill.${min?' Minimum spend '+egp(min)+'.':''}</span></div>
   <button class="gbtn" data-a="gppay" ${S.gp.busy?'disabled':''}>${S.gp.busy?'Opening payment…':'Pay '+egp(dep)}</button><div style="font-size:12px;color:#5b6280;text-align:center">Card, Meeza, wallets, InstaPay or valU · secure payment by Paymob</div>`;
  if(['confirmed','arrived','completed'].includes(s)&&st.qrToken)action=`<div style="text-align:center"><span class="qr" style="box-shadow:0 0 0 1px #d7dde3">${qrSVG(location.origin+'/p/'+st.qrToken)}</span><div style="font-weight:800;margin-top:6px">${st.code}</div><div style="font-size:13px;color:#5b6280">Show this at the door</div></div>${dep?`<div class="amount" style="font-size:14px">Deposit paid <b class="num">${egp(dep)}</b></div>`:''}
   ${st.party.length>1?`<div class="gcard"><div class="gch">Passes for your guests</div>${st.party.filter(p=>!p.isBooker).map(p=>`<div class="sum" style="font-size:14px"><span>${esc(p.name)}</span>${p.passUrl?`<a href="${esc(p.passUrl)}" target="_blank" rel="noopener" style="color:#12153f;font-weight:700">Open pass</a>`:''}</div>`).join('')}<div style="font-size:12px;color:#5b6280">Everyone who gave a WhatsApp or email got their own pass.</div></div>`:''}`;
  if(s==='declined')action=`<p style="margin:0;color:#5b6280;font-size:14px">Sorry, the venue can't take this booking.${st.declineReason?' '+esc(st.declineReason):''} You were not charged.</p><button class="btn ghost" data-a="gpreset">Try another night</button>`;
  return `<div class="url">🔒 ${esc(location.host)}/b/${st.code}</div><div class="gbody" style="padding-top:8px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><h3 style="font-size:20px">My booking</h3>${pillFor(PILL[s]||s)}</div>
  <div class="facts" style="margin:0"><div><span>Night</span><b>${esc(dparts(st.date).slice(0,3).join(' '))}</b></div><div><span>Time</span><b class="num">${t12(hm2min(st.time.split(' ')[0]))}</b></div><div><span>Guests</span><b>${st.partySize}</b></div><div><span>${st.table?'Table':'Area'}</span><b>${esc(st.table||st.area||'Any')}</b></div></div>
  <div class="steps">${steps}</div>${action}</div>`;
}
function gpMap(){const gp=S.gp,H0=620,PT=(x,y)=>[H0-y,x],PR=r=>({x:H0-(r.y+r.h),y:r.x,w:r.h,h:r.w}),tk=new Set(PUB.days[PDAYS[gp.day][3]]?.takenTables||[]),L=PUB.layout;
  let o=`<svg viewBox="0 0 620 1000" role="img" aria-label="Floor map">`;
  L.filter(x=>x.kind==='zone').forEach(z=>{const r=PR(z);o+=`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="16" fill="#fff"/>${r.w<200?'':`<text x="${r.x+12}" y="${r.y+24}" font-size="20" font-weight="700" fill="#5b6280">${esc(pubAR(z.area).name)}</text>`}`});
  L.filter(x=>!isT(x)&&x.kind!=='zone').forEach(f=>{const r=PR(f);o+=f.kind==='entrance'?`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="4" fill="var(--vc)"/>`:`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="12" fill="#12153f"/><text x="${r.x+r.w/2}" y="${r.y+r.h/2+8}" text-anchor="middle" font-size="22" font-weight="800" fill="#fff">${esc((f.name||'').toUpperCase())}</text>`});
  L.filter(isT).forEach(t=>{const [cx,cy]=PT(t.x,t.y),taken=tk.has(t.id),sel=gp.table===t.id,fill=taken?'#d7dde3':sel?'#ffff6f':'#bfeaff',f=furn(t,fill,true);
    o+=`<g ${taken?'':`data-a="gptable" data-v="${t.id}" style="cursor:pointer"`} role="button" aria-label="Table ${esc(t.name)}, ${t.seats} seats${taken?', taken':''}"><g transform="translate(${cx} ${cy}) rotate(${(t.rot+90)%360})">${f.svg}</g><text x="${cx}" y="${cy+1}" text-anchor="middle" font-size="21" font-weight="800" fill="${taken?'#8a90aa':'#12153f'}">${sel?'✓ ':''}${esc(t.name)}</text><text x="${cx}" y="${cy+19}" text-anchor="middle" font-size="14" font-weight="600" fill="${taken?'#8a90aa':'#5b6280'}">${taken?'Taken':t.seats+' seats'}</text></g>`});
  return o+'</svg>'}
/** The guest's phone: booking form, then the live status of their booking. */
function guestPhone(){
  if(!ensurePub())return `<div class="phone"><div class="screen"><div class="loading">Loading…</div></div></div>`;
  const I=PUB.info,PV=I.venue,gp=S.gp;
  if(!gp.area||!PUB.areas.some(a=>a.id===gp.area))gp.area=PUB.areas[0]?.id||null;
  const A=pubAR(gp.area),day=PUB.days[PDAYS[gp.day][3]],sl=day.slots||[];
  while(gp.others.length<gp.party-1)gp.others.push({name:'',phone:'',email:'',ig:'',gender:''});gp.others.length=Math.max(0,gp.party-1);
  const f=gp.f,fld=(attr,o,k,l,ph,type='text',extra='')=>`<label class="f">${l}<input ${attr}="${k}" type="${type}" value="${esc(o[k.split(':').pop()])}" placeholder="${ph}" ${extra}></label>`;
  const gsel=(attr,k,val)=>`<label class="f">Gender<select class="gsel" ${attr}="${k}"><option value="">Choose</option>${['Female','Male'].map(x=>`<option ${val===x?'selected':''}>${x}</option>`).join('')}</select></label>`;
  const person=(attr,pre,o)=>fld(attr,o,pre+'name','Full name','As on ID','text','autocomplete="off"')+`<div class="f telf">WhatsApp number${telField({bind:`${attr}="${pre}phone"`,value:o.phone,label:'WhatsApp number'})}</div>`+fld(attr,o,pre+'email','Email','name@example.com','email','autocomplete="off"')+fld(attr,o,pre+'ig','Instagram','@handle','text','autocapitalize="off" autocomplete="off"')+gsel(attr,pre+'gender',o.gender);
  const ST=wsteps(),cur=ST[gp.w]||ST[0];
  const logo=PV.logoUrl?`<img src="${esc(PV.logoUrl)}" alt="" class="vlogo">`:`<span class="vlogo mono">${esc(PV.name.split(' ').map(w=>w[0]).join('').slice(0,2))}</span>`;
  const hero=`<div class="ghero">${BIGX('bx')}<div class="ghead">${logo}<div><h2>${esc(PV.name)}</h2><p>${esc(PV.where||'')}</p></div></div></div>`;
  const socials=Object.entries(I.socials||{}).filter(([,u])=>u).map(([k,u])=>`<a href="https://${esc(u.replace(/^https?:\/\//,''))}" target="_blank" rel="noopener">${esc(k)}</a>`).join(' · ');
  let body;
  if(gp.step==='form'){
    let inner='';
    const mainWhen=`<div><div class="lbl">Night</div><div class="days">${PDAYS.slice(0,4).map(([d,n,mo],i)=>`<button class="${gp.day===i?'on':''}" data-a="gpday" data-v="${i}">${d}<b>${n}</b>${mo}</button>`).join('')}</div></div>
      <div><div class="lbl">Arrival time</div><div class="slotlist">${sl.map(s=>`<button class="${gp.slot===s.id?'on':''}" data-a="gpslot" data-v="${s.id}" ${s.full?'disabled':''}><span>From <b>${t12(hm2min(s.from))}</b> to <b>${t12(hm2min(s.to))}</b></span><small>${s.full?'Full':gp.slot===s.id?'Selected':''}</small></button>`).join('')||'<p style="color:#5b6280;margin:0">No times open this night.</p>'}</div></div>`;
    const mainTable=`<div><div class="lbl">How many guests, including you</div><div class="stepper"><button data-a="gpparty" data-v="-1" aria-label="Fewer">−</button><b class="num">${gp.party}</b><button data-a="gpparty" data-v="1" aria-label="More">+</button></div></div>
      ${PUB.areas.length?`<div><div class="lbl">Where</div><div class="gareas">${PUB.areas.map(a=>`<button class="${gp.area===a.id?'on':''}" data-a="gparea" data-v="${a.id}"><span><b>${esc(a.name)}</b><br><span style="color:#5b6280">Min spend ${egp(a.min)}</span></span><span style="color:#5b6280;text-align:right">Deposit<br><b style="color:#12153f">${a.dep?egp(a.dep):'None'}</b></span></button>`).join('')}</div></div>`:''}`;
    const mapPick=I.mapPick&&PUB.layout.length?`<div><div class="lbl">Pick your table</div><div class="evmap gmap">${gpMap()}</div><div style="font-size:13px;color:#5b6280;margin-top:6px">${gp.table&&pubEL(gp.table)?`<b style="color:#12153f">Table ${esc(pubEL(gp.table).name)}</b> · ${pubEL(gp.table).seats} seats · ${esc(pubAR(pubEL(gp.table).zone).name)}`:'Tap a free table. Grey ones are taken.'}</div></div>`:'';
    if(cur.k==='main')inner=mainWhen+mainTable+mapPick+`<div class="lbl" style="margin:4px 0 -8px;font-size:15px">Your details</div>`+person('data-gp','',f)+`<label class="chk"><input type="checkbox" data-gp="consent" ${f.consent?'checked':''}>Send me offers and events from ${esc(PV.name)} on WhatsApp and email</label>`;
    if(cur.k==='guests')inner=gp.others.map((o,i)=>`<div class="gcard"><div class="gch">Guest ${i+2}</div>${person('data-gpo',i+':',o)}</div>`).join('');
    if(cur.k==='review'){const s2=pubSlot(gp.slot);inner=`<div class="facts" style="margin:0"><div><span>Night</span><b>${dayStrP(gp.day)}</b></div><div><span>Time</span><b class="num">${s2?t12(hm2min(s2.from)):''}</b><span>to ${s2?t12(hm2min(s2.to)):''}</span></div><div><span>Guests</span><b>${gp.party}</b></div><div><span>Area</span><b>${esc(A.name)}</b>${gp.table&&pubEL(gp.table)?`<span>Table ${esc(pubEL(gp.table).name)}</span>`:''}</div></div>
      <div class="gcard"><div class="gch">You</div><div style="font-size:14px">${esc(f.name)}<br>${esc(fmtPhone(f.phone))} · ${esc(f.email)}<br>${esc(f.ig)} · ${esc(f.gender)}</div></div>
      ${I.askNames?gp.others.map((o,i)=>`<div class="gcard"><div class="gch">Guest ${i+2}</div><div style="font-size:14px">${esc(o.name)}<br>${esc(o.phone)} · ${esc(o.email)}<br>${esc(o.ig)} · ${esc(o.gender)}</div></div>`).join(''):''}
      <div class="amount" style="font-size:14px">Minimum spend <b>${egp(A.min)}</b>${A.dep?`<br>Deposit <b>${egp(A.dep)}</b>, paid only if the venue accepts`:''}</div>`}
    body=`<div class="wiz"><div class="wbar">${ST.map((s,i)=>`<i class="${i<=gp.w?'on':''}"></i>`).join('')}</div><div class="wlbl">Step ${gp.w+1} of ${ST.length} · <b>${cur.t}</b></div></div><div class="gbody">${inner}${gp.err?`<div class="err" role="alert">${esc(gp.err)}</div>`:''}</div>
      <div class="wnav">${gp.w?'<button class="btn ghost" data-a="gpprev">Back</button>':''}<button class="gbtn" data-a="${cur.k==='review'?'gpsubmit':'gpnext'}" ${gp.busy?'disabled':''}>${cur.k==='review'?(gp.busy?'Sending…':'Send request'):'Continue'}</button></div>${cur.k==='review'?'<div class="wfoot">No payment now. You pay the deposit only if the venue accepts. By sending you agree to the <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/refunds" target="_blank" rel="noopener">deposit rules</a>.</div>':''}${socials&&gp.w===0?`<div class="wfoot">${socials}</div>`:''}${gp.w===0?LEGAL:''}`;
  }
  else body=gp.st?phoneStatus(gp.st):'<div class="loading">Loading…</div>';
  const loc=gp.step==='form'&&gp.w===0?`<div class="gbody gloc"><div class="lbl" style="font-size:15px">Location</div>${locCard(PV)}</div>`:'';
  return `<div class="phone"><div class="screen" style="--vc:${esc(PV.color||'#12153f')}"><div class="sbar"><span>9:41</span><span>●●● 5G</span></div><div class="gscroll" id="gscroll"><div class="glay gbook"><aside class="gside">${hero}${loc}</aside><div class="gmain">${body}</div></div></div></div></div>`;
}
const dayStrP=d=>PDAYS[d]?`${PDAYS[d][0]} ${PDAYS[d][1]} ${PDAYS[d][2]}`:'';
function vPage(){
  const VV=VENUES[S.vi],gp=S.gp,c=CFG(),phone=guestPhone();
  const b=gp.code&&S.bookings.find(x=>x.code===gp.code);
  const link=`${location.origin}/book/${VV.slug}`;
  const side=b?`<div class="vside"><div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap"><h3>Your side: ${esc(G(b.gid).name)}</h3>${pillFor(b.status)}</div><p class="mute" style="margin:6px 0 0;font-size:15px">${dayStr(b.day)} · ${t12(b.time)} · ${gN(b.party)} · ${esc(AR(b.area).name)} · ${esc(G(b.gid).ig)}</p>${b.status==='request'?`<div class="two" style="margin-top:12px"><button class="btn" data-a="approve" data-v="${b.id}">Accept</button><button class="btn warn" data-a="decline" data-v="${b.id}">Decline</button></div>`:''}${b.status==='accepted'?`<p class="mute" style="margin:10px 0 0;font-size:14px">Waiting for the guest to pay. Try paying on the phone.</p>`:''}</div>${msgsBlock(b)}</div>`
  :`<div class="notes">
  <div class="note"><i>1</i><div><h3>Guest books on one screen</h3><p>One screen for the night, time slot, table area and their details. Full slots can't be picked.</p></div></div>
  <div class="note"><i>2</i><div><h3>Then their guests, then review</h3><p>Every +1 gives the same details: name, WhatsApp, email, Instagram and gender.</p></div></div>
  <div class="note"><i>3</i><div><h3>The request is in review</h3><p>You accept or decline from Bookings. They hear back by ${{both:'email and WhatsApp',wa:'WhatsApp',email:'email'}[c.notify]}.</p></div></div>
  <div class="note"><i>4</i><div><h3>Accepted guests pay from their booking link</h3><p>Their page shows the status and the deposit. Once paid they get the QR pass.</p></div></div>
  <div class="card" style="margin-top:6px"><span class="mute" style="font-size:14px">Your booking link, share it on Instagram and WhatsApp</span><div style="font-weight:700;overflow-wrap:anywhere"><a href="${link}" target="_blank" rel="noopener" style="color:inherit">${esc(link)}</a></div></div></div>`;
  return head('Booking page','What your guests see. This phone is live: a request sent here lands in Bookings.')+`<div class="gp">${side}${phone}</div>`;
}
let statusTimer=null;
async function loadStatus(){const gp=S.gp;if(!gp.code)return;try{gp.st=await pubGet(`/bookings/${gp.code}`);render()}catch(e){toast(e.message)}
  clearTimeout(statusTimer);if(gp.st&&['in_review','accepted'].includes(gp.st.status))statusTimer=setTimeout(()=>{if(S.gp.code===gp.code&&(GUEST||VIEW==='page'))loadStatus().then(()=>{if(!GUEST)refresh()})},GUEST?6000:8000)}
const chk=o=>!o.name.trim()?'Add the full name.':!telOk(o.phone)?'Add a valid WhatsApp number. For Egypt: 10 1234 5678.':!/^\S+@\S+\.\S+$/.test(o.email)?'Add a valid email.':!o.ig.trim()?'Add the Instagram handle.':!o.gender?'Choose the gender.':'';
const PAGEACT={
gpday:v=>{S.gp.day=+v;S.gp.slot=null;S.gp.table=null;render()},
gpprev:()=>{S.gp.err='';S.gp.w=Math.max(0,S.gp.w-1);render();$('#gscroll').scrollTop=0},
gpnext:()=>{const gp=S.gp,k=wsteps()[gp.w].k;let err='';
  if(k==='main')err=gp.slot==null?'Pick an arrival time.':PUB.info.mapPick&&PUB.layout.length&&!gp.table?'Pick your table on the map.':chk(gp.f);
  if(k==='guests'){const i=gp.others.findIndex(o=>chk(o));if(i>=0)err='Guest '+(i+2)+': '+chk(gp.others[i])}
  gp.err=err;if(!err)gp.w++;render();if(!err)$('#gscroll').scrollTop=0},
gpslot:v=>{S.gp.slot=v;render()},
gpparty:v=>{const gp=S.gp;gp.party=Math.max(1,Math.min(20,gp.party+ +v));if(gp.table&&pubEL(gp.table)?.seats<gp.party)gp.table=null;render()},
gparea:v=>{const gp=S.gp;gp.area=v;if(gp.table&&pubEL(gp.table)?.zone!==v)gp.table=null;render()},
gptable:v=>{const gp=S.gp,t=pubEL(v);if(t.seats<gp.party){toast(`Table ${t.name} has ${t.seats} seats. Pick a bigger one or fewer guests.`);return}gp.table=gp.table===v?null:v;if(gp.table&&t.zone)gp.area=t.zone;render()},
gpsubmit:async()=>{const gp=S.gp,f=gp.f;if(gp.busy)return;gp.busy=true;gp.err='';render();
  const P=o=>({name:o.name.trim(),...(o.phone.trim()?{phone:o.phone.trim()}:{}),...(/^\S+@\S+\.\S+$/.test(o.email)?{email:o.email.trim()}:{}),...(o.ig.trim()?{instagram:o.ig.trim().replace(/^@/,'')}:{}),...(o.gender?{gender:o.gender.toLowerCase()}:{})});
  try{const r=await pubPost(`/venues/${PUB.slug}/bookings`,{date:PDAYS[gp.day][3],slotId:gp.slot,...(gp.area?{zoneId:gp.area}:{}),...(gp.table?{tableId:gp.table}:{}),partySize:gp.party,
      booker:{...P(f),whatsappOptIn:!!f.consent,emailOptIn:!!f.consent},guests:PUB.info.askNames?gp.others.map(P):[]});
    gp.code=r.code;gp.step='status';gp.busy=false;PUB.days={};
    if(GUEST)history.replaceState(null,'','/b/'+r.code);
    await loadStatus();if(!GUEST)await refresh();$('#gscroll')&&($('#gscroll').scrollTop=0);
    toast(r.status==='in_review'?(GUEST?'Request sent. We will message you as soon as the venue replies.':'Request is in review. Accept or decline it here or under Bookings.'):'Accepted. Check the booking page.')}
  catch(e){gp.busy=false;gp.err=e.message;if(e.code==='slot_full'||e.code==='table_taken')PUB.days={};render()}},
gppay:async()=>{const gp=S.gp;if(gp.busy)return;const w=window.open('','_blank');gp.busy=true;render();
  try{const r=await pubPost(`/bookings/${gp.code}/pay`);if(w)w.location=r.checkoutUrl;else location.href=r.checkoutUrl;toast('Finish paying in the new tab. This page updates by itself.')}catch(e){w&&w.close();toast(e.message)}
  gp.busy=false;render();clearTimeout(statusTimer);statusTimer=setTimeout(loadStatus,4000)},
gpreset:()=>{S.gp=newGP();if(GUEST)history.replaceState(null,'','/book/'+PUB.slug);render()}
};

/* ---------- setup ---------- */
/* Daily report: a short morning summary of last night to the owner. */
const DR=()=>{const d=CFG().dailyReport||VENUES[S.vi].raw.settings?.dailyReport||{};return {on:!!d.on,channel:d.channel||'both',emails:d.emails||[],phones:d.phones||[]}};
const drSave=d=>{CFG().dailyReport=d;saveSettings({dailyReport:d},'dailyreport')};
function drCard(){const d=DR(),em=d.channel!=='whatsapp',wa=d.channel!=='email';
  const head=`<div class="conn" style="padding-top:0"><div><h3>Morning report</h3><div class="mute" style="font-size:14px">${d.on?"Last night's money, bookings and tickets, sent at 10 AM. Quiet nights are skipped.":'Off. Switch it on to get last night\'s numbers every morning at 10.'}</div></div><button class="toggle ${d.on?'on':''}" data-a="drtoggle" role="switch" aria-checked="${d.on}" aria-label="Morning report"></button></div>`;
  if(!d.on)return `<div class="bigbox">${head}</div>`;
  return `<div class="bigbox">${head}
  <div class="seg" role="radiogroup" aria-label="Send the report by" style="margin:12px 0 4px">${[['whatsapp','WhatsApp'],['email','Email'],['both','Both']].map(([k,l])=>`<button class="${d.channel===k?'on':''}" data-a="drch" data-v="${k}" role="radio" aria-checked="${d.channel===k}">${l}</button>`).join('')}</div>
  ${em?`<label class="f" style="margin-top:10px">Send to these emails<input data-dr="emails" value="${esc(d.emails.join(', '))}" placeholder="Leave empty to send to the venue owners" autocomplete="off" inputmode="email"></label>`:''}
  ${wa?`<div class="f telf" style="margin-top:10px">WhatsApp number${telField({bind:'data-dr="phone"',value:d.phones[0]||'',label:'WhatsApp number for the report'})}</div>${d.phones[0]?'':`<p class="mute" style="font-size:13px;margin:6px 0 0">Add a number, or nothing goes by WhatsApp.</p>`}`:''}
  <button class="btn ghost sm" data-a="drtest" style="margin-top:12px">Send me last night's report now</button></div>`}
function vSetup(){
  const c=CFG();
  const tg=(k,on,l,s)=>`<div class="conn"><div><b>${l}</b><div class="mute" style="font-size:14px">${s}</div></div><button class="toggle ${on?'on':''}" data-a="conn" data-v="${k}" role="switch" aria-checked="${on}" aria-label="${l}"></button></div>`;
  const link=`${location.origin}/book/${VENUES[S.vi].slug}`;
  const tsel=(k,from,to)=>`<select data-cfg="${k}">${Array.from({length:(to-from)/30+1},(_,i)=>from+i*30).map(m=>`<option value="${m}" ${c[k]===m?'selected':''}>${t12(m)}</option>`).join('')}</select>`;
  return head('Venue setup',esc(VENUES[S.vi].name)+' · changes apply right away',`<button class="btn ghost" data-a="go" data-v="editor">${ic('editor')}Edit floor map</button>`)+`<div class="setgrid">
  <div class="bigbox"><h3>Booking time slots</h3><div class="two" style="margin-top:12px"><label class="f">First slot${tsel('first',17*60,24*60)}</label><label class="f">Last slot${tsel('last',20*60,27*60)}</label></div>
  <div class="two" style="margin-top:10px"><label class="f">Every<select data-cfg="step">${[15,30,60].map(m=>`<option value="${m}" ${c.step===m?'selected':''}>${m} minutes</option>`).join('')}</select></label><label class="f">Bookings per slot<input type="number" min="1" max="50" data-cfg="max" value="${c.max}" inputmode="numeric"></label></div>
  <div class="slotprev">${slots().map(m=>`<span>${t12(m)}</span>`).join('')||'<span>Last slot is before the first one</span>'}</div></div>
  <div class="bigbox"><h3>Who reviews requests</h3><div class="seg" style="margin:12px 0">${[['manual','I accept each one'],['auto','Accept when a slot is free']].map(([k,l])=>`<button class="${c.approval===k?'on':''}" data-a="appr" data-v="${k}">${l}</button>`).join('')}</div></div>
  <div class="bigbox"><h3>Areas, minimum spend and deposit</h3>${V().areas.map(a=>`<div class="area"><div><b>${esc(a.name)}</b><div class="mute" style="font-size:14px">${TABLES().filter(t=>areaOf(t)===a.id).length} tables</div></div><label class="f">Min spend<input type="number" inputmode="numeric" step="500" data-area="${a.id}" data-k="min" value="${a.min}"></label><label class="f">Deposit<input type="number" inputmode="numeric" step="500" data-area="${a.id}" data-k="dep" value="${a.dep}"></label></div>`).join('')}</div>
  <div class="bigbox"><h3>Booking page</h3><div class="two" style="margin:10px 0 12px"><label class="f">Venue name<input data-vset="name" value="${esc(VENUES[S.vi].name)}" autocomplete="off"></label><label class="f">Location<input data-vset="where" value="${esc(VENUES[S.vi].where)}" placeholder="Zamalek, Cairo" autocomplete="off"></label></div><div class="logorow">${c.logo?`<img src="${c.logo}" alt="Venue logo" class="vlogo">`:`<span class="vlogo mono">${esc(VENUES[S.vi].name.split(' ').map(w=>w[0]).join('').slice(0,2))}</span>`}<label class="btn ghost sm" style="cursor:pointer">${c.logo?'Change logo':'Upload logo'}<input type="file" id="logofile" accept="image/*" hidden></label>${c.logo?'<button class="btn ghost sm" data-a="nologo">Remove</button>':''}</div><div class="stack" style="margin-top:10px">${Object.keys(c.socials).map(k=>`<label class="f">${k}<input data-social="${k}" value="${esc(c.socials[k])}" placeholder="${k.toLowerCase()}.com/yourvenue" autocomplete="off"></label>`).join('')}</div>${tg('askNames',c.askNames,"Ask for every guest's name",'Guests list who is coming with them')}${tg('mapPick',c.mapPick,'Seat map on the booking page','Guests see your floor map and pick a free table. Off: they pick an area and you choose the table.')}<div class="conn"><div style="min-width:0"><b>Your booking link</b><div class="mute" style="font-size:14px;overflow-wrap:anywhere"><a href="${link}" target="_blank" rel="noopener" style="color:inherit">${esc(link)}</a></div></div></div>
  <div class="bigbox"><h3>Location</h3><p class="mute" style="font-size:14px;margin:4px 0 10px">Shown on your booking and ticket pages, with a Directions button.</p><label class="f">Google Maps link<input data-vmap value="${esc(VENUES[S.vi].raw.mapUrl||'')}" placeholder="Paste the Share link from Google Maps" inputmode="url" autocomplete="off"></label><p class="mute" style="font-size:13px;margin:6px 0 0">${VENUES[S.vi].raw.mapLat!=null?'Pin found. Guests see the map below.':VENUES[S.vi].raw.mapUrl?'No pin in this link yet. Open your place in Google Maps, tap Share and paste that link.':'In Google Maps: find your venue, tap Share, copy the link and paste it here.'}</p><div class="logorow"><label class="btn ghost sm" style="cursor:pointer">${VENUES[S.vi].raw.photoUrl?'Change photo':'Upload venue photo'}<input type="file" id="vphoto" accept="image/jpeg,image/png,image/webp" hidden></label>${VENUES[S.vi].raw.photoUrl?'<button class="btn ghost sm" data-a="nophoto">Remove photo</button>':''}</div><div class="locprev">${locCard({...evVenue({}),name:VENUES[S.vi].name,where:VENUES[S.vi].where})}</div></div></div>
  <div class="bigbox"><h3>Ticket fees</h3><p class="mute" style="font-size:14px;margin:4px 0 0">Added on top of the ticket price at checkout. VAT is charged on the fees only.</p>${ME.user.isSuperAdmin?`<div class="two" style="margin-top:12px"><label class="f">Booking fee %<input type="number" min="0" max="50" step="0.5" data-fee="feePct" value="${c.feePct??5}" inputmode="decimal"></label><label class="f">VAT on fees %<input type="number" min="0" max="30" step="0.5" data-fee="vatPct" value="${c.vatPct??14}" inputmode="decimal"></label></div><p class="mute" style="font-size:13px;margin:8px 0 0">You are an XTRA admin: this applies to every venue.</p>`:`<div class="conn"><div><b>Booking fee</b></div><b class="num">${c.feePct}%</b></div><div class="conn"><div><b>VAT on fees</b></div><b class="num">${c.vatPct}%</b></div><p class="mute" style="font-size:13px;margin:8px 0 0">Set by XTRA.</p>`}<p class="mute num" style="font-size:14px;margin:10px 0 0">Example: a ${egp(1000)} ticket pays ${egp(Math.round(1000*(c.feePct??5)/100))} fees + ${egp(Math.round(1000*(c.feePct??5)/100*(c.vatPct??14)/100))} VAT = ${egp(1000+Math.round(1000*(c.feePct??5)/100)+Math.round(1000*(c.feePct??5)/100*(c.vatPct??14)/100))}</p></div>
  ${CAN('reports')||CAN('setup')?drCard():''}
  <div class="bigbox"><h3>Payments and messages</h3>${[['paymob','Paymob','Cards, Meeza, wallets, InstaPay, valU'],['whatsapp','WhatsApp Business','Requests, confirmations, passes, campaigns'],['email','Email','Booking and ticket emails in your venue name'],['appleWallet','Apple Wallet','Add to Apple Wallet on passes and tickets'],['googleWallet','Google Wallet','Add to Google Wallet on passes and tickets']].map(([k,l,d])=>`<div class="conn"><div><b>${l}</b><div class="mute" style="font-size:14px">${d}</div></div><span class="pill ${LIVE_INT[k]?'p-arrived':'p-pending'}">${LIVE_INT[k]?'Live':'Test mode'}</span></div>`).join('')}<p class="mute" style="font-size:13px;margin:10px 0 0">Test mode: payments open a test checkout and messages are saved, not sent. XTRA connects the live accounts.</p></div>
  ${CAN('staff')?`<div class="bigbox"><h3>Staff</h3>${S.staff.map(m=>`<div class="conn"><div><b>${esc(m.name)}</b><div class="mute" style="font-size:14px">${esc(m.email)}</div></div>${roleSelect(m)}</div>`).join('')||'<div class="empty">No staff yet.</div>'}
  <h3 style="margin-top:18px">Add staff</h3><form id="addstaff" class="stack" style="margin-top:8px"><div class="two"><label class="f">Name<input id="sname" required minlength="2" autocomplete="off"></label><label class="f">Role<select id="srole">${roleOptions(S.roles,'waiter')}</select></label></div><div class="two"><label class="f">Email<input id="semail" type="email" required autocomplete="off"></label><label class="f">Password<input id="spass" type="text" required minlength="8" autocomplete="off" placeholder="At least 8 characters"></label></div><button class="btn sm" type="submit">Add staff</button></form></div>`:''}</div>`;
}

/* ---------- render ---------- */
const POWERED='<footer class="powered"><span>Powered by</span><img src="/web/brand/xtra-gray.png" alt="XTRA" width="45" height="10"></footer>';
/** "Powered by XTRA" at the very bottom of every scrolling page (staff screens, guest screens, phone previews). */
function powered(){document.querySelectorAll('#main,.gscroll').forEach(el=>{if(!el.querySelector(':scope>.powered'))el.insertAdjacentHTML('beforeend',POWERED)})}
function render(){if(!GUEST&&S&&ME&&!NAV.some(n=>CAN(n[2]))){shell();$('#main').innerHTML='<div class="loading">Your role has no screens at this venue yet. Ask your manager to give it some.</div>';return}if(GUEST){const g=document.querySelector('#guest .gscroll'),st=g?.scrollTop;$('#guest').innerHTML=guestView();const g2=document.querySelector('#guest .gscroll');powered();if(st&&g2)g2.scrollTop=st;return}if(!S||!ME)return;shell();const VW={floor:vFloor,bookings:vBookings,door:vDoor,orders:vOrders,guests:vGuests,page:vPage,setup:vSetup,editor:vEditor,events:vEvents,marketing:vMarketing,community:vCommunity,reports:vReports,messages:vMessages,admin:vAdmin}[VIEW];const gs=$('#gscroll')?.scrollTop;$('#main').innerHTML=VW();powered();drawMap();if(gs&&$('#gscroll'))$('#gscroll').scrollTop=gs;if(S.sheet)openSheet(S.sheet,true)}

/* ---------- sheets ---------- */
function qrSVG(txt){try{const q=qrcode(0,'M');q.addData(txt);q.make();const n=q.getModuleCount();let p='';for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(q.isDark(r,c))p+=`M${c} ${r}h1v1h-1z`;return `<svg viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${p}" fill="#12153f"/></svg>`}catch(e){return `<div style="width:132px;height:132px;display:grid;place-items:center;color:#12153f;font-weight:800;line-height:1.2">${esc(txt)}</div>`}}
function bookingBody(b){
  const g=G(b.gid),A=AR(b.area),st=b.status,bl=bill(b);
  let acts='';
  if(st==='request')acts=`<div class="two"><button class="btn" data-a="approve" data-v="${b.id}">Accept</button><button class="btn warn" data-a="decline" data-v="${b.id}">Decline</button></div>`;
  if(st==='accepted')acts=`<button class="btn teal" data-a="markpaid" data-v="${b.id}">Deposit paid at venue</button><button class="btn ghost" data-a="resend" data-v="${b.id}">Resend payment link</button><button class="btn warn" data-a="decline" data-v="${b.id}">Cancel booking</button>`;
  if(st==='confirmed')acts=`<button class="btn teal" data-a="checkin" data-v="b:${b.id}">Check in at door</button><button class="btn ghost" data-a="seat" data-v="${b.id}">Seat now</button><button class="btn warn" data-a="noshow" data-v="${b.id}">Mark no-show</button>`;
  if(st==='arrived')acts=`<button class="btn teal" data-a="seat" data-v="${b.id}">Seat at ${b.table?esc(TN(b.table)):'a table'}</button>`;
  if(st==='seated')acts=`<button class="btn teal" data-a="toorder" data-v="${b.id}">Add to order</button><button class="btn" data-a="openbill" data-v="${b.id}">Bill · ${egp(bl.total)}</button>`;
  const pct=Math.min(100,bl.sub/Math.max(1,A.min)*100);
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">${pillFor(st)}<span class="mute">${b.code} · ${esc(b.src)}</span></div>
  <div class="facts"><div><span>When</span><b class="num">${dayStr(b.day)}, ${t12(b.time)}</b></div><div><span>Guests</span><b>${b.party}</b></div><div><span>Table</span><b>${b.table?esc(TN(b.table)):'Not set'}</b></div><div><span>Area</span><b>${esc(A.name)}</b></div><div><span>Phone</span><b class="num">${esc(g.phone)}</b></div><div><span>Deposit</span><b class="num">${b.dep?(b.depRefunded?egp(b.dep)+' refunded':b.depPaid?egp(b.dep)+' paid':egp(b.dep)+' due'):'None'}</b></div><div><span>Instagram</span><b>${esc(g.ig||'—')}</b></div><div><span>Gender</span><b>${esc(g.gender||'—')}</b></div></div>
  ${b.note?`<div class="card" style="padding:10px 14px;margin-bottom:12px"><b>Note</b> · ${esc(b.note)}</div>`:''}
  ${st==='seated'?`<div class="sum" style="font-size:14px"><span>Spent ${egp(bl.sub)} of ${egp(A.min)} minimum</span></div><div class="meter ${bl.top?'':'ok'}"><i style="width:${pct}%"></i></div>`:''}
  <div class="stack">${acts}${b.depPaid&&b.dep&&st!=='done'&&!(st==='seated'&&S.orders[b.id]?.bill)?`<button class="btn ghost ${S.depKill===b.id?'warnt':''}" data-a="deprefund" data-v="${b.id}">${S.depKill===b.id?`Tap again to refund ${egp(b.dep)}`:'Refund deposit'}</button>`:''}</div>
  ${b.others?.length?`<h3 style="margin-top:20px">Guests coming</h3>${[g].concat(b.others).map((o,i)=>`<div class="conn" style="padding:8px 0;align-items:flex-start"><span><b>${esc(o.name||'Guest '+(i+1))}</b>${i===0?' <span class="mute">(booker)</span>':''}<br><span class="mute" style="font-size:13px">${esc([o.phone,o.email,o.gender].filter(x=>x&&x!=='—').join(' · '))}</span></span><span class="mute">${esc(o.ig||'')}</span></div>`).join('')}`:''}
  ${msgsBlock(b)}
  <p class="sent"><a href="#" data-a="guest" data-v="${g.id}" style="color:inherit">Guest profile: ${g.visits} visits, ${egp(g.spend)} spent${g.noShow?', 1 no-show':''}</a></p>`;
}
function openSheet(d,refresh){
  S.sheet=d;let title='',body='';
  if(d.k==='table'){const t=EL(d.id);if(!t){closeSheet();return}const b=atTable(t.id),A=AR(areaOf(t));
    title=`Table ${esc(t.name)}`;
    if(b)body=`<p class="mute" style="margin:0 0 8px">${esc(A.name)} · ${t.seats} seats · ${KLABEL[t.kind].toLowerCase()}</p><h3 style="margin-bottom:8px">${esc(G(b.gid).name)}</h3>`+bookingBody(b);
    else body=`<p class="mute" style="margin:0 0 8px">${esc(A.name)} · ${t.seats} seats · min spend ${egp(A.min)}</p><span class="pill p-free">Free</span><h3 style="margin:22px 0 10px">Seat a walk-in</h3><form id="walkin" class="stack" style="margin-top:0"><label class="f">Name <input id="wname" placeholder="Optional" autocomplete="off"></label><div class="f telf">Phone${telField({id:'wphone',ph:'Optional, for WhatsApp'})}</div><div class="f" style="font-size:14px;font-weight:600">Guests<div class="stepper" style="margin-top:6px"><button type="button" data-a="wp" data-v="-1" aria-label="Fewer">−</button><b class="num" id="wparty">${Math.min(4,t.seats)}</b><button type="button" data-a="wp" data-v="1" aria-label="More">+</button></div></div><input type="hidden" id="wtable" value="${t.id}"><button class="btn teal" type="submit">Seat at ${esc(t.name)}</button></form>`;}
  if(d.k==='booking'){const b=B(d.id);title=esc(G(b.gid).name);body=bookingBody(b)}
  if(d.k==='bill'){const b=B(d.id),bl=bill(b),o=S.orders[b.id]||{lines:{}};title=`Bill · Table ${esc(TN(b.table))}`;
    body=`<p class="mute" style="margin:0 0 12px">${esc(G(b.gid).name)} · ${gN(b.party)} · ${b.code}</p>${Object.entries(o.lines).map(([id,q])=>`<div class="sum"><span>${q} × ${esc(ITEMS[id].name)}</span><span class="num">${egp(ITEMS[id].price*q)}</span></div>`).join('')}
    <div style="border-top:1px solid var(--line);margin:8px 0"></div><div class="sum"><span>Subtotal</span><span class="num">${egp(bl.sub)}</span></div>${bl.top?`<div class="sum"><span>Minimum spend top-up</span><span class="num">${egp(bl.top)}</span></div>`:''}<div class="sum"><span>Service 12%</span><span class="num">${egp(bl.svc)}</span></div><div class="sum"><span>VAT 14%</span><span class="num">${egp(bl.vat)}</span></div>${bl.dep?`<div class="sum neg"><span>Deposit paid (${esc(b.depVia)})</span><span class="num">−${egp(bl.dep)}</span></div>`:''}<div class="sum tot"><span>To pay</span><span class="num">${egp(bl.total)}</span></div>
    ${bl.top?`<p class="sent">The table is ${egp(bl.top)} under the ${egp(bl.min)} minimum. Add more to the order or charge the top-up.</p>`:''}
    <h3 style="margin-top:18px">Paid by</h3><div class="paym">${[['Card','POS terminal'],['Cash','Count at the till'],['InstaPay','Show the venue QR'],['Wallet','Vodafone Cash and others']].map(([k,s])=>`<button class="${S.pay===k?'on':''}" data-a="pay" data-v="${k}">${k}<small>${s}</small></button>`).join('')}</div>
    <div class="stack" style="margin-top:4px"><button class="btn teal" data-a="paid" data-v="${b.id}">Mark paid and free table</button>${S.orders[b.id]?.bill?'':`<button class="btn ghost" data-a="askbill" data-v="${b.id}">Show bill to table</button>`}</div>`;}
  if(d.k==='new'){title='New booking';body=`<form id="newb" class="stack" style="margin-top:0"><label class="f">Guest name<input id="nname" required autocomplete="off" placeholder="Full name"></label><div class="two"><div class="f telf">WhatsApp${telField({id:'nphone',req:true,label:'WhatsApp number'})}</div><label class="f">Instagram<input id="nig" autocomplete="off" placeholder="@handle"></label></div><label class="f">Email<input id="nemail" type="email" autocomplete="off" placeholder="Optional"></label><div class="two"><label class="f">Time<select id="ntime">${slots().map(m=>`<option value="${m}">${t12(m)}</option>`).join('')}</select></label><label class="f">Guests<input id="nparty" type="number" min="1" max="20" value="4" inputmode="numeric"></label></div><label class="f">Area<select id="narea">${V().areas.map(a=>`<option value="${a.id}">${esc(a.name)} · min ${egp(a.min)}</option>`).join('')}</select></label><label class="f">Deposit<select id="ndep"><option value="link">Send payment link</option><option value="paid">Already paid</option><option value="none">No deposit</option></select></label><label class="f">Source<select id="nsrc">${['Phone call','WhatsApp','Instagram','Promoter · Karim','Concierge'].map(s=>`<option>${s}</option>`).join('')}</select></label><label class="f">Note<input id="nnote" autocomplete="off" placeholder="Birthday, allergies, preferred table"></label><button class="btn" type="submit">Book and notify guest</button><p class="sent" style="margin:0">We pick the best free table in the area and message the guest by ${{both:'email and WhatsApp',wa:'WhatsApp',email:'email'}[CFG().notify]}.</p></form>`}
  if(d.k==='guest'){const g=G(d.id),hist=S.bookings.filter(b=>b.gid===g.id);title=esc(g.name);
    body=`<p style="margin:0 0 6px"><span class="tag" style="background:${tierOf(g).color};color:var(--chipink)">${tierOf(g).name}</span> <span class="mute">${points(g).toLocaleString('en-US')} points</span></p><p class="mute num" style="margin:0">${esc(g.phone)} · ${esc(g.email||'no email')} · ${esc(g.ig||'')}</p><div class="facts"><div><span>Visits</span><b>${g.visits}</b></div><div><span>Total spend</span><b class="num">${egp(g.spend)}</b></div><div><span>Last visit</span><b>${g.last}</b></div><div><span>No-shows</span><b>${g.noShow}</b></div></div>
    <h3>Tags</h3><div style="display:flex;gap:6px;flex-wrap:wrap;margin:8px 0 16px">${['VIP','Regular','Birthday','Blocked'].map(t=>`<button class="chip ${g.tags.includes(t)?'on':''}" data-a="gtag" data-v="${g.id}:${t}">${t}</button>`).join('')}</div>
    <label class="f">Notes<textarea id="gnote" data-g="${g.id}" rows="3" placeholder="Preferences, allergies, who they come with">${esc(g.note)}</textarea></label>
    <div class="conn"><div><b>Offers on WhatsApp</b><div class="mute" style="font-size:14px">${g.consent?'Agreed on the booking page':'Has not agreed. We will not send offers.'}</div></div><span class="pill ${g.consent?'p-arrived':'p-free'}">${g.consent?'Yes':'No'}</span></div>
    ${hist.length?`<h3 style="margin-top:16px">Bookings</h3>${hist.map(b=>`<div class="conn"><span>${dayStr(b.day)} · ${t12(b.time)} · ${gN(b.party)}</span>${pillFor(b.status)}</div>`).join('')}`:''}`}
  if(d.k==='scan'){title='Scan pass';body=d.res?scanResult(d.res):`<video class="cam" id="cam" playsinline muted></video><p class="mute" style="text-align:center;margin:8px 0" id="camhint">Hold the QR inside the frame</p><form id="scanform" class="scanin"><input class="search" style="margin:0" id="scancode" placeholder="Or paste the pass link" autocomplete="off"><button class="btn sm" type="submit">Check</button></form>`;if(!d.res&&!refresh)setTimeout(startCam,60)}
  if(d.k==='more'){title='More';body=`<div class="stack" style="margin-top:0">${ROLE==='manager'?NAV.filter(n=>MORE.includes(n[0])&&CAN(n[2])).map(([k,l])=>`<button class="btn ghost wide" style="justify-content:flex-start" data-a="go" data-v="${k}">${ic(k)}${l}</button>`).join(''):''}<div style="margin-top:12px">${whoBox()}</div></div>`}
  if(d.k==='venue'){title='Your venues';body=`<p class="mute" style="margin:0 0 12px">One XTRA account, many venues. Each has its own floor map, slots, staff and booking link.</p><div class="stack" style="margin-top:0">${ME.venues.map((v,i)=>`<button class="btn ${i===S.vi?'':'ghost'} wide" style="justify-content:space-between" data-a="setvenue" data-v="${i}"><span>${esc(v.name)}</span><span style="font-weight:400;opacity:.8">${esc(ME.user.isSuperAdmin?(v.active===false?'Paused':''):v.roleName||ROLE_NAME[v.role]||'')}</span></button>`).join('')}</div>
    ${ME.user.isSuperAdmin?`<button class="btn ghost wide" style="margin-top:16px" data-a="go" data-v="admin">${ic('admin')}New venue, roles and accounts in XTRA admin</button>`:''}`}
  if(!title){const r=growthSheet(d);if(r){title=r[0];body=r[1]}}
  const sh=$('#sheet'),st=sh.querySelector('.bd')?.scrollTop||0;
  sh.innerHTML=`<div class="hd"><h2 id="sheetTitle">${title}</h2><button class="x" data-a="close" aria-label="Close">×</button></div><div class="bd">${body}</div>`;
  if(refresh)sh.querySelector('.bd').scrollTop=st;
  sh.classList.add('on');$('#scrim').classList.add('on');
  if(!refresh)setTimeout(()=>sh.querySelector('.x')?.focus(),60);
}
function closeSheet(){closeCam();if(!S)return;S.sheet=null;$('#sheet').classList.remove('on');$('#scrim').classList.remove('on')}
const WHY={unknown:'This is not an XTRA pass.',already_in:'Already checked in.',not_confirmed:'Not confirmed yet. The deposit or ticket is not paid.',wrong_night:'This pass is for another night.',wrong_venue:'This pass is for another venue.'};
const checkinWhy=r=>`${r.name?r.name+': ':''}${WHY[r.reason]||'Cannot check in.'}`;
function scanResult(r){if(!r.ok)return `<div class="result-bad"><b>Do not let in</b><h2>${esc(r.name||'Unknown pass')}</h2><div>${esc(WHY[r.reason]||'')}</div></div><div class="stack"><button class="btn teal" data-a="scan">Scan next</button><button class="btn ghost" data-a="close">Done</button></div>`;
  return `<div class="welcome">${BIGX('bx')}<span style="font-weight:700">${r.type==='ticket'?'Valid ticket':'Valid pass'}</span><h2 style="margin:6px 0 10px">${esc(r.name)}</h2><div style="font-size:18px;font-weight:600">${r.type==='ticket'?esc(r.ticketType)+(r.seat?`<br><b style="font-size:22px">${esc(r.seat)}</b>`:'')+'<br>'+esc(r.event):`${r.arrivedCount} of ${r.party} in · Table ${esc(r.table||'—')}${r.minSpend?'<br>Min spend '+egp(P2E(r.minSpend)):''}`}</div></div>${r.note?`<div class="card" style="padding:10px 14px">${esc(r.note)}</div>`:''}<div class="stack"><button class="btn teal" data-a="scan">Scan next</button><button class="btn ghost" data-a="close">Done</button></div>`}
let CAM=null;
function closeCam(){if(CAM){CAM.stop=true;CAM.stream?.getTracks().forEach(t=>t.stop());CAM=null}}
async function doScan(token){closeCam();try{const r=await POST(vurl('/checkin'),{token});if(S.sheet?.k==='scan'){S.sheet.res=r;openSheet(S.sheet,true)}refresh()}catch(e){toast(e.message)}}
const loadJsQR=()=>window.jsQR?Promise.resolve():new Promise((ok,no)=>{const sc=document.createElement('script');sc.src='/web/vendor/jsQR.js';sc.onload=ok;sc.onerror=no;document.head.appendChild(sc)});
async function startCam(){const v=$('#cam'),hint=$('#camhint');if(!v)return;
  try{const stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});CAM={stream};v.srcObject=stream;await v.play();
    const det='BarcodeDetector' in window?new BarcodeDetector({formats:['qr_code']}):null;if(!det)await loadJsQR();
    const cv=document.createElement('canvas'),cx=cv.getContext('2d',{willReadFrequently:true});
    const tick=async()=>{if(!CAM||CAM.stop)return;let txt=null;
      try{if(det){const c=await det.detect(v);txt=c[0]?.rawValue}else if(v.videoWidth){cv.width=v.videoWidth;cv.height=v.videoHeight;cx.drawImage(v,0,0);const q=jsQR(cx.getImageData(0,0,cv.width,cv.height).data,cv.width,cv.height);txt=q?.data}}catch(_){}
      if(txt){doScan(txt.split('/').pop());return}setTimeout(tick,250)};tick()}
  catch(e){v.remove();if(hint)hint.textContent='The camera is not available here. Paste the pass link or check guests in from the list.'}}
let tt;function toast(m){const t=$('#toast');t.textContent=m;t.classList.add('on');clearTimeout(tt);tt=setTimeout(()=>t.classList.remove('on'),3400)}

/* ---------- actions ---------- */
function autoTable(area,party,day=0){const free=t=>areaOf(t)===area&&!(day===0&&atTable(t.id));const T=TABLES();return T.filter(t=>free(t)&&t.seats>=party).sort((a,b)=>a.seats-b.seats)[0]?.id||T.find(free)?.id||null}
function nowStr(){const d=new Date();return t12(d.getHours()*60+d.getMinutes())}
const chWord=()=>({both:'email and WhatsApp',wa:'WhatsApp',email:'email'}[CFG().notify]);
const saveSettings=(patch,k='settings')=>{Object.assign(VENUES[S.vi].raw.settings=VENUES[S.vi].raw.settings||{},patch);later(k,()=>PATCH(vurl(''),{settings:patch}),400)};
/** Booking slots follow the grid set in Venue setup (first, last, every, max per slot). */
async function syncSlots(){const c=CFG(),list=slots().map(m=>({startsAt:min2hm(m),endsAt:min2hm(m+c.step),maxBookings:c.max,capacity:0}));
  VDATA[S.vi].slots=await PUT(vurl('/slots'),{slots:list})}
const slotIdFor=m=>(VDATA[S.vi].slots||[]).find(s=>hm2min(s.startsAt)===m)?.id;
const tabOf=bid=>S.orders[bid]?.tabId;
async function tabCall(path,body){const o=S.orders[S.otable];if(!o?.tabId)return;try{const t=await POST(vurl(`/tabs/${o.tabId}/${path}`),body);if(t.items)S.orders[S.otable]=tabToOrder(t);render();return t}catch(e){toast(e.message)}}
const ACT={
go:v=>{VIEW=v;S.edEvent=null;if(v!=='editor')S.sel=null;closeSheet();render();$('#main').scrollTop=0},
more:()=>openSheet({k:'more'}),
venue:()=>openSheet({k:'venue'}),
setvenue:v=>{closeSheet();$('#main').innerHTML='<div class="loading">Loading…</div>';loadVenue(+v).then(()=>{store.set('xtra.venue',VENUES[+v].id);render();toast(`Switched to ${VENUES[+v].name}`)}).catch(e=>toast(e.message))},
signout:()=>signOut(),
close:()=>closeSheet(),
table:v=>openSheet({k:'table',id:v}),
booking:v=>openSheet({k:'booking',id:v}),
guest:v=>{if(String(v).startsWith('w:'))return;openSheet({k:'guest',id:v})},
newb:()=>openSheet({k:'new'}),
bf:v=>{S.bfilter=v;render()},
approve:async v=>{const b=B(v),tableId=b.table||autoTable(b.area,b.party,b.day);
  let r=await act(()=>POST(vurl(`/reservations/${v}/accept`),tableId?{tableId}:{}).catch(e=>{if(e.code==='table_taken')return POST(vurl(`/reservations/${v}/accept`),{});throw e}),r=>`Accepted. ${first(b)} got ${r.status==='accepted'?'a payment link':'the QR pass'} by ${chWord()}.`);
  if(r&&!S.sheet&&VIEW!=='page')openSheet({k:'booking',id:v})},
decline:v=>{const b=B(v);act(()=>POST(vurl(`/reservations/${v}/${b.status==='accepted'?'cancel':'decline'}`)),`${b.status==='accepted'?'Cancelled':'Declined'}. ${first(b)} was told by ${chWord()}.`)},
deprefund:v=>{if(S.depKill!==v){S.depKill=v;openSheet(S.sheet,true);setTimeout(()=>{if(S.depKill===v){S.depKill=null;if(S.sheet)openSheet(S.sheet,true)}},4000);return}
  S.depKill=null;act(()=>POST(vurl(`/reservations/${v}/refund-deposit`),{}),r=>r.method==='paymob'?`Deposit refunded to the guest's card`:`Marked refunded. Give the deposit back to the guest.`).then(()=>{if(S.sheet)openSheet(S.sheet,true)})},
markpaid:v=>act(()=>POST(vurl(`/reservations/${v}/deposit-paid`)),'Deposit recorded. QR pass sent.'),
resend:v=>act(()=>POST(vurl(`/reservations/${v}/resend`)),`Sent again by ${chWord()}`,{reload:false}),
noshow:v=>act(()=>POST(vurl(`/reservations/${v}/no-show`)),'Marked as no-show. Table is free again.'),
seat:v=>{const b=B(v),tableId=b.table||autoTable(b.area,b.party);if(!tableId){toast('No free table in this area. Pick one on the floor.');return}
  act(()=>POST(vurl(`/reservations/${v}/seat`),{tableId}),`${first(b)} seated at ${TN(tableId)}`)},
toorder:v=>{S.otable=v;ACT.go('orders')},
checkin:v=>{const [k,id]=v.split(':');act(()=>POST(vurl('/checkin/manual'),k==='t'?{ticketId:id}:{reservationId:id}),r=>r.ok?`${r.name} checked in${r.type==='booking'&&r.table?' · Table '+r.table:''}`:checkinWhy(r))},
scan:()=>{closeCam();openSheet({k:'scan'})},
otable:v=>{S.otable=v;render()},
cat:v=>{S.cat=v;render()},
add:v=>tabCall('items',{items:[{menuItemId:v,qty:1}]}),
minus:v=>tabCall('remove',{menuItemId:v}),
send:async()=>{const t=await tabCall('send',{});if(t){await refresh();toast('Sent to the bar')}},
openbill:v=>openSheet({k:'bill',id:v}),
askbill:v=>{const id=tabOf(v);if(id)act(()=>POST(vurl(`/tabs/${id}/ask-bill`)),'Bill shown. Table marked on the floor.')},
pay:v=>{S.pay=v;render()},
paid:v=>{const b=B(v),id=tabOf(v);if(!id)return;closeSheet();act(()=>POST(vurl(`/tabs/${id}/pay`),{method:S.pay.toLowerCase()}),`Paid by ${S.pay}. Table ${TN(b.table)} is free.`)},
wp:v=>{const el=$('#wparty');el.textContent=Math.max(1,Math.min(20,+el.textContent+ +v))},
gtag:v=>{const [id,t]=v.split(':'),g=G(id);g.tags=g.tags.includes(t)?g.tags.filter(x=>x!==t):[...g.tags,t];render();
  act(()=>PATCH(vurl(`/guests/${id}`),{tags:g.tags.filter(x=>x!=='Blocked'),blocked:g.tags.includes('Blocked')}),null,{reload:false})},
appr:v=>{CFG().approval=v;saveSettings({approval:v});render()},
notify:v=>{CFG().notify=v;render();act(()=>PATCH(vurl(''),{notifyChannel:NOTIFY_OUT[v]}),null,{reload:false})},
conn:v=>{const c=CFG();c[v]=!c[v];saveSettings({[v]:c[v]});render()},
evnocover:v=>{const e=EVL(v);if(e)e.poster=null;delete PEV[v];render();act(()=>PATCH(vurl(`/events/${v}`),{posterUrl:null}),'Cover image removed',{reload:false})},
nophoto:()=>{VENUES[S.vi].raw.photoUrl=null;render();act(()=>PATCH(vurl(''),{photoUrl:null}),'Photo removed',{reload:false})},
nologo:()=>{delete CFG().logo;render();act(()=>PATCH(vurl(''),{logoUrl:null}),'Logo removed',{reload:false})},
eadd:v=>{const [k,n]=v.split(':'),L=V().layout,EV=V().ev;let e;
  if(TK.includes(k)){e=mk(k,'',500,320,+n);e.name=nextName(areaOf(e))}
  else if(k==='zone'){e=zn(null,380,240,240,160);e.area=e.id;
    if(EV){const cols=['#2e3192','#0e5f6e','#7a1f5c','#8a5a00','#1f0055'];EV.tz.push({id:e.id,name:'Tables · Zone '+String.fromCharCode(65+EV.tz.length),price:Math.round((EV.types[0]?.price||500)*4/100)*100,color:cols[EV.tz.length%cols.length],ink:'#fff'})}
    else V().areas.push({id:e.id,name:'New area',min:5000,dep:1000})}
  else if(k==='block'){const n=V().layout.filter(x=>x.kind==='block').length;e=SM.newBlock('e'+(++mk.n),'Section '+String.fromCharCode(65+n%26),500,330,{price:EV.types[0]?.price||500})}
  else if(k==='standing'){EV.types.push({name:'New ticket',price:EV.types[0]?.price||500,qty:100,sold:0});e={id:'e'+(++mk.n),kind:'standing',type:EV.types.length-1,name:'Standing',x:400,y:250,w:200,h:140,rot:0}}
  else e=fx(k,KLABEL[k].replace(' booth',''),420,280,k==='entrance'?120:k==='bar'?260:160,k==='entrance'?10:70);
  if(k==='zone')L.unshift(e);else L.push(e);S.sel=e.id;render();saveFloor()},
eseat:v=>{const e=EL(S.sel);const mx={round:10,square:4,long:16,sofa:12,couch:8}[e.kind];e.seats=Math.max(e.kind==='sofa'||e.kind==='couch'?3:1,Math.min(mx,e.seats+ +v));render();saveFloor()},
erot:()=>{const e=EL(S.sel);e.rot=(e.rot+90)%360;render();saveFloor()},
bk:v=>{const e=EL(S.sel);if(!e||e.kind!=='block')return;const [k,d]=v.split(':'),n=+d;
  if(k==='rows')e.rows=Math.max(1,Math.min(40,e.rows+n));else if(k==='cols')e.cols=Math.max(1,Math.min(60,e.cols+n));
  else if(k==='curve')e.curve=Math.max(0,Math.min(1,Math.round(((e.curve||0)+n/10)*10)/10));else if(k==='taper')e.taper=Math.max(-3,Math.min(4,(e.taper||0)+n));
  else if(k==='aisle')e.aisle=n>0?Math.min(20,e.aisle?e.aisle+1:4):(e.aisle||0)<=2?0:e.aisle-1;else if(k==='rot')e.rot=((e.rot||0)+n+540)%360-180;
  render();saveFloor()},
tpl:v=>{const EV=V().ev;if(!EV)return;if(evSold(EV)>0||EV.orders>0){toast('This event already has sales. Change the map by hand.');return}
  const T=evTemplate(v,EV);EV.types=T.types;EV.tz=T.tz;EV.layout=T.layout;EV.soldT=[];S.sel=null;render();saveFloor();toast(`${T.name} layout ready. Tap anything to change it.`)},
edup:()=>{const e=EL(S.sel),c={...e,id:'e'+(++mk.n),x:e.x+40,y:e.y+40};if(e.kind==='block'){c.seatIds={};c.name=e.name+' 2';c.x=e.x+60;c.y=e.y+60}else c.name=nextName(areaOf(c));V().layout.push(c);S.sel=c.id;render();saveFloor()},
edel:()=>{const e=EL(S.sel),EV=V().ev;if(!e)return;
  if(isT(e)&&EV&&EV.soldT.includes(e.id)){toast(`${e.name} is already sold. It stays on the map.`);return}
  if(e.kind==='block'&&Object.values(e.seatIds||{}).some(id=>EV.soldT.includes(id)||EV.seatSt?.[id]==='held')){toast(`${e.name} has sold seats. It stays on the map.`);return}
  if(isT(e)&&!EV&&atTable(e.id)){toast(`${e.name} has a booking tonight. Move it first.`);return}
  if(e.kind==='standing'&&EV){const t=EV.types[e.type];if(t?.sold){toast(`${t.name} has sales. It stays on the map.`);return}EV.types.splice(e.type,1);EV.layout.forEach(x=>{if(x.kind==='standing'&&x.type>e.type)x.type--})}
  if(e.kind==='zone'&&EV){if(EV.tables.some(t=>t.zone===e.area&&t.sold)){toast('This zone has sold tables. It stays on the map.');return}EV.tz=EV.tz.filter(z=>z.id!==e.area)}
  if(e.kind==='zone'&&!EV){if(V().layout.filter(x=>x.kind==='zone').length<=1){toast('Keep at least one area.');return}V().areas=V().areas.filter(a=>a.id!==e.area)}
  V().layout.splice(V().layout.indexOf(e),1);S.sel=null;render();saveFloor()}
};
document.addEventListener('click',e=>{const a=e.target.closest('[data-a]');if(!a)return;if(a.tagName==='A')e.preventDefault();const f=ACT[a.dataset.a];if(f)f(a.dataset.v,a)});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&S?.sheet)closeSheet();
  if((e.key==='Enter'||e.key===' ')&&e.target.matches('[data-a][tabindex]')){e.preventDefault();e.target.click()}
  if(S&&VIEW==='editor'&&S.sel&&!e.target.matches('input,select,textarea')){const el=EL(S.sel),d={ArrowLeft:[-10,0],ArrowRight:[10,0],ArrowUp:[0,-10],ArrowDown:[0,10]}[e.key];
    if(d&&el){e.preventDefault();el.x+=d[0];el.y+=d[1];drawMap();saveFloor()}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();ACT.edel()}}
});
const val=id=>($('#'+id)?.value||'').trim();
document.addEventListener('submit',async e=>{e.preventDefault();const f=e.target;
  if(f.id==='newb'){const m=+$('#ntime').value,slotId=slotIdFor(m);if(!slotId){toast('That time is not set up. Check Venue setup.');return}
    const r=await act(()=>POST(vurl('/reservations'),{date:DAYS[0][3],slotId,zoneId:VDATA[S.vi].areas.some(a=>a.id===$('#narea').value&&/^[0-9a-f]{8}-/.test(a.id))?$('#narea').value:undefined,
      partySize:Math.max(1,+$('#nparty').value||2),booker:{name:val('nname'),phone:telRead('nphone'),...(val('nemail')?{email:val('nemail')}:{}),...(val('nig')?{instagram:val('nig')}:{})},
      depositMode:$('#ndep').value,source:$('#nsrc').value,note:val('nnote')}),r=>`Booked. ${val('nname').split(' ')[0]} was told by ${chWord()}.`);
    if(r){S.bfilter=r.status==='accepted'?'accepted':'confirmed';render();openSheet({k:'booking',id:r.id})}}
  if(f.id==='walkin'){const tid=$('#wtable').value,t=EL(tid),party=+$('#wparty').textContent,name=val('wname')||'Walk-in '+t.name,phone=telRead('wphone');
    const r=await act(()=>POST(vurl('/tabs'),{tableId:tid,guestName:name,partySize:party,...(phone.length>=10?{phone}:{})}),`${name} seated at ${t.name}`);if(r)openSheet({k:'table',id:tid})}
  if(f.id==='scanform'){const raw=val('scancode'),token=raw.split('/').pop();if(token)doScan(token)}
  if(f.id==='addstaff')await act(()=>POST(vurl('/staff'),{name:val('sname'),email:val('semail'),password:val('spass'),...roleValue($('#srole').value)}),'Staff added. Share the email and password with them.');
  if(f.id==='addvenue'){const feats=[...f.querySelectorAll('[name=vfeat]:checked')].map(x=>x.value);const r=await act(()=>POST('/admin/venues',{name:val('vname'),features:feats,owner:{name:val('voname'),email:val('voemail'),password:val('vopass')}}),r=>`${r.venue.name} created. Share the owner's email and password with them.`,{reload:false});
    if(r){ME=await GET('/auth/me');closeSheet();VIEW='admin';await admLoad(r.venue.id)}}
  if(f.id==='slogin'){const err=$('#lerr');err.textContent='';try{const r=await api('POST','/auth/login',{email:val('lemail'),password:$('#lpass').value},null);TOKEN=r.token;store.set('xtra.staff',TOKEN);await bootStaff()}catch(x){err.textContent=x.message}}
});
document.addEventListener('input',e=>{const el=e.target;if(!S&&!PUB)return;
  if(el.id==='dsearch'||el.id==='gsearch'){S[el.id]=el.value;const pos=el.selectionStart;render();const n=$('#'+el.id);n.focus();try{n.setSelectionRange(pos,pos)}catch(_){}}
  if(el.dataset.area){const a=AR(el.dataset.area);a[el.dataset.k]=Math.max(0,+el.value||0);saveFloor()}
  if(el.id==='gnote'){const id=el.dataset.g;G(id).note=el.value;later('note'+id,()=>PATCH(vurl(`/guests/${id}`),{notes:el.value}))}
  if(el.dataset.gp)S.gp.f[el.dataset.gp]=el.type==='checkbox'?el.checked:fv(el);
  if(el.dataset.gpo){const [i,k]=el.dataset.gpo.split(':');S.gp.others[+i][k]=fv(el)}
  if(el.dataset.dr!=null){const d=DR();if(el.dataset.dr==='emails')d.emails=el.value.split(/[\s,;]+/).filter(x=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)).slice(0,10);else{const v=telNorm(telVal(el));d.phones=telOk(v)?[v]:[]}drSave(d)}
  if(el.dataset.social!=null){CFG().socials[el.dataset.social]=el.value.trim();saveSettings({socials:CFG().socials},'socials')}
  if(el.dataset.vset){const k=el.dataset.vset,v=el.value.trim();if(k==='name'){if(v.length>=2){VENUES[S.vi].name=v;later('vname',()=>PATCH(vurl(''),{name:v}))}}else{VENUES[S.vi].where=v;saveSettings({where:v},'where')}}
  if(el.id==='ename'){const x=EL(S.sel);x.name=el.value||x.name;drawMap();saveFloor()}
  if(el.dataset.inv==='list'&&S.inv){S.inv.list=el.value;later('invlist',async()=>{const ta=$('#sheet textarea'),pos=ta?.selectionStart;openSheet({k:'invite'},true);const t2=$('#sheet textarea');if(t2){t2.focus();try{t2.setSelectionRange(pos,pos)}catch(_){}}},500);}
  if(el.dataset.bk&&el.tagName!=='SELECT'){const x=EL(S.sel);if(x){const k=el.dataset.bk;if(k==='price')x.price=Math.max(0,+el.value||0);else if(k==='rowStart'&&/^[a-z]$/i.test(el.value))x.rowStart=el.value.toUpperCase();drawMap();saveFloor()}}
  if(el.id==='eaname'){AR(EL(S.sel).area).name=el.value||'Area';drawMap();saveFloor()}
  if(el.dataset.tt){const [i,k]=el.dataset.tt.split(':'),t=V().ev.types[+i];t[k]=k==='name'?el.value:Math.max(k==='qty'?t.sold||0:0,+el.value||0);if(k==='name'){const z=V().layout.find(x=>x.kind==='standing'&&x.type===+i);if(z)z.name=el.value}drawMap();saveFloor()}
});
document.addEventListener('change',e=>{const el=e.target;if(!S)return;
  if(el.dataset.fee){CFG()[el.dataset.fee]=Math.max(0,Math.min(50,+el.value||0));render();const c=CFG();
    act(()=>PUT('/admin/settings',{bookingFeeBps:Math.round(c.feePct*100),feeVatBps:Math.round(c.vatPct*100)}).then(r=>{PLATFORM=r}),'Ticket fees saved for every venue',{reload:false})}
  if(el.dataset.cfg){const k=el.dataset.cfg;CFG()[k]=Math.max(1,+el.value||1);render();saveSettings({firstSlot:CFG().first,lastSlot:CFG().last,slotStep:CFG().step,maxPerSlot:CFG().max});later('slots',syncSlots,500)}
  if(el.dataset.gp==='gender'){S.gp.f.gender=el.value}
  if(el.dataset.gp==='phone'){S.gp.f.phone=fv(el)}
  if(el.dataset.gpo){const [i,k]=el.dataset.gpo.split(':');S.gp.others[+i][k]=fv(el)}
  if(el.dataset.evcover&&el.files[0]){const id=el.dataset.evcover,f=el.files[0];toast('Uploading…');act(async()=>{const url=await upImage(f);await PATCH(vurl(`/events/${id}`),{posterUrl:url});const e=EVL(id);if(e)e.poster=url;delete PEV[id]},'Cover image updated',{reload:false}).then(render)}
  if(el.id==='vphoto'&&el.files[0]){const f=el.files[0];toast('Uploading…');act(async()=>{const url=await upImage(f);await PATCH(vurl(''),{photoUrl:url});VENUES[S.vi].raw.photoUrl=url},'Photo added to your guest pages',{reload:false}).then(render)}
  if(el.hasAttribute('data-vmap')){const v=el.value.trim();if(v&&!/^https?:\/\//.test(v)){toast('Paste the full link, starting with https://');return}act(async()=>{const r=await PATCH(vurl(''),{mapUrl:v||null});Object.assign(VENUES[S.vi].raw,{mapUrl:r.mapUrl,mapLat:r.mapLat,mapLng:r.mapLng})},v?'Location saved':'Location removed',{reload:false}).then(render)}
  if(el.id==='logofile'&&el.files[0]){const fr=new FileReader();fr.onload=()=>{const img=new Image();img.onload=()=>{const c=document.createElement('canvas'),k=Math.min(1,256/Math.max(img.width,img.height));c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);const url=c.toDataURL('image/png');CFG().logo=url;render();act(()=>PATCH(vurl(''),{logoUrl:url}),'Logo updated on your booking page',{reload:false})};img.src=fr.result};fr.readAsDataURL(el.files[0])}
});
/* ================= growth modules: events, marketing, community ================= */
Object.assign(ICON,{
events:'<path d="M3 6h18v3.5a2.5 2.5 0 0 0 0 5V18H3v-3.5a2.5 2.5 0 0 0 0-5z"/><path d="M14.5 6.5v11" stroke-dasharray="1.5 2.5"/>',
marketing:'<path d="M4 10v4h3l8 4.5v-13L7 10z"/><path d="M18.5 9a4 4 0 0 1 0 6"/>',
community:'<path d="M12 3.5l2.5 5.1 5.6.8-4 4 .9 5.6-5-2.7-5 2.7.9-5.6-4-4 5.6-.8z"/>',
reports:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',messages:'<path d="M21 12a8.5 8.5 0 0 1-12.4 7.6L3 21l1.4-5.4A8.5 8.5 0 1 1 21 12z"/>'});
const tiers=()=>CFG().tiers;
const tierOf=g=>[...tiers()].reverse().find(t=>g.spend>=t.min)||tiers()[0];
const points=g=>g.pts??0;
const bkIds=e=>e.layout.filter(b=>b.kind==='block').flatMap(b=>Object.values(b.seatIds||{}));
const tSold=e=>(e.tables||[]).filter(t=>t.sold),evSold=e=>e.types.reduce((s,t)=>s+t.sold,0)+tSold(e).reduce((s,t)=>s+t.seats,0)+bkIds(e).filter(id=>e.soldT.includes(id)).length,evCap=e=>e.types.reduce((s,t)=>s+t.qty,0)+(e.tables||[]).reduce((s,t)=>s+t.seats,0)+bkIds(e).length,evRev=e=>e.revenue??0;
const EVL=id=>S.events.find(e=>e.id===id);
const evAllClosed=e=>{const all=[...e.types,...(e.seatMap?e.tz:[])];return all.length>0&&all.every(t=>t.closed)};
const SEG={all:['Everyone who agreed',g=>true],vip:['VIP guests',g=>g.tags.includes('VIP')],regular:['Regulars, 5+ visits',g=>g.visits>=5],lapsed:['Not seen in 45 days',g=>g.lastAt&&Date.now()-new Date(g.lastAt)>45*864e5],tix:['Bought tickets before',g=>g.tix],bday:['Birthday in the next month',g=>g.bday]};
const reach=(seg,ch)=>S.guests.filter(g=>!g.walkin&&!g.tags.includes('Blocked')&&(ch==='email'?g.emailConsent&&g.email:g.consent)&&SEG[seg][1](g));
const pct=x=>Math.round(x*100)+'%';
const LEGAL=`<div class="legal"><a href="/terms" target="_blank" rel="noopener">Terms</a> · <a href="/privacy" target="_blank" rel="noopener">Privacy</a> · <a href="/refunds" target="_blank" rel="noopener">Refunds</a></div>`;
const poster=(e,cls='poster')=>`<div class="${cls}${e.poster?' img':''}" style="--pc:${e.color}${e.poster?`;background-image:url('${esc(e.poster)}')`:''}">${e.poster?'':BIGX('px')}<span>${esc(e.night.replace('Tonight · ',''))}</span><b>${esc(e.name)}</b></div>`;

/* ---------- events ---------- */
function vEvents(){
  if(S.evSel&&EVL(S.evSel))return vEvent(EVL(S.evSel));
  const live=S.events.filter(e=>e.status!=='draft'),sold=live.reduce((s,e)=>s+evSold(e),0),rev=live.reduce((s,e)=>s+evRev(e),0);
  return head('Events','Sell tickets on your own branded page. Money goes straight to your Paymob account.',`<button class="btn" data-a="newev">New event</button>`)+
  `<div class="kpis"><div class="kpi"><b class="num">${live.length}</b><span>events on sale</span></div><div class="kpi"><b class="num">${sold.toLocaleString('en-US')}</b><span>tickets sold</span></div><div class="kpi"><b class="num">${egp(rev)}</b><span>ticket revenue</span></div><div class="kpi"><b class="num">${live.reduce((s,e)=>s+e.orders,0)}</b><span>orders</span></div></div>
  <div class="evgrid">${S.events.length?'':'<div class="bigbox empty" style="grid-column:1/-1">No events yet. Create one to get your own ticket page.</div>'}${S.events.map(e=>{const s=evSold(e),c=evCap(e);return `<button class="evcard" data-a="ev" data-v="${e.id}">${poster(e)}<div class="evb"><div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span class="mute" style="font-size:14px">${esc(e.night)} · doors ${e.doors}</span>${e.status==='draft'?'<span class="pill p-free">Draft</span>':s>=c||evAllClosed(e)?'<span class="pill p-bill">Sold out</span>':e.status==='live'?'<span class="pill p-seated">Tonight</span>':'<span class="pill p-booked">On sale</span>'}</div><div style="margin:6px 0 10px;font-weight:600">${esc(e.lineup)}</div><div class="meter"><i style="width:${s/Math.max(1,c)*100}%"></i></div><div class="sum" style="font-size:14px"><span class="num">${s} of ${c} sold</span><b class="num">${egp(evRev(e))}</b></div></div></button>`}).join('')}</div>`;
}
/* Invitations: free tickets staff send by WhatsApp and email. */
function invitesBox(e){const L=S.invites?.[e.id],act=(L||[]).filter(x=>x.status==='active'),n=act.reduce((s,x)=>s+x.tickets,0),inN=act.reduce((s,x)=>s+x.checkedIn,0);
  return `<div class="bigbox" style="margin-top:16px"><div class="conn" style="border:0;padding:0;align-items:flex-start"><div><h3>Invitations</h3><p class="mute" style="font-size:14px;margin:4px 0 0">Send someone free tickets by WhatsApp or email. Each guest gets their own QR, like a bought ticket.</p></div><button class="btn sm" data-a="invnew" data-v="${e.id}" ${e.status==='ended'?'disabled':''}>Invite guests</button></div>
  ${L?(L.length?`<div class="invsum mute">${n} invited guest${n===1?'':'s'}${inN?` · ${inN} came`:''}</div><div class="invlist">${L.map(x=>`<div class="inv ${x.status}"><div class="who"><span><b>${esc(x.name||'Guest')}</b>${x.tickets>1?` <span class="mute">+${x.tickets-1}</span>`:''}</span><small>${esc(x.type)} · ${esc([x.phone?fmtPhone(x.phone):'',x.email||''].filter(Boolean).join(' · '))}</small>${x.note?`<small class="inote">“${esc(x.note)}”</small>`:''}</div>
    <div class="st">${x.status==='cancelled'?'<span class="pill p-declined">Cancelled</span>':x.checkedIn?`<span class="pill p-arrived">${x.checkedIn} of ${x.tickets} came</span>`:'<span class="pill p-booked">Sent</span>'}<small class="mute">${esc(when(x.createdAt))}${x.invitedBy?' · '+esc(x.invitedBy):''}</small></div>
    ${x.status==='active'?`<div class="acts"><button class="chip" data-a="invresend" data-v="${e.id}:${x.id}">Send again</button><button class="chip ${S.invKill===x.id?'danger':''}" data-a="invcancel" data-v="${e.id}:${x.id}">${S.invKill===x.id?'Tap again to cancel':'Cancel'}</button></div>`:'<div></div>'}</div>`).join('')}</div>`:'<div class="empty" style="padding:18px 8px 6px">No invitations yet.</div>'):'<div class="empty">Loading…</div>'}</div>`}
const newInv=e=>{const t=e.types[0],b=e.layout.find(x=>x.kind==='block'&&/^[0-9a-f]{8}-/.test(x.id));return {ev:e.id,zone:b?b.id:t?t.zid:(e.tz[0]?.id||''),seat:'',qty:1,first:'',last:'',phone:'',email:'',via:'both',note:'',busy:false,list:'',bulk:false}};
/** Every place an invitation can go: sections, standing zones, table zones. */
function invPlaces(e){const out=[];
  e.layout.filter(b=>b.kind==='block'&&/^[0-9a-f]{8}-/.test(b.id)).forEach(b=>out.push({id:b.id,kind:b.free?'free':'seat',name:b.name,left:b.left??0,b}));
  e.types.forEach(t=>out.push({id:t.zid,kind:'count',name:t.name,left:Math.max(0,t.qty-t.sold),closed:t.closed}));
  if(e.seatMap)e.tz.forEach(z=>out.push({id:z.id,kind:'table',name:z.name,left:e.tables.filter(t=>t.zone===z.id&&!t.sold).length}));
  return out.filter(x=>x.id)}
const freeSeatIds=(e,b)=>{const st=e.seatSt||{};return SM.blockSeats(b).map(p=>b.seatIds?.[p.label]).filter(id=>id&&(st[id]||'free')==='free'&&!e.soldT.includes(id))};
function inviteSheet(){const I=S.inv,e=I&&EVL(I.ev);if(!e)return ['Invite someone','<div class="empty">Event not found.</div>'];
  const PL=invPlaces(e),X=PL.find(x=>x.id===I.zone)||PL[0];if(X&&I.zone!==X.id){I.zone=X.id;I.seat=''}
  const freeT=X?.kind==='table'?e.tables.filter(t=>t.zone===X.id&&!t.sold):[],freeS=X?.kind==='seat'?freeSeatIds(e,X.b):[];
  if(X?.kind==='table'&&!freeT.some(t=>t.id===I.seat))I.seat=freeT[0]?.id||'';
  if(X?.kind==='seat'&&!freeS.includes(I.seat))I.seat=freeS[0]||'';
  const left=X?X.left:0,kindTxt={free:'free seating',seat:'pick a seat',count:'standing',table:'a whole table'};
  const opts=PL.map(x=>`<option value="${x.id}" ${I.zone===x.id?'selected':''}>${esc(x.name)} · ${kindTxt[x.kind]} · ${x.left} left${x.closed?' · shown sold out':''}</option>`).join('');
  const via=[['whatsapp','WhatsApp'],['email','Email'],['both','Both']];
  const head=`<div class="seg" style="align-self:flex-start;margin-bottom:4px"><button type="button" class="${I.bulk?'':'on'}" data-a="invmode" data-v="one">One person</button><button type="button" class="${I.bulk?'on':''}" data-a="invmode" data-v="list">A list of people</button></div>`;
  const viaRow=`<div class="f" style="font-size:14px;font-weight:600">Send by<div class="seg" style="margin-top:6px;align-self:flex-start">${via.map(([k,l])=>`<button type="button" class="${I.via===k?'on':''}" data-a="invvia" data-v="${k}">${l}</button>`).join('')}</div></div>`;
  const zoneSel=`<label class="f">Zone<select data-inv="zone">${opts||'<option value="">Add zones on the seat map first</option>'}</select></label>`;
  if(I.bulk){const P=parseList(I.list),need=P.ok.length,room=X?(X.kind==='table'?freeT.length:left):0;
    return ['Invite a list',`<form id="invbulk" class="stack" style="margin-top:0">${head}<p class="mute" style="margin:0;font-size:14px">${esc(e.name)} · ${esc(e.night)}. Paste your guest list, one person per line: name, then WhatsApp number and/or email. Everyone gets their own QR.</p>
     ${zoneSel}${X?.kind==='seat'?'<p class="hint" style="margin:0">Each person gets the next free seat, row by row. The QR shows their row and seat.</p>':X?.kind==='free'?'<p class="hint" style="margin:0">Free seating: everyone can sit anywhere in this section.</p>':''}
     <label class="f">Guest list<textarea data-inv="list" rows="7" placeholder="Sara Hassan, 01001234567, sara@company.com&#10;Omar Nabil, omar@company.com" style="font:inherit;font-size:14px">${esc(I.list)}</textarea></label>
     <div class="mute" style="font-size:13px">${need} ready${P.bad.length?` · <b style="color:var(--red)">${P.bad.length} line${P.bad.length===1?'':'s'} need a name and a number or email (line ${P.bad.slice(0,4).join(', ')})</b>`:''} · ${room} places left in ${esc(X?.name||'')}</div>
     ${viaRow}<label class="f">Note in the email<input data-inv="note" value="${esc(I.note)}" maxlength="300" autocomplete="off" placeholder="Optional"></label>
     <button class="btn" type="submit" ${I.busy||!need||P.bad.length||need>room?'disabled':''}>${I.busy?'Sending…':need>room?'Not enough places in this zone':`Send ${need} invitation${need===1?'':'s'}`}</button></form>`]}
  let place='';
  if(X?.kind==='table')place=`<label class="f">Table<select data-inv="seat">${freeT.length?freeT.map(t=>`<option value="${t.id}" ${I.seat===t.id?'selected':''}>Table ${esc(t.name)} · ${t.seats} people</option>`).join(''):'<option value="">No free tables</option>'}</select></label>`;
  else if(X?.kind==='seat'){const x=I.seat&&seatOf(e,I.seat),mine=new Set(I.seat?[I.seat]:[]);
    const only={...e,layout:e.layout};place=`<div class="f" style="font-size:14px;font-weight:600">Seat <span class="mute" style="font-weight:400">· tap a free seat on the map</span><div style="margin-top:6px">${SM.frame('inv:'+e.id+':'+X.id,only,{mode:'pick',mine,seatAction:'invseat',seatState:id=>e.seatSt?.[id]||(e.soldT.includes(id)?'sold':'free'),tableState:t=>e.soldT.includes(t.id)?'sold':'free',zoneOf:t=>evArea(e,t),label:'Pick a seat'})}</div>
      <div class="invseat">${x?`<b>${esc(x.b.name)} · Row ${esc(x.row)}, Seat ${esc(x.num)}</b>`:'<b>No free seats left</b>'}<span class="mute">${freeS.length} free</span></div></div>`}
  else place=`<div class="f" style="font-size:14px;font-weight:600">How many people<div class="stepper" style="margin-top:6px"><button type="button" data-a="invqty" data-v="-1" aria-label="Fewer" ${I.qty<=1?'disabled':''}>−</button><b class="num">${I.qty}</b><button type="button" data-a="invqty" data-v="1" aria-label="More" ${I.qty>=Math.min(20,left)?'disabled':''}>+</button></div><span class="mute" style="font-weight:400;font-size:13px">${left} left in ${esc(X?.name||'')}${X?.kind==='free'?', free seating':''}. Extra people show at the door as "Guest of ${esc(I.first||'name')}".</span></div>`;
  const blocked=!X||(X.kind==='table'&&!freeT.length)||(X.kind==='seat'&&!I.seat)||((X.kind==='count'||X.kind==='free')&&!left);
  return ['Invite someone',`<form id="invform" class="stack" style="margin-top:0">${head}<p class="mute" style="margin:0;font-size:14px">${esc(e.name)} · ${esc(e.night)}. The ticket is free and no fees are charged.</p>
   ${zoneSel}${place}
   <div class="two"><label class="f">First name<input data-inv="first" value="${esc(I.first)}" required autocomplete="off"></label><label class="f">Last name<input data-inv="last" value="${esc(I.last)}" autocomplete="off" placeholder="Optional"></label></div>
   ${viaRow}
   ${I.via!=='email'?`<div class="f telf">WhatsApp number${telField({bind:'data-inv="phone"',value:I.phone,req:true,label:'WhatsApp number'})}</div>`:''}
   ${I.via!=='whatsapp'?`<label class="f">Email<input data-inv="email" type="email" value="${esc(I.email)}" required autocomplete="off" placeholder="name@example.com"></label>`:''}
   <label class="f">Note in the email<input data-inv="note" value="${esc(I.note)}" maxlength="300" autocomplete="off" placeholder="Optional, like: Welcome back, drinks on us"></label>
   <button class="btn" type="submit" ${I.busy||blocked?'disabled':''}>${I.busy?'Sending…':'Send invitation'}</button>
   <p class="sent" style="margin:0">The QR shows their zone${X?.kind==='seat'?', row and seat':''} and a map from the entrance.</p></form>`]}
/* Orders of an event, with refunds. */
function ordersBox(e){const L=S.evOrders?.[e.id];if(!L)return '';const q=(S.oq||'').trim().toLowerCase();
  const shown=L.filter(o=>!q||[o.code,o.name,o.phone,o.email].some(x=>(x||'').toLowerCase().includes(q))).slice(0,S.oall?500:8);
  const refunded=L.filter(o=>o.status==='refunded');
  return `<div class="bigbox" style="margin-top:16px"><div class="conn" style="border:0;padding:0;align-items:flex-start"><div><h3>Orders</h3><p class="mute" style="font-size:14px;margin:4px 0 0">${L.length} order${L.length===1?'':'s'}${refunded.length?` · ${refunded.length} refunded (${egp(P2E(refunded.reduce((s,o)=>s+o.refundedAmount,0)))})`:''}. Find an order to refund it.</p></div></div>
  ${L.length?`<input class="search" id="oq" type="search" placeholder="Search name, phone, email or order code" value="${esc(S.oq||'')}" autocomplete="off" style="margin:12px 0 4px">
  <div class="olist">${shown.map(o=>`<div class="orow ${o.status}"><div class="who"><span><b>${esc(o.name||'Guest')}</b> <span class="mute num">${esc(o.code)}</span></span><small>${o.tickets} ticket${o.tickets===1?'':'s'} · ${esc([o.phone?fmtPhone(o.phone):'',o.email||''].filter(Boolean).join(' · '))}</small></div>
    <div class="st"><b class="num">${egp2(o.total/100)}</b><small class="mute">${o.status==='refunded'?`Refunded ${egp2(o.refundedAmount/100)}`:o.checkedIn?`${o.checkedIn} scanned in`:esc(when(o.paidAt))}</small></div>
    <div class="acts">${o.status==='refunded'?'<span class="pill p-declined">Refunded</span>':`<button class="chip" data-a="orefund" data-v="${e.id}:${o.id}" ${o.checkedIn?'disabled title="Already scanned at the door"':''}>Refund</button>`}</div></div>`).join('')||'<div class="empty">No order matches.</div>'}</div>
  ${!S.oall&&L.length>8&&!q?`<button class="chip" data-a="oall" style="margin-top:10px">Show all ${L.length}</button>`:''}`:'<div class="empty" style="padding:18px 8px 6px">No orders yet.</div>'}</div>`}
function refundSheet(){const R=S.refund,o=S.evOrders?.[R?.ev]?.find(x=>x.id===R.id);if(!o)return ['Refund','<div class="empty">Order not found.</div>'];
  const opt=(k,l,amt,sub)=>`<button type="button" class="rfopt ${R.fees===k?'on':''}" data-a="rffees" data-v="${k}"><span><b>${l}</b><small>${sub}</small></span><b class="num">${egp2(amt/100)}</b></button>`;
  return [`Refund ${esc(o.code)}`,`<form id="rfform" class="stack" style="margin-top:0"><p class="mute" style="margin:0;font-size:14px">${esc(o.name||'Guest')} · ${o.tickets} ticket${o.tickets===1?'':'s'} · paid ${esc(when(o.paidAt))}</p>
   <div class="stack" style="margin:0;gap:8px">${opt(true,'Everything they paid',o.total,'Ticket price and the booking fee')}${o.fees?opt(false,'Ticket price only',o.ticketPrice,'The booking fee is kept'):''}</div>
   <label class="f">Reason<input id="rfreason" maxlength="300" autocomplete="off" placeholder="Optional, like: event moved, guest cannot come"></label>
   <button class="btn warn" type="submit" ${R.busy?'disabled':''}>${R.busy?'Refunding…':`Refund ${egp2((R.fees?o.total:o.ticketPrice)/100)}`}</button>
   <p class="sent" style="margin:0">The money goes back to the card or wallet they paid with (banks take 5 to 14 days). Their QR codes stop working now and the places go back on sale. The guest gets an email.</p></form>`]}
/* Waitlist of a sold-out event. */
function waitBox(e){const L=S.wait?.[e.id];if(!L||!L.length)return '';const w=L.filter(x=>x.status==='waiting').length,told=L.filter(x=>x.status==='notified').length;
  return `<div class="bigbox" style="margin-top:16px"><h3>Waitlist</h3><p class="mute" style="font-size:14px;margin:4px 0 0">${w} waiting${told?` · ${told} told`:''}. When places open up (a refund, a cancelled invite, more places), the first in line get a message by themselves.</p>
  <div class="olist">${L.map((x,i)=>`<div class="orow"><div class="who"><span><span class="rk">${i+1}</span><b>${esc(x.name)}</b>${x.qty>1?` <span class="mute">× ${x.qty}</span>`:''}</span><small style="padding-left:30px">${esc(x.type||'Any ticket')} · ${esc([fmtPhone(x.phone),x.email||''].filter(Boolean).join(' · '))}</small></div>
    <div class="st">${x.status==='bought'?'<span class="pill p-arrived">Bought</span>':x.status==='notified'?`<span class="pill p-booked">Told ${esc(when(x.notifiedAt))}</span>`:`<small class="mute">Joined ${esc(when(x.createdAt))}</small>`}</div>
    <div class="acts">${x.status==='bought'?'':`<button class="chip" data-a="wtell" data-v="${e.id}:${x.id}">${x.status==='notified'?'Tell again':'Tell now'}</button><button class="chip" data-a="wdel" data-v="${e.id}:${x.id}" aria-label="Remove ${esc(x.name)}">×</button>`}</div></div>`).join('')}</div></div>`}
/** "Name, phone, email" lines → people. A phone is 8+ digits, an email has an @. */
function parseList(txt){const ok=[],bad=[];String(txt||'').split(/\r?\n/).forEach((line,i)=>{const t=line.trim();if(!t)return;const parts=t.split(/[,;\t]+/).map(x=>x.trim()).filter(Boolean);
  let email=null,phone=null;const name=[];parts.forEach(p=>{if(/^\S+@\S+\.\S+$/.test(p))email=p;else if(p.replace(/[\s\-()+]/g,'').match(/^\d{8,15}$/))phone=p.replace(/[\s\-()]/g,'');else name.push(p)});
  const full=name.join(' ').trim().split(/\s+/);if(!full[0]||(!email&&!phone)){bad.push(i+1);return}ok.push({firstName:full[0],lastName:full.slice(1).join(' '),...(phone?{phone}:{}),...(email?{email}:{})})});return {ok,bad}}
function vEvent(e){
  const s=evSold(e),c=evCap(e),slug=VENUES[S.vi].slug,SL=S.sales?.[e.id],link=`${location.origin}/e/${e.id}`;
  const tonight=e.status==='live',inN=e.checkedIn;
  return `<button class="back" data-a="evback">← All events</button>`+head(esc(e.name),`${esc(e.night)} · doors ${e.doors} · ${esc(e.lineup)}`,e.status==='draft'?`<button class="btn teal" data-a="evpub" data-v="${e.id}">Put on sale</button>`:`<button class="btn ghost" data-a="evpause" data-v="${e.id}">Pause sales</button>`)+
  `<div class="evd"><div><div class="kpis"><div class="kpi"><b class="num">${s}/${c}</b><span>tickets sold</span></div><div class="kpi"><b class="num">${egp(evRev(e))}</b><span>revenue</span></div><div class="kpi"><b class="num">${e.orders}</b><span>orders</span></div>${tonight?`<div class="kpi"><b class="num">${inN}</b><span>scanned in</span></div>`:''}</div>
  <div class="bigbox imgbox" style="margin-bottom:16px"><div class="imgprev ev">${e.poster?`<img src="${esc(e.poster)}" alt="">`:poster(e)}</div><div><h3>Cover image</h3><p class="mute" style="font-size:14px;margin:4px 0 10px">The big picture at the top of your ticket page. A wide image works best (1600 × 900).</p><div class="logorow" style="margin:0"><label class="btn ghost sm" style="cursor:pointer">${e.poster?'Change image':'Upload image'}<input type="file" data-evcover="${e.id}" accept="image/jpeg,image/png,image/webp" hidden></label>${e.poster?`<button class="btn ghost sm" data-a="evnocover" data-v="${e.id}">Remove</button>`:''}</div></div></div>
  <div class="bigbox" style="margin-bottom:16px"><div class="conn" style="border:0;padding:0"><div><h3>Seat map</h3><div class="mute" style="font-size:14px">${e.seatMap?`This event's own map. ${(()=>{const B=e.layout.filter(x=>x.kind==='block');return [B.length?`${B.reduce((s,b)=>s+SM.blockSeats(b).length,0)} seats in ${B.length} section${B.length===1?'':'s'}`:'',e.tables.length?e.tables.length+' tables':'',e.layout.filter(x=>x.kind==='standing').length?e.layout.filter(x=>x.kind==='standing').length+' standing zones':''].filter(Boolean).join(' · ')||'Nothing on it yet. Start from a layout.'})()}`:'Off. Guests pick from a simple ticket list, no tables.'}</div></div><button class="toggle ${e.seatMap?'on':''}" data-a="evmapt" data-v="${e.id}" role="switch" aria-checked="${!!e.seatMap}" aria-label="Seat map"></button></div>${e.seatMap?`<button class="btn ghost sm" style="margin-top:12px" data-a="evedit" data-v="${e.id}">${ic('editor')}Edit seat map</button>`:''}
  <div class="conn" style="border:0;padding:14px 0 0;margin-top:14px;border-top:1px solid var(--line)"><div><h3>Invitation only</h3><div class="mute" style="font-size:14px">${e.inviteOnly?'On. Nothing is sold: guests get in only with an invitation. Good for corporate and private events.':'Off. Guests can buy tickets on the event page.'}</div></div><button class="toggle ${e.inviteOnly?'on':''}" data-a="evinv" data-v="${e.id}" role="switch" aria-checked="${!!e.inviteOnly}" aria-label="Invitation only"></button></div></div>
  <div class="bigbox"><h3>Tickets and tables</h3>${(e.seatMap?e.layout.filter(b=>b.kind==='block'&&/^[0-9a-f]{8}-/.test(b.id)):[]).map(b=>{const n=Object.keys(b.seatIds||{}).length,left=b.left??n;return `<div class="ttype"><div><b>${esc(b.name)}</b><div class="mute num" style="font-size:14px">${egp(b.price)} a seat · ${b.free?'free seating':'own seats'} · ${b.closed?'<b class="soldtag">Shown as sold out</b>':left+' of '+n+' left'}</div></div><div class="meter" style="margin:0"><i style="width:${(n-left)/Math.max(1,n)*100}%"></i></div><span></span><label class="soldsw"><button type="button" class="toggle ${b.closed?'on red':''}" data-a="zsold" data-v="${e.id}:${b.id}" role="switch" aria-checked="${!!b.closed}" aria-label="Show ${esc(b.name)} as sold out"></button><span>Sold out</span></label></div>`}).join('')}${(e.seatMap?e.tz:[]).map(z=>{const T=e.tables.filter(t=>t.zone===z.id),so=T.filter(t=>t.sold).length,seats=T.reduce((s,t)=>s+t.seats,0);return `<div class="ttype"><div><b>${esc(z.name)}</b><div class="mute num" style="font-size:14px">${egp(z.price)} a seat · ${T.length} table${T.length===1?'':'s'}, ${seats} seats · ${z.closed?'<b class="soldtag">Shown as sold out</b>':(T.length-so)+' left'}</div></div><div class="meter" style="margin:0"><i style="width:${so/Math.max(1,T.length)*100}%"></i></div><label class="f" style="font-size:13px">Per seat<input type="number" step="100" value="${z.price}" data-tzp="${e.id}:${z.id}" inputmode="numeric"></label><label class="soldsw"><button type="button" class="toggle ${z.closed?'on red':''}" data-a="zsold" data-v="${e.id}:${z.id}" role="switch" aria-checked="${!!z.closed}" aria-label="Show ${esc(z.name)} as sold out"></button><span>Sold out</span></label></div>`}).join('')}${e.types.map((t,i)=>`<div class="ttype"><div><b>${esc(t.name)}</b><div class="mute num" style="font-size:14px">${egp(t.price)} · ${t.closed?'<b class="soldtag">Shown as sold out</b> · '+Math.max(0,t.qty-t.sold)+' left for invites':t.sold>=t.qty?'Sold out':(t.qty-t.sold)+' left'}</div></div><div class="meter" style="margin:0"><i style="width:${t.sold/Math.max(1,t.qty)*100}%"></i></div><label class="f" style="font-size:13px">Total<input type="number" min="${t.sold}" value="${t.qty}" data-tq="${e.id}:${i}" inputmode="numeric"></label><label class="soldsw"><button type="button" class="toggle ${t.closed?'on red':''}" data-a="zsold" data-v="${e.id}:${t.zid}" role="switch" aria-checked="${!!t.closed}" aria-label="Show ${esc(t.name)} as sold out"></button><span>Sold out</span></label></div>`).join('')}<p class="hint" style="margin:12px 0 0">Sold out hides a ticket type from guests right away, even with places left. Turn it off to sell again. Invitations still work.</p></div>
  ${invitesBox(e)}
  ${ordersBox(e)}
  ${waitBox(e)}
  <div class="setgrid" style="margin-top:16px"><div class="bigbox"><h3>Sales</h3><p class="mute" style="font-size:14px;margin:4px 0 6px;overflow-wrap:anywhere">Ticket page: <a href="${link}" target="_blank" rel="noopener" style="color:inherit;font-weight:700">${esc(link)}</a></p>${SL?[['Tickets sold',SL.tickets],...(SL.invited?[['Invited guests',SL.invited]]:[]),['Checked in',SL.checkedIn],['Ticket price',egp(P2E(SL.gross))],['Promo discounts','−'+egp(P2E(SL.discounts))],['You receive',egp(P2E(SL.venuePayout))],['Booking fees (XTRA)',egp2(SL.fees/100)],['VAT on fees',egp2(SL.feeVat/100)]].map(([l,v])=>`<div class="conn"><span>${l}</span><b class="num">${v}</b></div>`).join(''):'<div class="empty">Loading…</div>'}</div>
  <div class="bigbox"><h3>Promo codes</h3><p class="mute" style="font-size:14px;margin:4px 0 6px">Guests type the code at checkout. Any discount from 1% to 100%. 100% makes the ticket free.</p>${e.promos.filter(p=>!p.batch).map(p=>`<div class="promo ${p.on===false?'off':''}"><div><b>${esc(p.code)}</b><div class="mute" style="font-size:13px">${p.used}${p.limit?' of '+p.limit:''} used${p.off>=100?' · free ticket':''}${p.all?'<br>All events':''}${p.guest?'<br>Only '+esc(p.guest):''}</div></div><label class="pct"><input type="number" min="1" max="100" value="${p.off}" data-pro="${p.id}" inputmode="numeric" aria-label="Discount for ${esc(p.code)}"><span>%</span></label><button class="toggle ${p.on!==false?'on':''}" data-a="protg" data-v="${p.id}" role="switch" aria-checked="${p.on!==false}" aria-label="${esc(p.code)} active"></button><button class="chip" data-a="prodel" data-v="${p.id}" aria-label="Delete ${esc(p.code)}">×</button></div>`).join('')||'<div class="empty">No codes yet.</div>'}<form id="promo" class="promoadd"><label class="f">Code<input id="pcode" placeholder="FRIENDS" style="text-transform:uppercase" autocomplete="off" maxlength="14" required></label><label class="f">Discount %<input id="poff" type="number" min="1" max="100" value="20" inputmode="numeric"></label><label class="f">Max uses<input id="plim" type="number" min="1" placeholder="No limit" inputmode="numeric"></label><button class="btn sm" type="submit">Add code</button></form>
  <h3 style="margin-top:22px">Unique codes</h3><p class="mute" style="font-size:14px;margin:4px 0 6px">Every guest gets their own code. Use it for influencers, VIP invites or giveaways.</p>
  ${(e.batches||[]).map(bt=>{const C=e.promos.filter(p=>p.batch===bt.id),u=C.filter(p=>p.used>=(p.limit||1)).length,open=S.batchOpen===bt.id;return `<div class="batch"><div class="promo ${bt.on===false?'off':''}" style="border:0"><div><b>${esc(bt.name)}</b><div class="mute" style="font-size:13px">${C.length} code${C.length===1?'':'s'} · ${bt.off>=100?'free ticket':bt.off+'% off'} · ${bt.per===1?'each works once':'each works '+bt.per+' times'}${bt.guest?' · only for '+esc(bt.guest):''}<br>${u} of ${C.length} used up</div></div><span></span><button class="toggle ${bt.on!==false?'on':''}" data-a="bttg" data-v="${bt.id}" role="switch" aria-checked="${bt.on!==false}" aria-label="${esc(bt.name)} active"></button><button class="chip" data-a="btdel" data-v="${bt.id}" aria-label="Delete ${esc(bt.name)}">×</button></div><button class="chip" data-a="btopen" data-v="${bt.id}">${open?'Hide codes':'Show codes'}</button>${open?`<div class="codes">${C.map(p=>`<span class="${p.used>=(p.limit||1)?'used':''}"><b>${p.code}</b>${p.used>=(p.limit||1)?'Used':p.used?p.used+'/'+p.limit:'Free to use'}</span>`).join('')}</div><button class="btn ghost sm" data-a="btcopy" data-v="${bt.id}">Copy all codes</button>`:''}</div>`}).join('')}
  <form id="gencodes" class="promoadd"><label class="f">Name<input id="gname" placeholder="Influencers" autocomplete="off" maxlength="24"></label><label class="f">How many codes<input id="gn" type="number" min="1" max="500" value="10" inputmode="numeric"></label><label class="f">Discount %<input id="goff" type="number" min="1" max="100" value="100" inputmode="numeric"></label><label class="f">Each code works<select id="gper"><option value="1">Once</option><option value="2">2 times</option><option value="5">5 times</option><option value="10">10 times</option></select></label><div class="f telf" style="grid-column:1/-1">Only for one guest (optional)${telField({id:'gguest',ph:'Their WhatsApp number',label:'Their WhatsApp number'})}</div><button class="btn sm" type="submit">Generate codes</button></form></div></div></div>
  <div>${evPhoneFor(e)}<p class="hint" style="text-align:center">${e.status==='draft'?'Put it on sale to open the ticket page':'This phone is live: tickets bought here are real orders'}</p></div></div>`;
}
const newEVP=()=>({step:'info',cart:{},bcart:{},tables:[],seats:[],holders:[],promo:null,promoOpen:false,pm:'card',hold:0,zoom:'fit',order:null,done:null,busy:false});
const ZCOL=['#bfeaff','#dcf5c4','#ffffb3'];
const tz=(e,id)=>e.tz.find(z=>z.id===id);
const feePctOf=e=>e.fees?e.fees.feeBps/100:CFG().feePct,vatPctOf=e=>e.fees?e.fees.feeVatBps/100:CFG().vatPct;
/* Totals: from the server once seats are held (it applies the promo, fee and VAT on fees), an estimate before. */
/** A seat of a seated section: its section, row and number. */
function seatOf(e,id){for(const b of e.layout){if(b.kind!=='block'||!b.seatIds)continue;const lab=Object.keys(b.seatIds).find(l=>b.seatIds[l]===id);if(lab){const [row,num]=lab.split('-');return {b,row,num,label:lab,text:`${b.name} · Row ${row}, Seat ${num}`}}}return null}
function evCalc(e){const P=S.evp;let tickets=0,n=0;e.types.forEach((t,i)=>{const q=P.cart[i]||0;tickets+=q*t.price;n+=q});P.tables.forEach(id=>{const t=e.tables.find(x=>x.id===id);if(!t)return;tickets+=t.seats*(tz(e,t.zone)?.price||0);n+=t.seats});
  (P.seats||[]).forEach(id=>{const x=seatOf(e,id);if(x){tickets+=x.b.price;n++}});
  Object.entries(P.bcart||{}).forEach(([id,q])=>{const b=e.layout.find(x=>x.id===id);if(b&&q){tickets+=b.price*q;n+=q}});
  if(P.order){const T=P.order.totals;return {n,tickets:T.tickets/100,off:T.discount/100,vat:T.feeVat/100,fees:T.fee/100,total:T.total/100}}
  const fees=Math.round(tickets*feePctOf(e))/100,vat=Math.round(fees*vatPctOf(e))/100;return {n,tickets,off:0,vat,fees,total:tickets+vat+fees}}
function evLines(e){const P=S.evp,L=[];if(P.order?.lines?.length){P.order.lines.forEach(l=>{for(let k=0;k<l.tickets;k++)L.push(l.place||(l.seat?'Table '+l.seat:l.zone))});return L}e.types.forEach((t,i)=>{for(let k=0;k<(P.cart[i]||0);k++)L.push(t.name)});P.tables.forEach(id=>{const t=e.tables.find(x=>x.id===id);if(t)for(let k=0;k<t.seats;k++)L.push('Table '+t.name)});(P.seats||[]).forEach(id=>{const x=seatOf(e,id);if(x)L.push(x.text)});Object.entries(P.bcart||{}).forEach(([id,q])=>{const b=e.layout.find(x=>x.id===id);for(let k=0;b&&k<q;k++)L.push(b.name+' · Free seating')});return L}
function evArea(e,el){const z=e.layout.filter(x=>x.kind==='zone');if(!z.length)return e.tz[0]?.id;const h=z.find(z=>el.x>=z.x&&el.x<=z.x+z.w&&el.y>=z.y&&el.y<=z.y+z.h);if(h)return h.area;let best=null,bd=1e9;z.forEach(z=>{const d=Math.hypot(el.x-(z.x+z.w/2),el.y-(z.y+z.h/2));if(d<bd){bd=d;best=z.area}});return best||e.tz[0].id}
/* ---------- ready layouts for an event map ---------- */
const TPLS=[['theatre','Theatre','Stage, stalls in curved rows and a balcony'],['concert','Concert','Standing pit, side tiers and seats at the back'],['club','Club','Dance floor, VIP tables and a bar'],['standing','Standing','Golden circle and general admission'],['gala','Gala dinner','Round tables facing a stage']];
function tplIcon(k){const c='var(--ink)',t='var(--teal)';const I={
  theatre:`<rect x="10" y="3" width="14" height="4" rx="1.5" fill="${c}"/>${[10,14,18].map(y=>`<path d="M5 ${y+2}q12 -4 24 0" stroke="${t}" stroke-width="2.2" fill="none" stroke-dasharray="1.2 2.2" stroke-linecap="round"/>`).join('')}`,
  concert:`<rect x="10" y="3" width="14" height="4" rx="1.5" fill="${c}"/><rect x="11" y="9" width="12" height="7" rx="2" fill="${t}" opacity=".35"/><path d="M4 10l4 8M30 10l-4 8" stroke="${t}" stroke-width="2.2" stroke-dasharray="1.2 2.2" stroke-linecap="round"/><path d="M9 21h16" stroke="${t}" stroke-width="2.2" stroke-dasharray="1.2 2.2" stroke-linecap="round"/>`,
  club:`<rect x="12" y="3" width="10" height="4" rx="1.5" fill="${c}"/><rect x="11" y="9" width="12" height="9" rx="2" fill="${t}" opacity=".35"/><circle cx="5.5" cy="11" r="3" fill="${t}"/><circle cx="5.5" cy="19" r="3" fill="${t}"/><circle cx="28.5" cy="11" r="3" fill="${t}"/><circle cx="28.5" cy="19" r="3" fill="${t}"/>`,
  standing:`<rect x="9" y="3" width="16" height="4" rx="1.5" fill="${c}"/><rect x="11" y="9" width="12" height="4" rx="1.5" fill="${t}" opacity=".6"/><rect x="5" y="14" width="24" height="9" rx="2" fill="${t}" opacity=".3"/>`,
  gala:`<rect x="11" y="3" width="12" height="4" rx="1.5" fill="${c}"/>${[[8,12],[17,12],[26,12],[8,20],[17,20],[26,20]].map(([x,y])=>`<circle cx="${x}" cy="${y}" r="3.2" fill="${t}"/>`).join('')}`,
  block:[6,11,16,21].map(y=>[0,1,2,3,4,5].map(i=>`<circle cx="${5+i*4.8}" cy="${y}" r="1.7" fill="${t}"/>`).join('')).join('')};
  return `<svg viewBox="0 0 34 26">${I[k]||''}</svg>`}
/** A full map to start from. Prices follow the event's first ticket price. */
function evTemplate(k,ev){const p=Math.max(100,ev.types[0]?.price||ev.tz[0]?.price||500),r=v=>Math.round(v/50)*50,id=()=>'e'+(++mk.n),B=(n,x,y,o)=>SM.newBlock(id(),n,x,y,o),door=()=>fx('entrance','Entrance',440,618,120,10);
  const st=(i,name,x,y,w,h)=>({id:id(),kind:'standing',type:i,name,x,y,w,h,rot:0});
  if(k==='theatre')return {name:'Theatre',types:[],tz:[],layout:[fx('stage','Stage',320,24,360,74),
    B('Stalls Left',300,262,{rows:11,cols:7,curve:.2,rot:14,price:r(p*2),numDir:'rtl'}),B('Stalls Centre',500,250,{rows:11,cols:14,curve:.45,price:r(p*3)}),B('Stalls Right',700,262,{rows:11,cols:7,curve:.2,rot:-14,price:r(p*2)}),
    B('Balcony',500,490,{rows:6,cols:32,aisle:8,curve:.3,price:r(p),rowStart:'L'}),door()]};
  if(k==='concert')return {name:'Concert',types:[{name:'Fan pit',price:r(p*2),qty:300,sold:0},{name:'General standing',price:r(p),qty:700,sold:0}],tz:[],layout:[fx('stage','Stage',330,20,340,80),
    st(0,'Fan pit',340,128,320,120),st(1,'General standing',270,268,460,140),
    B('Left tier',165,250,{rows:9,cols:9,curve:.15,rot:30,price:r(p*1.5)}),B('Right tier',835,250,{rows:9,cols:9,curve:.15,rot:-30,price:r(p*1.5)}),
    B('Back seats',500,505,{rows:5,cols:30,aisle:10,curve:.2,price:r(p*1.2)}),fx('bar','Bar',40,560,190,46),door()]};
  if(k==='club'){const a='eA'+Date.now(),b='eB'+Date.now();return {name:'Club',types:[{name:'Dance floor',price:r(p),qty:400,sold:0}],
    tz:[{id:a,name:'VIP · Zone A',price:r(p*3),color:'#2e3192',ink:'#fff'},{id:b,name:'VIP · Zone B',price:r(p*2),color:'#0e5f6e',ink:'#fff'}],
    layout:[zn(a,30,90,240,440),zn(b,730,90,240,440),fx('dj','DJ',420,24,160,60),st(0,'Dance floor',300,110,400,240),fx('bar','Bar',320,400,360,56),
      ...[0,1,2,3].map(i=>mk('sofa','A'+(i+1),150,178+i*98,8)),...[0,1,2,3].map(i=>mk('sofa','B'+(i+1),850,178+i*98,8)),door()]}}
  if(k==='standing')return {name:'Standing',types:[{name:'Golden circle',price:r(p*2),qty:200,sold:0},{name:'General admission',price:r(p),qty:1200,sold:0}],tz:[],layout:[fx('stage','Stage',300,24,400,80),
    st(0,'Golden circle',330,130,340,120),st(1,'General admission',170,272,660,260),fx('bar','Bar',40,190,56,300),fx('bar','Bar',904,190,56,300),door()]};
  const a='eF'+Date.now(),b='eG'+Date.now();
  return {name:'Gala dinner',types:[],tz:[{id:a,name:'Front tables',price:r(p*3),color:'#2e3192',ink:'#fff'},{id:b,name:'Gala tables',price:r(p*2),color:'#0e5f6e',ink:'#fff'}],
    layout:[zn(a,150,116,700,180),zn(b,60,310,880,290),fx('stage','Stage',350,24,300,70),...[0,1,2,3].map(i=>mk('round','F'+(i+1),260+i*160,206,10)),
      ...[0,1,2,3,4].map(i=>mk('round','G'+(i+1),160+i*170,385,10)),...[0,1,2,3,4].map(i=>mk('round','G'+(i+6),160+i*170,525,10)),door()]}}
/** The starting seat map for a new event: stage, two table zones and a standing zone per ticket type. */
function defaultEventLayout(ev){
  ev.tz=[{id:'eA'+Date.now(),name:'VIP Lounge · Zone A',price:Math.round((ev.types[0]?.price||500)*6/100)*100,color:'#2e3192',ink:'#fff'},{id:'eB'+Date.now(),name:'VIP Tables · Zone B',price:Math.round((ev.types[0]?.price||500)*5/100)*100,color:'#0e5f6e',ink:'#fff'}];
  const L=[fx('stage','Stage',20,150,90,340),zn(ev.tz[0].id,280,20,560,190),zn(ev.tz[1].id,280,430,560,190)];
  const st=(i,x,y,w,h)=>{if(ev.types[i])L.push({id:'e'+(++mk.n),kind:'standing',type:i,name:ev.types[i].name,x,y,w,h,rot:0})};
  st(0,130,120,130,400);st(1,280,230,560,180);st(2,860,120,120,400);
  [0,1,2].forEach(i=>L.push(mk('sofa','A'+(i+1),395+i*175,118,8)));
  [0,1,2,3].forEach(i=>L.push(mk('round','B'+(i+1),355+i*137,525,8)));
  ev.layout=L;ev.soldT=[];
  Object.defineProperty(ev,'tables',{configurable:true,enumerable:false,get(){return ev.layout.filter(isT).map(t=>({id:t.id,name:t.name,zone:evArea(ev,t),seats:t.seats,sold:ev.soldT.includes(t.id)}))}});
  return ev}
function evMap(e){const P=S.evp,H0=640,ty=e.types;
  const PT=(x,y)=>[H0-y,x],PR=r=>({x:H0-(r.y+r.h),y:r.x,w:r.h,h:r.w});
  let o=`<svg viewBox="0 0 640 1000" style="${P.zoom==='fit'?'height:100%;width:auto;max-width:100%':`width:${100*P.zoom}%`}" role="img" aria-label="Seat map">`;
  e.layout.filter(x=>x.kind==='zone').forEach(z=>{const r=PR(z),Z=tz(e,z.area);o+=`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="16" fill="#fff"/><text x="${r.x+12}" y="${r.y+24}" font-size="18" font-weight="700" fill="#5b6280">${esc(Z?Z.name.split(' · ')[1]||Z.name:'')}</text>`});
  e.layout.filter(x=>!isT(x)&&x.kind!=='zone').forEach(f=>{const r=PR(f);
    if(f.kind==='standing'){const i=f.type,t=ty[i];if(!t)return;const out=t.sold>=t.qty,q=P.cart[i]||0;
      o+=`<g ${out?'':`data-a="tk" data-v="${i}:1" style="cursor:pointer"`} role="button" aria-label="${esc(t.name)}"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="14" fill="${out?'#e6ebf0':ZCOL[i%3]}" stroke="${q?'#12153f':'none'}" stroke-width="4"/><text x="${r.x+r.w/2}" y="${r.y+r.h/2-4}" text-anchor="middle" font-size="22" font-weight="800" fill="#12153f">${esc(t.name)}</text><text x="${r.x+r.w/2}" y="${r.y+r.h/2+22}" text-anchor="middle" font-size="18" fill="#5b6280">${out?'Sold out':egp(t.price)}${q?' · '+q+' picked':''}</text></g>`;return}
    if(f.kind==='entrance'){o+=`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="4" fill="var(--vc)"/>`;return}
    o+=`<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="12" fill="#12153f"/><text x="${r.x+r.w/2}" y="${r.y+r.h/2+8}" text-anchor="middle" font-size="22" font-weight="800" fill="#fff">${esc(f.name.toUpperCase())}</text>`});
  e.layout.filter(isT).forEach(t=>{const [cx,cy]=PT(t.x,t.y),sold=e.soldT.includes(t.id),sel=P.tables.includes(t.id),Z=tz(e,evArea(e,t))||e.tz[0]||{color:'#2e3192',ink:'#fff'};
    const fill=sold?'#c9d0d9':sel?'#ffff6f':Z.color,tc=sold?'#8a90aa':sel?'#12153f':Z.ink;
    const f=furn(t,fill,true);
    o+=`<g ${sold?'':`data-a="tbl" data-v="${t.id}" style="cursor:pointer"`} role="button" aria-label="Table ${esc(t.name)}${sold?', sold':''}"><g transform="translate(${cx} ${cy}) rotate(${(t.rot+90)%360})">${f.svg}</g><text x="${cx}" y="${cy+7}" text-anchor="middle" font-size="20" font-weight="800" fill="${tc}">${sel?'✓ ':''}${esc(t.name)}</text></g>`});
  return o+'</svg>'}
/* ---------- guest accounts (sign in with a WhatsApp code) ---------- */
const ACCT={user:null,me:null,view:null,next:null,edit:false,otp:{phone:'',sent:false,code:'',test:null,busy:false}};
const gget=u=>api('GET',u,undefined,GTOKEN),gsend=(m,u,b)=>api(m,u,b,GTOKEN);
async function loadMe(){if(!GTOKEN)return;try{const r=await gget('/guest/me');ACCT.me=r;const g=r.guest;
  ACCT.user={first:g.firstName,last:g.lastName,email:g.email||'',phone:g.phone||'',dob:g.birthDate||'',ig:g.instagram||'',gender:cap(g.gender||'')}}catch(e){if(e.status===401){GTOKEN=null;store.set('xtra.guest',null)}}}
function acctScreen(){const u=ACCT.user,A=ACCT,O=A.otp,back=`<button class="x" data-a="acv" data-v="${A.view==='home'||A.view==='login'||A.view==='signup'?'':'home'}" aria-label="Back" style="background:#f2f5f8;color:#12153f;width:36px;height:36px;font-size:18px">←</button>`;
  const ini=u?((u.first[0]||'')+(u.last[0]||'')).toUpperCase()||'G':'';
  if(A.view==='login'||A.view==='signup')return `<div class="gbody">${back}<h2 style="font-size:24px">Log in</h2><p style="margin:-8px 0 0;font-size:14px;color:#5b6280">We send a code to your WhatsApp. New here? This also creates your account.</p>
    ${telField({id:'otpphone',cls:'g',value:O.phone,dis:O.sent,label:'Mobile'})}
    ${O.sent?`<input class="gin" id="otpcode" placeholder="6-digit code" inputmode="numeric" maxlength="6" autocomplete="one-time-code" aria-label="Code">${O.test?`<p style="margin:0;font-size:12px;color:#5b6280">Test mode, WhatsApp is not connected yet. Your code is <b>${O.test}</b>.</p>`:''}<button class="gbtn" data-a="otpverify" ${O.busy?'disabled':''}>Log in</button><button class="btn ghost" data-a="otpagain">Use another number</button>`:`<button class="gbtn" data-a="otpsend" ${O.busy?'disabled':''}>${O.busy?'Sending…':'Send me a code'}</button>`}</div>`;
  if(!u)return '';
  if(A.view==='home')return `<div class="gbody">${back}<button class="acard" data-a="acv" data-v="details"><span class="avatar">${ini}</span><span style="min-width:0;flex:1"><b>${esc(u.first+' '+u.last)}</b><small>${esc(u.email||fmtPhone(u.phone))}</small></span><span>›</span></button><button class="acard" data-a="acv" data-v="bookings">${ic('bookings')}<span><b>Bookings</b><small>Your tickets and table bookings</small></span></button><button class="acard" data-a="acv" data-v="orders">${ic('orders')}<span><b>Orders</b><small>Your order history</small></span></button>${(A.me?.memberships||[]).map(m=>`<div class="tkrow"><div><b>${esc(m.venue)}</b><br><span style="font-size:13px;color:#5b6280">${esc(m.tier?.name||'Member')} · ${m.points.toLocaleString('en-US')} points · ${m.visits} visit${m.visits===1?"":"s"}</span></div></div>`).join('')}<button class="btn ghost" data-a="logout">Log out</button></div>`;
  if(A.view==='details'){const f=(k,l,type='text')=>`<label class="f">${l}<input class="gin" data-acc="${k}" type="${type}" value="${esc(u[k])}" ${A.edit?'':'disabled'}></label>`;
    return `<div class="gbody">${back}<div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:20px">Personal details</h3><button class="chip" data-a="accedit">${A.edit?'Save':'Edit'}</button></div>${f('first','First name')}${f('last','Last name')}${f('dob','Date of birth','date')}<div class="f telf">Mobile${telField({cls:'g',value:u.phone,dis:true,label:'Mobile'})}</div>${f('email','Email','email')}${f('ig','Instagram')}<label class="f">Gender<select class="gsel" data-acc="gender" ${A.edit?'':'disabled'}><option value="">Choose</option>${['Female','Male'].map(x=>`<option ${u.gender===x?'selected':''}>${x}</option>`).join('')}</select></label></div>`}
  if(A.view==='bookings'){const M=A.me||{bookings:[],orders:[]};return `<div class="gbody">${back}<h3 style="font-size:20px">Bookings</h3>${M.orders.map(o=>`<a class="tkrow" href="/o/${o.code}" style="color:inherit;text-decoration:none"><div><b>${esc(o.event)}</b><br><span style="font-size:13px;color:#5b6280">${new Date(o.startsAt).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:TZ})} · tickets</span></div><span>›</span></a>`).join('')}${M.bookings.map(b=>`<a class="tkrow" href="/b/${b.code}" style="color:inherit;text-decoration:none"><div><b>${esc(b.venue)}</b><br><span style="font-size:13px;color:#5b6280">${esc(dparts(b.date).slice(0,3).join(' '))} · table booking</span></div>${pillFor(PILL[b.status]||b.status)}</a>`).join('')}${M.orders.length||M.bookings.length?'':'<p style="color:#5b6280">No bookings yet.</p>'}</div>`}
  if(A.view==='orders'){const M=A.me||{orders:[]};return `<div class="gbody">${back}<h3 style="font-size:20px">Orders</h3>${M.orders.map(o=>`<div class="tkrow"><div><b>${esc(o.event)}</b><br><span style="font-size:13px;color:#5b6280">${o.code}</span></div><div style="text-align:right"><b class="num">${egp2(o.total/100)}</b><br><span class="pill p-arrived" style="font-size:11px">Paid</span></div></div>`).join('')||'<p style="color:#5b6280">No orders yet.</p>'}</div>`}
  return '';
}
function acctMenu(){const u=ACCT.user;return `<div class="amenu"><b>${esc(u.first+' '+u.last)}</b><small>${esc(u.email)}</small><hr><button data-a="acv" data-v="details">${ic('guests')}Account</button><button data-a="acv" data-v="bookings">${ic('bookings')}Bookings</button><button data-a="acv" data-v="orders">${ic('orders')}Orders</button><hr><button data-a="logout">Log out</button></div>`}
const ACCACT={
acct:()=>{if(!ACCT.user){ACCT.view='login';ACCT.next=null}else ACCT.view=ACCT.view==='menu'?null:'menu';render()},
acv:v=>{ACCT.view=v||null;ACCT.edit=false;if(v&&ACCT.user)loadMe().then(render);render()},
otpsend:async()=>{const O=ACCT.otp,ph=telRead('otpphone');if(!telOk(ph)){toast('Add a valid mobile number. For Egypt: 10 1234 5678.');return}
  O.phone=ph;O.busy=true;render();try{const r=await api('POST','/guest/otp',{phone:ph},null);O.sent=true;O.test=r.testMode?r.code:null}catch(e){toast(e.message)}O.busy=false;render();$('#otpcode')?.focus()},
otpagain:()=>{ACCT.otp={phone:'',sent:false,code:'',test:null,busy:false};render()},
otpverify:async()=>{const O=ACCT.otp,code=($('#otpcode')?.value||'').trim();if(code.length!==6){toast('Type the 6-digit code');return}O.busy=true;render();
  try{const r=await api('POST','/guest/verify',{phone:O.phone,code},null);GTOKEN=r.token;store.set('xtra.guest',GTOKEN);await loadMe();ACCT.otp={phone:'',sent:false,code:'',test:null,busy:false};ACCT.view=GUEST?.kind==='me'?'home':null;toast('Logged in as '+ACCT.user.first);if(ACCT.next==='buy'){ACCT.next=null;return EVACT.tkstart()}}catch(e){O.busy=false;toast(e.message)}render()},
logout:()=>{GTOKEN=null;store.set('xtra.guest',null);ACCT.user=null;ACCT.me=null;ACCT.view=null;render();toast('Logged out')},
accedit:async()=>{if(ACCT.edit){const u=ACCT.user;try{await gsend('PATCH','/guest/me',{firstName:u.first||'Guest',lastName:u.last,email:/^\S+@\S+\.\S+$/.test(u.email)?u.email:null,instagram:u.ig||null,gender:u.gender?u.gender.toLowerCase():null,birthDate:u.dob||null});toast('Details saved')}catch(e){toast(e.message);return}}ACCT.edit=!ACCT.edit;render()},
noop:()=>{},
evedit:v=>{S.edEvent=v;S.sel=null;VIEW='editor';closeSheet();render();$('#main').scrollTop=0},
evinv:v=>{const e=EVL(v);e.inviteOnly=!e.inviteOnly;delete PEV[v];render();act(()=>PATCH(vurl(`/events/${v}`),{inviteOnly:e.inviteOnly}),e.inviteOnly?'Invitation only. The event page shows no tickets for sale.':'Ticket sales are open again.')},
evmapt:v=>{const e=EVL(v);e.seatMap=!e.seatMap;S.evp=newEVP();render();act(()=>PATCH(vurl(`/events/${v}`),{seatMap:e.seatMap}),e.seatMap?'Seat map on. Guests pick zones and tables.':'Seat map off. Guests pick from a simple ticket list.')}
};
const WALLETS=`<div class="wallets"><button class="wbtn" data-a="tkpv" data-v="apple"><svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="5" width="18" height="14" rx="3" fill="#fff"/><rect x="3" y="8" width="18" height="3" fill="#ff5f57"/><rect x="3" y="11" width="18" height="3" fill="#febc2e"/><rect x="3" y="14" width="18" height="2.5" fill="#28c840"/></svg><span><small>Add to</small>Apple Wallet</span></button><button class="wbtn" data-a="tkpv" data-v="google"><svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="5" width="18" height="14" rx="3" fill="#4285f4"/><rect x="3" y="9" width="18" height="3" fill="#34a853"/><rect x="3" y="12" width="18" height="3" fill="#fbbc04"/><rect x="3" y="15" width="18" height="4" rx="1" fill="#ea4335"/></svg><span><small>Add to</small>Google Wallet</span></button></div>`;
const tkToken=h=>h?.url?.split('/t/')[1]||'';
function ticketPreview(e,k){const VV=e.venue||VENUES[S.vi],P=S.evp,h=(P.done||[])[0]||{name:'Guest',label:'Ticket'},fn=h.name.split(' ')[0],code=P.order?.code||'',qr=h.url||code,night=e.night.replace('Tonight · ',''),back=`<button class="x" data-a="tkpv" data-v="" aria-label="Back" style="background:#f2f5f8;color:#12153f;width:36px;height:36px;font-size:18px">←</button>`;
  const pass=()=>`<div class="wpass" style="--pc:${e.color}"><div class="pass-h"><b>${esc(VV.name)}</b><span>${esc(h.label)}</span></div><div class="pt"><small>Event</small><b>${esc(e.name)}</b></div><div class="pr"><div><small>Date</small>${esc(night)}</div><div><small>Doors</small>${e.doors}</div></div><div class="pr"><div><small>Guest</small>${esc(h.name)}</div><div><small>Order</small>${code}</div></div><div class="pq"><span>${qrSVG(qr)}</span><small>${code}</small></div></div>`;
  if(k==='apple'||k==='google')return `<div class="gbody">${back}<div style="font-size:14px;color:#5b6280;text-align:center">${k==='apple'?'Apple Wallet':'Google Wallet'} pass</div>${pass()}<button class="gbtn" data-a="tkwallet" data-v="${k}">Add</button><p style="margin:0;font-size:12px;color:#5b6280;text-align:center">Every guest's own pass is also in the link we sent them.</p></div>`;
  if(k==='wa')return `<div class="wachat"><div class="wah">${back}<b>${esc(VV.name)}</b><small>Business account</small></div><div class="wab"><div class="bub">${esc(fn)}, your ticket for <b>${esc(e.name)}</b> at ${esc(VV.name)}, ${esc(night)}. Show this QR at the door, or add it to your wallet.</div><div class="bub img"><span>${qrSVG(qr)}</span><small>${code} · ${esc(h.label)}</small></div><div class="bub"><a href="${esc(h.url||'#')}" target="_blank" rel="noopener">${esc((h.url||'').replace(/^https?:\/\//,''))}</a></div></div></div>`;
  return `<div class="gbody">${back}<div class="mail"><div class="mh"><div><small>From</small>${esc(VV.name)} via XTRA</div><div><small>Subject</small><b>Your ticket: ${esc(e.name)}</b></div></div>${poster(e)}<div class="mb"><p>Hi ${esc(fn)},</p><p>You're going to <b>${esc(e.name)}</b> at ${esc(VV.name)}. Doors open at ${e.doors}.</p><div class="mq"><span>${qrSVG(qr)}</span><div><b>${esc(h.name)}</b><br>${esc(h.label)}<br><small>${code}</small></div></div>${WALLETS}</div></div></div>`}

/* The ticket page, from the public API. Staff see the same live page in a phone. */
const PEV={};
function pubEventFrom(p){const e=eventFrom({id:p.event.id,title:p.event.title,startsAt:p.event.startsAt,status:'published',lineup:p.event.lineup,color:p.event.color,posterUrl:p.event.posterUrl,seatMap:p.event.seatMap,inviteOnly:p.event.inviteOnly,
  zones:p.zones.map(z=>({...z,capacity:z.left})),seats:p.seats,soldByZone:{},soldSeats:p.seats.filter(s=>s.taken&&!s.held).map(s=>s.id)});
  e.venue=p.venue;e.fees=p.fees;e.holdMinutes=p.holdMinutes;e.maxPerOrder=p.event.maxPerOrder;e.rules=p.event.rules;e.pub=true;return e}
async function loadPubEvent(id){PEV[id]=pubEventFrom(await pubGet(`/events/${id}`));return PEV[id]}
function evPhoneFor(e){if(e.status==='draft'||e.status==='ended')return evPhone(e);const p=PEV[e.id];if(!p){loadPubEvent(e.id).then(render).catch(()=>{});return evPhone(e)}return evPhone(p)}
const curEv=()=>GUEST?PEV[GUEST.eventId]:(PEV[S.evSel]||EVL(S.evSel));

/* ---------- ticket page (guest phone) ---------- */
const mmss=s=>String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
const evVenue=e=>e.venue||{name:VENUES[S.vi]?.name||'',where:VENUES[S.vi]?.where||'',logoUrl:CFG()?.logo||null,color:VENUES[S.vi]?.color,...locOf(VENUES[S.vi]?.raw)};
const locOf=v=>v?{photoUrl:v.photoUrl||null,lat:v.mapLat??null,lng:v.mapLng??null,mapUrl:v.mapUrl||null,address:v.address||null}:{};
/** Location card on guest pages: venue photo, a live map from the pin (or the address) and a Directions link. */
function locCard(V){const pin=V.lat!=null&&V.lng!=null,where=V.where||V.address||'',q=pin?`${V.lat},${V.lng}`:[V.name,where].filter(Boolean).join(', '),open=V.mapUrl||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  return `<div class="locc">${V.photoUrl?`<img class="locimg" src="${esc(V.photoUrl)}" alt="${esc(V.name)}" loading="lazy">`:''}${pin||where?`<div class="locmap"><iframe title="Map of ${esc(V.name)}" src="https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=${pin?16:14}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>`:''}<div class="locb"><div><b>${esc(V.name)}</b><span>${esc(where)}</span></div>${pin||where?`<a class="locbtn" href="${esc(open)}" target="_blank" rel="noopener">Directions</a>`:''}</div></div>`}
/** Shrinks an image in the browser and uploads it. Returns its /media URL. */
async function upImage(file,max=1600){const src=await new Promise((ok,no)=>{const fr=new FileReader();fr.onload=()=>ok(fr.result);fr.onerror=()=>no(new Error('Could not read that file'));fr.readAsDataURL(file)});
  const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>no(new Error('That file is not an image'));i.src=src});
  const k=Math.min(1,max/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.round(img.width*k);c.height=Math.round(img.height*k);c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  return (await POST(vurl('/media'),{data:c.toDataURL('image/jpeg',.85)})).url}
const DEF_RULES=e=>[`Doors open at ${e.doors}.`,'21+ with a valid ID. Every guest needs their own ticket.','Show your QR on your phone at the door, no printing needed.','Tickets are non-refundable and can\'t be resold.'];
function evPhone(e){
  const VV=evVenue(e),P=S.evp,C=evCalc(e);
  const logo=VV.logoUrl?`<img src="${esc(VV.logoUrl)}" alt="" class="vlogo" style="width:38px;height:38px">`:`<span class="vlogo mono" style="width:38px;height:38px;font-size:15px">${esc(VV.name.split(' ').map(w=>w[0]).join('').slice(0,2))}</span>`;
  const prices=[...e.types.filter(t=>t.sold<t.qty&&!t.closed).map(t=>t.price),...(e.seatMap?[...e.tz.filter(z=>!z.closed).map(z=>z.price),...e.layout.filter(b=>b.kind==='block'&&!b.closed&&(b.left==null||b.left>0)).map(b=>b.price)]:[])],all=[...e.types.map(t=>t.price),...(e.seatMap?[...e.tz.map(z=>z.price),...e.layout.filter(b=>b.kind==='block').map(b=>b.price)]:[])].filter(x=>x!=null),from=prices.length?Math.min(...prices):all.length?Math.min(...all):0;
  const sumbar=`<div class="evsum"><div><b>(${C.n})</b> tickets<br><span>${esc([...new Set(evLines(e))].slice(0,2).join(', '))}</span></div><div class="evtot"><div><span>Tickets</span><span class="num">${egp2(C.tickets)}</span></div>${C.off?`<div><span>Promo ${esc(P.order?.promo||'')}</span><span class="num">−${egp2(C.off)}</span></div>`:''}<div><span>Fees ${feePctOf(e)}%</span><span class="num">${egp2(C.fees)}</span></div><div><span>VAT ${vatPctOf(e)}% on fees</span><span class="num">${egp2(C.vat)}</span></div><div class="t"><span>Total</span><span class="num">${egp2(C.total)}</span></div></div></div>`;
  const steps=['Seats','Details','Payment'],si={seats:0,details:1,pay:2,paying:2}[P.step];
  const flowHead=`<div class="evfh"><button class="x" data-a="${si?'tkprev':'tkinfo'}" aria-label="Back">←</button><span class="hold ${P.order&&P.hold<=120?'low':''}" id="holdbox">${P.order?`<svg class="hring" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-opacity=".18" stroke-width="2.4"/><circle id="holdr" cx="10" cy="10" r="8" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="50.27" stroke-dashoffset="${(50.27*(1-P.hold/HOLD_S())).toFixed(2)}" transform="rotate(-90 10 10)"/></svg>Held for you <b id="holdt">${mmss(P.hold)}</b>`:'Pick your seats'}</span><button class="x" data-a="tkinfo" aria-label="Close">×</button></div><div class="evsteps">${steps.map((s,i)=>`<span class="${i<si?'done':i===si?'on':''}"><i>${i<si?'✓':i+1}</i>${s}</span>`).join('')}</div>`;
  const draft=e.status==='draft'||!e.pub;
  let body,bar='';
  if(P.step==='info'){
    const rules=(e.rules&&e.rules.length?e.rules:e.inviteOnly?[`Doors open at ${e.doors}.`,'Entry with an invitation only. Every guest has their own QR.','Show your QR on your phone at the door. It also shows your seat and the way to it.']:DEF_RULES(e));
    body=`${poster(e,'poster big')}<div class="gbody"><h2 style="font-size:24px">${esc(e.name)}</h2><div class="evinfo"><div style="grid-column:1/-1"><small>Venue</small>${esc(VV.name)}${VV.where?', '+esc(VV.where):''}</div><div><small>Date</small>${esc(e.night.replace('Tonight · ',''))}</div><div><small>Doors</small>${e.doors}</div>${e.lineup?`<div style="grid-column:1/-1"><small>Line-up</small>${esc(e.lineup)}</div>`:''}</div>
     <div><div class="lbl" style="font-size:15px">Rules</div><ul class="rules">${rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ul></div>
     <div><div class="lbl" style="font-size:15px">Location</div>${locCard(VV)}</div>${LEGAL}</div>`;
    const buy=e.inviteOnly?`<div class="invonly"><b>By invitation only</b><span>Your invitation and QR come by WhatsApp or email.</span></div>`:draft||prices.length?`<button class="gbtn" data-a="tkstart" ${draft?'disabled':''}>${draft?'Not on sale yet':'Buy tickets'}</button>`:`<button class="gbtn" data-a="wlopen">Sold out · Join the waitlist</button>`;
    body=`<div class="glay"><div class="gmain">${body}</div><aside class="gside"><div class="buycard"><small>${esc(e.night.replace('Tonight · ',''))} · doors ${e.doors}</small><b>${esc(e.name)}</b>${e.inviteOnly?'':`<div class="from"><small>Price from</small><b class="num">${egp(from)}</b></div>`}${buy}</div></aside></div>`;
    bar=e.inviteOnly?`<div class="evbar infobar">${buy}</div>`:`<div class="evbar infobar"><div><small>Price from</small><b class="num">${egp(from)}</b></div>${buy}</div>`;
  }
  else if(P.step==='wait'){const W=P.wl,outT=e.types.filter(t=>t.sold>=t.qty);
    body=`<div class="evfh"><button class="x" data-a="tkinfo" aria-label="Back">←</button><span class="hold">Waitlist</span><button class="x" data-a="tkinfo" aria-label="Close">×</button></div><div class="gbody" style="padding-top:8px">${W.done?`<div class="wldone"><b>You're on the list.</b><span>You are number ${W.done} in line. If a place opens up, we message you on WhatsApp or email right away. Places go to whoever books first.</span><button class="gbtn" data-a="tkinfo">Back to the event</button></div>`:
    `<h2 style="font-size:22px">Join the waitlist</h2><p style="margin:-6px 0 4px;font-size:14px;color:#5b6280">${esc(e.name)} is sold out. Leave your details and we tell you as soon as a place opens up.</p>
     ${outT.length>1||(outT.length&&outT.length<e.types.length)?`<select class="gsel" data-wl="zone" aria-label="Ticket type"><option value="">Any ticket</option>${outT.map(t=>`<option value="${t.zid}" ${W.zone===t.zid?'selected':''}>${esc(t.name)}</option>`).join('')}</select>`:''}
     <input class="gin" data-wl="name" value="${esc(W.name)}" placeholder="Full name" aria-label="Full name" autocomplete="name">
     ${telField({bind:'data-wl="phone"',value:W.phone,cls:'g',label:'WhatsApp number'})}
     <input class="gin" data-wl="email" type="email" value="${esc(W.email)}" placeholder="Email (optional)" aria-label="Email" autocomplete="email">
     <div class="tkrow"><div><b>How many people</b></div><div class="stepper"><button data-a="wlqty" data-v="-1" aria-label="Fewer" ${W.qty<=1?'disabled':''}>−</button><b class="num">${W.qty}</b><button data-a="wlqty" data-v="1" aria-label="More" ${W.qty>=10?'disabled':''}>+</button></div></div>`}</div>`;
    if(!W.done)bar=`<div class="evbar"><button class="gbtn" data-a="wljoin" ${W.busy?'disabled':''}>${W.busy?'Joining…':'Join the waitlist'}</button></div>`;
  }
  else if(P.step==='seats'&&!e.seatMap){
    body=flowHead+`<div class="gbody" style="padding-top:8px"><div class="lbl" style="font-size:15px">Choose your tickets</div>${e.types.map((t,i)=>{const out=t.sold>=t.qty;return `<div class="tkrow ${P.cart[i]?'sel':''}"><div><b>${esc(t.name)}</b><br><span class="num" style="font-size:13px">${out?'Sold out':egp(t.price)+' each · '+(t.qty-t.sold)+' left'}</span></div>${out?`<button class="chip" data-a="wlopen" data-v="${t.zid}">Join waitlist</button>`:`<div class="stepper"><button data-a="tk" data-v="${i}:-1" aria-label="Remove one" ${P.cart[i]?'':'disabled'}>−</button><b class="num">${P.cart[i]||0}</b><button data-a="tk" data-v="${i}:1" aria-label="Add one">+</button></div>`}</div>`}).join('')}</div>`;
    bar=sumbar+`<div class="evbar" style="border:0;padding-top:0"><button class="gbtn" data-a="tknext" ${C.n&&!P.busy?'':'disabled'}>${P.busy?'Holding your tickets…':'Continue →'}</button></div>`;
  }
  else if(P.step==='seats'){
    const mine=new Set([...P.seats,...P.tables]),D=SM.tiers(e);
    const map=SM.frame('ev:'+e.id,e,{mode:'pick',mine,cart:P.cart,bcart:P.bcart,seatState:id=>e.seatSt?.[id]||'free',tableState:t=>{const st=e.seatSt?.[t.id];return st==='held'?'held':st==='sold'||e.soldT.includes(t.id)?'sold':'free'},zoneOf:t=>evArea(e,t),label:'Seat map of '+e.name});
    const picked=[...e.types.map((t,i)=>P.cart[i]?`<div class="tkrow sel"><div><b>${esc(t.name)}</b><br><span class="num" style="font-size:13px">Standing · ${egp(t.price)} each</span></div><div class="stepper"><button data-a="tk" data-v="${i}:-1" aria-label="Remove one">−</button><b class="num">${P.cart[i]}</b><button data-a="tk" data-v="${i}:1" aria-label="Add one">+</button></div></div>`:''),
      ...P.tables.map(id=>{const t=e.tables.find(x=>x.id===id);if(!t)return '';const Z=tz(e,t.zone)||{name:'Table',price:0};return `<div class="tkrow sel"><div><b>Table ${esc(t.name)}</b><br><span style="font-size:13px">${esc(Z.name)} · ${t.seats} seats · ${egp(Z.price*t.seats)}</span></div><button class="chip" data-a="tbl" data-v="${t.id}">Remove</button></div>`}),
      ...e.layout.filter(b=>b.kind==='block'&&P.bcart[b.id]).map(b=>`<div class="tkrow sel"><div><b>${esc(b.name)}</b><br><span class="num" style="font-size:13px">Free seating · ${egp(b.price)} each</span></div><div class="stepper"><button data-a="bq" data-v="${b.id}:-1" aria-label="Remove one">−</button><b class="num">${P.bcart[b.id]}</b><button data-a="bq" data-v="${b.id}:1" aria-label="Add one">+</button></div></div>`),
      ...P.seats.map(id=>{const x=seatOf(e,id);if(!x)return '';return `<div class="tkrow sel"><div><b>Row ${esc(x.row)}, Seat ${esc(x.num)}</b><br><span style="font-size:13px">${esc(x.b.name)} · ${egp(x.b.price)}</span></div><button class="chip" data-a="seat" data-v="${id}">Remove</button></div>`})].join('');
    body=flowHead+`<div class="gbody" style="padding-top:8px;gap:12px"><div class="smhint">${P.order?'Add more or tap a seat again to let it go.':'Tap a seat, a table or a standing zone. Pinch or scroll to zoom.'}</div>${map}
     <div class="smleg">${D.map(t=>`<span class="${t.out?'out':''}"><i style="background:${t.color}"></i><b class="num">${egp(t.price)}</b>${esc(t.names.slice(0,2).join(', '))}${t.names.length>2?' +'+(t.names.length-2):''}</span>`).join('')}<span><i class="mine"></i>Yours</span><span><i class="held"></i>On hold</span><span><i class="sold"></i>Sold</span></div>
     ${picked?`<div class="stack" style="gap:8px">${picked}</div>`:''}</div>`;
    bar=sumbar+`<div class="evbar" style="border:0;padding-top:0"><button class="gbtn" data-a="tknext" ${C.n&&!P.busy?'':'disabled'}>${P.busy?'Holding your seats…':'Continue →'}</button></div>`;
  }
  else if(P.step==='details'){
    const L=evLines(e),U=ACCT.user;while(P.holders.length<L.length)P.holders.push(P.holders.length===0&&U?{first:U.first,last:U.last,email:U.email,phone:U.phone,dob:U.dob,gender:U.gender}:{first:'',last:'',email:'',phone:'',dob:'',gender:''});P.holders.length=L.length;
    const fi=(i,k,ph,type='text',extra='')=>`<input class="gin" data-evh="${i}:${k}" type="${type}" value="${esc(P.holders[i][k])}" placeholder="${ph}" aria-label="${ph}" autocomplete="off" ${extra}>`;
    body=flowHead+`<div class="gbody" style="padding-top:8px">${P.holders.map((h,i)=>`<div class="gcard"><div class="gch" style="display:flex;justify-content:space-between;gap:8px"><span>${i===0?'Your ticket':'Ticket '+(i+1)}</span><span class="pill" style="background:#e6ebf0;color:#12153f">${esc(L[i])}</span></div><div class="oth" style="margin:0">${fi(i,'first','First name')}${fi(i,'last','Last name')}</div>${fi(i,'email','Email','email')}${telField({bind:`data-evh="${i}:phone"`,value:P.holders[i].phone,cls:'g',label:'Mobile'})}<div class="oth" style="margin:0">${fi(i,'dob','Birth date','date')}<select class="gsel" data-evh="${i}:gender" aria-label="Gender"><option value="">Gender</option>${['Female','Male'].map(x=>`<option ${h.gender===x?'selected':''}>${x}</option>`).join('')}</select></div></div>`).join('')}
     <label class="chk"><input type="checkbox" data-evp="consent" ${P.consent!==false?'checked':''}>Send me offers and events from ${esc(VV.name)} on WhatsApp and email</label></div>`;
    bar=sumbar+`<div class="evbar" style="border:0;padding-top:0"><button class="gbtn" data-a="tknext">Continue to payment →</button></div>`;
  }
  else if(P.step==='pay'){
    const pm=(k,inner)=>`<button class="pmrow ${P.pm===k?'on':''}" data-a="pm" data-v="${k}">${inner}<span>${P.pm===k?'✓':''}</span></button>`;
    body=flowHead+`<div class="gbody" style="padding-top:8px"><div class="amount"><b style="font-size:16px">Order summary</b>${[...new Set(evLines(e))].map(l=>{const n=evLines(e).filter(x=>x===l).length;return `<div class="sum" style="font-size:14px"><span>${n} × ${esc(l)}</span></div>`}).join('')}</div>
     <div class="promobox"><b>Do you have a promo code?</b>${P.order?.promo?`<div class="sum" style="font-size:14px;color:#1f8a4c;margin:0"><span>✓ ${esc(P.order.promo)}: ${C.total===0?'tickets are free':'−'+egp2(C.off)}</span><button class="chip" data-a="promo-x">Remove</button></div>`:`<div class="phonein" style="gap:6px"><input class="gin" id="pcin" placeholder="Enter code" style="text-transform:uppercase" autocomplete="off" aria-label="Promo code"><button class="btn sm" data-a="promo-apply" ${P.busy?'disabled':''}>Apply</button></div>`}</div>
     ${C.total===0?`<div class="amount" style="font-size:14px;text-align:center">Nothing to pay. Your code covers the full price.</div>`:`${pm('card','<span><b>Card</b><small>Visa, Mastercard, Meeza</small></span>')}
     ${pm('wallet','<span><b>Mobile wallet</b><small>Vodafone Cash, Etisalat, Orange, WE Pay</small></span>')}
     ${pm('instapay','<span><b>InstaPay</b><small>Pay from any Egyptian bank app</small></span>')}
     ${pm('valu','<span><b>Pay in instalments</b><small>valU, Sympl or Aman</small></span>')}
     <div style="font-size:12px;color:#5b6280;text-align:center">You finish on Paymob's secure page</div>`}</div>`;
    bar=sumbar+`<div class="legal" style="padding:0 16px 6px;text-align:left">By paying you agree to the <a href="/terms" target="_blank" rel="noopener">Terms</a> and <a href="/refunds" target="_blank" rel="noopener">Refund policy</a>.</div><div class="evbar" style="border:0;padding-top:0"><button class="gbtn" data-a="tkpay" ${P.busy?'disabled':''}>${P.busy?'Opening payment…':C.total===0?'Get my free tickets':'Pay '+egp2(C.total)}</button></div>`;
  }
  else if(P.step==='paying'){
    body=flowHead+`<div class="gdone"><h2 style="font-size:22px">Finish paying</h2><p style="margin:0;color:#5b6280">We opened Paymob in a new tab. This page moves on by itself once the payment goes through.</p><div class="loading" style="padding:10px">Waiting for payment…</div>${P.checkoutUrl?`<a class="btn ghost" href="${esc(P.checkoutUrl)}" target="_blank" rel="noopener">Open payment again</a>`:''}</div>`;
  }
  else body=`<div class="gdone"><h2 style="font-size:24px">You're going</h2><p style="margin:0;color:#5b6280">${P.last} ticket${P.last>1?'s':''} for ${esc(e.name)}. Every guest got their own QR by WhatsApp and email.${ACCT.user?' Saved in your account under Bookings.':''}</p><span class="qr" style="box-shadow:0 0 0 1px #d7dde3">${qrSVG((P.done||[])[0]?.url||P.order?.code||'')}</span>${WALLETS}<div class="sentrow"><span>Sent to</span><button class="chip" data-a="tkpv" data-v="wa">WhatsApp</button><button class="chip" data-a="tkpv" data-v="email">Email</button></div><div style="font-size:14px;color:#5b6280;text-align:left;width:100%">${(P.done||[]).slice(0,8).map(h=>`<div class="sum"><span>${esc(h.name)}</span>${h.url?`<a href="${esc(h.url)}" target="_blank" rel="noopener" style="color:#12153f;font-weight:700">${esc(h.label)}</a>`:`<span>${esc(h.label)}</span>`}</div>`).join('')}${(P.done||[]).length>8?`<div class="sum"><span>and ${P.done.length-8} more</span></div>`:''}</div><button class="btn ghost" data-a="tkreset">Back to event</button></div>`;
  if(P.step==='done'&&P.prev)body=ticketPreview(e,P.prev);
  const U=ACCT.user,av=ACCT.view,inAcct=av&&av!=='menu';
  if(inAcct){body=acctScreen();bar=''}
  const pbtn=`<button class="pbtn ${U?'in':''}" data-a="acct" aria-label="${U?'Your account':'Log in'}">${U?((U.first[0]||'')+(U.last[0]||'')).toUpperCase()||'G':`<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.4-3.6 4.2-5.3 7.5-5.3s6.1 1.7 7.5 5.3"/></svg>`}</button>`;
  return `<div class="phone"><div class="screen" style="--vc:${esc(VV.color||'#12153f')}"><div class="sbar"><span>9:41</span><span>●●● 5G</span></div>${P.step==='info'||P.step==='done'||inAcct?`<div class="evtop">${logo}<b>${esc(VV.name)}</b>${pbtn}</div>`:''}${av==='menu'&&U?acctMenu():''}<div class="gscroll">${body}</div>${bar}</div></div>`;
}
let holdTimer=null,payPoll=null;
function startHold(sec){clearInterval(holdTimer);S.evp.hold=Math.max(0,sec|0);holdTimer=setInterval(()=>{const P=S.evp;if(!P.order||!['seats','details','pay','paying'].includes(P.step)){clearInterval(holdTimer);return}P.hold=Math.max(0,P.hold-1);const el=$('#holdt');if(el)el.textContent=mmss(P.hold);
  const ring=$('#holdr');if(ring)ring.setAttribute('stroke-dashoffset',(50.27*(1-P.hold/HOLD_S())).toFixed(2));$('#holdbox')?.classList.toggle('low',P.hold<=120);if(P.hold===120)toast('2 minutes left to finish your order');
  if(P.hold<=0){clearInterval(holdTimer);clearTimeout(payPoll);const z=P.zoom;S.evp=newEVP();S.evp.zoom=z;reloadEv();render();toast('Time is up. Your tickets were released.')}},1000)}
const scrollPhoneTop=()=>{const g=document.querySelector('.phone .gscroll');if(g)g.scrollTop=0};
/** Fresh availability after a sale or release. */
function reloadEv(){const e=curEv();if(!e)return;const id=e.id;if(PEV[id])loadPubEvent(id).then(render).catch(()=>{});if(!GUEST&&S.events)refresh()}
/* A valid full number, or null. */
const ph20=p=>{const t=telNorm(p);return telOk(t)?t:null};
async function releaseHold(){const P=S.evp;if(P.order&&P.order.status==='held'){const code=P.order.code;P.order=null;clearInterval(holdTimer);try{await pubPost(`/orders/${code}/release`)}catch(_){}}}
function finishOrder(o){const P=S.evp,e=curEv(),L=e?evLines(e):[];clearInterval(holdTimer);clearTimeout(payPoll);
  P.order=o;P.done=o.tickets.map((t,i)=>({name:t.name,label:t.label||L[i]||'Ticket',url:t.url}));P.last=o.tickets.length;P.step='done';P.cart={};P.tables=[];P.busy=false;
  if(ACCT.user)loadMe();reloadEv();render();scrollPhoneTop();toast(`${P.last} ticket${P.last>1?'s':''} ready. QR codes sent.`)}
async function pollOrder(code){clearTimeout(payPoll);try{const o=await pubGet(`/orders/${code}`);if(S.evp.order?.code!==code)return;
  if(o.status==='paid')return finishOrder(o);if(o.status!=='held'){S.evp=newEVP();render();toast('The payment did not go through. Your tickets were released.');return}}catch(_){}
  payPoll=setTimeout(()=>pollOrder(code),3000)}
/* ---------- seat holds: the first pick starts a 10-minute hold, every change updates it ---------- */
const HOLD_S=()=>((curEv()?.holdMinutes)||10)*60;
const pubPut=(u,b)=>api('PUT','/public'+u,b,null);
const heldQty=zid=>(S.evp.order?.lines||[]).filter(l=>l.zoneId===zid&&!l.seatId).reduce((s,l)=>s+l.qty,0);
function holdItems(e){const P=S.evp;return [...e.types.map((t,i)=>P.cart[i]?{zoneId:t.zid,qty:P.cart[i]}:null).filter(Boolean),
  ...P.tables.map(id=>{const el=e.layout.find(x=>x.id===id);return el?{zoneId:el.zone||evArea(e,el),seatId:id}:null}).filter(Boolean),
  ...P.seats.map(id=>{const x=seatOf(e,id);return x?{zoneId:x.b.id,seatId:id}:null}).filter(Boolean),
  ...Object.entries(P.bcart||{}).filter(([,q])=>q>0).map(([id,q])=>({zoneId:id,qty:q}))]}
/** Puts the picks back to what the server holds (after a seat was taken by someone else). */
function picksFromOrder(e,o){const P=S.evp;P.cart={};P.bcart={};P.tables=[];P.seats=[];(o?.lines||[]).forEach(l=>{
  if(!l.seatId){const i=e.types.findIndex(t=>t.zid===l.zoneId);if(i>=0)P.cart[i]=(P.cart[i]||0)+l.qty;else P.bcart[l.zoneId]=(P.bcart[l.zoneId]||0)+l.qty}else if(l.kind==='table')P.tables.push(l.seatId);else P.seats.push(l.seatId)})}
let holdQ=Promise.resolve();
function syncHold(){const P=S.evp,e=curEv();if(!e||!e.pub||P.queued)return;P.queued=true;
  holdQ=holdQ.then(async()=>{P.queued=false;if(S.evp!==P)return;const items=holdItems(e);
    try{
      if(!P.order){if(!items.length)return;const o=await pubPost(`/events/${e.id}/hold`,{items});
        if(S.evp!==P){pubPost(`/orders/${o.code}/release`).catch(()=>{});return}P.order=o;startHold(o.secondsLeft);toast(`Held for you for ${Math.round(o.secondsLeft/60)} minutes`)}
      else{const o=await pubPut(`/orders/${P.order.code}/items`,{items});if(S.evp!==P)return;
        if(o.status!=='held'){P.order=null;clearInterval(holdTimer);P.hold=0}else{P.order=o;startHold(o.secondsLeft)}}
    }catch(x){if(S.evp!==P)return;toast(x.message);
      if(x.code==='hold_expired'){clearInterval(holdTimer);P.order=null;P.cart={};P.bcart={};P.tables=[];P.seats=[]}else picksFromOrder(e,P.order);
      reloadEv()}
    render()})}
// Leaving the page lets the seats go right away instead of in 10 minutes.
addEventListener('pagehide',()=>{const P=S?.evp;if(P?.order?.status==='held'&&['seats','details','pay'].includes(P.step))try{navigator.sendBeacon(`/api/public/orders/${P.order.code}/release`)}catch(_){}});
// Other guests' picks show up while you choose.
setInterval(()=>{const P=S?.evp,e=GUEST?.kind==='event'&&curEv();if(!e||P.step!=='seats'||document.hidden||SM.busy()||P.queued)return;loadPubEvent(e.id).then(()=>{if(S.evp.step==='seats'&&!SM.busy())render()}).catch(()=>{})},15000);
const EVACT={
wlopen:v=>{const U=ACCT.user,P=S.evp;P.wl={zone:v||'',name:U?`${U.first} ${U.last}`.trim():'',phone:U?.phone||'',email:U?.email||'',qty:1,busy:false,done:0};P.step='wait';render();scrollPhoneTop()},
wlqty:v=>{const W=S.evp.wl;W.qty=Math.max(1,Math.min(10,W.qty+ +v));render()},
wljoin:async()=>{const W=S.evp.wl,e=curEv();if(W.busy||!e)return;if(W.name.trim().length<2){toast('Add your full name');return}if(!ph20(W.phone)){toast('Add a valid WhatsApp number');return}
  if(W.email&&!/^\S+@\S+\.\S+$/.test(W.email)){toast('Check your email');return}
  W.busy=true;render();try{const r=await pubPost(`/events/${e.id}/waitlist`,{name:W.name.trim(),phone:ph20(W.phone),qty:W.qty,...(W.zone?{zoneId:W.zone}:{}),...(W.email?{email:W.email.trim()}:{})});W.done=r.position}catch(x){toast(x.message)}W.busy=false;render()},
tkstart:()=>{if(!ACCT.user){ACCT.view='login';ACCT.next='buy';render();return}const z=S.evp.zoom;S.evp=newEVP();S.evp.zoom=z;S.evp.step='seats';render();scrollPhoneTop()},
tkinfo:async()=>{clearTimeout(payPoll);if(S.evp.step!=='paying')await releaseHold();const z=S.evp.zoom;S.evp=newEVP();S.evp.zoom=z;reloadEv();render()},
tk:v=>{const [i,d]=v.split(':').map(Number),e=curEv(),t=e.types[i],P=S.evp,c=P.cart,max=e.maxPerOrder||10,others=evCalc(e).n-(c[i]||0),held=heldQty(t.zid);
  const room=t.qty-t.sold+held,next=Math.max(0,Math.min(room,max-others,(c[i]||0)+d));if(d>0&&next===(c[i]||0)){toast(next>=room?`No more ${t.name} tickets left`:`Max ${max} tickets per order`);return}c[i]=next;render();syncHold()},
tbl:v=>{const P=S.evp,e=curEv();if(!P.tables.includes(v)){const t=e.tables.find(x=>x.id===v);if(t&&evCalc(e).n+t.seats>(e.maxPerOrder||10)){toast(`Max ${e.maxPerOrder||10} tickets per order`);return}}P.tables=P.tables.includes(v)?P.tables.filter(x=>x!==v):[...P.tables,v];render();syncHold()},
seat:(v,el)=>{const P=S.evp,e=curEv(),box=el.closest?.('.smap');
  // Too small to aim at: zoom in on that spot first.
  if(box&&!P.seats.includes(v)&&SM.scaleOf(box)*SM.R<5){const c=el.tagName==='circle'?el:el.querySelector('circle');if(c){SM.zoomTo(box,+c.getAttribute('cx'),+c.getAttribute('cy'),Math.max(2.2,7/(SM.scaleOf(box)*SM.R)));return}}
  if(!P.seats.includes(v)&&evCalc(e).n+1>(e.maxPerOrder||10)){toast(`Max ${e.maxPerOrder||10} tickets per order`);return}
  P.seats=P.seats.includes(v)?P.seats.filter(x=>x!==v):[...P.seats,v];render();syncHold()},
bq:v=>{const [id,d]=v.split(':'),n=+d,e=curEv(),P=S.evp,b=e.layout.find(x=>x.id===id);if(!b)return;const cur=P.bcart[id]||0,max=e.maxPerOrder||10,others=evCalc(e).n-cur,room=(b.left??0)+heldQty(id),next=Math.max(0,Math.min(room,max-others,cur+n));
  if(n>0&&next===cur){toast(next>=room?`No more seats left in ${b.name}`:`Max ${max} tickets per order`);return}P.bcart[id]=next;render();syncHold()},
smz:(v,el)=>{const box=el.closest('.smap');if(!box)return;if(v==='fit')SM.fit(box);else SM.zoomAt(box,v==='in'?1.6:1/1.6)},
zoom:v=>{const P=S.evp;if(v==='fit'){P.zoom='fit';render();return}if(P.zoom==='fit'){if(+v>0)P.zoom=1;render();return}const n=P.zoom+(+v)*.5;P.zoom=n<1?'fit':Math.min(3,n);render()},
tkprev:()=>{const P=S.evp;if(P.step==='paying'){clearTimeout(payPoll);P.step='pay'}else P.step={details:'seats',pay:'details'}[P.step]||'seats';render()},
tknext:async()=>{const P=S.evp,e=curEv();
  if(P.step==='seats'){if(!evCalc(e).n||P.busy)return;
    P.busy=true;render();syncHold();await holdQ;P.busy=false;
    if(!P.order||S.evp!==P||!evCalc(e).n){render();return}
    P.step='details'}
  else if(P.step==='details'){const bad=P.holders.findIndex((h,i)=>!h.first.trim()||!h.last.trim()||(i===0&&(!/^\S+@\S+\.\S+$/.test(h.email)||!ph20(h.phone)))||(h.email&&!/^\S+@\S+\.\S+$/.test(h.email))||(h.phone&&!ph20(h.phone)));
    if(bad>=0){toast(bad?`Ticket ${bad+1}: add first and last name. Email and mobile are optional.`:'Your ticket: add your name, email and a valid mobile number');return}P.step='pay'}
  render();scrollPhoneTop()},
pm:v=>{S.evp.pm=v;render()},
'promo-x':async()=>{const P=S.evp;try{P.order=await pubPost(`/orders/${P.order.code}/promo`,{code:null})}catch(x){toast(x.message)}render()},
'promo-apply':async()=>{const P=S.evp,code=($('#pcin')?.value||'').trim().toUpperCase();if(!code||!P.order)return;P.busy=true;render();
  try{P.order=await pubPost(`/orders/${P.order.code}/promo`,{code,...(ph20(P.holders[0]?.phone)?{phone:ph20(P.holders[0].phone)}:{})});toast(P.order.totals.total===0?'Code applied. Your tickets are free.':`Code applied: −${egp2(P.order.totals.discount/100)}`)}
  catch(x){toast(x.message)}P.busy=false;render()},
tkpay:async()=>{const P=S.evp;if(P.busy||!P.order)return;const free=P.order.totals.total===0,w=free?null:window.open('','_blank');P.busy=true;render();
  const H=P.holders.map(h=>({firstName:h.first.trim(),lastName:h.last.trim(),...(/^\S+@\S+\.\S+$/.test(h.email)?{email:h.email.trim()}:{}),...(ph20(h.phone)?{phone:ph20(h.phone)}:{}),...(h.dob?{birthDate:h.dob}:{}),...(h.gender?{gender:h.gender.toLowerCase()}:{})}));
  const ok=P.consent!==false;
  try{const r=await pubPost(`/orders/${P.order.code}/checkout`,{buyer:{...H[0],whatsappOptIn:ok,emailOptIn:ok},attendees:H});
    if(r.status==='paid'){w&&w.close();finishOrder(r.order);return}
    P.checkoutUrl=r.checkoutUrl;if(w)w.location=r.checkoutUrl;else window.open(r.checkoutUrl,'_blank');P.busy=false;P.step='paying';render();pollOrder(P.order.code)}
  catch(x){w&&w.close();P.busy=false;toast(x.message);render()}},
tkreset:()=>{const z=S.evp.zoom;S.evp=newEVP();S.evp.zoom=z;render();scrollPhoneTop()},
tkpv:v=>{S.evp.prev=v||null;render();scrollPhoneTop()},
tkwallet:()=>{const u=(S.evp.done||[])[0]?.url;if(u)window.open(u,'_blank','noopener');else toast('Open the ticket link to add it to your wallet')}
};

/* ---------- marketing ---------- */
function vMarketing(){
  const since=Date.now()-30*864e5,sent=S.campaigns.filter(c=>c.status==='sent'),recent=sent.filter(c=>new Date(c.raw.sentAt||0)>since),msgs=recent.reduce((s,c)=>s+c.sent,0),fail=recent.reduce((s,c)=>s+(c.failed||0),0);
  const cons=S.guests.filter(g=>!g.walkin&&g.consent).length,all=S.guests.filter(g=>!g.walkin).length;
  const stp=c=>c.status==='sent'?(c.failed?`<span class="pill p-pending" style="font-size:11px">${c.failed} failed</span>`:''):`<span class="pill ${c.status==='scheduled'?'p-booked':'p-free'}" style="font-size:11px">${c.status==='scheduled'?'Scheduled':c.status==='cancelled'?'Cancelled':'Sending'}</span>`;
  return head('Marketing','WhatsApp and email to guests who agreed to hear from you.',`<button class="btn" data-a="newcamp">New campaign</button>`)+
  `<div class="kpis"><div class="kpi"><b class="num">${msgs.toLocaleString('en-US')}</b><span>messages, last 30 days</span></div><div class="kpi"><b class="num">${recent.length}</b><span>campaigns sent</span></div><div class="kpi"><b class="num">${S.campaigns.filter(c=>c.status==='scheduled').length}</b><span>scheduled</span></div><div class="kpi"><b class="num">${fail}</b><span>failed to deliver</span></div></div>
  <div class="bigbox scroll"><h3 style="margin-bottom:6px">Campaigns</h3>${S.campaigns.length?`<table class="gtable"><thead><tr><th>Campaign</th><th class="hide">Audience</th><th>Sent</th></tr></thead><tbody>${S.campaigns.map(c=>`<tr><td><b>${esc(c.name)}</b><br><span class="mute" style="font-size:13px">${c.ch==='wa'?'WhatsApp':'Email'} · ${esc(c.when)}</span> ${stp(c)}</td><td class="hide">${SEG[c.seg][0]}</td><td class="num">${c.sent?c.sent.toLocaleString('en-US'):'—'}</td></tr>`).join('')}</tbody></table>`:'<div class="empty">No campaigns yet. Send your first one to guests who agreed to offers.</div>'}</div>
  <div class="setgrid" style="margin-top:16px"><div class="bigbox"><h3>Automatic offers</h3><p class="mute" style="font-size:14px;margin:4px 0 6px">Off until you switch one on. Booking and ticket messages always go out by email and WhatsApp.</p>${S.autos.map(a=>`<div class="conn"><div><b>${a.name}</b><div class="mute" style="font-size:14px">${a.desc}${a.on?` · ${a.n} sent this month`:''}</div></div><button class="toggle ${a.on?'on':''}" data-a="auto" data-v="${a.k}" role="switch" aria-checked="${a.on}" aria-label="${a.name}"></button></div>`).join('')}</div>
  <div class="bigbox"><h3>Who you can reach</h3><div class="count" style="margin:10px 0 2px"><b class="num">${cons}</b><span class="mute">of ${all} guests agreed</span></div><div class="meter ok"><i style="width:${all?cons/all*100:0}%"></i></div><p class="mute" style="font-size:14px">Guests tick the box on the booking page or at checkout. Everyone else only gets booking messages, never offers, as Egypt's data law (151 of 2020) requires. Every offer has a one-tap opt out.</p>${Object.entries(SEG).map(([k,[l]])=>`<div class="conn" style="padding:8px 0"><span>${l}</span><b class="num">${reach(k,'wa').length}</b></div>`).join('')}</div></div>`;
}
const fillVars=(t,g)=>t.replace(/\{first_name\}/g,g?g.name.split(' ')[0]:'Nour').replace(/\{venue\}/g,VENUES[S.vi].name);
const campLink=c=>c.link==='none'?'':c.link==='book'?`${location.origin}/book/${VENUES[S.vi].slug}`:`${location.origin}/e/${c.link}`;
const WHEN=()=>{const t=new Date(),at=(d,h)=>{const x=new Date(cairoISO(addDays(nightYmd(),d),h*60));return x>t?x:null};return [['Now',null],['Today 6:00 PM',at(0,18)],['Tomorrow 2:00 PM',at(1,14)]].filter(([k,v])=>k==='Now'||v)};
function campSheet(){const c=S.camp,list=reach(c.seg,c.ch),g=list[0];
  const links={none:'No link',book:'Booking page',...Object.fromEntries(S.events.filter(e=>e.status!=='draft'&&e.status!=='ended').map(e=>[e.id,'Tickets: '+e.name]))};
  if(!links[c.link])c.link='book';
  const linkUrl=campLink(c),msg=fillVars(c.text,g);
  return ['New campaign',`<div class="stack" style="margin-top:0"><label class="f">Name (only you see it)<input data-camp="name" value="${esc(c.name)}" autocomplete="off"></label>
  <div><div class="lbl" style="font-size:14px;font-weight:600;margin-bottom:6px">Send by</div><div class="seg">${[['wa','WhatsApp'],['email','Email']].map(([k,l])=>`<button class="${c.ch===k?'on':''}" data-a="cch" data-v="${k}">${l}</button>`).join('')}</div></div>
  <label class="f">Audience<select data-camp="seg">${Object.entries(SEG).map(([k,[l]])=>`<option value="${k}" ${c.seg===k?'selected':''}>${l} · ${reach(k,c.ch).length}</option>`).join('')}</select></label>
  ${c.ch==='email'?`<label class="f">Subject<input data-camp="subject" value="${esc(c.subject)}" autocomplete="off"></label>`:''}
  <label class="f">Message<textarea data-camp="text" rows="4">${esc(c.text)}</textarea></label>
  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:-4px">${['{first_name}','{venue}'].map(v=>`<button class="chip" data-a="cvar" data-v="${v}">+ ${v}</button>`).join('')}</div>
  <label class="f">Button link<select data-camp="link">${Object.entries(links).map(([k,l])=>`<option value="${k}" ${c.link===k?'selected':''}>${esc(l)}</option>`).join('')}</select></label>
  <div><div class="lbl" style="font-size:14px;font-weight:600;margin-bottom:6px">When</div><div class="seg">${WHEN().map(([k])=>`<button class="${c.when===k?'on':''}" data-a="cwhen" data-v="${k}">${k}</button>`).join('')}</div></div></div>
  <h3 style="margin-top:20px">Preview for ${esc(g?g.name:'a guest')}</h3>${c.ch==='wa'?`<div class="wa">${esc(msg)}${linkUrl?'\n'+esc(linkUrl):''}\n<span class="mute" style="font-size:12px">Reply STOP to opt out</span><small>${nowStr()} ✓✓</small></div>`:`<div class="mail"><div class="mh"><b>${esc(fillVars(c.subject,g))}</b>From ${esc(VENUES[S.vi].name)} via XTRA</div><div class="mb">${esc(msg)}${linkUrl?`<br><span class="cta">Open</span>`:''}<br><span class="mute" style="font-size:12px">Unsubscribe</span></div></div>`}
  <div class="stack"><button class="btn" data-a="csend" ${list.length&&!c.busy?'':'disabled style="opacity:.45"'}>${c.busy?'Sending…':(c.when==='Now'?'Send to':'Schedule for')+' '+list.length+' guest'+(list.length===1?'':'s')}</button><p class="sent" style="margin:0">Only guests who agreed to offers are counted.${LIVE_INT.whatsapp||c.ch==='email'?'':' WhatsApp is not connected yet, so messages are logged, not delivered.'}</p></div>`]}

/* ---------- community ---------- */
function vCommunity(){
  const T=tiers(),M=S.guests.filter(g=>!g.walkin),by=Object.fromEntries(T.map(t=>[t.id,M.filter(g=>tierOf(g).id===t.id)])),pts=M.reduce((s,g)=>s+points(g),0);
  const top=[...M].sort((a,b)=>b.spend-a.spend),me=top[0];
  return head('Community','Every guest gets a member card. Spending moves them up a tier, and each tier unlocks perks.',`<button class="btn ghost" data-a="tieradd" ${T.length>=5?'disabled':''}>Add tier</button>`)+
  `<div class="kpis"><div class="kpi"><b class="num">${M.length}</b><span>members</span></div>${T.slice(1).map(t=>`<div class="kpi"><b class="num">${by[t.id].length}</b><span>${esc(t.name)} members</span></div>`).join('')}<div class="kpi"><b class="num">${pts.toLocaleString('en-US')}</b><span>points earned</span></div></div>
  <div class="gp"><div><div class="tiers">${T.map((t,i)=>`<div class="tier"><i style="background:${t.color}"></i>${i?`<input class="search" style="margin:0 0 4px;font-weight:700" data-tier="${i}:name" value="${esc(t.name)}" aria-label="Tier name" maxlength="30">`:`<h3>${esc(t.name)}</h3>`}<span class="mute num" style="font-size:14px">${by[t.id].length} members</span>${i?`<label class="f" style="margin-top:12px">From total spend<input type="number" step="5000" value="${t.min}" data-tier="${i}:min" inputmode="numeric"></label>`:'<p class="mute" style="font-size:14px;margin:12px 0 0">Everyone who books or buys a ticket</p>'}<label class="f" style="margin-top:10px">Perks<textarea rows="3" data-tier="${i}:perks" placeholder="One perk per line">${esc(t.perks)}</textarea></label>${i?`<button class="chip" data-a="tierdel" data-v="${i}" style="margin-top:8px">Remove tier</button>`:''}</div>`).join('')}</div>
  <div class="bigbox" style="margin-top:16px"><h3>Top members</h3>${top.slice(0,6).map(g=>{const t=tierOf(g),nx=T[T.indexOf(t)+1];return `<div class="conn" style="cursor:pointer" data-a="guest" data-v="${g.id}"><div style="min-width:0;flex:1"><b>${esc(g.name)}</b> <span class="tag" style="background:${t.color};color:var(--chipink)">${esc(t.name)}</span><div class="meter" style="margin:6px 0 0;height:8px"><i style="width:${nx?Math.min(100,g.spend/nx.min*100):100}%"></i></div></div><span class="mute num" style="font-size:14px;margin-left:12px">${points(g).toLocaleString('en-US')} pts</span></div>`}).join('')||'<div class="empty">Members show up here after their first booking or ticket.</div>'}<p class="hint">1 point for every EGP 100 spent on tables, orders and tickets.</p></div></div>
  ${me?memberPhone(me):''}</div>`;
}
function memberPhone(g){const VV=VENUES[S.vi],T=tiers(),t=tierOf(g),nx=T[T.indexOf(t)+1],up=S.events.filter(e=>e.status==='on sale'||e.status==='live').slice(0,3);
  return `<div><div class="phone"><div class="screen" style="--vc:${VV.color}"><div class="sbar"><span>9:41</span><span>●●● 5G</span></div><div class="gscroll"><div class="gbody">
  <div class="mcard" style="--tc:${t.color}">${BIGX('px')}<span>${esc(VV.name)}</span><b>${esc(g.name)}</b><div class="mrow"><span><small>Tier</small>${esc(t.name)}</span><span><small>Points</small>${points(g).toLocaleString('en-US')}</span></div></div>
  ${nx?`<div><div class="sum" style="font-size:13px"><span>${egp(nx.min-g.spend)} more to ${esc(nx.name)}</span></div><div class="meter"><i style="width:${Math.min(100,g.spend/nx.min*100)}%;background:var(--vc)"></i></div></div>`:''}
  ${t.perks?`<div class="gcard"><div class="gch">Your perks</div><div style="font-size:14px">${esc(t.perks)}</div></div>`:''}
  <div><div class="lbl">Coming up</div>${up.map(e=>`<a class="tkrow" href="/e/${e.id}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none"><div><b>${esc(e.name)}</b><br><span style="font-size:13px;color:#5b6280">${esc(e.night)}</span></div><span class="pill" style="background:var(--vc);color:#fff">Tickets</span></a>`).join('')||'<p style="font-size:13px;color:#5b6280;margin:0">No events on sale right now.</p>'}</div>
  ${g.ref?`<div class="gcard"><div class="gch">Bring a friend</div><div style="font-size:14px">Share your code <b>${esc(g.ref)}</b> with friends when they book.</div></div>`:''}
  </div></div></div></div><p class="hint" style="text-align:center">What ${esc(g.name.split(' ')[0])} sees when they log in on your booking or ticket page.</p></div>`}

/* ---------- growth actions ---------- */
/** An ISO time for a Cairo night and minutes after midnight (handles summer time). */
function cairoISO(ymd,min){let t=Date.parse(ymd+'T00:00:00Z')+min*6e4-2*36e5;const loc=()=>{const [h,m]=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(t).split(':').map(Number);return h*60+m};if(loc()!==min%1440)t-=36e5;return new Date(t).toISOString()}
const saveEvMap=e=>later('evmap'+e.id,async()=>{await PUT(vurl(`/events/${e.id}/map`),{zones:eventToZones(e)});delete PEV[e.id];await refresh()},700);
const saveTiers=()=>later('tiers',()=>PUT(vurl('/tiers'),{tiers:tiers().map(t=>({name:t.name.trim()||'Tier',minSpend:E2P(t.min),perks:t.perks.split(/\n|,\s*/).map(s=>s.trim()).filter(Boolean).slice(0,20),color:t.color}))}).then(()=>refresh()),900);
async function loadSales(id){loadInvites(id);loadOrders(id);loadWait(id);try{const r=await GET(vurl(`/events/${id}/sales`));S.sales=S.sales||{};S.sales[id]=r;render()}catch(_){}}
async function loadOrders(id){try{const r=await GET(vurl(`/events/${id}/orders`));S.evOrders=S.evOrders||{};S.evOrders[id]=r;render()}catch(_){}}
async function loadWait(id){try{const r=await GET(vurl(`/events/${id}/waitlist`));S.wait=S.wait||{};S.wait[id]=r;render()}catch(_){}}
async function loadInvites(id){try{const r=await GET(vurl(`/events/${id}/invites`));S.invites=S.invites||{};S.invites[id]=r;render()}catch(_){}}
const GACT={
ev:v=>{S.evSel=v;S.evp=newEVP();render();$('#main').scrollTop=0;loadSales(v)},
evback:()=>{S.evSel=null;render()},
evpub:v=>act(()=>PATCH(vurl(`/events/${v}`),{status:'published'}).then(r=>{delete PEV[v];return r}),'On sale. Your ticket page is live.'),
evpause:v=>act(()=>PATCH(vurl(`/events/${v}`),{status:'draft'}).then(r=>{delete PEV[v];return r}),'Sales paused. The page shows "Not on sale yet".'),
newev:()=>openSheet({k:'newev'}),
newcamp:()=>{const e=S.events.find(x=>x.status==='on sale'||x.status==='live');S.camp={name:'Weekend at '+VENUES[S.vi].name,ch:'wa',seg:'all',subject:'This weekend at {venue}',text:e?`Hi {first_name}, ${e.name} is on ${e.night.replace('Tonight · ','')} at {venue}. Get your tickets before they sell out.`:'Hi {first_name}, this weekend at {venue}. Tables are going fast, book yours now.',link:e?e.id:'book',when:'Now',busy:false};openSheet({k:'camp'})},
cch:v=>{S.camp.ch=v;openSheet({k:'camp'},true)},
cwhen:v=>{S.camp.when=v;openSheet({k:'camp'},true)},
cvar:v=>{S.camp.text+=(S.camp.text.endsWith(' ')?'':' ')+v;openSheet({k:'camp'},true)},
csend:async()=>{const c=S.camp;if(c.busy)return;const n=reach(c.seg,c.ch).length,link=campLink(c),at=WHEN().find(([k])=>k===c.when)?.[1]||null;c.busy=true;openSheet({k:'camp'},true);
  const r=await act(async()=>{const cp=await POST(vurl('/campaigns'),{name:c.name.trim()||'Campaign',channel:c.ch==='wa'?'whatsapp':'email',...(c.ch==='email'?{subject:c.subject}:{}),body:c.text+(link?'\n'+link:''),segment:{key:c.seg,...SEGKEY[c.seg]},scheduledAt:at?at.toISOString():null});
    return at?cp:POST(vurl(`/campaigns/${cp.id}/send`))},r=>at?`Scheduled for ${c.when}.`:`Sent to ${r.sentCount} guest${r.sentCount===1?'':'s'}.`);
  c.busy=false;if(r)closeSheet();else openSheet({k:'camp'},true)},
drtoggle:()=>{const d=DR();d.on=!d.on;drSave(d);render()},
drch:v=>{const d=DR();d.channel=v;drSave(d);render()},
drtest:async()=>{try{const r=await POST(vurl('/daily-report/test'),{});{const to=[...(r.emails||[]),...(r.phones||[])];toast(to.length?`Sent to ${to.join(', ')}.`:'Nowhere to send it yet. Add an email or a number first.')}}catch(e){toast(e.message)}},
auto:v=>{const a=S.autos.find(x=>x.k===v);a.on=!a.on;CFG().autos[v]=a.on;saveSettings({automations:{...CFG().autos}},'autos');render()},
tieradd:()=>{const T=tiers(),last=T[T.length-1];T.push({id:'new'+Date.now(),name:'New tier',min:(last?.min||0)+100000,perks:'',color:TIERCOL[T.length%TIERCOL.length]});render();saveTiers()},
tierdel:v=>{tiers().splice(+v,1);render();saveTiers()},
bttg:v=>{const bt=EVL(S.evSel).batches.find(b=>b.id===v),on=bt.on===false;act(()=>PATCH(vurl(`/promos/batch/${v}`),{active:on}),`${bt.name} ${on?'is live':'paused'}`)},
btdel:v=>{const bt=EVL(S.evSel).batches.find(b=>b.id===v);act(()=>DEL(vurl(`/promos/batch/${v}`)),`${bt.name} deleted`)},
btopen:v=>{S.batchOpen=S.batchOpen===v?null:v;render()},
zsold:v=>{const [id,zid]=v.split(':'),e=EVL(id),t=[...e.types.map(t=>({...t,id:t.zid,ref:t})),...e.tz.map(z=>({...z,ref:z})),...e.layout.filter(b=>b.kind==='block').map(b=>({id:b.id,name:b.name,ref:b}))].find(x=>x.id===zid);if(!t)return;const on=!t.ref.closed;t.ref.closed=on;render();
  act(()=>PATCH(vurl(`/events/${id}/zones/${zid}`),{soldOut:on}).then(r=>{delete PEV[id];return r}),on?`${t.name} now shows as sold out`:`${t.name} is on sale again`,{reload:false}).then(r=>{if(!r){t.ref.closed=!on}render()})},
invnew:v=>{const e=EVL(v);if(!S.inv||S.inv.ev!==v)S.inv=newInv(e);openSheet({k:'invite'})},
invmode:v=>{S.inv.bulk=v==='list';openSheet({k:'invite'},true)},
invseat:v=>{const e=EVL(S.inv.ev);if(!e)return;const box=document.querySelector('#sheet .smap'),el=box?.querySelector(`[data-v="${v}"]`);
  if(box&&el&&v!==S.inv.seat&&SM.scaleOf(box)*SM.R<5){const c=el.tagName==='circle'?el:el.querySelector('circle');SM.zoomTo(box,+c.getAttribute('cx'),+c.getAttribute('cy'),Math.max(2.2,7/(SM.scaleOf(box)*SM.R)));return}
  const x=seatOf(e,v);if(x)S.inv.zone=x.b.id;S.inv.seat=v;openSheet({k:'invite'},true)},
invqty:v=>{S.inv.qty=Math.max(1,Math.min(20,S.inv.qty+ +v));openSheet({k:'invite'},true)},
invvia:v=>{S.inv.via=v;openSheet({k:'invite'},true)},
invresend:v=>{const [id,oid]=v.split(':');act(()=>POST(vurl(`/events/${id}/invites/${oid}/resend`),{}),'Invitation sent again',{reload:false})},
orefund:v=>{const [ev,id]=v.split(':');S.refund={ev,id,fees:true,busy:false};openSheet({k:'refund'})},
rffees:v=>{S.refund.fees=v==='true';openSheet({k:'refund'},true)},
oall:()=>{S.oall=true;render()},
wtell:v=>{const [ev,id]=v.split(':');act(()=>POST(vurl(`/events/${ev}/waitlist/${id}/notify`),{}),'Message sent',{reload:false}).then(()=>loadWait(ev))},
wdel:v=>{const [ev,id]=v.split(':');act(()=>DEL(vurl(`/events/${ev}/waitlist/${id}`)),'Removed from the waitlist',{reload:false}).then(()=>loadWait(ev))},
invcancel:v=>{const [id,oid]=v.split(':');if(S.invKill!==oid){S.invKill=oid;render();setTimeout(()=>{if(S.invKill===oid){S.invKill=null;render()}},4000);return}
  S.invKill=null;act(()=>DEL(vurl(`/events/${id}/invites/${oid}`)),'Invitation cancelled. Its QR codes no longer work.').then(()=>{loadSales(id)})},
btcopy:v=>{const t=EVL(S.evSel).promos.filter(p=>p.batch===v).map(p=>p.code).join('\n');try{navigator.clipboard.writeText(t)}catch(_){}toast('Codes copied. Send one to each guest.')},
protg:v=>{const p=EVL(S.evSel).promos.find(x=>x.id===v),on=p.on===false;act(()=>PATCH(vurl(`/promos/${v}`),{active:on}),`${p.code} ${on?'is live':'paused'}`)},
prodel:v=>{const p=EVL(S.evSel).promos.find(x=>x.id===v);act(()=>DEL(vurl(`/promos/${v}`)),`${p.code} deleted`)}
};
Object.assign(ACT,PAGEACT,GACT,EVACT,ACCACT);
ACT.evdone=()=>{const id=S.edEvent;S.edEvent=null;S.sel=null;VIEW='events';S.evSel=id;S.evp=newEVP();render();$('#main').scrollTop=0};
function growthSheet(d){
  if(d.k==='camp')return campSheet();
  if(d.k==='invite')return inviteSheet();
  if(d.k==='refund')return refundSheet();
  if(d.k==='newev'){const nights=Array.from({length:21},(_,i)=>addDays(nightYmd(),i));
    return ['New event',`<form id="newev" class="stack" style="margin-top:0"><label class="f">Event name<input id="evname" required minlength="2" placeholder="Saturday Rooftop" autocomplete="off"></label><div class="two"><label class="f">Night<select id="evnight">${nights.map(n=>`<option value="${n}">${dparts(n).slice(0,3).join(' ')}</option>`).join('')}</select></label><label class="f">Doors<select id="evdoors">${[20*60,21*60,22*60,23*60].map(m=>`<option value="${m}" ${m===22*60?'selected':''}>${t12(m)}</option>`).join('')}</select></label></div><label class="f">Line-up<input id="evline" placeholder="DJ names, music" autocomplete="off" maxlength="200"></label><h3 style="margin-top:6px">Tickets</h3>${[['Early bird',500,100],['Regular',800,200],['',0,0]].map(([n,p,q],i)=>`<div class="three"><input class="search" style="margin:0" id="tn${i}" value="${n}" placeholder="Type name" autocomplete="off" aria-label="Ticket name"><input class="search" style="margin:0" id="tp${i}" type="number" min="0" value="${p||''}" placeholder="Price" inputmode="numeric" aria-label="Price"><input class="search" style="margin:0" id="tq${i}" type="number" min="0" value="${q||''}" placeholder="Qty" inputmode="numeric" aria-label="Quantity"></div>`).join('')}
      <label class="chk"><input type="checkbox" id="evpubnow" checked>Put on sale right away</label><button class="btn" type="submit">Create event</button><p class="sent" style="margin:0">You get a ticket page with your logo, a QR per guest and Paymob checkout. Tables and zones are added on the seat map, you can change them after.</p></form>`]}
}
document.addEventListener('input',e=>{const el=e.target;if(!S)return;
  if(el.dataset.camp&&el.tagName!=='SELECT'){const k=el.dataset.camp,pos=el.selectionStart;S.camp[k]=el.value;openSheet({k:'camp'},true);const n=$(`#sheet [data-camp="${k}"]`);if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch(_){}}}
  if(el.dataset.evh){const [i,k]=el.dataset.evh.split(':');S.evp.holders[+i][k]=fv(el)}
  if(el.dataset.wl&&S.evp?.wl)S.evp.wl[el.dataset.wl]=fv(el);
  if(el.dataset.inv&&S.inv&&el.tagName!=='SELECT')S.inv[el.dataset.inv]=fv(el);
  if(el.id==='oq'){S.oq=el.value;const pos=el.selectionStart;render();const n=$('#oq');if(n){n.focus();try{n.setSelectionRange(pos,pos)}catch(_){}}}
  if(el.dataset.acc&&ACCT.user)ACCT.user[el.dataset.acc]=el.value;
  if(el.dataset.tier){const [i,k]=el.dataset.tier.split(':');tiers()[+i][k]=k==='min'?Math.max(0,+el.value||0):el.value;saveTiers()}
});
document.addEventListener('change',e=>{const el=e.target;if(!S)return;
  if(el.dataset.camp&&el.tagName==='SELECT'){S.camp[el.dataset.camp]=el.value;openSheet({k:'camp'},true)}
  if(el.dataset.evp==='consent')S.evp.consent=el.checked;
  if(el.dataset.bk==='numDir'){const x=EL(S.sel);if(x){x.numDir=el.value;drawMap();saveFloor()}}
  if(el.dataset.bk==='free'){const x=EL(S.sel);if(x){if(Object.values(x.seatIds||{}).some(id=>V().ev.soldT.includes(id))||x.left!=null&&x.left<SM.blockSeats(x).length&&!x.free){el.checked=!!x.free;toast('This section already has guests. Change it before inviting or selling.');return}x.free=el.checked;render();saveFloor()}}
  if(el.dataset.evh&&el.tagName==='SELECT'){const [i,k]=el.dataset.evh.split(':');S.evp.holders[+i][k]=fv(el)}
  if(el.dataset.wl&&S.evp?.wl)S.evp.wl[el.dataset.wl]=fv(el);
  if(el.dataset.inv&&S.inv){const k=el.dataset.inv;S.inv[k]=fv(el);if(k==='zone'){S.inv.seat='';S.inv.qty=1;openSheet({k:'invite'},true)}}
  if(el.dataset.acc&&ACCT.user)ACCT.user[el.dataset.acc]=el.value;
  if(el.dataset.pro){const off=Math.max(1,Math.min(100,Math.round(+el.value||1)));act(()=>PATCH(vurl(`/promos/${el.dataset.pro}`),{percentOff:off}),`Now ${off>=100?'a free ticket':off+'% off'}`)}
  if(el.dataset.tzp){const [id,z]=el.dataset.tzp.split(':'),ev=EVL(id);tz(ev,z).price=Math.max(0,+el.value||0);saveEvMap(ev)}
  if(el.dataset.tq){const [id,i]=el.dataset.tq.split(':'),ev=EVL(id),t=ev.types[+i],k=el.dataset.k||'qty';if(k==='price')t.price=Math.max(0,+el.value||0);else t.qty=Math.max(t.sold,+el.value||t.sold);saveEvMap(ev)}
  if(el.dataset.tier&&el.dataset.tier.endsWith(':min'))render();
});
document.addEventListener('submit',async e=>{const f=e.target;if(!S)return;
  if(f.id==='rfform'){e.preventDefault();const R=S.refund;if(R.busy)return;R.busy=true;openSheet({k:'refund'},true);
    const r=await act(()=>POST(vurl(`/events/${R.ev}/orders/${R.id}/refund`),{fees:R.fees,...($('#rfreason')?.value.trim()?{reason:$('#rfreason').value.trim()}:{})}),
      r=>r.method==='paymob'?`Refunded ${egp2(r.refunded/100)} to the guest's card`:`Marked refunded. Give ${egp2(r.refunded/100)} back to the guest.`);
    R.busy=false;if(r){closeSheet();S.refund=null;loadSales(R.ev);delete PEV[R.ev]}else openSheet({k:'refund'},true);return}
  if(f.id==='invform'){e.preventDefault();const I=S.inv,ev=EVL(I.ev);if(I.busy)return;
    if(I.via!=='email'&&!telOk(I.phone)){toast('Add a valid WhatsApp number');return}
    const ch=I.via==='both'?['whatsapp','email']:[I.via],X=invPlaces(ev).find(x=>x.id===I.zone),Z=X&&(X.kind==='table'||X.kind==='seat');
    I.busy=true;openSheet({k:'invite'},true);
    const r=await act(()=>POST(vurl(`/events/${ev.id}/invites`),{zoneId:I.zone,...(Z?{seatId:I.seat}:{qty:I.qty}),firstName:I.first.trim(),lastName:I.last.trim(),
      ...(I.via!=='email'?{phone:I.phone}:{}),...(I.via!=='whatsapp'?{email:I.email.trim()}:{}),channels:ch,...(I.note.trim()?{note:I.note.trim()}:{})}),
      r=>`Invitation sent to ${I.first.trim()}${r.tickets>1?` for ${r.tickets} people`:''}${r.place?' · '+r.place:''}`);
    I.busy=false;if(r){closeSheet();S.inv=null;loadSales(ev.id)}else openSheet({k:'invite'},true);return}
  if(f.id==='invbulk'){e.preventDefault();const I=S.inv,ev=EVL(I.ev);if(I.busy)return;const P=parseList(I.list);if(!P.ok.length||P.bad.length)return;
    const ch=I.via==='both'?['whatsapp','email']:[I.via];I.busy=true;openSheet({k:'invite'},true);
    const r=await act(()=>POST(vurl(`/events/${ev.id}/invites/bulk`),{zoneId:I.zone,people:P.ok,channels:ch,...(I.note.trim()?{note:I.note.trim()}:{})}),r=>`${r.invited} invitations sent`);
    I.busy=false;if(r){closeSheet();S.inv=null;loadSales(ev.id)}else openSheet({k:'invite'},true);return}
  if(f.id==='gencodes'){e.preventDefault();const ev=EVL(S.evSel),n=Math.max(1,Math.min(500,Math.round(+$('#gn').value||1))),off=Math.max(1,Math.min(100,Math.round(+$('#goff').value||0))),per=+$('#gper').value||1,guest=telRead('gguest'),name=$('#gname').value.trim()||'Batch '+((ev.batches||[]).length+1);
    const r=await act(()=>POST(vurl('/promos/batch'),{eventId:ev.id,count:n,percentOff:off,usesPerCode:per,label:name,prefix:(name.replace(/[^A-Za-z]/g,'').slice(0,4)||'XT').toUpperCase()+'-',...(guest?{lockedPhone:guest}:{})}),r=>`${r.created} unique code${r.created>1?'s':''} ready`);if(r){S.batchOpen=r.batchId;render()}}
  if(f.id==='promo'){e.preventDefault();const c=$('#pcode').value.trim().toUpperCase().replace(/[^A-Z0-9_-]/g,''),ev=EVL(S.evSel),off=Math.max(1,Math.min(100,Math.round(+$('#poff').value||0))),lim=Math.max(0,Math.round(+$('#plim').value||0))||null;if(c.length<3){toast('Codes need at least 3 letters or numbers');return}
    act(()=>POST(vurl('/promos'),{code:c,eventId:ev.id,percentOff:off,maxUses:lim}),`${c} is live: ${off>=100?'free ticket':off+'% off'}`)}
  if(f.id==='newev'){e.preventDefault();const types=[0,1,2].map(i=>({name:$('#tn'+i).value.trim(),price:Math.max(0,+$('#tp'+i).value||0),qty:Math.max(0,+$('#tq'+i).value||0),sold:0})).filter(t=>t.name&&t.qty);
    if(!types.length){toast('Add at least one ticket type with a quantity');return}
    const btn=f.querySelector('button[type=submit]');btn.disabled=true;btn.textContent='Creating…';
    const title=val('evname')||'New event',startsAt=cairoISO($('#evnight').value,+$('#evdoors').value),pub=$('#evpubnow').checked;
    const r=await act(async()=>{const cr=await POST(vurl('/events'),{title,startsAt,lineup:val('evline'),color:ZCOLS[S.events.length%ZCOLS.length],seatMap:true});
      const ev=defaultEventLayout({id:cr.id,types:types.map((t,i)=>({...t,name:t.name})),tz:[],layout:[]});
      await PUT(vurl(`/events/${cr.id}/map`),{zones:eventToZones(ev)});if(pub)await PATCH(vurl(`/events/${cr.id}`),{status:'published'});return cr},pub?'Event created. Ticket page is live.':'Event created as a draft.');
    if(r){closeSheet();S.evSel=r.id;S.evp=newEVP();VIEW='events';render();loadSales(r.id)}else{btn.disabled=false;btn.textContent='Create event'}}
});
const ro=new ResizeObserver(()=>{const m=$('#map');if(m)m.innerHTML=mapSVG(m.clientWidth<560)});

/* ================= guest pages: /book/:slug /b/:code /e/:id /o/:code /t/:token /p/:token /me /paid ================= */
let GUEST=null;
function passScreen(p){const night=p.type==='ticket'?new Date(p.startsAt).toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short',timeZone:TZ}):dparts(p.date).slice(0,3).join(' ');
  const qr=location.origin+location.pathname;
  return `<div class="gbody"><div class="wpass" style="--pc:#2e3192"><div class="pass-h"><b>${esc(p.venue)}</b><span>${esc(p.type==='ticket'?p.ticketType:'Table booking')}</span></div><div class="pt"><small>${p.type==='ticket'?'Event':'Booking'}</small><b>${esc(p.type==='ticket'?p.event:p.venue)}</b></div><div class="pr"><div><small>Date</small>${esc(night)}</div><div><small>${p.type==='ticket'?'Doors':'Time'}</small>${esc(p.type==='ticket'?t12((()=>{const [h,m]=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(p.startsAt)).split(':').map(Number);return h*60+m})()):t12(hm2min(p.time.split(' ')[0])))}</div></div><div class="pr"><div><small>Guest</small>${esc(p.name)}</div><div><small>Status</small>${p.used?'Checked in':'Valid'}</div></div>${placeBoxes(p)}<div class="pq"><span>${qrSVG(qr)}</span><small>Show this at the door</small></div></div>
  ${p.googleWalletUrl||p.appleWallet?.configured?`<div class="wallets">${p.appleWallet?.configured?`<a class="wbtn" href="${esc(p.appleWallet.url)}"><svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="5" width="18" height="14" rx="3" fill="#fff"/><rect x="3" y="8" width="18" height="3" fill="#ff5f57"/><rect x="3" y="11" width="18" height="3" fill="#febc2e"/><rect x="3" y="14" width="18" height="3" fill="#28c840"/></svg><span><small>Add to</small>Apple Wallet</span></a>`:''}${p.googleWalletUrl?`<a class="wbtn" href="${esc(p.googleWalletUrl)}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" width="20" height="20"><rect x="3" y="5" width="18" height="14" rx="3" fill="#4285f4"/><rect x="3" y="9" width="18" height="3" fill="#34a853"/><rect x="3" y="12" width="18" height="3" fill="#fbbc04"/><rect x="3" y="15" width="18" height="4" rx="1" fill="#ea4335"/></svg><span><small>Add to</small>Google Wallet</span></a>`:''}</div>`:''}
  ${findSeat(p)}
  <p style="margin:0;font-size:13px;color:#5b6280;text-align:center">Keep this link. Screenshots work too.</p></div>`}
/** Section / Row / Seat (or Table) in big type on the pass, like a boarding pass. */
function placeBoxes(p){const cell=(l,v)=>`<div><small>${l}</small><b>${esc(v)}</b></div>`;
  if(p.type==='ticket'&&p.seat&&p.zoneKind==='seated'){const [row,num]=p.seat.split('-');return `<div class="pseat">${cell('Section',p.ticketType)}${cell('Row',row)}${cell('Seat',num||p.seat)}</div>`}
  if(p.type==='ticket'&&p.zoneKind==='seated')return `<div class="pseat">${cell('Section',p.ticketType)}${cell('Seating','Free')}</div>`;
  if(p.type==='ticket'&&p.seat)return `<div class="pseat">${cell('Zone',p.ticketType)}${cell('Table',p.seat)}</div>`;
  if(p.type==='ticket')return `<div class="pseat">${cell('Zone',p.ticketType)}${cell('Entry','Standing')}</div>`;
  if(p.map)return `<div class="pseat">${cell('Area',p.map.area||'Main')}${cell('Table',p.map.table)}</div>`;return ''}
/** The map with a walking line from the entrance to this pass's seat, table or zone. */
function findSeat(p){if(!p.map)return '';
  let ev,target,what='';
  if(p.type==='ticket'){ev=eventFrom({id:'pass',title:'',startsAt:p.startsAt,status:'published',zones:p.map.zones,seats:p.map.seats});
    const z=p.map.zones.find(z=>z.id===p.map.zoneId)||{};
    if(z.kind==='seated')target={block:z.id,seat:p.map.seatId};
    else if(z.kind==='table'){target={table:p.map.seatId,area:z.id};what=`Your table is <b>${esc(p.seat||'')}</b> in ${esc(z.name)}.`}
    else{target={type:ev.types.findIndex(t=>t.zid===z.id)};what=`Your zone is <b>${esc(z.name)}</b>. Stand anywhere inside it.`}}
  else{const {layout,areas}=floorToLayout(p.map.items);ev={layout,types:[],tz:areas.map(a=>({id:a.id,name:a.name}))};target={table:p.map.tableId};what=`Your table is <b>${esc(p.map.table)}</b>${p.map.area?' in '+esc(p.map.area):''}.`}
  if(!ev.layout.length)return '';
  const key='pass:'+(location.pathname.split('/').pop()||'');
  if(!GUEST.route||GUEST.routeKey!==key){GUEST.route=SM.route(ev,target);GUEST.routeKey=key}
  const R=GUEST.route;
  const zoneOf=p.type==='ticket'?t=>evArea(ev,t):t=>areaOf2(t,ev.layout,areas2(ev));
  const map=SM.frame(key,ev,{mode:'route',target,route:R?.points,zoneOf,focus:R?.points,label:'Map with the way to your place'});
  return `<div class="findseat"><div class="fsh"><b>Find your ${p.type==='ticket'&&p.zoneKind==='standing'?'zone':p.type==='ticket'&&p.zoneKind==='seated'?'seat':'table'}</b><span>Follow the blue line from the entrance</span></div>${map}<ol class="fsteps">${SM.steps(R,what).map(x=>`<li><span>${x}</span></li>`).join('')}</ol></div>`}
const areas2=ev=>(ev.tz||[]).map(z=>({id:z.id,name:z.name}));
function orderScreen(o){const e=PEV[o.eventId],P=o.status;
  const head2=e?`${poster(e)}<div class="gbody" style="padding-bottom:0"><h2 style="font-size:22px">${esc(e.name)}</h2><p style="margin:0;color:#5b6280">${esc(e.night.replace('Tonight · ',''))} · doors ${e.doors} · ${esc(e.venue.name)}</p></div>`:'';
  const body=P==='paid'?`<div class="gbody"><div style="display:flex;justify-content:space-between;align-items:center"><h3 style="font-size:20px">Your tickets</h3><span class="pill p-arrived">Paid</span></div>${o.tickets.map(t=>`<a class="tkrow" href="${esc(t.url)}" style="color:inherit;text-decoration:none"><div><b>${esc(t.name)}</b><br><span style="font-size:13px;color:#5b6280">Open ticket and QR</span></div><span>›</span></a>`).join('')}<div class="amount" style="font-size:14px"><div class="sum"><span>Tickets</span><span class="num">${egp2(o.totals.tickets/100)}</span></div>${o.totals.discount?`<div class="sum"><span>Promo ${esc(o.promo||'')}</span><span class="num">−${egp2(o.totals.discount/100)}</span></div>`:''}<div class="sum"><span>Fees and VAT</span><span class="num">${egp2((o.totals.fee+o.totals.feeVat)/100)}</span></div><div class="sum"><b>Total</b><b class="num">${egp2(o.totals.total/100)}</b></div></div><p style="margin:0;font-size:13px;color:#5b6280">Order ${o.code}. Every guest also got their own ticket by WhatsApp and email.</p></div>`
    :P==='held'?`<div class="gdone"><h2 style="font-size:22px">Waiting for payment</h2><p style="margin:0;color:#5b6280">Your tickets are held for ${mmss(o.secondsLeft)}. This page updates by itself.</p></div>`
    :`<div class="gdone"><h2 style="font-size:22px">${P==='expired'?'Time ran out':'Order '+esc(P)}</h2><p style="margin:0;color:#5b6280">These tickets were released and you were not charged.</p>${e?`<a class="gbtn" href="/e/${o.eventId}" style="text-decoration:none;text-align:center">Back to the event</a>`:''}</div>`;
  return head2+body}
function guestShell(inner,color='#12153f'){return `<div class="phone"><div class="screen" style="--vc:${esc(color)}"><div class="gscroll" id="gscroll">${inner}</div></div></div>`}
function guestView(){const G2=GUEST;
  if(G2.err)return guestShell(`<div class="gdone"><h2 style="font-size:22px">Not found</h2><p style="margin:0;color:#5b6280">${esc(G2.err)}</p></div>`);
  if(G2.kind==='book'||G2.kind==='status')return G2.slug?guestPhone():guestShell('<div class="loading">Loading…</div>');
  if(G2.kind==='event'){const e=PEV[G2.eventId];return e?evPhone(e):guestShell('<div class="loading">Loading…</div>')}
  if(G2.kind==='order')return G2.order?guestShell(orderScreen(G2.order)):guestShell('<div class="loading">Loading…</div>');
  if(G2.kind==='pass')return G2.pass?guestShell(passScreen(G2.pass)):guestShell('<div class="loading">Loading…</div>');
  if(G2.kind==='me'){if(!ACCT.view)ACCT.view=ACCT.user?'home':'login';return guestShell(`<div class="evtop"><span class="vlogo mono" style="width:38px;height:38px;font-size:15px">X</span><b>Your XTRA account</b></div>${acctScreen()}`)}
  if(G2.kind==='paid')return guestShell(`<div class="gdone"><h2 style="font-size:24px">Payment received</h2><p style="margin:0;color:#5b6280">Thank you. You can close this page.</p></div>`);
  return guestShell('');
}
async function bootGuest(path){
  const [,k,a]=path.split('/');document.body.classList.add('guestmode');$('#guest').hidden=false;
  VENUES=[];S={vi:0,gp:newGP(),evp:newEVP(),sheet:null,events:[],bookings:[],guests:[],orders:{}};
  const map={book:'book',b:'status',e:'event',o:'order',t:'pass',p:'pass',me:'me',paid:'paid'};GUEST={kind:map[k]||'paid'};if(GUEST.kind==='book')GUEST.slug=decodeURIComponent(a);
  await loadMe();render();
  try{
    if(GUEST.kind==='status'){const st=await pubGet(`/bookings/${a}`);GUEST.slug=st.venue.slug;S.gp.code=st.code;S.gp.step='status';S.gp.st=st;loadStatus()}
    if(GUEST.kind==='event'){GUEST.eventId=a;await loadPubEvent(a);document.title=PEV[a].name}
    if(GUEST.kind==='order'){const o=await pubGet(`/orders/${a}`);GUEST.order=o;GUEST.eventId=o.eventId;loadPubEvent(o.eventId).then(render).catch(()=>{});
      if(o.status==='held'){const tick=async()=>{try{GUEST.order=await pubGet(`/orders/${a}`);render();if(GUEST.order.status==='held')setTimeout(tick,3000)}catch(_){}};setTimeout(tick,3000)}}
    if(GUEST.kind==='pass'){GUEST.pass=await pubGet(`/pass/${a}`)}
  }catch(e){GUEST.err=e.status===404||e.status===400?'This link is not valid any more.':e.message}
  render()}


/* ================= XTRA admin: venues, features, roles, accounts ================= */
const FEAT_INFO=[['reservations','Reservations','Booking page, bookings, door check-in'],['ordering','Ordering and bills','Orders by table, bills with minimum spend'],['ticketing','Tickets and events','Ticket pages, seat maps, promo codes'],['marketing','Marketing','WhatsApp and email campaigns, automatic messages'],['guests','Guest list','Guest profiles, notes and tags'],['community','Community','Member tiers, points and perks']];
const PERM_INFO=[['floor','Floor','Tonight\'s map and tables'],['bookings','Bookings','Accept, decline and add bookings'],['door','Door','Scan passes and tickets, check guests in'],['orders','Orders and bills','Take orders, close bills'],['events','Events','Events, ticket prices, promo codes'],['marketing','Marketing','Send campaigns'],['guests','Guests','Guest list, notes and tags'],['community','Community','Tiers and points'],['editor','Floor map','Draw and change the floor map'],['setup','Venue setup','Slots, areas, booking page, logo'],['staff','Staff and roles','Add staff, make roles'],['reports','Reports','Money, bookings, no-shows, top guests'],['messages','Messages','WhatsApp chats with guests, message history']];
const PERM_FEAT={bookings:'reservations',door:'reservations',orders:'ordering',events:'ticketing',marketing:'marketing',guests:'guests',community:'community'};
const BUILTIN=[['owner','Owner'],['manager','Manager'],['door','Door'],['waiter','Waiter']];
/** Options for a role picker: built-in roles, then the venue's own roles (value "r:<id>"). */
function roleOptions(R,cur){const own=(R?.roles||[]);
  return BUILTIN.filter(([k])=>k!=='owner'||cur==='owner'||ME.user.isSuperAdmin||VENUES[S.vi]?.role==='owner').map(([k,l])=>`<option value="${k}" ${cur===k?'selected':''}>${l}${R?.builtIn?': '+R.builtIn[k].length+' screens':''}</option>`).join('')
  +(own.length?`<optgroup label="This venue's roles">${own.map(r=>`<option value="r:${r.id}" ${cur==='r:'+r.id?'selected':''}>${esc(r.name)}</option>`).join('')}</optgroup>`:'')}
const roleValue=v=>v.startsWith('r:')?{roleId:v.slice(2)}:{role:v};
const roleKey=m=>m.roleId?'r:'+m.roleId:m.role;
function roleSelect(m,vid){const mine=m.userId===ME.user.id;
  return mine?`<span class="pill p-free">${esc(m.roleName||ROLE_NAME[m.role])} · you</span>`:`<span style="display:flex;gap:6px;align-items:center"><select class="rolesel" data-staffrole="${vid||''}:${m.userId}" aria-label="Role for ${esc(m.name)}">${roleOptions(vid?ADM.roles:S.roles,roleKey(m))}</select><button class="chip" data-a="staffdel" data-v="${vid||''}:${m.userId}" aria-label="Remove ${esc(m.name)}">Remove</button></span>`}

const ADM={venues:null,sel:null,roles:null,staff:null,busy:false,newRole:null};
async function admLoad(sel){try{ADM.venues=await GET('/admin/venues');ADM.sel=sel||ADM.sel||ADM.venues[0]?.id||null;if(ADM.sel)await admLoadVenue();render()}catch(e){toast(e.message)}}
async function admLoadVenue(){const id=ADM.sel;const [r,st]=await Promise.all([GET(`/venues/${id}/roles`),GET(`/venues/${id}/staff`)]);if(ADM.sel===id){ADM.roles=r;ADM.staff=st}}
const featChips=v=>FEAT_INFO.filter(([k])=>v.features.includes(k)).map(([,l])=>`<span class="tag">${l}</span>`).join('')||'<span class="mute" style="font-size:13px">No modules</span>';
function permGrid(sel,attr,features){return `<div class="permgrid">${PERM_INFO.map(([k,l,d])=>{const off=PERM_FEAT[k]&&!features.includes(PERM_FEAT[k]);return `<label class="perm ${off?'off':''}"><input type="checkbox" ${attr}="${k}" ${sel.includes(k)?'checked':''}><span><b>${l}</b><small>${off?'Module is off for this venue':d}</small></span></label>`}).join('')}</div>`}
function vAdmin(){
  if(!ME.user.isSuperAdmin)return head('XTRA admin','Only XTRA admins can open this.');
  if(!ADM.venues){admLoad();return head('XTRA admin','Loading…')}
  const V2=ADM.venues.find(v=>v.id===ADM.sel),R=ADM.roles;
  const list=`<div class="admlist">${ADM.venues.map(v=>`<button class="admv ${v.id===ADM.sel?'on':''}" data-a="admsel" data-v="${v.id}"><span class="admh"><b>${esc(v.name)}</b>${v.active?'':'<span class="pill p-pending">Paused</span>'}</span><span class="mute" style="font-size:13px">${esc(v.owners.map(o=>o.email).join(', ')||'No owner')} · ${v.staffCount} account${v.staffCount===1?'':'s'}</span><span class="tags">${featChips(v)}</span></button>`).join('')||'<div class="empty">No venues yet.</div>'}</div>`;
  let detail='<div class="bigbox empty">Pick a venue.</div>';
  if(V2){
    const feats=`<div class="bigbox"><h3>Modules</h3><p class="mute" style="font-size:14px;margin:4px 0 4px">What ${esc(V2.name)} pays for. Turned off modules disappear from their screens and their guest pages.</p>${FEAT_INFO.map(([k,l,d])=>{const on=V2.features.includes(k);return `<div class="conn"><div><b>${l}</b><div class="mute" style="font-size:14px">${d}</div></div><button class="toggle ${on?'on':''}" data-a="admfeat" data-v="${k}" role="switch" aria-checked="${on}" aria-label="${l}"></button></div>`}).join('')}
      <div class="conn"><div><b>Venue is live</b><div class="mute" style="font-size:14px">Paused venues can't sign in and their pages are closed.</div></div><button class="toggle ${V2.active?'on':''}" data-a="admactive" role="switch" aria-checked="${V2.active}" aria-label="Venue is live"></button></div></div>`;
    const roles=!R?'<div class="bigbox">Loading…</div>':`<div class="bigbox"><h3>Roles</h3><p class="mute" style="font-size:14px;margin:4px 0 10px">Pick exactly which screens each role opens. Built-in roles stay as they are.</p>
      <div class="builtin">${BUILTIN.map(([k,l])=>`<div><b>${l}</b><span class="mute">${R.builtIn[k].length===PERM_INFO.length?'Everything':R.builtIn[k].map(p=>PERM_INFO.find(x=>x[0]===p)[1]).join(', ')}</span></div>`).join('')}</div>
      ${R.roles.map(r=>`<div class="rolecard"><div class="roleh"><input class="search" style="margin:0;font-weight:700" data-rolename="${r.id}" value="${esc(r.name)}" aria-label="Role name" maxlength="40"><span class="mute" style="font-size:13px;white-space:nowrap">${r.staff} ${r.staff===1?'person':'people'}</span><button class="chip" data-a="roledel" data-v="${r.id}">Delete</button></div>${permGrid(r.permissions,`data-roleperm="${r.id}" data-p`,V2.features)}</div>`).join('')}
      ${ADM.newRole?`<form id="newrole" class="rolecard"><div class="roleh"><input class="search" style="margin:0;font-weight:700" id="nrname" required minlength="2" maxlength="40" placeholder="Role name, like Host or Cashier" autocomplete="off"></div>${permGrid(ADM.newRole,'data-np',V2.features)}<div style="display:flex;gap:8px"><button class="btn sm" type="submit">Save role</button><button class="btn ghost sm" type="button" data-a="rolecancel">Cancel</button></div></form>`:`<button class="btn ghost sm" data-a="roleadd" style="margin-top:6px">+ New role</button>`}</div>`;
    const accts=!ADM.staff?'<div class="bigbox">Loading…</div>':`<div class="bigbox"><h3>Accounts</h3><p class="mute" style="font-size:14px;margin:4px 0 6px">Everyone who signs in to ${esc(V2.name)}.</p>${ADM.staff.map(m=>`<div class="conn"><div style="min-width:0"><b>${esc(m.name)}</b><div class="mute" style="font-size:14px;overflow-wrap:anywhere">${esc(m.email)}</div></div>${roleSelect(m,V2.id)}</div>`).join('')||'<div class="empty">No accounts yet.</div>'}
      <h3 style="margin-top:18px">Add an account</h3><form id="admstaff" class="stack" style="margin-top:8px"><div class="two"><label class="f">Name<input id="asname" required minlength="2" autocomplete="off"></label><label class="f">Role<select id="asrole">${roleOptions(R,'manager')}</select></label></div><div class="two"><label class="f">Email<input id="asemail" type="email" required autocomplete="off"></label><label class="f">Password<input id="aspass" type="text" required minlength="8" autocomplete="off" placeholder="At least 8 characters"></label></div><button class="btn sm" type="submit">Add account</button></form></div>`;
    const i=ME.venues.findIndex(v=>v.id===V2.id);
    detail=`<div class="admd"><div class="admtop"><div><h2>${esc(V2.name)}</h2><span class="mute">${esc(location.host)}/book/${esc(V2.slug)}</span></div>${i>=0&&i!==S.vi?`<button class="btn ghost sm" data-a="setvenue" data-v="${i}">Open this venue</button>`:''}</div>${feats}${roles}${accts}</div>`;
  }
  return head('XTRA admin','Venues on XTRA: what each one has, its roles and its accounts.',`<button class="btn" data-a="admnew">New venue</button>`)+`<div class="adm">${list}${detail}</div>`;
}
const admPatch=async b=>{const r=await act(()=>PATCH(`/admin/venues/${ADM.sel}`,b),null,{reload:false});if(r){Object.assign(ADM.venues.find(v=>v.id===ADM.sel),r);ME=await GET('/auth/me');render()}return r};
const ADMACT={
admsel:v=>{ADM.sel=v;ADM.roles=null;ADM.staff=null;ADM.newRole=null;render();admLoadVenue().then(render).catch(e=>toast(e.message))},
admfeat:v=>{const V2=ADM.venues.find(x=>x.id===ADM.sel),on=!V2.features.includes(v),f=on?[...V2.features,v]:V2.features.filter(x=>x!==v);admPatch({features:FEAT_INFO.map(x=>x[0]).filter(k=>f.includes(k))}).then(r=>{if(r){toast(`${FEAT_INFO.find(x=>x[0]===v)[1]} ${on?'on':'off'} for ${r.name}`);if(r.id===VENUES[S.vi].id)refresh()}})},
admactive:()=>{const V2=ADM.venues.find(x=>x.id===ADM.sel);admPatch({active:!V2.active}).then(r=>r&&toast(r.active?`${r.name} is live`:`${r.name} is paused`))},
admnew:()=>openSheet({k:'newvenue'}),
roleadd:()=>{ADM.newRole=['floor'];render()},
rolecancel:()=>{ADM.newRole=null;render()},
roledel:v=>{const r=ADM.roles.roles.find(x=>x.id===v);act(()=>DEL(`/venues/${ADM.sel}/roles/${v}`),`${r.name} deleted`,{reload:false}).then(x=>{if(x)admLoadVenue().then(render)})},
staffdel:v=>{const [vid,uid]=v.split(':'),venue=vid||VENUES[S.vi].id,L=vid?ADM.staff:S.staff,m=L.find(x=>x.userId===uid);
  act(()=>DEL(`/venues/${venue}/staff/${uid}`),`${m.name} removed`,{reload:!vid}).then(x=>{if(x&&vid)admLoad()})}
};
Object.assign(ACT,ADMACT);
const _goAct=ACT.go;ACT.go=v=>{if(v==='admin'){ADM.venues=null}_goAct(v)};
document.addEventListener('change',async e=>{const el=e.target;if(!S||!ME)return;
  if(el.dataset.staffrole){const [vid,uid]=el.dataset.staffrole.split(':'),venue=vid||VENUES[S.vi].id;const r=await act(()=>PATCH(`/venues/${venue}/staff/${uid}`,roleValue(el.value)),m=>`${m.name} is now ${m.roleName||ROLE_NAME[m.role]}`,{reload:!vid});if(vid){await admLoad()}else if(!r)render()}
  if(el.dataset.roleperm){const id=el.dataset.roleperm,r=ADM.roles.roles.find(x=>x.id===id),k=el.dataset.p;r.permissions=el.checked?[...r.permissions,k]:r.permissions.filter(x=>x!==k);later('role'+id,()=>PATCH(`/venues/${ADM.sel}/roles/${id}`,{permissions:r.permissions}).then(()=>toast(`${r.name} saved`)),500)}
  if(el.dataset.rolename){const id=el.dataset.rolename,r=ADM.roles.roles.find(x=>x.id===id),n=el.value.trim();if(n.length>=2){r.name=n;later('rolen'+id,()=>PATCH(`/venues/${ADM.sel}/roles/${id}`,{name:n}).then(()=>toast('Role renamed')),300)}}
  if(el.dataset.np){const k=el.dataset.np;ADM.newRole=el.checked?[...ADM.newRole,k]:ADM.newRole.filter(x=>x!==k)}
});
document.addEventListener('submit',async e=>{const f=e.target;if(!S||!ME)return;
  if(f.id==='newrole'){e.preventDefault();const r=await act(()=>POST(`/venues/${ADM.sel}/roles`,{name:val('nrname'),permissions:ADM.newRole}),r=>`${r.name} role saved`,{reload:false});if(r){ADM.newRole=null;await admLoadVenue();render()}}
  if(f.id==='admstaff'){e.preventDefault();const r=await act(()=>POST(`/venues/${ADM.sel}/staff`,{name:val('asname'),email:val('asemail'),password:val('aspass'),...roleValue($('#asrole').value)}),'Account added. Share the email and password with them.',{reload:false});if(r)await admLoad()}
});
const _growthSheet=growthSheet;
growthSheet=d=>{if(d.k==='newvenue')return ['New venue',`<form id="addvenue" class="stack" style="margin-top:0"><label class="f">Venue name<input id="vname" required minlength="2" autocomplete="off" placeholder="Saba Lounge"></label><h3 style="margin-top:6px">Owner account</h3><label class="f">Owner name<input id="voname" required minlength="2" autocomplete="off"></label><label class="f">Owner email<input id="voemail" type="email" required autocomplete="off"></label><label class="f">Owner password<input id="vopass" type="text" required minlength="8" autocomplete="off" placeholder="At least 8 characters"></label><h3 style="margin-top:6px">Modules</h3>${FEAT_INFO.map(([k,l,d])=>`<label class="chk"><input type="checkbox" name="vfeat" value="${k}" checked><span><b>${l}</b><br><span class="mute" style="font-size:13px">${d}</span></span></label>`).join('')}<button class="btn" type="submit">Create venue</button></form>`];return _growthSheet(d)};

/* ---------- staff boot ---------- */
function loginScreen(){$('#app').hidden=true;$('#guest').hidden=true;const L=$('#login');L.hidden=false;
  L.innerHTML=`<div class="login"><div class="card">${LOGO}<h1>Sign in</h1><p class="mute">Your venue's floor, bookings, door and tickets.</p><form id="slogin" class="stack"><label class="f">Email<input id="lemail" type="email" required autocomplete="username"></label><label class="f">Password<input id="lpass" type="password" required autocomplete="current-password"></label><p id="lerr" class="err" role="alert" style="margin:0"></p><button class="btn" type="submit">Sign in</button></form></div>${POWERED}</div>`;
  $('#lemail')?.focus()}
function signOut(){TOKEN=null;store.set('xtra.staff',null);S=null;ME=null;closeCam();loginScreen()}
async function bootStaff(){
  $('#login').hidden=true;$('#app').hidden=false;$('#main').innerHTML='<div class="loading">Loading…</div>';
  try{ME=await GET('/auth/me')}catch(e){if(e.status===401)return signOut();$('#main').innerHTML=`<div class="loading">${esc(e.message)}</div>`;return}
  if(!ME.venues.length){$('#main').innerHTML=`<div class="loading">No venue on this account yet. Ask XTRA to add you.</div>`;return}
  try{const P=await GET('/platform');PLATFORM={bookingFeeBps:P.bookingFeeBps,feeVatBps:P.feeVatBps};LIVE_INT=P.integrations}catch(_){}
  const saved=store.get('xtra.venue'),vi=Math.max(0,ME.venues.findIndex(v=>v.id===saved));
  try{await loadVenue(vi)}catch(e){toast(e.message);if(e.status===401)return signOut()}
  render();ro.observe($('#main'));
  setInterval(()=>{if(S&&!S.sheet&&!drag&&document.visibilityState==='visible'&&!['editor','setup','community'].includes(VIEW)&&!document.activeElement?.matches('input,textarea,select'))refresh()},20000)}
/** Extra loads after a venue: slot ids (synced with the setup grid) and automation counts. */
async function afterLoad(){const VD=VDATA[S.vi],mgr=CAN('setup');
  try{VD.slots=await GET(vurl('/slots'))}catch(_){VD.slots=[]}
  const want=slots().map(min2hm).join(),have=(VD.slots||[]).map(s=>s.startsAt).sort((a,b)=>hm2min(a)-hm2min(b)).join();
  if(mgr&&want!==have)try{await syncSlots()}catch(_){}
  if(CAN('marketing'))try{const n=await GET(vurl('/automations'));S.autos.forEach(a=>{a.n=n[a.k]||0})}catch(_){}}
const _loadVenue=loadVenue;
loadVenue=async(vi,keep)=>{await _loadVenue(vi,keep);if(!keep)await afterLoad()};

/* ---------- start ---------- */
(()=>{const p=location.pathname;
  if(/^\/(book|b|e|o|t|p)\/[^/]+$/.test(p)||p==='/me'||p==='/paid')return bootGuest(p);
  if(TOKEN)bootStaff();else loginScreen()})();

/* Pinch the event seat map to zoom: the SVG resizes live, the zoom is saved when the fingers lift. */
(()=>{let start=null;
  document.addEventListener('touchstart',e=>{const m=e.target.closest?.('.evmap');if(!m||e.touches.length!==2||!S?.evp)return;
    const svg=m.querySelector('svg'),d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    start={m,svg,d,w:svg.getBoundingClientRect().width,cw:m.clientWidth-16};},{passive:true});
  document.addEventListener('touchmove',e=>{if(!start||e.touches.length!==2)return;e.preventDefault();
    const d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    const w=Math.max(start.cw*.35,Math.min(start.cw*3,start.w*d/start.d));start.m.classList.remove('fit');Object.assign(start.svg.style,{height:'auto',maxWidth:'none',width:w+'px'});start.z=w/start.cw},{passive:false});
  document.addEventListener('touchend',()=>{if(!start)return;const z=start.z;start=null;if(z==null)return;S.evp.zoom=z<1.05?'fit':Math.round(Math.min(3,z)*4)/4;render()});
})();

/* ================= reports ================= */
const REP={range:'30',from:null,to:null,data:{},busy:false,hover:null};
const REP_PRESETS=[['today','Today'],['yesterday','Yesterday'],['7','7 days'],['30','30 days'],['month','This month'],['lastmonth','Last month'],['custom','Custom']];
const repRange=k=>{const to=nightYmd(),d=n=>addDays(to,-n);
  if(k==='custom'&&REP.from&&REP.to)return REP.from<=REP.to?[REP.from,REP.to]:[REP.to,REP.from];
  if(k==='today')return [to,to];if(k==='yesterday')return [d(1),d(1)];
  if(k==='month')return [to.slice(0,8)+'01',to];
  if(k==='lastmonth'){const t=new Date(to.slice(0,8)+'01T12:00:00Z');t.setUTCDate(0);const e=t.toISOString().slice(0,10);return [e.slice(0,8)+'01',e]}
  return [d((+k||30)-1),to]};
function repLoad(){const [f,t]=repRange(REP.range),key=VENUES[S.vi].id+f+t;if(REP.data[key]||REP.busy)return REP.data[key];REP.busy=true;
  GET(vurl(`/reports?from=${f}&to=${t}`)).then(r=>{REP.data[key]=r}).catch(e=>toast(e.message)).finally(()=>{REP.busy=false;if(VIEW==='reports')render()});return null}
const P2=v=>egp(v/100),rpct=(a,b)=>b?Math.round(a/b*100):0;
const METHOD={card:'Card machine',cash:'Cash',instapay:'InstaPay',wallet:'Mobile wallet',paymob:'Paid online',free:'Free',other:'Other'};
const rdate=(s,y)=>{const p=dparts(s);return `${p[1]} ${p[2]}${y?' '+s.slice(0,4):''}`};
const rspan=(f,t)=>f===t?rdate(f,true):`${rdate(f,f.slice(0,4)!==t.slice(0,4))} – ${rdate(t,true)}`;
/* Short money for axes: EGP 12.5k, EGP 1.2M. */
const kEgp=v=>{const x=v/100;return x>=1e6?`${+(x/1e6).toFixed(1)}M`:x>=1e3?`${+(x/1e3).toFixed(x>=1e4?0:1)}k`:String(Math.round(x))};
/* "▲ 12%" against the range before. down=true when lower is better (no-shows). */
function delta(now,before,{down=false,pts=false}={}){
  if(before==null)return '';
  if(!before&&!now)return '<span class="dl flat">No change</span>';
  if(!before)return '<span class="dl up">New</span>';
  const ch=pts?Math.round((now-before)*10)/10:Math.round((now-before)/before*100);
  if(!ch)return '<span class="dl flat">Same as before</span>';
  const good=down?ch<0:ch>0;
  return `<span class="dl ${good?'up':'down'}" title="Before: ${pts?before+'%':''}">${ch>0?'▲':'▼'} ${Math.abs(ch)}${pts?' pts':'%'}</span>`}
/* Bars per night, or per week when the range is long. */
function repBuckets(days){if(days.length<=62)return days.map(d=>({...d,label:rdate(d.day),from:d.day,to:d.day}));
  const out=[];for(let i=0;i<days.length;i+=7){const w=days.slice(i,i+7);out.push({from:w[0].day,to:w.at(-1).day,label:`${rdate(w[0].day)} – ${rdate(w.at(-1).day)}`,tables:w.reduce((s,d)=>s+d.tables,0),tickets:w.reduce((s,d)=>s+d.tickets,0),bookings:w.reduce((s,d)=>s+d.bookings,0),noShows:w.reduce((s,d)=>s+d.noShows,0)})}return out}
function repChart(days,showT){
  const B=repBuckets(days),W=innerWidth<640?360:760,H=innerWidth<640?170:200,L=40,n=B.length,top=Math.max(1,...B.map(d=>d.tables+(showT?d.tickets:0)));
  const step=(()=>{const raw=top/3,m=10**Math.floor(Math.log10(raw)),k=[1,2,2.5,5,10].find(k=>k*m>=raw);return k*m})(),mx=step*Math.ceil(top/step);
  const bw=(W-L)/n,gap=Math.min(6,bw*.3),w=Math.max(1,bw-gap),lab=n<=10&&W>400?1:Math.ceil(n/(W>400?8:5)),r=Math.min(4,w/2);
  const y=v=>H-v/mx*H;
  const bar=(x,y0,y1,fill,round)=>{const h=y0-y1;if(h<=0)return '';if(!round||h<r)return `<rect x="${x}" y="${y1}" width="${w}" height="${h}" fill="${fill}"/>`;
    return `<path d="M${x},${y0}V${y1+r}Q${x},${y1} ${x+r},${y1}H${x+w-r}Q${x+w},${y1} ${x+w},${y1+r}V${y0}Z" fill="${fill}"/>`};
  let grid='';for(let v=0;v<=mx;v+=step)grid+=`<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="gl${v?'':' base'}"/><text x="${L-8}" y="${y(v)+4}" text-anchor="end" class="ax">${v?kEgp(v):'0'}</text>`;
  const bars=B.map((d,i)=>{const x=L+i*bw+gap/2,t1=y(d.tables),hasT=showT&&d.tickets>0,t2=y(d.tables+(showT?d.tickets:0));
    return `<g class="rb" data-i="${i}">${bar(x,H,t1,'var(--c1)',!hasT)}${hasT?bar(x,t1-(d.tables?2:0),t2,'var(--c2)',true):''}<rect x="${L+i*bw}" y="0" width="${bw}" height="${H}" fill="transparent"/>${i%lab===0?`<text x="${x+w/2}" y="${H+18}" text-anchor="middle" class="ax">${esc(n>62?rdate(d.from):String(dparts(d.from)[1]))}</text>`:''}</g>`}).join('');
  return `<div class="rchart" data-n="${n}"><svg viewBox="0 0 ${W} ${H+26}" role="img" aria-label="Money in per ${days.length>62?'week':'night'}">${grid}${bars}</svg><div class="rtip" hidden></div></div>`}
function repTip(e){const c=e.target.closest?.('.rchart');if(!c)return;const tip=c.querySelector('.rtip'),g=e.target.closest('.rb');
  c.querySelectorAll('.rb.on').forEach(x=>x!==g&&x.classList.remove('on'));if(!g){tip.hidden=true;return}g.classList.add('on');
  const [f,t]=repRange(REP.range),r=REP.data[VENUES[S.vi].id+f+t];if(!r)return;const d=repBuckets(r.days)[+g.dataset.i],showT=HAS('ticketing');
  tip.innerHTML=`<b>${esc(d.label)}</b><div><i style="background:var(--c1)"></i>Tables and bar<span class="num">${P2(d.tables)}</span></div>${showT?`<div><i style="background:var(--c2)"></i>Tickets<span class="num">${P2(d.tickets)}</span></div>`:''}${HAS('reservations')?`<div class="mute">${d.bookings} booking${d.bookings===1?'':'s'}${d.noShows?` · ${d.noShows} no-show${d.noShows===1?'':'s'}`:''}</div>`:''}`;
  tip.hidden=false;const box=c.getBoundingClientRect(),gb=g.getBoundingClientRect(),x=gb.left-box.left+gb.width/2;
  tip.style.left=Math.max(8,Math.min(box.width-tip.offsetWidth-8,x-tip.offsetWidth/2))+'px'}
document.addEventListener('mouseover',repTip);document.addEventListener('focusin',repTip);
document.addEventListener('mouseout',e=>{const c=e.target.closest?.('.rchart');if(c&&!c.contains(e.relatedTarget)){c.querySelector('.rtip').hidden=true;c.querySelectorAll('.rb.on').forEach(x=>x.classList.remove('on'))}});
function repCsv(r){const q=v=>/[",\n]/.test(String(v))?`"${String(v).replace(/"/g,'""')}"`:v,M=r.money,B=r.bookings,T=r.tickets,e=v=>(v/100).toFixed(2);
  const rows=[[`${VENUES[S.vi].name} report`,`${r.from} to ${r.to}`],[],['Summary','This range','Before'],
    ['Money in (EGP)',e(M.total),e(r.previous.total)],['Tables and bar (EGP)',e(M.tables),e(r.previous.tables)],['Bills',M.bills,r.previous.bills],['Average bill (EGP)',e(M.avgBill),e(r.previous.avgBill)],
    ['Service (EGP)',e(M.service)],['VAT on bills (EGP)',e(M.vat)],['Tickets after promos (EGP)',e(M.tickets),e(r.previous.tickets)],['Tickets sold',T.sold,r.previous.ticketsSold],['Invited guests',T.invited],
    ['Promo discounts (EGP)',e(M.ticketDiscounts)],['Booking fees paid by guests (EGP)',e(M.bookingFees)],['Deposits paid (EGP)',e(M.deposits),e(r.previous.deposits)],['Refunds (EGP)',e(M.refunds||0)],
    ['Booking requests',B.requests],['Confirmed bookings',B.confirmed,r.previous.confirmed],['Came',B.showed,r.previous.showed],['No-shows',B.noShows,r.previous.noShows],['Guests served',B.covers,r.previous.covers],[],
    ['Payment method','Bills','EGP'],...M.byMethod.map(m=>[METHOD[m.method]||m.method,m.bills,e(m.total)]),[],
    ['Night','Tables (EGP)','Tickets (EGP)','Bookings','No-shows'],...r.days.map(d=>[d.day,e(d.tables),e(d.tickets),d.bookings,d.noShows]),[],
    ['Event','Night','Sold','Invited','Capacity','Came','After promos (EGP)'],...r.events.map(x=>[x.title,x.day,x.sold,x.invited,x.capacity,x.checkedIn,e(x.net)])];
  const url=URL.createObjectURL(new Blob(['﻿'+rows.map(x=>x.map(q).join(',')).join('\n')],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=`${VENUES[S.vi].slug}-report-${r.from}-to-${r.to}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function repTools(){const [f,t]=repRange(REP.range),today=nightYmd();
  return `<div class="rtools"><div class="seg">${REP_PRESETS.map(([k,l])=>`<button class="${REP.range===k?'on':''}" data-a="reprange" data-v="${k}" aria-pressed="${REP.range===k}">${l}</button>`).join('')}</div>
  <div class="rdates"><label>From<input type="date" id="repfrom" value="${f}" max="${today}"></label><span aria-hidden="true">→</span><label>To<input type="date" id="repto" value="${t}" max="${today}"></label></div></div>`}
function vReports(){const r=repLoad(),[f,t]=repRange(REP.range);
  const right=`<div class="rbtns"><button class="btn ghost sm" data-a="repcsv" ${r?'':'disabled'}>Download CSV</button><button class="btn ghost sm" data-a="repprint" ${r?'':'disabled'}>Print or PDF</button></div>`;
  const top=head('Reports',`${esc(rspan(f,t))}${r?` <span class="rvs">compared with ${esc(rspan(r.previous.from,r.previous.to))}</span>`:''}`,right)+repTools();
  if(!r)return top+'<div class="loading">Loading…</div>';
  const M=r.money,B=r.bookings,T=r.tickets,PV=r.previous,showT=HAS('ticketing'),showR=HAS('reservations'),showO=HAS('ordering');
  const kpi=(v,l,sub,d)=>`<div class="rkpi"><span>${l}</span><b class="num">${v}</b><div>${d||''}${sub?`<small>${sub}</small>`:''}</div></div>`;
  const pl=(n,w)=>`${n.toLocaleString('en-US')} ${w}${n===1?'':'s'}`;
  const share=M.total?M.tables/M.total*100:0;
  const hero=`<div class="rhero"><div class="rmain"><span>Money in</span><b class="num">${P2(M.total)}</b><div>${delta(M.total,PV.total)}<small>before ${P2(PV.total)}</small></div>
    ${showT&&showO&&M.total?`<div class="rsplit" role="img" aria-label="Tables and bar ${Math.round(share)}%, tickets ${100-Math.round(share)}%"><i style="width:${share}%;background:var(--c1)"></i><i style="width:${100-share}%;background:var(--c2)"></i></div><div class="rleg"><span><i style="background:var(--c1)"></i>Tables and bar ${Math.round(share)}%</span><span><i style="background:var(--c2)"></i>Tickets ${100-Math.round(share)}%</span></div>`:''}</div>
    <div class="rkpis">${showO?kpi(P2(M.tables),'Tables and bar',`${pl(M.bills,'bill')} · avg ${P2(M.avgBill)}`,delta(M.tables,PV.tables)):''}${showT?kpi(P2(M.tickets),'Tickets, after promos',`${pl(T.sold,'ticket')}${T.invited?` · ${T.invited} invited`:''}`,delta(M.tickets,PV.tickets)):''}${showR?kpi(P2(M.deposits),'Deposits paid',pl(M.depositCount,'deposit'),delta(M.deposits,PV.deposits)):''}${kpi(B.covers.toLocaleString('en-US'),'Guests served','bookings and walk-ins',delta(B.covers,PV.covers))}</div></div>`;
  const chart=`<section class="rcard"><div class="rch"><div><h3>Money in, per ${r.days.length>62?'week':'night'}</h3><p>Hover a bar for the details. A night runs until 6 AM.</p></div>${showT?`<div class="rleg"><span><i style="background:var(--c1)"></i>Tables and bar</span><span><i style="background:var(--c2)"></i>Tickets</span></div>`:''}</div>${M.total?repChart(r.days,showT):'<div class="empty">No money came in during these dates.</div>'}</section>`;
  const line=(l,v,cls='')=>`<div class="rl ${cls}"><span>${l}</span><b class="num">${v}</b></div>`;
  const statement=`<section class="rcard"><h3>Where the money came from</h3><div class="rstmt">
    ${showO?line('Tables and bar',P2(M.tables),'main')+line('Service charge, included',P2(M.service),'sub')+line('VAT on bills, included',P2(M.vat),'sub'):''}
    ${showT?line('Tickets at full price',P2(M.ticketGross),'main')+line('Promo discounts','−'+P2(M.ticketDiscounts),'sub')+line('Tickets after promos',P2(M.tickets),'sub'):''}
    ${showR?line('Deposits paid',P2(M.deposits),'main'):''}
    ${M.refunds?line(`Refunds, ${M.refundCount}`,'−'+P2(M.refunds),'main'):''}
    ${line('Total money in',P2(M.total),'tot')}
    ${showT&&M.bookingFees?line('Booking fees paid by guests, to XTRA',P2(M.bookingFees),'note'):''}</div>
    <p class="rfoot">${showR?'A deposit comes off the bill on the night, so bills show only what the guest paid at the venue and the deposit is counted on its own. ':''}Refunds are taken off on the day they were made.</p></section>`;
  const mt=Math.max(1,M.byMethod.reduce((s,m)=>s+m.total,0));
  const pays=`<section class="rcard"><h3>How guests paid</h3>${M.byMethod.length?`<div class="rbars">${M.byMethod.map(m=>`<div class="rbar"><div><span>${METHOD[m.method]||esc(m.method)}</span><b class="num">${P2(m.total)}</b></div><div class="rtrack"><i style="width:${m.total/mt*100}%"></i></div><small>${pl(m.bills,'bill')} · ${rpct(m.total,mt)}%</small></div>`).join('')}</div>`:'<div class="empty">No paid bills in these dates.</div>'}</section>`;
  const fun=[['Requests',B.requests],['Confirmed',B.confirmed],['Came',B.showed]],fm=Math.max(1,B.requests);
  const book=showR?`<section class="rcard"><h3>Bookings</h3><div class="rfun">${fun.map(([l,v],i)=>`<div class="rfr"><span>${l}</span><div class="rtrack"><i style="width:${v/fm*100}%;opacity:${1-i*.22}"></i></div><b class="num">${v}</b></div>`).join('')}</div>
    <div class="rmini">${[['No-shows',`${B.noShows}`,delta(B.noShows,PV.noShows,{down:true}),`${B.noShowRate}% of confirmed`],['Declined',B.declined,'',''],['Cancelled',B.cancelled,'',''],['Waiting',B.waiting,'','to accept or pay']].map(([l,v,d,s])=>`<div><span>${l}</span><b class="num">${v}</b>${d}${s?`<small>${s}</small>`:''}</div>`).join('')}</div></section>`:'';
  const wd=[0,0,0,0,0,0,0],wn=[0,0,0,0,0,0,0];r.days.forEach(d=>{const k=(new Date(d.day+'T12:00:00Z').getUTCDay()+6)%7;wd[k]+=d.tables+d.tickets;wn[k]++});
  const avg=wd.map((v,i)=>wn[i]?v/wn[i]:0),am=Math.max(1,...avg),best=avg.indexOf(Math.max(...avg));
  const week=r.days.length>=7&&M.total?`<section class="rcard"><h3>Busiest nights</h3><p class="rsub">Average money in for each night of the week.</p><div class="rweek">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((l,i)=>`<div class="${i===best?'best':''}" title="${l}: ${P2(avg[i])} on average"><b class="num">${avg[i]?kEgp(avg[i]):'–'}</b><span><i style="height:${avg[i]/am*100}%"></i></span><small>${l}</small></div>`).join('')}</div></section>`:'';
  const events=showT?`<section class="rcard"><h3>Events</h3>${r.events.length?`<div class="scroll"><table class="gtable rtable"><thead><tr><th>Event</th><th>Sold</th><th class="hide">Invited</th><th class="hide">Came</th><th class="r">After promos</th></tr></thead><tbody>${r.events.map(e=>{const p=rpct(e.sold+e.invited,e.capacity);return `<tr><td><b>${esc(e.title)}</b><div class="mute" style="font-size:13px">${esc(rdate(e.day,true))}</div></td><td><span class="num">${e.sold}${e.capacity?` / ${e.capacity}`:''}</span>${e.capacity?`<div class="rtrack sm"><i style="width:${Math.min(100,p)}%"></i></div>`:''}</td><td class="hide num">${e.invited||'–'}</td><td class="hide num">${e.checkedIn}</td><td class="num r">${P2(e.net)}</td></tr>`}).join('')}</tbody></table></div>`:'<div class="empty">No events in these dates.</div>'}</section>`:'';
  const guests=`<section class="rcard"><h3>Top guests</h3><p class="rsub">All time, by spend at ${esc(VENUES[S.vi].name)}.</p>${r.topGuests.length?`<div class="scroll"><table class="gtable rtable"><thead><tr><th>Guest</th><th>Visits</th><th class="r">Spend</th></tr></thead><tbody>${r.topGuests.map((g,i)=>`<tr ${S.guests?.some(x=>x.id===g.id)?`class="click" data-a="guest" data-v="${g.id}"`:''}><td><span class="rk">${i+1}</span><b>${esc(g.name)}</b>${(g.tags||[]).includes('VIP')?' <span class="tag vip">VIP</span>':''}<div class="mute" style="font-size:13px;padding-left:30px">${esc(fmtPhone(g.phone))}${g.lastVisit?' · last '+esc(rdate(g.lastVisit)):''}</div></td><td class="num">${g.visits}</td><td class="num r">${P2(g.spend)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Guests show up here after their first visit or ticket.</div>'}</section>`;
  const im=Math.max(1,...r.topItems.map(i=>i.total));
  const items=showO?`<section class="rcard"><h3>Best sellers</h3>${r.topItems.length?`<div class="rbars">${r.topItems.map(i=>`<div class="rbar"><div><span>${esc(i.name)} <span class="mute">× ${i.qty}</span></span><b class="num">${P2(i.total)}</b></div><div class="rtrack"><i style="width:${i.total/im*100}%"></i></div></div>`).join('')}</div>`:'<div class="empty">No items sold in these dates.</div>'}</section>`:'';
  return `<div class="rep">${top}${hero}${chart}<div class="rgrid">${statement}${showO?pays:''}${book}${week}</div>${events}<div class="rgrid">${guests}${items}</div><p class="rprint">${esc(VENUES[S.vi].name)} · ${esc(rspan(f,t))} · printed ${esc(rdate(nightYmd(),true))}</p></div>`;
}
Object.assign(ACT,{reprange:v=>{if(v==='custom'&&!REP.from){const [f,t]=repRange(REP.range);REP.from=f;REP.to=t}REP.range=v;render()},
  repcsv:()=>{const [f,t]=repRange(REP.range),r=REP.data[VENUES[S.vi].id+f+t];if(r)repCsv(r)},repprint:()=>window.print()});
document.addEventListener('change',e=>{if(!S||VIEW!=='reports')return;const el=e.target;if(el.id!=='repfrom'&&el.id!=='repto')return;
  const [f,t]=repRange(REP.range);REP.from=f;REP.to=t;if(!el.value)return;REP[el.id==='repfrom'?'from':'to']=el.value;
  if(REP.from>REP.to){if(el.id==='repfrom')REP.to=REP.from;else REP.from=REP.to}
  if((Date.parse(REP.to)-Date.parse(REP.from))/864e5>366){toast('Pick up to one year at a time');return}
  REP.range='custom';render()});

/* ================= messages and WhatsApp inbox ================= */
const MSG={tab:'chats',convos:null,sel:null,thread:null,draft:{},log:null,f:{q:'',status:'',channel:''},busy:false,sending:false,vid:null};
const KIND={booking_received:'Booking request',booking_accepted:'Deposit to pay',booking_confirmed:'Booking confirmed',deposit_paid:'Deposit receipt',refund:'Refund',waitlist_open:'Waitlist',booking_declined:'Booking declined',booking_cancelled:'Booking cancelled',booking_pass:'Guest pass',booking_reminder:'Reminder',ticket:'Ticket',ticket_order:'Ticket order',otp:'Login code',campaign:'Campaign',reply:'Reply',inbound:'Guest message',test:'Test',visit_thanks:'Thank you',birthday:'Birthday',winback:'We miss you'};
const kindName=(k='')=>KIND[k]||(k.startsWith('receipt:')?'Receipt':k.startsWith('auto:remind')?'Reminder':k.startsWith('auto:thanks')?'Thank you':k.startsWith('auto:bday')?'Birthday':k.startsWith('auto:winback')?'We miss you':k.replace(/_/g,' '));
const tzTime=d=>new Date(d).toLocaleTimeString('en-GB',{timeZone:TZ,hour:'numeric',minute:'2-digit',hour12:true});
const tzDay=d=>new Date(d).toLocaleDateString('en-GB',{timeZone:TZ,day:'numeric',month:'short'});
const when=d=>{const t=new Date(d),now=new Date();return t.toDateString()===now.toDateString()?tzTime(d):`${tzDay(d)}, ${tzTime(d)}`};
const msgUnread=()=>(MSG.convos||[]).reduce((s,c)=>s+c.unread,0);
function msgReset(){const id=VENUES[S.vi].id;if(MSG.vid!==id){Object.assign(MSG,{convos:null,sel:null,thread:null,log:null,vid:id})}}
function msgLoad(force){msgReset();if(MSG.busy)return;if(!force&&(MSG.tab==='chats'?MSG.convos:MSG.log))return;MSG.busy=true;
  const f=MSG.f,q=new URLSearchParams(Object.entries({q:f.q,status:f.status,channel:f.channel}).filter(([,v])=>v)).toString();
  const jobs=[GET(vurl('/inbox')).then(r=>{MSG.convos=r})];
  if(MSG.tab==='log')jobs.push(GET(vurl('/messages'+(q?'?'+q:''))).then(r=>{MSG.log=r}));
  if(MSG.tab==='chats'&&MSG.sel)jobs.push(GET(vurl('/inbox/'+encodeURIComponent(MSG.sel))).then(r=>{MSG.thread=r}));
  Promise.all(jobs).then(()=>{const c=MSG.sel&&MSG.convos?.find(x=>x.phone===MSG.sel);if(c&&MSG.tab==='chats')c.unread=0});
  Promise.all(jobs).catch(e=>toast(e.message)).finally(()=>{MSG.busy=false;if(VIEW==='messages'&&!S.sheet)msgPaint()})}
/** Re-render but keep the composer text, focus and the chat scrolled to the newest message. */
function msgPaint(){const ta=$('#mcompose'),had=document.activeElement===ta,pos=ta?.selectionStart,box=$('#mthread'),atEnd=!box||box.scrollHeight-box.scrollTop-box.clientHeight<40;render();
  const t=$('#mcompose');if(t&&had){t.focus();try{t.setSelectionRange(pos,pos)}catch(_){}}const b=$('#mthread');if(b&&atEnd)b.scrollTop=b.scrollHeight}
const tick=m=>m.direction==='in'?'':m.status==='failed'?`<span class="tk bad" title="${esc(m.error||'Failed')}">Failed</span>`:m.status==='read'?'<span class="tk read" title="Read">✓✓</span>':m.status==='delivered'?'<span class="tk" title="Delivered">✓✓</span>':m.status==='sent'?'<span class="tk" title="Sent">✓</span>':'<span class="tk" title="Saved, not sent (test mode)">•</span>';
function vChats(){const C=MSG.convos;if(!C)return '<div class="loading">Loading…</div>';
  if(!C.length)return `<div class="bigbox"><div class="empty"><b>No chats yet.</b><br>When a guest replies to a booking or ticket message on WhatsApp, the chat shows up here and you can answer it.</div></div>`;
  const list=`<div class="chatlist">${C.map(c=>`<button class="chatrow ${MSG.sel===c.phone?'on':''}" data-a="mchat" data-v="${esc(c.phone)}"><span class="av">${esc((c.name||'#').trim()[0].toUpperCase())}</span><span class="cx"><span class="cn"><b>${esc(c.name||c.phone)}</b><time>${esc(when(c.lastAt))}</time></span><span class="cl">${c.lastFromGuest?'':'<span class="mute">You: </span>'}${esc((c.lastBody||'').slice(0,90))}</span></span>${c.unread?`<span class="ct">${c.unread}</span>`:''}</button>`).join('')}</div>`;
  const T=MSG.thread&&MSG.thread.phone===MSG.sel?MSG.thread:null;
  const pane=!MSG.sel?`<div class="chatpane empty-pane"><div class="mute">Pick a chat to read it and reply.</div></div>`:!T?`<div class="chatpane"><div class="loading">Loading…</div></div>`:
   `<div class="chatpane"><div class="chathead"><button class="btn ghost sm back" data-a="mback" aria-label="Back to chats">←</button><div><b>${esc(T.guest?.name||C.find(c=>c.phone===T.phone)?.name||T.phone)}</b><div class="mute" style="font-size:13px">${esc(T.phone)}${T.guest&&S.guests?.some(x=>x.id===T.guest.id)?` · <a href="#" data-a="guest" data-v="${T.guest.id}">Guest profile</a>`:''}</div></div>
     <span class="win ${T.open?'open':''}">${T.open?`Open · ${Math.max(1,Math.round((new Date(T.closesAt)-Date.now())/36e5))} h left`:'Closed'}</span></div>
    <div class="thread" id="mthread">${T.messages.map((m,i,a)=>{const day=tzDay(m.createdAt),prev=i?tzDay(a[i-1].createdAt):'';return `${day!==prev?`<div class="dayline"><span>${esc(day)}</span></div>`:''}<div class="bub ${m.direction==='in'?'in':'out'}${m.status==='failed'?' fail':''}">${m.direction==='out'&&m.kind!=='reply'?`<div class="bk">${esc(kindName(m.kind))}</div>`:''}<div class="bt">${esc(m.body)}</div><div class="bm">${esc(tzTime(m.createdAt))} ${tick(m)}</div></div>`}).join('')}</div>
    ${T.open?`<form class="composer" data-f="mreply"><textarea id="mcompose" rows="1" placeholder="Write a reply" maxlength="4000">${esc(MSG.draft[T.phone]||'')}</textarea><button class="btn" ${MSG.sending?'disabled':''}>${MSG.sending?'Sending…':'Send'}</button></form>`
     :`<div class="closednote">WhatsApp lets you reply for 24 hours after the guest's last message. This chat opens again when they write to you.</div>`}</div>`;
  return `<div class="inbox ${MSG.sel?'has-sel':''}">${list}${pane}</div>`}
function vMsgLog(){const L=MSG.log,f=MSG.f;
  const bar=`<div class="mfilters"><input id="msearch" type="search" placeholder="Search name, number, email or text" value="${esc(f.q)}" aria-label="Search messages"><div class="seg">${[['','All'],['failed','Failed'],['in','From guests']].map(([k,l])=>`<button class="${f.status===k?'on':''}" data-a="mstatus" data-v="${k}">${l}</button>`).join('')}</div><select id="mchannel" aria-label="Channel"><option value="">WhatsApp and email</option><option value="whatsapp" ${f.channel==='whatsapp'?'selected':''}>WhatsApp</option><option value="email" ${f.channel==='email'?'selected':''}>Email</option></select></div>`;
  if(!L)return bar+'<div class="loading">Loading…</div>';
  const pill=m=>m.direction==='in'?'<span class="pill in">Received</span>':`<span class="pill ${m.status}">${{logged:'Test mode',sent:'Sent',delivered:'Delivered',read:'Read',failed:'Failed'}[m.status]||esc(m.status)}</span>`;
  return bar+`<div class="bigbox">${L.length?`<div class="scroll"><table class="gtable mlog"><thead><tr><th>When</th><th>To</th><th>Message</th><th>Status</th><th></th></tr></thead><tbody>${L.map(m=>`<tr><td class="num nowrap">${esc(when(m.createdAt))}</td><td><b>${esc(m.guest||m.to)}</b><div class="mute" style="font-size:13px">${m.channel==='email'?'Email':'WhatsApp'}${m.guest?` · ${esc(m.to)}`:''}</div></td><td><b>${esc(kindName(m.kind))}</b><div class="mute snip">${esc(m.subject&&m.channel==='email'?m.subject:m.body.split('\n')[0]).slice(0,120)}</div>${m.error?`<div class="err">${esc(m.error.slice(0,200))}</div>`:''}</td><td>${pill(m)}</td><td>${m.direction==='out'&&m.status==='failed'?`<button class="btn ghost sm" data-a="mresend" data-v="${m.id}">Send again</button>`:m.direction==='in'?`<button class="btn ghost sm" data-a="mopen" data-v="${esc(m.to)}">Open chat</button>`:''}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No messages match.</div>'}</div>`}
function vMessages(){msgLoad();const n=msgUnread(),seg=`<div class="seg"><button class="${MSG.tab==='chats'?'on':''}" data-a="mtab" data-v="chats">WhatsApp chats${n?` <span class="ct">${n}</span>`:''}</button><button class="${MSG.tab==='log'?'on':''}" data-a="mtab" data-v="log">All messages</button></div>`;
  return head('Messages','Guest replies on WhatsApp, and every message and email sent',seg)+(MSG.tab==='chats'?vChats():vMsgLog())}
Object.assign(ACT,{
  mtab:v=>{MSG.tab=v;msgLoad(true);render()},
  mchat:v=>{MSG.sel=v;MSG.thread=null;render();msgLoad(true)},
  mopen:v=>{MSG.tab='chats';MSG.sel=v;MSG.thread=null;render();msgLoad(true)},
  mback:()=>{MSG.sel=null;render()},
  mstatus:v=>{MSG.f.status=v;MSG.log=null;render();msgLoad(true)},
  mresend:async(v,b)=>{b.disabled=true;try{const r=await POST(vurl(`/messages/${v}/resend`));toast(r.status==='failed'?`Still failing: ${r.error||''}`.slice(0,140):'Sent again')}catch(e){toast(e.message)}msgLoad(true)},
});
document.addEventListener('input',e=>{const el=e.target;if(!S||VIEW!=='messages')return;
  if(el.id==='mcompose'&&MSG.sel){MSG.draft[MSG.sel]=el.value;el.style.height='auto';el.style.height=Math.min(el.scrollHeight,160)+'px'}
  if(el.id==='msearch'){MSG.f.q=el.value;later('msearch',()=>{MSG.log=null;msgLoad(true)})}});
document.addEventListener('change',e=>{if(!S||VIEW!=='messages')return;if(e.target.id==='mchannel'){MSG.f.channel=e.target.value;MSG.log=null;render();msgLoad(true)}});
document.addEventListener('keydown',e=>{if(e.target.id==='mcompose'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();e.target.form?.requestSubmit()}});
document.addEventListener('submit',async e=>{const f=e.target;if(!S||f.dataset.f!=='mreply')return;e.preventDefault();const phone=MSG.sel,text=(MSG.draft[phone]||'').trim();if(!text||MSG.sending)return;
  MSG.sending=true;msgPaint();try{const m=await POST(vurl('/inbox/'+encodeURIComponent(phone)),{text});MSG.draft[phone]='';if(MSG.thread?.phone===phone)MSG.thread.messages.push(m);if(m.status==='failed')toast(`Not sent: ${m.error||''}`.slice(0,160))}catch(err){toast(err.message)}MSG.sending=false;msgPaint();msgLoad(true)});
// New guest replies: check often while Messages is open, and now and then elsewhere for the badge.
setInterval(()=>{if(!S||!ME||!CAN('messages')||document.visibilityState!=='visible')return;if(VIEW==='messages')msgLoad(true);else{msgReset();GET(vurl('/inbox')).then(r=>{const before=msgUnread();MSG.convos=r;if(msgUnread()!==before&&!S.sheet&&!document.activeElement?.matches('input,textarea,select'))render()}).catch(()=>{})}},8000);
