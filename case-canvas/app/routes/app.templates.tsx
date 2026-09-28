import { useEffect, useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { CATEGORIES, DEVICES, type Device } from "../lib/devices";
import { getStatus, removeMockup, saveArea, saveImage, type Area } from "../lib/templates.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { status: await getStatus(DEVICES.map((d) => d.id)) };
};

type R = { ok: boolean; error: string | null; saved: string | null; intent: string };

export const action = async ({ request }: ActionFunctionArgs): Promise<R> => {
  await authenticate.admin(request);
  const fd = await request.formData();
  const id = String(fd.get("id"));
  const intent = String(fd.get("intent"));
  const fail = (error: string): R => ({ ok: false, error, saved: null, intent });
  if (!DEVICES.some((d) => d.id === id)) return fail("Unknown device.");
  try {
    if (intent === "delete") await removeMockup(id);
    else if (intent === "area") {
      const n = (k: string) => Number(fd.get(k));
      await saveArea(id, {
        x: n("x"), y: n("y"), w: n("w"), h: n("h"), r: n("r"),
        cx: n("cx"), cy: n("cy"), cw: n("cw"), ch: n("ch"), cr: n("cr"),
      });
    } else {
      const f = fd.get("file");
      if (!(f instanceof File) || f.size === 0) return fail("Choose an image first.");
      await saveImage(id, Buffer.from(await f.arrayBuffer()));
    }
    return { ok: true, error: null, saved: id, intent };
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Something went wrong.");
  }
};

const CSS = `
.tp{max-width:1100px;margin:0 auto;padding:4px 0 40px;color:#1a1a1a}
.tp .hero{background:linear-gradient(135deg,#4f46e5,#9333ea);color:#fff;border-radius:16px;padding:20px 24px;margin-bottom:16px}
.tp .hero h2{margin:0 0 4px;font-size:20px}.tp .hero p{margin:0;opacity:.85;font-size:14px}
.tp .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.tp .tab{border:1px solid #d5d8e0;background:#fff;border-radius:99px;padding:5px 13px;cursor:pointer;font-size:13px}
.tp .tab.on{background:#4f46e5;color:#fff;border-color:#4f46e5}
.tp .list{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
.tp .card{background:#fff;border-radius:14px;padding:12px;box-shadow:0 1px 3px rgba(0,0,0,.12)}
.tp .thumb{height:170px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:12px;color:#888;text-align:center;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 50%/14px 14px;margin-bottom:10px}
.tp .thumb img{max-width:100%;max-height:100%}
.tp h4{margin:0 0 8px;font-size:14px}
.tp .btns{display:flex;gap:6px;flex-wrap:wrap}
.tp .b{border:1px solid #c4c7d0;background:#fff;border-radius:8px;padding:5px 10px;font-size:12px;cursor:pointer}
.tp .b.p{background:#4f46e5;color:#fff;border-color:#4f46e5}
.tp .b.d{color:#b91c1c;border-color:#f1c0c0}
.tp .err{background:#fde8e8;color:#9b1c1c;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:13px}
.tp .modal{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:999;display:flex;align-items:center;justify-content:center;padding:16px}
.tp .panel{background:#fff;border-radius:16px;padding:18px;max-width:780px;width:100%;max-height:92vh;overflow:auto;display:flex;gap:18px;flex-wrap:wrap}
.tp .stage{position:relative;width:320px;background:#eee;flex:none}
.tp .stage img{width:100%;display:block}
.tp .box{position:absolute;border:2px dashed #4f46e5;background:rgba(99,102,241,.3)}
.tp .box.cut{border-color:#ea580c;background:rgba(249,115,22,.4)}
.tp .row{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px}
.tp .row span{width:60px}.tp .row input{flex:1}
.tp .sec{margin:14px 0 4px;font-weight:600;font-size:13px}
`;

