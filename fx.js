// Smash Tracker effects, shared by the tracker (index.html) and the phone remote (remote.html):
//   SmashFX.result({kind:'win'|'loss'|'perfect', title, sub})  full-screen result animation
//   SmashFX.snow(on)                                             falling snow behind everything clickable
//   SmashFX.soundOn() / SmashFX.setSound(on)                     sound effects on or off (saved per device)
//   SmashFX.voice() / SmashFX.setVoice('heart'|'michael'|'hype'|'salty'|'brit'|'custom'|'off')  commentator (per device)
// result() also takes quip:'six'|'stomp'|'closeW'|'closeL'|'bad'|'win'|'loss'|'hotW'|'coldL', duo:true for 2v2,
// and teams:{left:[{name,img,color}], right:[...], winner:'left'|'right'} for the GAME! results screen.
// Result sounds are recorded clips in sounds/ (credits in sounds/CREDITS.txt); interface sounds are synthesized.
(function(){
  'use strict';
  if (window.SmashFX) return;

  var reduced = function(){ return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); };

  var CSS = [
    '#fxr{position:fixed;inset:0;z-index:99990;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;overflow:hidden;font-family:"SmashRound","M PLUS 1p",system-ui,sans-serif;font-weight:900}',
    '#fxr .t,#fxr .fxr-vs,#fxr.perfect .crown{font-style:italic}',
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
    '#fx-snow{position:fixed;inset:0;z-index:40;pointer-events:none}',
    /* GAME! splash, then the results screen with both teams */
    '#fxr .game{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;font-size:clamp(80px,19vw,230px);line-height:1;font-style:italic;color:#fffdf7;-webkit-text-stroke:4px #17140f;paint-order:stroke fill;text-shadow:9px 9px 0 #d4283a;animation:fxrGame .8s cubic-bezier(.2,.9,.3,1.2) both}',
    '#fxr .slash{position:absolute;left:-10%;right:-10%;top:50%;height:clamp(120px,24vw,260px);margin-top:calc(clamp(120px,24vw,260px) / -2);background:#17140f;transform:skewY(-6deg);animation:fxrSlash .8s ease both}',
    '#fxr .res{position:relative;display:flex;flex-direction:column;align-items:center;gap:12px;width:100%}',
    /* the results screen stays up longer, so its backdrop does too, with a dark wash so the cards read on any page */
    '#fxr.teams .bg{background-color:rgba(12,10,8,.55);animation-name:fxrFlashLong;animation-duration:3.1s}',
    '#fxr.teams.loss .bg{background-color:rgba(12,10,8,.62);animation-duration:3s}',
    '#fxr.teams.perfect .bg{animation-duration:4.8s}',
    '#fxr.teams .t{font-size:clamp(46px,10vw,110px)}',
    '#fxr.teams.win .t,#fxr.teams.win .s{animation-name:fxrSlam,fxrFade;animation-duration:.55s,.4s;animation-delay:0s,1.75s}',
    '#fxr.teams.win .s{animation-name:fxrUp,fxrFade;animation-delay:.2s,1.75s}',
    '#fxr.teams.loss .t{animation:fxrUp .35s ease both,fxrFade .4s ease 1.6s forwards}',
    '#fxr.teams.loss .s{animation:fxrUp .35s ease .15s both,fxrFade .4s ease 1.6s forwards}',
    '#fxr.teams.perfect .t{animation:fxrSlamBig .7s cubic-bezier(.2,.9,.3,1.3) both,fxrShine 1.1s linear .6s 2,fxrFade .45s ease 2.7s forwards}',
    '#fxr.teams.perfect .s,#fxr.teams.perfect .crown{animation-delay:.45s,2.7s}',
    '#fxr .fxr-tm{position:relative;display:flex;align-items:center;justify-content:center;gap:clamp(10px,3vw,34px);padding:0 14px;animation:fxrUp .4s ease .1s both,fxrFade .4s ease var(--out,1.75s) forwards}',
    '#fxr .fxr-side{flex-direction:row;display:flex;gap:clamp(6px,1.2vw,12px);position:relative}',
    '#fxr .fxr-side .fxr-tag{position:absolute;left:50%;top:-14px;transform:translateX(-50%);z-index:2;padding:3px 10px;border-radius:999px;font-family:Archivo,system-ui,sans-serif;font-weight:800;font-size:11px;letter-spacing:.2em;background:#f2c14e;color:#17140f;border:2px solid #17140f;white-space:nowrap}',
    '#fxr .fxr-card{width:clamp(76px,13vw,150px);display:flex;flex-direction:column;align-items:center;gap:6px}',
    '#fxr .fxr-pic{width:100%;aspect-ratio:1;border-radius:16px;border:3px solid #fffdf7;box-shadow:0 10px 26px -8px rgba(0,0,0,.6);background-size:contain;background-repeat:no-repeat;background-position:center;display:flex;align-items:center;justify-content:center;font-size:clamp(30px,6vw,60px);color:#fff}',
    '#fxr .fxr-nm{max-width:100%;padding:3px 9px;border-radius:8px;background:#17140f;color:#fffdf7;font-family:Archivo,system-ui,sans-serif;font-weight:800;font-size:clamp(10px,1.4vw,14px);letter-spacing:.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    '#fxr .fxr-side.won .fxr-pic{border-color:#f2c14e;box-shadow:0 0 0 3px #17140f,0 0 30px rgba(242,193,78,.85)}',
    '#fxr .fxr-side.lost{filter:grayscale(.85) brightness(.75);transform:scale(.9)}',
    '#fxr .fxr-vs{font-size:clamp(20px,3.4vw,36px);color:#fffdf7;-webkit-text-stroke:2px #17140f;paint-order:stroke fill}',
    '@keyframes fxrGame{0%{transform:translateY(-50%) scale(2.6) rotate(-8deg);opacity:0}35%{transform:translateY(-50%) scale(.94) rotate(-4deg);opacity:1}50%{transform:translateY(-50%) scale(1.03) rotate(-4deg)}82%{opacity:1}100%{transform:translateY(-50%) scale(1.12) rotate(-4deg);opacity:0}}',
    '@keyframes fxrSlash{0%{transform:skewY(-6deg) scaleX(0);opacity:.9}30%{transform:skewY(-6deg) scaleX(1)}80%{opacity:.9}100%{transform:skewY(-6deg) scaleX(1);opacity:0}}'
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

  function teamHtml(list, cls, tag){
    return '<div class="fxr-side ' + cls + '">' + (tag ? '<span class="fxr-tag">' + esc(tag) + '</span>' : '') + (list || []).map(function(f){
      var img = f && f.img && /^(data:image\/|https?:|blob:)/.test(f.img) ? 'background-image:url(&quot;' + esc(f.img) + '&quot;);' : '';
      var initial = img ? '' : esc(String((f && f.name) || '?').charAt(0));
      return '<div class="fxr-card"><div class="fxr-pic" style="background-color:' + esc((f && f.color) || '#17140f') + ';' + img + '">' + initial + '</div>' +
        '<div class="fxr-nm">' + esc((f && f.name) || '?') + '</div></div>';
    }).join('') + '</div>';
  }
  function result(o){
    o = o || {};
    var snd = o.kind === 'perfect' || o.kind === 'loss' ? o.kind : 'win';
    lastSpecific = performance.now();
    if (o.sound !== false) play(snd, o);
    if (reduced() || !document.body) return;
    ensureCss();
    clear();
    var kind = o.kind === 'perfect' || o.kind === 'loss' ? o.kind : 'win';
    var tm = o.teams && o.teams.left && o.teams.left.length && o.teams.right && o.teams.right.length ? o.teams : null;
    var el = document.createElement('div');
    el.id = 'fxr';
    el.className = kind + (tm ? ' teams' : '');
    el.setAttribute('aria-hidden', 'true');
    var resHtml = (kind === 'perfect' ? '<div class="crown">★</div>' : '') +
      '<div class="t">' + esc(o.title || (kind === 'loss' ? 'LOSS' : 'WIN!')) + '</div>' +
      (tm ? '<div class="fxr-tm" style="--out:' + (kind === 'perfect' ? '2.7s' : kind === 'loss' ? '1.6s' : '1.75s') + '">' +
        teamHtml(tm.left, tm.winner === 'left' ? 'won' : 'lost', tm.winner === 'left' ? 'WINNER' : '') +
        '<div class="fxr-vs">VS</div>' +
        teamHtml(tm.right, tm.winner === 'right' ? 'won' : 'lost', tm.winner === 'right' ? 'WINNER' : '') + '</div>' : '') +
      (o.sub ? '<div class="s">' + esc(o.sub) + '</div>' : '');
    var delay = tm ? 720 : 0;
    el.innerHTML = '<div class="bg"></div>' + (kind === 'perfect' ? '<div class="rays"></div>' : '') + '<canvas></canvas>' +
      (tm ? '<div class="slash"></div><div class="game">GAME!</div>' : '<div class="res">' + resHtml + '</div>');
    document.body.appendChild(el);
    var reveal = function(){
      if (!el.parentNode) return;
      if (tm){
        var g = el.querySelector('.game'), sl = el.querySelector('.slash');
        if (g) g.remove(); if (sl) sl.remove();
        var r = document.createElement('div'); r.className = 'res'; r.innerHTML = resHtml; el.appendChild(r);
      }
      stopParticles = particles(el.querySelector('canvas'), kind);
    };
    if (delay) timers.push(setTimeout(reveal, delay)); else reveal();
    // Shake only the page content, and through el.animate(): a CSS class would restart the content's own
    // slide-in animation, and a transform on an ancestor of fixed bars or toasts would make them jump.
    var root = document.querySelector(o.shakeTarget || 'main');
    if (tm) root = null;
    try {
      if (root && root.animate && kind === 'loss'){
        root.animate([{transform:'none'}, {transform:'translate(-9px,2px) rotate(-.4deg)'}, {transform:'translate(9px,-2px) rotate(.4deg)'},
          {transform:'translate(-7px,1px)'}, {transform:'translate(6px,-1px)'}, {transform:'translate(-3px,0)'}, {transform:'none'}], {duration:500, easing:'ease-out'});
      } else if (root && root.animate && kind === 'perfect'){
        root.animate([{filter:'none'}, {filter:'brightness(1.12) saturate(1.25)'}, {filter:'none'}], {duration:900, iterations:2});
      }
    } catch(e){}
    var total = (kind === 'perfect' ? 3400 : kind === 'loss' ? 1600 : 1700) + (tm ? delay + 700 : 0);
    timers.push(setTimeout(clear, total));
    // Haptics (phones that support vibration; iPhones don't expose it to web pages). Off with stocklog.haptics = 'off'.
    try { if (navigator.vibrate && localStorage.getItem('stocklog.haptics') !== 'off')
      navigator.vibrate(kind === 'perfect' ? [40, 50, 40, 50, 40, 50, 240] : kind === 'loss' ? [170, 80, 90] : [25, 40, 25, 40, 70]); } catch(e){}
  }


  // ---------- sound ----------
  var actx = null, master = null, noiseBuf = null;
  // A page that sets window.SMASH_SILENT (the phone remote) never makes a sound: the tracker on the computer plays them.
  function soundOn(){ if (window.SMASH_SILENT) return false; try { return localStorage.getItem('stocklog.sound') !== 'off'; } catch(e){ return true; } }
  function audio(){
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!actx){
      try { actx = new AC(); } catch(e){ return null; }
      master = out(actx, actx.destination);
      preloadSamples();
    }
    if (actx.state === 'suspended'){ try { actx.resume(); } catch(e){} }
    return actx;
  }
  // Master chain: gentle level plus a compressor so stacked notes never clip.
  function out(c, dest){
    var comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = .003; comp.release.value = .2;
    var g = c.createGain(); g.gain.value = 1.1;
    g.connect(comp); comp.connect(dest);
    // Shared hall reverb: sounds send to it with their `wet` option.
    var conv = c.createConvolver(), wet = c.createGain();
    conv.buffer = impulse(c, 2.6);
    wet.gain.value = .8;
    wet.connect(conv); conv.connect(g);
    c.__wet = wet;
    return g;
  }
  function impulse(c, secs){
    var len = Math.floor(c.sampleRate * secs), buf = c.createBuffer(2, len, c.sampleRate);
    for (var ch = 0; ch < 2; ch++){
      var d = buf.getChannelData(ch);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }
  function send(c, node, amount){
    if (!amount || !c.__wet) return;
    var s = c.createGain(); s.gain.value = amount;
    node.connect(s); s.connect(c.__wet);
  }
  // Browsers only start audio after a tap or key press. Unlock on the first one, so a game that
  // arrives from the phone later can still play its sound on the tracker.
  ['pointerdown', 'keydown', 'touchend'].forEach(function(ev){
    window.addEventListener(ev, function(){ if (soundOn() && (!actx || actx.state !== 'running')) audio(); }, {passive:true, capture:true});
  });
  function setSound(on){
    lastSpecific = performance.now();
    try { localStorage.setItem('stocklog.sound', on ? 'on' : 'off'); } catch(e){}
    if (on && audio()) build('chime', actx, master, actx.currentTime + .02);
  }
  function play(kind, o){
    if (!soundOn() || !audio()) return;
    if (window.__sfxLog) window.__sfxLog.push(kind);
    try {
      if (!playResult(kind, o || {})) build(kind, actx, master, actx.currentTime + .03);
    } catch(e){}
  }

  // ---------- recorded sounds (sounds/, credits in sounds/CREDITS.txt) ----------
  var SAMPLES = {
    winJingle: ['win-orchestral', 'win-victory-bout', 'win-fanfare-lick', 'win-winner-is', 'win-flag', 'win-success', 'jingle-win-sax02', 'jingle-win-hit11'],
    celebrate: ['cel-crowd-roar', 'cel-crowd-chant', 'cel-applause', 'cel-fireworks'],
    sixFanfare: ['six-hyper-fanfare', 'six-champion'],
    sixCrowd: ['six-crowd-cheer'],
    // Loss sounds: one at random, never the same one twice in a row.
    lossSay: ['loss-gameshow', 'loss-arcade', 'loss-wah-wah', 'loss-sad-trombone', 'loss-life-lost', 'loss-trumpet', 'loss-lose-bout', 'loss-failed']
  };
  // Commentator quips (sounds/voice/vo-<voice>-<id>.mp3, made with the open Kokoro TTS model). [id, 2v2 only]
  var QUIPS = {
    six: [['six1'], ['six2'], ['six3'], ['six4'], ['six5'], ['six6'], ['six7', 1], ['six8']],
    stomp: [['stomp1'], ['stomp2'], ['stomp3'], ['stomp4'], ['stomp5'], ['stomp6'], ['stomp7'], ['stomp8', 1], ['stomp9']],
    closeW: [['cw1'], ['cw2'], ['cw3'], ['cw4'], ['cw5'], ['cw6'], ['cw7']],
    closeL: [['cl1'], ['cl2'], ['cl3'], ['cl4'], ['cl5'], ['cl6']],
    bad: [['bad1'], ['bad2'], ['bad3'], ['bad4'], ['bad5'], ['bad6', 1], ['bad7', 1], ['bad8'], ['bad9']],
    win: [['win1'], ['win2'], ['win3'], ['win4']],
    loss: [['loss1'], ['loss2'], ['loss3'], ['loss4']],
    hotW: [['hot1'], ['hot2'], ['hot3', 1]],
    coldL: [['cold1'], ['cold2'], ['cold3']]
  };
  // Packs: the classic lines (two voices), plus hype, salty and British packs. 'custom' speaks the user's own lines
  // with the device's built-in voice (window.speechSynthesis); 'mix' slips those lines into any pack now and then.
  var PACKS = {classic: QUIPS,
    hype: {six: [['six1'], ['six2'], ['six3', 1], ['six4'], ['six5']], stomp: [['st1'], ['st2'], ['st3'], ['st4', 1], ['st5']], closeW: [['cw1'], ['cw2'], ['cw3'], ['cw4']], closeL: [['cl1'], ['cl2'], ['cl3'], ['cl4']], bad: [['bd1'], ['bd2'], ['bd3'], ['bd4']], win: [['w1'], ['w2'], ['w3']], loss: [['l1'], ['l2'], ['l3']], hotW: [['h1'], ['h2'], ['h3', 1]], coldL: [['c1'], ['c2'], ['c3']]},
    salty: {six: [['six1'], ['six2'], ['six3']], stomp: [['st1'], ['st2'], ['st3'], ['st4', 1]], closeW: [['cw1'], ['cw2'], ['cw3']], closeL: [['cl1'], ['cl2'], ['cl3']], bad: [['bd1'], ['bd2'], ['bd3'], ['bd4', 1], ['bd5']], win: [['w1'], ['w2'], ['w3']], loss: [['l1'], ['l2'], ['l3']], hotW: [['h1'], ['h2']], coldL: [['c1'], ['c2'], ['c3']]},
    brit: {six: [['six1'], ['six2'], ['six3'], ['six4', 1]], stomp: [['st1'], ['st2'], ['st3'], ['st4']], closeW: [['cw1'], ['cw2'], ['cw3']], closeL: [['cl1'], ['cl2'], ['cl3', 1]], bad: [['bd1'], ['bd2'], ['bd3'], ['bd4']], win: [['w1'], ['w2'], ['w3']], loss: [['l1', 1], ['l2'], ['l3']], hotW: [['h1'], ['h2']], coldL: [['c1'], ['c2']]}};
  var VOICE_PACK = {heart:'classic', michael:'classic', hype:'hype', salty:'salty', brit:'brit'};
  var VOICES = ['heart', 'michael', 'hype', 'salty', 'brit', 'custom'];
  function voice(){ var v = 'heart'; try { v = localStorage.getItem('stocklog.voice') || 'heart'; } catch(e){} return v === 'off' || VOICES.indexOf(v) >= 0 ? v : 'heart'; }
  function clipVoice(v){ return v === 'custom' ? 'heart' : v; }
  function customLines(cat){
    var all = {}; try { all = JSON.parse(localStorage.getItem('stocklog.voiceLines') || '{}') || {}; } catch(e){}
    return String(all[cat] || '').split('\n').map(function(x){ return x.trim(); }).filter(Boolean);
  }
  function mixOn(){ try { return localStorage.getItem('stocklog.voiceMix') === 'on'; } catch(e){ return false; } }
  var deviceVoice = null;
  function pickDeviceVoice(){
    if (deviceVoice || !window.speechSynthesis) return deviceVoice;
    var vs = speechSynthesis.getVoices() || [];
    var en = vs.filter(function(x){ return /^en/i.test(x.lang); });
    deviceVoice = en.filter(function(x){ return /natural|neural|google|samantha|daniel|aria|guy/i.test(x.name); })[0] || en[0] || vs[0] || null;
    return deviceVoice;
  }
  if (window.speechSynthesis){ try { speechSynthesis.onvoiceschanged = function(){ deviceVoice = null; pickDeviceVoice(); }; } catch(e){} }
  // Speak text with the device voice after `delay` seconds; returns a rough length so music can duck under it.
  function speak(text, delay){
    if (!window.speechSynthesis || !text) return 0;
    setTimeout(function(){
      try { var u = new SpeechSynthesisUtterance(text); var dv = pickDeviceVoice(); if (dv) u.voice = dv; u.rate = 1.05; u.pitch = 1; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch(e){}
    }, Math.max(0, delay || 0) * 1000);
    if (window.__sfxLog) window.__sfxLog.push('speak:' + text);
    return Math.min(4, .5 + text.length * .065);
  }
  function setVoice(v){
    lastSpecific = performance.now();
    try { localStorage.setItem('stocklog.voice', v); } catch(e){}
    preview(v);
  }
  function preview(v, cat){
    if (v === 'off' || !soundOn() || !audio()) return;
    cat = cat || ['six', 'stomp', 'bad', 'closeW'][Math.floor(Math.random() * 4)];
    if (v === 'custom'){ var ls = customLines(cat).concat(customLines('win')); if (ls.length) return speak(ls[Math.floor(Math.random() * ls.length)], 0); }
    preloadVoice(clipVoice(v), function(){ say(cat, true, actx.currentTime + .05, clipVoice(v), true); });
  }
  var voiceLoaded = {}, recentQuips = [];
  function preloadVoice(v, done){
    v = clipVoice(v);
    if (!actx || v === 'off' || !VOICE_PACK[v]) return;
    if (voiceLoaded[v]){ if (done && voiceLoaded[v] === 2) done(); return; }
    voiceLoaded[v] = 1;
    var pack = PACKS[VOICE_PACK[v]], ids = [];
    Object.keys(pack).forEach(function(k){ pack[k].forEach(function(q){ ids.push(q[0]); }); });
    var left = ids.length;
    ids.forEach(function(id){
      var n = 'vo-' + v + '-' + id;
      fetch(SOUND_BASE + 'voice/' + n + '.mp3').then(function(r){ if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function(ab){ return new Promise(function(res, rej){ var p = actx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); }); })
        .then(function(buf){ buffers[n] = buf; }).catch(function(){})
        .then(function(){ if (--left === 0){ voiceLoaded[v] = 2; if (done) done(); } });
    });
  }
  // Speak one quip from a category at time t; returns its length (0 if voice is off or nothing is ready).
  function say(cat, duo, t, forceVoice, noCustom){
    var v = forceVoice || voice();
    if (v === 'off' || !actx) return 0;
    if (!noCustom && (v === 'custom' || mixOn())){
      var mine = customLines(cat);
      if (mine.length && (v === 'custom' || Math.random() < .35)){
        var pickL = mine.filter(function(x){ return recentQuips.indexOf(x) < 0; }); pickL = pickL.length ? pickL : mine;
        var line = pickL[Math.floor(Math.random() * pickL.length)];
        recentQuips.push(line); if (recentQuips.length > 6) recentQuips.shift();
        return speak(line, t - actx.currentTime);
      }
    }
    v = clipVoice(v);
    var pack = PACKS[VOICE_PACK[v]];
    if (!pack || !pack[cat]) return 0;
    var pool = pack[cat].filter(function(q){ return (!q[1] || duo) && buffers['vo-' + v + '-' + q[0]]; });
    if (!pool.length) return 0;
    var fresh = pool.filter(function(q){ return recentQuips.indexOf(v + q[0]) < 0; });
    var q = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length ? fresh : pool).length)];
    recentQuips.push(v + q[0]); if (recentQuips.length > 6) recentQuips.shift();
    if (window.__sfxLog) window.__sfxLog.push('voice:' + v + ':' + q[0]);
    var src = actx.createBufferSource(), g = actx.createGain();
    src.buffer = buffers['vo-' + v + '-' + q[0]]; g.gain.value = 1.15;
    src.connect(g); g.connect(master); send(actx, g, .04);
    src.start(t);
    return src.buffer.duration;
  }
  var SOUND_BASE = ((document.currentScript && document.currentScript.src) || location.href).split('?')[0].replace(/[^/]*$/, '') + 'sounds/';
  var buffers = {}, loading = false, lastPick = {};
  function preloadSamples(){
    if (loading || !actx) return;
    loading = true;
    var names = [];
    Object.keys(SAMPLES).forEach(function(k){ SAMPLES[k].forEach(function(n){ if (names.indexOf(n) < 0) names.push(n); }); });
    names.forEach(function(n){
      fetch(SOUND_BASE + n + '.mp3').then(function(r){ if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(function(ab){
          return new Promise(function(res, rej){ var p = actx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
        })
        .then(function(buf){ buffers[n] = buf; })
        .catch(function(){});
    });
    preloadVoice(voice());
  }
  // Random clip from a set, never the same one twice in a row; null if none have loaded yet.
  function pick(set){
    var ready = SAMPLES[set].filter(function(n){ return buffers[n]; });
    if (!ready.length) return null;
    var options = ready.length > 1 ? ready.filter(function(n){ return n !== lastPick[set]; }) : ready;
    var n = options[Math.floor(Math.random() * options.length)];
    lastPick[set] = n;
    return n;
  }
  var lastGain = null;
  function sample(name, t, gain, wet){
    var buf = name && buffers[name];
    if (!buf) return 0;
    var src = actx.createBufferSource(), g = actx.createGain();
    src.buffer = buf; g.gain.value = g._base = gain || 1;
    src.connect(g); g.connect(master); send(actx, g, wet);
    src.start(t);
    lastGain = g;
    if (window.__sfxLog) window.__sfxLog.push('clip:' + name);
    return buf.duration;
  }
  // Pull music down under the commentator, then let it back up.
  function duck(g, at, len, to){
    if (!g || !len) return;
    var v = g._base || 1;
    g.gain.setValueAtTime(v, at - .12);
    g.gain.linearRampToValueAtTime(v * (to || .35), at);
    g.gain.setValueAtTime(v * (to || .35), at + len);
    g.gain.linearRampToValueAtTime(v, at + len + .3);
  }
  // Recorded result sounds. Returns false when the clips aren't loaded yet, so the synthesized version plays instead.
  // A quip comes in partway through the music, which ducks under it.
  function quip(o, music, t, delay){
    var cat = o.quip || (o.kind === 'perfect' ? 'six' : o.kind === 'loss' ? 'loss' : 'win');
    var at = t + delay, len = say(cat, !!o.duo, at);
    duck(music, at, len, .3);
  }
  function playResult(kind, o){
    var t = actx.currentTime + .03, g, d;
    if (kind === 'win'){
      // a victory jingle; short ones get a crowd, applause or fireworks under them
      var jingle = pick('winJingle');
      if (!jingle) return false;
      d = sample(jingle, t, .85, .25); g = lastGain;
      if (d < 2.5 && Math.random() < .7) sample(pick('celebrate'), t + .08, .5, .15);
      quip(o, g, t, Math.min(1.1, Math.max(.55, d * .6)));
      return true;
    }
    if (kind === 'perfect'){
      // big fanfare, a stadium going wild, and the commentator losing it
      var fan = pick('sixFanfare'), crowd = pick('sixCrowd');
      if (!fan && !crowd) return false;
      if (fan){ sample(fan, t, .95, .25); g = lastGain; } else build('perfect', actx, master, t);
      if (crowd) sample(crowd, t + .35, .7, .15);
      quip(o, g, t, 1.4);
      return true;
    }
    if (kind === 'loss'){
      var sting = pick('lossSay');
      if (!sting) return false;
      d = sample(sting, t, .9, .12); g = lastGain;
      quip(o, g, t, Math.min(1.2, Math.max(.6, d * .7)));
      return true;
    }
    return false;
  }

  // Small interface sounds. Pages call SmashFX.ui('tab' | 'up' | ...) for actions with their own sound;
  // any other button gets a soft click from the listener below.
  var lastUi = 0, lastUiKind = '', lastSpecific = 0;
  function ui(kind){
    lastSpecific = performance.now();
    if (!soundOn() || !audio()) return;
    var now = performance.now();
    if (kind === lastUiKind && now - lastUi < 45) return;
    lastUi = now; lastUiKind = kind;
    if (window.__sfxLog) window.__sfxLog.push(kind);
    try { build(UI[kind] ? kind : 'click', actx, master, actx.currentTime + .01); } catch(e){}
  }
  document.addEventListener('click', function(e){
    var el = e.target && e.target.closest && e.target.closest('button,[role=button],[data-act],select,input[type=checkbox],input[type=radio]');
    if (!el || el.disabled) return;
    var at = performance.now();
    setTimeout(function(){ if (lastSpecific < at) ui('click'); }, 0);
  }, true);

  var midi = function(n){ return 440 * Math.pow(2, (n - 69) / 12); };
  function tone(c, dest, t, freq, dur, o){
    o = o || {};
    var osc = c.createOscillator(), g = c.createGain(), node = osc;
    osc.type = o.type || 'triangle';
    osc.frequency.setValueAtTime(freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(o.slideTo, t + dur);
    if (o.detune) osc.detune.value = o.detune;
    if (o.vibrato){
      var lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = o.vibrato; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * (o.vibDepth || .025), t + dur * .4);
      lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + .05);
    }
    if (o.lp){
      var f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = o.q || .8;
      f.frequency.setValueAtTime(o.lp, t);
      if (o.lpTo) f.frequency.exponentialRampToValueAtTime(o.lpTo, t + dur);
      osc.connect(f); node = f;
    }
    var peak = o.gain || .15, a = o.attack || .006, r = Math.min(o.release || .12, dur * .9);
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    if (dur - r > a) g.gain.setValueAtTime(peak * (o.sustain || 1), t + dur - r);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    node.connect(g); g.connect(dest); send(c, g, o.wet);
    osc.start(t); osc.stop(t + dur + .05);
  }
  function noiseFor(c){
    if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate){
      noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }
  function noise(c, dest, t, dur, o){
    o = o || {};
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseFor(c); src.loop = true;
    f.type = o.ftype || 'bandpass'; f.frequency.value = o.freq || 2000; f.Q.value = o.q || 1;
    var peak = o.gain || .1, a = o.attack || .003;
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest); send(c, g, o.wet);
    src.start(t, Math.random() * .5); src.stop(t + dur + .05);
  }
  // Sleigh-bell shake: a cluster of bright metallic pings over a burst of high noise.
  function bells(c, dest, t, gain){
    gain = gain || 1;
    noise(c, dest, t, .16, {ftype:'highpass', freq:7000, gain:.05 * gain});
    [2637, 3520, 4186, 5274].forEach(function(f, i){
      tone(c, dest, t + i * .012, f * (1 + (Math.random() - .5) * .01), .22, {type:'sine', gain:.03 * gain, release:.2});
    });
  }
  // Brass: two detuned saws per note, filter opening on the attack like a real horn swell.
  function brass(c, dest, t, n, dur, o){
    o = o || {};
    var f = c.createBiquadFilter(), g = c.createGain(), peak = o.gain || .06, a = o.attack || .05;
    f.type = 'lowpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(o.fFrom || 400, t);
    f.frequency.exponentialRampToValueAtTime(o.fTo || 3200, t + a + .04);
    f.frequency.exponentialRampToValueAtTime(o.fEnd || 1500, t + Math.max(a + .1, dur * .7));
    g.gain.setValueAtTime(.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + Math.max(a, dur - (o.release || .35)));
    g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    [-7, 7].forEach(function(det){
      var osc = c.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.value = midi(n); osc.detune.value = det;
      if (o.vibrato){
        var lfo = c.createOscillator(), lg = c.createGain();
        lfo.frequency.value = o.vibrato; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(midi(n) * .006, t + dur * .5);
        lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + .05);
      }
      osc.connect(f); osc.start(t); osc.stop(t + dur + .05);
    });
    f.connect(g); g.connect(dest); send(c, g, o.wet === undefined ? .45 : o.wet);
  }
  function timpani(c, dest, t, freq, gain){
    var osc = c.createOscillator(), g = c.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq * 1.45, t); osc.frequency.exponentialRampToValueAtTime(freq, t + .06);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain || .35, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + 1.1);
    osc.connect(g); g.connect(dest); send(c, g, .5);
    osc.start(t); osc.stop(t + 1.15);
    noise(c, dest, t, .08, {ftype:'lowpass', freq:900, gain:(gain || .35) * .4, wet:.3});
  }
  // Glockenspiel: bright bell partials.
  function glock(c, dest, t, n, gain){
    var f0 = midi(n);
    [[1, 1], [2.76, .35], [5.4, .12]].forEach(function(pt){
      if (f0 * pt[0] > Math.min(16000, c.sampleRate * .45)) return;
      tone(c, dest, t, f0 * pt[0], 1.2 / pt[0] + .2, {type:'sine', gain:(gain || .05) * pt[1], attack:.002, release:1, sustain:.4, wet:.5});
    });
  }
  // Soft choir-like pad.
  function pad(c, dest, t, notes, dur, gain){
    notes.forEach(function(n, i){
      tone(c, dest, t, midi(n), dur, {type:'triangle', gain:gain || .035, attack:.45, release:.8, lp:1800, vibrato:5 + i * .3, vibDepth:.004, detune:(i % 2 ? 9 : -9), wet:.7});
    });
  }
  function distortion(c, amount){
    var ws = c.createWaveShaper(), n = 1024, curve = new Float32Array(n);
    for (var i = 0; i < n; i++){ var x = i * 2 / n - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
    ws.curve = curve; ws.oversample = '2x';
    return ws;
  }

  function chord(c, dest, t, notes, dur, o){
    notes.forEach(function(n, i){
      tone(c, dest, t, midi(n), dur, Object.assign({type:'sawtooth', gain:.07, lp:2600, attack:.02, release:Math.min(.35, dur * .6), detune:(i % 2 ? 6 : -6)}, o || {}));
    });
  }


  // ---------- interface sounds (quiet and short) ----------
  function whoosh(c, dest, t, from, to, dur, gain){
    var src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = noiseFor(c); src.loop = true;
    f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + dur * .45); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    src.start(t, Math.random() * .5); src.stop(t + dur + .05);
  }
  var UI = {
    click: function(c, d, t){
      tone(c, d, t, 1500, .035, {type:'sine', gain:.05, release:.03});
      noise(c, d, t, .02, {ftype:'highpass', freq:5000, gain:.02});
      return .06;
    },
    tab: function(c, d, t){
      whoosh(c, d, t, 700, 3200, .16, .07);
      tone(c, d, t + .03, midi(88), .07, {type:'triangle', gain:.06});
      tone(c, d, t + .08, midi(93), .1, {type:'triangle', gain:.055});
      return .2;
    },
    up: function(c, d, t){ tone(c, d, t, 520, .09, {type:'sine', slideTo:980, gain:.11, release:.06}); return .1; },
    down: function(c, d, t){ tone(c, d, t, 760, .09, {type:'sine', slideTo:400, gain:.1, release:.06}); return .1; },
    select: function(c, d, t){
      tone(c, d, t, midi(84), .08, {type:'triangle', gain:.08});
      tone(c, d, t + .06, midi(91), .14, {type:'triangle', gain:.07});
      return .22;
    },
    back: function(c, d, t){
      tone(c, d, t, midi(79), .08, {type:'triangle', gain:.07});
      tone(c, d, t + .06, midi(72), .13, {type:'triangle', gain:.065});
      return .2;
    },
    open: function(c, d, t){ whoosh(c, d, t, 500, 2600, .14, .06); tone(c, d, t + .05, midi(81), .08, {type:'sine', gain:.05}); return .18; },
    close: function(c, d, t){ whoosh(c, d, t, 2600, 500, .14, .09); tone(c, d, t + .04, midi(76), .08, {type:'sine', gain:.04}); return .16; },
    pick: function(c, d, t){
      [84, 88, 91].forEach(function(n, i){ tone(c, d, t + i * .04, midi(n), .12, {type:'triangle', gain:.065}); });
      tone(c, d, t + .1, midi(103), .18, {type:'sine', gain:.03});
      return .3;
    },
    toggle: function(c, d, t){
      tone(c, d, t, 900, .02, {type:'square', gain:.035, lp:3000});
      tone(c, d, t + .035, 1400, .025, {type:'square', gain:.03, lp:3000});
      return .08;
    },
    undo: function(c, d, t){
      whoosh(c, d, t, 3000, 600, .18, .06);
      tone(c, d, t + .04, midi(86), .08, {type:'triangle', gain:.06});
      tone(c, d, t + .1, midi(79), .12, {type:'triangle', gain:.055});
      return .25;
    },
    spin: function(c, d, t){ tone(c, d, t, 1700 + Math.random() * 500, .025, {type:'sine', gain:.045}); return .04; },
    land: function(c, d, t){
      [79, 84, 88].forEach(function(n){ tone(c, d, t, midi(n), .35, {type:'triangle', gain:.05, release:.3}); });
      bells(c, d, t + .02, .7);
      return .4;
    },
    success: function(c, d, t){
      [76, 81, 88].forEach(function(n, i){ tone(c, d, t + i * .07, midi(n), .2, {type:'sine', gain:.07}); });
      return .35;
    }
  };

  function build(kind, c, dest, t){
    if (UI[kind]) return UI[kind](c, dest, t);
    if (kind === 'chime'){
      tone(c, dest, t, midi(84), .12, {type:'sine', gain:.12});
      tone(c, dest, t + .07, midi(91), .16, {type:'sine', gain:.1});
      return .3;
    }
    if (kind === 'win'){
      // punchy thump, then a bright rising arpeggio, a sparkle and a bell shake
      tone(c, dest, t, 140, .22, {type:'sine', slideTo:55, gain:.35, release:.18});
      [72, 76, 79, 84].forEach(function(n, i){
        tone(c, dest, t + .05 + i * .075, midi(n), i === 3 ? .5 : .13, {type:'square', gain:.075, lp:3800, release:i === 3 ? .35 : .08});
        tone(c, dest, t + .05 + i * .075, midi(n + 12), i === 3 ? .45 : .1, {type:'triangle', gain:.05});
      });
      [96, 100, 103, 108].forEach(function(n, i){ tone(c, dest, t + .34 + i * .045, midi(n), .18, {type:'sine', gain:.04}); });
      bells(c, dest, t + .3, .9);
      return .9;
    }
    if (kind !== 'perfect') return 0;
    // Six-stock / flawless: a cinematic victory. Reverse swell into a huge impact, timpani under wide brass
    // climbing C - A flat - B flat - C, then a held, shining C major with choir pad and glockenspiel.
    var hit = t + .4;
    noise(c, dest, t, .42, {ftype:'highpass', freq:3000, gain:.12, attack:.4, wet:.3});
    tone(c, dest, t + .05, 180, .37, {type:'sine', slideTo:900, gain:.025, attack:.3, wet:.4});
    tone(c, dest, hit, 72, 1.3, {type:'sine', slideTo:34, gain:.5, attack:.004, release:1});
    noise(c, dest, hit, .35, {ftype:'lowpass', freq:300, gain:.25, wet:.3});
    noise(c, dest, hit, 2.6, {ftype:'highpass', freq:5500, gain:.07, wet:.6});
    var prog = [
      {at:0,    dur:.55, notes:[36, 48, 55, 60, 64, 67], timp:midi(36)},
      {at:.55,  dur:.38, notes:[32, 44, 51, 56, 60, 63], timp:midi(32)},
      {at:.93,  dur:.38, notes:[34, 46, 53, 58, 62, 65], timp:midi(34)},
      {at:1.31, dur:2.2, notes:[36, 48, 55, 60, 64, 67, 72, 76], timp:midi(36), last:true}
    ];
    prog.forEach(function(ch){
      timpani(c, dest, hit + ch.at, ch.timp * 2, ch.last ? .45 : .32);
      ch.notes.forEach(function(n){
        brass(c, dest, hit + ch.at, n, ch.dur, {gain:n < 45 ? .05 : .042, attack:ch.last ? .08 : .04, release:ch.last ? .9 : .12, vibrato:ch.last ? 5.2 : 0});
      });
    });
    for (var r = 0; r < 10; r++) timpani(c, dest, hit + 1.05 + r * .025, midi(34) * 2, .06 + r * .012);
    pad(c, dest, hit + 1.25, [60, 64, 67, 72], 2.4, .03);
    [84, 88, 91, 96, 100, 103, 108].forEach(function(n, i){ glock(c, dest, hit + 1.36 + i * .07, n, .05); });
    glock(c, dest, hit + 2.0, 96, .06);
    return 4.2;
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

  window.SmashFX = {result:result, snow:snow, clear:clear, soundOn:soundOn, setSound:setSound, ui:ui, voice:voice, setVoice:setVoice,
    // achievements and other moments: a quip on its own (when sound and voice are on)
    say:function(cat, duo){ if (soundOn() && audio()) say(cat, duo, actx.currentTime + .05); },
    preview:function(v, cat){ preview(v, cat); },
    speak:function(text){ if (soundOn()) speak(text, 0); },
    // test hook: render a sound into any AudioContext (e.g. an OfflineAudioContext)
    _renderSound:function(kind, ctx){ var dest = out(ctx, ctx.destination); return build(kind, ctx, dest, .02); }};
})();
