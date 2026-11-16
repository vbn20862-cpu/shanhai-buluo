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
  /* 音效：全部用程式合成（木頭敲擊、竹子、鈴），不用任何人聲或歌聲（布農族的 pasibutbut 是祈禱，不能做成音效），也不用「部落戰鼓」 */
  var sfxVol = 0.5, sfxGain = null, lastAt = {};
  function sfxOut() { if (!ctx) return null; if (!sfxGain) { sfxGain = ctx.createGain(); sfxGain.gain.value = sfxVol; sfxGain.connect(ctx.destination); } return sfxGain; }
  function tone(f, t0, dur, g, type, over) {   // 木琴般的一個音：基音加一個高泛音，很快衰減
    var o = ctx.createOscillator(), a = ctx.createGain(); o.type = type || 'sine'; o.frequency.value = f;
    a.gain.setValueAtTime(0.0001, t0); a.gain.exponentialRampToValueAtTime(g, t0 + 0.006); a.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(a); a.connect(sfxOut()); o.start(t0); o.stop(t0 + dur + 0.05);
    if (over) { var o2 = ctx.createOscillator(), b = ctx.createGain(); o2.frequency.value = f * over; b.gain.setValueAtTime(0.0001, t0); b.gain.exponentialRampToValueAtTime(g * 0.35, t0 + 0.004); b.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * 0.35); o2.connect(b); b.connect(sfxOut()); o2.start(t0); o2.stop(t0 + dur); }
  }
  var noiseBuf = null;
  function noise(t0, dur, g, f, q, sweep) {   // 一小段濾過的雜音：木頭的敲擊、揮動的風聲
    if (!noiseBuf) { noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate); var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    var n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), a = ctx.createGain(); n.buffer = noiseBuf; bp.type = 'bandpass'; bp.frequency.setValueAtTime(f, t0); bp.Q.value = q || 4;
    if (sweep) bp.frequency.exponentialRampToValueAtTime(sweep, t0 + dur);
    a.gain.setValueAtTime(0.0001, t0); a.gain.exponentialRampToValueAtTime(g, t0 + 0.005); a.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    n.connect(bp); bp.connect(a); a.connect(sfxOut()); n.start(t0); n.stop(t0 + dur + 0.02);
  }
  var NOTE = { C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880, C6: 1046.5, D6: 1174.7, E6: 1318.5, G4: 392, A4: 440, E4: 329.6, C4: 261.6, D4: 293.7 };
  var SFX = {
    tap: function (t) { noise(t, 0.05, 0.35, 1900, 6); tone(880, t, 0.06, 0.12); },                                   // 按鈕：小小的木頭聲
    open: function (t) { noise(t, 0.22, 0.12, 600, 1.2, 2200); },                                                        // 打開視窗：輕輕的一陣風
    reward: function (t) { ['C6', 'E6', 'G5', 'C6'].forEach(function (n, i) { tone(NOTE[n], t + i * 0.08, 0.7, 0.18, 'sine', 4); }); },   // 領獎勵：鈴聲
    build: function (t) { noise(t, 0.07, 0.5, 700, 3); tone(196, t, 0.12, 0.25); noise(t + 0.14, 0.07, 0.5, 760, 3); tone(208, t + 0.14, 0.12, 0.25); tone(NOTE.G5, t + 0.32, 0.5, 0.16, 'sine', 4); tone(NOTE.C6, t + 0.42, 0.7, 0.16, 'sine', 4); },   // 建築完成：敲兩下再上揚
    start: function (t) { noise(t, 0.06, 0.6, 520, 3); tone(150, t, 0.15, 0.3); noise(t + 0.18, 0.06, 0.6, 560, 3); tone(160, t + 0.18, 0.15, 0.3); noise(t + 0.3, 0.4, 0.15, 400, 1, 1800); },   // 對戰開始：兩下木頭聲
    clash: function (t) { noise(t, 0.05, 0.4, 2600 + Math.random() * 800, 5); tone(320 + Math.random() * 60, t, 0.05, 0.1, 'triangle'); },   // 交鋒：木棍相碰
    win: function (t) { ['C5', 'E5', 'G5', 'C6'].forEach(function (n, i) { tone(NOTE[n], t + i * 0.11, 0.9, 0.17, 'sine', 4); }); },   // 打贏或守住：明亮的和弦
    lose: function (t) { tone(NOTE.E4, t, 0.6, 0.18, 'sine', 3); tone(NOTE.D4, t + 0.22, 0.9, 0.16, 'sine', 3); },        // 沒贏：低低的兩個音
    err: function (t) { tone(180, t, 0.16, 0.18, 'triangle'); }                                                           // 不行：一聲悶響
  };
  function sfx(name) {
    if (!ctx || sfxVol <= 0 || ctx.state !== 'running' || !SFX[name]) return;
    var now = ctx.currentTime; if (lastAt[name] && now - lastAt[name] < (name === 'clash' ? 0.09 : 0.04)) return;   // 同一種聲音太密就略過
    lastAt[name] = now; try { SFX[name](now + 0.005); } catch (e) { /* 出不了聲就算了 */ }
  }
  window.Sfx = { play: sfx, setVolume: function (v) { sfxVol = Math.max(0, Math.min(1, +v || 0)); if (sfxGain) sfxGain.gain.value = sfxVol; } };
  window.Music = { play: play, setVolume: setVolume, state: function () { return { on: !!ctx, playing: cur && cur.name, vol: vol, ctx: ctx && ctx.state, loaded: Object.keys(bufs) }; } };
})();
