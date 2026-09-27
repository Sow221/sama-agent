/**
 * Copie les fichiers d'exécution du VAD Silero dans `public/vad/`.
 *
 * `@ricky0123/vad-web` charge À L'EXÉCUTION son worklet audio, le modèle ONNX et
 * le moteur WASM d'onnxruntime-web. Une fois bundlé, il les cherche à la racine
 * du site (`/`), où ils n'existent pas : `MicVAD.new` échouait juste après
 * l'ouverture du micro et l'écran affichait « Voix indisponible ».
 * Lancé avant `dev` et `build` (predev / prebuild) ; `public/vad/` n'est pas versionné.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** Dossier `dist` d'un paquet installé (remonte les node_modules : workspaces npm). */
function distOf(pkg, from) {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, "node_modules", pkg, "dist");
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) throw new Error(`${pkg} introuvable (npm install ?)`);
  }
}

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "vad");
mkdirSync(out, { recursive: true });

const vadDist = distOf("@ricky0123/vad-web", here);
// onnxruntime-web est résolu DEPUIS vad-web : c'est la version qu'il importe.
const ortDist = distOf("onnxruntime-web", dirname(vadDist));

const files = [
  [vadDist, "vad.worklet.bundle.min.js"],
  [vadDist, "silero_vad_v5.onnx"],
  // Moteur WASM CPU (le seul utilisé : executionProviders par défaut = wasm).
  ...readdirSync(ortDist)
    .filter((f) => /^ort-wasm-simd-threaded\.(wasm|mjs)$/.test(f))
    .map((f) => [ortDist, f]),
];
for (const [dir, name] of files) copyFileSync(join(dir, name), join(out, name));
console.log(`VAD : ${files.length} fichiers copiés dans public/vad/`);
