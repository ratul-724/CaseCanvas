import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import type { Device } from "./devices";
import type { Opts } from "./mockup.server";

const dir = path.join(process.cwd(), "templates");
const hex = (v: string, f: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : f);

export async function renderFromTemplate(
  design: { data: Buffer; w: number; h: number },
  dev: Device,
  o: Opts,
  S: number,
  quality: number,
) {
  let overlay: Buffer;
  let mask: Buffer;
  try {
    overlay = await fs.readFile(path.join(dir, `${dev.id}.png`));
    mask = await fs.readFile(path.join(dir, `${dev.id}-mask.png`));
  } catch {
    return null; // no template for this model: fall back to the drawn case
  }

  const { width: W = 0, height: H = 0 } = await sharp(overlay).metadata();

  // Printable area = bounding box of the mask
  const t = await sharp(mask).trim().toBuffer({ resolveWithObject: true });
  const bw = t.info.width;
  const bh = t.info.height;
  const bx = -(t.info.trimOffsetLeft ?? 0);
  const by = -(t.info.trimOffsetTop ?? 0);

  // Fit the design into that area (same rules as the drawn case)
  const pick = o.fit === "cover" ? Math.max : Math.min;
  const sc = pick(bw / design.w, bh / design.h) * o.zoom;
  const dw = Math.max(1, Math.round(design.w * sc));
  const dh = Math.max(1, Math.round(design.h * sc));
  const resized = await sharp(design.data).resize(dw, dh).png().toBuffer();
  const dx = Math.round((bw - dw) / 2 + (o.ox / 100) * bw);
  const dy = Math.round((bh - dh) / 2 + (o.oy / 100) * bh);
  const sl = Math.max(0, -dx);
  const st = Math.max(0, -dy);
  const dl = Math.max(0, dx);
  const dt = Math.max(0, dy);
  const vw = Math.min(dw - sl, bw - dl);
  const vh = Math.min(dh - st, bh - dt);

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

  const box = await sharp({
    create: { width: bw, height: bh, channels: 4, background: hex(o.dbg, "#ffffff") },
  })
    .composite(layers)
    .png()
    .toBuffer();

  const art = await sharp({
    create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: box, left: bx, top: by }])
    .png()
    .toBuffer();

  const cut = await sharp(art)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  return sharp({
    create: { width: W, height: H, channels: 3, background: hex(o.bg, "#ffffff") },
  })
    .composite([{ input: cut }, { input: overlay }])
    .resize({ width: S })
    .jpeg({ quality })
    .toBuffer();
}