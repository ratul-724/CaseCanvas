import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const dir = path.join(process.cwd(), "templates");
const file = (id: string, kind: "overlay" | "mask") =>
  path.join(dir, kind === "mask" ? `${id}-mask.png` : `${id}.png`);

export type TemplateStatus = { overlay: boolean; mask: boolean; thumb: string | null };

const exists = (p: string) => fs.access(p).then(() => true, () => false);

export async function getStatus(ids: string[]) {
  const out: Record<string, TemplateStatus> = {};
  for (const id of ids) {
    const overlay = await exists(file(id, "overlay"));
    const mask = await exists(file(id, "mask"));
    let thumb: string | null = null;
    if (overlay) {
      const b = await sharp(file(id, "overlay")).resize(160, 160, { fit: "inside" }).png().toBuffer();
      thumb = `data:image/png;base64,${b.toString("base64")}`;
    }
    out[id] = { overlay, mask, thumb };
  }
  return out;
}

export async function saveFile(id: string, kind: "overlay" | "mask", buf: Buffer) {
  const meta = await sharp(buf).metadata().catch(() => null);
  if (!meta || meta.format !== "png") throw new Error("Please upload a PNG file.");
  const other = kind === "overlay" ? "mask" : "overlay";
  if (await exists(file(id, other))) {
    const om = await sharp(file(id, other)).metadata();
    if (om.width !== meta.width || om.height !== meta.height) {
      throw new Error(
        `Size mismatch: the ${other} is ${om.width}×${om.height}px but this file is ${meta.width}×${meta.height}px. Both must be the same size.`,
      );
    }
  }
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file(id, kind), buf);
}

export async function removeFile(id: string, kind: "overlay" | "mask") {
  await fs.rm(file(id, kind), { force: true });
}