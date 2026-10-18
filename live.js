/* Shiftable live content loader. Add to any client site:
   <script>window.SHIFTABLE={site:"program-builder"}</script>
   <script src="https://getshiftable.com/live.js"></script>
   Then mark editable things: <h1 data-live="home.headline">Fallback text</h1>
   <img data-live="home.photo" src="fallback.jpg">  Fallback shows if anything fails. */
(function(){
  var URL_="YOUR_SUPABASE_URL", KEY="YOUR_SUPABASE_ANON_KEY";
  var cfg=window.SHIFTABLE||{}; if(!cfg.site||URL_.indexOf("YOUR_")===0) return;
  // two steps: resolve the site id, then fetch its content (anon read is allowed by RLS)
  var h={apikey:KEY,Authorization:"Bearer "+KEY};
  fetch(URL_+"/rest/v1/sites?select=id&slug=eq."+encodeURIComponent(cfg.site),{headers:h})
   .then(function(r){return r.json()}).then(function(s){
     if(!s[0]) return;
     return fetch(URL_+"/rest/v1/content?select=key,kind,value&site_id=eq."+s[0].id,{headers:h}).then(function(r){return r.json()});
   }).then(function(rows){
     (rows||[]).forEach(function(c){
       if(!c.value) return;
       document.querySelectorAll('[data-live="'+c.key+'"]').forEach(function(el){
         if(c.kind==="image"){ if(el.tagName==="IMG") el.src=c.value; else el.style.backgroundImage="url("+c.value+")"; }
         else el.textContent=c.value;
       });
     });
   }).catch(function(){});
})();
