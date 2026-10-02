import JSZip from "jszip";

// Ekstraksi GAMBAR (picture) dan BENTUK/TEXTBOX (shape) dari file .xlsx asli.
// xlsx-js-style TIDAK membaca gambar — di sini zip dibuka sendiri (jszip):
//   workbook.xml + rels -> nama sheet -> worksheet -> drawing -> anchor
//   (xdr:pic / xdr:sp) -> media (base64 data-url) atau properti teks/warna.
// Hasil disimpan per nama sheet, disusun sesuai urutan menggambar (z-order),
// dan dirender sebagai lapisan overlay pada posisi sel/baris/kolom EXACT.

const EMU = 9525; // EMU per px (914400/96)

const SCHEME_BASE = {
  lt1: "#FFFFFF",
  dk1: "#000000",
  tx1: "#000000",
  bg1: "#FFFFFF",
  accent1: "#4472C4",
  accent2: "#ED7D31",
  accent3: "#A5A5A5",
  accent4: "#FFC000",
  accent5: "#5B9BD5",
  accent6: "#70AD47",
  hyperlink: "#0563C1",
  folHlink: "#954F72",
};

const MIME_BY_EXT = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  webp: "image/webp",
  tiff: "image/tiff",
};

function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&#10;/g, "\n")
    .replace(/&#x0A;/g, "\n")
    .replace(/<xdr:?t[^>]*>/g, "");
}

function esc(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function intAttr(xml, tag) {
  const m = xml.match(new RegExp(`<${esc(tag)}>(-?\\d+)</${esc(tag)}>`));
  return m ? parseInt(m[1], 10) : 0;
}

function extCxCy(xml) {
  const m = xml.match(/<xdr:ext\s+cx="(-?\d+)"\s+cy="(-?\d+)"/);
  if (!m) return null;
  return { cx: parseInt(m[1], 10), cy: parseInt(m[2], 10), m };
}

function rgba(s) {
  if (!s) return null;
  if (/^[0-9A-Fa-f]{6}$/.test(s)) return "#" + s.toLowerCase();
  if (/^[0-9A-Fa-f]{8}$/.test(s)) return "#" + s.slice(2).toLowerCase();
  return s.toLowerCase();
}

function solidColor(xml) {
  // Cari <a:solidFill> ... <a:srgbClr val=...> atau <a:schemeClr val=...>
  const sx = xml.indexOf("<a:solidFill");
  if (sx < 0) return null;
  const seg = xml.slice(sx, sx + 2600);
  const srgb = seg.match(/<a:srgbClr\s+val="([0-9A-Fa-f]{6,8})"/);
  if (srgb) return rgba(srgb[1]);
  const scheme = seg.match(/<a:schemeClr\s+val="([^"]+)"/);
  if (scheme) return SCHEME_BASE[scheme[1]] || null;
  if (/<a:noFill\s*\/?\s*>/.test(seg)) return "transparent";
  return null;
}

function borderInfo(xml) {
  const lm = xml.match(/<a:ln\s+w="(\d+)"[^>]*>/);
  if (!lm) return null;
  const weight = Math.max(1, Math.round(parseInt(lm[1], 10) / 12700));
  return { weight, color: solidColor(xml) || "#000000" };
}

function alignH(xml) {
  const m = xml.match(/<a:pPr[^>]*\balgn="([^"]+)"/);
  if (!m) return null;
  const v = m[1];
  if (v === "ctr" || v === "lctr" || v === "rctr") return "center";
  if (v === "r") return "right";
  if (v === "just" || v === "thaiDist") return "justify";
  return "left";
}

function extractText(anchorXml) {
  const paras = anchorXml.split("</a:p>");
  const lines = [];
  for (const p of paras) {
    const ts = [];
    const re = /<a:t>([\s\S]*?)<\/a:t>/g;
    let m;
    while ((m = re.exec(p)) !== null) ts.push(decodeEntities(m[1]));
    if (ts.length) lines.push(ts.join(""));
  }
  const join = lines.join("\n").replace(/\s+$/g, "").replace(/\n{3,}/g, "\n\n");
  if (join.trim() === "") return "";
  return join;
}

