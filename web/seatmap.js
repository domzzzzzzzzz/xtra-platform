/* XTRA seat maps.
   - Seated blocks: rows of seats built from a few numbers (rows, seats per row, curve...).
   - One drawing for the editor, the guest seat picker and the pass ("find your seat").
   - Pan and zoom (wheel, drag, pinch, buttons) with a minimap.
   - A walking route from the entrance to a seat, table or zone (A* on a small grid).
   Uses esc(), furn(), isT(), ebox() and egp() from app.js at call time. */
const SM=(()=>{
const PITCH=14,ROWGAP=17,R=5.2,AISLE=12;
const LETTERS='ABCDEFGHJKLMNOPQRSTUVWXYZ';
const TIER=['#2e3192','#e0553d','#0f9bb5','#8b5cf6','#d99a00','#1f9d6b','#c2307a','#475569'];
const rowName=(i,start)=>{const s=Math.max(0,LETTERS.indexOf(String(start||'A').toUpperCase()));const k=s+i;return k<LETTERS.length?LETTERS[k]:LETTERS[k%LETTERS.length].repeat(1+Math.floor(k/LETTERS.length))};
const r1=v=>Math.round(v*10)/10;

/* ---------- seated blocks ---------- */
const BDEF={rows:8,cols:12,curve:0.3,taper:0,aisle:0,rowStart:'A',numDir:'ltr',rot:0};
function blockRows(b){
  const rows=[],n0=Math.max(1,b.cols|0),N=Math.max(1,b.rows|0),a=(b.rot||0)*Math.PI/180,ca=Math.cos(a),sa=Math.sin(a),curve=Math.max(0,Math.min(1,+b.curve||0));
  for(let r=0;r<N;r++){
    const n=Math.max(1,n0+Math.round(r*(+b.taper||0))),gaps=b.aisle>0?Math.floor((n-1)/b.aisle):0,width=(n-1)*PITCH+gaps*AISLE;
    const y0=r*ROWGAP-(N-1)*ROWGAP/2,row=rowName(r,b.rowStart),seats=[];
    for(let i=0;i<n;i++){
      const g=b.aisle>0?Math.floor(i/b.aisle):0,lx=-width/2+i*PITCH+g*AISLE;
      // Rows bow toward the stage (up): the ends come forward.
      const ly=y0-curve*lx*lx/520;
      const num=b.numDir==='rtl'?n-i:i+1;
      seats.push({label:row+'-'+num,row,num,x:r1(b.x+lx*ca-ly*sa),y:r1(b.y+lx*sa+ly*ca),i});
    }
    rows.push({row,seats});
  }
  return rows}
const blockSeats=b=>blockRows(b).flatMap(r=>r.seats);
function blockBox(b){const s=blockSeats(b);let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;s.forEach(p=>{x0=Math.min(x0,p.x);y0=Math.min(y0,p.y);x1=Math.max(x1,p.x);y1=Math.max(y1,p.y)});const m=R+12;return {x:x0-m,y:y0-m-12,w:x1-x0+2*m,h:y1-y0+2*m+12}}
const newBlock=(id,name,x,y,o={})=>({id,kind:'block',name,x,y,price:500,...BDEF,...o});

/* ---------- bounds and colours ---------- */
function elBox(el){if(el.kind==='block')return blockBox(el);if(isT(el))return ebox(el);return {x:el.x,y:el.y,w:el.w||1,h:el.h||1}}
function bounds(layout){let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;layout.forEach(el=>{const b=elBox(el);x0=Math.min(x0,b.x);y0=Math.min(y0,b.y);x1=Math.max(x1,b.x+b.w);y1=Math.max(y1,b.y+b.h)});
  if(x0>x1)return {x:0,y:0,w:1000,h:640};const m=34;return {x:x0-m,y:y0-m,w:x1-x0+2*m,h:y1-y0+2*m}}
/** One colour per price, dearest first, so the legend reads like a price list. */
function tiers(ev){const L=[];const add=(price,name,out)=>{let t=L.find(x=>x.price===price);if(!t){t={price,names:[],out:true};L.push(t)}if(!t.names.includes(name))t.names.push(name);if(!out)t.out=false};
  (ev.types||[]).forEach(t=>add(t.price,t.name,t.closed||t.left===0||t.sold>=t.qty));
  (ev.tz||[]).forEach(z=>{if(ev.layout.some(t=>isT(t)))add(z.price,z.name,z.closed)});
  ev.layout.filter(b=>b.kind==='block').forEach(b=>add(b.price,b.name,b.closed||b.left===0));
  L.sort((a,b)=>b.price-a.price);L.forEach((t,i)=>t.color=TIER[i%TIER.length]);return L}
const colorOf=(T,price)=>(T.find(t=>t.price===price)||{color:TIER[TIER.length-1]}).color;

/* ---------- drawing ---------- */
const NS='font-family="Archivo,system-ui,sans-serif"';
function defs(){return `<defs><pattern id="smh" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="none"/><path d="M0 0V8" stroke="currentColor" stroke-width="2.2" opacity=".22"/></pattern>
<radialGradient id="smspot"><stop offset="0" stop-color="#ffd76a" stop-opacity=".55"/><stop offset=".55" stop-color="#ffd76a" stop-opacity=".16"/><stop offset="1" stop-color="#ffd76a" stop-opacity="0"/></radialGradient>
<filter id="smsh" x="-10%" y="-10%" width="120%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#12153f" flood-opacity=".18"/></filter></defs>`}
/** Which way the stage faces: toward the middle of everything else. */
function facing(st,B){const cx=st.x+st.w/2,cy=st.y+st.h/2,dx=B.x+B.w/2-cx,dy=B.y+B.h/2-cy;return Math.abs(dx)*st.h>Math.abs(dy)*st.w?(dx>0?'r':'l'):(dy>0?'b':'t')}
function stageSVG(f,B,dim){const {x,y,w,h}=f,side=facing(f,B),k=Math.min(26,(side==='t'||side==='b'?h:w)*.45);
  let d,gx,gy,rx,ry;
  if(side==='b'){d=`M${x} ${y+8}q0-8 8-8H${x+w-8}q8 0 8 8V${y+h-k}Q${x+w/2} ${y+h+k} ${x} ${y+h-k}Z`;gx=x+w/2;gy=y+h+20;rx=w*.62;ry=Math.max(60,h*1.2)}
  else if(side==='t'){d=`M${x} ${y+h-8}q0 8 8 8H${x+w-8}q8 0 8-8V${y+k}Q${x+w/2} ${y-k} ${x} ${y+k}Z`;gx=x+w/2;gy=y-20;rx=w*.62;ry=Math.max(60,h*1.2)}
  else if(side==='r'){d=`M${x+8} ${y}q-8 0-8 8V${y+h-8}q0 8 8 8H${x+w-k}Q${x+w+k} ${y+h/2} ${x+w-k} ${y}Z`;gx=x+w+20;gy=y+h/2;rx=Math.max(60,w*1.2);ry=h*.62}
  else{d=`M${x+w-8} ${y}q8 0 8 8V${y+h-8}q0 8-8 8H${x+k}Q${x-k} ${y+h/2} ${x+k} ${y}Z`;gx=x-20;gy=y+h/2;rx=Math.max(60,w*1.2);ry=h*.62}
  const vert=side==='l'||side==='r';
  return `<g class="smdecor" ${dim?'opacity=".55"':''}><ellipse cx="${gx}" cy="${gy}" rx="${rx}" ry="${ry}" fill="url(#smspot)"/><path d="${d}" fill="#12153f" filter="url(#smsh)"/><path d="${d}" fill="none" stroke="#fff" stroke-opacity=".12" stroke-width="1.5" transform="translate(0 0)"/><text x="${x+w/2}" y="${y+h/2+6}" text-anchor="middle" font-size="${Math.min(18,Math.max(11,(vert?h:w)/9))}" font-weight="800" letter-spacing="5" fill="#fff" ${NS} ${vert?`transform="rotate(${side==='r'?90:-90} ${x+w/2} ${y+h/2})"`:''}>${esc((f.name||'Stage').toUpperCase())}</text></g>`}
function barSVG(f,dim){const {x,y,w,h}=f,n=Math.max(2,Math.floor((w>h?w:h)/34));let st='';
  for(let i=0;i<n;i++){const t=(i+.5)/n;st+=w>h?`<circle cx="${x+w*t}" cy="${y+h+9}" r="5" fill="#d9dde6"/>`:`<circle cx="${x+w+9}" cy="${y+h*t}" r="5" fill="#d9dde6"/>`}
  return `<g class="smdecor" ${dim?'opacity=".55"':''}>${st}<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#2a2e57" filter="url(#smsh)"/><rect x="${x+7}" y="${y+7}" width="${Math.max(0,w-14)}" height="${Math.max(0,h-14)}" rx="6" fill="none" stroke="#fff" stroke-opacity=".18"/><text x="${x+w/2}" y="${y+h/2+5}" text-anchor="middle" font-size="14" font-weight="800" letter-spacing="3" fill="#fff" ${NS}>${esc((f.name||'Bar').toUpperCase())}</text></g>`}
function djSVG(f,dim){const {x,y,w,h}=f,r=Math.min(h,w/3)*.28;
  return `<g class="smdecor" ${dim?'opacity=".55"':''}><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="#12153f" filter="url(#smsh)"/><circle cx="${x+w*.22}" cy="${y+h/2}" r="${r}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/><circle cx="${x+w*.78}" cy="${y+h/2}" r="${r}" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2"/><text x="${x+w/2}" y="${y+h/2+5}" text-anchor="middle" font-size="13" font-weight="800" letter-spacing="3" fill="#fff" ${NS}>${esc((f.name||'DJ').toUpperCase())}</text></g>`}
function doorSVG(f,B){const {x,y,w,h}=f,cx=x+w/2,cy=y+h/2,hor=w>=h;
  // The arrow points into the room.
  const inY=cy<B.y+B.h/2?1:-1,inX=cx<B.x+B.w/2?1:-1,ax=hor?cx:cx+inX*16,ay=hor?cy+inY*16:cy;
  const arrow=hor?`M${cx-6} ${cy+inY*8}L${cx} ${cy+inY*15}L${cx+6} ${cy+inY*8}`:`M${cx+inX*8} ${cy-6}L${cx+inX*15} ${cy}L${cx+inX*8} ${cy+6}`;
  const lx=hor?cx:cx-inX*14,ly=hor?cy-inY*12+4:cy+4;
  return `<g class="smdecor"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="#00a7c9"/><path d="${arrow}" fill="none" stroke="#00a7c9" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><text x="${lx}" y="${ly}" text-anchor="middle" font-size="11" font-weight="700" fill="#5b6280" letter-spacing="1" ${NS} ${hor?'':`transform="rotate(-90 ${lx} ${ly})"`}>${esc((f.name||'Entrance').toUpperCase())}</text></g>`}
function hullPath(rows,pad){if(!rows.length)return '';const f=rows[0].seats,l=rows[rows.length-1].seats;
  const up=(p,q)=>{const dx=q.x-p.x,dy=q.y-p.y,L=Math.hypot(dx,dy)||1;return [dy/L,-dx/L]};
  const off=(arr,s)=>arr.map((p,i)=>{const a=arr[Math.max(0,i-1)],b=arr[Math.min(arr.length-1,i+1)],[nx,ny]=arr.length>1?up(a,b):[0,-1];return [p.x+nx*pad*s,p.y+ny*pad*s]});
  const top=off(f,1),bot=off(l,-1).reverse();
  // Stretch the ends out a little so the end seats sit inside.
  const ext=(pts,dir)=>{if(pts.length<2)return pts;const a=pts[0],b=pts[1],z=pts[pts.length-1],y=pts[pts.length-2],e=(p,q)=>{const dx=p[0]-q[0],dy=p[1]-q[1],L=Math.hypot(dx,dy)||1;return [p[0]+dx/L*pad,p[1]+dy/L*pad]};return [e(a,b),...pts.slice(1,-1),e(z,y)]};
  const pts=[...ext(top),...ext(bot)];return 'M'+pts.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join('L')+'Z'}
/** A seated block: a soft floor under the rows, row letters at both ends, then the seats. */
function blockSVG(b,o){const rows=blockRows(b),col=o.color,st=o.seatState||(()=>'free'),mine=o.mine||new Set(),T=o.target,dim=o.dim&&!(T&&T.block===b.id);
  let s=`<g class="smblock${o.edit?' el':''}" data-id="${esc(b.id)}" ${dim?'opacity=".35"':''}>`;
  const hp=hullPath(rows,R+7);
  if(rows[0]?.seats.length)s+=`<path d="${hp}" fill="${col}" fill-opacity=".09" stroke="${col}" stroke-opacity=".09" stroke-width="14" stroke-linejoin="round"/>`;
  rows.forEach(r=>{const a=r.seats[0],z=r.seats[r.seats.length-1];if(!a)return;
    const lab=(p,q)=>{const dx=p.x-q.x,dy=p.y-q.y,L=Math.hypot(dx,dy)||1;return `<text x="${(p.x+dx/L*11).toFixed(1)}" y="${(p.y+dy/L*11+2.6).toFixed(1)}" text-anchor="middle" font-size="7" font-weight="700" fill="#8a90aa" ${NS}>${r.row}</text>`};
    s+=r.seats.length>1?lab(a,r.seats[1])+lab(z,r.seats[r.seats.length-2]):lab(a,{x:a.x+1,y:a.y})});
  const pick=o.pick&&!b.closed;
  if(b.free&&!o.edit){const q=o.bcart?.[b.id]||0,out=!q&&(b.closed||b.left===0),tg=T&&T.block===b.id,bb=blockBox(b),cx=bb.x+bb.w/2,cy=bb.y+bb.h/2+6;
    s=s.replace('<g class="smblock','<g '+(pick&&!out?`data-a="bq" data-v="${b.id}:1" role="button" aria-label="${esc(b.name)}, free seating, add one"`:'')+' class="smblock'+(pick&&!out?' smfree':''));
    rows.forEach(r=>r.seats.forEach(p=>{s+=`<circle cx="${p.x}" cy="${p.y}" r="${R-.6}" fill="${out?'#d3d8e1':col}" opacity="${q||tg?.9:.42}"/>`}));
    const w=Math.min(bb.w-8,150),lab=o.route?'Free seating':out?'Sold out':`Free seating · ${egp(b.price)}`;
    s+=`<rect x="${cx-w/2}" y="${cy-15}" width="${w}" height="${q?40:30}" rx="9" fill="#fff" stroke="${col}" stroke-width="${q||tg?2:1}" opacity=".96"/><text x="${cx}" y="${cy+4}" text-anchor="middle" font-size="10.5" font-weight="800" fill="#12153f" ${NS}>${lab}</text>${q?`<text x="${cx}" y="${cy+18}" text-anchor="middle" font-size="9.5" font-weight="700" fill="#5b6280" ${NS}>${q} picked</text>`:''}`;
    if(o.labels!==false)s+=`<text x="${cx}" y="${bb.y+9}" text-anchor="middle" font-size="10" font-weight="800" fill="#12153f" letter-spacing=".6" ${NS}>${esc(b.name.toUpperCase())}</text>`;
    return s+'</g>'}
  rows.forEach(r=>r.seats.forEach(p=>{const id=b.seatIds?.[p.label],k=o.edit?'free':id?(mine.has(id)?'mine':st(id)):'gone';
    const tgt=T&&T.seat===id;
    if(k==='gone'&&!o.edit){s+=`<circle cx="${p.x}" cy="${p.y}" r="2" fill="#d7dbe3"/>`;return}
    const tip=`${b.name} · Row ${p.row}, Seat ${p.num}`;
    const act=o.seatAction||'seat';
    if(k==='mine'||tgt)s+=`<g ${pick?`data-a="${act}" data-v="${id}" class="sms"`:''} data-tip="${esc(tip)}"><circle cx="${p.x}" cy="${p.y}" r="${R+1.2}" fill="#12153f" stroke="#fff" stroke-width="1.4"/><text x="${p.x}" y="${p.y+2.3}" text-anchor="middle" font-size="6.2" font-weight="800" fill="#fff" ${NS}>${p.num}</text></g>`;
    else if(k==='held')s+=`<circle cx="${p.x}" cy="${p.y}" r="${R-.6}" fill="#fff" stroke="#aeb5c4" stroke-width="1.3" stroke-dasharray="2 1.6" data-tip="${esc(tip)} · on hold"/>`;
    else if(k==='sold'||b.closed)s+=`<circle cx="${p.x}" cy="${p.y}" r="${R-1.3}" fill="#d3d8e1" data-tip="${esc(tip)} · sold"/>`;
    else s+=`<circle cx="${p.x}" cy="${p.y}" r="${R}" fill="${col}" ${pick?`data-a="${act}" data-v="${id}" class="sms"`:''} data-tip="${esc(tip)} · ${egp(b.price)}"/>`}));
  const f=rows[0]?.seats,mid=f&&f[Math.floor(f.length/2)];
  if(o.edit&&b.free){const bb=blockBox(b);s+=`<rect x="${bb.x+bb.w/2-44}" y="${bb.y+bb.h/2-10}" width="88" height="20" rx="7" fill="#fff" opacity=".95"/><text x="${bb.x+bb.w/2}" y="${bb.y+bb.h/2+4}" text-anchor="middle" font-size="10" font-weight="800" fill="#12153f" ${NS}>FREE SEATING</text>`}
  if(mid&&o.labels!==false){const bb=blockBox(b);s+=`<text x="${bb.x+bb.w/2}" y="${bb.y+9}" text-anchor="middle" font-size="10" font-weight="800" fill="#12153f" letter-spacing=".6" ${NS}>${esc(b.name.toUpperCase())}</text>`}
  if(T&&T.block===b.id&&T.seat){const p=rows.flatMap(r=>r.seats).find(p=>b.seatIds?.[p.label]===T.seat);if(p)s+=`<circle cx="${p.x}" cy="${p.y}" r="${R+5}" fill="none" stroke="#12153f" stroke-width="2" class="smpulse"/>`}
  return s+'</g>'}

/**
 * The whole map as SVG content (no outer <svg>).
 * ev: {layout, types, tz} in the app's event format. o: {mode:'pick'|'view'|'route'|'edit', mine, seatState, tableState, cart, target, route}
 */
function draw(ev,o={}){
  const L=ev.layout,B=bounds(L),T=tiers(ev),route=o.mode==='route',edit=o.mode==='edit',pick=o.mode==='pick',dim=route&&!!o.target;
  let s=defs();
  if(!edit)s+=`<rect x="${B.x+6}" y="${B.y+6}" width="${B.w-12}" height="${B.h-12}" rx="22" fill="#fbfbfd" stroke="#dde2ea" stroke-width="2"/>`;
  // Areas and table zones: quiet floor patches.
  L.filter(e=>e.kind==='zone').forEach(z=>{const Z=(ev.tz||[]).find(t=>t.id===z.area),c=Z&&Z.price!=null?colorOf(T,Z.price):'#8b93a8',tg=o.target&&o.target.area===z.area;
    s+=`<g ${edit?`class="el" data-id="${z.id}"`:''} ${dim&&!tg?'opacity=".45"':''}><rect x="${z.x}" y="${z.y}" width="${z.w}" height="${z.h}" rx="18" fill="${c}" fill-opacity=".05" stroke="${c}" stroke-opacity=".35" stroke-width="1.4" stroke-dasharray="5 5"/><text x="${z.x+14}" y="${z.y+21}" font-size="12" font-weight="800" fill="${c}" letter-spacing=".5" ${NS}>${esc((Z?Z.name:'Area').toUpperCase())}</text></g>`});
  // Standing: hatched floor with its price.
  L.filter(e=>e.kind==='standing').forEach(f=>{const t=(ev.types||[])[f.type];if(!t&&!edit)return;const out=t&&(t.closed||(t.qty-t.sold)<=0)&&!(o.cart&&o.cart[f.type]),c=out?'#a9b0bf':colorOf(T,t?t.price:0),q=o.cart?.[f.type]||0,tg=o.target&&o.target.type===f.type;
    const cx=f.x+f.w/2,cy=f.y+f.h/2,fs=Math.max(11,Math.min(20,f.w/9));
    s+=`<g ${edit?`class="el" data-id="${f.id}"`:pick&&!out?`data-a="tk" data-v="${f.type}:1" class="smst" role="button" aria-label="${esc(t?t.name:'Standing')}, add one ticket"`:''} style="color:${c}" ${dim&&!tg?'opacity=".4"':''}><rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="16" fill="${c}" fill-opacity="${q||tg?.24:.12}" stroke="${c}" stroke-width="${q||tg?3:1.6}"/><rect x="${f.x}" y="${f.y}" width="${f.w}" height="${f.h}" rx="16" fill="url(#smh)"/>
      <text x="${cx}" y="${cy-3}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#12153f" ${NS}>${esc(t?t.name:'Standing')}</text><text x="${cx}" y="${cy+fs-2}" text-anchor="middle" font-size="${fs*.68}" font-weight="600" fill="#5b6280" ${NS}>${route?'Standing':out?'Sold out':'Standing'+(t?' · '+egp(t.price):'')}${q?` · ${q} picked`:''}</text></g>`});
  // Room pieces.
  L.forEach(f=>{if(f.kind==='stage')s+=wrapEl(edit,f,stageSVG(f,B,dim));else if(f.kind==='bar')s+=wrapEl(edit,f,barSVG(f,dim));else if(f.kind==='dj')s+=wrapEl(edit,f,djSVG(f,dim));else if(f.kind==='entrance')s+=wrapEl(edit,f,doorSVG(f,B))});
  // Seated blocks.
  L.filter(e=>e.kind==='block').forEach(b=>s+=blockSVG(b,{color:b.closed?'#a9b0bf':route?(b.free&&o.target?.block===b.id?'#00a7c9':'#b4bbcf'):colorOf(T,b.price),seatState:o.seatState,mine:o.mine,pick,edit,target:o.target,dim,bcart:o.bcart,route,seatAction:o.seatAction}));
  // Tables.
  L.filter(isT).forEach(t=>{const zid=o.zoneOf?o.zoneOf(t):null,Z=(ev.tz||[]).find(z=>z.id===zid),c=Z&&Z.price!=null?colorOf(T,Z.price):'#8b93a8';
    const st=o.tableState?o.tableState(t):'free',mine=o.mine&&o.mine.has(t.id),tg=o.target&&o.target.table===t.id;
    const fill=mine||tg?'#12153f':st==='sold'||st==='held'||(Z&&Z.closed)?'#d3d8e1':route?'#e3e7ee':c,ink=mine||tg?'#fff':st==='free'&&!route&&!(Z&&Z.closed)?'#fff':'#7d849c';
    const ok=pick&&st==='free'&&!(Z&&Z.closed)||pick&&mine;
    s+=`<g ${edit?`class="el" data-id="${t.id}"`:ok?`data-a="tbl" data-v="${t.id}" class="smtb" role="button" aria-label="Table ${esc(t.name)}"`:''} data-tip="${esc('Table '+t.name+' · '+t.seats+' seats'+(Z&&!route?' · '+egp(Z.price*t.seats):'')+(st==='held'?' · on hold':st==='sold'?' · sold':''))}" ${dim&&!tg?'opacity=".45"':''}><g transform="translate(${t.x} ${t.y}) rotate(${t.rot||0})">${furn(t,fill,true).svg}</g><text x="${t.x}" y="${t.y+5}" text-anchor="middle" font-size="14" font-weight="800" fill="${ink}" ${NS}>${mine?'✓ ':''}${esc(t.name)}</text>${tg?`<circle cx="${t.x}" cy="${t.y}" r="${Math.max(ebox(t).w,ebox(t).h)/2+6}" fill="none" stroke="#12153f" stroke-width="2.5" class="smpulse"/>`:''}</g>`});
  if(o.route&&o.route.length>1){const d='M'+o.route.map(p=>p[0].toFixed(1)+' '+p[1].toFixed(1)).join('L'),a=o.route[0],z=o.route[o.route.length-1];
    s+=`<path d="${d}" fill="none" stroke="#fff" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/><path d="${d}" fill="none" stroke="#00a7c9" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 9" class="smroute"/>
    <g><circle cx="${a[0]}" cy="${a[1]}" r="11" fill="#00a7c9" stroke="#fff" stroke-width="3"/><text x="${a[0]}" y="${a[1]+4}" text-anchor="middle" font-size="11" font-weight="800" fill="#fff" ${NS}>IN</text></g>
    <g transform="translate(${z[0]} ${z[1]})"><path d="M0 -4c-6 -9 -14 -13 -14 -23a14 14 0 0 1 28 0c0 10 -8 14 -14 23z" fill="#12153f" stroke="#fff" stroke-width="2.5" transform="translate(0 -2)"/><circle cx="0" cy="-29" r="5" fill="#fff"/></g>`}
  return {svg:s,box:B,tiers:T}}
const wrapEl=(edit,f,inner)=>edit?`<g class="el" data-id="${f.id}">${inner}</g>`:inner;

/* ---------- pan and zoom ---------- */
const VIEWS={};
const clampVB=(v,B)=>{const minW=Math.max(70,B.w/12);v.w=Math.max(minW,Math.min(B.w*1.25,v.w));v.h=v.w*(v.ar||B.h/B.w);
  v.x=Math.max(B.x-v.w*.4,Math.min(B.x+B.w-v.w*.6,v.x));v.y=Math.max(B.y-v.h*.4,Math.min(B.y+B.h-v.h*.6,v.y));return v};
function fitVB(B,ar){ar=ar||B.h/B.w;let w=B.w,h=B.w*ar;if(h<B.h){h=B.h;w=h/ar}return {x:B.x+(B.w-w)/2,y:B.y+(B.h-h)/2,w,h,ar}}
/**
 * The map in a pan/zoom frame. key keeps the view between renders.
 * The aspect ratio comes from the frame CSS (aspect-ratio), so the view fits the box.
 */
function frame(key,ev,o={}){
  const D=draw(ev,o),B=D.box,ar=o.ar||Math.min(1.25,Math.max(.62,B.h/B.w));
  let v=VIEWS[key];if(!v||v.k!==D.box.w+'|'+D.box.h+'|'+ar){v=VIEWS[key]=Object.assign(fitVB(B,ar),{k:D.box.w+'|'+D.box.h+'|'+ar,B})}
  if(o.focus&&!v.focused){v.focused=true;const f=o.focus,pad=50;let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;f.forEach(([x,y])=>{x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y)});
    const fb={x:x0-pad,y:y0-pad-30,w:Math.max(260,x1-x0+2*pad),h:Math.max(200,y1-y0+2*pad+30)};if(fb.w<B.w*.9||fb.h<B.h*.9)Object.assign(v,clampVB(fitVB(fb,ar),B))}
  v.B=B;const zoomed=v.w<B.w*.85;
  const mini=`<svg class="smmini" viewBox="${B.x} ${B.y} ${B.w} ${B.h}" aria-hidden="true">${miniSVG(ev,D.tiers)}<rect class="smvp" x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}"/></svg>`;
  return `<div class="smap ${zoomed?'zoomed':''} ${o.mode==='route'?'nomini':''}" data-k="${esc(key)}" style="aspect-ratio:${(1/ar).toFixed(3)}"><svg class="smsvg" viewBox="${v.x} ${v.y} ${v.w} ${v.h}" role="img" aria-label="${esc(o.label||'Seat map')}">${D.svg}</svg>
  <div class="smctl"><button data-a="smz" data-v="in" aria-label="Zoom in">+</button><button data-a="smz" data-v="out" aria-label="Zoom out">−</button><button data-a="smz" data-v="fit" aria-label="Show the whole map" class="smfit"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4"/></svg></button></div>${mini}<div class="smtip" hidden></div></div>`}
function miniSVG(ev,T){let s='';ev.layout.forEach(el=>{const b=SM.elBox(el);
  if(el.kind==='block')s+=`<path d="${hullPath(blockRows(el),R+5)}" fill="${colorOf(T,el.price)}" opacity=".75"/>`;
  else if(el.kind==='standing'){const t=(ev.types||[])[el.type];s+=`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="10" fill="${colorOf(T,t?t.price:0)}" opacity=".45"/>`}
  else if(['stage','bar','dj'].includes(el.kind))s+=`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" fill="#12153f"/>`;
  else if(isT(el))s+=`<circle cx="${el.x}" cy="${el.y}" r="${Math.max(b.w,b.h)/2}" fill="#8b93a8" opacity=".7"/>`});return s}
function setVB(box,v){const svg=box.querySelector('.smsvg');svg.setAttribute('viewBox',`${v.x} ${v.y} ${v.w} ${v.h}`);const r=box.querySelector('.smvp');if(r){r.setAttribute('x',v.x);r.setAttribute('y',v.y);r.setAttribute('width',v.w);r.setAttribute('height',v.h)}box.classList.toggle('zoomed',v.w<v.B.w*.85)}
const viewOf=box=>VIEWS[box.dataset.k];
function zoomAt(box,f,px,py){const v=viewOf(box);if(!v)return;const r=box.getBoundingClientRect(),fx=px==null?.5:(px-r.left)/r.width,fy=py==null?.5:(py-r.top)/r.height;
  const mx=v.x+v.w*fx,my=v.y+v.h*fy,w=v.w/f;Object.assign(v,clampVB({...v,w,h:w*v.ar,x:mx-w*fx,y:my-w*v.ar*fy},v.B));setVB(box,v)}
function zoomTo(box,x,y,f){const v=viewOf(box);if(!v)return;const w=v.w/f;Object.assign(v,clampVB({...v,w,h:w*v.ar,x:x-w/2,y:y-w*v.ar/2},v.B));setVB(box,v)}
function fit(box){const v=viewOf(box);if(!v)return;Object.assign(v,fitVB(v.B,v.ar));setVB(box,v)}
/** How many screen pixels one map unit is right now. */
const scaleOf=box=>{const v=viewOf(box);return v?box.getBoundingClientRect().width/v.w:1};
let PT={},pan=null,justPanned=0;
document.addEventListener('wheel',e=>{const box=e.target.closest?.('.smap');if(!box)return;e.preventDefault();zoomAt(box,Math.exp(-e.deltaY*(e.deltaMode?0.05:0.0018)),e.clientX,e.clientY)},{passive:false});
document.addEventListener('pointerdown',e=>{const box=e.target.closest?.('.smap');if(!box||e.target.closest('.smctl'))return;
  if(e.target.closest('.smmini')){const r=e.target.closest('.smmini').getBoundingClientRect(),v=viewOf(box),B=v.B,k=Math.max(B.w/r.width,B.h/r.height);
    const x=B.x+(e.clientX-r.left)*k-(r.width*k-B.w)/2,y=B.y+(e.clientY-r.top)*k-(r.height*k-B.h)/2;Object.assign(v,clampVB({...v,x:x-v.w/2,y:y-v.h/2},B));setVB(box,v);e.preventDefault();return}
  PT[e.pointerId]={x:e.clientX,y:e.clientY};const ids=Object.keys(PT);
  if(ids.length===1){const v=viewOf(box);pan={box,sx:e.clientX,sy:e.clientY,vx:v.x,vy:v.y,moved:false}}
  else if(ids.length===2&&pan){const [a,b]=ids.map(i=>PT[i]);pan.pinch={d:Math.hypot(a.x-b.x,a.y-b.y),w:viewOf(box).w};pan.moved=true}});
document.addEventListener('pointermove',e=>{if(!pan||!PT[e.pointerId])return;PT[e.pointerId]={x:e.clientX,y:e.clientY};const box=pan.box,v=viewOf(box);if(!v)return;const k=v.w/box.getBoundingClientRect().width;
  const ids=Object.keys(PT);
  if(ids.length>=2&&pan.pinch){const [a,b]=ids.map(i=>PT[i]),d=Math.hypot(a.x-b.x,a.y-b.y),cx=(a.x+b.x)/2,cy=(a.y+b.y)/2,f=d/pan.pinch.d,w=pan.pinch.w/f;zoomAt(box,v.w/w,cx,cy);return}
  const dx=e.clientX-pan.sx,dy=e.clientY-pan.sy;if(!pan.moved&&Math.hypot(dx,dy)<6)return;pan.moved=true;box.classList.add('panning');
  Object.assign(v,clampVB({...v,x:pan.vx-dx*k,y:pan.vy-dy*k},v.B));setVB(box,v)});
const endPan=e=>{delete PT[e.pointerId];if(!Object.keys(PT).length&&pan){if(pan.moved)justPanned=Date.now();pan.box.classList.remove('panning');pan=null}};
document.addEventListener('pointerup',endPan);document.addEventListener('pointercancel',endPan);
// A drag is not a tap.
document.addEventListener('click',e=>{if(Date.now()-justPanned<250&&e.target.closest?.('.smap')){e.stopPropagation();e.preventDefault()}},true);
let lastTouch=0;document.addEventListener('touchstart',()=>{lastTouch=Date.now()},{passive:true,capture:true});
document.addEventListener('mouseover',e=>{if(Date.now()-lastTouch<800)return;const box=e.target.closest?.('.smap');if(!box)return;const tip=box.querySelector('.smtip'),t=e.target.closest('[data-tip]');if(!tip)return;
  if(!t){tip.hidden=true;return}const r=box.getBoundingClientRect(),q=t.getBoundingClientRect();tip.textContent=t.dataset.tip;tip.hidden=false;
  tip.style.left=Math.min(r.width-10,Math.max(10,q.left-r.left+q.width/2))+'px';tip.style.top=(q.top-r.top)+'px'});
document.addEventListener('mouseleave',e=>{if(e.target.classList?.contains('smap')){const t=e.target.querySelector('.smtip');if(t)t.hidden=true}},true);

/* ---------- find your seat ---------- */
/** Builds a walking route from the nearest entrance to the target, around the stage, bars, tables and rows. */
function route(ev,target){
  const L=ev.layout,B=bounds(L),cs=4,W=Math.ceil(B.w/cs),H=Math.ceil(B.h/cs),block=new Uint8Array(W*H);
  const cell=(x,y)=>[Math.max(0,Math.min(W-1,Math.floor((x-B.x)/cs))),Math.max(0,Math.min(H-1,Math.floor((y-B.y)/cs)))];
  const rect=(b,pad)=>{const [x0,y0]=cell(b.x-pad,b.y-pad),[x1,y1]=cell(b.x+b.w+pad,b.y+b.h+pad);for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)block[y*W+x]=1};
  const seg=(a,b,r,val=1)=>{const [x0,y0]=cell(Math.min(a.x,b.x)-r,Math.min(a.y,b.y)-r),[x1,y1]=cell(Math.max(a.x,b.x)+r,Math.max(a.y,b.y)+r),dx=b.x-a.x,dy=b.y-a.y,L2=dx*dx+dy*dy||1;
    for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){const px=B.x+(x+.5)*cs,py=B.y+(y+.5)*cs,t=Math.max(0,Math.min(1,((px-a.x)*dx+(py-a.y)*dy)/L2)),qx=a.x+t*dx,qy=a.y+t*dy;if((px-qx)**2+(py-qy)**2<=r*r)block[y*W+x]=val}};
  L.forEach(el=>{if(['stage','bar','dj'].includes(el.kind))rect(el,el.kind==='bar'?16:6);
    else if(isT(el)&&el.id!==target.table)rect(ebox(el),2);
    else if(el.kind==='block')blockRows(el).forEach(r=>{const S2=r.seats;if(S2.length===1)seg(S2[0],S2[0],R+.6);for(let i=1;i<S2.length;i++){const a=S2[i-1],b=S2[i];if(Math.hypot(b.x-a.x,b.y-a.y)>PITCH*1.4){seg(a,a,R+.6);seg(b,b,R+.6)}else seg(a,b,R+.6)}})});
  let goal,info={};
  if(target.seat){const b=L.find(x=>x.id===target.block),rows=b?blockRows(b):[];for(const r of rows){const k=r.seats.findIndex(p=>b.seatIds?.[p.label]===target.seat);if(k>=0){const p=r.seats[k];goal=[p.x,p.y];info={block:b,row:r,idx:k};seg(p,p,R+1.5,0);break}}}
  else if(target.block){const b=L.find(x=>x.id===target.block);if(b){const rows=blockRows(b),r=rows[Math.floor(rows.length/2)].seats,d=L.find(x=>x.kind==='entrance'),dp=d?[d.x+d.w/2,d.y+d.h/2]:[B.x+B.w/2,B.y+B.h];
    const end=(p,q)=>{const dx=p.x-q.x,dy=p.y-q.y,l=Math.hypot(dx,dy)||1;return [p.x+dx/l*PITCH*1.3,p.y+dy/l*PITCH*1.3]};
    const ends=r.length>1?[end(r[0],r[1]),end(r[r.length-1],r[r.length-2])]:[[r[0].x,r[0].y+ROWGAP]];goal=ends.sort((a,c)=>Math.hypot(a[0]-dp[0],a[1]-dp[1])-Math.hypot(c[0]-dp[0],c[1]-dp[1]))[0];info={freeBlock:b}}}
  else if(target.table){const t=L.find(x=>x.id===target.table);if(t)goal=[t.x,t.y]}
  else if(target.type!=null){const z=L.find(x=>x.kind==='standing'&&x.type===target.type);if(z)goal=[z.x+z.w/2,z.y+z.h/2]}
  else if(target.area){const z=L.find(x=>x.kind==='zone'&&x.area===target.area);if(z)goal=[z.x+z.w/2,z.y+z.h/2]}
  if(!goal)return null;
  const doors=L.filter(x=>x.kind==='entrance');const starts=doors.length?doors.map(d=>[d.x+d.w/2,d.y+d.h/2]):[[B.x+B.w/2,B.y+B.h-12]];
  const free=([x,y])=>{let [cx,cy]=cell(x,y);if(!block[cy*W+cx])return [cx,cy];for(let r=1;r<40;r++)for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){const nx=cx+dx,ny=cy+dy;if(nx>=0&&ny>=0&&nx<W&&ny<H&&!block[ny*W+nx])return [nx,ny]}return [cx,cy]};
  const [gx,gy]=cell(goal[0],goal[1]);block[gy*W+gx]=0;
  // A* with a binary heap, 8 directions, from every entrance at once.
  const g=new Float32Array(W*H).fill(Infinity),from=new Int32Array(W*H).fill(-1),heap=[],hs=(x,y)=>{const dx=Math.abs(x-gx),dy=Math.abs(y-gy);return Math.max(dx,dy)+.414*Math.min(dx,dy)};
  const push=(f,i)=>{heap.push([f,i]);let k=heap.length-1;while(k){const p=(k-1)>>1;if(heap[p][0]<=heap[k][0])break;[heap[p],heap[k]]=[heap[k],heap[p]];k=p}};
  const pop=()=>{const top=heap[0],last=heap.pop();if(heap.length){heap[0]=last;let k=0;for(;;){const l=2*k+1,r=l+1;let m=k;if(l<heap.length&&heap[l][0]<heap[m][0])m=l;if(r<heap.length&&heap[r][0]<heap[m][0])m=r;if(m===k)break;[heap[m],heap[k]]=[heap[k],heap[m]];k=m}}return top};
  const startCells=starts.map(free);startCells.forEach(([x,y])=>{const i=y*W+x;g[i]=0;push(hs(x,y),i)});
  const goalI=gy*W+gx;let found=false;
  while(heap.length){const [,i]=pop();if(i===goalI){found=true;break}const x=i%W,y=(i-x)/W;
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;const j=ny*W+nx;if(block[j])continue;if(dx&&dy&&(block[y*W+nx]||block[ny*W+x]))continue;
      const ng=g[i]+(dx&&dy?1.414:1);if(ng<g[j]){g[j]=ng;from[j]=i;push(ng+hs(nx,ny),j)}}}
  if(!found)return {points:[starts[0],goal],info,door:doors[0]};
  let cells=[];for(let i=goalI;i>=0;i=from[i])cells.push(i);cells.reverse();
  const pt=i=>{const x=i%W;return [B.x+(x+.5)*cs,B.y+((i-x)/W+.5)*cs]};
  // Pull the string tight: keep only the corners we cannot see past.
  const sees=(a,b)=>{const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2);for(let k=1;k<n;k++){const [cx,cy]=cell(a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n);if(block[cy*W+cx])return false}return true};
  const P=cells.map(pt),out=[P[0]];let k=0;while(k<P.length-1){let j=P.length-1;while(j>k+1&&!sees(P[k],P[j]))j--;out.push(P[j]);k=j}
  out[out.length-1]=goal;
  const si=startCells.findIndex(([x,y])=>cells[0]===y*W+x);
  return {points:out,info,door:doors[Math.max(0,si)]}}
