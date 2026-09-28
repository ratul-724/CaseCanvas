import sharp from "sharp";
import type { Device } from "./devices";
import { renderFromTemplate } from "./templates.server";

export type Opts = {
  fit: "cover" | "contain";
  zoom: number;
  ox: number;
  oy: number;
  bg: string;
  dbg: string;
};

const hex = (v: string, fallback: string) =>
  /^#[0-9a-f]{6}$/i.test(v) ? v : fallback;

export async function loadDesign(input: Buffer) {
  const { data, info } = await sharp(input)
    .rotate()
    .resize({ width: 3000, height: 3000, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

function camera(type: Device["cam"], cw: number, ch: number) {
  const u = Math.min(cw, ch);
  const m = u * 0.05;
  const lens = (x: number, y: number, r: number) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#0a0a0a" stroke="#555" stroke-width="${u * 0.008}"/>` +
    `<circle cx="${x}" cy="${y}" r="${r * 0.45}" fill="#1c2b40"/>`;
  const plate = (x: number, y: number, w: number, h: number, r: number) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="#151515" fill-opacity="0.93" stroke="#3a3a3a" stroke-width="${u * 0.006}"/>`;

  switch (type) {
    case "triple": {
      const p = u * 0.4;
      return (
        plate(m, m, p, p, u * 0.11) +
        lens(m + p * 0.3, m + p * 0.3, u * 0.085) +
        lens(m + p * 0.3, m + p * 0.72, u * 0.085) +
        lens(m + p * 0.72, m + p * 0.51, u * 0.085)
      );
    }
    case "dual":
      return (
        plate(m, m, u * 0.28, u * 0.5, u * 0.14) +
        lens(m + u * 0.14, m + u * 0.14, u * 0.085) +
        lens(m + u * 0.14, m + u * 0.36, u * 0.085)
      );
    case "single":
      return plate(m, m, u * 0.24, u * 0.24, u * 0.08) + lens(m + u * 0.12, m + u * 0.12, u * 0.075);
    case "bar":
      return (
        plate(0, m * 2, cw, u * 0.17, 0) +
        lens(cw * 0.28, m * 2 + u * 0.085, u * 0.062) +
        lens(cw * 0.5, m * 2 + u * 0.085, u * 0.062) +
        lens(cw * 0.72, m * 2 + u * 0.085, u * 0.062)
      );
    case "lenses":
      return (
        lens(u * 0.17, u * 0.12, u * 0.07) +
        lens(u * 0.17, u * 0.3, u * 0.07) +
        lens(u * 0.17, u * 0.48, u * 0.07)
      );
    case "logo":
      return `<circle cx="${cw / 2}" cy="${ch / 2}" r="${u * 0.1}" fill="#d8dadd" stroke="#9a9ca0" stroke-width="${u * 0.006}"/>`;
    default:
      return "";
  }
}

export async function render(
  design: { data: Buffer; w: number; h: number },
  dev: Device,
  o: Opts,
  S: number,
  quality = 85,
) {
  const fromTemplate = await renderFromTemplate(design, dev, o, S, quality);
  if (fromTemplate) return fromTemplate;
  const box = S * 0.8;
  const landscape = dev.w > dev.h;
  const cw = Math.round(landscape ? box : (box * dev.w) / dev.h);
  const ch = Math.round(landscape ? (box * dev.h) / dev.w : box);
  const rad = (dev.r / 100) * Math.min(cw, ch);
  const left = Math.round((S - cw) / 2);
  const top = Math.round((S - ch) / 2);

  // Fit the design (zoom + position)
  const pick = o.fit === "cover" ? Math.max : Math.min;
  const sc = pick(cw / design.w, ch / design.h) * o.zoom;
  const dw = Math.max(1, Math.round(design.w * sc));
  const dh = Math.max(1, Math.round(design.h * sc));
  const resized = await sharp(design.data).resize(dw, dh).png().toBuffer();
  const dx = Math.round((cw - dw) / 2 + (o.ox / 100) * cw);
  const dy = Math.round((ch - dh) / 2 + (o.oy / 100) * ch);
  const sl = Math.max(0, -dx);
  const st = Math.max(0, -dy);
  const dl = Math.max(0, dx);
  const dt = Math.max(0, dy);
  const vw = Math.min(dw - sl, cw - dl);
  const vh = Math.min(dh - st, ch - dt);

  const layers: { input: Buffer; left: number; top: number }[] = [];
  if (vw > 0 && vh > 0) {
    layers.push({
      input: await sharp(resized)
        .extract({ left: sl, top: st, width: vw, height: vh })
        .toBuffer(),
      left: dl,
      top: dt,
    });
  }

  const flat = await sharp({
    create: { width: cw, height: ch, channels: 4, background: hex(o.dbg, "#ffffff") },
  })
    .composite(layers)
    .png()
    .toBuffer();

  const mask = Buffer.from(
    `<svg width="${cw}" height="${ch}" xmlns="http://www.w3.org/2000/svg"><rect width="${cw}" height="${ch}" rx="${rad}" fill="#fff"/></svg>`,
  );
  const art = await sharp(flat)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  const shadow = Buffer.from(
    `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
      <defs><filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${S * 0.022}"/></filter></defs>
      <rect x="${left + cw * 0.02}" y="${top + S * 0.02}" width="${cw * 0.96}" height="${ch}" rx="${rad}" fill="#000" opacity="0.28" filter="url(#b)"/>
    </svg>`,
  );

  const over = Buffer.from(
    `<svg width="${S}" height="${S}" xmlns="http://www.w3.org/2000/svg">
      <defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#fff" stop-opacity="0.28"/>
        <stop offset="45%" stop-color="#fff" stop-opacity="0"/>
        <stop offset="100%" stop-color="#000" stop-opacity="0.14"/>
      </linearGradient></defs>
      <g transform="translate(${left} ${top})">
        <rect width="${cw}" height="${ch}" rx="${rad}" fill="url(#s)"/>
        <rect width="${cw}" height="${ch}" rx="${rad}" fill="none" stroke="#000" stroke-opacity="0.3" stroke-width="${S * 0.004}"/>
        <g clip-path="url(#c)">${camera(dev.cam, cw, ch)}</g>
      </g>
      <defs><clipPath id="c"><rect width="${cw}" height="${ch}" rx="${rad}"/></clipPath></defs>
    </svg>`,
  );

  return sharp({
    create: { width: S, height: S, channels: 3, background: hex(o.bg, "#f1f2f4") },
  })
    .composite([
      { input: shadow },
      { input: art, left, top },
      { input: over },
    ])
    .jpeg({ quality })
    .toBuffer();
}