function runStyle(xml) {
  const r = { sizePx: 16, family: null, color: null, bold: false };
  const rm = xml.match(/<a:rPr[^>]*\bsz="(\d+)"/);
  if (rm) r.sizePx = Math.round((parseInt(rm[1], 10) / 100) * (96 / 72) * 10) / 10;
  if (/\ba:rPr[^>]*\bb="1"/.test(xml)) r.bold = true;
  const fam = xml.match(/<a:latin\s+typeface="([^"]+)"/);
  if (fam) r.family = fam[1];
  // warna teks = solidFill pada a:rPr (bukan pada spPr)
  const perRun = xml.match(/<a:rPr[^>]*>([\s\S]*?)<\/a:rPr>/g);
  if (perRun) {
    for (const seg of perRun) {
      const c = solidColor(seg);
      if (c) {
        r.color = rgba(c === "transparent" ? null : c.replace("#", ""));
        if (r.color) break;
      }
    }
  }
  return r;
}

function bufToDataUrl(buffer, mime) {
  const bytes = new Uint8Array(buffer);
  let bin = "";
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
  }
  return `data:${mime};base64,${btoa(bin)}`;
}

/**
 * Buka zip file .xlsx dari buffer (ArrayBuffer / Uint8Array).
 * Dipakai bersama oleh ekstraksi gambar (sini) dan ekstraksi style (excelRawStyles).
 */
export async function openFileZip(buffer) {
  return JSZip.loadAsync(buffer);
}

/**
 * Baca seluruh gambar & bentuk dari ZIP yang sudah dibuka (openFileZip).
 * @param {Object} zip instance JSZip
 * @returns {Promise<Record<string, Array<object>>>} map nama-sheet -> [objek]
 */