/** Plain-language steps for the route. */
function steps(r,what){const s=[];if(!r)return s;const ord=n=>{const v=n%100;return n+(v>=11&&v<=13?'th':({1:'st',2:'nd',3:'rd'}[n%10]||'th'))};
  s.push(r.door?`Come in through the ${esc(r.door.name||'entrance')}.`:'Come in through the main door.');
  if(r.info.block){const {block:b,row,idx}=r.info,n=row.seats.length,pts=r.points,prev=pts[Math.max(0,pts.length-3)]||pts[0],a=row.seats[0],z=row.seats[n-1];
    const fromStart=Math.hypot(prev[0]-a.x,prev[1]-a.y)<=Math.hypot(prev[0]-z.x,prev[1]-z.y),k=fromStart?idx+1:n-idx;
    s.push(`Follow the line to <b>${esc(b.name)}</b>.`);s.push(`Go to <b>row ${esc(row.row)}</b> and walk in from the ${fromStart?'first':'last'} seat of the row.`);s.push(`Your seat is <b>${row.seats[idx].num}</b>, the ${ord(k)} seat in.`)}
  else if(r.info.freeBlock)s.push(`Follow the line to <b>${esc(r.info.freeBlock.name)}</b>. It is free seating: take any empty seat in it.`);
  else if(what)s.push(what);
  return s}

return {busy:()=>!!pan,fit,PITCH,ROWGAP,R,BDEF,blockRows,blockSeats,blockBox,newBlock,bounds,elBox,tiers,colorOf,draw,frame,route,steps,zoomAt,zoomTo,scaleOf,VIEWS,rowName,TIER}})();
