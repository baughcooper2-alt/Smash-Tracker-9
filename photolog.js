// Smash Tracker photo logging, shared by the tracker (index.html) and the phone remote (remote.html).
//   SmashPhoto.read(fileOrBlob, {mode:'solo'|'doubles', stocks:3, onProgress(pct, label)})
//     -> Promise<{result:'W'|'L'|null, margin, koMe, koNathan, fallsMe, fallsNathan, sdMe, sdNathan,
//                 confidence:'high'|'stats'|'low'|'none', how, marginHow, summary, seen}>
//
// Only our team is read. On the results screen the far-left column is Cooper (P1) and the next one is
// Nathan (P2, doubles only). For each of those columns it reads the KOs, Falls and SDs rows and, if it can
// see it, the placement number at the top. Everything else on the screen (the other team) is ignored.
//
// Who won: the placement number in Cooper's column (1 = win). If that can't be read, the Falls row decides:
// if our team fell as many times as it had stocks, it's a loss, otherwise a win.
// Stocks left: a win is our stocks minus our falls; a loss is their stocks minus our KOs (an estimate).
// Text is read with Tesseract (open-source OCR, loaded on first use from jsDelivr, about 7 MB). Nothing is
// logged from here: both pages show the result on a confirm sheet first.
(function(){
  'use strict';
  if (window.SmashPhoto) return;
  var CDN = 'https://cdn.jsdelivr.net/npm/';
  var TESS = CDN + 'tesseract.js@5.1.1/dist/tesseract.min.js';
  var worker = null, loading = null, progressCb = null, stepLabel = '';
  var DBG = null;   // read(file, {debug:true}) fills this with everything it saw, for the diagram view

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
          var label = /load|initializ/i.test(m.status || '') ? 'Getting the reader ready' : (stepLabel || 'Reading the screen');
          progressCb(Math.round((m.progress || 0) * 100), label);
        }
      });
    }).then(function(w){ worker = w; return w; }).catch(function(e){ loading = null; throw e; });
    return loading;
  }

  // ---------- image prep ----------
  function boxBlur(a, w, h, r){
    var t = new Float32Array(a.length), x, y, acc, n = 2 * r + 1;
    for (y = 0; y < h; y++){
      acc = 0; for (x = -r; x <= r; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))];
      for (x = 0; x < w; x++){ t[y * w + x] = acc / n; acc += a[y * w + Math.min(w - 1, x + r + 1)] - a[y * w + Math.max(0, x - r)]; }
    }
    for (x = 0; x < w; x++){
      acc = 0; for (y = -r; y <= r; y++) acc += t[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (y = 0; y < h; y++){ a[y * w + x] = acc / n; acc += t[Math.min(h - 1, y + r + 1) * w + x] - t[Math.max(0, y - r) * w + x]; }
    }
  }
  // Local-contrast black/white: a pixel is ink if it's clearly lighter (or darker) than its neighbourhood.
  // Glare and dark corners shift the whole neighbourhood, so text still stands out.
  function inkImage(prep, lighter){
    var w = prep.w, h = prep.h, a = prep.lum, m = new Float32Array(a);
    boxBlur(m, w, h, Math.max(6, Math.round(w / 45)));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'), d = x.createImageData(w, h), q = d.data;
    for (var i = 0; i < a.length; i++){
      var ink = lighter ? a[i] - m[i] > 16 : m[i] - a[i] > 16, o = i * 4;
      q[o] = q[o + 1] = q[o + 2] = ink ? 0 : 255; q[o + 3] = 255;
    }
    x.putImageData(d, 0, 0);
    return c;
  }
  // grey: high-contrast greyscale. inv: the same, flipped (white text on dark panels becomes dark on light).
  // masks: small black/white maps of bright pixels, for the big placement digit.
  function loadImage(file){
    return new Promise(function(res, rej){
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){ URL.revokeObjectURL(url); res(img); };
      img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('That file is not a picture I can open.')); };
      img.src = url;
    });
  }
  // Everything the reader works on, made from one region of the photo (sx, sy, sw, sh) scaled by k.
  function build(img, sx, sy, sw, sh, k){
        var w = Math.round(sw * k), h = Math.round(sh * k);
        var mk = function(){ var c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
        var grey = mk(), inv = mk();
        var gx = grey.getContext('2d', {willReadFrequently: true});
        gx.imageSmoothingEnabled = true; gx.imageSmoothingQuality = 'high';   // proper averaging when shrinking cuts moire
        gx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        var d = gx.getImageData(0, 0, w, h), px = d.data, di = inv.getContext('2d').createImageData(w, h), q = di.data;
        for (var i = 0; i < px.length; i += 4){
          var y = .299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2], v = Math.max(0, Math.min(255, (y - 128) * 1.4 + 128));
          px[i] = px[i + 1] = px[i + 2] = v; q[i] = q[i + 1] = q[i + 2] = 255 - v; q[i + 3] = 255;
        }
        gx.putImageData(d, 0, 0); inv.getContext('2d').putImageData(di, 0, 0);
        // soft: the grey copy blurred a little, which melts the TV's pixel grid (moire) back into solid text
        var lum = new Float32Array(w * h);
        for (i = 0; i < lum.length; i++) lum[i] = px[i * 4];
        var r = Math.max(1, Math.round(w / 1100));
        boxBlur(lum, w, h, r); boxBlur(lum, w, h, r);
        var soft = mk(), softInv = mk(), sd2 = soft.getContext('2d').createImageData(w, h), si2 = softInv.getContext('2d').createImageData(w, h);
        for (i = 0; i < lum.length; i++){ var o = i * 4, vv = lum[i]; sd2.data[o] = sd2.data[o + 1] = sd2.data[o + 2] = vv; si2.data[o] = si2.data[o + 1] = si2.data[o + 2] = 255 - vv; sd2.data[o + 3] = si2.data[o + 3] = 255; }
        soft.getContext('2d').putImageData(sd2, 0, 0); softInv.getContext('2d').putImageData(si2, 0, 0);
        // small masks for the digit finder
        var k2 = Math.min(1, 640 / Math.max(w, h)), mw = Math.round(w * k2), mh = Math.round(h * k2);
        var sc = document.createElement('canvas'); sc.width = mw; sc.height = mh;
        var sx0 = sx, sy0 = sy;
        var sx = sc.getContext('2d', {willReadFrequently: true}); sx.imageSmoothingQuality = 'high'; sx.drawImage(img, sx0, sy0, sw, sh, 0, 0, mw, mh);
        var sd = sx.getImageData(0, 0, mw, mh).data, ys = new Float32Array(mw * mh);
        for (var j = 0, n = 0; j < sd.length; j += 4, n++) ys[n] = .299 * sd[j] + .587 * sd[j + 1] + .114 * sd[j + 2];
        // "bright" is judged against the area around each pixel, not a fixed level: a TV photo is dimmer at
        // the edges and washed out under glare, so the same white digit can be grey in one spot, white in another
        var I = new Float64Array((mw + 1) * (mh + 1));
        for (var yy = 0; yy < mh; yy++){ var rs = 0; for (var xx = 0; xx < mw; xx++){ rs += ys[yy * mw + xx]; I[(yy + 1) * (mw + 1) + xx + 1] = I[yy * (mw + 1) + xx + 1] + rs; } }
        var R = Math.max(8, Math.round(Math.max(mw, mh) / 14));
        var white = new Uint8Array(mw * mh), bright = new Uint8Array(mw * mh);
        for (yy = 0, n = 0; yy < mh; yy++) for (xx = 0; xx < mw; xx++, n++){
          var ax = Math.max(0, xx - R), bx = Math.min(mw, xx + R + 1), ay = Math.max(0, yy - R), by = Math.min(mh, yy + R + 1);
          var mean = (I[by * (mw + 1) + bx] - I[ay * (mw + 1) + bx] - I[by * (mw + 1) + ax] + I[ay * (mw + 1) + ax]) / ((bx - ax) * (by - ay));
          j = n * 4;
          var mxc = Math.max(sd[j], sd[j + 1], sd[j + 2]), chroma = mxc - Math.min(sd[j], sd[j + 1], sd[j + 2]);
          var lift = ys[n] - mean;
          white[n] = lift > 42 && ys[n] > 105 && chroma < 75 ? 1 : 0;
          bright[n] = lift > 42 && mxc > 140 ? 1 : 0;   // white or bright gold/coloured
        }
        // small colour copy, for telling the fighters apart by look
        var k3 = Math.min(1, 720 / Math.max(w, h)), cw = Math.round(w * k3), ch = Math.round(h * k3);
        var col = document.createElement('canvas'); col.width = cw; col.height = ch;
        var cx2 = col.getContext('2d', {willReadFrequently: true}); cx2.imageSmoothingQuality = 'high'; cx2.drawImage(img, sx0, sy0, sw, sh, 0, 0, cw, ch);
        return {grey:grey, inv:inv, soft:soft, softInv:softInv, lum:lum, img:img, w:w, h:h, masks:[white, bright], mw:mw, mh:mh, k2:k2, color:col, k3:k3};
  }

  // ---------- our team's panels ----------
  // Cooper and Nathan are always the two far-left panels, and always the same team colour (blue, red...).
  // Find the far-left block of one strong team colour; that's the only part of the photo that gets read.
  var TEAM = ['', 'red', 'blue', 'green', 'yellow'];
  function teamOf(r, g, b){
    var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx < 70 || (mx - mn) / mx < .42) return 0;
    var h = mx === mn ? 0 : mx === r ? ((g - b) / (mx - mn) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
    h *= 60;
    if (h < 16 || h > 338) return 1;
    if (h >= 190 && h <= 248) return 2;
    if (h >= 85 && h <= 160) return 3;
    if (h >= 42 && h <= 66) return 4;
    return 0;
  }
  function findTeamBlock(prep, nCols){
    var C = prep.color, W = C.width, H = C.height, d = C.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, W, H).data;
    var cls = new Uint8Array(W * H), colN = [null, new Float32Array(W), new Float32Array(W), new Float32Array(W), new Float32Array(W)];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++){
      var i = y * W + x, c = teamOf(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]); cls[i] = c; if (c) colN[c][x]++;
    }
    // per colour: the leftmost wide run of columns where that colour is common
    var cands = [];
    for (var c = 1; c <= 4; c++){
      var p = colN[c], mx = 0; for (x = 0; x < W; x++) mx = Math.max(mx, p[x]);
      if (mx < H * .06) continue;
      var thr = mx * .3, runs = [], cur = null, gapMax = W * .025, lastOn = -1e9;
      for (x = 0; x < W; x++){
        if (p[x] >= thr){ if (cur && x - lastOn <= gapMax) cur.R = x; else { cur = {L:x, R:x}; runs.push(cur); } lastOn = x; }
      }
      runs = runs.filter(function(r){ return r.R - r.L >= W * .06; });
      if (!runs.length) continue;
      var area = 0; for (x = runs[0].L; x <= runs[0].R; x++) area += p[x];
      cands.push({c:c, L:runs[0].L, R:runs[0].R, area:area});
    }
    if (!cands.length) return null;
    var big = Math.max.apply(null, cands.map(function(q){ return q.area; }));
    cands = cands.filter(function(q){ return q.area >= big * .3; }).sort(function(a, b){ return a.L - b.L; });
    var t = cands[0], L = t.L, R = t.R;
    // its rows
    var rowOn = function(yy){ var n = 0; for (var xx = L; xx <= R; xx++) if (cls[yy * W + xx] === t.c) n++; return n; };
    var T = -1, B = -1;
    for (y = 0; y < H; y++) if (rowOn(y) >= (R - L) * .15){ if (T < 0) T = y; B = y; }
    if (T < 0 || B - T < H * .08) return null;
    // one panel found where there should be two (a gap between them, or the second one partly hidden)
    var aspect = (R - L) / (B - T), per = .55;
    if (nCols === 2 && aspect < per * 1.45) R = Math.min(W - 1, L + (R - L) * 2);
    if (nCols === 1 && aspect > per * 1.6) R = L + (R - L) / 2;
    // tilt from the top edge of the colour block
    var pts = [];
    for (x = L; x <= R; x += Math.max(1, Math.round((R - L) / 40))){
      for (y = Math.max(0, T - Math.round(H * .05)); y < Math.min(H, T + Math.round(H * .15)); y++) if (cls[y * W + x] === t.c){ pts.push([x, y]); break; }
    }
    var slope = 0;
    if (pts.length > 5){
      var mxp = 0, myp = 0; pts.forEach(function(q){ mxp += q[0]; myp += q[1]; }); mxp /= pts.length; myp /= pts.length;
      var nu = 0, de = 0; pts.forEach(function(q){ nu += (q[0] - mxp) * (q[1] - myp); de += (q[0] - mxp) * (q[0] - mxp); });
      slope = de ? Math.max(-.15, Math.min(.15, nu / de)) : 0;
    }
    var k = 1 / prep.k3;
    return {team:TEAM[t.c], L:L * k, R:R * k, T:T * k, B:B * k, slope:slope};
  }

  // ---------- big-digit finder (placement numbers) ----------
  // OCR is poor at huge single digits, so they're found as bright blobs and matched against 1-4 drawn in a
  // few heavy fonts (plus a hand-drawn footless 1), cell by cell on a 5x7 grid.
  var GX = 5, GY = 7, templates = null, templates10 = null;
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
  function fontTemplates(chars, list){
    var fonts = ['900 90px sans-serif', 'bold 90px serif', 'bold 90px monospace', '900 90px system-ui', 'bold 90px Verdana, sans-serif', '600 90px sans-serif'];
    var c = document.createElement('canvas'); c.width = 120; c.height = 130;
    var x = c.getContext('2d', {willReadFrequently: true});
    fonts.forEach(function(f){ chars.forEach(function(ch){
      x.fillStyle = '#000'; x.fillRect(0, 0, 120, 130); x.fillStyle = '#fff'; x.font = f; x.textBaseline = 'middle'; x.textAlign = 'center';
      x.fillText(ch, 60, 66);
      var d = x.getImageData(0, 0, 120, 130).data, get = function(xx, yy){ return d[(yy * 120 + xx) * 4] > 127 ? 1 : 0; };
      var x0 = 120, x1 = -1, y0 = 130, y1 = -1;
      for (var yy = 0; yy < 130; yy++) for (var xx = 0; xx < 120; xx++) if (get(xx, yy)){ if (xx < x0) x0 = xx; if (xx > x1) x1 = xx; if (yy < y0) y0 = yy; if (yy > y1) y1 = yy; }
      if (x1 < 0) return;
      list.push({ch:+ch, ar:(x1 - x0 + 1) / (y1 - y0 + 1), g:gridOf(get, x0, y0, x1 - x0 + 1, y1 - y0 + 1)});
    }); });
    return list;
  }
  function makeTemplates(){
    if (templates) return templates;
    templates = fontTemplates(['1', '2', '3', '4'], []);
    [[.42, .30], [.5, .38], [.36, .22]].forEach(function(v){
      var bw = 40, bh = 90, sw = Math.round(bw * v[0]);
      var get = function(xx, yy){
        if (xx >= bw - sw) return 1;
        var fy = (bw - sw - xx) / (bw - sw) * bh * v[1];
        return yy < fy + bh * .14 && yy > fy - bh * .02 ? 1 : 0;
      };
      templates.push({ch:1, ar:bw / bh, g:gridOf(get, 0, 0, bw, bh)});
    });
    return templates;
  }
  // nearest digit 0-9 for a small clean mark (used when the OCR comes back empty)
  function classify(get, x0, y0, bw, bh, textH){
    if (!templates10) templates10 = fontTemplates(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], []);
    // a plain upright bar is a 1 (no font template is that bare)
    if (bw / bh < .36 && (!textH || (bh > textH * .6 && bh < textH * 2.4))){ var on = 0; for (var yy = y0; yy < y0 + bh; yy++) for (var xx = x0; xx < x0 + bw; xx++) on += get(xx, yy); if (on / (bw * bh) > .55) return 1; }
    var g = gridOf(get, x0, y0, bw, bh), ar = bw / bh, best = null;
    templates10.forEach(function(t){
      var dist = 0; for (var i = 0; i < g.length; i++) dist += (g[i] - t.g[i]) * (g[i] - t.g[i]);
      dist = dist / g.length + Math.pow(Math.log(ar / t.ar), 2) * .15;
      if (!best || dist < best.d) best = {ch:t.ch, d:dist};
    });
    return best && best.d < .12 ? best.ch : null;
  }
  function blobsOf(p, m, crop){
    var W = p.mw, H = p.mh, seen = new Int32Array(W * H), blobs = [], stack = [];
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
    var T = makeTemplates(), k = 1 / p.k2;
    return blobs.map(function(b){
      var bw = b.x1 - b.x0 + 1, bh = b.y1 - b.y0 + 1, fill = b.n / (bw * bh);
      // whole photo: a digit is a small part of it; a crop around one digit: it fills much of the crop
      if (crop ? (bh < H * .15 || bh > H * .95 || bw > W * .8) : (bh < H * .06 || bh > H * .55 || bw > W * .22)) return null;
      if (bh / bw < .9 || bh / bw > 6 || fill < .12 || fill > .85) return null;
      var get = function(xx, yy){ return seen[yy * W + xx] === b.id ? 1 : 0; };
      var g = gridOf(get, b.x0, b.y0, bw, bh), ar = bw / bh, best = null;
      T.forEach(function(t){
        var dist = 0; for (var i = 0; i < g.length; i++) dist += (g[i] - t.g[i]) * (g[i] - t.g[i]);
        dist = dist / g.length + Math.pow(Math.log(ar / t.ar), 2) * .15;
        if (!best || dist < best.d) best = {ch:t.ch, d:dist};
      });
      if (!best || best.d > .14) return null;
      return {ch:best.ch, x:(b.x0 + b.x1) / 2 * k, y:(b.y0 + b.y1) / 2 * k, h:bh * k, d:best.d};
    }).filter(Boolean);
  }
  function findDigits(p){
    var all = [];
    p.masks.forEach(function(m){ all = all.concat(blobsOf(p, m)); });
    // the same digit found in both masks: keep the better match
    all.sort(function(a, b){ return a.d - b.d; });
    var out = [];
    all.forEach(function(d){ if (!out.some(function(o){ return Math.abs(o.x - d.x) < o.h * .5 && Math.abs(o.y - d.y) < o.h * .5; })) out.push(d); });
    var maxH = out.reduce(function(a, d){ return Math.max(a, d.h); }, 0);
    return out.filter(function(d){ return d.h >= maxH * .6; });
  }

  // ---------- words ----------
  // only the safe look-alikes: S, B, Z and friends are more often stray letters (the S of "SDs") than digits
  var LOOKS = {'°':'0', 'o':'0', 'O':'0', 'l':'1', 'I':'1', '|':'1', ']':'1'};
  function asNum(t){
    t = String(t).replace(/^[:.\-–=]+|[.,:;'"`]+$/g, '');
    var u = t.split('').map(function(ch){ return LOOKS[ch] || ch; }).join('');
    return /^\d{1,2}$/.test(u) ? parseInt(u, 10) : null;
  }
  // row labels, forgiving of common misreads ("K0s", "KO's", "Fal1s", "SD's", "S0s")
  var LABELS = {
    kos:   /^K[O0o][’'`]?[s5S]?$/,
    falls: /^(?:[FfE][aA@4][l1Ii|!][l1Ii|!][s5S]?|[aA@][l1I|][l1I|][s5S])$/,
    sds:   /^S[DO0][’'`]?[s5S]?$/
  };
  var LABEL_LEAD = /^(K[O0o][’'`]?[s5S]?|[FfE][aA@4][l1Ii|!][l1Ii|!][s5S]?|S[DO0][’'`]?[s5S]?)[:.]?(\d{1,2})$/;
  function kindOf(t){
    var clean = String(t).replace(/[:.]+$/, '');
    for (var k in LABELS) if (LABELS[k].test(clean)) return k;
    return null;
  }
  function wordsOf(r, map){
    var k = map.k || 1;
    return (r.data.words || []).map(function(w){
      var b = w.bbox, c = map((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
      return {t:String(w.text || '').trim(), x:c[0], y:c[1], h:(b.y1 - b.y0) / k, w:(b.x1 - b.x0) / k, x0:map(b.x0, (b.y0 + b.y1) / 2)[0], x1:map(b.x1, (b.y0 + b.y1) / 2)[0]};
    }).filter(function(w){ return w.t; });
  }
  var same = function(){ var f = function(x, y){ return [x, y]; }; f.k = 1; return f; };

  // A strip to the right of a label, straightened and enlarged, then cleaned so only digit-sized marks are
  // left (panel edges, bars and specks are wiped), drawn dark on white and read as digits only.
  function stripRead(wk, prep, lab, len, slope, want){
    var need = Math.abs(want || 1), best = [];
    // sharp first; then the smoothed copy; then smoothed again inside the strip (strong moire)
    var tryOne = function(src, blur){
      return function(){
        if (best.length >= need) return best;
        return stripFrom(wk, prep, lab, len, slope, want, src, blur).then(function(ns){ if (ns.length > best.length) best = ns; return best; });
      };
    };
    return Promise.resolve().then(tryOne(prep.grey, 0)).then(tryOne(prep.soft, 0)).then(tryOne(prep.soft, 3));
  }
  function stripFrom(wk, prep, lab, len, slope, want, src, blur){
    // tall enough for numbers bigger than the label and sitting a little higher or lower than it; marks
    // from the rows above and below are dropped further down (they're centred too far away)
    var a = Math.atan(slope), sx0 = lab.x1 + lab.h * .15, hh = lab.h * 2.6;
    len = Math.min(len, prep.w - sx0);
    if (len < lab.h * .8) return Promise.resolve([]);
    var k = Math.max(1, Math.min(4, 44 / lab.h)), W = Math.round(len * k), H = Math.round(hh * 2 * k);
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d', {willReadFrequently: true}); x.fillStyle = '#808080'; x.fillRect(0, 0, W, H);
    x.scale(k, k); x.translate(0, hh); x.rotate(-a); x.translate(-sx0, -lab.y); x.drawImage(src, 0, 0);
    x.setTransform(1, 0, 0, 1, 0, 0);
    var d = x.getImageData(0, 0, W, H), px = d.data, n = W * H, lum = new Uint8Array(n);
    for (var i = 0; i < n; i++) lum[i] = px[i * 4];
    if (blur){ var fl = new Float32Array(lum); boxBlur(fl, W, H, blur); for (i = 0; i < n; i++) lum[i] = fl[i]; }
    // brightness statistics from the row's own band (the strip is taller, and can take in panel art above/below)
    var band = [], by0 = Math.max(0, Math.round(H / 2 - lab.h * k * 1.2)), by1 = Math.min(H, Math.round(H / 2 + lab.h * k * 1.2));
    for (var yb = by0; yb < by1; yb++) for (var xb = 0; xb < W; xb++) band.push(lum[yb * W + xb]);
    var sorted = band.sort(function(p, q){ return p - q; }), med = sorted[sorted.length >> 1];
    // ink threshold from this strip's own contrast: dim or washed-out text still separates from its box
    var dark = med < 128, span = dark ? sorted[Math.floor(sorted.length * .99)] - med : med - sorted[Math.floor(sorted.length * .01)];
    var thr = Math.max(35, Math.min(70, span * .45)), ink = new Uint8Array(n);
    for (i = 0; i < n; i++) ink[i] = dark ? (lum[i] > med + thr ? 1 : 0) : (lum[i] < med - thr ? 1 : 0);
    // connected marks; keep the ones shaped like digits of this row's text size
    var seen = new Int32Array(n), stack = [], keep = [], Lh = lab.h * k;
    for (var s0 = 0; s0 < n; s0++){
      if (!ink[s0] || seen[s0]) continue;
      var id = keep.length + 1, b = {x0:W, x1:0, y0:H, y1:0, n:0, id:id, px:[]};
      seen[s0] = id; stack.push(s0);
      while (stack.length){
        var q = stack.pop(), qx = q % W, qy = (q - qx) / W;
        b.n++; b.px.push(q); if (qx < b.x0) b.x0 = qx; if (qx > b.x1) b.x1 = qx; if (qy < b.y0) b.y0 = qy; if (qy > b.y1) b.y1 = qy;
        if (qx > 0 && ink[q - 1] && !seen[q - 1]){ seen[q - 1] = id; stack.push(q - 1); }
        if (qx < W - 1 && ink[q + 1] && !seen[q + 1]){ seen[q + 1] = id; stack.push(q + 1); }
        if (qy > 0 && ink[q - W] && !seen[q - W]){ seen[q - W] = id; stack.push(q - W); }
        if (qy < H - 1 && ink[q + W] && !seen[q + W]){ seen[q + W] = id; stack.push(q + W); }
      }
      keep.push(b);
    }
    for (i = 0; i < n * 4; i += 4){ px[i] = px[i + 1] = px[i + 2] = 255; px[i + 3] = 255; }
    var any = false;
    // a digit: about label-height to 2.4x it, not too wide, not running off the strip (edges and bars do),
    // and centred on this row rather than the next one
    var digitLike = function(b){
      var bh = b.y1 - b.y0 + 1, bw = b.x1 - b.x0 + 1;
      if (bh < Lh * .45 || bh > Lh * 2.4 || bw > Lh * 1.8 || b.n < Lh * 2) return false;
      if (b.y0 <= 0 || b.y1 >= H - 1) return false;
      return Math.abs((b.y0 + b.y1) / 2 - H / 2) < Lh * 1.25;
    };
    keep.forEach(function(b){
      if (!digitLike(b)) return;
      any = true;
      b.px.forEach(function(q){ px[q * 4] = px[q * 4 + 1] = px[q * 4 + 2] = 0; });
    });
    if (!any) return Promise.resolve([]);
    x.putImageData(d, 0, 0);
    // group the kept marks into numbers (digits close together), left to right
    var marks = keep.filter(digitLike)
      .sort(function(p, q){ return p.x0 - q.x0; });
    var groups = [];
    marks.forEach(function(b){ var g = groups[groups.length - 1]; if (g && b.x0 - g.x1 < Lh * .45 && g.marks.length < 2){ g.marks.push(b); g.x1 = Math.max(g.x1, b.x1); g.y0 = Math.min(g.y0, b.y0); g.y1 = Math.max(g.y1, b.y1); } else groups.push({marks:[b], x0:b.x0, x1:b.x1, y0:b.y0, y1:b.y1}); });
    groups = want < 0 ? groups.slice(-1) : groups.slice(0, want || 4);
    var toImg = function(qx, qy){ var u = qx / k, v = qy / k - hh; return [sx0 + u * Math.cos(a) - v * Math.sin(a), lab.y + u * Math.sin(a) + v * Math.cos(a)]; };
    var out = [], chain = wk.setParameters({tessedit_pageseg_mode: '8', tessedit_char_whitelist: '0123456789'});
    groups.forEach(function(g){
      chain = chain.then(function(){
        // the number alone on a padded white tile
        var pad = Math.round(Lh * .8), gw = g.x1 - g.x0 + 1, gh = g.y1 - g.y0 + 1;
        var t = document.createElement('canvas'); t.width = gw + pad * 2; t.height = gh + pad * 2;
        var tx = t.getContext('2d'); tx.fillStyle = '#fff'; tx.fillRect(0, 0, t.width, t.height);
        tx.drawImage(c, g.x0, g.y0, gw, gh, pad, pad, gw, gh);
        return wk.recognize(t).then(function(r){
          var txt = String(r.data.text || '').replace(/\D/g, '');
          var conf = r.data.confidence || 0;
          if (!/^\d{1,2}$/.test(txt) || conf < 75){
            // unsure: check against the digit shapes. Agreement or a clear shape wins; a clash, or a weak read
            // with no shape to back it, is left unknown (a "?" is better than a wrong number)
            var ds = g.marks.map(function(b){ var id = b.id; return classify(function(xx, yy){ return seen[yy * W + xx] === id ? 1 : 0; }, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1, Lh); });
            var shape = ds.every(function(v){ return v !== null; }) ? ds.join('') : '';
            if (!/^\d{1,2}$/.test(txt) || conf < 35) txt = shape;
            else if (shape && shape !== txt) txt = '';
            else if (!shape && conf < 50) txt = '';
          }
          if (!/^\d{1,2}$/.test(txt)) return;
          var pos = toImg((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2);
          out.push({t:txt, x:pos[0], y:pos[1], h:gh / k, w:gw / k});
        });
      });
    });
    return chain.then(function(){
      if (DBG) DBG.strips.push({kind:lab.kind, label:lab.t, x0:sx0, x1:sx0 + len, y:lab.y, hh:hh, slope:slope, src: src === prep.soft ? 'smoothed' : 'sharp', blur:blur || 0,
        marks:marks.length, read:out.map(function(o){ return {t:o.t, x:o.x, y:o.y}; })});
      return out;
    });
  }

  // ---------- the reader ----------
  function read(file, opts){
    opts = opts || {};
    progressCb = opts.onProgress || null;
    stepLabel = '';
    if (progressCb) progressCb(0, worker ? 'Reading the screen' : 'Getting the reader ready (first time downloads about 7 MB)');
    var dubs = opts.mode === 'doubles', stocks = Number(opts.stocks) || 3, full = stocks * (dubs ? 2 : 1), slots = dubs ? 2 : 1;
    var prep, wk, words = [], digits = [];
    DBG = opts.debug ? {passes:[], strips:[]} : null;
    var page = function(canvas, psm, label){
      stepLabel = label;
      return wk.setParameters({tessedit_pageseg_mode: psm, tessedit_char_whitelist: ''})
        .then(function(){ return wk.recognize(canvas); })
        .then(function(r){
          var ws = wordsOf(r, same());
          if (DBG){ ws.forEach(function(w){ w.pass = DBG.passes.length; }); DBG.passes.push({label:label, psm:psm, found:ws.length}); }
          words = words.concat(ws);
        });
    };
    var labelsFound = function(){
      var kinds = {};
      words.forEach(function(w){ var k = kindOf(w.t) || (LABEL_LEAD.test(w.t) ? kindOf(w.t.match(LABEL_LEAD)[1]) : null); if (k) kinds[k] = 1; });
      return Object.keys(kinds).length;
    };
    var block = null, cropLayout = null, fullPrep = null, cb = progressCb;
    // read one prepared image (our team's crop, or the whole photo)
    var analyze = function(){
      words = []; digits = [];
      if (DBG){ DBG.passes = []; DBG.strips = []; DBG.headerPlace = null; DBG.fboxes = null; }
      return Promise.resolve()
      .then(function(){ digits = findDigits(prep); return ready(); })
      .then(function(w){ wk = w; return page(prep.grey, '11', 'Reading the screen (1 of 3)'); })
      .then(function(){ return page(prep.inv, '11', 'Reading the screen (2 of 3)'); })
      // still no KOs / Falls / SDs labels: try harder, one step at a time
      .then(function(){ return labelsFound() >= 2 ? null : page(prep.soft, '11', 'Trying harder (smoothing the TV pattern)'); })
      .then(function(){ return labelsFound() >= 2 ? null : page(prep.softInv, '11', 'Trying harder (smoothing the TV pattern)'); })
      .then(function(){ return labelsFound() >= 2 ? null : page(prep.grey, '6', 'Trying harder (as one block)'); })
      .then(function(){ return labelsFound() >= 2 ? null : page(inkImage(prep, true), '11', 'Trying harder (evening out glare)'); })
      .then(function(){ return labelsFound() >= 2 ? null : page(inkImage(prep, false), '11', 'Trying harder (evening out glare)'); })
      .then(function(){
        if (labelsFound() >= 2 || prep.crop) return null;
        // zoom: the middle of the photo at full resolution, for a TV that's small in the shot
        var im = prep.img, kx = im.naturalWidth / prep.w, x0 = prep.w * .12, y0 = prep.h * .12, cw = prep.w * .76, ch = prep.h * .76;
        var zf = Math.min(2.2, 2600 / cw); if (zf <= 1.15) return null;
        var c = document.createElement('canvas'); c.width = Math.round(cw * zf); c.height = Math.round(ch * zf);
        var x = c.getContext('2d', {willReadFrequently: true}); x.imageSmoothingQuality = 'high';
        x.drawImage(im, x0 * kx, y0 * kx, cw * kx, ch * kx, 0, 0, c.width, c.height);
        var dd = x.getImageData(0, 0, c.width, c.height), pp = dd.data;
        for (var i = 0; i < pp.length; i += 4){ var yv = .299 * pp[i] + .587 * pp[i + 1] + .114 * pp[i + 2]; pp[i] = pp[i + 1] = pp[i + 2] = Math.max(0, Math.min(255, (yv - 128) * 1.4 + 128)); }
        x.putImageData(dd, 0, 0);
        var map = function(xx, yy){ return [x0 + xx / zf, y0 + yy / zf]; }; map.k = zf;
        stepLabel = 'Trying harder (zooming in)';
        return wk.setParameters({tessedit_pageseg_mode: '11', tessedit_char_whitelist: ''})
          .then(function(){ return wk.recognize(c); })
          .then(function(r){
            var ws = wordsOf(r, map);
            if (DBG){ ws.forEach(function(w){ w.pass = DBG.passes.length; }); DBG.passes.push({label:'Zoomed-in crop', psm:'11', found:ws.length}); }
            words = words.concat(ws);
          });
      })
      .then(function(){
        stepLabel = 'Reading the stats';
        // label instances, one per spot (several passes can find the same one)
        var labs = [];
        words.forEach(function(w){
          var k = kindOf(w.t), lead = null;
          if (!k && LABEL_LEAD.test(w.t)){ var mm = w.t.match(LABEL_LEAD); k = kindOf(mm[1]); lead = parseInt(mm[2], 10); }
          if (!k) return;
          if (labs.some(function(o){ return o.kind === k && Math.abs(o.x - w.x) < w.h * 1.5 && Math.abs(o.y - w.y) < w.h; })) return;
          labs.push({kind:k, t:w.t, x:w.x, y:w.y, h:w.h, w:w.w, x0:w.x0, x1:w.x1, lead:lead});
        });
        // tilt: from labels of the same kind side by side (one per column), else level
        var slope = 0, sl = [];
        ['kos', 'falls', 'sds'].forEach(function(k){
          var L = labs.filter(function(l){ return l.kind === k; }).sort(function(a, b){ return a.x - b.x; });
          for (var i = 1; i < L.length; i++) if (L[i].x - L[i - 1].x > L[i].h * 3) sl.push((L[i].y - L[i - 1].y) / (L[i].x - L[i - 1].x));
        });
        if (sl.length){ sl.sort(function(a, b){ return a - b; }); slope = Math.max(-.2, Math.min(.2, sl[Math.floor(sl.length / 2)])); }
        else {
          // one label per row (a table): use the row of placement numbers, else how the row labels stack
          var big = digits.slice().sort(function(a, b){ return a.x - b.x; });
          if (big.length >= 2 && big[big.length - 1].x - big[0].x > prep.w * .2){
            var mx = 0, my = 0; big.forEach(function(d){ mx += d.x; my += d.y; }); mx /= big.length; my /= big.length;
            var num = 0, den = 0; big.forEach(function(d){ num += (d.x - mx) * (d.y - my); den += (d.x - mx) * (d.x - mx); });
            if (den) slope = Math.max(-.2, Math.min(.2, num / den));
          } else {
            var st = labs.slice().sort(function(a, b){ return a.y - b.y; });
            if (st.length >= 2 && st[st.length - 1].y - st[0].y > st[0].h * 1.5)
              slope = Math.max(-.2, Math.min(.2, -(st[st.length - 1].x0 - st[0].x0) / (st[st.length - 1].y - st[0].y)));
          }
        }

        // Group every label (any row) into player columns: in a column the KOs / Falls / SDs labels are stacked
        // with their left edges lined up. Two or more columns side by side = one set of labels per player.
        var ROW = {kos:0, falls:1, sds:2}, KLEN = {kos:3, falls:5, sds:3};
        // The player tags under each fighter's name (P1, P2, P3, P4) are the best anchors: they say exactly where
        // each player's column starts, and the line through them gives the tilt.
        var nAll = prep.crop ? slots : dubs ? 4 : 2, layout = null, tags = {};
        words.forEach(function(w){
          var m = String(w.t).match(/^[pP]?[pP]([1-4lI|])[.,:]?$/);
          if (!m) return;
          var n = /[1lI|]/.test(m[1]) ? 1 : +m[1];
          if (n <= nAll && (!tags[n] || w.h > tags[n].h)) tags[n] = w;
        });
        var tagNs = Object.keys(tags).map(Number).sort(function(a, b){ return a - b; });
        if (tagNs.length >= 2){
          var mn = 0, mx0 = 0; tagNs.forEach(function(n){ mn += n; mx0 += tags[n].x0; }); mn /= tagNs.length; mx0 /= tagNs.length;
          var sxy = 0, sxx = 0; tagNs.forEach(function(n){ sxy += (n - mn) * (tags[n].x0 - mx0); sxx += (n - mn) * (n - mn); });
          var sp = sxy / sxx, th = tagNs.map(function(n){ return tags[n].h; }).sort(function(a, b){ return a - b; })[tagNs.length >> 1];
          var monotonic = tagNs.every(function(n, i){ return !i || tags[n].x0 > tags[tagNs[i - 1]].x0; });
          if (monotonic && sp > th * 4){
            // tilt from the tops of the tags (OCR boxes can grab a stray mark below a tag, rarely above it)
            var topOf = function(n){ return tags[n].y - tags[n].h / 2; };
            var ax = 0, ay = 0; tagNs.forEach(function(n){ ax += tags[n].x; ay += topOf(n); }); ax /= tagNs.length; ay /= tagNs.length;
            var nu = 0, de = 0; tagNs.forEach(function(n){ nu += (tags[n].x - ax) * (topOf(n) - ay); de += (tags[n].x - ax) * (tags[n].x - ax); });
            ay += th / 2;
            var tsl = de ? Math.max(-.2, Math.min(.2, nu / de)) : 0;
            var x1 = mx0 + sp * (1 - mn);
            layout = {x0:x1, spacing:sp, slope:tsl, tagH:th, tagY:ay + tsl * (x1 - ax), tags:tagNs, from:'tags'};
            slope = tsl;
          }
        }
        if (!layout && cropLayout){
          layout = cropLayout;
          // a single tag (P1) still pins down Cooper's column start and the name row
          if (tags[1]){ layout = Object.assign({}, cropLayout, {x0:tags[1].x0, tagY:tags[1].y, tagH:tags[1].h, tags:[1], from:'colour+P1'}); }
          slope = layout.slope;
        }
        var cols = [];
        // the tags only organise the stats when the labels sit inside the player columns (not one table to the left)
        var statsLayout = layout && labs.some(function(l){ var ci2 = Math.floor((l.x0 - layout.x0 + layout.spacing * .3) / layout.spacing); return ci2 >= 0 && ci2 < nAll; }) ? layout : null;
        if (statsLayout){
          // a column per player, in tag order; each label goes to the column it sits in
          for (var ci = 0; ci < nAll; ci++) cols.push({x0:layout.x0 + ci * layout.spacing, x:layout.x0 + (ci + .3) * layout.spacing, labs:[]});
          labs.forEach(function(l){
            var ci2 = Math.floor((l.x0 - layout.x0 + layout.spacing * .3) / layout.spacing);
            if (ci2 >= 0 && ci2 < nAll) cols[ci2].labs.push(l);
          });
        } else {
          if (layout && !statsLayout) slope = layout.slope;
          labs.slice().sort(function(a, b){ return a.x0 - b.x0; }).forEach(function(l){
            var c = cols.filter(function(c){ return Math.abs(c.x0 - l.x0) < l.h * 2.2; })[0];
            if (c){ c.labs.push(l); c.x0 = Math.min(c.x0, l.x0); c.x = (c.x * (c.labs.length - 1) + l.x) / c.labs.length; } else cols.push({x0:l.x0, x:l.x, labs:[l]});
          });
          cols.sort(function(a, b){ return a.x0 - b.x0; });
        }
        var perPanel = !!statsLayout || (cols.length >= 2 && cols[1].x0 - cols[0].x0 > cols[0].labs[0].h * 3);
        var panelCols = perPanel ? cols.map(function(c){ return c.x; }) : null;
        var have = function(c, k){ return c.labs.filter(function(l){ return l.kind === k; })[0]; };
        var widthFor = function(l, k){ return l.w / Math.max(2, String(l.t).replace(/[^A-Za-z0-9]/g, '').length || KLEN[l.kind]) * KLEN[k]; };
        if (perPanel){
          // fill in a row label the OCR missed in Cooper's or Nathan's column. Only our team's columns are
          // used as a guide: the other team can be showing a different stats page with other rows.
          var ours = cols.slice(0, slots);
          [0, 1].forEach(function(){ ours.forEach(function(c, ci){
            ['kos', 'falls', 'sds'].forEach(function(k){
              if (have(c, k)) return;
              var ref = c.labs[0], lab = null;
              // a) the same two rows in the teammate's column give the offset
              var donor = ref && ours.filter(function(o){ return o !== c && have(o, k) && have(o, ref.kind); })[0];
              if (donor){
                var dk = have(donor, k), dr = have(donor, ref.kind);
                lab = {x0:ref.x0 + (dk.x0 - dr.x0), y:ref.y + (dk.y - dr.y), h:dk.h, w:dk.w};
              } else if (c.labs.length >= 2){
                // b) the rows are evenly spaced: work it out from the two rows this column does have
                var p1 = c.labs[0], p2 = c.labs[1], step = (p2.y - p1.y) / (ROW[p2.kind] - ROW[p1.kind]);
                if (isFinite(step) && step) lab = {x0:p1.x0, y:p1.y + step * (ROW[k] - ROW[p1.kind]), h:p1.h, w:widthFor(p1, k)};
              } else if (statsLayout){
                // c) no labels in this column at all (art can cover them): the teammate's row, one column over
                var mate = ours.filter(function(o){ return o !== c && have(o, k); })[0];
                if (mate){
                  var t = have(mate, k), dx = c.x0 - mate.x0;
                  lab = {x0:t.x0 + dx, y:t.y + slope * dx, h:t.h, w:t.w};
                }
              }
              if (!lab) return;
              lab.kind = k; lab.t = '(filled)'; lab.lead = null; lab.x = lab.x0 + lab.w / 2; lab.x1 = lab.x0 + lab.w;
              c.labs.push(lab); labs.push(lab);
            });
          }); });
          // the tilt, from the same row in two columns (e.g. Cooper's Falls and Nathan's Falls). This beats a
          // stack of labels, which perspective leans even when the photo is level.
          var pairs = [];
          ['kos', 'falls', 'sds'].forEach(function(k){
            for (var i = 0; i < cols.length; i++) for (var j = i + 1; j < cols.length; j++){
              var a = have(cols[i], k), b = have(cols[j], k);
              if (a && b && b.x0 - a.x0 > a.h * 3) pairs.push((b.y - a.y) / (b.x0 - a.x0));
            }
          });
          if (pairs.length && !statsLayout){ pairs.sort(function(a, b){ return a - b; }); slope = Math.max(-.25, Math.min(.25, pairs[Math.floor(pairs.length / 2)])); }
        }

        // Probe for columns the OCR missed on the left. Glare or a dark corner can hide Cooper's labels
        // completely, and then the leftmost column found is really Nathan's. One column-width to the left,
        // at the same row heights, numbers mean there's a player column there.
        var spacing = statsLayout ? statsLayout.spacing : perPanel ? cols[1].x0 - cols[0].x0 : (function(){
          var d = digits.slice().sort(function(a, b){ return a.x - b.x; }), gs = [];
          for (var i = 1; i < d.length; i++) if (Math.abs(d[i].h - d[i - 1].h) < d[i].h * .3) gs.push(d[i].x - d[i - 1].x);
          gs.sort(function(a, b){ return a - b; });
          return gs.length ? gs[Math.floor(gs.length / 2)] : null;
        })();
        var probes = Promise.resolve(), tries = 0;
        var probeOnce = function(){
          if (statsLayout || !cols.length || !spacing || cols.length >= nAll || tries >= nAll - 1) return Promise.resolve(false);
          var base = cols[0], h0 = base.labs[0].h;
          if (spacing < h0 * 3 || base.x0 - spacing < -spacing * .15) return Promise.resolve(false);
          tries++;
          var fake = base.labs.map(function(l){
            var f = {kind:l.kind, t:'(probe)', x0:l.x0 - spacing, y:l.y - slope * spacing, h:l.h, w:l.w, lead:null};
            f.x = f.x0 + f.w / 2; f.x1 = f.x0 + f.w; return f;
          });
          var found = 0, chain = Promise.resolve();
          fake.forEach(function(f){
            chain = chain.then(function(){
              return stripRead(wk, prep, f, Math.min(base.x0 - h0 * .6, f.x0 + spacing * .84) - f.x1, slope, -1).then(function(ns){ if (ns.length){ f.lead = asNum(ns[0].t); found++; } });
            });
          });
          return chain.then(function(){
            if (found < Math.min(2, fake.length)) return false;
            fake.forEach(function(f){ if (f.lead === null) f.lead = null; labs.push(f); });
            cols.unshift({x0:base.x0 - spacing, x:base.x - spacing, labs:fake});
            perPanel = true; panelCols = cols.map(function(c){ return c.x; });
            return probeOnce();
          });
        };
        probes = probeOnce();

        // for each kind: [Cooper, Nathan] values plus the x of each column
        var rows = {}, colX = [], jobs = probes;
        var onLine = function(lab, until){
          return words.filter(function(w){ var v = asNum(w.t); return v !== null && w.x > lab.x1 && w.x < until && Math.abs((w.y - lab.y) - slope * (w.x - lab.x)) < Math.max(lab.h, w.h) * .8 && w.h < lab.h * 2.4; })
            .sort(function(a, b){ return a.x - b.x; });
        };
        jobs = jobs.then(function(){ var inner = Promise.resolve();
        if (perPanel){
          var gap = statsLayout ? statsLayout.spacing : cols[1].x0 - cols[0].x0;
          ['kos', 'falls', 'sds'].forEach(function(k){
            if (!cols.slice(0, slots).some(function(c){ return have(c, k); })) return;
            rows[k] = {vals:[null, null], layout:'panel'};
            for (var i = 0; i < Math.min(slots, cols.length); i++) (function(i){
              var lab = cols[i] && have(cols[i], k);
              if (colX[i] == null) colX[i] = cols[i].x0 + gap * .3;
              if (!lab) return;
              // the number right after the label, inside this player's column
              var until = Math.min(cols[i + 1] ? cols[i + 1].x0 - lab.h * .6 : Infinity, lab.x0 + gap * .84);
              inner = inner.then(function(){
                if (lab.lead !== null){ rows[k].vals[i] = lab.lead; return; }
                return stripRead(wk, prep, lab, until - lab.x1, slope, -1).then(function(ns){
                  var inCol = ns.filter(function(w){ return w.x < until; }), page = onLine(lab, until);
                  var n = inCol[inCol.length - 1] || page[page.length - 1];
                  if (n) rows[k].vals[i] = asNum(n.t);
                });
              });
            })(i);
          });
        } else {
          ['kos', 'falls', 'sds'].forEach(function(k){
            var L = labs.filter(function(l){ return l.kind === k; }).sort(function(a, b){ return a.x - b.x; });
            if (!L.length) return;
            rows[k] = {vals:[null, null], layout:'table'};
            // one label for the row (a table): the first number is Cooper's, the next Nathan's
            var lab = L[0];
            inner = inner.then(function(){
              return stripRead(wk, prep, lab, prep.w - lab.x1, slope, slots).then(function(ns){
                if (ns.length < slots){
                  var extra = onLine(lab, prep.w).filter(function(w){ return !ns.some(function(o){ return Math.abs(o.x - w.x) < lab.h; }); });
                  ns = ns.concat(extra).sort(function(a, b){ return a.x - b.x; });
                }
                if (lab.lead !== null) ns = [{t:String(lab.lead), x:lab.x}].concat(ns);
                for (var i = 0; i < slots && i < ns.length; i++){ rows[k].vals[i] = asNum(ns[i].t); if (colX[i] == null) colX[i] = ns[i].x; }
              });
            });
          });
        }
        return inner; });
        return jobs.then(function(){
          if (DBG){
            DBG.labs = labs.map(function(l){ return {kind:l.kind, t:l.t, x0:l.x0, x1:l.x1, y:l.y, h:l.h, lead:l.lead}; });
            DBG.cols = cols.map(function(c){ return {x0:c.x0, kinds:c.labs.map(function(l){ return l.kind; })}; });
            DBG.perPanel = perPanel; DBG.slope = slope; DBG.rows = rows; DBG.spacing = spacing;
          }
          if (DBG) DBG.layout = layout;
          return {rows:rows, colX:colX, labs:labs, slope:slope, panelCols:panelCols, layout:layout};
        });
      })
      .then(function(st){
        // with the tags known, read Cooper's placement digit straight from his name row (it can be gold, with
        // laurels around it, which the blob finder doesn't always see)
        if (!st.layout) return st;
        var L = st.layout, x0 = L.x0 + L.spacing * .45, x1 = L.x0 + L.spacing * 1.02, y0 = L.tagY - L.tagH * 3.5, y1 = L.tagY + L.tagH * 1.2;
        if (L.top != null){ y0 = L.top - L.ph * .04; y1 = L.top + L.ph * .2; }
        x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(prep.w, x1); y1 = Math.min(prep.h, y1);
        if (x1 - x0 < 10 || y1 - y0 < 10) return st;
        var z = Math.max(1, Math.min(4, 140 / (y1 - y0)));
        var tryCrop = function(src){
          var c = document.createElement('canvas'); c.width = Math.round((x1 - x0) * z); c.height = Math.round((y1 - y0) * z);
          c.getContext('2d').drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
          return wk.setParameters({tessedit_pageseg_mode: '11', tessedit_char_whitelist: '12'}).then(function(){ return wk.recognize(c); }).then(function(r){
            var best = null;
            (r.data.words || []).forEach(function(w){
              var t = String(w.text || '').trim(), hgt = (w.bbox.y1 - w.bbox.y0) / z;
              if (/^[12]$/.test(t) && hgt > L.tagH * 1.1 && w.confidence >= 55 && (!best || hgt > best.h)) best = {ch:+t, h:hgt, conf:w.confidence};
            });
            return best;
          });
        };
        stepLabel = 'Reading the placement';
        // first by colour: the placement number is gold (1st) or white, tall, and shaped like a 1 or a 2
        var byColour = (function(){
          var C = prep.color, k3 = prep.k3, cx0 = Math.round(x0 * k3), cy0 = Math.round(y0 * k3), cw = Math.round((x1 - x0) * k3), chh = Math.round((y1 - y0) * k3);
          if (cw < 8 || chh < 8) return null;
          var dd = C.getContext('2d', {willReadFrequently: true}).getImageData(cx0, cy0, cw, chh).data, m = new Uint8Array(cw * chh);
          for (var q = 0; q < m.length; q++){
            var rr = dd[q * 4], gg = dd[q * 4 + 1], bb = dd[q * 4 + 2], lum = .299 * rr + .587 * gg + .114 * bb, chroma = Math.max(rr, gg, bb) - Math.min(rr, gg, bb);
            var gold = rr > 140 && gg > 120 && bb < gg * .7 && rr - bb > 70;
            var white = lum > 185 && chroma < 60;
            m[q] = gold || white ? 1 : 0;
          }
          var blobs = blobsOf({mw:cw, mh:chh, k2:1}, m, true).filter(function(b){ return b.h >= L.tagH * k3 * 1.1 && (b.ch === 1 || b.ch === 2); });
          blobs.sort(function(a, b){ return b.h - a.h; });
          return blobs[0] ? {ch:blobs[0].ch, h:blobs[0].h / k3, how:'colour', d:blobs[0].d} : null;
        })();
        if (byColour){ if (DBG) DBG.headerPlace = {box:[x0, y0, x1, y1], read:byColour}; st.place = byColour.ch; return st; }
        return tryCrop(prep.soft).then(function(b){ return b || tryCrop(prep.softInv); }).then(function(b){
          if (DBG) DBG.headerPlace = {box:[x0, y0, x1, y1], read:b};
          if (b) st.place = b.ch;
          return st;
        });
      })
      .then(function(st){
        // the fighter names: read each column's name row on its own, enlarged, letters only. Names are the
        // surest way to tell fighters apart, and the full-screen pass can miss them under moire or glare.
        if (!st.layout || !opts.fighters || !opts.fighters.length) return st;
        var n = prep.crop ? slots : dubs ? 4 : 2, boxes = columnBoxes(prep, digits, st, n), chain = Promise.resolve();
        if (DBG) DBG.nameBands = [];
        boxes.forEach(function(b, i){
          chain = chain.then(function(){
            var x0 = Math.max(0, b.nx0), x1 = Math.min(prep.w, b.nx1), y0 = Math.max(0, b.ny0), y1 = Math.min(prep.h, b.ny1);
            if (x1 - x0 < 20 || y1 - y0 < 10) return;
            var z = Math.max(1, Math.min(3, 150 / (y1 - y0))), c = document.createElement('canvas');
            c.width = Math.round((x1 - x0) * z); c.height = Math.round((y1 - y0) * z);
            var cx = c.getContext('2d', {willReadFrequently: true});
            cx.drawImage(prep.softInv, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
            // names are big: blur hard enough to melt any TV stripes, then stretch the contrast back
            var id = cx.getImageData(0, 0, c.width, c.height), pd = id.data, lm = new Float32Array(c.width * c.height);
            for (var q = 0; q < lm.length; q++) lm[q] = pd[q * 4];
            boxBlur(lm, c.width, c.height, Math.max(1, Math.round(c.height / 45)));
            var srt = Array.prototype.slice.call(lm).sort(function(a2, b2){ return a2 - b2; }), lo = srt[Math.floor(srt.length * .02)], hi = srt[Math.floor(srt.length * .98)], sc = hi - lo > 20 ? 255 / (hi - lo) : 1;
            for (q = 0; q < lm.length; q++){ var vq = Math.max(0, Math.min(255, (lm[q] - lo) * sc)); pd[q * 4] = pd[q * 4 + 1] = pd[q * 4 + 2] = vq; }
            cx.putImageData(id, 0, 0);
            stepLabel = 'Reading the fighter names';
            return wk.setParameters({tessedit_pageseg_mode: '6', tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.&-/ '})
              .then(function(){ return wk.recognize(c); })
              .then(function(r){
                var map = function(xx, yy){ return [x0 + xx / z, y0 + yy / z]; }; map.k = z;
                var ws = wordsOf(r, map).filter(function(w){ return /[A-Za-z]{2}/.test(w.t); });
                ws.forEach(function(w){ w.band = i; });
                if (DBG) DBG.nameBands.push({i:i, box:[x0, y0, x1, y1], read:ws.map(function(w){ return w.t; }).join(' ')});
                words = words.concat(ws);
              });
          });
        });
        return chain.then(function(){ return st; });
      })
      .then(function(st){
        progressCb = null; stepLabel = '';
        var out = decide(st, digits, prep, {dubs:dubs, stocks:stocks, full:full, slots:slots}, words);
        var finish = function(){
          if (DBG){
            DBG.size = {w:prep.w, h:prep.h};
            DBG.words = words.map(function(w){ return {t:w.t, x:w.x, y:w.y, w:w.w, h:w.h, pass:w.pass}; });
            DBG.digits = digits.map(function(d){ return {ch:d.ch, x:d.x, y:d.y, h:d.h, d:d.d}; });
            out.debug = DBG;
          }
          return out;
        };
        if (!opts.fighters || !opts.fighters.length) return finish();
        return whoIsWho(prep, digits, st, words, prep.crop ? slots : dubs ? 4 : 2, opts.fighters, opts.prior, opts.learned).then(function(f){ out.fighters = f; return finish(); }, function(){ return finish(); });
      });
    };
    return loadImage(file).then(function(img){
        var NW = img.naturalWidth, NH = img.naturalHeight, kf = Math.min(1, 2000 / Math.max(NW, NH));
        var full = fullPrep = build(img, 0, 0, NW, NH, kf);
        block = findTeamBlock(full, slots);
        if (DBG){
          var th = document.createElement('canvas'), tk = Math.min(1, 900 / Math.max(full.w, full.h)); th.width = Math.round(full.w * tk); th.height = Math.round(full.h * tk);
          th.getContext('2d').drawImage(full.color, 0, 0, th.width, th.height);
          DBG.full = {w:full.w, h:full.h, image:th.toDataURL('image/jpeg', .85)}; DBG.block = block;
        }
        if (!block){ prep = full; return; }
        // crop just our team's panels, with a margin, from the original photo at full detail
        var bw = block.R - block.L, bh = block.B - block.T;
        var x0 = Math.max(0, block.L - bw * .05), x1 = Math.min(full.w, block.R + bw * .05);
        var y0 = Math.max(0, block.T - bh * .12 - Math.abs(block.slope) * bw), y1 = Math.min(full.h, block.B + bh * .05 + Math.abs(block.slope) * bw);
        var sx = x0 / kf, sy = y0 / kf, sw = (x1 - x0) / kf, sh = (y1 - y0) / kf;
        var kc = Math.max(.25, Math.min(3, (slots === 2 ? 1500 : 800) / sw, 2000 / sh));
        prep = build(img, sx, sy, sw, sh, kc);
        prep.crop = {x0:x0, y0:y0, x1:x1, y1:y1, k:kc / kf};
        // the columns, from the colour block, in crop coordinates (the player tags refine this if they're read)
        var s2 = kc / kf, Lc = (block.L - x0) * s2, Tc = (block.T - y0) * s2, Hp = bh * s2;
        cropLayout = {x0:Lc, spacing:bw * s2 / slots, slope:block.slope, tagH:Hp * .04, tagY:Tc + Hp * .14, tags:[], from:'colour', top:Tc, ph:Hp};
        if (DBG) DBG.crop = {x0:x0, y0:y0, x1:x1, y1:y1, w:prep.w, h:prep.h, image:prep.color.toDataURL('image/jpeg', .9), k:s2, cropLayout:cropLayout};
      })
      .then(function(){ return analyze(); })
      .then(function(out){
        var got = [out.koMe, out.fallsMe, out.sdMe].some(function(v){ return v != null; });
        if (got || !prep.crop) return out;
        // nothing usable in our team's panels (maybe the colours were misjudged): read the whole photo instead
        if (DBG){ DBG.fallback = true; DBG.crop = null; }
        prep = fullPrep; cropLayout = null; progressCb = cb;
        return analyze();
      })
      .then(function(out){ progressCb = null; stepLabel = ''; DBG = null; return out; },
            function(e){ progressCb = null; stepLabel = ''; DBG = null; throw e; });
  }

  function decide(st, digits, prep, o, words){
    var rows = st.rows, val = function(k, i){ return rows[k] ? rows[k].vals[i] : null; };
    var cap = function(v, max){ return v === null || v === undefined || v > max ? null : v; };
    var koMe = cap(val('kos', 0), o.full), koN = o.dubs ? cap(val('kos', 1), o.full) : null;
    var fMe = cap(val('falls', 0), o.stocks), fN = o.dubs ? cap(val('falls', 1), o.stocks) : null;
    var sdMe = cap(val('sds', 0), o.stocks), sdN = o.dubs ? cap(val('sds', 1), o.stocks) : null;

    // Cooper's placement: the big digit in his column (the far-left one if the columns aren't known)
    var place = st.place != null ? st.place : null;
    if (place === null && st.layout){
      // the big digit in Cooper's name row, to the right of his name
      var L = st.layout, hx0 = L.x0 + L.spacing * .45, hx1 = L.x0 + L.spacing * 1.02, hy0 = L.top != null ? L.top - L.ph * .04 : L.tagY - L.tagH * 3.5, hy1 = L.top != null ? L.top + L.ph * .2 : L.tagY + L.tagH * 1.2;
      var inHead = digits.filter(function(d){ return d.x > hx0 && d.x < hx1 && d.y > hy0 && d.y < hy1; });
      if (inHead.length) place = Math.min(2, inHead[0].ch);
    }
    if (place === null && digits.length){
      var labTop = st.labs.length ? Math.min.apply(null, st.labs.map(function(l){ return l.y; })) : prep.h;
      var top = digits.filter(function(d){ return d.y < labTop; }).sort(function(a, b){ return a.x - b.x; });
      var cx = st.colX[0];
      var reach = Math.max(prep.w * .12, (st.colX[1] != null ? Math.abs(st.colX[1] - cx) : prep.w * .25) * .6);
      var mine = cx != null ? top.filter(function(d){ return Math.abs(d.x - cx) < reach; })[0] : top[0];
      if (mine) place = Math.min(2, mine.ch);   // 1v1 and 2v2 only have a 1st and a 2nd
    }

    // what the Falls row says (Falls counts every stock lost, SDs included)
    var teamFalls = o.dubs ? (fMe !== null && fN !== null ? fMe + fN : null) : fMe;
    var byStats = teamFalls === null ? null : teamFalls >= o.full ? 'L' : 'W';
    var result = null, confidence = 'none', how = '';
    if (place !== null){
      result = place === 1 ? 'W' : 'L';
      confidence = byStats === null || byStats === result ? 'high' : 'low';
      how = 'Cooper placed ' + place + (place === 1 ? 'st' : place === 2 ? 'nd' : place === 3 ? 'rd' : 'th');
      if (confidence === 'low') how += ', but the Falls row disagrees';
    } else if (byStats){
      result = byStats; confidence = 'stats';
      how = byStats === 'L' ? 'your team fell ' + teamFalls + ' of ' + o.full + ' times' : 'your team still had stocks left';
    }

    // stocks left for the side that won
    var margin = null, marginHow = '';
    if (result === 'W' && teamFalls !== null){ margin = Math.max(0, o.full - teamFalls); marginHow = 'your stocks minus your falls'; }
    if (result === 'L'){
      var teamKos = o.dubs ? (koMe !== null && koN !== null ? koMe + koN : null) : koMe;
      if (teamKos !== null){ margin = Math.max(1, Math.min(o.full, o.full - teamKos)); marginHow = 'their stocks minus your KOs (estimate)'; }
    }

    if (DBG) DBG.decision = {place:place, teamFalls:teamFalls, byStats:byStats, result:result, confidence:confidence, how:how, margin:margin, marginHow:marginHow};
    var show = function(a, b){ return o.dubs ? (a === null ? '?' : a) + ' / ' + (b === null ? '?' : b) : (a === null ? '?' : String(a)); };
    var bits = [];
    if (place !== null) bits.push('placement ' + place);
    if (rows.kos) bits.push('KOs ' + show(koMe, koN));
    if (rows.falls) bits.push('Falls ' + show(fMe, fN));
    if (rows.sds) bits.push('SDs ' + show(sdMe, sdN));
    var seen = words.map(function(w){ return w.t; }).filter(function(t){ return /[A-Za-z0-9]/.test(t); }).slice(0, 40).join(' ');
    return {result:result, margin:margin, koMe:koMe, koNathan:koN, fallsMe:fMe, fallsNathan:fN, sdMe:sdMe, sdNathan:sdN,
      confidence:confidence, how:how, marginHow:marginHow,
      summary: bits.length ? (o.dubs ? 'Cooper / Nathan: ' : 'Cooper: ') + bits.join(' · ') : 'Couldn’t find the KOs, Falls or SDs rows in that photo',
      seen: seen};
  }

  // ---------- who's who: the fighter in each column ----------
  // Column order on the results screen: Cooper, Nathan, then the other team (1v1: Cooper, then the opponent).
  // A fighter's name read in a column is a sure match. Otherwise the colours of the character art in that
  // column are compared with every fighter's portrait and the closest is a best guess (with runners-up).
  var NORM = function(t){ return String(t || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); };
  function lev(a, b){
    var prev = [], cur = [], i, j;
    for (j = 0; j <= b.length; j++) prev[j] = j;
    for (i = 1; i <= a.length; i++){
      cur = [i];
      for (j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[b.length];
  }
  function similar(a, b){ var m = Math.max(a.length, b.length); return m ? 1 - lev(a, b) / m : 0; }
  // colour histogram: 12 hues x 2 saturations x 3 brightnesses, plus 4 greys; near-black is skipped
  var HB = 12 * 2 * 3 + 4;
  function histOf(data, W, x0, y0, x1, y1){
    var hst = new Float32Array(HB), n = 0;
    for (var y = y0; y < y1; y++) for (var x = x0; x < x1; x++){
      var i = (y * W + x) * 4, r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      var mx = Math.max(r, g, b), mn = Math.min(r, g, b), v = mx, sat = mx ? (mx - mn) / mx : 0;
      if (v < .14) continue;
      if (sat < .22){ hst[72 + Math.min(3, Math.floor(v * 4))]++; n++; continue; }
      // hue votes go to the two nearest hue bins, so a slight colour cast doesn't flip a bin
      var hh = mx === mn ? 0 : mx === r ? ((g - b) / (mx - mn) + 6) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4;
      var hf = hh * 2 - .5, h0 = Math.floor(hf), wt = hf - h0, sub = (sat > .55 ? 3 : 0) + Math.min(2, Math.floor(v * 3));
      hst[((h0 + 12) % 12) * 6 + sub] += 1 - wt; hst[((h0 + 13) % 12) * 6 + sub] += wt; n++;
    }
    if (n) for (var k = 0; k < HB; k++) hst[k] /= n;
    return {h:hst, n:n};
  }
  // stretch a block of pixels to full range (3rd percentile of brightness to 97th of the brightest channel)
  function stretch(data, W, x0, y0, x1, y1){
    var bw = x1 - x0, bh = y1 - y0, out = new Uint8ClampedArray(bw * bh * 4), lum = [], mxs = [], x, y, i;
    for (y = y0; y < y1; y++) for (x = x0; x < x1; x++){
      i = (y * W + x) * 4; lum.push(.299 * data[i] + .587 * data[i + 1] + .114 * data[i + 2]); mxs.push(Math.max(data[i], data[i + 1], data[i + 2]));
    }
    lum.sort(function(p, q){ return p - q; }); mxs.sort(function(p, q){ return p - q; });
    var lo = lum[Math.floor(lum.length * .03)], hi = mxs[Math.floor(mxs.length * .97)], sc = hi - lo > 40 ? Math.min(3, 255 / (hi - lo)) : 1;
    for (y = y0; y < y1; y++) for (x = x0; x < x1; x++){
      i = (y * W + x) * 4; var o = ((y - y0) * bw + (x - x0)) * 4;
      out[o] = (data[i] - lo) * sc; out[o + 1] = (data[i + 1] - lo) * sc; out[o + 2] = (data[i + 2] - lo) * sc; out[o + 3] = 255;
    }
    return {data:out, w:bw, h:bh};
  }
  function dropBackdrop(hs){
    // the panel's own colour fills most of a column: drop the biggest bin if it dominates
    var h = hs.h, top = 0;
    for (var k = 1; k < HB; k++) if (h[k] > h[top]) top = k;
    if (h[top] > .28){ var rest = 1 - h[top]; h[top] = 0; if (rest > 0) for (k = 0; k < HB; k++) h[k] /= rest; }
    return h;
  }
  function likeness(a, b){ var s = 0; for (var k = 0; k < HB; k++) s += Math.sqrt(a[k] * b[k]); return s; }
  var portraitCache = {};
  function portrait(f){
    var key = f.id + ':' + (f.img ? f.img.length : 0);
    if (portraitCache[key]) return portraitCache[key];
    portraitCache[key] = new Promise(function(res){
      if (!f.img) return res(null);
      var im = new Image();
      im.onload = function(){
        var c = document.createElement('canvas'); c.width = c.height = 48;
        var x = c.getContext('2d', {willReadFrequently: true}); x.drawImage(im, 0, 0, 48, 48);
        var st3 = stretch(x.getImageData(0, 0, 48, 48).data, 48, 4, 4, 44, 44);
        res(histOf(st3.data, st3.w, 0, 0, st3.w, st3.h).h);
      };
      im.onerror = function(){ res(null); };
      im.src = f.img;
    });
    return portraitCache[key];
  }
  function columnBoxes(prep, digits, st, n){
    var W = prep.w, H = prep.h, centers = [], span;
    var d = digits.slice().sort(function(a, b){ return a.x - b.x; });
    var i;
    if (st.layout){
      // from the player tags: the art sits below the tag and above the stats
      var L = st.layout, ours = st.labs.filter(function(l){ return l.x0 < L.x0 + L.spacing * 2; });
      var bot = ours.length ? Math.min.apply(null, ours.map(function(l){ return l.y - l.h * 2; })) : L.tagY + L.spacing * 1.1;
      return Array.apply(null, Array(n)).map(function(_, j){
        var x0 = L.x0 + j * L.spacing, ty = L.tagY + L.slope * j * L.spacing;
        var top = L.top != null ? L.top + L.slope * j * L.spacing : null;
        // the name row: left part of the panel's header (the placement digit is on the right)
        // names sit just above the P tag; without a tag, in the top part of the panel
        var useTop = top != null && !(L.tags && L.tags.length);
        var ny0 = useTop ? top - L.ph * .03 : ty - L.tagH * 3.6, ny1 = useTop ? top + L.ph * .2 : ty - L.tagH * .3;
        var y0 = top != null ? Math.max(ty + L.tagH * .9, top + L.ph * .19) : ty + L.tagH * .9;
        return {x0:x0 + L.spacing * .05, x1:x0 + L.spacing * .9, cx:x0 + L.spacing * .47, span:L.spacing, y0:y0, y1:Math.max(y0 + L.tagH * 3, bot + L.slope * j * L.spacing),
          nx0:x0 - L.spacing * .04, nx1:x0 + L.spacing * .7, ny0:ny0, ny1:ny1};
      });
    }
    if (d.length === n && n > 1){ span = (d[n - 1].x - d[0].x) / (n - 1); centers = d.map(function(q){ return q.x + span * .2; }); }
    else if (st.panelCols && st.panelCols.length >= 2){
      // one KOs / Falls / SDs label per column: the labels sit at the left of each panel
      span = st.panelCols[1] - st.panelCols[0];
      for (i = 0; i < n; i++) centers.push(st.panelCols[0] + span * (i + .32));
    } else if (st.colX && st.colX[0] != null && st.colX[1] != null){
      // a stats table: Cooper's and Nathan's numbers give the column spacing
      span = st.colX[1] - st.colX[0];
      for (i = 0; i < n; i++) centers.push(st.colX[0] + span * (i - .1));
    } else {
      span = W * .92 / n;
      for (i = 0; i < n; i++) centers.push(W * .04 + span * (i + .5));
    }
    var labTop = st.labs.length ? Math.min.apply(null, st.labs.map(function(l){ return l.y - l.h; })) : H * .82;
    // the art sits between the placement number and the stats; without the number, about a panel-width and a
    // half above the stats
    var top = d.length ? Math.max.apply(null, d.map(function(q){ return q.y + q.h * .6; })) : st.labs.length ? Math.max(0, labTop - span * 1.4) : H * .12;
    if (labTop - top < H * .08){ top = Math.max(0, labTop - span * 1.4); }
    return centers.map(function(c){ return {x0:c - span * .4, x1:c + span * .4, cx:c, span:span, y0:top, y1:labTop}; });
  }
  function whoIsWho(prep, digits, st, words, n, list, prior, learned){
    var boxes = columnBoxes(prep, digits, st, n);
    var fighters = list.filter(function(f){ return f && f.id; }).map(function(f){
      return {id:f.id, name:f.name, key:NORM(f.name), img:f.img, parts:String(f.name || '').split(/[\s\/&.-]+/).map(NORM).filter(function(w){ return w.length >= 4; })};
    });
    // 1) names written in a column
    var byName = boxes.map(function(b){
      var ws = words.filter(function(w){
        if (!/[A-Za-z]/.test(w.t) || kindOf(w.t)) return false;
        // with the player tags known, names sit in the band just above the tag
        if (b.nx0 != null) return w.x > b.nx0 && w.x < b.nx1 && w.y > b.ny0 && w.y < b.ny1;
        return w.x > b.x0 && w.x < b.x1;
      }).sort(function(p, q){ return p.y - q.y || p.x - q.x; });
      var best = null;
      for (var i = 0; i < ws.length; i++){
        var phrase = '';
        for (var j = i; j < Math.min(ws.length, i + 4); j++){
          if (j > i && (Math.abs(ws[j].y - ws[i].y) > ws[i].h * .7)) break;
          phrase += NORM(ws[j].t);
          if (phrase.length < 3) continue;
          var hits = [];
          fighters.forEach(function(f){
            if (f.key.length < 3) return;
            var sc = similar(phrase, f.key), need = f.key.length >= 8 ? .75 : .82;
            // the start of a name, cut off by the art or the edge ("BOWS" for Bowser)
            if (phrase.length >= 4 && f.key.indexOf(phrase) === 0 && phrase.length < f.key.length) sc = Math.max(sc, .78 + .2 * phrase.length / f.key.length);
            // one whole word of a longer name ("FALCON" for Captain Falcon) counts, a little less
            if (f.parts.length > 1) f.parts.forEach(function(w){ var ws2 = similar(phrase, w) * .95; if (ws2 >= .8 && ws2 > sc){ sc = ws2; need = .8; } });
            if (sc >= need) hits.push({id:f.id, sc:sc});
          });
          hits.sort(function(p2, q2){ return q2.sc - p2.sc; });
          // a word that fits two fighters equally ("KONG") settles nothing
          if (hits.length && !(hits[1] && hits[1].sc >= hits[0].sc - .01) && (!best || hits[0].sc > best.sc)) best = hits[0];
        }
      }
      return best;
    });
    // 2) the look of the character art
    var C = prep.color, k = prep.k3, cd = C.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, C.width, C.height).data;
    // grey-world white balance over the columns, so a warm or blue cast from the TV or room doesn't shift hues
    (function(){
      var sr = 0, sg = 0, sb = 0, cnt = 0;
      boxes.forEach(function(b){
        for (var y = Math.max(0, Math.round(b.y0 * k)); y < Math.min(C.height, Math.round(b.y1 * k)); y += 2)
          for (var x = Math.max(0, Math.round(b.x0 * k)); x < Math.min(C.width, Math.round(b.x1 * k)); x += 2){
            var i = (y * C.width + x) * 4; if (cd[i] + cd[i + 1] + cd[i + 2] < 60) continue; sr += cd[i]; sg += cd[i + 1]; sb += cd[i + 2]; cnt++;
          }
      });
      if (!cnt) return;
      var avg = (sr + sg + sb) / 3, fr = Math.max(.75, Math.min(1.33, avg / sr)), fg = Math.max(.75, Math.min(1.33, avg / sg)), fb = Math.max(.75, Math.min(1.33, avg / sb));
      // only half the correction: the art itself isn't grey on average
      fr = (1 + fr) / 2; fg = (1 + fg) / 2; fb = (1 + fb) / 2;
      for (var i = 0; i < cd.length; i += 4){ cd[i] = Math.min(255, cd[i] * fr); cd[i + 1] = Math.min(255, cd[i + 1] * fg); cd[i + 2] = Math.min(255, cd[i + 2] * fb); }
    })();
    var cols = boxes.map(function(b){
      var x0 = Math.max(0, Math.round(b.x0 * k)), x1 = Math.min(C.width, Math.round(b.x1 * k)), y0 = Math.max(0, Math.round(b.y0 * k)), y1 = Math.min(C.height, Math.round(b.y1 * k));
      if (x1 - x0 < 6 || y1 - y0 < 6) return null;
      // stretch this column to full range: a photo of a TV is darker and greyer than the portraits
      var st2 = stretch(cd, C.width, x0, y0, x1, y1);
      var hs = histOf(st2.data, st2.w, 0, 0, st2.w, st2.h);
      return hs.n > 50 ? dropBackdrop(hs) : null;
    });
    return Promise.all(fighters.map(portrait)).then(function(ph){
      return boxes.map(function(b, i){
        // a small nudge toward the fighters this player actually picks (opts.prior[i] = {id: games})
        var pr = (prior && prior[i]) || {}, tot = 0; Object.keys(pr).forEach(function(id){ tot += pr[id]; });
        var nudge = function(id){ return tot ? .06 * Math.log(1 + 20 * (pr[id] || 0) / tot) : 0; };
        // looks remembered from earlier confirmed photos of this TV beat the portrait when they're closer
        var seenLike = function(id){
          var L = learned && learned[id]; if (!L || !L.length) return 0;
          return Math.max.apply(null, L.map(function(sig){ return sig && sig.length === HB ? likeness(cols[i], sig) + .04 : 0; }));
        };
        var ranked = cols[i] ? fighters.map(function(f, j){ return {id:f.id, sc: Math.max(ph[j] ? likeness(cols[i], ph[j]) : 0, seenLike(f.id)) + nudge(f.id)}; })
          .filter(function(r){ return r.sc > 0; }).sort(function(p, q){ return q.sc - p.sc; }) : [];
        var alts = ranked.slice(0, 4).map(function(r){ return r.id; });
        // the column's colour signature, so the page can remember it once the fighter is confirmed
        var sig = cols[i] ? Array.prototype.map.call(cols[i], function(v){ return Math.round(v * 1000) / 1000; }) : null;
        if (DBG){ (DBG.fboxes = DBG.fboxes || [])[i] = {box:b, byName:byName[i] || null, top:ranked.slice(0, 5).map(function(r){ return {id:r.id, sc:Math.round(r.sc * 1000) / 1000}; })}; }
        if (byName[i]) return {id:byName[i].id, how:'name', sig:sig, alts:[byName[i].id].concat(alts.filter(function(a){ return a !== byName[i].id; })).slice(0, 4)};
        if (!ranked.length) return {id:null, how:'none', sig:sig, alts:[]};
        return {id:ranked[0].id, how:'look', sig:sig, alts:alts};
      });
    });
  }

  // Remember what each confirmed fighter looked like in a photo (this device only, a few per fighter).
  var LOOKS_KEY = 'stocklog.photoLooks';
  function learnedLooks(){ try { return JSON.parse(localStorage.getItem(LOOKS_KEY) || '{}') || {}; } catch (e){ return {}; } }
  function remember(pairs){
    var all = learnedLooks();
    (pairs || []).forEach(function(p){
      if (!p || !p.id || !p.sig || p.sig.length !== HB) return;
      all[p.id] = [p.sig].concat(all[p.id] || []).slice(0, 4);
    });
    try { localStorage.setItem(LOOKS_KEY, JSON.stringify(all)); } catch (e){}
  }

  window.SmashPhoto = {read:read, ready:ready, learnedLooks:learnedLooks, remember:remember};
})();
