/* ==========================================================================
   js/icons.js — set de ícones de linha do tema "Campo Aberto"
   Substitui os emoji (🏹 🛡️ 🧥 ⚒️ 🧍 🗺️ 🏅 📊) por SVG inline.

   Porque não emoji: rendem diferente em cada Android/iOS, trazem cores
   saturadas que colidem com a paleta terrosa, e não se podem tingir nem
   animar. Estes são todos na mesma grelha de 24, traço 2, sem preenchimento,
   e herdam a cor por currentColor — ou seja, mudam com o estado (ativo /
   inativo / desativado) sem uma segunda cópia do ícone.

   Ícones ilustrados dos recursos (2026-09-16, o Victor desenhou-os) — PNG
   32x32, fundo transparente, em assets/Icons/Recursos/<id>.png. Ao
   contrário dos SVG acima (traço, sem cor própria), estes já vêm a cores e
   substituem por completo os SVG de linha que existiam para
   ferro/madeira/pele/pedra/barro (ver ICON_IMAGE_NAMES abaixo) - não há
   fallback SVG para eles, se um ficheiro faltar aparece só o `alt=""`.

   Uso em HTML:   <span class="icon" data-icon="arco"></span>
                  (hidrata-se no load; ver hydrateIcons() no fim)
   Uso em JS:     painel.innerHTML = icon("ferro", 17) + "Ferro";
   ========================================================================== */

// Nomes com ícone ilustrado (imagem) em vez de SVG de linha - ver comentário
// acima. ICON_IMAGE_V sobe sempre que um destes ficheiros for substituído
// (mesmo espírito do ASSET_V dos modelos 3D, js/main.js).
const ICON_IMAGE_NAMES = new Set(["ferro", "madeira", "pele", "pedra", "barro"]);
const ICON_IMAGE_BASE_PATH = "assets/Icons/Recursos/";
const ICON_IMAGE_V = "3";

const ICON_PATHS = {
  // --- equipamento ---------------------------------------------------------
  arco: '<path d="M7 4c9 4 9 12 0 16"/><path d="M7 4v16"/>',
  escudo: '<path d="M12 3l7 3v6c0 5-3 7-7 9-4-2-7-4-7-9V6z"/>',
  // peitoral (ombros + tronco). NÃO um escudo com um risco: ao lado do
  // escudo, a 17px, dois escudos leem-se como um objeto riscado.
  armadura: '<path d="M9 4l3 2 3-2 4 2-1 5h-2v9H8v-9H6L5 6z"/>',

  // --- barra de separadores ------------------------------------------------
  treinar: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2h5"/>',
  // hexágono: o mesmo do mapa H3, para o separador e o território falarem a
  // mesma língua
  reino: '<path d="M12 3l7 4v10l-7 4-7-4V7z"/>',
  eu: '<circle cx="12" cy="8" r="4"/><path d="M5 20c1.5-4 4-5.5 7-5.5s5.5 1.5 7 5.5"/>',

  // --- avulsos -------------------------------------------------------------
  // Torre com ameias e um portão em arco — o antigo "Armazém" passou a
  // "Fortaleza" (2026-09-09). Chave nova; nada usa mais "armazem".
  fortaleza: '<path d="M4 21V8h3V5h3v3h3V5h3v3h3v13z"/><path d="M9 21v-5a2.5 2.5 0 015 0v5"/>',
  mina: '<path d="M14 4l6 6"/><path d="M17 7c-4-4-9-2-11 0l7 7c2-2 4-7 0-11" transform="translate(-1 1)"/>',
  trofeu: '<path d="M8 4h8v5a4 4 0 01-8 0z"/><path d="M8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3"/><path d="M12 13v4M9 20h6"/>',
  chama: '<path d="M12 3c4 5 5 6 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-4 1-6 1-9z"/>',

  // --- menu de definições (2026-09-22) --------------------------------------
  definicoes:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82V15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>',
  feedback: '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>',
  sair: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
};

// Cores por família. Uma cor por objeto, sempre a mesma em toda a app —
// para o jogador reconhecer o recurso pela cor antes de ler o nome.
// Os recursos (ferro/madeira/pele/pedra/barro) saíram daqui em 2026-09-16 -
// os ícones ilustrados já vêm a cores, não precisam de stroke tingido.
const ICON_COLORS = {
  arco: "#b2622d",
  escudo: "#4a6d90",
  armadura: "#56633f",
};

/**
 * Devolve o ícone como string - <img> para os nomes em ICON_IMAGE_NAMES,
 * SVG de linha para todos os outros.
 * @param {string} name   chave de ICON_PATHS ou ICON_IMAGE_NAMES
 * @param {number} size   lado em px (default 20)
 * @param {string} [color] cor do traço (só se aplica ao SVG); omitir usa a
 *                         cor da família e, se não houver, currentColor
 */
function icon(name, size = 20, color) {
  if (ICON_IMAGE_NAMES.has(name)) {
    return (
      '<img class="icon-img" src="' + ICON_IMAGE_BASE_PATH + name + ".png?v=" + ICON_IMAGE_V + '"' +
      ' width="' + size + '" height="' + size + '" alt="" aria-hidden="true">'
    );
  }
  const d = ICON_PATHS[name];
  if (!d) return "";
  const stroke = color || ICON_COLORS[name] || "currentColor";
  return (
    '<svg class="icon-svg" viewBox="0 0 24 24" width="' + size + '" height="' + size + '"' +
    ' fill="none" stroke="' + stroke + '" stroke-width="2"' +
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">' +
    d +
    "</svg>"
  );
}

/**
 * Preenche todos os <span data-icon="arco"> do documento. Chamado no load e
 * disponível para quem injetar markup novo depois (ex.: renderMonsters()).
 * data-icon-size e data-icon-color são opcionais.
 */
function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((el) => {
    if (el.firstElementChild) return; // já hidratado
    const size = Number(el.dataset.iconSize) || 20;
    el.innerHTML = icon(el.dataset.icon, size, el.dataset.iconColor);
  });
}

document.addEventListener("DOMContentLoaded", () => hydrateIcons());