export async function extractImagesFromZip(zip) {
  const readStr = async (p) => {
    const f = zip.file(p);
    if (!f) return null;
    return f.async("string");
  };

  const wbXml = await readStr("xl/workbook.xml");
  const wbRels = await readStr("xl/_rels/workbook.xml.rels");
  if (!wbXml) return {};

  // rId pascal (rId -> target path) dari rels workbook
  const relTarget = {};
  if (wbRels) {
    const re = /<Relationship\s+Id="(rId\d+)"[^>]*Target="([^"]+)"/g;
    let m;
    while ((m = re.exec(wbRels)) !== null) relTarget[m[1]] = m[2];
  }
  // sheet name per rId
  const nameByRid = {};
  const reName = /<sheet[^>]*\bname="([^"]*)"[^>]*\br:id="(rId\d+)"/g;
  let m;
  while ((m = reName.exec(wbXml)) !== null) nameByRid[m[2]] = m[1];

  const imagesBySheet = {};

  for (const rid of Object.keys(nameByRid)) {
    const sheetName = nameByRid[rid];
    const target = relTarget[rid];
    if (!target || !/worksheets\/sheet\d+\.xml/.test(target)) continue;
    const base = target.split("/").pop(); // sheet1.xml
    const sheetRels = await readStr(`xl/worksheets/_rels/${base}.rels`);
    if (!sheetRels) continue;

    // rels worksheet -> drawing
    const drawingRe = /<Relationship\s+Id="(rId\d+)"[^>]*Type="[^"]*\/drawing"[^>]*Target="([^"]+)"/;
    const drew = drawingRe.exec(sheetRels);
    if (!drew) continue;
    const drawingPath = drew[2].replace(/^\.\.\//, "");
    const drawingXml = await readStr(`xl/${drawingPath}`);
    const drawingRels = await readStr(`xl/drawings/_rels/${drawingPath.split("/").pop()}.rels`);

    // drawing rels: rId -> media path
    const imgTarget = {};
    if (drawingRels) {
      const re2 = /<Relationship\s+Id="(rId\d+)"[^>]*Target="([^"]+)"/g;
      let m2;
      while ((m2 = re2.exec(drawingRels)) !== null) imgTarget[m2[1]] = m2[2];
    }

    const objs = [];
    if (drawingXml) {
      // anchor bisa bersarang di dalam grpSp; pola global menangkap semuanya
      const anchorRe = /<xdr:(oneCellAnchor|twoCellAnchor)[^>]*>([\s\S]*?)<\/xdr:\1>/g;
      let am;
      while ((am = anchorRe.exec(drawingXml)) !== null) {
        const inner = am[2];
        const col = intAttr(inner, "xdr:col");
        const colOff = intAttr(inner, "xdr:colOff");
        const row = intAttr(inner, "xdr:row");
        const rowOff = intAttr(inner, "xdr:rowOff");

        let w = 0;
        let h = 0;
        const ext = extCxCy(inner);
        if (am[1] === "twoCellAnchor") {
          // dua sel: lebar/tinggi dihitung renderer (pakai lebar kolom & tinggi
          // baris model setempat); di sini hanya bawa rentang + offset ke-2 sel.
          const afterFrom = inner.slice(inner.indexOf("</xdr:from>"));
          const toCol2 = intAttr(afterFrom, "xdr:col");
          const toColOff2 = intAttr(afterFrom, "xdr:colOff");
          const toRow2 = intAttr(afterFrom, "xdr:row");
          const toRowOff2 = intAttr(afterFrom, "xdr:rowOff");
          objs.push({
            type: "twoCellAnchor",
            col, row,
            dxPx: colOff / EMU,
            dyPx: rowOff / EMU,
            colSpan: toCol2 - col,
            rowSpan: toRow2 - row,
            dToXPx: (toColOff2 - colOff) / EMU,
            dToYPx: (toRowOff2 - rowOff) / EMU,
          });
        } else {
          if (ext) {
            w = ext.cx / EMU;
            h = ext.cy / EMU;
          } else {
            w = 80;
            h = 80;
          }
        }

        const idx = objs.length;

        if (/<xdr:pic[\s>]/.test(inner)) {
          const embed = inner.match(/<a:blip[^>]*\bembed="([^"]+)"/);
          const mediaPath = embed && imgTarget[embed[1]] ? imgTarget[embed[1]].replace(/^\.\.\//, "") : null;
          let dataUrl = null;
          let mime = "image/png";
          if (mediaPath) {
            const f = zip.file(`xl/${mediaPath}`);
            if (f) {
              mime = MIME_BY_EXT[mediaPath.split(".").pop().toLowerCase()] || "image/png";
              const buf = await f.async("arraybuffer");
              dataUrl = bufToDataUrl(buf, mime);
            }
          }
          const nm = (inner.match(/<xdr:cNvPr[^>]*name="([^"]+)"/) || [])[1] || "";
          objs.push({
            type: "pic",
            name: nm,
            col, row,
            dxPx: colOff / EMU,
            dyPx: rowOff / EMU,
            w: Math.max(1, Math.round(w)),
            h: Math.max(1, Math.round(h)),
            dataUrl,
            mime,
            mediaPath,
            z: idx,
          });
        } else if (/<xdr:sp[\s>]/.test(inner)) {
          const rs = runStyle(inner);
          objs.push({
            type: "shape",
            name: (inner.match(/<xdr:cNvPr[^>]*name="([^"]+)"/) || [])[1] || "",
            col, row,
            dxPx: colOff / EMU,
            dyPx: rowOff / EMU,
            w: Math.max(1, Math.round(w)),
            h: Math.max(1, Math.round(h)),
            text: extractText(inner),
            fill: solidColor(inner),
            border: borderInfo(inner),
            fontSizePx: rs.sizePx,
            fontFamily: rs.family,
            fontColor: rs.color,
            bold: rs.bold,
            alignH: alignH(inner),
            anchorV: (inner.match(/<a:bodyPr[^>]*anchor="([^"]+)"/) || [])[1] || "ctr",
            z: idx,
          });
        }
      }
    }
    if (objs.length) imagesBySheet[sheetName] = objs;
  }

  return imagesBySheet;
}

/** Convenience: buka zip lalu ekstrak gambar/shape dari buffer file. */
export async function extractImagesFromBuffer(buffer) {
  const zip = await openFileZip(buffer);
  return extractImagesFromZip(zip);
}

export { decodeEntities, intAttr };