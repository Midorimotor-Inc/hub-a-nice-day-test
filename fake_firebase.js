// 検査用の「にせの firebase」（compat API のうち、アプリが使う部分だけ）。本物には繋がない。
//   fb_mode_test.js / fb_auth_test.js がブラウザに差し込む。中身は localStorage に置くので、
//   ページを開き直しても（index → mobile → admin と移っても）同じ「サーバー」に見える。
//   window.__fakeFb で検査側から読み書きできる。
(function(){
  const LS_STORE = '__fakeFbStore', LS_USER = '__fakeFbUser';
  // 本物の Firebase はサインインを「住所＋アプリ名」ごとに保つ。2026-10-07 にテスト版と本番で
  //   アプリ名を分けたので、その様子（片方を切ってもう片方は無事）も確かめられるようにする。
  //   ただし控えの名前を常に分けると今までの検査（__fakeFbUser を先に書いておく作り）が通らなくなるので、
  //   __fakeFbIsolate を立てた検査（auth_crossenv_test.js）の時だけ名前を分ける。
  let mainAppName = '';
  const ISO = (() => { try { return !!window.__fakeFbIsolate; } catch (e) { return false; } })();
  const userKey = () => LS_USER + ((ISO && mainAppName) ? '-' + mainAppName : '');
  const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const store = load(LS_STORE, {});           // { 'col/id': {fields} }
  const save = () => { try { localStorage.setItem(LS_STORE, JSON.stringify(store)); } catch (e) {} };
  const listeners = new Map();                // 'col/id' -> Set(fn)
  const stats = { writes: 0, txns: 0, reads: 0 };
  const key = (col, id) => col + '/' + id;
  const snapOf = (col, id) => ({ id, exists: key(col, id) in store, data: () => store[key(col, id)], metadata: { fromCache: false, hasPendingWrites: false } });
  const notify = (col, id) => (listeners.get(key(col, id)) || new Set()).forEach(fn => setTimeout(() => fn(snapOf(col, id)), 0));
  const deepMerge = (a, b) => { const o = Object.assign({}, a); for (const k in b) { const v = b[k]; if (v && v.__delete) delete o[k]; else if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = deepMerge(o[k], v); else o[k] = v; } return o; };
  const wlog = load('__fakeFbWlog', []);
  const writeDoc = (col, id, d, opts) => {
    stats.writes++; wlog.push({ col, id, t: Date.now(), merge: !!(opts && opts.merge), v: (d && typeof d.v === 'string') ? d.v.slice(0, 160) : undefined }); try { localStorage.setItem('__fakeFbWlog', JSON.stringify(wlog.slice(-300))); } catch (e) {}
    const cur = store[key(col, id)];
    store[key(col, id)] = (opts && opts.merge && cur) ? deepMerge(cur, d) : deepMerge({}, d);
    save(); notify(col, id);
  };
  // 権限：許可簿に載っていない人の kv 読み書きは拒否（本物のルールの要点だけ真似る）
  const denied = () => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  const allowedOf = () => (store['meta/allowed'] || {});
  const ekey = e => String(e || '').trim().toLowerCase().replace(/\./g, ',');
  const makeDb = auth => {
  const isAllowed = () => { const u = auth._user; if (!u) return false; const a = allowedOf()[ekey(u.email)]; return !!(a && a.active !== false); };
  const isAdmin = () => { const u = auth._user; if (!u) return false; const a = allowedOf()[ekey(u.email)]; return !!(a && a.active !== false && a.role === 'admin'); };
  const own = id => !!(auth._user && auth._user.uid === id);
  const canRead = (col, id) => col === 'handoff' || (col === 'users' && (own(id) || isAdmin())) || (col === 'kv' && (id.indexOf('hub-v8-dev-') === 0 || isAllowed())) || (col !== 'kv' && col !== 'users' && isAllowed());
  const canWrite = (col, id) => (col === 'users' && own(id)) || (col === 'handoff' && isAllowed()) || (col === 'kv' && (id.indexOf('hub-v8-dev-') === 0 || isAllowed())) || (col === 'meta' && isAdmin()) || (col === 'devices' && isAllowed()) || (col.indexOf('snap') === 0 && isAllowed());
  const doc = (col, id) => ({
    id, __col: col, __id: id,
    get: async () => { stats.reads++; if (!canRead(col, id)) throw denied(); return snapOf(col, id); },
    set: async (d, opts) => { if (!canWrite(col, id)) throw denied(); writeDoc(col, id, d, opts); },
    delete: async () => { if (!(col === 'devices' ? isAdmin() : canWrite(col, id))) throw denied(); delete store[key(col, id)]; save(); notify(col, id); },
    collection: sub => collection(col + '/' + id + '/' + sub),   // サブコレクション（snaps/{id}/kv）
    onSnapshot: (opts, next, err) => {
      if (typeof opts === 'function') { err = next; next = opts; }
      if (!canRead(col, id)) { setTimeout(() => err && err(denied()), 0); return () => {}; }
      const s = listeners.get(key(col, id)) || new Set(); s.add(next); listeners.set(key(col, id), s);
      setTimeout(() => next(snapOf(col, id)), 0);
      return () => s.delete(next);
    },
  });
  const runQuery = (col, conds) => {
    if (!(col === 'users' ? isAdmin() : (col === 'kv' ? isAllowed() : isAllowed()))) throw denied();
    const rows = Object.keys(store).filter(k => k.indexOf(col + '/') === 0 && k.slice(col.length + 1).indexOf('/') < 0 && store[k]).map(k => ({ id: k.slice(col.length + 1), data: () => store[k], ref: doc(col, k.slice(col.length + 1)) }))
      .filter(r => conds.every(([f, op, v]) => { const x = f === '__id__' ? r.id : (store[key(col, r.id)] || {})[f]; return op === '==' ? x === v : op === '>=' ? x >= v : op === '<' ? x < v : op === '<=' ? x <= v : op === '>' ? x > v : true; }));
    return { forEach: fn => rows.forEach(fn), size: rows.length, docs: rows };
  };
  const query = (col, conds) => ({ where: (f, op, v) => query(col, conds.concat([[f, op, v]])), get: async () => runQuery(col, conds) });
  const collection = col => ({ doc: id => doc(col, id), where: (f, op, v) => query(col, [[f, op, v]]), get: async () => runQuery(col, []) });
  return {
    collection,
    batch: () => { const ops = []; const b = { set: (ref, d, opts) => { ops.push(() => { if (!canWrite(ref.__col, ref.__id)) throw denied(); writeDoc(ref.__col, ref.__id, d, opts); }); return b; }, delete: ref => { ops.push(() => { if (!canWrite(ref.__col, ref.__id)) throw denied(); delete store[key(ref.__col, ref.__id)]; save(); notify(ref.__col, ref.__id); }); return b; }, commit: async () => { ops.forEach(f => f()); } }; return b; },
    runTransaction: async fn => {
      stats.txns++;
      const t = { get: async ref => { stats.reads++; if (!canRead(ref.__col, ref.__id)) throw denied(); return snapOf(ref.__col, ref.__id); },
                  set: (ref, d, opts) => { if (!canWrite(ref.__col, ref.__id)) throw denied(); writeDoc(ref.__col, ref.__id, d, opts); } };
      return fn(t);
    },
  }; };
  // ── Authentication ──
  const uidOf = email => 'uid_' + email.replace(/[^a-z0-9]/gi, '_');
  const makeAuth = persist => {
    const auth = {
      languageCode: '', _user: null, _listeners: [],
      get currentUser() { return this._user; },
      _set(u) { this._user = u ? Object.assign({}, u, { updatePassword: async pw => { store['__pw/' + u.email] = { pw }; save(); } }) : null;
        if (persist) { try { if (u) localStorage.setItem(userKey(), JSON.stringify(u)); else localStorage.removeItem(userKey()); } catch (e) {} }
        this._listeners.forEach(cb => { try { cb(this._user); } catch (e) {} }); },
      onAuthStateChanged(cb) { this._listeners.push(cb); setTimeout(() => cb(this._user), 30); return () => {}; },
      isSignInWithEmailLink: href => /[?&]oobCode=/.test(String(href)),
      sendSignInLinkToEmail: async (email, s) => { if (email.indexOf('@') < 1) throw Object.assign(new Error('bad'), { code: 'auth/invalid-email' }); const sent = load('__fakeFbSent', []); sent.push({ email, url: s.url }); try { localStorage.setItem('__fakeFbSent', JSON.stringify(sent)); } catch (e) {} },
      signInWithEmailLink: async (email, href) => {
        const code = new URL(href).searchParams.get('oobCode');
        if (code !== 'good') throw Object.assign(new Error('bad code'), { code: 'auth/invalid-action-code' });
        if (!store['__acct/' + email]) { store['__acct/' + email] = { at: Date.now() }; save(); }
        auth._set({ email, uid: uidOf(email) });
      },
      createUserWithEmailAndPassword: async (email, pw) => {
        if (store['__acct/' + email]) throw Object.assign(new Error('exists'), { code: 'auth/email-already-in-use' });
        store['__acct/' + email] = { at: Date.now() }; store['__pw/' + email] = { pw }; save();
        auth._set({ email, uid: uidOf(email) });
        return { user: auth._user };
      },
      signInWithEmailAndPassword: async (email, pw) => {
        const rec = store['__pw/' + email];
        if (!rec || rec.pw !== pw) throw Object.assign(new Error('wrong'), { code: 'auth/wrong-password' });
        auth._set({ email, uid: uidOf(email) });
        return { user: auth._user };
      },
      signOut: async () => { auth._set(null); },
    };
    return auth;
  };
  const auth = makeAuth(true);
  auth._set(load(userKey(), null)); auth._listeners = [];
  const db = makeDb(auth);
  const apps = {};   // 名前付きの別インスタンス（招待用）
  window.__fakeFb = {
    set: (id, v, col) => writeDoc(col || 'kv', id, col && col !== 'kv' ? v : { v: JSON.stringify(v), u: Date.now() }),
    get: (id, col) => { const d = store[key(col || 'kv', id)]; if (!d) return null; return (col && col !== 'kv') ? d : JSON.parse(d.v); },
    del: (id, col) => { delete store[key(col || 'kv', id)]; save(); notify(col || 'kv', id); },
    docs: col => Object.keys(store).filter(k => k.indexOf(col + '/') === 0).map(k => ({ id: k.slice(col.length + 1), data: store[k] })),
    // 検査用：保存してある値は変えずに、購読中の画面へ「こういう値が届いた」だけを流す。
    //   meta:{fromCache:true} で「回線が不安定な時の古い写し」を、既定（サーバー由来）で「本当に減った値」を再現する。
    emit: (id, v, meta) => {
      const k = key('kv', id);
      const snap = { id, exists: true, data: () => ({ v: JSON.stringify(v), u: Date.now() }),
        metadata: Object.assign({ fromCache: false, hasPendingWrites: false }, meta || {}) };
      (listeners.get(k) || new Set()).forEach(fn => setTimeout(() => fn(snap), 0));
    },
    // 検査用：購読中の画面に知らせずに保存だけ変える（＝画面の手元とサーバーがずれた状態を作る）
    setQuiet: (id, v) => { store[key('kv', id)] = { v: JSON.stringify(v), u: Date.now() }; save(); },
    sent: () => load('__fakeFbSent', []),
    user: () => auth._user ? { email: auth._user.email, uid: auth._user.uid } : null,
    signInAs: email => { if (!store['__acct/' + email]) { store['__acct/' + email] = { at: Date.now() }; save(); } auth._set({ email, uid: uidOf(email) }); },
    pwOf: email => (store['__pw/' + email] || {}).pw || '',
    setAccount: (email, pw) => { store['__acct/' + email] = { at: Date.now() }; if (pw) store['__pw/' + email] = { pw }; save(); },
    stats: () => Object.assign({}, stats),
    writes: () => wlog.slice(),
    reset: () => { try { localStorage.removeItem(LS_STORE); localStorage.removeItem('__fakeFbSent');
      Object.keys(localStorage).forEach(k => { if (k.indexOf(LS_USER) === 0) localStorage.removeItem(k); }); } catch (e) {} },
    // 検査用：どの名前で Firebase に繋いだか（テスト版は hub-dev、本番は [DEFAULT]）
    inits: () => { try { return (window.__fakeFbInits || []).slice(); } catch (e) { return []; } },
  };
  const FieldValue = { serverTimestamp: () => 'ts', delete: () => ({ __delete: true }) };
  const FieldPath = { documentId: () => '__id__' };
  // 本物と同じく「名前ごとに別インスタンス」。ただし画面が使う本体の名前（テスト版は hub-dev）は
  //   本体のサインイン・保存をそのまま使う。別にするのは招待用（hub-invite…）だけ。
  //   2026-10-07：テスト版と本番でサインインを分けたので、画面は名前付きで初期化するようになった。
  const mainApp = { name: '[DEFAULT]', auth: () => auth, firestore: () => db };
  const isInvite = (name) => String(name || '').indexOf('hub-invite') === 0;
  window.firebase = {
    apps: [],
    initializeApp(cfg, name) {
      try { if (isInvite(name)) (window.__fakeFbInits = window.__fakeFbInits || []).push(name); } catch (e) {}
      if (isInvite(name)) { const a2 = makeAuth(false); const app = { name, auth: () => a2, firestore: () => makeDb(a2) }; apps[name] = app; return app; }
      try { (window.__fakeFbInits = window.__fakeFbInits || []).push(name || '[DEFAULT]'); } catch (e) {}
      if (String(name || '') !== mainAppName) { mainAppName = String(name || ''); if (ISO) auth._set(load(userKey(), null)); }
      this.apps.push({}); if (name) { apps[name] = mainApp; return mainApp; } return {};
    },
    app(name) {
      if (!name) { if (!this.apps.length) throw Object.assign(new Error('no app'), { code: 'app/no-app' }); return mainApp; }
      if (apps[name]) return apps[name];
      throw Object.assign(new Error('no app ' + name), { code: 'app/no-app' });
    },
    firestore: Object.assign(() => db, { FieldValue, FieldPath }),
    auth: () => auth,
  };
})();
