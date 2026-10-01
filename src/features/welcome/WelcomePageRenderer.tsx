import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import { PREVIEW_DEVICES, type PreviewDevice } from "../../config/previewDevices";
import type { WelcomePageConfig } from "../../types/editor";
import { getWelcomeArch, getWelcomeBackground } from "./welcomeCatalog";
import { getWelcomeTransforms, resolveWelcomePage } from "./welcomeDefaults";
import { RenderElement } from "../../components/renderer/WeddingRenderer";
import { getElementZIndex } from "../../utils/responsiveLayout";

export function WelcomePageRenderer({
  config: rawConfig,
  device,
  onEnter,
  interactive = true,
  showElements = true,
}: {
  config: WelcomePageConfig;
  device: PreviewDevice;
  onEnter?: () => void;
  interactive?: boolean;
  showElements?: boolean;
}) {
  const config = resolveWelcomePage(rawConfig);
  const transforms = getWelcomeTransforms(config, device);
  const background = config.showBackground ? getWelcomeBackground(config.backgroundId, config.customBackgrounds) : undefined;
  const arch = config.showArch ? getWelcomeArch(config.archId, config.customArches) : undefined;
  const enterButton = config.elements.find((element) => element.type === "button" && element.welcomeAction === "enter");
  const enterLabel = enterButton?.type === "button" ? enterButton.label : config.enterLabel;
  const contentElements = config.elements.filter((element) => !(element.type === "button" && element.welcomeAction === "enter"));
  const interactionElements = config.elements.filter((element) => element.type === "button" && element.welcomeAction === "enter");
  const style = {
    "--welcome-color": config.textStyle.color,
    "--welcome-font": config.textStyle.fontFamily,
    "--welcome-align": config.textStyle.align,
    "--welcome-names-size": `${config.textStyle.namesSize}px`,
    "--welcome-detail-size": `${config.textStyle.detailSize}px`,
    "--welcome-button-size": `${config.textStyle.buttonSize}px`,
    background: `linear-gradient(145deg, ${config.fallbackColor}, ${config.fallbackColor2})`,
  } as CSSProperties;

  return (
    <motion.section
      className={`welcome-page welcome-page-${device} ${interactive ? "is-interactive" : "is-editor"}`}
      style={style}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? enterLabel : "Aperçu de la page d’accueil"}
      onClick={interactive ? onEnter : undefined}
      onKeyDown={interactive ? (event) => { if (event.key === "Enter" || event.key === " ") onEnter?.(); } : undefined}
      exit={config.transition === "zoom"
        ? { opacity: 0, scale: 1.35 }
        : config.transition === "split"
          ? { opacity: 0, x: "-100%" }
          : { opacity: 0 }}
      transition={{ duration: config.transitionDuration, ease: [0.22, 1, 0.36, 1] }}
    >
      {background && (
        <img
          className="welcome-background"
          src={background.imageUrl}
          alt=""
          draggable={false}
          style={{
            objectPosition: `${transforms.background.x}% ${transforms.background.y}%`,
            transform: `scale(${transforms.background.scale})`,
          }}
        />
      )}
      <div className="welcome-shade" />
      {arch && (
        <img
          className="welcome-arch"
          src={arch.imageUrl}
          alt=""
          draggable={false}
          style={{
            left: `${transforms.arch.x}%`,
            top: `${transforms.arch.y}%`,
            width: `${transforms.arch.width}%`,
          }}
        />
      )}
      {showElements && <>
        <div className="welcome-elements-layer">{[...contentElements].sort((a, b) => getElementZIndex(a, device) - getElementZIndex(b, device)).map((element) => <RenderElement key={element.id} element={element} device={device} documentHeight={PREVIEW_DEVICES[device].height} playAnimation={interactive} />)}</div>
        <div className="welcome-interaction-layer">{[...interactionElements].sort((a, b) => getElementZIndex(a, device) - getElementZIndex(b, device)).map((element) => <RenderElement key={element.id} element={element} device={device} documentHeight={PREVIEW_DEVICES[device].height} playAnimation={interactive} />)}</div>
      </>}
    </motion.section>
  );
}
