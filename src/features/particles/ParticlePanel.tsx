import { Plus, Trash2 } from "lucide-react";
import { useEditorStore } from "../../stores/editorStore";
import type {
  ParticleDirection,
  ParticleShape,
} from "../../types/editor";

const particleShapes: {
  id: ParticleShape;
  label: string;
  preview: string;
}[] = [
  {
    id: "circle",
    label: "Ronds",
    preview: "●",
  },
  {
    id: "heart",
    label: "Cœurs",
    preview: "♥",
  },
  {
    id: "star",
    label: "Étoiles",
    preview: "★",
  },
  {
    id: "petal",
    label: "Pétales",
    preview: "❀",
  },
  {
    id: "sparkle",
    label: "Scintillants",
    preview: "✦",
  },
  {
    id: "diamond",
    label: "Losanges",
    preview: "◆",
  },
];

const directions: {
  id: ParticleDirection;
  label: string;
  icon: string;
}[] = [
  {
    id: "up",
    label: "Vers le haut",
    icon: "↑",
  },
  {
    id: "down",
    label: "Vers le bas",
    icon: "↓",
  },
  {
    id: "left",
    label: "Vers la gauche",
    icon: "←",
  },
  {
    id: "right",
    label: "Vers la droite",
    icon: "→",
  },
  {
    id: "up-left",
    label: "Haut gauche",
    icon: "↖",
  },
  {
    id: "up-right",
    label: "Haut droite",
    icon: "↗",
  },
  {
    id: "down-left",
    label: "Bas gauche",
    icon: "↙",
  },
  {
    id: "down-right",
    label: "Bas droite",
    icon: "↘",
  },
];

