// Minimap: the street grid is painted once into an offscreen canvas from the city data,
// then each frame a circular window of it is blitted around the player with a facing arrow.
import { CITY, PALETTE } from './config.js';

export class Minimap {
  constructor(canvas, data) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.data = data;
    this.size = canvas.width;              // 200
    this.viewRadius = 120;                 // world units visible from the centre to the rim
    this.mapHalf = CITY.bound + 120;       // world half-extent covered by the prerender
    this.mapPx = 900;
    this.mapScale = this.mapPx / (this.mapHalf * 2);
    this.prerender();
  }

  w2m(x) { return (x + this.mapHalf) * this.mapScale; }

  prerender() {
    const c = document.createElement('canvas');
    c.width = this.mapPx;
    c.height = this.mapPx;
    const g = c.getContext('2d');
    const s = this.mapScale;

    g.fillStyle = '#171021';
    g.fillRect(0, 0, this.mapPx, this.mapPx);

    // sea and sand
    g.fillStyle = '#22465a';
    g.fillRect(0, this.w2m(CITY.waterZ), this.mapPx, this.mapPx);
    g.fillStyle = '#8d7355';
    g.fillRect(0, this.w2m(CITY.beachZ), this.mapPx, this.w2m(CITY.waterZ) - this.w2m(CITY.beachZ));

    // blocks
    for (const b of this.data.blocks) {
      g.fillStyle = b.downtown ? '#3a2f47' : '#302639';
      g.fillRect(
        this.w2m(b.x - b.w / 2) - CITY.sidewalk * s,
        this.w2m(b.z - b.d / 2) - CITY.sidewalk * s,
        (b.w + CITY.sidewalk * 2) * s,
        (b.d + CITY.sidewalk * 2) * s,
      );
    }

    // roads
    g.strokeStyle = '#5a5262';
    g.lineWidth = Math.max(2.2, CITY.roadWidth * s);
    g.lineCap = 'butt';
    for (const r of this.data.roads) {
      g.beginPath();
      if (r.axis === 'z') {
        g.moveTo(this.w2m(r.x), 0);
        g.lineTo(this.w2m(r.x), this.mapPx);
      } else {
        g.moveTo(0, this.w2m(r.z));
        g.lineTo(this.mapPx, this.w2m(r.z));
      }
      g.stroke();
    }

    // buildings, coloured like their glass
    for (const b of this.data.buildings) {
      const col = b.color;
      g.fillStyle = `rgba(${Math.round(col.r * 255)},${Math.round(col.g * 255)},${Math.round(col.b * 255)},0.92)`;
      g.fillRect(
        this.w2m(b.x - b.w / 2),
        this.w2m(b.z - b.d / 2),
        Math.max(1.2, b.w * s),
        Math.max(1.2, b.d * s),
      );
    }

    // plaza + landmarks
    const plazaMark = this.data.landmarks?.find((l) => l.type === 'plaza');
    if (plazaMark) {
      g.fillStyle = 'rgba(255,209,102,0.22)';
      g.beginPath();
      g.arc(this.w2m(plazaMark.x), this.w2m(plazaMark.z), 30 * s, 0, Math.PI * 2);
      g.fill();
    }
    for (const p of this.data.points) {
      g.fillStyle = `#${p.color.toString(16).padStart(6, '0')}`;
      g.beginPath();
      g.arc(this.w2m(p.x), this.w2m(p.z), 2.6, 0, Math.PI * 2);
      g.fill();
    }

    this.map = c;
  }

  update(player, yaw, extras = {}) {
    const ctx = this.ctx;
    const size = this.size;
    const half = size / 2;
    const sw = this.viewRadius * 2 * this.mapScale;
    const sx = this.w2m(player.x) - sw / 2;
    const sy = this.w2m(player.z) - sw / 2;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#171021';
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.map, sx, sy, sw, sw, 0, 0, size, size);

    // soft vignette so the rim reads as distance, not as a hard cut
    const grad = ctx.createRadialGradient(half, half, half * 0.45, half, half, half);
    grad.addColorStop(0, 'rgba(12,8,18,0)');
    grad.addColorStop(1, 'rgba(12,8,18,0.66)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // street names for the two nearest avenues would be noise at this size — a north tick instead
    ctx.fillStyle = 'rgba(255,214,166,0.85)';
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', half, 14);

    // player arrow
    ctx.save();
    ctx.translate(half, half);
    const angle = Math.atan2(Math.sin(yaw), -Math.cos(yaw));
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(5.4, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5.4, 6);
    ctx.closePath();
    ctx.fillStyle = '#fff4e0';
    ctx.shadowColor = 'rgba(255,140,60,0.95)';
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();

    // ---- objective marker (clamped to the rim when it is off the map) ----
    const k = (half - 8) / this.viewRadius;
    const maxR = half - 13;
    const place = (wx, wz) => {
      let dx = (wx - player.x) * k;
      let dz = (wz - player.z) * k;
      const d = Math.hypot(dx, dz);
      if (d > maxR) { dx = (dx / d) * maxR; dz = (dz / d) * maxR; }
      return [half + dx, half + dz];
    };

    if (extras.objective) {
      const [ox, oy] = place(extras.objective.x, extras.objective.z);
      const pulse = 0.7 + 0.3 * Math.sin(performance.now() * 0.005);
      ctx.save();
      ctx.translate(ox, oy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(255,209,102,0.95)';
      ctx.shadowColor = 'rgba(255,190,60,0.9)';
      ctx.shadowBlur = 8 * pulse;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }

    for (const cop of extras.police || []) {
      const [cx, cy] = place(cop.x, cop.z);
      ctx.beginPath();
      ctx.arc(cx, cy, 4.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(70,120,255,0.28)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = '#7fb2ff';
      ctx.shadowColor = 'rgba(90,150,255,0.95)';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    if (extras.playerCar) {
      const [px, py] = place(extras.playerCar.x, extras.playerCar.z);
      ctx.beginPath();
      ctx.arc(px, py, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#ffd9a0';
      ctx.fill();
    }

    ctx.restore();

    // rim
    ctx.strokeStyle = 'rgba(255,190,120,0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(half, half, half - 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}
