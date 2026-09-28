import type { Device } from "./devices";

type Admin = {
  graphql: (q: string, o?: { variables?: Record<string, unknown> }) => Promise<Response>;
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

async function gql(admin: Admin, query: string, variables: Record<string, unknown>) {
  const res = await admin.graphql(query, { variables });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

export async function publishToProduct(
  admin: Admin,
  productId: string,
  items: { dev: Device; buf: Buffer }[],
  allDevices: Device[],
) {
  // 1. Upload images to Shopify storage
  const staged = await gql(
    admin,
    `mutation($input:[StagedUploadInput!]!){stagedUploadsCreate(input:$input){stagedTargets{url resourceUrl parameters{name value}} userErrors{message}}}`,
    {
      input: items.map((i) => ({
        filename: `${i.dev.id}.jpg`,
        mimeType: "image/jpeg",
        httpMethod: "POST",
        resource: "IMAGE",
      })),
    },
  );
  const errs = staged.stagedUploadsCreate.userErrors;
  if (errs.length) throw new Error(errs.map((e: { message: string }) => e.message).join(", "));
  const targets = staged.stagedUploadsCreate.stagedTargets as {
    url: string;
    resourceUrl: string;
    parameters: { name: string; value: string }[];
  }[];

  for (let i = 0; i < items.length; i++) {
    const form = new FormData();
    targets[i].parameters.forEach((p) => form.append(p.name, p.value));
    form.append("file", new Blob([new Uint8Array(items[i].buf)], { type: "image/jpeg" }), `${items[i].dev.id}.jpg`);
    const up = await fetch(targets[i].url, { method: "POST", body: form });
    if (!up.ok) throw new Error(`Upload failed for ${items[i].dev.name} (${up.status})`);
  }

  // 2. Add images to the product (tagged so we can find them)
  const tag = `cc${Date.now()}`;
  const upd = await gql(
    admin,
    `mutation($product:ProductUpdateInput!,$media:[CreateMediaInput!]){productUpdate(product:$product,media:$media){product{id title} userErrors{message}}}`,
    {
      product: { id: productId },
      media: items.map((it, i) => ({
        originalSource: targets[i].resourceUrl,
        mediaContentType: "IMAGE",
        alt: `${tag}:${it.dev.id}`,
      })),
    },
  );
  const uErr = upd.productUpdate.userErrors;
  if (uErr.length) throw new Error(uErr.map((e: { message: string }) => e.message).join(", "));
  const title: string = upd.productUpdate.product.title;

  // 3. Wait until Shopify finishes processing
  let media: { id: string; alt: string; status: string }[] = [];
  for (let n = 0; n < 40; n++) {
    const d = await gql(
      admin,
      `query($id:ID!){product(id:$id){media(first:250){nodes{id alt status}}}}`,
      { id: productId },
    );
    media = (d.product.media.nodes as typeof media).filter((m) => m.alt?.startsWith(tag));
    if (media.length >= items.length && media.every((m) => m.status === "READY" || m.status === "FAILED")) break;
    await new Promise((r) => setTimeout(r, 1500));
  }
  const mediaByDevice = new Map(
    media.filter((m) => m.status === "READY").map((m) => [m.alt.split(":")[1], m.id]),
  );

  // 4. Match variants to devices (best match across ALL devices)
  const v = await gql(
    admin,
    `query($id:ID!){product(id:$id){variants(first:250){nodes{id title selectedOptions{name value}}}}}`,
    { id: productId },
  );
  const variants = v.product.variants.nodes as {
    id: string;
    selectedOptions: { name: string; value: string }[];
  }[];
  const wanted = new Set(items.map((i) => i.dev.id));
  const links: Record<string, string[]> = {};

  for (const variant of variants) {
    let best: { id: string; score: number } | null = null;
    for (const dev of allDevices) {
      const token = norm(dev.name);
      for (const opt of variant.selectedOptions) {
        const val = norm(opt.value);
        const score = val === token ? 1000 + token.length : val.includes(token) ? token.length : 0;
        if (score > 0 && (!best || score > best.score)) best = { id: dev.id, score };
      }
    }
    if (best && wanted.has(best.id) && mediaByDevice.has(best.id)) {
      (links[best.id] ||= []).push(variant.id);
    }
  }

  // 5. Attach each image to its variants
  const variantMedia = Object.entries(links).flatMap(([devId, ids]) =>
    ids.map((variantId) => ({ variantId, mediaIds: [mediaByDevice.get(devId)!] })),
  );
  if (variantMedia.length) {
    const a = await gql(
      admin,
      `mutation($productId:ID!,$variantMedia:[ProductVariantAppendMediaInput!]!){productVariantAppendMedia(productId:$productId,variantMedia:$variantMedia){userErrors{message}}}`,
      { productId, variantMedia },
    );
    const e = a.productVariantAppendMedia.userErrors;
    if (e.length) throw new Error(e.map((x: { message: string }) => x.message).join(", "));
  }

  return {
    title,
    attached: items
      .filter((i) => links[i.dev.id])
      .map((i) => ({ name: i.dev.name, variants: links[i.dev.id].length })),
    unmatched: items.filter((i) => !links[i.dev.id]).map((i) => i.dev.name),
  };
}