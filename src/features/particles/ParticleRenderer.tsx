import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import type {
  ParticleConfig,
  ParticleDirection,
  ParticleShape,
} from "../../types/editor";

interface ParticleRendererProps {
  config: ParticleConfig;
}

interface GeneratedParticle {
  id: number;

  x: number;
  y: number;

  size: number;

  rotation: number;

  delay: number;

  duration: number;

  color: string;

  driftX: number;
  driftY: number;

  rotateAmount: number;
}

const PARTICLE_SYMBOLS: Record<
  ParticleShape,
  string
> = {
    circle: "●",
    heart: "♥",
    star: "★",
    petal: "❀",
    sparkle: "✦",
    diamond: "◆",
    custom: ""
};

const randomBetween = (
  min: number,
  max: number
) =>
  Math.random() *
    (max - min) +
  min;

function getMovement(
  direction: ParticleDirection
) {
  switch (direction) {
    case "up":
      return {
        x: [0, 0],
        y: ["110vh", "-20vh"],
      };

    case "down":
      return {
        x: [0, 0],
        y: ["-20vh", "110vh"],
      };

    case "left":
      return {
        x: ["110vw", "-20vw"],
        y: [0, 0],
      };

    case "right":
      return {
        x: ["-20vw", "110vw"],
        y: [0, 0],
      };

    case "up-left":
      return {
        x: ["110vw", "-20vw"],
        y: ["110vh", "-20vh"],
      };

    case "up-right":
      return {
        x: ["-20vw", "110vw"],
        y: ["110vh", "-20vh"],
      };

    case "down-left":
      return {
        x: ["110vw", "-20vw"],
        y: ["-20vh", "110vh"],
      };

    case "down-right":
      return {
        x: ["-20vw", "110vw"],
        y: ["-20vh", "110vh"],
      };

    default:
      return {
        x: [0, 0],
        y: ["-20vh", "110vh"],
      };
  }
}

export function ParticleRenderer({
  config,
}: ParticleRendererProps) {
  const reduceMotion =
    useReducedMotion();

  const particles =
    useMemo<GeneratedParticle[]>(
      () => {
        const count = Math.min(
          100,
          Math.max(
            0,
            config.quantity
          )
        );

        return Array.from(
          {
            length: count,
          },
          (_, index) => ({
            id: index,

            x: randomBetween(
              0,
              100
            ),

            y: randomBetween(
              0,
              100
            ),

            size: randomBetween(
              config.minSize,
              config.maxSize
            ),

            rotation:
              randomBetween(
                0,
                360
              ),

            delay:
              randomBetween(
                0,
                8
              ),

            duration:
              randomBetween(
                0.8,
                1.2
              ),

            color:
              config.colors[
                Math.floor(
                  Math.random() *
                    config.colors
                      .length
                )
              ] ?? "#FFFFFF",

            driftX:
              randomBetween(
                -12,
                12
              ),

            driftY:
              randomBetween(
                -10,
                10
              ),

            rotateAmount:
              randomBetween(
                -25,
                25
              ),
          })
        );
      },
      [
        config.quantity,
        config.minSize,
        config.maxSize,
        config.colors,
        config.shape,
      ]
    );

  if (
    !config.enabled ||
    particles.length === 0
  ) {
    return null;
  }

  const symbol =
    PARTICLE_SYMBOLS[
      config.shape
    ];

  const isFloating =
    config.speed === 0 ||
    reduceMotion;

  /*
   * Plus speed est élevé,
   * plus duration est faible.
   *
   * speed = 1   -> très lent
   * speed = 100 -> rapide
   */
  const baseDuration =
    22 -
    (Math.min(
      100,
      Math.max(
        1,
        config.speed
      )
    ) /
      100) *
      18;

  const movement =
    getMovement(
      config.direction
    );

  return (
    <div
      className={`particle-layer particle-layer-${config.layer}`}
      aria-hidden="true"
    >
      {particles.map(
        (particle) => {
          if (isFloating) {
            return (
              <motion.span
                key={
                  particle.id
                }
                className={`wedding-particle wedding-particle-${config.shape}`}
                style={{
                  left: `${particle.x}%`,

                  top: `${particle.y}%`,

                  fontSize:
                    particle.size,

                  color:
                    particle.color,

                  opacity:
                    config.opacity,

                  rotate:
                    particle.rotation,
                }}
                animate={{
                  x: [
                    0,
                    particle.driftX,
                    -particle
                      .driftX *
                      0.5,
                    0,
                  ],

                  y: [
                    0,
                    particle.driftY,
                    -particle
                      .driftY *
                      0.6,
                    0,
                  ],

                  rotate: [
                    particle.rotation,
                    particle.rotation +
                      particle.rotateAmount,
                    particle.rotation -
                      particle.rotateAmount,
                    particle.rotation,
                  ],

                  scale: [
                    1,
                    1.08,
                    0.96,
                    1,
                  ],
                }}
                transition={{
                  duration:
                    4 +
                    particle.duration *
                      3,

                  delay:
                    particle.delay %
                    3,

                  repeat: Infinity,

                  ease:
                    "easeInOut",
                }}
              >
                {symbol}
              </motion.span>
            );
          }

          const duration =
            baseDuration *
            particle.duration;

          return (
            <motion.span
              key={
                particle.id
              }
              className={`wedding-particle wedding-particle-${config.shape}`}
              style={{
                left: `${particle.x}%`,

                top: `${particle.y}%`,

                fontSize:
                  particle.size,

                color:
                  particle.color,

                opacity:
                  config.opacity,
              }}
              initial={{
                x:
                  movement.x[0],

                y:
                  movement.y[0],

                rotate:
                  particle.rotation,
              }}
              animate={{
                x: [
                  movement.x[0],
                  movement.x[1],
                ],

                y: [
                  movement.y[0],
                  movement.y[1],
                ],

                rotate: [
                  particle.rotation,
                  particle.rotation +
                    360,
                ],
              }}
              transition={{
                duration,

                delay:
                  particle.delay,

                repeat: Infinity,

                ease: "linear",
              }}
            >
              {symbol}
            </motion.span>
          );
        }
      )}
    </div>
  );
}