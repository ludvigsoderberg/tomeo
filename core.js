(()=>{
const rad=d=>d*Math.PI/180, deg=r=>r*180/Math.PI, norm=a=>((a%360)+360)%360, wrap=a=>((a+540)%360)-180;
const TOMEO={lat:39.59669,lon:2.62236}; // 39°35'48.1"N 2°37'20.5"E
const POINTS=["north","north-east","east","south-east","south","south-west","west","north-west"];
const q=new URLSearchParams(location.search);
const DEMO=q.has("demo"), TRIM=Number(q.get("trim"))||0; // ?demo = fake Stockholm position, drag the dial; ?trim=N = degrees added to the compass
const DEMO_POS={lat:59.3293,lon:18.0686,acc:10};
const reduce=matchMedia("(prefers-reduced-motion:reduce)").matches;

const bearingTo=a=>{const dl=rad(TOMEO.lon-a.lon);
  return norm(deg(Math.atan2(Math.sin(dl)*Math.cos(rad(TOMEO.lat)),Math.cos(rad(a.lat))*Math.sin(rad(TOMEO.lat))-Math.sin(rad(a.lat))*Math.cos(rad(TOMEO.lat))*Math.cos(dl))))};
const distKm=a=>{const dp=rad(TOMEO.lat-a.lat),dl=rad(TOMEO.lon-a.lon),
  h=Math.sin(dp/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(TOMEO.lat))*Math.sin(dl/2)**2;return 12742*Math.asin(Math.sqrt(h))};
const decYear=()=>{const d=new Date(),y=d.getUTCFullYear();return y+(d-Date.UTC(y,0,1))/(Date.UTC(y+1,0,1)-Date.UTC(y,0,1))};
const fmt=n=>Math.round(n).toLocaleString("en-US");
const eta=km=>{const h=km/5; // 5 km/h, 8 h a day
  if(h<1)return Math.max(1,Math.round(h*60))+" min";
  if(h<8)return Math.round(h)+" h";
  const d=Math.round(h/8);return d+(d===1?" day":" days")};

const st={pos:null,mag:null,decl:0,h:null,shownKm:null,enabled:false,err:null,noCompass:false,introAt:null,locked:false,demoH:0};

function onOrient(e){
  if(typeof e.webkitCompassHeading==="number")st.mag=e.webkitCompassHeading; // iOS: magnetic north, clockwise
  else if(e.absolute&&typeof e.alpha==="number")st.mag=norm(360-e.alpha);   // Android Chrome (deviceorientationabsolute)
}
function onPos(p){
  st.pos={lat:p.coords.latitude,lon:p.coords.longitude,acc:p.coords.accuracy};
  st.decl=WMM.declination(st.pos.lat,st.pos.lon,decYear());
  st.err=null;
}
function onPosErr(e){
  st.err=e.code===1?"Location blocked. Allow location for this site in Safari settings, then reload."
    :e.code===2?"Can't get a position. Go outside or check Location Services."
    :"Location timed out. Retrying.";
}

async function enable(){
  st.err=null;
  try{
    if(!isSecureContext)throw new Error("Compass and GPS only work over HTTPS.");
    if(!("geolocation" in navigator))throw new Error("This browser has no location support.");
    const D=window.DeviceOrientationEvent;
    const perm=D&&typeof D.requestPermission==="function"?D.requestPermission():null; // iOS: must start inside the tap
    navigator.geolocation.watchPosition(onPos,onPosErr,{enableHighAccuracy:true,maximumAge:5000,timeout:20000});
    if(perm&&(await perm)!=="granted")throw new Error("Compass blocked. Reload the page and allow motion and orientation access.");
    addEventListener("deviceorientationabsolute",onOrient,true);
    addEventListener("deviceorientation",onOrient,true);
    st.enabled=true;
    setTimeout(()=>{if(st.mag==null)st.noCompass=true},4000);
    return true;
  }catch(e){st.err=e.message;return false}
}

function start(dial,ui){
  if(DEMO){st.pos=DEMO_POS;st.enabled=true;let drag=null;
    dial.addEventListener("pointerdown",e=>{dial.setPointerCapture(e.pointerId);const r=dial.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
      drag={cx,cy,a:Math.atan2(e.clientY-cy,e.clientX-cx),h:st.demoH}});
    dial.addEventListener("pointermove",e=>{if(drag)st.demoH=drag.h-deg(Math.atan2(e.clientY-drag.cy,e.clientX-drag.cx)-drag.a)});
    ["pointerup","pointercancel"].forEach(ev=>dial.addEventListener(ev,()=>drag=null));
  }
  const frame=now=>{
    const pos=st.pos, km=pos?distKm(pos):null, brg=pos?bearingTo(pos):null;
    const th=DEMO?st.demoH:st.mag!=null?norm(st.mag+st.decl+TRIM):null;
    if(th!=null)st.h=DEMO||st.h==null?th:norm(st.h+wrap(th-st.h)*(reduce?1:.2));
    if(pos&&st.h!=null&&st.introAt==null)st.introAt=reduce?-1e9:now;
    const u=st.introAt==null?9:(now-st.introAt)/1000, intro=u<3.2;
    const off=intro?300*Math.exp(-u/.9)*Math.cos(2*Math.PI*.8*u):0;
    const hv=st.h==null?0:norm(st.h-off);
    const rel=brg==null?null:wrap(brg-hv);
    if(rel!=null&&st.h!=null&&!intro){const a=Math.abs(rel);if(!st.locked&&a<4)st.locked=true;else if(st.locked&&a>7)st.locked=false}
    else st.locked=false;
    let dist=null;
    if(km!=null){
      st.shownKm=st.shownKm==null?0:Math.abs(km-st.shownKm)<.001?km:st.shownKm+(km-st.shownKm)*.12;
      dist=km<1?{v:fmt(st.shownKm*1000),u:"m"}:{v:fmt(st.shownKm),u:"km"};
    }
    const msg=st.err||(!st.enabled?"Tap Enable compass to face Tomeo.":!pos?"Finding your location…":st.h==null?(st.noCompass?"No compass data. Use an iPhone, away from magnets.":"Reading the compass…"):null);
    ui({hv,rel,locked:st.locked,dist,brg,point:brg==null?null:POINTS[Math.round(brg/45)%8],eta:km==null?null:eta(km),msg,here:km!=null&&km<.03,enabled:st.enabled,haveHeading:st.h!=null});
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

window.T={rad,deg,enable,start,demo:DEMO,
  donkey:c=>`
    ${c.neck?`<path d="M52 130 Q40 190 16 232 Q100 266 184 232 Q160 190 148 130Z" fill="${c.body}"/>`:""}
    <g class="ear l"><ellipse cx="60" cy="48" rx="16" ry="34" transform="rotate(-16 60 48)" fill="${c.body}"/><ellipse cx="60" cy="52" rx="7" ry="21" transform="rotate(-16 60 52)" fill="${c.inner}"/></g>
    <g class="ear r"><ellipse cx="140" cy="48" rx="16" ry="34" transform="rotate(16 140 48)" fill="${c.body}"/><ellipse cx="140" cy="52" rx="7" ry="21" transform="rotate(16 140 52)" fill="${c.inner}"/></g>
    <path d="M52 72 Q100 48 148 72 Q160 122 142 170 Q128 204 100 208 Q72 204 58 170 Q40 122 52 72Z" fill="${c.body}"/>
    <path d="M66 74 L72 46 L82 64 L88 34 L97 62 L103 30 L112 62 L120 40 L126 66 L134 74 Q100 84 66 74Z" fill="${c.mane}"/>
    <ellipse cx="100" cy="182" rx="35" ry="26" fill="${c.muzzle}"/>
    <ellipse cx="89" cy="184" rx="4.5" ry="6" fill="${c.dark}"/><ellipse cx="111" cy="184" rx="4.5" ry="6" fill="${c.dark}"/>
    <circle cx="66" cy="146" r="11" fill="${c.cheek}" opacity=".5"/><circle cx="134" cy="146" r="11" fill="${c.cheek}" opacity=".5"/>
    <circle cx="76" cy="110" r="12" fill="${c.ring||"none"}"/><circle cx="124" cy="110" r="12" fill="${c.ring||"none"}"/>
    <circle cx="76" cy="110" r="8" fill="${c.dark}"/><circle cx="124" cy="110" r="8" fill="${c.dark}"/>
    <circle cx="79" cy="107" r="2.6" fill="#fff"/><circle cx="127" cy="107" r="2.6" fill="#fff"/>`
};
})();
