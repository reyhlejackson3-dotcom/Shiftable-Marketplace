/* Shiftable dot system.
   White dots drift around the page. Each section header ([data-dots-word]) is real text in the page, and the dots
   crumble out of one header, travel, and merge into the next as you scroll. When a word is formed it is drawn solid. */
(function(){
  'use strict';
  var canvas=document.getElementById('dots');
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var heads=[].slice.call(document.querySelectorAll('[data-dots-word]'));
  if(!canvas||!canvas.getContext||!heads.length){return}
  var ctx=canvas.getContext('2d');
  var small=window.innerWidth<720;
  var N=small?2400:3800;
  var DPR=1,W=0,H=0;
  var words=[];            // {tx,ty,r,font,text,cx,cy,align,tw}
  var amb=[];              // ambient dots
  var ready=false,mouse={x:-9999,y:-9999};
  var rnd=function(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;var t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}};
  var R=rnd(42);
  // per-particle randomness (fixed so scrolling back and forth is deterministic)
  var delay=new Float32Array(N),amp=new Float32Array(N),scat=new Float32Array(N),ang=new Float32Array(N),ph=new Float32Array(N),sz=new Float32Array(N);
  for(var i=0;i<N;i++){delay[i]=R();amp[i]=(R()-.5)*2*(60+R()*220);scat[i]=60+R()*260;ang[i]=R()*6.2832;ph[i]=R()*6.2832;sz[i]=R()}
  var px=new Float32Array(N),py=new Float32Array(N);

  function ease(t){return t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2}
  function smooth(t){t=t<0?0:t>1?1:t;return t*t*(3-2*t)}
  function clamp(v,a,b){return v<a?a:v>b?b:v}

  function sizeCanvas(){
    DPR=Math.min(window.devicePixelRatio||1,2);W=window.innerWidth;H=window.innerHeight;
    canvas.width=Math.round(W*DPR);canvas.height=Math.round(H*DPR);
    ctx.setTransform(DPR,0,0,DPR,0,0);
  }
  function makeAmbient(){
    amb=[];var n=small?110:230,r=rnd(7);
    for(var i=0;i<n;i++){var d=r();amb.push({x:r()*W,y:r()*H,vx:(r()-.5)*10,vy:(r()-.5)*10,r:.5+d*1.7,a:.25+d*.65,d:.2+d*.9,t:r()*6.28,tw:.6+r()*1.6})}
  }

  // measure each header and turn its text into N target points in page coordinates
  var off=document.createElement('canvas'),octx=off.getContext('2d',{willReadFrequently:true});
  function build(){
    words=[];var sx=window.scrollX,sy=window.scrollY;
    heads.forEach(function(el){
      var cs=getComputedStyle(el),size=parseFloat(cs.fontSize),text=(el.textContent||'').trim();
      var font=cs.fontWeight+' '+size+'px '+cs.fontFamily;
      octx.font=font;var tw=Math.ceil(octx.measureText(text).width);
      var pad=Math.ceil(size*0.25),ow=tw+pad*2,oh=Math.ceil(size*1.5);
      off.width=ow;off.height=oh;octx.font=font;octx.fillStyle='#fff';octx.textBaseline='middle';octx.textAlign='left';
      octx.fillText(text,pad,oh/2+size*0.04);
      var data=octx.getImageData(0,0,ow,oh).data,pts=[];
      for(var y=0;y<oh;y++){for(var x=0;x<ow;x++){if(data[(y*ow+x)*4+3]>140)pts.push(x,y)}}
      var M=pts.length/2,rect=el.getBoundingClientRect();
      var ta=cs.textAlign,left=ta==='center'?rect.left+(rect.width-tw)/2:(ta==='right'||ta==='end')?rect.right-tw:rect.left;
      var cx=left+sx,cy=rect.top+sy+rect.height/2;
      var ox=cx-pad,oy=cy-oh/2;
      // choose N points (random, then ordered left to right so letters flow to letters)
      var idx=new Array(N),r=rnd(3+words.length*11);
      for(var i=0;i<N;i++){idx[i]=M>0?Math.floor(r()*M):0}
      idx.sort(function(a,b){return pts[a*2]-pts[b*2]||pts[a*2+1]-pts[b*2+1]});
      var tx=new Float32Array(N),ty=new Float32Array(N);
      for(var j=0;j<N;j++){tx[j]=ox+pts[idx[j]*2]+ (r()-.5);ty[j]=oy+pts[idx[j]*2+1]+(r()-.5)}
      var rad=clamp(1.3*Math.sqrt(Math.max(M,1)/(N*Math.PI)),.9,3.2);
      words.push({tx:tx,ty:ty,r:rad,font:font,text:text,x:cx,y:cy,tw:tw});
    });
    ready=true;
  }

  // scroll range for each transition
  function range(k){
    var vh=H,a=words[k].y-.2*vh,b=words[k+1].y-.36*vh;
    if(b<a+240)b=a+240;
    // the last word must be fully formed by the time you reach the bottom of the page
    if(k===words.length-2){var maxS=Math.max(0,document.documentElement.scrollHeight-vh);if(b>maxS-30)b=Math.max(a+120,maxS-30)}
    return[a,b];
  }

  var last=performance.now(),T=0;
  function frame(now){
    var dt=Math.min(.05,(now-last)/1000);last=now;T+=dt;
    var sy=window.scrollY,sx=window.scrollX;
    ctx.clearRect(0,0,W,H);
    // ambient dots: slow drift, gentle parallax with scroll, soft push from the cursor
    for(var i=0;i<amb.length;i++){
      var a=amb[i];
      if(!reduce){a.x+=a.vx*dt;a.y+=a.vy*dt}
      if(a.x<-10)a.x=W+10;if(a.x>W+10)a.x=-10;if(a.y<-10)a.y=H+10;if(a.y>H+10)a.y=-10;
      var dy=((a.y-sy*a.d*.18)%H+H)%H,dx=a.x;
      var mx=dx-mouse.x,my=dy-mouse.y,d2=mx*mx+my*my;
      if(d2<14000&&!reduce){var f=(1-d2/14000)*26,dd=Math.sqrt(d2)||1;dx+=mx/dd*f;dy+=my/dd*f}
      var tw=reduce?1:.65+.35*Math.sin(T*a.tw+a.t);
      ctx.globalAlpha=a.a*tw;ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(dx,dy,a.r,0,6.2832);ctx.fill();
    }
    ctx.globalAlpha=1;
    if(!ready||words.length<1){requestAnimationFrame(frame);return}
    var K=words.length;
    // progress of every transition
    var u=new Array(K-1);
    for(var k=0;k<K-1;k++){var rg=range(k);u[k]=clamp((sy-rg[0])/(rg[1]-rg[0]),0,1);if(reduce)u[k]=u[k]>.5?1:0}
    // solid words
    ctx.fillStyle='#fff';ctx.textBaseline='middle';ctx.textAlign='left';
    for(var k=0;k<K;k++){
      var appear=k===0?1:smooth((u[k-1]-.9)/.1);
      var gone=k===K-1?1:1-smooth(u[k]/.05);
      var al=Math.min(appear,gone);
      if(al<=.001)continue;
      var w=words[k],yy=w.y-sy;
      if(yy<-400||yy>H+400)continue;
      ctx.globalAlpha=al;ctx.font=w.font;ctx.fillText(w.text,w.x-sx,yy+parseFloat(w.font.split(' ')[1])*0.04);
    }
    ctx.globalAlpha=1;
    // dots in flight
    for(var k=0;k<K-1;k++){
      var uk=u[k];if(uk<=0||uk>=1)continue;
      var A=words[k],B=words[k+1],rg2=0;
      ctx.beginPath();
      for(var i=0;i<N;i++){
        var lp=clamp((uk-delay[i]*.4)/.6,0,1),e=ease(lp);
        var ax=A.tx[i]-sx,ay=A.ty[i]-sy,bx=B.tx[i]-sx,by=B.ty[i]-sy;
        var x=ax+(bx-ax)*e,y=ay+(by-ay)*e;
        var vx=bx-ax,vy=by-ay,vl=Math.sqrt(vx*vx+vy*vy)||1,nx=-vy/vl,ny=vx/vl;
        var bulge=Math.sin(Math.PI*e);
        x+=(nx*amp[i]+Math.cos(ang[i])*scat[i]*.55)*bulge;y+=(ny*amp[i]+Math.sin(ang[i])*scat[i]*.55)*bulge;
        if(!reduce){x+=Math.sin(T*.9+ph[i])*7*bulge;y+=Math.cos(T*.8+ph[i]*1.3)*7*bulge}
        // keep the dots near the camera while the page scrolls under them
        var mx=x-mouse.x,my=y-mouse.y,d2=mx*mx+my*my;if(d2<9000&&bulge>.05&&!reduce){var f=(1-d2/9000)*30*bulge,dd=Math.sqrt(d2)||1;x+=mx/dd*f;y+=my/dd*f}
        var rr=A.r+(B.r-A.r)*e;rr*=1+.35*bulge*(sz[i]-.4);
        ctx.moveTo(x+rr,y);ctx.arc(x,y,rr,0,6.2832);
      }
      ctx.fillStyle='#fff';ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  window.addEventListener('mousemove',function(e){mouse.x=e.clientX;mouse.y=e.clientY},{passive:true});
  window.addEventListener('mouseleave',function(){mouse.x=mouse.y=-9999});
  var rt;function relayout(){clearTimeout(rt);rt=setTimeout(function(){small=window.innerWidth<720;sizeCanvas();makeAmbient();build()},120)}
  window.addEventListener('resize',relayout);
  if('ResizeObserver' in window){new ResizeObserver(relayout).observe(document.body)}

  var fonts=document.fonts?Promise.all([document.fonts.load('800 100px Syne'),document.fonts.ready]):Promise.resolve();
  Promise.race([fonts,new Promise(function(r){setTimeout(r,3500)})]).then(function(){
    sizeCanvas();makeAmbient();build();document.documentElement.classList.add('dots-on');requestAnimationFrame(frame);
    window.__dots={ready:true,words:function(){return words.length}};
  });
})();
