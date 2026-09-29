// Copia so os ficheiros que a app a serio precisa (os mesmos que o
// GitHub Pages serve) para www/, que e o webDir do Capacitor. Sem isto, o
// "cap sync" tentaria copiar o repositorio inteiro (node_modules, .git,
// DOCUMENTACAO.md, etc.) para dentro do projeto Android.
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dest = path.join(root, "www");

const ITENS = [
  "index.html",
  "manifest.webmanifest",
  "sw.js",
  "css",
  "js",
  "assets",
];

function copiarRecursivo(origem, destino) {
  const stat = fs.statSync(origem);
  if (stat.isDirectory()) {
    fs.mkdirSync(destino, { recursive: true });
    for (const nome of fs.readdirSync(origem)) {
      copiarRecursivo(path.join(origem, nome), path.join(destino, nome));
    }
  } else {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.copyFileSync(origem, destino);
  }
}

fs.rmSync(dest, { recursive: true, force: true });
for (const item of ITENS) {
  const origem = path.join(root, item);
  if (fs.existsSync(origem)) copiarRecursivo(origem, path.join(dest, item));
}

console.log("www/ pronta com: " + ITENS.join(", "));