export function ParticlePanel() {
  const {
    project,
    updateParticles,
  } = useEditorStore();

  if (!project) {
    return null;
  }

  const particles = project.particles;

  const update = (
    changes: Partial<typeof particles>
  ) => {
    updateParticles({
      ...particles,
      ...changes,
    });
  };

  const updateColor = (
    index: number,
    color: string
  ) => {
    const colors = [
      ...particles.colors,
    ];

    colors[index] = color;

    update({
      colors,
    });
  };

  const addColor = () => {
    if (
      particles.colors.length >= 5
    ) {
      return;
    }

    update({
      colors: [
        ...particles.colors,
        "#FFFFFF",
      ],
    });
  };

  const removeColor = (
    index: number
  ) => {
    if (
      particles.colors.length <= 1
    ) {
      return;
    }

    update({
      colors:
        particles.colors.filter(
          (_, colorIndex) =>
            colorIndex !== index
        ),
    });
  };

  return (
    <div className="sidebar-view particle-panel">
      <div className="view-intro">
        <span>Effets</span>

        <h2>Particules</h2>

        <p>
          Ajoutez des particules animées
          devant votre faire-part.
        </p>
      </div>

      {/* Activation */}
      <section className="particle-section">
        <div className="particle-toggle-row">
          <div>
            <strong>
              Activer les particules
            </strong>

            <small>
              Affiche l'effet sur le
              faire-part.
            </small>
          </div>

          <label className="particle-switch">
            <input
              type="checkbox"
              checked={
                particles.enabled
              }
              onChange={(event) =>
                update({
                  enabled:
                    event.target
                      .checked,
                })
              }
            />

            <span />
          </label>
        </div>
      </section>

      {/* Motif */}
      <section className="particle-section">
        <div className="panel-title">
          Motif
        </div>

        <div className="particle-shape-grid">
          {particleShapes.map(
            (shape) => (
              <button
                type="button"
                key={shape.id}
                className={
                  particles.shape ===
                  shape.id
                    ? "active"
                    : ""
                }
                onClick={() =>
                  update({
                    shape:
                      shape.id,
                  })
                }
              >
                <span className="particle-shape-preview">
                  {shape.preview}
                </span>

                <span>
                  {shape.label}
                </span>
              </button>
            )
          )}
        </div>
      </section>

      {/* Direction */}
      <section className="particle-section">
        <div className="panel-title">
          Direction
        </div>

        <div className="particle-direction-grid">
          {directions.map(
            (direction) => (
              <button
                type="button"
                key={
                  direction.id
                }
                title={
                  direction.label
                }
                className={
                  particles.direction ===
                  direction.id
                    ? "active"
                    : ""
                }
                onClick={() =>
                  update({
                    direction:
                      direction.id,
                  })
                }
              >
                {
                  direction.icon
                }
              </button>
            )
          )}
        </div>
      </section>

      {/* Vitesse */}
      <section className="particle-section">
        <div className="particle-control-header">
          <span>
            Vitesse
          </span>

          <strong>
            {particles.speed === 0
              ? "Flottement"
              : `${particles.speed} %`}
          </strong>
        </div>

        <input
          type="range"
          min="0"
          max="100"
          step="1"
          value={
            particles.speed
          }
          onChange={(event) =>
            update({
              speed: Number(
                event.target.value
              ),
            })
          }
        />

        {particles.speed === 0 && (
          <p className="particle-help">
            Les particules restent
            dans l'écran et flottent
            doucement.
          </p>
        )}
      </section>

      {/* Quantité */}
      <section className="particle-section">
        <div className="particle-control-header">
          <span>
            Quantité
          </span>

          <strong>
            {particles.quantity}
          </strong>
        </div>

        <input
          type="range"
          min="1"
          max="100"
          step="1"
          value={
            particles.quantity
          }
          onChange={(event) =>
            update({
              quantity: Number(
                event.target.value
              ),
            })
          }
        />
      </section>

      {/* Couleurs */}
      <section className="particle-section">
        <div className="particle-control-header">
          <span>
            Couleurs
          </span>

          <small>
            {particles.colors.length}/5
          </small>
        </div>

        <div className="particle-colors">
          {particles.colors.map(
            (color, index) => (
              <div
                className="particle-color-row"
                key={index}
              >
                <input
                  type="color"
                  value={color}
                  onChange={(event) =>
                    updateColor(
                      index,
                      event.target
                        .value
                    )
                  }
                />

                <input
                  type="text"
                  value={color}
                  onChange={(event) =>
                    updateColor(
                      index,
                      event.target
                        .value
                    )
                  }
                />

                <button
                  type="button"
                  title="Supprimer cette couleur"
                  disabled={
                    particles.colors
                      .length <= 1
                  }
                  onClick={() =>
                    removeColor(
                      index
                    )
                  }
                >
                  <Trash2
                    size={14}
                  />
                </button>
              </div>
            )
          )}
        </div>

        {particles.colors.length <
          5 && (
          <button
            type="button"
            className="particle-add-color"
            onClick={
              addColor
            }
          >
            <Plus size={15} />

            Ajouter une couleur
          </button>
        )}
      </section>

      {/* Taille */}
      <section className="particle-section">
        <div className="panel-title">
          Taille
        </div>

        <div className="particle-size-controls">
          <label>
            <span>
              Minimum
            </span>

            <input
              type="number"
              min="2"
              max="60"
              value={
                particles.minSize
              }
              onChange={(
                event
              ) => {
                const value =
                  Number(
                    event.target
                      .value
                  );

                update({
                  minSize:
                    Math.min(
                      value,
                      particles.maxSize
                    ),
                });
              }}
            />

            <small>px</small>
          </label>

          <label>
            <span>
              Maximum
            </span>

            <input
              type="number"
              min="2"
              max="80"
              value={
                particles.maxSize
              }
              onChange={(
                event
              ) => {
                const value =
                  Number(
                    event.target
                      .value
                  );

                update({
                  maxSize:
                    Math.max(
                      value,
                      particles.minSize
                    ),
                });
              }}
            />

            <small>px</small>
          </label>
        </div>
      </section>

      {/* Opacité */}
      <section className="particle-section">
        <div className="particle-control-header">
          <span>
            Opacité
          </span>

          <strong>
            {Math.round(
              particles.opacity *
                100
            )}
            %
          </strong>
        </div>

        <input
          type="range"
          min="0.1"
          max="1"
          step="0.05"
          value={
            particles.opacity
          }
          onChange={(event) =>
            update({
              opacity: Number(
                event.target.value
              ),
            })
          }
        />
      </section>

      {/* Profondeur */}
      <section className="particle-section">
        <div className="panel-title">
          Position
        </div>

        <div className="particle-layer-buttons">
          <button
            type="button"
            className={
              particles.layer ===
              "behind"
                ? "active"
                : ""
            }
            onClick={() =>
              update({
                layer: "behind",
              })
            }
          >
            Derrière
          </button>

          <button
            type="button"
            className={
              particles.layer ===
              "front"
                ? "active"
                : ""
            }
            onClick={() =>
              update({
                layer: "front",
              })
            }
          >
            Devant
          </button>
        </div>
      </section>
    </div>
  );
}