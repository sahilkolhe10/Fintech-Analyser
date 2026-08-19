// <market-globe> — dotted globe with market-centre markers. Drag to rotate, auto-spins when idle.
(function () {
  const CITIES = [
    { name: 'New York', lat: 40.71, lon: -74.01, state: 'pre' },
    { name: 'London', lat: 51.51, lon: -0.13, state: 'open' },
    { name: 'Frankfurt', lat: 50.11, lon: 8.68, state: 'open' },
    { name: 'Mumbai', lat: 19.08, lon: 72.88, state: 'open' },
    { name: 'Hong Kong', lat: 22.32, lon: 114.17, state: 'closed' },
    { name: 'Tokyo', lat: 35.68, lon: 139.77, state: 'closed' },
  ];
  const LINKS = [[0, 1], [1, 3], [3, 5], [1, 2], [3, 4]];
  const COL = { open: [52, 211, 153], pre: [251, 191, 36], closed: [120, 130, 155] };
  const D2R = Math.PI / 180;

  const vec = (lat, lon) => {
    const a = lat * D2R, o = lon * D2R;
    return [Math.cos(a) * Math.cos(o), Math.sin(a), Math.cos(a) * Math.sin(o)];
  };
  const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  class MarketGlobe extends HTMLElement {
    connectedCallback() {
      if (this._up) return;
      this._up = true;
      this.style.display = 'block';
      this.style.position = 'relative';
      this.style.cursor = 'grab';
      if (!this.style.height) this.style.height = '100%';
      if (!this.style.width) this.style.width = '100%';
      this.style.touchAction = 'none';
      this.canvas = document.createElement('canvas');
      this.canvas.style.cssText = 'display:block;width:100%;height:100%';
      this.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.yaw = -0.9;
      this.pitch = 0.32;
      this.idle = 0;
      this.accent = this.getAttribute('accent') || '#D8B876';
      this.auto = this.getAttribute('autorotate') !== 'off' && this.getAttribute('autorotate') !== 'false';

      this._ro = new ResizeObserver(() => this.size());
      this._ro.observe(this);
      this.size();

      this._down = (e) => {
        this.drag = true; this.px = e.clientX; this.py = e.clientY;
        this.style.cursor = 'grabbing';
        this.setPointerCapture && this.setPointerCapture(e.pointerId);
      };
      this._move = (e) => {
        if (!this.drag) return;
        this.yaw += (e.clientX - this.px) * 0.0068;
        this.pitch = Math.max(-1.05, Math.min(1.05, this.pitch + (e.clientY - this.py) * 0.0055));
        this.px = e.clientX; this.py = e.clientY; this.idle = 0;
      };
      this._end = () => { this.drag = false; this.style.cursor = 'grab';
      if (!this.style.height) this.style.height = '100%';
      if (!this.style.width) this.style.width = '100%'; };
      this.addEventListener('pointerdown', this._down);
      this.addEventListener('pointermove', this._move);
      this.addEventListener('pointerup', this._end);
      this.addEventListener('pointercancel', this._end);

      const loop = () => {
        this._raf = requestAnimationFrame(loop);
        if (!this.drag && this.auto) { this.idle++; if (this.idle > 90) this.yaw += 0.0017; }
        this.t = (this.t || 0) + 1;
        this.draw();
      };
      loop();
    }

    disconnectedCallback() {
      cancelAnimationFrame(this._raf);
      this._ro && this._ro.disconnect();
      this._up = false;
    }

    size() {
      const r = this.getBoundingClientRect();
      const d = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
      this.canvas.width = Math.round(this.w * d);
      this.canvas.height = Math.round(this.h * d);
      this.ctx.setTransform(d, 0, 0, d, 0, 0);
    }

    proj(v) {
      const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
      let x = v[0] * cy - v[2] * sy, z = v[0] * sy + v[2] * cy, y = v[1];
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const y2 = y * cp - z * sp, z2 = y * sp + z * cp;
      return [x, y2, z2];
    }

    draw() {
      const c = this.ctx, w = this.w, h = this.h;
      if (!w || !h) return;
      const cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.42;
      c.clearRect(0, 0, w, h);

      // glass body
      const g = c.createRadialGradient(cx - R * 0.3, cy - R * 0.4, R * 0.1, cx, cy, R);
      g.addColorStop(0, 'rgba(38,38,56,.85)');
      g.addColorStop(0.72, 'rgba(16,16,28,.9)');
      g.addColorStop(1, 'rgba(9,9,16,.95)');
      c.beginPath(); c.arc(cx, cy, R, 0, 6.2832); c.fillStyle = g; c.fill();

      const sx = (p) => cx + p[0] * R, sy = (p) => cy - p[1] * R;

      // graticule dots, back hemisphere first
      for (let pass = 0; pass < 2; pass++) {
        c.fillStyle = pass === 0 ? 'rgba(180,137,74,.16)' : 'rgba(216,184,118,.55)';
        for (let lat = -80; lat <= 80; lat += 10) {
          const step = lat % 20 === 0 ? 9 : 12;
          for (let lon = -180; lon < 180; lon += step) {
            const p = this.proj(vec(lat, lon));
            if ((pass === 0) !== (p[2] < 0)) continue;
            const r = pass === 0 ? 0.8 : 1.05 + p[2] * 0.5;
            c.beginPath(); c.arc(sx(p), sy(p), r, 0, 6.2832); c.fill();
          }
        }
        if (pass === 0) {
          c.beginPath(); c.arc(cx, cy, R, 0, 6.2832);
          c.fillStyle = 'rgba(10,10,18,.55)'; c.fill();
        }
      }

      // session arcs
      LINKS.forEach(([a, b], li) => {
        const A = norm(vec(CITIES[a].lat, CITIES[a].lon)), B = norm(vec(CITIES[b].lat, CITIES[b].lon));
        const N = 44, pts = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N;
          const m = norm([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
          const lift = 1 + 0.2 * Math.sin(Math.PI * t);
          pts.push(this.proj([m[0] * lift, m[1] * lift, m[2] * lift]));
        }
        c.lineWidth = 1.2;
        for (let i = 1; i <= N; i++) {
          const p0 = pts[i - 1], p1 = pts[i];
          const d = (p0[2] + p1[2]) / 2;
          if (d < -0.1) continue;
          c.strokeStyle = `rgba(216,184,118,${(0.1 + Math.max(0, d) * 0.55).toFixed(3)})`;
          c.beginPath(); c.moveTo(sx(p0), sy(p0)); c.lineTo(sx(p1), sy(p1)); c.stroke();
        }
        // travelling pulse
        const tp = ((this.t * 0.004) + li * 0.19) % 1;
        const pp = pts[Math.round(tp * N)];
        if (pp && pp[2] > 0) {
          c.beginPath(); c.arc(sx(pp), sy(pp), 1.9, 0, 6.2832);
          c.fillStyle = 'rgba(244,235,214,.9)'; c.fill();
        }
      });

      // rim light
      c.beginPath(); c.arc(cx, cy, R, 0, 6.2832);
      c.strokeStyle = 'rgba(216,184,118,.3)'; c.lineWidth = 1; c.stroke();
      c.beginPath(); c.arc(cx, cy, R + 5, 0, 6.2832);
      c.strokeStyle = 'rgba(216,184,118,.08)'; c.lineWidth = 8; c.stroke();

      // markers
      CITIES.forEach((ct) => {
        const p = this.proj(vec(ct.lat, ct.lon));
        if (p[2] <= 0.02) return;
        const X = sx(p), Y = sy(p), rgb = COL[ct.state], a = 0.45 + p[2] * 0.55;
        if (ct.state !== 'closed') {
          const ph = (this.t * 0.018 + ct.lon) % 6.2832;
          const pr = 4 + (Math.sin(ph) * 0.5 + 0.5) * 7;
          c.beginPath(); c.arc(X, Y, pr, 0, 6.2832);
          c.strokeStyle = `rgba(${rgb},${(0.28 * a * (1 - (pr - 4) / 7)).toFixed(3)})`;
          c.lineWidth = 1.4; c.stroke();
        }
        c.beginPath(); c.arc(X, Y, 3.1, 0, 6.2832);
        c.fillStyle = `rgba(${rgb},${a.toFixed(2)})`; c.fill();
        c.beginPath(); c.arc(X, Y, 1.2, 0, 6.2832);
        c.fillStyle = `rgba(255,255,255,${(a * 0.8).toFixed(2)})`; c.fill();
        if (p[2] > 0.34) {
          c.font = '500 10px Geist, system-ui, sans-serif';
          c.fillStyle = `rgba(200,208,224,${(p[2] * 0.9).toFixed(2)})`;
          c.textBaseline = 'middle';
          const flip = X > cx;
          c.textAlign = flip ? 'right' : 'left';
          c.fillText(ct.name, X + (flip ? -8 : 8), Y);
        }
      });
    }
  }
  if (!customElements.get('market-globe')) customElements.define('market-globe', MarketGlobe);
})();
