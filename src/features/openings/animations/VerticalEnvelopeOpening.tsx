import { AnimatePresence, motion, useReducedMotion, type Variants } from "framer-motion";
import { useState } from "react";
import type { EnvelopeOpeningSettings } from "../../../types/editor";
import type { OpeningAnimationProps } from "../openingTypes";

type EnvelopePhase =
  | "closed"
  | "seal-opening"
  | "flap-opening"
  | "card-rising"
  | "revealing"
  | "complete";

const isEnvelopeVisible = (phase: EnvelopePhase) => phase !== "complete";

export function VerticalEnvelopeOpening({
  children,
  config,
  onInteract,
}: OpeningAnimationProps) {
  const [phase, setPhase] = useState<EnvelopePhase>("closed");
  const reduceMotion = useReducedMotion();

  const settings = (config.customSettings ?? {}) as Partial<EnvelopeOpeningSettings>;
  const [envelopeColor, envelopeInnerColor, sealColor] = config.colors ?? [];

  const palette = {
    envelope: envelopeColor ?? settings.envelopeColor ?? "#E7D2C3",
    inner: envelopeInnerColor ?? settings.envelopeInnerColor ?? "#F5E9DF",
    flap:
      settings.flapColor ??
      envelopeColor ??
      settings.envelopeColor ??
      "#DFC4B1",
    seal: sealColor ?? settings.sealColor ?? "#B58A62",
    background: settings.backgroundColor ?? "#F5EFEA",
  };

  const hint =
    settings.hintText ??
    (typeof config.customSettings?.label === "string"
      ? config.customSettings.label
      : "Touchez pour ouvrir");

  const duration = reduceMotion ? 0.18 : Math.max(2.8, config.duration || 3.4);

  const sealDuration = reduceMotion ? 0.04 : duration * 0.1;
  const flapDuration = reduceMotion ? 0.05 : duration * 0.26;
  const cardDuration = reduceMotion ? 0.05 : duration * 0.36;
  const revealDuration = reduceMotion ? 0.04 : duration * 0.28;

  const flapIsBehindCard =
    phase === "card-rising" ||
    phase === "revealing" ||
    phase === "complete";

  const open = () => {
    if (phase !== "closed") return;

    onInteract?.();
    setPhase("seal-opening");
  };

  const cardVariants: Variants = {
    closed: {
      y: "0%",
      scale: 0.68,
      opacity: 1,
    },

    "seal-opening": {
      y: "0%",
      scale: 0.68,
      opacity: 1,
    },

    "flap-opening": {
      y: "0%",
      scale: 0.68,
      opacity: 1,
    },

    "card-rising": {
      y: "-17%",
      scale: 0.76,
      opacity: 1,
      transition: {
        duration: cardDuration,
        ease: [0.22, 1, 0.36, 1],
      },
    },

    revealing: {
      y: "0%",
      scale: 1,
      opacity: 1,
      transition: {
        duration: revealDuration,
        ease: [0.22, 1, 0.36, 1],
      },
    },

    complete: {
      y: "0%",
      scale: 1,
      opacity: 1,
    },
  };

  const flapVariants: Variants = {
  closed: {
    rotateX: 0,
    z: 40,
    opacity: 1,
  },

  "seal-opening": {
    rotateX: 0,
    z: 40,
    opacity: 1,
  },

  "flap-opening": {
    rotateX: [0, -8, 166, 178],
    z: 40,
    opacity: 1,

    transition: {
      rotateX: {
        duration: flapDuration,
        times: [0, 0.12, 0.88, 1],
        ease: [0.45, 0, 0.18, 1],
      },
    },
  },

  "card-rising": {
    rotateX: 178,

    // IMPORTANT :
    // le rabat est maintenant physiquement derrière la carte
    z: -120,

    opacity: 1,

    transition: {
      z: {
        duration: 0.01,
      },
    },
  },

  revealing: {
    rotateX: 178,
    z: -120,
    opacity: 0,

    transition: {
      opacity: {
        duration: revealDuration,
      },

      rotateX: {
        duration: 0.01,
      },

      z: {
        duration: 0.01,
      },
    },
  },

  complete: {
    rotateX: 178,
    z: -120,
    opacity: 0,
  },
};

  const sealVariants: Variants = {
    closed: {
      opacity: 1,
      scale: 1,
      z: 160,
    },

    "seal-opening": {
      opacity: [1, 1, 0],
      scale: [1, 1.08, 0.8],

      transition: {
        duration: sealDuration,
        times: [0, 0.42, 1],
        ease: [0.4, 0, 1, 1],
      },
    },
  };

  const envelopeExit =
    phase === "revealing" || phase === "complete"
      ? {
          opacity: 0,
          y: "8%",
          scale: 0.96,
        }
      : {
          opacity: 1,
          y: "0%",
          scale: 1,
        };

  return (
    <div
      className={`opening-stage vertical-envelope-stage phase-${phase}`}
      style={
        {
          "--opening-primary": palette.envelope,
          "--opening-secondary": palette.inner,
          "--opening-flap": palette.flap,
          "--opening-accent": palette.seal,
          "--opening-background": palette.background,
        } as React.CSSProperties
      }
    >
      <div className="vertical-envelope-scene">
        <motion.div
          className="vertical-envelope-back-layer"
          animate={envelopeExit}
          transition={{
            duration: revealDuration,
            ease: [0.22, 1, 0.36, 1],
          }}
          aria-hidden="true"
        >
          <div className="vertical-envelope-back" />
          <div className="vertical-envelope-inner" />
        </motion.div>

        <div className="vertical-card-layer">
          <motion.div
            className="vertical-invitation-card"
            variants={cardVariants}
            initial="closed"
            animate={phase}
            onAnimationComplete={(definition) => {
              if (
                definition === "card-rising" &&
                phase === "card-rising"
              ) {
                setPhase("revealing");
              } else if (
                definition === "revealing" &&
                phase === "revealing"
              ) {
                setPhase("complete");
              }
            }}
          >
            {children}
          </motion.div>
        </div>

        <motion.div
          className="vertical-envelope-front-layer"
          animate={envelopeExit}
          transition={{
            duration: revealDuration,
            ease: [0.22, 1, 0.36, 1],
          }}
          aria-hidden="true"
        >
          <div className="vertical-envelope-left-fold" />
          <div className="vertical-envelope-right-fold" />
          <div className="vertical-envelope-front" />
        </motion.div>

        <motion.div
          className="vertical-envelope-flap"
          style={{
            zIndex: flapIsBehindCard ? 2 : 6,
          }}
          variants={flapVariants}
          initial="closed"
          animate={phase}
          onAnimationComplete={(definition) => {
            if (
              definition === "flap-opening" &&
              phase === "flap-opening"
            ) {
              setPhase("card-rising");
            }
          }}
          aria-hidden="true"
        />

        <AnimatePresence>
          {(phase === "closed" || phase === "seal-opening") && (
            <motion.span
              className="vertical-envelope-seal"
              style={{
                zIndex: 12,
              }}
              variants={sealVariants}
              initial="closed"
              animate={phase}
              exit={{
                opacity: 0,
                scale: 0.8,
                z: 160,

                transition: {
                  duration: reduceMotion ? 0.01 : 0.12,
                },
              }}
              onAnimationComplete={(definition) => {
                if (
                  definition === "seal-opening" &&
                  phase === "seal-opening"
                ) {
                  setPhase("flap-opening");
                }
              }}
              aria-hidden="true"
            >
              ♥
            </motion.span>
          )}
        </AnimatePresence>

        {phase === "closed" && (
          <button
            className="vertical-envelope-trigger"
            onClick={open}
            aria-label="Ouvrir le faire-part"
          />
        )}

        <AnimatePresence>
          {phase === "closed" && (
            <motion.span
              className="vertical-open-hint"
              initial={{
                opacity: 0.65,
              }}
              animate={{
                opacity: [0.65, 1, 0.65],
              }}
              exit={{
                opacity: 0,

                transition: {
                  duration: reduceMotion ? 0.01 : 0.18,
                },
              }}
              transition={{
                duration: 2.4,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              {hint}
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      {!isEnvelopeVisible(phase) && (
        <span
          className="sr-only"
          aria-live="polite"
        >
          Faire-part ouvert
        </span>
      )}
    </div>
  );
}