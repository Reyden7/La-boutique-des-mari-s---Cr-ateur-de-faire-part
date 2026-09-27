import { useReducedMotion } from "framer-motion";
import { memo, type CSSProperties, useMemo } from "react";
import type { ParticleConfig, ParticleDirection, ParticleShape } from "../../types/editor";

interface ParticleRendererProps {
  config: ParticleConfig;
}

interface GeneratedParticle {
  id: number;
  x: number;
  y: number;
  size: number;
  rotation: number;
  rotationEnd: number;
  progress: number;
  durationFactor: number;
  color: string;
  driftX: number;
  driftY: number;
  rotateAmount: number;
  trajectorySeed: number;
  trajectoryVariant: number;
}

interface ParticleTrajectory {
  fromX: string;
  fromY: string;
  toX: string;
  toY: string;
}

type ParticleStyle = CSSProperties & Record<`--particle-${string}`, string>;

const PARTICLE_SYMBOLS: Partial<Record<ParticleShape, string>> = {
  circle: "●",
  heart: "♥",
  star: "★",
  petal: "❀",
  sparkle: "✦",
  diamond: "◆",
};

const randomBetween = (min: number, max: number) => Math.random() * (max - min) + min;
const clampQuantity = (quantity: number) => Math.min(100, Math.max(0, quantity));
const randomColor = (colors: string[]) => colors[Math.floor(Math.random() * colors.length)] ?? "#FFFFFF";

function createTrajectory(
  direction: ParticleDirection,
  size: number,
  seed = Math.random(),
  variant = Math.random(),
): ParticleTrajectory {
  const margin = Math.ceil(size * 1.8 + 8);
  const lane = 4 + seed * 92;
  const firstHalf = 4 + seed * 42;
  const secondHalf = 54 + seed * 42;
  const before = `-${margin}px`;
  const afterX = `calc(100cqw + ${margin}px)`;
  const afterY = `calc(100cqh + ${margin}px)`;

  switch (direction) {
    case "up":
      return { fromX: `${lane}cqw`, fromY: afterY, toX: `${lane}cqw`, toY: before };
    case "down":
      return { fromX: `${lane}cqw`, fromY: before, toX: `${lane}cqw`, toY: afterY };
    case "left":
      return { fromX: afterX, fromY: `${lane}cqh`, toX: before, toY: `${lane}cqh` };
    case "right":
      return { fromX: before, fromY: `${lane}cqh`, toX: afterX, toY: `${lane}cqh` };
    case "up-left":
      return variant < 0.5
        ? { fromX: `${secondHalf}cqw`, fromY: afterY, toX: before, toY: `calc(${secondHalf}cqh - 100cqh - ${margin}px)` }
        : { fromX: afterX, fromY: `${secondHalf}cqh`, toX: `calc(${secondHalf}cqw - 100cqw - ${margin}px)`, toY: before };
    case "up-right":
      return variant < 0.5
        ? { fromX: `${firstHalf}cqw`, fromY: afterY, toX: afterX, toY: `calc(${firstHalf}cqh - 100cqh - ${margin}px)` }
        : { fromX: before, fromY: `${secondHalf}cqh`, toX: `calc(100cqw + ${firstHalf}cqw + ${margin}px)`, toY: before };
    case "down-left":
      return variant < 0.5
        ? { fromX: `${secondHalf}cqw`, fromY: before, toX: before, toY: `calc(100cqh + ${firstHalf}cqh + ${margin}px)` }
        : { fromX: afterX, fromY: `${firstHalf}cqh`, toX: before, toY: afterY };
    case "down-right":
      return variant < 0.5
        ? { fromX: `${firstHalf}cqw`, fromY: before, toX: afterX, toY: `calc(100cqh + ${firstHalf}cqh + ${margin}px)` }
        : { fromX: before, fromY: `${firstHalf}cqh`, toX: `calc(100cqw + ${firstHalf}cqw + ${margin}px)`, toY: afterY };
  }
}

const applyTrajectory = (element: HTMLElement, trajectory: ParticleTrajectory) => {
  element.style.setProperty("--particle-from-x", trajectory.fromX);
  element.style.setProperty("--particle-from-y", trajectory.fromY);
  element.style.setProperty("--particle-to-x", trajectory.toX);
  element.style.setProperty("--particle-to-y", trajectory.toY);
};

const recycleParticle = (element: HTMLElement, config: ParticleConfig) => {
  const size = randomBetween(config.minSize, config.maxSize);
  const rotation = randomBetween(0, 360);
  element.style.fontSize = `${size}px`;
  element.style.color = randomColor(config.colors);
  element.style.setProperty("--particle-rotation-start", `${rotation}deg`);
  element.style.setProperty("--particle-rotation-end", `${rotation + randomBetween(280, 440)}deg`);
  applyTrajectory(element, createTrajectory(config.direction, size));
};

