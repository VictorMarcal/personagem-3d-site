// Ponte para a app nativa Android (2026-09-29, a pedido - "vamos
// definitivamente passar para app nativa"). Existe para resolver a
// limitação estrutural documentada na secção 4.2/26: dentro do browser (ou
// da PWA instalada) o ecrã bloqueado suspende o JavaScript da página, e com
// ele o GPS - não há como contornar isso a partir de uma aba normal. Uma app
// nativa (Capacitor) consegue correr um serviço em primeiro plano da parte
// do Android que continua a ler GPS com o ecrã bloqueado.
//
// Em cima do site/PWA normal isto não muda nada: `window.Capacitor` só
// existe quando a página corre dentro do wrapper nativo (app instalada a
// partir do .apk), nunca num browser normal - por isso todas as funções
// abaixo verificam isNativeApp() primeiro e ficam sem efeito no browser.
function isNativeApp() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

function getNativeBackgroundGeolocation() {
  if (!isNativeApp()) return null;
  return (window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundGeolocation) || null;
}

let nativeWatcherId = null;

// Mesma assinatura que navigator.geolocation.watchPosition espera receber
// nos seus callbacks (onPositionUpdate/onPositionError, js/training.js):
// devolve { coords: {latitude, longitude, accuracy, heading}, timestamp },
// para não ter de duplicar nenhuma lógica de treino específica do GPS.
async function nativeBeginWatch(onUpdate, onError) {
  const plugin = getNativeBackgroundGeolocation();
  if (!plugin) return null;
  try {
    nativeWatcherId = await plugin.addWatcher(
      {
        backgroundTitle: "Bootlands em treino",
        backgroundMessage: "A registar o teu percurso. Toca para voltar à app.",
        requestPermissions: true,
        stale: false,
        distanceFilter: 0,
      },
      (location, error) => {
        if (error) {
          onError({ code: error.code === "NOT_AUTHORIZED" ? 1 : 2, message: error.message });
          return;
        }
        if (!location) return;
        onUpdate({
          coords: {
            latitude: location.latitude,
            longitude: location.longitude,
            accuracy: location.accuracy,
            heading: location.bearing,
          },
          timestamp: location.time || Date.now(),
        });
      }
    );
    return nativeWatcherId;
  } catch (err) {
    onError({ code: 1, message: (err && err.message) || "Sem permissão de localização." });
    return null;
  }
}

async function nativeEndWatch() {
  const plugin = getNativeBackgroundGeolocation();
  if (!plugin || nativeWatcherId == null) return;
  const id = nativeWatcherId;
  nativeWatcherId = null;
  await plugin.removeWatcher({ id }).catch(() => {});
}
