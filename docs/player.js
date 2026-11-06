/*
 * Story player. The "Aura" visualizer below is a plain-WebGL1 port of the shader and motion values in
 * LiveKit Agents UI (agent-audio-visualizer-aura), Apache-2.0, https://github.com/livekit/components-js
 * Changes: no React/motion libraries; loudness comes from the build-time timing file (docs/a/*.json "env"),
 * never from Web Audio, so iPhone lock-screen playback is untouched.
 */
(function () {
  'use strict';
  var ARTIST = '日本之旅';

  function fmt(s) {
    if (!isFinite(s) || s < 0) s = 0;
    s = Math.floor(s);
    var r = s % 60;
    return Math.floor(s / 60) + ':' + (r < 10 ? '0' : '') + r;
  }


  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.0,1.0);}';
  var FRAG = [
    'uniform vec2 iResolution;uniform float iTime;',
    'uniform float uSpeed,uBlur,uScale,uShape,uFrequency,uAmplitude,uBloom,uMix,uSpacing,uColorShift,uVariance,uSmoothing,uMode;',
    'uniform vec3 uColor;',
    'const float TAU=6.283185;',
    'vec2 randFibo(vec2 p){p=fract(p*vec2(443.897,441.423));p+=dot(p,p.yx+19.19);return fract((p.xx+p.yx)*p.xy);}',
    'vec3 Tonemap(vec3 x){x*=4.0;return x/(1.0+x);}',
    'float luma(vec3 c){return dot(c,vec3(0.299,0.587,0.114));}',
    'vec3 rgb2hsv(vec3 c){vec4 K=vec4(0.0,-1.0/3.0,2.0/3.0,-1.0);vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g));vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r));float d=q.x-min(q.w,q.y);float e=1.0e-10;return vec3(abs(q.z+(q.w-q.y)/(6.0*d+e)),d/(q.x+e),q.x);}',
    'vec3 hsv2rgb(vec3 c){vec4 K=vec4(1.0,2.0/3.0,1.0/3.0,3.0);vec3 p=abs(fract(c.xxx+K.xyz)*6.0-K.www);return c.z*mix(K.xxx,clamp(p-K.xxx,0.0,1.0),c.y);}',
    'float sdCircle(vec2 st,float r){return length(st)-r;}',
    'float sdLine(vec2 p,float r){float h2=r*2.0;vec2 a=vec2(-h2,0.0);vec2 b=vec2(h2,0.0);vec2 pa=p-a;vec2 ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0);return length(pa-ba*h);}',
    'float getSdf(vec2 st){if(uShape==1.0)return sdCircle(st,uScale);else if(uShape==2.0)return sdLine(st,uScale);return sdCircle(st,uScale);}',
    'vec2 turb(vec2 pos,float t,float it){',
    ' mat2 rotation=mat2(0.6,-0.25,0.25,0.9);mat2 layerRotation=mat2(0.6,-0.8,0.8,0.6);',
    ' float frequency=mix(2.0,15.0,uFrequency);float amplitude=uAmplitude;float frequencyGrowth=1.4;float animTime=t*0.1*uSpeed;',
    ' for(int i=0;i<4;i++){vec2 rotatedPos=pos*rotation;vec2 wave=sin(frequency*rotatedPos+float(i)*animTime+it);',
    '  pos+=(amplitude/frequency)*rotation[0]*wave;rotation*=layerRotation;amplitude*=mix(1.0,max(wave.x,wave.y),uVariance);frequency*=frequencyGrowth;}',
    ' return pos;}',
    'const float ITERATIONS=36.0;',
    'void mainImage(out vec4 fragColor,in vec2 fragCoord){',
    ' vec2 uv=fragCoord/iResolution.xy;vec3 pp=vec3(0.0);vec3 bloom=vec3(0.0);float t=iTime*0.5;vec2 pos=uv-0.5;',
    ' vec2 prevPos=turb(pos,t,0.0-1.0/ITERATIONS);float spacing=mix(1.0,TAU,uSpacing);',
    ' for(float i=1.0;i<ITERATIONS+1.0;i++){',
    '  float iter=i/ITERATIONS;vec2 st=turb(pos,t,iter*spacing);float d=abs(getSdf(st));float pd=distance(st,prevPos);prevPos=st;',
    '  float dynamicBlur=exp2(pd*2.0*1.4426950408889634)-1.0;',
    '  float ds=smoothstep(0.0,uBlur*0.05+max(dynamicBlur*uSmoothing,0.001),d);',
    '  vec3 color=uColor;',
    '  if(uColorShift>0.01){vec3 hsv=rgb2hsv(color);hsv.x=fract(hsv.x+(1.0-iter)*uColorShift*0.3);color=hsv2rgb(hsv);}',
    '  float invd=1.0/max(d+dynamicBlur,0.001);pp+=(ds-1.0)*color;bloom+=clamp(invd,0.0,250.0)*color;}',
    ' pp*=1.0/ITERATIONS;vec3 color;',
    ' if(uMode<0.5){bloom=bloom/(bloom+2e4);color=(-pp+bloom*3.0*uBloom)*1.2;color+=(randFibo(fragCoord).x-0.5)/255.0;color=Tonemap(color);float alpha=luma(color)*uMix;fragColor=vec4(color*uMix,alpha);}',
    ' else{color=-pp;color+=(randFibo(fragCoord).x-0.5)/255.0;float brightness=length(color);vec3 direction=brightness>0.0?color/brightness:color;',
    '  float factor=2.0;float mapped=(brightness*factor)/(1.0+brightness*factor);color=direction*mapped;',
    '  float gray=dot(color,vec3(0.2,0.5,0.1));color=mix(vec3(gray),color,3.0);color=clamp(color,0.0,1.0);',
    '  float alpha=mapped*clamp(uMix,1.0,2.0)*smoothstep(0.0,0.03,mapped);fragColor=vec4(color,alpha);}}',
    'void main(void){vec4 color=vec4(0.0,0.0,0.0,1.0);mainImage(color,gl_FragCoord.xy);gl_FragColor=color;}'
  ].join('\n');

  // Motion values from use-agent-audio-visualizer-aura: idle speed 15 / scale 0.15, speaking speed 60 /
  // scale 0.12 + 0.1 * loudness, amplitude 1.5, frequency 0.7, brightness 1.6; blur 0.2, colorShift 0.05.
  function Aura(canvas) {
    var self = this;
    this.canvas = canvas;
    this.ok = false;
    this.k = 0;        // 0 idle .. 1 speaking, eased
    this.loud = 0;     // smoothed loudness 0..1
    this.phase = 0;    // shader time, advanced by speed so a speed change never jumps
    this.clock = 0;
    this.dark = false;
    this.rgb = [0.75, 0.23, 0.14];
    var gl = null;
    try { gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) return;
    function sh(type, src) {
      var o = gl.createShader(type);
      gl.shaderSource(o, src);
      gl.compileShader(o);
      return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null;
    }
    var prec = 'precision highp float;\n';
    try {
      var pf = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      if (!pf || pf.precision === 0) prec = 'precision mediump float;\n';
    } catch (e) { /* keep highp */ }
    var vs = sh(gl.VERTEX_SHADER, VERT);
    var fs = sh(gl.FRAGMENT_SHADER, prec + FRAG);
    if (!vs || !fs) return;
    var prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);
    var buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    var u = {};
    ['iResolution', 'iTime', 'uSpeed', 'uBlur', 'uScale', 'uShape', 'uFrequency', 'uAmplitude', 'uBloom', 'uMix',
      'uSpacing', 'uColorShift', 'uVariance', 'uSmoothing', 'uMode', 'uColor'].forEach(function (n) {
      u[n] = gl.getUniformLocation(prog, n);
    });
    gl.uniform1f(u.uSpeed, 1);
    gl.uniform1f(u.uBlur, 0.2);
    gl.uniform1f(u.uShape, 1);
    gl.uniform1f(u.uFrequency, 0.7);
    gl.uniform1f(u.uAmplitude, 1.5);
    gl.uniform1f(u.uBloom, 0);
    gl.uniform1f(u.uMix, 1.6);
    gl.uniform1f(u.uSpacing, 0.5);
    gl.uniform1f(u.uColorShift, 0.05);
    gl.uniform1f(u.uVariance, 0.1);
    gl.uniform1f(u.uSmoothing, 1);
    this.gl = gl;
    this.u = u;
    this.frames = 0;
    this.ok = true;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); self.ok = false; if (self.onlost) self.onlost(); });
  }

  Aura.prototype.look = function () {
    // colour from the --aura token; light/dark branch from the page theme
    var c = getComputedStyle(this.canvas).color.match(/[\d.]+/g);
    if (c && c.length >= 3) this.rgb = [c[0] / 255, c[1] / 255, c[2] / 255];
    var de = document.documentElement;
    var t = de.getAttribute('data-theme');
    this.dark = t === 'dark' || (t !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  };

  Aura.prototype.size = function () {
    var r = Math.min(window.devicePixelRatio || 1, 1.5);
    var w = Math.max(1, Math.round(this.canvas.clientWidth * r));
    var h = Math.max(1, Math.round(this.canvas.clientHeight * r));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
  };

  // dt seconds, speaking 0/1, loudness 0..1. still: draw one fixed idle frame.
  Aura.prototype.frame = function (dt, speaking, loud, still) {
    if (!this.ok) return;
    var gl = this.gl, u = this.u;
    if (still) {
      this.k = 0; this.loud = 0; this.phase = 3;
    } else {
      this.k += (speaking - this.k) * (1 - Math.exp(-dt / 0.18));   // eases out over about 0.5 s
      this.loud += (loud - this.loud) * (1 - Math.exp(-dt / 0.06));
      this.clock += dt;
      this.phase += dt * (15 + 45 * this.k);
    }
    var idle = 0.15 + (still ? 0 : 0.012 * Math.sin(this.clock * 1.6));
    var talk = 0.12 + 0.1 * this.loud;
    var scale = idle + (talk - idle) * this.k;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.uniform2f(u.iResolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.iTime, this.phase);
    gl.uniform1f(u.uScale, scale);
    gl.uniform1f(u.uMode, this.dark ? 0 : 1);
    gl.uniform3f(u.uColor, this.rgb[0], this.rgb[1], this.rgb[2]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    this.frames++;
    this.canvas.__frames = this.frames;
    this.lastScale = scale;
  };

  function b64bytes(b) {
    var bin = atob(b), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return a;
  }

  // last cue whose t0 <= t; -1 before the first
  function cueIndex(cues, t) {
    var lo = 0, hi = cues.length - 1, r = -1;
    while (lo <= hi) {
      var m = (lo + hi) >> 1;
      if (cues[m].t0 <= t) { r = m; lo = m + 1; } else hi = m - 1;
    }
    return r;
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

    var stage = root.querySelector('[data-stage]');
    var canvas = root.querySelector('[data-aura]');
    var glow = root.querySelector('[data-glow]');
    var sub = root.querySelector('[data-sub]');
    var subPrev = root.querySelector('[data-sub-prev]');
    var subCur = root.querySelector('[data-sub-cur]');
    var rmq = window.matchMedia('(prefers-reduced-motion: reduce)');
    var timing = null;      // {cues, env} for the current track, or null (no json: plain player)
    var shown = -2;         // cue index on screen
    var ended = false;
    var aura = null;
    var raf = 0, lastT = 0, lastDraw = 0, onscreen = true;

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

    function select(i, autoplay, natural) {
      idx = i;
      ended = false;
      if (stage) loadTiming(i);
      audio.src = tracks[i].src;
      audio.load();
      if (err) err.hidden = true;
      mark();
      meta();
      setState();
      paint();
      syncSlides(!!natural);
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
      ended = false;
      audio.currentTime = t;
      paint();
      syncSlides(false);
    }


    // ---- Aura + subtitle (all optional: with no timing json the player is exactly the plain one) ----
    function auraOff() {
      timing = null;
      stage.classList.add('no-aura');
      sub.classList.add('no-sub');
      if (screenEl && screenEl.classList.contains('no-slides')) screenEl.hidden = true;
    }

    function setCue(i, animate) {
      var cues = timing.cues;
      var idle = audio.paused && !ended && (audio.currentTime || 0) < 0.05;
      if (i < 0) i = 0;
      if (i === shown && subCur.classList.contains('is-idle') === idle) return;
      var forward = i === shown + 1;
      shown = i;
      subCur.textContent = cues[i].text;
      subPrev.textContent = i > 0 && !idle ? cues[i - 1].text : '';
      subCur.classList.toggle('is-idle', idle);
      if (animate && forward && !rmq.matches && subCur.animate) {
        var ease = { duration: 200, easing: 'ease-out' };
        subCur.animate([{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], ease);
        subPrev.animate([{ opacity: 0.3, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], ease);
      }
    }

    function syncSub(animate) {
      if (!timing) return;
      if (ended) { setCue(timing.cues.length - 1, false); return; }
      setCue(cueIndex(timing.cues, audio.currentTime || 0), animate && !audio.seeking);
    }

    function loudAt(t) {
      if (!timing || !timing.env.length) return 0;
      var i = Math.floor(t * 20);
      if (i < 0) i = 0;
      if (i >= timing.env.length) i = timing.env.length - 1;
      return timing.env[i] / 255;
    }

    function speaking() { return !audio.paused && !audio.ended && !loading ? 1 : 0; }

    function drawGlow() {
      if (!glow || glow.hidden) return;
      var k = rmq.matches ? 0 : aura ? aura.loud * speaking() : 0;
      glow.style.transform = 'scale(' + (0.9 + 0.5 * k).toFixed(3) + ')';
    }

    function tick(now) {
      raf = 0;
      if (!timing) return;
      var dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.016;
      var talking = speaking();
      var gap = talking ? 33 : 66;                       // about 30 fps playing, 15 fps idle
      if (now - lastDraw >= gap) {
        lastT = now; lastDraw = now;
        aura.frame(dt, talking, talking ? loudAt(audio.currentTime || 0) : 0, false);
        drawGlow();
        if (talking) { syncSub(true); syncSlides(true); }
      }
      schedule();
    }

    function schedule() {
      if (raf || !timing || rmq.matches || !onscreen || document.hidden) return;
      raf = requestAnimationFrame(tick);
    }

    function still() {
      // reduced motion: one still frame, no loop
      if (aura && aura.ok) { aura.size(); aura.look(); aura.frame(0, 0, 0, true); }
      drawGlow();
    }

    function startAura(data) {
      timing = { cues: data.cues, env: b64bytes(data.env || '') };
      shown = -2;
      stage.classList.remove('no-aura');
      sub.classList.remove('no-sub');
      if (!aura) {
        aura = new Aura(canvas);
        aura.onlost = function () { canvas.hidden = true; glow.hidden = false; drawGlow(); };
        if (!aura.ok) { canvas.hidden = true; glow.hidden = false; }
      }
      if (aura.ok) { aura.size(); aura.look(); }
      syncSub(false);
      if (rmq.matches) still(); else { lastT = 0; schedule(); }
    }

    function loadTiming(i) {
      var url = tracks[i].src.replace(/\.mp3$/, '.json');
      timing = null;
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error('no timing');
        return r.json();
      }).then(function (data) {
        if (i !== idx) return;
        if (!data || data.v !== 1 || !data.cues || !data.cues.length) throw new Error('bad timing');
        startAura(data);
      }).catch(function () { if (i === idx) auraOff(); });
    }

    if (stage && canvas && sub && window.fetch) {
      var resize = function () { if (aura && aura.ok) { aura.size(); aura.look(); if (rmq.matches) still(); } };
      window.addEventListener('resize', resize);
      var mqd = window.matchMedia('(prefers-color-scheme: dark)');
      if (mqd.addEventListener) mqd.addEventListener('change', resize);
      var onrm = function () { if (rmq.matches) { still(); } else { lastT = 0; schedule(); } };
      if (rmq.addEventListener) rmq.addEventListener('change', onrm);
      document.addEventListener('visibilitychange', function () { if (!document.hidden) { syncSub(false); lastT = 0; schedule(); } });
      if ('IntersectionObserver' in window) {
        new IntersectionObserver(function (es) { onscreen = es[0].isIntersecting; schedule(); }).observe(stage);
      }
      ['seeked', 'timeupdate'].forEach(function (ev) {
        audio.addEventListener(ev, function () { syncSub(ev === 'timeupdate'); });
      });
      audio.addEventListener('playing', function () { ended = false; syncSub(false); schedule(); });
      audio.addEventListener('pause', function () { syncSub(false); });
      audio.addEventListener('ended', function () { if (idx + 1 >= tracks.length) { ended = true; syncSub(false); } });
    } else {
      stage = null;
    }


    // ---- Slides: a projector screen above the deck (all optional: no manifest = today's layout) ----
    // Time-based: N slides share the page's whole timeline equally. Ken Burns uses the Web Animations API
    // (transform only, compositor), driven by the same audio clock. Never any Web Audio.
    var screenEl = root.querySelector('[data-screen]');
    var frame = root.querySelector('[data-frame]');
    var slides = null;
    try { slides = JSON.parse(root.getAttribute('data-slides') || ''); } catch (e) { slides = null; }
    var S = { index: 0, shown: 0, flashes: 0, failed: [] };
    root.__slides = S;
    var syncSlides = function () {};
    var kbRun = function () {};
    var nSlides = slides && slides.length ? slides.length : 0;

    if (screenEl && frame && nSlides) {
      var layers = frame.querySelectorAll('[data-layer]');
      var flashEl = frame.querySelector('[data-flash]');
      var capText = root.querySelector('[data-cap-text]');
      var capCredit = root.querySelector('[data-cap-credit]');
      var count = root.querySelector('[data-count]');
      var offsets = [], total = 0;
      for (var q = 0; q < tracks.length; q++) { offsets.push(total); total += tracks[q].dur || 0; }
      var vis = 0;                              // which of the two layers is on screen
      var failedAt = [];                        // slide index -> true
      var pending = null;                       // {s, natural}: a slide being decoded for the hidden layer
      var lastFlash = -1e9;
      var kb = null;                            // {anim, slide, slot} on the visible layer
      var slotMs = 0;
      var allFailed = false;

      function cssNum(name, fallback) {
        var v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
        return isFinite(v) ? v : fallback;
      }

      function totalTime() {
        var t = total;
        if (!(t > 0)) t = audio.duration;
        return isFinite(t) && t > 0 ? t : 0;
      }

      function nowT() {
        if (ended) return totalTime();
        return (offsets[idx] || 0) + (audio.currentTime || 0);
      }

      // the slide to show for slot k: latest non-failed <= k, else the first non-failed after
      function pick(k) {
        for (var a = k; a >= 0; a--) if (!failedAt[a]) return a;
        for (var b = k + 1; b < nSlides; b++) if (!failedAt[b]) return b;
        return -1;
      }

      function nextGood(from) {
        for (var a = from + 1; a < nSlides; a++) if (!failedAt[a]) return a;
        return -1;
      }

      function markFailed(i) {
        if (failedAt[i]) return;
        failedAt[i] = true;
        S.failed.push(i);
        S.failed.sort(function (a, b) { return a - b; });
        if (pick(0) < 0 && !allFailed) {
          allFailed = true;
          screenEl.classList.add('no-slides');
          root.classList.add('no-slides');
          var plaque = frame.querySelector('.plaque');
          var head = document.querySelector('.head');
          if (plaque && head && !head.querySelector('.ja')) {
            var p = document.createElement('p');
            p.className = 'ja';
            p.setAttribute('lang', 'ja');
            p.textContent = plaque.textContent;
            head.appendChild(p);
          }
          if (kb && kb.anim) kb.anim.cancel();
        }
      }

      function loadInto(layer, i) {
        // load slide i into a layer; resolves true when decoded, false on error
        layer.__slide = i;
        layer.__ok = false;
        layer.alt = '';
        layer.setAttribute('aria-hidden', 'true');
        layer.src = slides[i].src;
        var token = (layer.__tok = (layer.__tok || 0) + 1);
        return new Promise(function (res) {
          var done = function (ok) { if (layer.__tok === token) { layer.__ok = ok; res(ok); } else res(null); };
          if (layer.decode) {
            layer.decode().then(function () { done(true); }, function () { done(false); });
          } else {
            layer.onload = function () { done(true); };
            layer.onerror = function () { done(false); };
          }
        });
      }

      function preloadNext() {
        var hid = layers[1 - vis];
        var n = nextGood(S.shown);
        if (n < 0 || hid.__slide === n || (pending && pending.s === n)) return;
        loadInto(hid, n).then(function (ok) {
          if (ok === false) { markFailed(n); preloadNext(); syncSlides(false); }
        });
      }

      function fitOf(layer) {
        var w = layer.naturalWidth, h = layer.naturalHeight;
        if (!w || !h) return 'near';
        var r = w / h;
        return r < 1.35 ? 'tall' : r > 1.65 ? 'wide' : 'near';
      }

      function kbStop() {
        if (kb && kb.anim) { try { kb.anim.cancel(); } catch (e) { /* gone */ } }
        kb = null;
      }

      // (re)build the Ken Burns of the visible layer for slide i, at audio time t
      function kbBuild(i, t, slot) {
        var layer = layers[vis];
        kbStop();
        layer.classList.remove('tall', 'wide', 'near');
        slotMs = slot * 1000;
        if (rmq.matches || !layer.animate || !(slot > 0) || !layer.naturalWidth) return;
        var fit = fitOf(layer);
        layer.classList.add(fit);
        var fw = frame.clientWidth, fh = frame.clientHeight, kf;
        if (fit === 'tall') {
          var ih = fw * layer.naturalHeight / layer.naturalWidth;
          var d = Math.max(0, (1 - fh / ih) * 100);
          kf = [{ transform: 'translateY(0%) scale(1)' }, { transform: 'translateY(-' + d.toFixed(2) + '%) scale(1.04)' }];
        } else if (fit === 'wide') {
          var iw = fh * layer.naturalWidth / layer.naturalHeight;
          var dx = Math.max(0, (1 - fw / iw) * 100).toFixed(2);
          var a = { transform: 'translateX(0%) scale(1.02)' }, b = { transform: 'translateX(-' + dx + '%) scale(1.06)' };
          kf = i % 2 === 0 ? [a, b] : [b, a];
        } else {
          var c = { transform: 'scale(1) translate(0%,0%)' }, e = { transform: 'scale(1.12) translate(-2%,-1.5%)' };
          var c2 = { transform: 'scale(1.12) translate(2%,1%)' };
          kf = i % 2 === 0 ? [c, e] : [c2, c];
        }
        var anim = layer.animate(kf, { duration: slotMs, easing: 'linear', fill: 'both' });
        kb = { anim: anim, slide: i, slot: slot };
        anim.pause();
        kbAt(t, true);
      }

      function kbAt(t, force) {
        if (!kb || !kb.anim) return;
        var want = Math.max(0, Math.min(slotMs, (t - kb.slide * kb.slot) * 1000));
        var cur = kb.anim.currentTime || 0;
        if (force || Math.abs(cur - want) > slotMs * 0.03) kb.anim.currentTime = want;
      }

      kbRun = function () {
        if (!kb || !kb.anim) return;
        var go = !audio.paused && !loading && !audio.ended;
        try { if (go) kb.anim.play(); else kb.anim.pause(); } catch (e) { /* gone */ }
      };

      function setCaption(i, animate) {
        var sl = slides[i];
        count.textContent = (i + 1) + '/' + nSlides;
        capText.textContent = sl.cap;
        capCredit.textContent = sl.credit;
        capCredit.setAttribute('href', sl.href);
        layers[vis].alt = sl.cap;
        layers[vis].removeAttribute('aria-hidden');
        if (animate && capText.animate && !rmq.matches) {
          capText.animate([{ opacity: 0 }, { opacity: 1 }], { duration: cssMs('--dur-ui', 200), easing: 'ease-out' });
        }
      }

      function cssMs(name, fallback) {
        var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
        var m = v.match(/^([\d.]+)ms$/);
        return m ? parseFloat(m[1]) : fallback;
      }

      function doFlash() {
        var now = performance.now();
        if (rmq.matches || !flashEl.animate || now - lastFlash < 2000) return;
        lastFlash = now;
        S.flashes++;
        flashEl.animate([{ opacity: cssNum('--flash-peak', 0.6) }, { opacity: 0 }],
          { duration: cssMs('--flash-dur', 110), easing: 'ease-out' });
      }

      function swapTo(i, natural, t, slot) {
        var old = layers[vis];
        vis = 1 - vis;
        var nw = layers[vis];
        kbStop();
        nw.classList.add('is-on');
        old.classList.remove('is-on');
        old.alt = '';
        old.setAttribute('aria-hidden', 'true');
        old.getAnimations && old.getAnimations().forEach(function (a) { a.cancel(); });
        S.shown = i;
        kbBuild(i, t, slot);
        setCaption(i, true);
        if (natural) doFlash();
        kbRun();
        preloadNext();
      }

      syncSlides = function (natural) {
        if (allFailed) return;
        var tot = totalTime();
        if (!(tot > 0)) return;
        var t = nowT();
        var slot = tot / nSlides;
        var k = Math.min(nSlides - 1, Math.max(0, Math.floor(t / slot)));
        S.index = k;
        var want = pick(k);
        if (want < 0) return;
        var clock = Math.min(tot, t);
        if (want === S.shown) {
          // same slide: keep the animation on the audio clock
          pending = null;
          if (kb && kb.slot === slot) kbAt(clock, false);
          else if (layers[vis].naturalWidth) { kbBuild(want, clock, slot); kbRun(); }
          return;
        }
        if (pending && pending.s === want) return;
        var isNext = want === S.shown + 1 || (want > S.shown && nextGood(S.shown) === want);
        var req = { s: want, natural: !!natural && isNext && !audio.seeking && !audio.paused };
        pending = req;
        var hid = layers[1 - vis];
        var ready = hid.__slide === want && hid.__ok && hid.naturalWidth > 0;
        var go = function (ok) {
          if (pending !== req) return;
          pending = null;
          if (ok === false) { markFailed(want); syncSlides(false); return; }
          if (ok === null) return;
          var tot2 = totalTime(), slot2 = tot2 / nSlides, t2 = Math.min(tot2, nowT());
          // the audio may have moved on while decoding: show what is right now
          var k2 = Math.min(nSlides - 1, Math.max(0, Math.floor(t2 / slot2)));
          var w2 = pick(k2);
          S.index = k2;
          if (w2 !== want) { syncSlides(false); return; }
          swapTo(want, req.natural, t2, slot2);
        };
        if (ready) go(true);
        else loadInto(hid, want).then(go);
      };

      // slide 1 is in the HTML
      var first = layers[0];
      S.shown = 0;
      var settle = function () {
        frame.classList.remove('is-loading');
        setTimeout(function () { frame.classList.remove('fade'); }, 400);
        if (!first.naturalWidth) { markFailed(0); syncSlides(false); return; }
        var tot = totalTime();
        kbBuild(0, 0, (tot || 0) / nSlides);
        kbRun();
        syncSlides(false);
        preloadNext();
      };
      if (first.complete && first.naturalWidth) {
        settle();
      } else if (first.complete) {
        markFailed(0);
        syncSlides(false);
      } else {
        frame.classList.add('is-loading');
        frame.classList.add('fade');
        first.addEventListener('load', settle, { once: true });
        first.addEventListener('error', function () { frame.classList.remove('is-loading'); markFailed(0); syncSlides(false); }, { once: true });
      }
      if (audio.duration || total) syncSlides(false);

      var rz = 0;
      var syncSlidesRebuild = function () {
        var tot = totalTime();
        if (!(tot > 0)) return;
        var slot = tot / nSlides;
        kbBuild(S.shown, Math.min(tot, nowT()), slot);
        kbRun();
        syncSlides(false);
      };
      var resync = function () { if (!allFailed) syncSlidesRebuild(); };
      window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(resync, 150); });
      document.addEventListener('visibilitychange', function () { if (!document.hidden) { syncSlides(false); kbRun(); } });
      if (rmq.addEventListener) rmq.addEventListener('change', function () { resync(); });
    }

    playBtn.addEventListener('click', toggle);
    var skips = root.querySelectorAll('[data-skip]');
    for (var s = 0; s < skips.length; s++) {
      (function (b) {
        b.addEventListener('click', function () { skip(parseFloat(b.getAttribute('data-skip'))); });
      })(skips[s]);
    }
    scrub.addEventListener('input', function () {
      ended = false;
      audio.currentTime = parseFloat(scrub.value) || 0;
      paint();
      syncSlides(false);
    });
    for (var r = 0; r < rows.length; r++) {
      (function (row, i) {
        row.addEventListener('click', function () {
          if (i === idx) toggle(); else select(i, true);
        });
      })(rows[r], r);
    }

    audio.addEventListener('canplay', function () { if (loading) setLoading(false); setState(); });
    audio.addEventListener('playing', function () { setLoading(false); setState(); syncSlides(false); kbRun(); });
    audio.addEventListener('waiting', function () { if (!audio.paused) setLoading(true); kbRun(); });
    audio.addEventListener('pause', function () { setLoading(false); setState(); kbRun(); });
    audio.addEventListener('seeked', function () { syncSlides(false); });
    audio.addEventListener('timeupdate', function () { paint(); syncSlides(true); });
    audio.addEventListener('loadedmetadata', paint);
    audio.addEventListener('durationchange', paint);
    audio.addEventListener('error', fail);
    audio.addEventListener('ended', function () {
      if (idx + 1 < tracks.length) {
        select(idx + 1, true, true);
      } else {
        audio.currentTime = 0;
        setState();
        paint();
        syncSlides(false);
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
    if (stage) loadTiming(0);
  }

  var players = document.querySelectorAll('[data-player]');
  for (var i = 0; i < players.length; i++) init(players[i]);
})();
