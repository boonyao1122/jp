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

    function select(i, autoplay) {
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
    }


    // ---- Aura + subtitle (all optional: with no timing json the player is exactly the plain one) ----
    function auraOff() {
      timing = null;
      stage.classList.add('no-aura');
      sub.classList.add('no-sub');
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
        if (talking) syncSub(true);
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
    if (stage) loadTiming(0);
  }

  var players = document.querySelectorAll('[data-player]');
  for (var i = 0; i < players.length; i++) init(players[i]);
})();
