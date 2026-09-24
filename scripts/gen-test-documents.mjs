#!/usr/bin/env node
/**
 * gen-test-documents.mjs — génère de VRAIS fichiers PNG d'entrée (point 7) pour
 * valider l'analyse documentaire : clair / flou / inattendu / hors-sujet.
 * Ce sont des ENTRÉES de test (la sortie vient du modèle de vision, jamais pré-écrite).
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "data", "demo", "documents");
mkdirSync(OUT, { recursive: true });

const W = 320;
const H = 220;

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}

function encodePNG(rgba) {
  const stride = W * 4;
  const raw = Buffer.alloc((stride + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (stride + 1)] = 0; // filtre "none"
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // profondeur 8 bits
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function draw(fn) {
  const buf = Buffer.alloc(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const [r, g, b, a = 255] = fn(x, y);
      const i = (y * W + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
  return buf;
}

const white = () => [255, 255, 255, 255];
const dark = () => [24, 24, 28, 255];

/** Document net : fond clair, bordure, blocs texte (lignes), zone photo — reconnaissable comme une carte. */
function documentImage(x, y) {
  const border = x < 6 || x >= W - 6 || y < 6 || y >= H - 6;
  if (border) return dark();
  const line = (y >= 60 && y <= 64) || (y >= 84 && y <= 88) || (y >= 108 && y <= 112);
  if (line) return [70, 70, 80, 255];
  const photoBox = x >= 16 && x <= 96 && y >= 16 && y <= 140;
  if (photoBox) return [150, 160, 175, 255];
  const header = y >= 16 && y <= 40;
  if (header) return [0, 70, 120, 255];
  return white();
}

/** Version "floue" : même motif mais brouillé (moyenne sur un voisinage) → illisible. */
function blurImage(x, y) {
  const k = 5;
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -k; dy <= k; dy += 2) {
    for (let dx = -k; dx <= k; dx += 2) {
      const [cr, cg, cb] = documentImage(
        Math.min(W - 1, Math.max(0, x + dx)),
        Math.min(H - 1, Math.max(0, y + dy))
      );
      r += cr; g += cg; b += cb; n++;
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n), 255];
}

/** Document inattendu : une grande forme colorée (pas un document administratif). */
function unexpectedImage(x, y) {
  const dx = x - W / 2;
  const dy = y - H / 2;
  const inCircle = dx * dx + dy * dy < 60 * 60;
  if (inCircle) return [220, 40, 40, 255];
  return [40, 90, 200, 255];
}

/** Image sans rapport : bruit/gradient aléatoire déterministe. */
function noiseImage(x, y) {
  const v = (x * 31 + y * 57 + 13 * (x * y)) % 256;
  return [v, (v + 80) % 256, (v + 160) % 256, 255];
}

const images = {
  "document-clair.png": documentImage,
  "document-flou.png": blurImage,
  "document-inattendu.png": unexpectedImage,
  "hors-sujet.png": noiseImage,
};

for (const [name, fn] of Object.entries(images)) {
  writeFileSync(join(OUT, name), encodePNG(draw(fn)));
  console.log(`écrit ${name}`);
}
console.log(`jeu de test documents → ${OUT}`);