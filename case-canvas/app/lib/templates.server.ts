import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Device } from "./devices";
import type { Opts } from "./mockup.server";

const dir = path.join(process.cwd(), "templates");
const imgPath = (id: string) => path.join(dir, `${id}.mockup.png`);
const areaPath = (id: string) => path.join(dir, `${id}.area.json`);
const hex = (v: string, f: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : f);

// x,y,w,h,r = design area. cx,cy,cw,ch,cr = camera cutout (cw = 0 means no cutout)
export type Area = {
  x: number; y: number; w: number; h: number; r: number;
  cx: number; cy: number; cw: number; ch: number; cr: number;
};
const DEFAULT_AREA: Area = { x: 0.1, y: 0.1, w: 0.8, h: 0.8, r: 8, cx: 0, cy: 0, cw: 0, ch: 0, cr: 15 };
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, Number.isFinite(v) ? v : a));

async function readArea(id: string): Promise<Area> {
  try {
    return { ...DEFAULT_AREA, ...JSON.parse(await fs.readFile(areaPath(id), "utf8")) };
  } catch {
    return DEFAULT_AREA;
  }
}

export async function getStatus(ids: string[]) {
  const out: Record<string, { thumb: string | null; area: Area }> = {};
  for (const id of ids) {
    let thumb: string | null = null;
    try {
      const b = await sharp(await fs.readFile(imgPath(id))).resize(420, 420, { fit: "inside" }).png().toBuffer();
      thumb = `data:image/png;base64,${b.toString("base64")}`;
    } catch {
      thumb = null;
    }
    out[id] = { thumb, area: await readArea(id) };
  }
  return out;
}

export async function saveImage(id: string, buf: Buffer) {
  let png: Buffer;
  try {
    png = await sharp(buf).rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).png().toBuffer();
  } catch {
    throw new Error("Please upload a PNG or JPG image.");
  }
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(imgPath(id), png);
  try {
    await fs.access(areaPath(id));
  } catch {
    await fs.writeFile(areaPath(id), JSON.stringify(DEFAULT_AREA));
  }
}

export async function saveArea(id: string, a: Area) {
  const x = clamp(a.x, 0, 0.95);
  const y = clamp(a.y, 0, 0.95);
  const cx = clamp(a.cx, 0, 0.98);
  const cy = clamp(a.cy, 0, 0.98);
  const area: Area = {
    x, y,
    w: clamp(a.w, 0.05, 1 - x),
    h: clamp(a.h, 0.05, 1 - y),
    r: clamp(a.r, 0, 50),
    cx, cy,
    cw: a.cw > 0 ? clamp(a.cw, 0.02, 1 - cx) : 0,
    ch: a.cw > 0 ? clamp(a.ch, 0.02, 1 - cy) : 0,
    cr: clamp(a.cr, 0, 50),
  };
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(areaPath(id), JSON.stringify(area));
}

export async function removeMockup(id: string) {
  await fs.rm(imgPath(id), { force: true });
  await fs.rm(areaPath(id), { force: true });
}

export async function renderFromTemplate(
  design: { data: Buffer; w: number; h: number },
  dev: Device,
  o: Opts,
  S: number,
  quality: number,
) {
  let img: Buffer;
  try {
    img = await fs.readFile(imgPath(dev.id));
  } catch {
    return null; // no custom mockup: use the default drawn case
  }
  const area = await readArea(dev.id);
  const meta = await sharp(img).metadata();
  const W = meta.width ?? 1;
  const H = meta.height ?? 1;
  const k = Math.min(S / W, S / H);
  const offX = (S - W * k) / 2;
  const offY = (S - H * k) / 2;
  const ax = Math.max(0, Math.round(offX + area.x * W * k));
  const ay = Math.max(0, Math.round(offY + area.y * H * k));
  const aw = Math.max(2, Math.min(S - ax, Math.round(area.w * W * k)));
  const ah = Math.max(2, Math.min(S - ay, Math.round(area.h * H * k)));
  const rad = (area.r / 100) * Math.min(aw, ah);
  const bg = hex(o.bg, "#ffffff");

  const base = await sharp(img)
    .resize({ width: S, height: S, fit: "contain", background: bg })
    .flatten({ background: bg })
    .png()
    .toBuffer();

  const pick = o.fit === "cover" ? Math.max : Math.min;
  const sc = pick(aw / design.w, ah / design.h) * o.zoom;
  const dw = Math.max(1, Math.round(design.w * sc));
  const dh = Math.max(1, Math.round(design.h * sc));
  const resized = await sharp(design.data).resize(dw, dh).png().toBuffer();
  const dx = Math.round((aw - dw) / 2 + (o.ox / 100) * aw);
  const dy = Math.round((ah - dh) / 2 + (o.oy / 100) * ah);
  const sl = Math.max(0, -dx);
  const st = Math.max(0, -dy);
  const dl = Math.max(0, dx);
  const dt = Math.max(0, dy);
  const vw = Math.min(dw - sl, aw - dl);
  const vh = Math.min(dh - st, ah - dt);

  const parts: { input: Buffer; left: number; top: number }[] = [];
  if (vw > 0 && vh > 0) {
    parts.push({
      input: await sharp(resized).extract({ left: sl, top: st, width: vw, height: vh }).toBuffer(),
      left: dl,
      top: dt,
    });
  }
  const flat = await sharp({
    create: { width: aw, height: ah, channels: 4, background: hex(o.dbg, "#ffffff") },
  })
    .composite(parts)
    .png()
    .toBuffer();
  const mask = Buffer.from(
    `<svg width="${aw}" height="${ah}" xmlns="http://www.w3.org/2000/svg"><rect width="${aw}" height="${ah}" rx="${rad}" fill="#fff"/></svg>`,
  );
  let art = await sharp(flat).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();

  // Camera cutout: remove the design from that box so the photo shows through
  if (area.cw > 0 && area.ch > 0) {
    const lx = offX + area.cx * W * k - ax;
    const ly = offY + area.cy * H * k - ay;
    const lw = area.cw * W * k;
    const lh = area.ch * H * k;
    const cr = (area.cr / 100) * Math.min(lw, lh);
    const hole = Buffer.from(
      `<svg width="${aw}" height="${ah}" xmlns="http://www.w3.org/2000/svg"><rect x="${lx}" y="${ly}" width="${lw}" height="${lh}" rx="${cr}" fill="#000"/></svg>`,
    );
    art = await sharp(art).composite([{ input: hole, blend: "dest-out" }]).png().toBuffer();
  }

  const layer = await sharp({
    create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: art, left: ax, top: ay }])
    .png()
    .toBuffer();

  // "multiply" keeps the case shadows and highlights visible on top of the design
  return sharp(base).composite([{ input: layer, blend: "multiply" }]).jpeg({ quality }).toBuffer();
}