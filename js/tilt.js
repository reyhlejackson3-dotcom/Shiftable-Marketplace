/* Gentle 3D tilt and cursor glare on cards and plan boxes (mouse only, off for reduced motion). */
(function(){
  'use strict';
  if(!window.matchMedia('(hover: hover) and (pointer: fine)').matches||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  [].forEach.call(document.querySelectorAll('.card,.plan'),function(el){
    var raf=0,px=0,py=0,mx=50,my=50;
    function apply(){raf=0;el.style.transform='perspective(1000px) rotateX('+(-py*7).toFixed(2)+'deg) rotateY('+(px*9).toFixed(2)+'deg) translateY(-8px) scale(1.012)';
      el.style.setProperty('--mx',mx+'%');el.style.setProperty('--my',my+'%');el.style.setProperty('--px',px.toFixed(3));el.style.setProperty('--py',py.toFixed(3))}
    el.addEventListener('pointerenter',function(){el.classList.add('tilting')});
    el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect();px=(e.clientX-r.left)/r.width-.5;py=(e.clientY-r.top)/r.height-.5;mx=(px+.5)*100;my=(py+.5)*100;if(!raf)raf=requestAnimationFrame(apply)});
    el.addEventListener('pointerleave',function(){el.classList.remove('tilting');if(raf){cancelAnimationFrame(raf);raf=0}el.style.transform='';el.style.setProperty('--px',0);el.style.setProperty('--py',0)});
  });
})();
