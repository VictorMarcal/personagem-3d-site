/* ==========================================================================
   js/icons.js — set de ícones de linha do tema "Campo Aberto"
   Substitui os emoji (🏹 🛡️ 🧥 ⚒️ 🧍 🗺️ 🏅 📊) por SVG inline.

   Porque não emoji: rendem diferente em cada Android/iOS, trazem cores
   saturadas que colidem com a paleta terrosa, e não se podem tingir nem
   animar. Estes são todos na mesma grelha de 24, traço 2, sem preenchimento,
   e herdam a cor por currentColor — ou seja, mudam com o estado (ativo /
   inativo / desativado) sem uma segunda cópia do ícone.

   Uso em HTML:   <span class="icon" data-icon="arco"></span>
                  (hidrata-se no load; ver hydrateIcons() no fim)
   Uso em JS:     painel.innerHTML = icon("ferro", 17) + "Ferro";
   ========================================================================== */

const ICON_PATHS = {
  // --- equipamento ---------------------------------------------------------
  arco: '<path d="M7 4c9 4 9 12 0 16"/><path d="M7 4v16"/>',
  escudo: '<path d="M12 3l7 3v6c0 5-3 7-7 9-4-2-7-4-7-9V6z"/>',
  // peitoral (ombros + tronco). NÃO um escudo com um risco: ao lado do
  // escudo, a 17px, dois escudos leem-se como um objeto riscado.
  armadura: '<path d="M9 4l3 2 3-2 4 2-1 5h-2v9H8v-9H6L5 6z"/>',

  // --- recursos (ids iguais aos de js/resources.js) ------------------------
  ferro: '<path d="M4 15l5-7h6l5 7-4 5H8z"/>',
  madeira: '<path d="M5 6h14v12H5z"/><path d="M9 6v12M15 6v12"/>',
  pele: '<path d="M6 5c3 2 9 2 12 0 1 4-1 6-1 8s2 4 0 6c-3-2-7-2-10 0-2-2 0-4 0-6s-2-4-1-8z"/>',
  pedra: '<path d="M4 12l4-6h8l4 6-6 6H10z"/><path d="M8 6l4 6 4-6"/>',
  barro: '<path d="M6 8h12l-1 11H7z"/><path d="M9 8V5h6v3"/>',

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
};

// Cores por família. Uma cor por objeto, sempre a mesma em toda a app —
// para o jogador reconhecer o recurso pela cor antes de ler o nome.
const ICON_COLORS = {
  arco: "#b2622d",
  escudo: "#4a6d90",
  armadura: "#56633f",
  ferro: "#6e6d7d",
  madeira: "#8a6f52",
  pele: "#b3776b",
  pedra: "#767f70",
  barro: "#a3833f",
};

/**
 * Devolve o SVG como string.
 * @param {string} name   chave de ICON_PATHS
 * @param {number} size   lado em px (default 20)
 * @param {string} [color] cor do traço; omitir usa a cor da família e, se
 *                         não houver, currentColor (herda do texto)
 */
function icon(name, size = 20, color) {
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