function Editor({ dev, thumb, area, saving, onSave, onClose }: {
  dev: Device; thumb: string; area: Area; saving: boolean;
  onSave: (a: Area) => void; onClose: () => void;
}) {
  const [a, setA] = useState<Area>(area);
  const [ratio, setRatio] = useState(1.5);
  const W = 320;
  const H = W * ratio;
  const hasCut = a.cw > 0;
  const set = (k: keyof Area, v: number) => setA((s) => ({ ...s, [k]: v }));
  const slider = (label: string, k: keyof Area, min: number, max: number, div: number) => (
    <div className="row">
      <span>{label}</span>
      <input type="range" min={min} max={max} value={Math.round(a[k] * div)} onChange={(e) => set(k, +e.target.value / div)} />
    </div>
  );
  const toggleCut = (on: boolean) =>
    setA((s) =>
      on
        ? { ...s, cx: s.x + 0.03, cy: s.y + 0.02, cw: 0.4, ch: 0.2, cr: 15 }
        : { ...s, cw: 0, ch: 0 },
    );
  return (
    <div className="modal" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <div className="stage" style={{ height: H }}>
          <img src={thumb} alt={dev.name} onLoad={(e) => setRatio(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)} />
          <div className="box" style={{ left: a.x * W, top: a.y * H, width: a.w * W, height: a.h * H, borderRadius: (a.r / 100) * Math.min(a.w * W, a.h * H) }} />
          {hasCut && (
            <div className="box cut" style={{ left: a.cx * W, top: a.cy * H, width: a.cw * W, height: a.ch * H, borderRadius: (a.cr / 100) * Math.min(a.cw * W, a.ch * H) }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 230 }}>
          <h3 style={{ marginTop: 0 }}>{dev.name}</h3>
          <div className="sec" style={{ marginTop: 0 }}>1. Design area (blue box)</div>
          {slider("Left", "x", 0, 95, 100)}
          {slider("Top", "y", 0, 95, 100)}
          {slider("Width", "w", 5, 100, 100)}
          {slider("Height", "h", 5, 100, 100)}
          {slider("Corners", "r", 0, 50, 1)}
          <div className="sec">2. Camera cutout (orange box)</div>
          <label style={{ fontSize: 13 }}>
            <input type="checkbox" checked={hasCut} onChange={(e) => toggleCut(e.target.checked)} /> Keep the camera area free of the design
          </label>
          {hasCut && (
            <>
              {slider("Left", "cx", 0, 98, 100)}
              {slider("Top", "cy", 0, 98, 100)}
              {slider("Width", "cw", 2, 100, 100)}
              {slider("Height", "ch", 2, 100, 100)}
              {slider("Corners", "cr", 0, 50, 1)}
            </>
          )}
          <div className="btns" style={{ marginTop: 14 }}>
            <button className="b p" disabled={saving} onClick={() => onSave(a)}>{saving ? "Saving…" : "Save"}</button>
            <button className="b" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Mockups() {
  const { status } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [cat, setCat] = useState(CATEGORIES[0]);
  const [editing, setEditing] = useState<string | null>(null);
  const shown = DEVICES.filter((d) => d.category === cat);
  const custom = DEVICES.filter((d) => status[d.id]?.thumb).length;
  const saving = fetcher.state !== "idle";

  useEffect(() => {
    const d = fetcher.data;
    if (!d?.ok || !d.saved) return;
    if (d.intent === "upload") setEditing(d.saved);
    if (d.intent === "area") setEditing(null);
  }, [fetcher.data]);

  const send = (id: string, intent: string, extra: Record<string, string | File> = {}) => {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("intent", intent);
    Object.entries(extra).forEach(([k, v]) => fd.set(k, v));
    fetcher.submit(fd, { method: "post", encType: "multipart/form-data" });
  };

  const dev = DEVICES.find((d) => d.id === editing);

  return (
    <s-page heading="Mockups">
      <style>{CSS}</style>
      <div className="tp">
        <div className="hero">
          <h2>Your mockup images</h2>
          <p>Press “Replace mockup” and upload a photo of the blank case. Models without a photo use the default drawn case.</p>
        </div>
        {fetcher.data?.error && <div className="err">{fetcher.data.error}</div>}
        <p style={{ fontSize: 13, color: "#555" }}>{custom} of {DEVICES.length} models use your own image{saving && " · saving…"}</p>
        <div className="tabs">
          {CATEGORIES.map((c) => (
            <button key={c} className={`tab ${c === cat ? "on" : ""}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
        <div className="list">
          {shown.map((d) => {
            const s = status[d.id];
            return (
              <div className="card" key={d.id}>
                <div className="thumb">{s?.thumb ? <img src={s.thumb} alt={d.name} /> : "Default drawn case"}</div>
                <h4>{d.name}</h4>
                <div className="btns">
                  <label className="b p">
                    {s?.thumb ? "Replace mockup" : "Upload mockup"}
                    <input
                      type="file"
                      accept="image/png,image/jpeg"
                      hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) send(d.id, "upload", { file: f });
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {s?.thumb && <button className="b" onClick={() => setEditing(d.id)}>Design area</button>}
                  {s?.thumb && <button className="b d" onClick={() => send(d.id, "delete")}>Use default</button>}
                </div>
              </div>
            );
          })}
        </div>
        {dev && status[dev.id]?.thumb && (
          <Editor
            key={dev.id}
            dev={dev}
            thumb={status[dev.id].thumb as string}
            area={status[dev.id].area}
            saving={saving}
            onClose={() => setEditing(null)}
            onSave={(a) =>
              send(dev.id, "area", {
                x: String(a.x), y: String(a.y), w: String(a.w), h: String(a.h), r: String(a.r),
                cx: String(a.cx), cy: String(a.cy), cw: String(a.cw), ch: String(a.ch), cr: String(a.cr),
              })
            }
          />
        )}
      </div>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};