function ParticleContent({ shape, customImageUrl, symbol }: { shape: ParticleShape; customImageUrl?: string; symbol: string }) {
  if (shape !== "custom" || !customImageUrl) return symbol;
  return <span className="custom-particle-image" style={{ backgroundColor: "currentColor", WebkitMaskImage: `url("${customImageUrl}")`, maskImage: `url("${customImageUrl}")` }} />;
}

function ParticleRendererComponent({ config }: ParticleRendererProps) {
  const reduceMotion = useReducedMotion();
  const colorsSignature = config.colors.join("\u0000");
  const particles = useMemo<GeneratedParticle[]>(() => Array.from(
    { length: clampQuantity(config.quantity) },
    (_, index) => ({
      id: index,
      x: randomBetween(3, 97),
      y: randomBetween(3, 97),
      size: randomBetween(config.minSize, config.maxSize),
      rotation: randomBetween(0, 360),
      rotationEnd: randomBetween(280, 440),
      progress: randomBetween(0.02, 0.98),
      durationFactor: randomBetween(0.8, 1.2),
      color: randomColor(config.colors),
      driftX: randomBetween(-12, 12),
      driftY: randomBetween(-10, 10),
      rotateAmount: randomBetween(-25, 25),
      trajectorySeed: Math.random(),
      trajectoryVariant: Math.random(),
    }),
  ), [colorsSignature, config.customImageUrl, config.maxSize, config.minSize, config.quantity, config.shape]);

  if (!config.enabled || particles.length === 0) return null;

  const symbol = PARTICLE_SYMBOLS[config.shape] ?? "";
  const isFloating = config.speed === 0 || reduceMotion;
  const baseDuration = 22 - (Math.min(100, Math.max(1, config.speed)) / 100) * 18;

  return (
    <div className={`particle-layer particle-layer-${config.layer}`} aria-hidden="true">
      {particles.map((particle) => {
        if (isFloating) {
          const duration = 4 + particle.durationFactor * 3;
          const style: ParticleStyle = {
            left: `${particle.x}%`,
            top: `${particle.y}%`,
            fontSize: particle.size,
            color: particle.color,
            opacity: config.opacity,
            animationDuration: `${duration}s`,
            animationDelay: `${-(particle.progress * duration)}s`,
            "--particle-float-x": `${particle.driftX}px`,
            "--particle-float-y": `${particle.driftY}px`,
            "--particle-float-x-back": `${-particle.driftX * 0.5}px`,
            "--particle-float-y-back": `${-particle.driftY * 0.6}px`,
            "--particle-rotation-start": `${particle.rotation}deg`,
            "--particle-rotation-mid": `${particle.rotation + particle.rotateAmount}deg`,
            "--particle-rotation-back": `${particle.rotation - particle.rotateAmount}deg`,
          };
          return <span key={particle.id} className={`wedding-particle wedding-particle-floating wedding-particle-${config.shape}`} style={style}><ParticleContent shape={config.shape} customImageUrl={config.customImageUrl} symbol={symbol} /></span>;
        }

        const duration = baseDuration * particle.durationFactor;
        const trajectory = createTrajectory(config.direction, particle.size, particle.trajectorySeed, particle.trajectoryVariant);
        const style: ParticleStyle = {
          left: 0,
          top: 0,
          fontSize: particle.size,
          color: particle.color,
          opacity: config.opacity,
          animationDuration: `${duration}s`,
          animationDelay: `${-(particle.progress * duration)}s`,
          "--particle-from-x": trajectory.fromX,
          "--particle-from-y": trajectory.fromY,
          "--particle-to-x": trajectory.toX,
          "--particle-to-y": trajectory.toY,
          "--particle-rotation-start": `${particle.rotation}deg`,
          "--particle-rotation-end": `${particle.rotation + particle.rotationEnd}deg`,
        };

        return <span key={particle.id} className={`wedding-particle wedding-particle-travelling wedding-particle-${config.shape}`} style={style} onAnimationIteration={(event) => { if (event.target === event.currentTarget) recycleParticle(event.currentTarget, config); }}><ParticleContent shape={config.shape} customImageUrl={config.customImageUrl} symbol={symbol} /></span>;
      })}
    </div>
  );
}

const particleConfigsEqual = (
  previous: ParticleRendererProps,
  next: ParticleRendererProps,
) => {
  const before = previous.config;
  const after = next.config;

  return before.enabled === after.enabled
    && before.shape === after.shape
    && before.direction === after.direction
    && before.speed === after.speed
    && before.quantity === after.quantity
    && before.minSize === after.minSize
    && before.maxSize === after.maxSize
    && before.opacity === after.opacity
    && before.layer === after.layer
    && before.customImageUrl === after.customImageUrl
    && before.colors.length === after.colors.length
    && before.colors.every((color, index) => color === after.colors[index]);
};

export const ParticleRenderer = memo(
  ParticleRendererComponent,
  particleConfigsEqual,
);
