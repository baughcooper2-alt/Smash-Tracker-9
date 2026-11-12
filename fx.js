// Smash Tracker effects, shared by the tracker (index.html) and the phone remote (remote.html):
//   SmashFX.result({kind:'win'|'loss'|'perfect', title, sub})  full-screen result animation
//   SmashFX.snow(on)                                             falling snow behind everything clickable
(function(){
  'use strict';
  if (window.SmashFX) return;

  var reduced = function(){ return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };

  var CSS = [
    '#fxr{position:fixed;inset:0;z-index:99990;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;overflow:hidden;font-family:"Archivo Black",Archivo,system-ui,sans-serif}',
    '#fxr canvas{position:absolute;inset:0;width:100%;height:100%}',
    '#fxr .bg{position:absolute;inset:0}',
    '#fxr .t{position:relative;font-size:clamp(56px,13vw,150px);line-height:.9;letter-spacing:-.01em;color:#fffdf7;-webkit-text-stroke:3px #17140f;paint-order:stroke fill;text-align:center}',
    '#fxr .s{position:relative;font-family:Archivo,system-ui,sans-serif;font-weight:800;font-size:clamp(12px,2.4vw,18px);letter-spacing:.24em;color:#fffdf7;text-align:center;padding:7px 18px;margin:0 16px;background:#17140f;border:3px solid #fffdf7;border-radius:999px}',
    /* win */
    '#fxr.win .bg{background:radial-gradient(circle at 50% 55%,rgba(31,146,84,.55),rgba(31,146,84,0) 62%);animation:fxrFlash 1.5s ease both}',
    '#fxr.win .t{text-shadow:7px 7px 0 #1f9254;animation:fxrSlam .55s cubic-bezier(.2,.9,.3,1.25) both,fxrFade .35s ease 1.15s forwards}',
    '#fxr.win .s{box-shadow:4px 4px 0 #1f9254;animation:fxrUp .4s ease .2s both,fxrFade .35s ease 1.15s forwards}',
    /* loss */
    '#fxr.loss .bg{background:radial-gradient(circle at 50% 50%,rgba(23,20,15,0) 30%,rgba(90,10,20,.7) 100%);animation:fxrFlash 1.5s ease both}',
    '#fxr.loss .t{color:#cfc8bd;text-shadow:5px 5px 0 #6b0d1a;animation:fxrSink 1.35s cubic-bezier(.5,0,.7,.4) both}',
    '#fxr.loss .s{color:#e9d9d9;border-color:#6b0d1a;animation:fxrUp .35s ease .15s both,fxrFade .3s ease 1s forwards}',
    '#fxr.loss .bg{-webkit-backdrop-filter:grayscale(.9) brightness(.8);backdrop-filter:grayscale(.9) brightness(.8)}',
    /* perfect */
    '#fxr.perfect .bg{background:radial-gradient(circle at 50% 50%,rgba(255,236,170,.95),rgba(242,193,78,.75) 35%,rgba(150,95,0,.55) 75%,rgba(20,83,45,.6));animation:fxrFlashLong 2.9s ease both}',
    '#fxr.perfect .rays{position:absolute;left:50%;top:50%;width:180vmax;height:180vmax;margin:-90vmax 0 0 -90vmax;opacity:.55;',
    '  background:repeating-conic-gradient(from 0deg,rgba(255,255,255,.55) 0 7deg,rgba(255,255,255,0) 7deg 18deg);animation:fxrSpin 3s linear both,fxrFade .5s ease 2.35s forwards}',
    '#fxr.perfect .t{color:#ffe58a;background:linear-gradient(100deg,#f2c14e 20%,#fff6c8 40%,#f2c14e 60%) 0 0/250% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;',
    '  filter:drop-shadow(6px 6px 0 #d4283a) drop-shadow(0 0 18px rgba(255,220,120,.9));animation:fxrSlamBig .7s cubic-bezier(.2,.9,.3,1.3) both,fxrShine 1.1s linear .6s 2,fxrFade .45s ease 2.4s forwards}',
    '#fxr.perfect .s{color:#17140f;text-shadow:none;background:#fffdf7;border:3px solid #17140f;border-radius:999px;padding:7px 18px;box-shadow:4px 4px 0 #d4283a;animation:fxrUp .45s ease .45s both,fxrFade .4s ease 2.4s forwards}',
    '#fxr.perfect .crown{position:relative;font-size:clamp(40px,8vw,84px);line-height:1;color:#ffe58a;-webkit-text-stroke:3px #17140f;paint-order:stroke fill;filter:drop-shadow(4px 4px 0 #d4283a) drop-shadow(0 0 14px rgba(255,230,140,.95));animation:fxrDrop .6s cubic-bezier(.2,.9,.3,1.4) .25s both,fxrFade .4s ease 2.4s forwards}',
    '@keyframes fxrFlash{0%{opacity:0}12%{opacity:1}70%{opacity:1}100%{opacity:0}}',
    '@keyframes fxrFlashLong{0%{opacity:0}8%{opacity:1}80%{opacity:1}100%{opacity:0}}',
    '@keyframes fxrSlam{0%{transform:scale(3) rotate(-10deg);opacity:0}55%{transform:scale(.9) rotate(2deg);opacity:1}75%{transform:scale(1.06) rotate(-1deg)}100%{transform:scale(1) rotate(-3deg);opacity:1}}',
    '@keyframes fxrSlamBig{0%{transform:scale(4) rotate(-14deg);opacity:0}50%{transform:scale(.88) rotate(3deg);opacity:1}70%{transform:scale(1.1) rotate(-2deg)}100%{transform:scale(1) rotate(-3deg);opacity:1}}',
    '@keyframes fxrSink{0%{transform:translateY(-40px) scale(1.15);opacity:0}18%{transform:translateY(0) scale(1);opacity:1}45%{transform:translateY(0) rotate(0)}70%{transform:translateY(20px) rotate(4deg);opacity:1}100%{transform:translateY(120px) rotate(9deg);opacity:0}}',
    '@keyframes fxrUp{from{transform:translateY(14px);opacity:0}to{transform:none;opacity:1}}',
    '@keyframes fxrDrop{from{transform:translateY(-120px) rotate(-20deg);opacity:0}to{transform:none;opacity:1}}',
    '@keyframes fxrFade{to{opacity:0}}',
    '@keyframes fxrSpin{from{transform:rotate(0) scale(.6)}to{transform:rotate(60deg) scale(1)}}',
    '@keyframes fxrShine{from{background-position:120% 0}to{background-position:-130% 0}}',
    '#fx-snow{position:fixed;inset:0;z-index:40;pointer-events:none}'
  ].join('\n');

  function ensureCss(){
    if (document.getElementById('fxr-css')) return;
    var st = document.createElement('style');
    st.id = 'fxr-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  // ---------- particles ----------
  function particles(canvas, kind){
    var ctx = canvas.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = window.innerWidth, h = window.innerHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var parts = [], rings = [];
    var festive = ['#d4283a', '#1f9254', '#f2c14e', '#fffdf7', '#6ec8ff'];
    var gold = ['#f2c14e', '#ffe58a', '#fff6c8', '#d4283a', '#1f9254', '#fffdf7'];
    var rnd = function(a, b){ return a + Math.random() * (b - a); };
    var add = function(x, y, vx, vy, color, shape, size){
      parts.push({x:x, y:y, vx:vx, vy:vy, c:color, sh:shape, r:size, a:rnd(0, 6.3), va:rnd(-.3, .3), life:0});
    };
    if (kind === 'loss'){
      // a few lumps of coal tumble down
      for (var i = 0; i < 14; i++) add(rnd(0, w), rnd(-h * .4, -20), rnd(-.6, .6), rnd(2, 5), i % 3 ? '#2b2622' : '#3d3631', 'coal', rnd(7, 15));
    } else {
      var n = kind === 'perfect' ? 260 : 120;
      var pal = kind === 'perfect' ? gold : festive;
      for (var j = 0; j < n; j++){
        var left = j % 2 === 0;
        add(left ? -10 : w + 10, rnd(h * .45, h * .95), (left ? 1 : -1) * rnd(5, 15), rnd(-17, -7),
          pal[j % pal.length], j % 5 === 0 ? 'star' : j % 3 === 0 ? 'circle' : 'rect', rnd(4, kind === 'perfect' ? 9 : 7));
      }
      if (kind === 'perfect'){
        var burst = function(delay, x, y){
          setTimeout(function(){
            rings.push({x:x, y:y, r:0, life:0});
            for (var k = 0; k < 46; k++){
              var ang = (k / 46) * Math.PI * 2, sp = rnd(4, 9);
              add(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, gold[k % gold.length], k % 2 ? 'star' : 'circle', rnd(3, 6));
            }
          }, delay);
        };
        burst(450, w * .22, h * .3); burst(800, w * .78, h * .28); burst(1150, w * .5, h * .2); burst(1500, w * .35, h * .38); burst(1750, w * .66, h * .4);
      }
    }
    var star = function(r){
      ctx.beginPath();
      for (var i = 0; i < 10; i++){
        var rr = i % 2 ? r * .45 : r, a = i * Math.PI / 5 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath(); ctx.fill();
    };
    var last = performance.now(), raf = 0;
    var tick = function(now){
      var dt = Math.min(48, now - last) / 16.7; last = now;
      ctx.clearRect(0, 0, w, h);
      for (var i = rings.length - 1; i >= 0; i--){
        var g = rings[i]; g.life += dt; g.r += 6 * dt;
        var o = Math.max(0, 1 - g.life / 40);
        if (!o){ rings.splice(i, 1); continue; }
        ctx.strokeStyle = 'rgba(255,240,180,' + o + ')'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2); ctx.stroke();
      }
      for (var j = parts.length - 1; j >= 0; j--){
        var p = parts[j];
        p.life += dt;
        if (p.sh === 'coal'){ p.vy += .18 * dt; } else { p.vx *= Math.pow(.985, dt); p.vy = p.vy * Math.pow(.985, dt) + .32 * dt; }
        p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
        if (p.y > h + 40){ parts.splice(j, 1); continue; }
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c;
        if (p.sh === 'rect') ctx.fillRect(-p.r, -p.r * .4, p.r * 2, p.r * .8);
        else if (p.sh === 'circle'){ ctx.beginPath(); ctx.arc(0, 0, p.r * .6, 0, Math.PI * 2); ctx.fill(); }
        else if (p.sh === 'star') star(p.r);
        else { ctx.beginPath(); ctx.moveTo(-p.r, 0); ctx.lineTo(-p.r * .4, -p.r * .8); ctx.lineTo(p.r * .7, -p.r * .6); ctx.lineTo(p.r, p.r * .2); ctx.lineTo(0, p.r * .8); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      if (parts.length || rings.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return function(){ cancelAnimationFrame(raf); };
  }

  var timers = [], stopParticles = null;
  function clear(){
    timers.forEach(clearTimeout); timers = [];
    if (stopParticles){ stopParticles(); stopParticles = null; }
    var old = document.getElementById('fxr');
    if (old) old.remove();
  }
  function esc(v){ return String(v == null ? '' : v).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  function result(o){
    o = o || {};
    if (reduced() || !document.body) return;
    ensureCss();
    clear();
    var kind = o.kind === 'perfect' || o.kind === 'loss' ? o.kind : 'win';
    var el = document.createElement('div');
    el.id = 'fxr';
    el.className = kind;
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<div class="bg"></div>' + (kind === 'perfect' ? '<div class="rays"></div>' : '') + '<canvas></canvas>' +
      (kind === 'perfect' ? '<div class="crown">★</div>' : '') +
      '<div class="t">' + esc(o.title || (kind === 'loss' ? 'LOSS' : 'WIN!')) + '</div>' +
      (o.sub ? '<div class="s">' + esc(o.sub) + '</div>' : '');
    document.body.appendChild(el);
    stopParticles = particles(el.querySelector('canvas'), kind);
    // Shake only the page content, and through el.animate(): a CSS class would restart the content's own
    // slide-in animation, and a transform on an ancestor of fixed bars or toasts would make them jump.
    var root = document.querySelector(o.shakeTarget || 'main');
    try {
      if (root && root.animate && kind === 'loss'){
        root.animate([{transform:'none'}, {transform:'translate(-9px,2px) rotate(-.4deg)'}, {transform:'translate(9px,-2px) rotate(.4deg)'},
          {transform:'translate(-7px,1px)'}, {transform:'translate(6px,-1px)'}, {transform:'translate(-3px,0)'}, {transform:'none'}], {duration:500, easing:'ease-out'});
      } else if (root && root.animate && kind === 'perfect'){
        root.animate([{filter:'none'}, {filter:'brightness(1.12) saturate(1.25)'}, {filter:'none'}], {duration:900, iterations:2});
      }
    } catch(e){}
    var total = kind === 'perfect' ? 3400 : kind === 'loss' ? 1600 : 1700;
    timers.push(setTimeout(clear, total));
    try { if (navigator.vibrate) navigator.vibrate(kind === 'perfect' ? [40, 60, 40, 60, 120] : kind === 'loss' ? [160] : [30, 40, 30]); } catch(e){}
  }

  // ---------- snow ----------
  var snowRaf = 0, snowSize = null, snowResume = null;
  function snow(on){
    var old = document.getElementById('fx-snow');
    if (snowRaf) cancelAnimationFrame(snowRaf);
    snowRaf = 0;
    if (old) old.remove();
    if (snowSize){ window.removeEventListener('resize', snowSize); snowSize = null; }
    if (!on || reduced() || !document.body) return;
    ensureCss();
    var c = document.createElement('canvas');
    c.id = 'fx-snow';
    document.body.appendChild(c);
    var ctx = c.getContext('2d');
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = 0, h = 0, flakes = [];
    snowSize = function(){
      w = window.innerWidth; h = window.innerHeight;
      c.width = w * dpr; c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(110, w * h / 14000));
      while (flakes.length < n) flakes.push({x:Math.random() * w, y:Math.random() * h, r:1 + Math.random() * 2.6, s:.35 + Math.random() * .9, d:Math.random() * Math.PI * 2});
      flakes.length = n;
    };
    snowSize();
    window.addEventListener('resize', snowSize);
    var last = performance.now();
    var tick = function(now){
      var dt = Math.min(50, now - last) / 16.7; last = now;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.85)';
      ctx.beginPath();
      for (var i = 0; i < flakes.length; i++){
        var f = flakes[i];
        f.d += .012 * dt; f.y += f.s * dt; f.x += Math.sin(f.d) * .45 * dt;
        if (f.y > h + 4){ f.y = -4; f.x = Math.random() * w; }
        if (f.x > w + 4) f.x = -4; else if (f.x < -4) f.x = w + 4;
        ctx.moveTo(f.x + f.r, f.y); ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      }
      ctx.fill();
      snowRaf = document.hidden ? 0 : requestAnimationFrame(tick);
    };
    snowRaf = requestAnimationFrame(tick);
    snowResume = function(){ last = performance.now(); snowRaf = requestAnimationFrame(tick); };
    if (!snow.wired){
      snow.wired = true;
      document.addEventListener('visibilitychange', function(){
        if (!document.hidden && !snowRaf && snowResume && document.getElementById('fx-snow')) snowResume();
      });
    }
  }

  window.SmashFX = {result:result, snow:snow, clear:clear};
})();
