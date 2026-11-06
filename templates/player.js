(function () {
  'use strict';
  var ARTIST = '日本之旅';

  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    var r = s % 60;
    return Math.floor(s / 60) + ':' + (r < 10 ? '0' : '') + r;
  }

  function init(root) {
    var tracks;
    try { tracks = JSON.parse(root.getAttribute('data-tracks')); } catch (e) { return; }
    if (!tracks || !tracks.length) return;

    var audio = root.querySelector('audio');
    var playBtn = root.querySelector('[data-play]');
    var label = root.querySelector('[data-label]');
    var scrub = root.querySelector('[data-scrub]');
    var cur = root.querySelector('[data-cur]');
    var tot = root.querySelector('[data-tot]');
    var err = root.querySelector('[data-error]');
    var now = document.querySelector('[data-now]');
    var rows = document.querySelectorAll('[data-chapter]');
    var idx = 0;
    var loading = false;

    function setLabel(text) {
      label.textContent = text;
      playBtn.setAttribute('aria-label', text);
    }

    function setLoading(on) {
      loading = on;
      if (on) {
        playBtn.setAttribute('aria-busy', 'true');
        setLabel('载入中');
      } else {
        playBtn.removeAttribute('aria-busy');
        setLabel(audio.paused ? '播放' : '暂停');
      }
    }

    function setState() {
      var playing = !audio.paused;
      playBtn.setAttribute('data-state', playing ? 'playing' : 'paused');
      if (!loading) setLabel(playing ? '暂停' : '播放');
    }

    function paint() {
      var d = audio.duration;
      if (!isFinite(d) || d <= 0) d = tracks[idx].dur || 0;
      var t = audio.currentTime || 0;
      scrub.max = d;
      scrub.value = t;
      scrub.style.setProperty('--p', (d ? Math.min(100, (t / d) * 100) : 0) + '%');
      cur.textContent = fmt(t);
      tot.textContent = fmt(d);
    }

    function meta() {
      if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
      navigator.mediaSession.metadata = new MediaMetadata({ title: tracks[idx].title, artist: ARTIST });
    }

    function mark() {
      if (now) now.textContent = tracks[idx].title;
      for (var i = 0; i < rows.length; i++) {
        var on = i === idx;
        rows[i].classList.toggle('is-current', on);
        if (on) rows[i].setAttribute('aria-current', 'true');
        else rows[i].removeAttribute('aria-current');
      }
    }

    function fail() {
      setLoading(false);
      setState();
      if (err) err.hidden = false;
      var all = document.querySelectorAll('details[data-more]');
      for (var i = 0; i < all.length; i++) all[i].open = true;
    }

    function select(i, autoplay) {
      idx = i;
      audio.src = tracks[i].src;
      audio.load();
      if (err) err.hidden = true;
      mark();
      meta();
      setState();
      paint();
      if (autoplay) play();
    }

    function play() {
      if (err) err.hidden = true;
      if (audio.readyState < 3) setLoading(true);
      var p = audio.play();
      if (p && p.catch) {
        p.catch(function (e) {
          if (e && e.name === 'AbortError') return;
          fail();
        });
      }
      meta();
    }

    function toggle() {
      if (audio.paused) play(); else audio.pause();
    }

    function skip(sec) {
      var d = audio.duration;
      var t = (audio.currentTime || 0) + sec;
      if (t < 0) t = 0;
      if (isFinite(d) && t > d) t = d;
      audio.currentTime = t;
      paint();
    }

    playBtn.addEventListener('click', toggle);
    var skips = root.querySelectorAll('[data-skip]');
    for (var s = 0; s < skips.length; s++) {
      (function (b) {
        b.addEventListener('click', function () { skip(parseFloat(b.getAttribute('data-skip'))); });
      })(skips[s]);
    }
    scrub.addEventListener('input', function () {
      audio.currentTime = parseFloat(scrub.value) || 0;
      paint();
    });
    for (var r = 0; r < rows.length; r++) {
      (function (row, i) {
        row.addEventListener('click', function () {
          if (i === idx) toggle(); else select(i, true);
        });
      })(rows[r], r);
    }

    audio.addEventListener('canplay', function () { if (loading) setLoading(false); setState(); });
    audio.addEventListener('playing', function () { setLoading(false); setState(); });
    audio.addEventListener('waiting', function () { if (!audio.paused) setLoading(true); });
    audio.addEventListener('pause', function () { setLoading(false); setState(); });
    audio.addEventListener('timeupdate', paint);
    audio.addEventListener('loadedmetadata', paint);
    audio.addEventListener('durationchange', paint);
    audio.addEventListener('error', fail);
    audio.addEventListener('ended', function () {
      if (idx + 1 < tracks.length) {
        select(idx + 1, true);
      } else {
        audio.currentTime = 0;
        setState();
        paint();
      }
    });

    if ('mediaSession' in navigator) {
      var handlers = {
        play: play,
        pause: function () { audio.pause(); },
        seekbackward: function () { skip(-15); },
        seekforward: function () { skip(15); },
        previoustrack: tracks.length > 1 ? function () { if (idx > 0) select(idx - 1, true); } : null,
        nexttrack: tracks.length > 1 ? function () { if (idx + 1 < tracks.length) select(idx + 1, true); } : null
      };
      for (var k in handlers) {
        try { navigator.mediaSession.setActionHandler(k, handlers[k]); } catch (e) { /* unsupported action */ }
      }
    }

    mark();
    meta();
    setState();
    paint();
  }

  var players = document.querySelectorAll('[data-player]');
  for (var i = 0; i < players.length; i++) init(players[i]);
})();
