// Smash Tracker photo logging, shared by the tracker (index.html) and the phone remote (remote.html).
//   SmashPhoto.read(fileOrBlob, {mode:'solo'|'doubles', stocks:3, onProgress(pct, label)})
//     -> Promise<{result:'W'|'L'|null, margin:number|null, koMe:number|null, koNathan:number|null,
//                 confidence:'high'|'low'|'none', summary:string}>
// It reads a photo of the results screen with Tesseract (open-source OCR, loaded on first use from jsDelivr,
// about 7 MB) and guesses the result from the placement numbers above each player, in slot order
// (P1 Cooper, P2 Nathan, then the CPUs; 1v1 is P1 Cooper vs the opponent). If the stats page is in the
// photo, the KOs and Falls rows give KOs and the stocks left. The guess is only a starting point:
// both pages show it on a confirm sheet before anything is logged.
(function(){
  'use strict';
  if (window.SmashPhoto) return;
  var CDN = 'https://cdn.jsdelivr.net/npm/';
  var TESS = CDN + 'tesseract.js@5.1.1/dist/tesseract.min.js';
  var worker = null, loading = null, progressCb = null;

  function loadScript(src){
    return new Promise(function(res, rej){
      var el = document.createElement('script'); el.src = src; el.async = true;
      el.onload = res; el.onerror = function(){ el.remove(); rej(new Error('Could not load the photo reader (check your connection).')); };
      document.head.appendChild(el);
    });
  }
  function ready(){
    if (worker) return Promise.resolve(worker);
    if (loading) return loading;
    loading = (window.Tesseract ? Promise.resolve() : loadScript(TESS)).then(function(){
      return window.Tesseract.createWorker('eng', 1, {
        workerPath: CDN + 'tesseract.js@5.1.1/dist/worker.min.js',
        corePath: CDN + 'tesseract.js-core@5.1.1',
        langPath: CDN + '@tesseract.js-data/eng@1.0.0/4.0.0_best_int',
        logger: function(m){
          if (!progressCb || !m) return;
          var label = /load|initializ/i.test(m.status || '') ? 'Getting the reader ready' : /recogniz/i.test(m.status || '') ? 'Reading the screen' : (m.status || '');
          progressCb(Math.round((m.progress || 0) * 100), label);
        }
      });
    }).then(function(w){ worker = w; return w; }).catch(function(e){ loading = null; throw e; });
    return loading;
  }

  // Scale the photo down. Two versions: a high-contrast grey copy for the text OCR, and a small mask of the
  // bright, colourless pixels (the big white placement numbers) for the digit finder below.
  function prepare(file){
    return new Promise(function(res, rej){
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){
        var k = Math.min(1, 1800 / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
        var c = document.createElement('canvas'); c.width = w; c.height = h;
        var ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
        var d = ctx.getImageData(0, 0, w, h), px = d.data;
        for (var i = 0; i < px.length; i += 4){
          var y = .299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2], v = Math.max(0, Math.min(255, (y - 128) * 1.35 + 128));
          px[i] = px[i + 1] = px[i + 2] = v;
        }
        // small mask
        var k2 = Math.min(1, 640 / Math.max(w, h)), mw = Math.round(w * k2), mh = Math.round(h * k2);
        var sc = document.createElement('canvas'); sc.width = mw; sc.height = mh;
        var sx = sc.getContext('2d', {willReadFrequently: true}); sx.drawImage(img, 0, 0, mw, mh);
        var sd = sx.getImageData(0, 0, mw, mh).data, mask = new Uint8Array(mw * mh), ys = [];
        for (var j = 0, n = 0; j < sd.length; j += 4, n++) ys.push(.299 * sd[j] + .587 * sd[j + 1] + .114 * sd[j + 2]);
        var sorted = ys.slice().sort(function(a, b){ return a - b; }), hi = Math.max(150, sorted[Math.floor(sorted.length * .97)] * .82);
        for (j = 0, n = 0; j < sd.length; j += 4, n++){
          var chroma = Math.max(sd[j], sd[j + 1], sd[j + 2]) - Math.min(sd[j], sd[j + 1], sd[j + 2]);
          mask[n] = ys[n] >= hi && chroma < 70 ? 1 : 0;
        }
        ctx.putImageData(d, 0, 0);
        URL.revokeObjectURL(url);
        res({grey:c, w:w, h:h, mask:mask, mw:mw, mh:mh, k2:k2});
      };
      img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('That file is not a picture I can open.')); };
      img.src = url;
    });
  }

  // ---- big-digit finder: OCR is poor at huge single digits, so the placement numbers are found as white blobs
  // and matched against 1-4 drawn in a few heavy fonts, cell by cell on a 5x7 grid ----
  var GX = 5, GY = 7, templates = null;
  function gridOf(get, x0, y0, bw, bh){
    var out = [];
    for (var gy = 0; gy < GY; gy++) for (var gx = 0; gx < GX; gx++){
      var ax = x0 + Math.floor(gx * bw / GX), bx = x0 + Math.max(Math.floor((gx + 1) * bw / GX), Math.floor(gx * bw / GX) + 1);
      var ay = y0 + Math.floor(gy * bh / GY), by = y0 + Math.max(Math.floor((gy + 1) * bh / GY), Math.floor(gy * bh / GY) + 1);
      var on = 0, all = 0;
      for (var yy = ay; yy < by; yy++) for (var xx = ax; xx < bx; xx++){ all++; on += get(xx, yy); }
      out.push(all ? on / all : 0);
    }
    return out;
  }
  function makeTemplates(){
    if (templates) return templates;
    templates = [];
    var fonts = ['900 90px sans-serif', 'bold 90px serif', 'bold 90px monospace', '900 90px system-ui', 'bold 90px Verdana, sans-serif'];
    var c = document.createElement('canvas'); c.width = 120; c.height = 130;
    var x = c.getContext('2d', {willReadFrequently: true});
    fonts.forEach(function(f){ ['1', '2', '3', '4'].forEach(function(ch){
      x.fillStyle = '#000'; x.fillRect(0, 0, 120, 130); x.fillStyle = '#fff'; x.font = f; x.textBaseline = 'middle'; x.textAlign = 'center';
      x.fillText(ch, 60, 66);
      var d = x.getImageData(0, 0, 120, 130).data, get = function(xx, yy){ return d[(yy * 120 + xx) * 4] > 127 ? 1 : 0; };
      var x0 = 120, x1 = -1, y0 = 130, y1 = -1;
      for (var yy = 0; yy < 130; yy++) for (var xx = 0; xx < 120; xx++) if (get(xx, yy)){ if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      if (x1 < 0) return;
      templates.push({ch:+ch, ar:(x1 - x0 + 1) / (y1 - y0 + 1), g:gridOf(get, x0, y0, x1 - x0 + 1, y1 - y0 + 1)});
    }); });
    // a plain "1" (stem and flag, no foot) drawn by hand, since system fonts mostly give it a foot
    [[.42, .30], [.5, .38], [.36, .22]].forEach(function(v){
      var bw = 40, bh = 90, sw = Math.round(bw * v[0]), get;
      var grid = function(xx, yy){
        if (xx >= bw - sw) return 1;                                       // stem on the right
        var fy = (bw - sw - xx) / (bw - sw) * bh * v[1];                   // flag sloping down to the left
        return yy < fy + bh * .14 && yy > fy - bh * .02 ? 1 : 0;
      };
      get = function(xx, yy){ return grid(xx, yy); };
      templates.push({ch:1, ar:bw / bh, g:gridOf(get, 0, 0, bw, bh)});
    });
    return templates;
  }
  function findDigits(p){
    var W = p.mw, H = p.mh, m = p.mask, seen = new Int32Array(W * H), blobs = [], stack = [];
    for (var s0 = 0; s0 < m.length; s0++){
      if (!m[s0] || seen[s0]) continue;
      var id = blobs.length + 1, b = {x0:W, x1:0, y0:H, y1:0, n:0, id:id};
      seen[s0] = id; stack.push(s0);
      while (stack.length){
        var q = stack.pop(), qx = q % W, qy = (q - qx) / W;
        b.n++; if (qx < b.x0) b.x0 = qx; if (qx > b.x1) b.x1 = qx; if (qy < b.y0) b.y0 = qy; if (qy > b.y1) b.y1 = qy;
        if (qx > 0 && m[q - 1] && !seen[q - 1]){ seen[q - 1] = id; stack.push(q - 1); }
        if (qx < W - 1 && m[q + 1] && !seen[q + 1]){ seen[q + 1] = id; stack.push(q + 1); }
        if (qy > 0 && m[q - W] && !seen[q - W]){ seen[q - W] = id; stack.push(q - W); }
        if (qy < H - 1 && m[q + W] && !seen[q + W]){ seen[q + W] = id; stack.push(q + W); }
      }
      blobs.push(b);
    }
    var T = makeTemplates();
    var digits = blobs.map(function(b){
      var bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, fill = b.n / (bw * bh);
      if (bh < H * .07 || bh > H * .55 || bw > W * .22 || bh / bw < .9 || bh / bw > 6 || fill < .12 || fill > .85) return null;
      var get = function(xx, yy){ return seen[yy * W + xx] === b.id ? 1 : 0; };
      var g = gridOf(get, b.x0, b.y0, bw, bh), ar = bw / bh, best = null;
      T.forEach(function(t){
        var dist = 0; for (var i = 0; i < g.length; i++) dist += (g[i] - t.g[i]) * (g[i] - t.g[i]);
        dist = dist / g.length + Math.pow(Math.log(ar / t.ar), 2) * .15;
        if (!best || dist < best.d) best = {ch:t.ch, d:dist};
      });
      if (!best || best.d > .14) return null;
      var k = 1 / p.k2;
      return {t:String(best.ch), x:(b.x0 + b.x1) / 2 * k, y:(b.y0 + b.y1) / 2 * k, h:bh * k, d:best.d};
    }).filter(Boolean);
    var maxH = digits.reduce(function(a, d){ return Math.max(a, d.h); }, 0);
    return digits.filter(function(d){ return d.h >= maxH * .7; });
  }

  // OCR slips on small numbers: letters that look like digits
  var LOOKS = {'°':'0', 'o':'0', 'O':'0', 'D':'0', 'Q':'0', 'l':'1', 'I':'1', '|':'1', '!':'1', 'i':'1', ']':'1', 'Z':'2', 'z':'2', 'S':'5', 's':'5', 'B':'8', 'g':'9', 'q':'9'};
  function asNum(t){
    t = String(t).replace(/[.,:;'"`]+$/, '');
    var u = t.split('').map(function(ch){ return LOOKS[ch] || ch; }).join('');
    return /^\d{1,2}$/.test(u) ? parseInt(u, 10) : null;
  }

  function tilt(pts){
    if (pts.length < 2) return 0;
    var mx = 0, my = 0; pts.forEach(function(w){ mx += w.x; my += w.y; }); mx /= pts.length; my /= pts.length;
    var num = 0, den = 0; pts.forEach(function(w){ num += (w.x - mx) * (w.y - my); den += (w.x - mx) * (w.x - mx); });
    return den ? Math.max(-.15, Math.min(.15, num / den)) : 0;
  }
  function wordsOf(r, map){
    return (r.data.words || []).map(function(w){
      var b = w.bbox, c = map((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), k = map.k || 1;
      return {t:String(w.text || '').trim(), x:c[0], y:c[1], h:(b.y1 - b.y0) / k, w:(b.x1 - b.x0) / k, c:w.confidence};
    }).filter(function(w){ return w.t; });
  }

  var LABELS = {kos:/^K[O0]s?$/i, falls:/^(F|f)?a[l1I|]{2}s?$/i};
  function parse(ws, W, H, opts, digits, strips){
    var dubs = opts.mode === 'doubles', slots = dubs ? 4 : 2, stocks = Number(opts.stocks) || 3, full = stocks * (dubs ? 2 : 1);
    // placements: big digits from the blob finder; if that missed, big 1-4s the OCR read
    var cand = (digits || []).slice();
    if (cand.length !== slots){
      var ocr = ws.filter(function(w){ return /^[1-4](st|nd|rd|th)?[.,]?$/i.test(w.t); });
      var mh = ocr.reduce(function(a, w){ return Math.max(a, w.h); }, 0);
      ocr = ocr.filter(function(w){ return w.h >= mh * .6 && w.h >= H * .06; });
      if (ocr.length === slots || !cand.length) cand = ocr;
    }
    cand.sort(function(a, b){ return a.x - b.x; });
    var cols = [];
    cand.forEach(function(w){ if (!cols.length || w.x - cols[cols.length - 1].x > W * .08) cols.push(w); else if (w.h > cols[cols.length - 1].h) cols[cols.length - 1] = w; });
    var places = cols.map(function(w){ return parseInt(w.t, 10); });
    // tilt of the photo, from the placement row (falls back to level)
    var slope = tilt(cols);
    var result = null, confidence = 'none';
    if (places.length === slots){
      var mine = dubs ? places.slice(0, 2) : places.slice(0, 1), theirs = dubs ? places.slice(2) : places.slice(1);
      var a1 = Math.min.apply(null, mine), b1 = Math.min.apply(null, theirs);
      if (a1 !== b1){ result = a1 < b1 ? 'W' : 'L'; confidence = 'high'; }
    } else if (cols.length){
      var first = cols.filter(function(w){ return w.t === '1'; })[0];
      if (first){ result = first.x < W / 2 ? 'W' : 'L'; confidence = 'low'; }
    }
    // stats rows: numbers on the same (tilted) line as the row's label, matched to the player columns
    var colX = cols.length === slots ? cols.map(function(w){ return w.x; }) : null;
    function row(re, key){
      var lab = ws.filter(function(w){ return re.test(w.t); })[0];
      if (!lab) return null;
      var page = ws.filter(function(w){ return asNum(w.t) !== null && w.x > lab.x + lab.h && Math.abs((w.y - lab.y) - slope * (w.x - lab.x)) < Math.max(lab.h, w.h) * .9; });
      var strip = strips && strips[key] || [];
      // the digits-only strip read wins; the page read fills any gaps
      var nums = strip.concat(page.filter(function(w){ return !strip.some(function(o){ return Math.abs(o.x - w.x) < lab.h * 1.2; }); }))
        .sort(function(a, b){ return a.x - b.x; });
      if (colX){
        var gap = (colX[colX.length - 1] - colX[0]) / (slots - 1) / 2;
        var out = colX.map(function(cx){
          var best = null; nums.forEach(function(n){ var d = Math.abs(n.x - cx); if (d < gap && (!best || d < Math.abs(best.x - cx))) best = n; });
          return best ? asNum(best.t) : null;
        });
        return out.some(function(v){ return v !== null; }) ? out : null;
      }
      return nums.length >= slots ? nums.slice(0, slots).map(function(w){ return asNum(w.t); }) : null;
    }
    function known(list, idx){ return idx.every(function(i){ return list[i] !== null && list[i] !== undefined; }); }
    var kos = row(LABELS.kos, 'kos'), falls = row(LABELS.falls, 'falls');
    // impossible values are misreads: nobody falls more than their stocks, or KOs more than the other side has
    var cap = function(list, max){ return list && list.map(function(v){ return v !== null && v > max ? null : v; }); };
    falls = cap(falls, stocks); kos = cap(kos, stocks * (dubs ? 2 : 1));
    var margin = null;
    if (falls && result){
      var team = result === 'W' ? (dubs ? [0, 1] : [0]) : (dubs ? [2, 3] : [1]);
      if (known(falls, team)){
        var lost = team.reduce(function(a, i){ return a + falls[i]; }, 0);
        margin = Math.max(0, Math.min(full, full - lost));
      }
    }
    var show = function(list){ return list.map(function(v){ return v === null ? '?' : v; }).join(' '); };
    var bits = [];
    if (places.length) bits.push('placements ' + places.join(' '));
    if (kos) bits.push('KOs ' + show(kos));
    if (falls) bits.push('falls ' + show(falls));
    return {result:result, margin:margin, koMe: kos ? kos[0] : null, koNathan: kos && dubs ? kos[1] : null, confidence:confidence,
      summary: bits.length ? 'Read ' + bits.join(' · ') : 'Couldn’t find placement numbers in that photo'};
  }

  // Crop to the area around the placement numbers (the TV) and blow it up so small text is readable.
  function screenCrop(prep, digits){
    var W = prep.w, H = prep.h, x0 = 0, y0 = 0, x1 = W, y1 = H;
    if (digits.length >= 2){
      var xs = digits.map(function(d){ return d.x; }), ys = digits.map(function(d){ return d.y; }), dh = Math.max.apply(null, digits.map(function(d){ return d.h; }));
      var gap = (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / (digits.length - 1);
      x0 = Math.max(0, Math.min.apply(null, xs) - gap * .9); x1 = Math.min(W, Math.max.apply(null, xs) + gap * .9);
      y0 = Math.max(0, Math.min.apply(null, ys) - dh * 1.5); y1 = H;
    }
    var k = Math.max(1, Math.min(2.5, 1600 / (x1 - x0)));
    var c = document.createElement('canvas'); c.width = Math.round((x1 - x0) * k); c.height = Math.round((y1 - y0) * k);
    c.getContext('2d').drawImage(prep.grey, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    var map = function(x, y){ return [x0 + x / k, y0 + y / k]; }; map.k = k;
    return {canvas:c, map:map};
  }
  // One row of the stats table (KOs or Falls), straightened and enlarged, to be read as digits only.
  function rowStrip(prep, lab, slope){
    var a = Math.atan(slope), sx0 = lab.x + lab.w / 2 + lab.h * .3, hh = lab.h * 1.2, len = prep.w - sx0;
    var k = Math.max(1, Math.min(4, 44 / lab.h));
    var c = document.createElement('canvas'); c.width = Math.round(len * k); c.height = Math.round(hh * 2 * k);
    var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.scale(k, k); x.translate(0, hh); x.rotate(-a); x.translate(-sx0, -lab.y); x.drawImage(prep.grey, 0, 0);
    var map = function(px, py){ var u = px / k, v = py / k - hh; return [sx0 + u * Math.cos(a) - v * Math.sin(a), lab.y + u * Math.sin(a) + v * Math.cos(a)]; };
    map.k = k;
    return {canvas:c, map:map};
  }

  function read(file, opts){
    opts = opts || {};
    progressCb = opts.onProgress || null;
    if (progressCb) progressCb(0, worker ? 'Reading the screen' : 'Getting the reader ready (first time downloads about 7 MB)');
    var prep, digits, wk, words, strips = {};
    var ocr = function(canvas, psm, digitsOnly){
      return wk.setParameters({tessedit_pageseg_mode: psm, tessedit_char_whitelist: digitsOnly ? '0123456789' : ''}).then(function(){ return wk.recognize(canvas); });
    };
    return prepare(file).then(function(p){ prep = p; digits = findDigits(p); return ready(); })
      .then(function(w){ wk = w; var sc = screenCrop(prep, digits); return ocr(sc.canvas, '6').then(function(r){
        words = wordsOf(r, sc.map);
        var hasLabel = function(){ return words.some(function(w){ return LABELS.kos.test(w.t) || LABELS.falls.test(w.t); }); };
        // no stats labels found: try the other two page layouts before giving up on the stats
        if (hasLabel()) return;
        return ocr(sc.canvas, '11').then(function(r2){
          words = words.concat(wordsOf(r2, sc.map));
          if (!hasLabel()) return ocr(sc.canvas, '3').then(function(r3){ words = words.concat(wordsOf(r3, sc.map)); });
        });
      }); })
      .then(function(){
        var slope = tilt(digits), jobs = Promise.resolve();
        Object.keys(LABELS).forEach(function(key){
          var lab = words.filter(function(w){ return LABELS[key].test(w.t); })[0];
          if (!lab) return;
          jobs = jobs.then(function(){
            var st = rowStrip(prep, lab, slope);
            return ocr(st.canvas, '7', true).then(function(r){
              strips[key] = wordsOf(r, st.map).filter(function(w){ return /^\d{1,2}$/.test(w.t) && w.h > lab.h * .5 && w.h < lab.h * 2.2; });
            });
          });
        });
        return jobs;
      })
      .then(function(){ progressCb = null; return parse(words, prep.w, prep.h, opts, digits, strips); },
            function(e){ progressCb = null; throw e; });
  }

  window.SmashPhoto = {read:read, ready:ready, _parse:parse};
})();
