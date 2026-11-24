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
  // grey: high-contrast greyscale. inv: the same, flipped (white text on dark panels becomes dark on light).
  // masks: small black/white maps of bright pixels, for the big placement digit.
  function prepare(file){
    return new Promise(function(res, rej){
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function(){
        var k = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
        var w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
        var mk = function(){ var c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
        var grey = mk(), inv = mk();
        var gx = grey.getContext('2d', {willReadFrequently: true}); gx.drawImage(img, 0, 0, w, h);
        var d = gx.getImageData(0, 0, w, h), px = d.data, di = inv.getContext('2d').createImageData(w, h), q = di.data;
        for (var i = 0; i < px.length; i += 4){
          var y = .299 * px[i] + .587 * px[i + 1] + .114 * px[i + 2], v = Math.max(0, Math.min(255, (y - 128) * 1.4 + 128));
          px[i] = px[i + 1] = px[i + 2] = v; q[i] = q[i + 1] = q[i + 2] = 255 - v; q[i + 3] = 255;
        }
        gx.putImageData(d, 0, 0); inv.getContext('2d').putImageData(di, 0, 0);
        // small masks for the digit finder
        var k2 = Math.min(1, 640 / Math.max(w, h)), mw = Math.round(w * k2), mh = Math.round(h * k2);
        var sc = document.createElement('canvas'); sc.width = mw; sc.height = mh;
        var sx = sc.getContext('2d', {willReadFrequently: true}); sx.drawImage(img, 0, 0, mw, mh);
        var sd = sx.getImageData(0, 0, mw, mh).data, ys = new Float32Array(mw * mh);
        for (var j = 0, n = 0; j < sd.length; j += 4, n++) ys[n] = .299 * sd[j] + .587 * sd[j + 1] + .114 * sd[j + 2];
        var sorted = Array.prototype.slice.call(ys).sort(function(a, b){ return a - b; });
        var hi = Math.max(150, sorted[Math.floor(sorted.length * .97)] * .82);
        var white = new Uint8Array(mw * mh), bright = new Uint8Array(mw * mh);
        for (j = 0, n = 0; j < sd.length; j += 4, n++){
          var chroma = Math.max(sd[j], sd[j + 1], sd[j + 2]) - Math.min(sd[j], sd[j + 1], sd[j + 2]);
          white[n] = ys[n] >= hi && chroma < 70 ? 1 : 0;
          bright[n] = Math.max(sd[j], sd[j + 1], sd[j + 2]) >= 200 && ys[n] >= hi * .8 ? 1 : 0;   // white or bright gold/coloured
        }
        URL.revokeObjectURL(url);
        res({grey:grey, inv:inv, w:w, h:h, masks:[white, bright], mw:mw, mh:mh, k2:k2});
      };
      img.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('That file is not a picture I can open.')); };
      img.src = url;
    });
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
  function classify(get, x0, y0, bw, bh){
    if (!templates10) templates10 = fontTemplates(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'], []);
    var g = gridOf(get, x0, y0, bw, bh), ar = bw / bh, best = null;
    templates10.forEach(function(t){
      var dist = 0; for (var i = 0; i < g.length; i++) dist += (g[i] - t.g[i]) * (g[i] - t.g[i]);
      dist = dist / g.length + Math.pow(Math.log(ar / t.ar), 2) * .15;
      if (!best || dist < best.d) best = {ch:t.ch, d:dist};
    });
    return best && best.d < .12 ? best.ch : null;
  }
  function blobsOf(p, m){
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
      if (bh < H * .06 || bh > H * .55 || bw > W * .22 || bh / bw < .9 || bh / bw > 6 || fill < .12 || fill > .85) return null;
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
  var LOOKS = {'°':'0', 'o':'0', 'O':'0', 'D':'0', 'Q':'0', 'l':'1', 'I':'1', '|':'1', '!':'1', 'i':'1', ']':'1', 'Z':'2', 'z':'2', 'S':'5', 's':'5', 'B':'8', 'g':'9', 'q':'9'};
  function asNum(t){
    t = String(t).replace(/^[:.\-–=]+|[.,:;'"`]+$/g, '');
    var u = t.split('').map(function(ch){ return LOOKS[ch] || ch; }).join('');
    return /^\d{1,2}$/.test(u) ? parseInt(u, 10) : null;
  }
  // row labels, forgiving of common misreads ("K0s", "KO's", "Fal1s", "SD's", "S0s")
  var LABELS = {
    kos:   /^K[O0o][’'`]?[s5S]?$/,
    falls: /^(?:[FfE][aA@][l1I|][l1I|][s5S]?|[aA@][l1I|][l1I|][s5S])$/,
    sds:   /^S[DO0][’'`]?[s5S]?$/
  };
  var LABEL_LEAD = /^(K[O0o][’'`]?[s5S]?|[FfE][aA@][l1I|][l1I|][s5S]?|S[DO0][’'`]?[s5S]?)[:.]?(\d{1,2})$/;
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
    var a = Math.atan(slope), sx0 = lab.x1 + lab.h * .15, hh = lab.h * 1.2;
    len = Math.min(len, prep.w - sx0);
    if (len < lab.h * .8) return Promise.resolve([]);
    var k = Math.max(1, Math.min(4, 44 / lab.h)), W = Math.round(len * k), H = Math.round(hh * 2 * k);
    var c = document.createElement('canvas'); c.width = W; c.height = H;
    var x = c.getContext('2d', {willReadFrequently: true}); x.fillStyle = '#808080'; x.fillRect(0, 0, W, H);
    x.scale(k, k); x.translate(0, hh); x.rotate(-a); x.translate(-sx0, -lab.y); x.drawImage(prep.grey, 0, 0);
    x.setTransform(1, 0, 0, 1, 0, 0);
    var d = x.getImageData(0, 0, W, H), px = d.data, n = W * H, lum = new Uint8Array(n);
    for (var i = 0; i < n; i++) lum[i] = px[i * 4];
    var sorted = Array.prototype.slice.call(lum).sort(function(p, q){ return p - q; }), med = sorted[n >> 1];
    var dark = med < 128, ink = new Uint8Array(n);
    for (i = 0; i < n; i++) ink[i] = dark ? (lum[i] > med + 70 ? 1 : 0) : (lum[i] < med - 70 ? 1 : 0);
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
    keep.forEach(function(b){
      var bh = b.y1 - b.y0 + 1, bw = b.x1 - b.x0 + 1;
      if (bh < Lh * .45 || bh > Lh * 1.7 || bw > Lh * 1.3 || b.n < Lh * 2) return;
      if (b.y0 <= 0 || b.y1 >= H - 1) return;     // runs off the strip: an edge or a bar, not a digit
      any = true;
      b.px.forEach(function(q){ px[q * 4] = px[q * 4 + 1] = px[q * 4 + 2] = 0; });
    });
    if (!any) return Promise.resolve([]);
    x.putImageData(d, 0, 0);
    // group the kept marks into numbers (digits close together), left to right
    var marks = keep.filter(function(b){ var bh = b.y1 - b.y0 + 1, bw = b.x1 - b.x0 + 1; return !(bh < Lh * .45 || bh > Lh * 1.7 || bw > Lh * 1.3 || b.n < Lh * 2 || b.y0 <= 0 || b.y1 >= H - 1); })
      .sort(function(p, q){ return p.x0 - q.x0; });
    var groups = [];
    marks.forEach(function(b){ var g = groups[groups.length - 1]; if (g && b.x0 - g.x1 < Lh * .45 && g.marks.length < 2){ g.marks.push(b); g.x1 = Math.max(g.x1, b.x1); g.y0 = Math.min(g.y0, b.y0); g.y1 = Math.max(g.y1, b.y1); } else groups.push({marks:[b], x0:b.x0, x1:b.x1, y0:b.y0, y1:b.y1}); });
    groups = groups.slice(0, want || 4);
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
          if (!/^\d{1,2}$/.test(txt) || (r.data.confidence || 0) < 35){
            // shape match each digit instead
            var ds = g.marks.map(function(b){ var id = b.id; return classify(function(xx, yy){ return seen[yy * W + xx] === id ? 1 : 0; }, b.x0, b.y0, b.x1 - b.x0 + 1, b.y1 - b.y0 + 1); });
            txt = ds.every(function(v){ return v !== null; }) ? ds.join('') : txt;
          }
          if (!/^\d{1,2}$/.test(txt)) return;
          var pos = toImg((g.x0 + g.x1) / 2, (g.y0 + g.y1) / 2);
          out.push({t:txt, x:pos[0], y:pos[1], h:gh / k, w:gw / k});
        });
      });
    });
    return chain.then(function(){ return out; });
  }

  // ---------- the reader ----------
  function read(file, opts){
    opts = opts || {};
    progressCb = opts.onProgress || null;
    stepLabel = '';
    if (progressCb) progressCb(0, worker ? 'Reading the screen' : 'Getting the reader ready (first time downloads about 7 MB)');
    var dubs = opts.mode === 'doubles', stocks = Number(opts.stocks) || 3, full = stocks * (dubs ? 2 : 1), slots = dubs ? 2 : 1;
    var prep, wk, words = [], digits = [];
    var page = function(canvas, psm, label){
      stepLabel = label;
      return wk.setParameters({tessedit_pageseg_mode: psm, tessedit_char_whitelist: ''})
        .then(function(){ return wk.recognize(canvas); })
        .then(function(r){ words = words.concat(wordsOf(r, same())); });
    };
    var labelsFound = function(){
      var kinds = {};
      words.forEach(function(w){ var k = kindOf(w.t) || (LABEL_LEAD.test(w.t) ? kindOf(w.t.match(LABEL_LEAD)[1]) : null); if (k) kinds[k] = 1; });
      return Object.keys(kinds).length;
    };
    return prepare(file).then(function(p){ prep = p; digits = findDigits(p); return ready(); })
      .then(function(w){ wk = w; return page(prep.grey, '11', 'Reading the screen (1 of 3)'); })
      .then(function(){ return page(prep.inv, '11', 'Reading the screen (2 of 3)'); })
      .then(function(){ return labelsFound() >= 2 ? null : page(prep.grey, '6', 'Reading the screen (3 of 3)'); })
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

        // per-column layout: group labels into player columns, and fill in a label the OCR missed in
        // Cooper's or Nathan's column from where the same row sits in another column
        var spread = labs.filter(function(l){ return labs.some(function(o){ return o.kind === l.kind && Math.abs(o.x - l.x) > l.h * 3; }); });
        if (spread.length){
          var cols = [];
          spread.slice().sort(function(a, b){ return a.x - b.x; }).forEach(function(l){
            var c = cols.filter(function(c){ return Math.abs(c.x - l.x) < l.h * 2.5; })[0];
            if (c){ c.labs.push(l); c.x = (c.x * (c.labs.length - 1) + l.x) / c.labs.length; } else cols.push({x:l.x, labs:[l]});
          });
          cols.sort(function(a, b){ return a.x - b.x; });
          var have = function(c, k){ return c.labs.filter(function(l){ return l.kind === k; })[0]; };
          cols.slice(0, slots).forEach(function(c){
            ['kos', 'falls', 'sds'].forEach(function(k){
              if (have(c, k)) return;
              var ref = c.labs[0];
              // the same pair of rows in another column gives the offset
              var donor = cols.filter(function(o){ return have(o, k) && have(o, ref.kind); })[0];
              if (!donor) return;
              var dk = have(donor, k), dr = have(donor, ref.kind);
              var lab = {kind:k, t:'(filled)', x:ref.x + (dk.x - dr.x), y:ref.y + (dk.y - dr.y), h:dk.h, w:dk.w, lead:null};
              lab.x0 = lab.x - dk.w / 2; lab.x1 = lab.x + dk.w / 2;
              labs.push(lab);
            });
          });
        }

        // for each kind: [Cooper, Nathan] values plus the x of each column
        var rows = {}, colX = [], jobs = Promise.resolve();
        var onLine = function(lab, until){
          return words.filter(function(w){ var v = asNum(w.t); return v !== null && w.x > lab.x1 && w.x < until && Math.abs((w.y - lab.y) - slope * (w.x - lab.x)) < Math.max(lab.h, w.h) * .8 && w.h < lab.h * 2.4; })
            .sort(function(a, b){ return a.x - b.x; });
        };
        ['kos', 'falls', 'sds'].forEach(function(k){
          var L = labs.filter(function(l){ return l.kind === k; }).sort(function(a, b){ return a.x - b.x; });
          if (!L.length) return;
          var perPanel = L.length >= 2 && L[1].x - L[0].x > L[0].h * 3;
          rows[k] = {vals:[null, null], layout: perPanel ? 'panel' : 'table'};
          if (perPanel){
            // one label per player column: the number right after Cooper's label, then Nathan's
            var gap = L[1].x - L[0].x;
            for (var i = 0; i < Math.min(slots, L.length); i++) (function(i){
              var lab = L[i], until = Math.min(i + 1 < L.length ? L[i + 1].x0 - lab.h * .3 : Infinity, lab.x0 + gap * .92);
              if (colX[i] == null) colX[i] = lab.x + gap * .25;
              jobs = jobs.then(function(){
                if (lab.lead !== null){ rows[k].vals[i] = lab.lead; return; }
                return stripRead(wk, prep, lab, until - lab.x1, slope, 1).then(function(ns){
                  var n = ns.filter(function(w){ return w.x < until; })[0] || onLine(lab, until)[0];
                  if (n) rows[k].vals[i] = asNum(n.t);
                });
              });
            })(i);
          } else {
            // one label for the row (a table): the first number is Cooper's, the next Nathan's
            var lab = L[0];
            jobs = jobs.then(function(){
              return stripRead(wk, prep, lab, prep.w - lab.x1, slope, slots).then(function(ns){
                if (ns.length < slots){
                  var extra = onLine(lab, prep.w).filter(function(w){ return !ns.some(function(o){ return Math.abs(o.x - w.x) < lab.h; }); });
                  ns = ns.concat(extra).sort(function(a, b){ return a.x - b.x; });
                }
                if (lab.lead !== null) ns = [{t:String(lab.lead), x:lab.x}].concat(ns);
                for (var i = 0; i < slots && i < ns.length; i++){ rows[k].vals[i] = asNum(ns[i].t); if (colX[i] == null) colX[i] = ns[i].x; }
              });
            });
          }
        });
        return jobs.then(function(){ return {rows:rows, colX:colX, labs:labs, slope:slope}; });
      })
      .then(function(st){
        progressCb = null; stepLabel = '';
        return decide(st, digits, prep, {dubs:dubs, stocks:stocks, full:full, slots:slots}, words);
      }, function(e){ progressCb = null; stepLabel = ''; throw e; });
  }

  function decide(st, digits, prep, o, words){
    var rows = st.rows, val = function(k, i){ return rows[k] ? rows[k].vals[i] : null; };
    var cap = function(v, max){ return v === null || v === undefined || v > max ? null : v; };
    var koMe = cap(val('kos', 0), o.full), koN = o.dubs ? cap(val('kos', 1), o.full) : null;
    var fMe = cap(val('falls', 0), o.stocks), fN = o.dubs ? cap(val('falls', 1), o.stocks) : null;
    var sdMe = cap(val('sds', 0), o.stocks), sdN = o.dubs ? cap(val('sds', 1), o.stocks) : null;

    // Cooper's placement: the big digit in his column (the far-left one if the columns aren't known)
    var place = null;
    if (digits.length){
      var labTop = st.labs.length ? Math.min.apply(null, st.labs.map(function(l){ return l.y; })) : prep.h;
      var top = digits.filter(function(d){ return d.y < labTop; }).sort(function(a, b){ return a.x - b.x; });
      var cx = st.colX[0];
      var reach = Math.max(prep.w * .12, (st.colX[1] != null ? Math.abs(st.colX[1] - cx) : prep.w * .25) * .6);
      var mine = cx != null ? top.filter(function(d){ return Math.abs(d.x - cx) < reach; })[0] : top[0];
      if (mine) place = mine.ch;
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

  window.SmashPhoto = {read:read, ready:ready};
})();
