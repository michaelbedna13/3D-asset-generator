// Cell shapes. Each one writes into a "sink" (canvas or SVG path builder) so the
// exact same geometry is used for the live preview, PNG/GIF/MP4 frames and SVG.
//   sink.circle(cx, cy, r)
//   sink.poly([x0, y0, x1, y1, ...])
//   sink.rrect(x, y, w, h, r)
// All shapes are filled with the even-odd rule, which is what makes `ring` hollow.

const S = Math.SQRT1_2;

function plusPoints(cx, cy, a, t, diagonal) {
  const p = [-t, -a, t, -a, t, -t, a, -t, a, t, t, t, t, a, -t, a, -t, t, -a, t, -a, -t, -t, -t];
  for (let i = 0; i < p.length; i += 2) {
    const x = p[i];
    const y = p[i + 1];
    if (diagonal) {
      p[i] = cx + (x - y) * S;
      p[i + 1] = cy + (x + y) * S;
    } else {
      p[i] = cx + x;
      p[i + 1] = cy + y;
    }
  }
  return p;
}

export const SHAPES = {
  none() {},
  dot(sink, cx, cy, s) {
    sink.circle(cx, cy, s / 2);
  },
  ring(sink, cx, cy, s) {
    sink.circle(cx, cy, s / 2);
    sink.circle(cx, cy, s * 0.27);
  },
  square(sink, cx, cy, s) {
    sink.rrect(cx - s / 2, cy - s / 2, s, s, 0);
  },
  rounded(sink, cx, cy, s) {
    sink.rrect(cx - s / 2, cy - s / 2, s, s, s * 0.24);
  },
  diamond(sink, cx, cy, s) {
    const h = s / 2;
    sink.poly([cx, cy - h, cx + h, cy, cx, cy + h, cx - h, cy]);
  },
  cross(sink, cx, cy, s) {
    sink.poly(plusPoints(cx, cy, s * 0.56, s * 0.12, true));
  },
  plus(sink, cx, cy, s) {
    sink.poly(plusPoints(cx, cy, s * 0.5, s * 0.13, false));
  },
  triangle(sink, cx, cy, s) {
    const h = s / 2;
    sink.poly([cx, cy - h, cx + h, cy + h, cx - h, cy + h]);
  },
  bar(sink, cx, cy, s) {
    sink.rrect(cx - s / 2, cy - s * 0.15, s, s * 0.3, 0);
  },
  slash(sink, cx, cy, s) {
    const h = s / 2;
    const t = s * 0.2;
    sink.poly([cx + h - t, cy - h, cx + h, cy - h, cx - h + t, cy + h, cx - h, cy + h]);
  },
};

export const SHAPE_OPTIONS = [
  ['dot', 'Dot'],
  ['ring', 'Ring'],
  ['cross', 'Cross'],
  ['plus', 'Plus'],
  ['square', 'Square'],
  ['rounded', 'Rounded'],
  ['diamond', 'Diamond'],
  ['triangle', 'Triangle'],
  ['bar', 'Bar'],
  ['slash', 'Slash'],
  ['none', 'None'],
];

export function canvasSink(ctx) {
  return {
    circle(cx, cy, r) {
      ctx.moveTo(cx + r, cy);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
    },
    poly(p) {
      ctx.moveTo(p[0], p[1]);
      for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
      ctx.closePath();
    },
    rrect(x, y, w, h, r) {
      if (r > 0 && ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
    },
  };
}

const f = (n) => Math.round(n * 100) / 100;

export function svgSink() {
  const parts = [];
  return {
    circle(cx, cy, r) {
      parts.push(
        `M${f(cx - r)} ${f(cy)}a${f(r)} ${f(r)} 0 1 0 ${f(r * 2)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-r * 2)} 0z`,
      );
    },
    poly(p) {
      let d = `M${f(p[0])} ${f(p[1])}`;
      for (let i = 2; i < p.length; i += 2) d += `L${f(p[i])} ${f(p[i + 1])}`;
      parts.push(`${d}z`);
    },
    rrect(x, y, w, h, r) {
      if (r <= 0) {
        parts.push(`M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}z`);
        return;
      }
      const R = f(r);
      parts.push(
        `M${f(x + r)} ${f(y)}h${f(w - 2 * r)}a${R} ${R} 0 0 1 ${R} ${R}v${f(h - 2 * r)}` +
          `a${R} ${R} 0 0 1 ${-R} ${R}h${f(-(w - 2 * r))}a${R} ${R} 0 0 1 ${-R} ${-R}` +
          `v${f(-(h - 2 * r))}a${R} ${R} 0 0 1 ${R} ${-R}z`,
      );
    },
    toString() {
      return parts.join('');
    },
  };
}
