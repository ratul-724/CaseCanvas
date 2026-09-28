import { useMemo, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { CATEGORIES, DEVICES } from "../lib/devices";
import { loadDesign, render, type Opts } from "../lib/mockup.server";
import { publishToProduct } from "../lib/publish.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

type Result = {
  error: string | null;
  mockups: { id: string; name: string; src: string }[];
  published?: { title: string; attached: { name: string; variants: number }[]; unmatched: string[] };
};

export const action = async ({ request }: ActionFunctionArgs): Promise<Result> => {
  const { admin } = await authenticate.admin(request);
  const fd = await request.formData();
  const file = fd.get("design");
  const intent = fd.get("intent") === "publish" ? "publish" : "preview";
  const ids: string[] = JSON.parse(String(fd.get("ids") || "[]"));
  const list = DEVICES.filter((d) => ids.includes(d.id));

  if (!(file instanceof File) || file.size === 0) return { error: "Choose a design image first.", mockups: [] };
  if (!list.length) return { error: "Select at least one device.", mockups: [] };

  const num = (k: string, f: number) => {
    const v = Number(fd.get(k));
    return Number.isFinite(v) ? v : f;
  };
  const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
  const o: Opts = {
    fit: fd.get("fit") === "contain" ? "contain" : "cover",
    zoom: clamp(num("zoom", 1), 0.5, 3),
    ox: clamp(num("ox", 0), -100, 100),
    oy: clamp(num("oy", 0), -100, 100),
    bg: String(fd.get("bg") || ""),
    dbg: String(fd.get("dbg") || ""),
  };

  try {
    const design = await loadDesign(Buffer.from(await file.arrayBuffer()));

    if (intent === "publish") {
      const productId = String(fd.get("productId") || "");
      if (!productId) return { error: "Choose a product first.", mockups: [] };
      const items = [];
      for (const dev of list) items.push({ dev, buf: await render(design, dev, o, 1600, 90) });
      const published = await publishToProduct(admin, productId, items, DEVICES);
      return { error: null, mockups: [], published };
    }

    const mockups: Result["mockups"] = [];
    for (const dev of list) {
      const buf = await render(design, dev, o, 700);
      mockups.push({ id: dev.id, name: dev.name, src: `data:image/jpeg;base64,${buf.toString("base64")}` });
    }
    return { error: null, mockups };
  } catch (err) {
    console.error("Studio error:", err);
    return { error: err instanceof Error ? err.message : "Something went wrong.", mockups: [] };
  }
};

const CSS = `
.cc{max-width:1100px;margin:0 auto;padding:4px 0 90px;color:#1a1a1a}
.cc .hero{background:linear-gradient(135deg,#4f46e5,#9333ea);color:#fff;border-radius:16px;padding:22px 26px;margin-bottom:16px}
.cc .hero h2{margin:0 0 4px;font-size:20px}.cc .hero p{margin:0;opacity:.85;font-size:14px}
.cc .grid{display:grid;grid-template-columns:340px 1fr;gap:16px}
@media(max-width:860px){.cc .grid{grid-template-columns:1fr}}
.cc .card{background:#fff;border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,.12);margin-bottom:16px}
.cc h3{margin:0 0 12px;font-size:15px}
.cc .drop{display:block;border:2px dashed #c4c7d0;border-radius:12px;padding:18px;text-align:center;cursor:pointer;background:#fafafc}
.cc .drop:hover{border-color:#6366f1;background:#f5f5ff}
.cc .drop img{max-width:100%;max-height:120px;border-radius:8px}
.cc .row{display:flex;align-items:center;gap:10px;margin:10px 0;font-size:13px}
.cc .row span{width:76px;color:#555}.cc .row input[type=range]{flex:1}
.cc .seg{display:flex;background:#eef0f4;border-radius:10px;padding:3px;margin:10px 0}
.cc .seg button{flex:1;border:0;background:none;padding:7px;border-radius:8px;cursor:pointer;font-size:13px}
.cc .seg button.on{background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.18);font-weight:600}
.cc .frame{margin:12px auto 0;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.28);border:3px solid #222}
.cc .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.cc .tab{border:1px solid #d5d8e0;background:#fff;border-radius:99px;padding:5px 13px;cursor:pointer;font-size:13px}
.cc .tab.on{background:#4f46e5;color:#fff;border-color:#4f46e5}
.cc .devs{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px}
.cc .dev{border:1.5px solid #e1e4ea;border-radius:10px;padding:10px;cursor:pointer;font-size:13px;background:#fff}
.cc .dev.on{border-color:#4f46e5;background:#f3f2ff;font-weight:600}
.cc .dev small{display:block;color:#777;font-weight:400;margin-top:2px}
.cc .out{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px}
.cc figure{margin:0;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.14)}
.cc figure img{width:100%;display:block;cursor:zoom-in}
.cc figcaption{display:flex;justify-content:space-between;padding:9px 12px;font-size:13px}
.cc figcaption a{color:#4f46e5;text-decoration:none;font-weight:600}
.cc .bar{position:sticky;bottom:12px;background:#111;color:#fff;border-radius:14px;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.3)}
.cc .go{background:#6366f1;color:#fff;border:0;border-radius:10px;padding:10px 20px;font-size:14px;font-weight:600;cursor:pointer}
.cc .go.alt{background:#fff;color:#111}
.cc .go:disabled{opacity:.5;cursor:default}
.cc .err{background:#fde8e8;color:#9b1c1c;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:13px}
.cc .ok{background:#e6f6ec;color:#14532d;border-radius:10px;padding:12px 14px;margin-bottom:14px;font-size:13px}
.cc .link{background:none;border:0;color:#4f46e5;cursor:pointer;font-size:12px;padding:0}
.cc .lb{position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:999;display:flex;align-items:center;justify-content:center;cursor:zoom-out}
.cc .lb img{max-width:92vw;max-height:92vh;border-radius:12px}
`;

export default function Studio() {
  const shopify = useAppBridge();
  const fetcher = useFetcher<typeof action>();
  const pub = useFetcher<typeof action>();
  const [file, setFile] = useState<File | null>(null);
  const url = useMemo(() => (file ? URL.createObjectURL(file) : ""), [file]);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [zoom, setZoom] = useState(100);
  const [ox, setOx] = useState(0);
  const [oy, setOy] = useState(0);
  const [bg, setBg] = useState("#f1f2f4");
  const [dbg, setDbg] = useState("#ffffff");
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [sel, setSel] = useState<Set<string>>(new Set(["iphone-16-pro"]));
  const [product, setProduct] = useState<{ id: string; title: string } | null>(null);
  const [big, setBig] = useState("");

  const busy = fetcher.state !== "idle";
  const publishing = pub.state !== "idle";
  const first = DEVICES.find((d) => sel.has(d.id)) ?? DEVICES[0];
  const fw = first.w > first.h ? 230 : 140;
  const fh = (fw * first.h) / first.w;
  const shown = DEVICES.filter((d) => d.category === cat);

  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const toggleCategory = () =>
    setSel((s) => {
      const n = new Set(s);
      const all = shown.every((d) => n.has(d.id));
      shown.forEach((d) => (all ? n.delete(d.id) : n.add(d.id)));
      return n;
    });

  const build = (intent: string) => {
    const fd = new FormData();
    fd.set("intent", intent);
    fd.set("design", file as File);
    fd.set("fit", fit);
    fd.set("zoom", String(zoom / 100));
    fd.set("ox", String(ox));
    fd.set("oy", String(oy));
    fd.set("bg", bg);
    fd.set("dbg", dbg);
    fd.set("ids", JSON.stringify(Array.from(sel)));
    if (product) fd.set("productId", product.id);
    return fd;
  };
  const opts = { method: "post" as const, encType: "multipart/form-data" as const };
  const generate = () => file && sel.size && fetcher.submit(build("preview"), opts);
  const publish = () => file && sel.size && product && pub.submit(build("publish"), opts);

  const chooseProduct = async () => {
    const picked = await shopify.resourcePicker({ type: "product", multiple: false });
    if (picked && picked[0]) setProduct({ id: picked[0].id, title: picked[0].title });
  };

  const data = fetcher.data;
  const done = pub.data?.published;

  return (
    <s-page heading="CaseCanvas Studio">
      <style>{CSS}</style>
      <div className="cc">
        {big && (
          <div className="lb" onClick={() => setBig("")}>
            <img src={big} alt="Mockup preview" />
          </div>
        )}
        <div className="hero">
          <h2>One design, every device</h2>
          <p>Upload artwork, pick devices, then publish each mockup to its matching product variant.</p>
        </div>

        {(data?.error || pub.data?.error) && <div className="err">{data?.error || pub.data?.error}</div>}
        {done && (
          <div className="ok">
            <b>Published to “{done.title}”.</b> Attached to variants:{" "}
            {done.attached.map((a) => `${a.name} (${a.variants})`).join(", ") || "none"}.
            {done.unmatched.length > 0 && (
              <> No matching variant found for: {done.unmatched.join(", ")}. (The variant option value must equal the model name.)</>
            )}
          </div>
        )}

        <div className="grid">
          <div>
            <div className="card">
              <h3>1. Your design</h3>
              <label className="drop">
                <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {url ? <img src={url} alt="Design" /> : "Click to upload a PNG or JPG"}
              </label>
            </div>

            <div className="card">
              <h3>2. Adjust</h3>
              <div className="seg">
                <button className={fit === "cover" ? "on" : ""} onClick={() => setFit("cover")}>Fill</button>
                <button className={fit === "contain" ? "on" : ""} onClick={() => setFit("contain")}>Fit</button>
              </div>
              <div className="row"><span>Zoom</span>
                <input type="range" min={50} max={300} value={zoom} onChange={(e) => setZoom(+e.target.value)} />
              </div>
              <div className="row"><span>Left / Right</span>
                <input type="range" min={-100} max={100} value={ox} onChange={(e) => setOx(+e.target.value)} />
              </div>
              <div className="row"><span>Up / Down</span>
                <input type="range" min={-100} max={100} value={oy} onChange={(e) => setOy(+e.target.value)} />
              </div>
              <div className="row"><span>Backdrop</span>
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} />
                <span>Case fill</span>
                <input type="color" value={dbg} onChange={(e) => setDbg(e.target.value)} />
              </div>
              <div className="frame" style={{ width: fw, height: fh, borderRadius: (first.r / 100) * Math.min(fw, fh), background: dbg }}>
                {url && (
                  <img
                    src={url}
                    alt="Live preview"
                    style={{ width: "100%", height: "100%", objectFit: fit, transform: `translate(${ox}%, ${oy}%) scale(${zoom / 100})` }}
                  />
                )}
              </div>
              <p style={{ textAlign: "center", fontSize: 12, color: "#777" }}>Live preview on {first.name}</p>
            </div>
          </div>

          <div>
            <div className="card">
              <h3>3. Choose devices</h3>
              <div className="tabs">
                {CATEGORIES.map((c) => (
                  <button key={c} className={`tab ${c === cat ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>
                ))}
              </div>
              <button className="link" onClick={toggleCategory}>Select / clear all {cat}</button>
              <div className="devs" style={{ marginTop: 10 }}>
                {shown.map((d) => (
                  <div key={d.id} className={`dev ${sel.has(d.id) ? "on" : ""}`} onClick={() => toggle(d.id)}>
                    {d.name}
                    <small>{d.w} × {d.h} mm</small>
                  </div>
                ))}
              </div>
            </div>

            {data && data.mockups.length > 0 && (
              <div className="card">
                <h3>Your mockups ({data.mockups.length}) · click to enlarge</h3>
                <div className="out">
                  {data.mockups.map((m) => (
                    <figure key={m.id}>
                      <img src={m.src} alt={m.name} onClick={() => setBig(m.src)} />
                      <figcaption>
                        {m.name}
                        <a href={m.src} download={`${m.id}.jpg`}>Download</a>
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <h3>4. Publish to Shopify</h3>
              <p style={{ fontSize: 13, color: "#555", marginTop: 0 }}>
                Pick a product. Each selected mockup is added to it and linked to the variant whose option value matches the model name (for example “iPhone 16 Pro”).
              </p>
              <button className="go alt" style={{ border: "1px solid #c4c7d0" }} onClick={chooseProduct}>
                {product ? `Product: ${product.title}` : "Choose product"}
              </button>
            </div>
          </div>
        </div>

        <div className="bar">
          <span>{sel.size} device{sel.size === 1 ? "" : "s"} selected{!file && " · upload a design first"}</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button className="go alt" disabled={!file || !sel.size || busy} onClick={generate}>
              {busy ? "Generating…" : "Preview mockups"}
            </button>
            <button className="go" disabled={!file || !sel.size || !product || publishing} onClick={publish}>
              {publishing ? "Publishing…" : "Publish to product"}
            </button>
          </span>
        </div>
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};