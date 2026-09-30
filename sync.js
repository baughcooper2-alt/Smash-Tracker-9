// Smash Tracker cloud sync (Supabase). Shared by the tracker (index.html) and the phone remote (remote.html).
//
// Each page keeps its full data locally and hands this engine two functions:
//   getLocal()      -> {matches:[...], kv:{key: value}}   the page's current data
//   applyRemote(ch) -> apply {kv:{key: value|null}, upserts:[match], deletes:[id]} from the cloud
// The engine remembers a fingerprint of what the cloud last had for every key and game
// (the "base"). Anything that differs locally gets pushed; anything newer in the cloud
// gets applied unless this device has an unsent change to the same key or game.
(function(){
  'use strict';

  var SUPABASE_SRC = 'vendor/supabase.js';
  var OVERLAP_MS = 10000;
  var POLL_MS = 20000;

  // Canonical JSON (sorted keys): Postgres jsonb reorders keys, and a reorder must not look like a change.
  function J(v){
    if (v === undefined || v === null) return 'null';
    if (typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(J).join(',') + ']';
    var ks = Object.keys(v).filter(function(k){ return v[k] !== undefined; }).sort();
    return '{' + ks.map(function(k){ return JSON.stringify(k) + ':' + J(v[k]); }).join(',') + '}';
  }
  function hash(str){
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < str.length; i++){
      var c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 2654435761);
      h2 = Math.imul(h2 ^ c, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  var matchHashes = typeof WeakMap === 'function' ? new WeakMap() : null;
  function hashMatch(m){
    if (matchHashes && m && typeof m === 'object'){
      var hit = matchHashes.get(m);
      if (hit) return hit;
      var h = hash(J(m));
      matchHashes.set(m, h);
      return h;
    }
    return hash(J(m));
  }
  function hashVal(v){ return v === null || v === undefined ? 'D' : hash(J(v)); }
  // Big values (portraits, the roster) rarely change: reuse the hash while the value is the same reference.
  var valCache = {};
  function hashKey(k, v){
    var c = valCache[k];
    if (c && c.v === v) return c.h;
    var h = hashVal(v);
    valCache[k] = {v:v, h:h};
    return h;
  }
  // Postgres timestamps look like 2026-09-30T14:49:01.123456+00:00. Parse them by hand:
  // some Safari versions reject 6-digit fractions in Date.parse.
  function toMs(iso){
    var m = /^(\d{4})-(\d\d)-(\d\d)[T ](\d\d):(\d\d):(\d\d)(?:\.(\d+))?\s*(Z|[+-]\d\d(?::?\d\d)?)?$/i.exec(String(iso || ''));
    if (!m) return 0;
    var ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], m[7] ? +(m[7] + '00').slice(0, 3) : 0);
    var z = m[8];
    if (z && z.toUpperCase() !== 'Z'){
      var sign = z[0] === '-' ? -1 : 1, d = z.slice(1).replace(':', '');
      ms -= sign * ((+d.slice(0, 2)) * 60 + (+(d.slice(2, 4) || 0))) * 60000;
    }
    return ms;
  }
  function later(cur, iso){ return Math.max(cur || 0, toMs(iso)); }
  function minus(cur, ms){ return cur ? new Date(cur - ms).toISOString() : null; }

  function loadScript(src){
    var cache = window.__smashScripts = window.__smashScripts || {};
    if (!cache[src]) cache[src] = new Promise(function(res, rej){
      var el = document.createElement('script');
      el.src = src; el.onload = res;
      el.onerror = function(){ delete cache[src]; el.remove(); rej(new Error('Could not load ' + src)); };
      document.head.appendChild(el);
    });
    return cache[src];
  }

  // ---------- config ----------
  function validConfig(c){
    return !!(c && typeof c.url === 'string' && /^(https:\/\/\S+|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?)$/.test(c.url) && typeof c.key === 'string' && c.key.length > 20);
  }
  function manualConfig(){
    try { var c = JSON.parse(localStorage.getItem('smash.syncConfig') || 'null'); return validConfig(c) ? c : null; } catch(e){ return null; }
  }
  function loadConfig(){
    var manual = manualConfig();
    if (manual) return Promise.resolve(manual);
    return fetch('api/sync-config', {cache:'no-store'})
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(c){ return validConfig(c) ? {url:c.url.replace(/\/+$/, ''), key:c.key} : null; })
      .catch(function(){ return null; });
  }

  // ---------- Supabase backend ----------
  function supabaseBackend(cfg){
    var client = window.supabase.createClient(cfg.url, cfg.key, {
      auth:{persistSession:true, autoRefreshToken:true, detectSessionInUrl:false, storageKey:'smash-sync-auth'}
    });
    var who = function(s){ return s && s.user ? {uid:s.user.id, email:s.user.email || ''} : null; };
    var check = function(res){ if (res.error) throw res.error; return res.data; };
    return {
      session: function(){ return client.auth.getSession().then(function(r){ return who(r.data && r.data.session); }); },
      onAuth: function(cb){ client.auth.onAuthStateChange(function(ev, s){ setTimeout(function(){ cb(who(s), ev); }, 0); }); },
      signIn: function(email, password){
        return client.auth.signInWithPassword({email:email, password:password}).then(check).then(function(d){ return who(d.session); });
      },
      signUp: function(email, password){
        return client.auth.signUp({email:email, password:password}).then(check).then(function(d){ return {user:who(d.session), needsConfirm:!d.session}; });
      },
      signOut: function(){ return client.auth.signOut().then(function(){}); },
      fetchSince: function(table, since){
        var cols = table === 'smash_kv' ? 'key,value,updated_at' : 'id,data,deleted,updated_at';
        var out = [], size = 1000;
        var page = function(from){
          var q = client.from(table).select(cols).order('updated_at', {ascending:true}).order(table === 'smash_kv' ? 'key' : 'id', {ascending:true});
          if (since) q = q.gt('updated_at', since);
          return q.range(from, from + size - 1).then(check).then(function(rows){
            out = out.concat(rows || []);
            return rows && rows.length === size ? page(from + size) : out;
          });
        };
        return page(0);
      },
      upsert: function(table, rows){
        var conflict = table === 'smash_kv' ? 'user_id,key' : 'user_id,id';
        var chunks = [];
        for (var i = 0; i < rows.length; i += 200) chunks.push(rows.slice(i, i + 200));
        return chunks.reduce(function(p, chunk){
          return p.then(function(){ return client.from(table).upsert(chunk, {onConflict:conflict}).then(check); });
        }, Promise.resolve());
      },
      subscribe: function(uid, onChange, onStatus){
        var ch = client.channel('smash-' + uid);
        ['smash_kv', 'smash_matches'].forEach(function(t){
          ch.on('postgres_changes', {event:'*', schema:'public', table:t, filter:'user_id=eq.' + uid}, function(){ onChange(t); });
        });
        ch.subscribe(function(status){ onStatus(status === 'SUBSCRIBED'); });
        return function(){ try { client.removeChannel(ch); } catch(e){} };
      }
    };
  }

  // ---------- engine ----------
  function SmashSync(opts){
    this.adapter = opts.adapter;
    this.firstLink = opts.firstLink || 'ask';
    this.baseKey = opts.baseKey || 'smash.sync.base';
    this.onStatus = opts.onStatus || function(){};
    this.st = {phase:'loading', email:'', uid:'', live:false, lastSync:0, msg:'', localOnly:0};
    this.base = null;
    this.backend = null;
    this.queue = Promise.resolve();
    this.pushT = null; this.pullT = null; this.retryT = null; this.pollT = null;
    this.failures = 0;
    this.unsub = null;
    this.linked = false;
    this.readBase();
  }
  var P = SmashSync.prototype;

  P.status = function(patch){
    var same = true;
    for (var k in patch){ if (this.st[k] !== patch[k]) same = false; this.st[k] = patch[k]; }
    if (same) return;
    try { this.onStatus(Object.assign({}, this.st)); } catch(e){ console.error(e); }
  };
  P.readBase = function(){
    try {
      var b = JSON.parse(localStorage.getItem(this.baseKey) || 'null');
      if (b && b.uid && b.kv && b.m && (b.kCur == null || typeof b.kCur === 'number')) this.base = b;
    } catch(e){}
  };
  P.saveBase = function(){
    try { localStorage.setItem(this.baseKey, JSON.stringify(this.base)); } catch(e){}
  };

  P.start = function(){
    var self = this;
    return loadConfig().then(function(cfg){
      if (!cfg) return self.status({phase:'unconfigured'});
      var factory = window.__smashSyncBackend;
      var ready = factory || (window.supabase && window.supabase.createClient) ? Promise.resolve() : loadScript(SUPABASE_SRC);
      return ready.then(function(){
        self.backend = factory ? factory(cfg) : supabaseBackend(cfg);
        self.backend.onAuth(function(user, ev){
          if (ev === 'SIGNED_OUT' && self.st.uid){
            self.stopLive(); self.linked = false;
            self.status({phase:'signedout', uid:'', email:'', live:false, localOnly:0});
          }
          else if (user && user.uid !== self.st.uid && ev === 'SIGNED_IN') self.begin(user);
        });
        return self.backend.session().then(function(user){
          if (user) self.begin(user); else self.status({phase:'signedout'});
        });
      });
    }).catch(function(e){
      self.status({phase:'error', msg:(e && e.message) || 'Sync could not start'});
    });
  };

  P.signIn = function(email, password){
    var self = this;
    if (!this.backend) return Promise.reject(new Error('Sync is not set up'));
    return this.backend.signIn(email, password).then(function(user){ if (user) self.begin(user); return user; });
  };
  P.signUp = function(email, password){
    var self = this;
    if (!this.backend) return Promise.reject(new Error('Sync is not set up'));
    return this.backend.signUp(email, password).then(function(r){ if (r.user) self.begin(r.user); return r; });
  };
  P.signOut = function(){
    this.stopLive();
    this.linked = false;
    this.status({phase:'signedout', uid:'', email:'', live:false, localOnly:0});
    return this.backend ? this.backend.signOut() : Promise.resolve();
  };

  // Local data changed: push soon.
  P.notify = function(){
    var self = this;
    if (!this.st.uid) return;
    clearTimeout(this.pushT);
    this.pushT = setTimeout(function(){ self.enqueue('push'); }, 250);
  };
  P.pullSoon = function(ms){
    var self = this;
    if (!this.st.uid) return;
    clearTimeout(this.pullT);
    this.pullT = setTimeout(function(){ self.enqueue('pull'); }, ms || 120);
  };
  P.refresh = function(){ this.enqueue('pull'); this.enqueue('push'); };

  // One network job at a time; repeated requests for the same job collapse into one.
  P.enqueue = function(kind){
    var self = this;
    this.pending = this.pending || {};
    if (this.pending[kind]) return this.pending[kind];
    var uid = this.st.uid;
    var job = this.queue.then(function(){
      self.pending[kind] = null;
      if (!self.st.uid || self.st.uid !== uid || !self.linked) return;
      return (kind === 'pull' ? self.pull() : self.push()).then(function(did){
        self.failures = 0;
        if (self.st.uid !== uid || self.st.phase === 'choice') return;
        if (did !== false || self.st.phase !== 'synced') self.status({phase:'synced', lastSync:Date.now(), msg:''});
      }, function(e){ self.failed(e, kind); });
    });
    this.pending[kind] = job;
    this.queue = job.catch(function(){});
    return job;
  };
  P.failed = function(e, kind){
    var self = this;
    var msg = (e && e.message) || String(e);
    console.warn('[sync] ' + kind + ' failed:', msg);
    var auth = /jwt|token|auth|401|403/i.test(msg);
    this.failures++;
    if (!this.linked) return;
    this.status({phase:'offline', msg: auth ? 'Signed-in session expired — sign in again if this sticks.' : (navigator.onLine === false ? 'No internet. Changes are saved on this device.' : 'Can’t reach the cloud. Changes are saved on this device.')});
    clearTimeout(this.retryT);
    var wait = [2000, 5000, 10000, 30000][Math.min(this.failures - 1, 3)];
    this.retryT = setTimeout(function(){ self.refresh(); }, wait);
  };

  P.begin = function(user){
    var self = this;
    this.stopLive();
    this.linked = false;
    this.status({uid:user.uid, email:user.email, phase:'linking', msg:'', localOnly:0});
    var first = !this.base || this.base.uid !== user.uid;
    if (first) this.base = {uid:user.uid, kCur:null, mCur:null, kv:{}, m:{}};
    var uid = user.uid;
    var job = this.queue.then(function(){
      if (self.st.uid !== uid) return;
      return self.pull({first:first}).then(function(res){
        if (self.st.uid !== uid) return;
        if (first && res && res.localOnly.length){
          if (self.firstLink === 'cloud') {
            self.adapter.applyRemote({kv:{}, upserts:[], deletes:res.localOnly});
          } else {
            self.localOnly = res.localOnly;
            return self.status({phase:'choice', localOnly:res.localOnly.length});
          }
        }
        self.linked = true;
        self.status({phase:'synced', lastSync:Date.now()});
        self.goLive();
        self.enqueue('push');
      });
    }).catch(function(e){
      console.warn('[sync] first sync failed:', (e && e.message) || e);
      self.status({phase:'linking', msg:navigator.onLine === false ? 'No internet. Retrying…' : 'Can\u2019t reach the cloud. Retrying…'});
      clearTimeout(self.retryT);
      self.retryT = setTimeout(function(){ if (self.st.uid === uid) self.begin(user); }, 5000);
    });
    this.queue = job;
    return job;
  };

  // First sign-in on a device that already has games the cloud doesn't: keep them or drop them.
  P.resolveChoice = function(keep){
    if (this.st.phase !== 'choice') return;
    if (!keep) this.adapter.applyRemote({kv:{}, upserts:[], deletes:this.localOnly || []});
    this.localOnly = null;
    this.linked = true;
    this.status({phase:'synced', localOnly:0, lastSync:Date.now()});
    this.goLive();
    this.enqueue('push');
  };

  P.goLive = function(){
    var self = this;
    this.stopLive();
    var uid = this.st.uid;
    this.unsub = this.backend.subscribe(uid, function(){ self.pullSoon(); }, function(ok){
      if (self.st.uid !== uid) return;
      var was = self.st.live;
      self.status({live:ok});
      if (ok && !was) self.pullSoon(10);
    });
    this.pollT = setInterval(function(){
      if (document.visibilityState === 'visible') self.refresh();
    }, POLL_MS);
    if (!this._wired){
      this._wired = true;
      document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'visible' && self.st.uid && self.st.phase !== 'choice') self.refresh(); });
      window.addEventListener('online', function(){ if (self.st.uid && self.st.phase !== 'choice') self.refresh(); });
    }
  };
  P.stopLive = function(){
    clearInterval(this.pollT); this.pollT = null;
    clearTimeout(this.retryT); clearTimeout(this.pullT); clearTimeout(this.pushT);
    if (this.unsub){ this.unsub(); this.unsub = null; }
    if (this.st.live) this.status({live:false});
  };

  P.pull = function(opts){
    var self = this, base = this.base, first = opts && opts.first;
    return Promise.all([
      this.backend.fetchSince('smash_kv', minus(base.kCur, OVERLAP_MS)),
      this.backend.fetchSince('smash_matches', minus(base.mCur, OVERLAP_MS))
    ]).then(function(res){
      if (self.base !== base) return {localOnly:[]};
      var kvRows = res[0], mRows = res[1];
      var local = self.adapter.getLocal();
      var lkv = local.kv || {}, lm = {};
      (local.matches || []).forEach(function(m){ if (m && m.id != null) lm[m.id] = m; });
      var out = {kv:{}, upserts:[], deletes:[]}, changed = false;

      kvRows.forEach(function(r){
        base.kCur = later(base.kCur, r.updated_at);
        var rh = hashVal(r.value);
        var lh = Object.prototype.hasOwnProperty.call(lkv, r.key) ? hashKey(r.key, lkv[r.key]) : 'D';
        var bh = base.kv[r.key];
        if (rh === lh){ base.kv[r.key] = rh; return; }
        if (bh !== undefined && lh !== bh) return;          // unsent local change wins
        out.kv[r.key] = r.value; base.kv[r.key] = rh; changed = true;
      });
      var cloudIds = {};
      mRows.forEach(function(r){
        base.mCur = later(base.mCur, r.updated_at);
        var id = Number(r.id);
        cloudIds[id] = true;
        var dead = r.deleted || !r.data;
        var rh = dead ? 'D' : hashMatch(r.data);
        var lh = lm[id] ? hashMatch(lm[id]) : 'D';
        var bh = base.m[id];
        if (rh === lh){ base.m[id] = rh; return; }
        if (bh !== undefined && lh !== bh) return;
        if (dead) out.deletes.push(id); else out.upserts.push(r.data);
        base.m[id] = rh; changed = true;
      });
      if (changed) self.adapter.applyRemote(out);
      self.saveBase();

      var localOnly = [];
      if (first && (kvRows.length || mRows.length)){
        Object.keys(lm).forEach(function(id){ if (!cloudIds[id]) localOnly.push(Number(id)); });
      }
      return {localOnly:localOnly};
    });
  };

  P.push = function(){
    var self = this, base = this.base;
    var local = this.adapter.getLocal();
    var lkv = local.kv || {};
    var kvRows = [], kvNext = {}, mRows = [], mNext = {};
    var keys = {};
    Object.keys(lkv).forEach(function(k){ keys[k] = true; });
    Object.keys(base.kv).forEach(function(k){ keys[k] = true; });
    Object.keys(keys).forEach(function(k){
      var has = Object.prototype.hasOwnProperty.call(lkv, k);
      var h = has ? hashKey(k, lkv[k]) : 'D';
      if (h === base.kv[k] || (h === 'D' && base.kv[k] === undefined)) return;
      kvRows.push({user_id:base.uid, key:k, value: has && lkv[k] !== undefined ? lkv[k] : null});
      kvNext[k] = h;
    });
    var seen = {};
    (local.matches || []).forEach(function(m){
      if (!m || m.id == null) return;
      seen[m.id] = true;
      var h = hashMatch(m);
      if (h === base.m[m.id]) return;
      mRows.push({user_id:base.uid, id:m.id, data:m, deleted:false});
      mNext[m.id] = h;
    });
    Object.keys(base.m).forEach(function(id){
      if (seen[id] || base.m[id] === 'D') return;
      mRows.push({user_id:base.uid, id:Number(id), data:null, deleted:true});
      mNext[id] = 'D';
    });
    if (!kvRows.length && !mRows.length) return Promise.resolve(false);
    this.status({phase:'syncing'});
    return Promise.all([
      mRows.length ? this.backend.upsert('smash_matches', mRows) : null,
      kvRows.length ? this.backend.upsert('smash_kv', kvRows) : null
    ]).then(function(){
      if (self.base !== base) return;
      Object.keys(kvNext).forEach(function(k){ base.kv[k] = kvNext[k]; });
      Object.keys(mNext).forEach(function(id){ base.m[id] = mNext[id]; });
      self.saveBase();
    });
  };

  window.SmashSync = SmashSync;
})();
