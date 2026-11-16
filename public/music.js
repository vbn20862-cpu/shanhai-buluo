/* 背景音樂：部落畫面與大地圖各一首，切換時淡入淡出。用 Web Audio 播，接縫才不會停頓。
 * 手機要先點一下畫面才能出聲（瀏覽器的規定）；切到別的 App 就暫停。音量存在這臺裝置（設定裡調）。
 * 單機預覽版沒有伺服器，音檔先包成 window.ShanhaiAudio（base64）；連線版從 audio/ 下載。
 * 出處：都是 OpenGameArt 上標明 CC0 的作品（不是任何一族的傳統音樂），見 docs/DESIGN.md「背景音樂」。 */
(function () {
  var Ctx = window.AudioContext || window.webkitAudioContext, ctx = null, master = null, bufs = {}, loading = {}, cur = null, want = null, vol = 0.5;
  var EMBED = window.ShanhaiAudio || null;
  function fmt() { try { var a = document.createElement('audio'); return a.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'm4a'; } catch (e) { return 'm4a'; } }
  function bytes(b64) { var s = atob(b64), u = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u.buffer; }
  function load(name, cb) {
    if (bufs[name]) return cb(bufs[name]);
    (loading[name] = loading[name] || []).push(cb); if (loading[name].length > 1) return;
    var done = function (ab) {
      var ok = function (buf) { bufs[name] = buf; var l = loading[name]; delete loading[name]; l.forEach(function (f) { f(buf); }); };
      var bad = function () { delete loading[name]; };   // 解不開就不播，遊戲照常
      try { var p = ctx.decodeAudioData(ab, ok, bad); if (p && p.catch) p.catch(bad); } catch (e) { bad(); }
    };
    var f = fmt();
    if (EMBED && EMBED[name]) { try { done(bytes(EMBED[name][f] || EMBED[name].ogg || EMBED[name].m4a)); } catch (e) { delete loading[name]; } return; }
    var x = new XMLHttpRequest(); x.open('GET', 'audio/' + name + '.' + f); x.responseType = 'arraybuffer';
    x.onload = function () { if (x.status === 200) done(x.response); else delete loading[name]; }; x.onerror = function () { delete loading[name]; }; x.send();
  }
  function start() {   // 第一次點畫面：建立播放器
    if (ctx || !Ctx) return;
    try { ctx = new Ctx(); master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination); } catch (e) { ctx = null; return; }
    if (want) play(want);
  }
  function play(name) {
    want = name;
    if (!ctx || vol <= 0) return;
    if (cur && cur.name === name) return;
    var old = cur; cur = { name: name };
    var me = cur;
    load(name, function (buf) {
      if (cur !== me) return;   // 載好之前又換了別首
      var src = ctx.createBufferSource(), g = ctx.createGain(), t = ctx.currentTime;
      src.buffer = buf; src.loop = true; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1, t + 1.5);
      src.connect(g); g.connect(master); src.start(); me.src = src; me.g = g;
    });
    if (old && old.g) { var t = ctx.currentTime; old.g.gain.cancelScheduledValues(t); old.g.gain.setValueAtTime(old.g.gain.value, t); old.g.gain.linearRampToValueAtTime(0, t + 1.2); var s = old.src; setTimeout(function () { try { s.stop(); } catch (e) { /* 已經停了 */ } }, 1400); }
  }
  function setVolume(v) {
    vol = Math.max(0, Math.min(1, +v || 0));
    if (master) master.gain.value = vol;
    if (vol > 0 && want && (!cur || cur.name !== want)) play(want);
    if (ctx && vol > 0 && ctx.state === 'suspended' && !document.hidden) ctx.resume();
  }
  ['pointerdown', 'keydown'].forEach(function (ev) { document.addEventListener(ev, function () { start(); if (ctx && ctx.state === 'suspended' && !document.hidden) ctx.resume(); }, true); });
  document.addEventListener('visibilitychange', function () { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (vol > 0) ctx.resume(); });
  window.Music = { play: play, setVolume: setVolume, state: function () { return { on: !!ctx, playing: cur && cur.name, vol: vol, ctx: ctx && ctx.state, loaded: Object.keys(bufs) }; } };
})();
