export type Device = {
  id: string;
  name: string;
  category: string;
  w: number;
  h: number;
  r: number;
  cam: "triple" | "dual" | "single" | "bar" | "lenses" | "logo";
};

// [name, category, width mm, height mm, corner radius %, camera]
type Row = [string, string, number, number, number, Device["cam"]];

const rows: Row[] = [
  ["iPhone 17 Pro Max", "iPhone", 78.0, 163.4, 13, "bar"],
  ["iPhone 17 Pro", "iPhone", 71.9, 150.0, 13, "bar"],
  ["iPhone Air", "iPhone", 74.7, 156.2, 13, "single"],
  ["iPhone 17", "iPhone", 71.5, 149.6, 13, "dual"],
  ["iPhone 16 Pro Max", "iPhone", 77.6, 163.0, 13, "triple"],
  ["iPhone 16 Pro", "iPhone", 71.5, 149.6, 13, "triple"],
  ["iPhone 16 Plus", "iPhone", 77.8, 160.9, 13, "dual"],
  ["iPhone 16", "iPhone", 71.6, 147.6, 13, "dual"],
  ["iPhone 15 Pro Max", "iPhone", 76.7, 159.9, 13, "triple"],
  ["iPhone 15 Pro", "iPhone", 70.6, 146.6, 13, "triple"],
  ["iPhone 15", "iPhone", 71.6, 147.6, 13, "dual"],
  ["iPhone 14 Pro Max", "iPhone", 77.6, 160.7, 13, "triple"],
  ["iPhone 14", "iPhone", 71.5, 146.7, 13, "dual"],
  ["iPhone 13", "iPhone", 71.5, 146.7, 13, "dual"],
  ["iPad Pro 13\"", "iPad", 215.5, 281.6, 4.5, "dual"],
  ["iPad Pro 11\"", "iPad", 177.5, 249.7, 4.5, "dual"],
  ["iPad Air 13\"", "iPad", 214.9, 280.6, 4.5, "single"],
  ["iPad Air 11\"", "iPad", 178.5, 247.6, 4.5, "single"],
  ["iPad 11\"", "iPad", 179.5, 248.6, 4.5, "single"],
  ["iPad mini", "iPad", 134.8, 195.4, 5, "single"],
  ["MacBook Air 13\"", "MacBook", 304.1, 215.0, 4, "logo"],
  ["MacBook Air 15\"", "MacBook", 340.4, 237.6, 4, "logo"],
  ["MacBook Pro 14\"", "MacBook", 312.6, 221.2, 4, "logo"],
  ["MacBook Pro 16\"", "MacBook", 355.7, 248.1, 4, "logo"],
  ["Galaxy S25 Ultra", "Samsung", 77.6, 162.8, 9, "lenses"],
  ["Galaxy S25+", "Samsung", 75.8, 158.4, 11, "lenses"],
  ["Galaxy S25", "Samsung", 70.5, 146.9, 11, "lenses"],
  ["Pixel 10 Pro", "Pixel", 72.0, 152.8, 12, "bar"],
];

export const DEVICES: Device[] = rows.map(([name, category, w, h, r, cam]) => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-$/, ""),
  name,
  category,
  w,
  h,
  r,
  cam,
}));

export const CATEGORIES = Array.from(new Set(DEVICES.map((d) => d.category)));