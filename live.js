/* Shiftable live content loader. Add to any client site:
   <script>window.SHIFTABLE={site:"program-builder"}</script>
   <script src="https://getshiftable.com/live.js"></script>
   Mark editable things: <h1 data-live="home.headline">Fallback text</h1>
   <img data-live="home.photo" src="fallback.jpg">  Fallback shows if anything fails.
   Inside the getshiftable.com dashboard the same page becomes click-to-edit. */
(function(){
  var URL_="https://obuudbrlurybwcvuungr.supabase.co", KEY="sb_publishable_uyqV26xV1aLF_HjhIdCYcA_fUgo0KkY";
  var cfg=window.SHIFTABLE||{}; if(!cfg.site||!URL_) return;
  var PARENTS=["https://getshiftable.com","https://www.getshiftable.com"];
  var embedded=window.parent!==window && /[?&]shiftable-edit=1/.test(location.search);
  var h={apikey:KEY}, kinds={}, labels={}, loaded=false, hello=null, editing=false;
  function fmt(v){return String(v).replace(/[&<>"]/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]}).replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/\n/g,"<br>")}
  function ser(n){var o="";n.childNodes.forEach(function(c){
    if(c.nodeType===3)o+=c.nodeValue;
    else if(c.nodeType===1){var t=c.tagName;
      if(t==="BR")o+="\n";else if(t==="STRONG"||t==="B")o+="**"+ser(c)+"**";
      else if(t==="DIV"||t==="P")o+="\n"+ser(c);else o+=ser(c)}});
    return o.replace(/ /g," ")}
  function all(k){return document.querySelectorAll('[data-live="'+k+'"]')}
  function setImg(k,u){all(k).forEach(function(el){if(el.tagName==="IMG")el.src=u;else el.style.backgroundImage="url("+u+")"})}
  function post(m){try{window.parent.postMessage(m,hello)}catch(e){}}

  if(embedded) window.addEventListener("message",function(e){
    if(PARENTS.indexOf(e.origin)<0||e.source!==window.parent)return;
    var d=e.data||{};
    if(d.type==="sh-hello"){hello=e.origin;if(loaded)start()}
    else if(d.type==="sh-set-image"&&d.key&&d.url)setImg(d.key,d.url);
  });

  function pick(key){var i=document.createElement("input");i.type="file";i.accept="image/*";
    i.onchange=function(){if(i.files[0])post({type:"sh-photo",key:key,file:i.files[0]})};i.click()}

  function start(){
    if(editing||!hello)return;editing=true;
    var st=document.createElement("style");
    st.textContent=".sh-ed{outline:2px dashed transparent!important;outline-offset:3px;cursor:text!important;transition:outline-color .15s}.sh-ed:hover{outline-color:rgba(255,159,26,.85)!important}.sh-ed:focus{outline:2px solid #ff9f1a!important}.sh-img{cursor:pointer!important;outline:2px dashed transparent!important;outline-offset:-2px}.sh-img:hover{outline-color:rgba(255,159,26,.95)!important}#sh-pills{position:fixed;left:12px;bottom:12px;z-index:2147483647;display:flex;flex-direction:column;gap:6px}#sh-pills button{background:#ff9f1a;color:#1a1100;border:0;border-radius:999px;padding:8px 14px;font:600 13px system-ui,sans-serif;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.35)}";
    document.head.appendChild(st);
    document.addEventListener("click",function(e){var a=e.target.closest&&e.target.closest("a");if(a)e.preventDefault()},true);
    document.addEventListener("submit",function(e){e.preventDefault()},true);
    var pills=[];
    document.querySelectorAll("[data-live]").forEach(function(el){
      var k=el.getAttribute("data-live"),kind=kinds[k];if(!kind)return;
      if(kind==="image"){
        if(el.tagName==="IMG"){el.classList.add("sh-img");el.title="Click to change photo";
          el.addEventListener("click",function(e){e.preventDefault();e.stopPropagation();pick(k)})}
        else if(!pills.some(function(p){return p.k===k}))pills.push({k:k,l:(labels[k]||k).replace(/ \(leave empty.*$/,"")});
        return}
      el.setAttribute("contenteditable","true");el.setAttribute("spellcheck","false");el.classList.add("sh-ed");
      el.addEventListener("input",function(){post({type:"sh-edit",key:k,value:ser(el)})});
      el.addEventListener("keydown",function(e){
        if(e.key==="Enter"){e.preventDefault();if(kind!=="text")document.execCommand("insertLineBreak")}
        if(e.key===" "&&el.closest("button")){e.preventDefault();document.execCommand("insertText",false," ")}});
      el.addEventListener("paste",function(e){e.preventDefault();
        var t=(e.clipboardData||window.clipboardData).getData("text/plain");
        if(kind==="text")t=t.replace(/\s*\n\s*/g," ");document.execCommand("insertText",false,t)});
    });
    if(pills.length){var box=document.createElement("div");box.id="sh-pills";
      pills.forEach(function(p){var b=document.createElement("button");b.textContent="Change: "+p.l;b.onclick=function(){pick(p.k)};box.appendChild(b)});
      document.body.appendChild(box)}
    post({type:"sh-ready"});
  }

  fetch(URL_+"/rest/v1/sites?select=id&slug=eq."+encodeURIComponent(cfg.site),{headers:h})
   .then(function(r){return r.json()}).then(function(s){
     if(!s[0])return;
     return fetch(URL_+"/rest/v1/content?select=key,kind,value,label&site_id=eq."+s[0].id,{headers:h}).then(function(r){return r.json()});
   }).then(function(rows){
     (rows||[]).forEach(function(c){
       kinds[c.key]=c.kind;labels[c.key]=c.label;
       if(!c.value)return;
       all(c.key).forEach(function(el){
         if(c.kind==="image"){if(el.tagName==="IMG")el.src=c.value;else el.style.backgroundImage="url("+c.value+")"}
         else el.innerHTML=fmt(c.value);
       });
     });
   }).catch(function(){}).then(function(){loaded=true;if(hello)start()});
})();
