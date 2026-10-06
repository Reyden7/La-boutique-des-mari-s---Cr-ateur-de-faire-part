import { Plus, Trash2, Upload } from "lucide-react";
import { useRef } from "react";
import { StableColorInput } from "../../components/ui/StableColorInput";
import { useEditorStore } from "../../stores/editorStore";
import type {
  ParticleDirection,
  ParticleShape,
} from "../../types/editor";
import { isSupabaseConfigured } from "../../lib/supabase";
import { uploadProjectAsset } from "../../services/assetRepository";
import { useGlobalAssets } from "../../hooks/useGlobalAssets";
import { PublishGlobalAssetButton } from "../../components/admin/PublishGlobalAssetButton";

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
  const fileRef =
    useRef<HTMLInputElement>(null);

  const {
    project,
    updateParticles,
  } = useEditorStore();
  const globalParticles = useGlobalAssets("particle");

  if (!project) {
    return null;
  }

  const particles =
    project.particles;

  const update = (
    changes: Partial<
      typeof particles
    >
  ) => {
    updateParticles({
      ...particles,
      ...changes,
    });
  };

  const handleCustomParticleUpload = async (
    file?: File
  ) => {
    if (!file) {
      return;
    }

    const allowedTypes = [
      "image/png",
      "image/webp",
    ];

    if (
      !allowedTypes.includes(
        file.type
      )
    ) {
      window.alert(
        "Choisissez une image PNG ou WebP."
      );

      return;
    }

    if (
      file.size >
      2 * 1024 * 1024
    ) {
      window.alert(
        "Le motif doit faire moins de 2 Mo."
      );

      return;
    }

    if (isSupabaseConfigured) {
      try {
        const asset = await uploadProjectAsset(project, file, "image");
        update({ shape: "custom", customImageUrl: asset.url, customImageName: file.name, customImageAssetId: asset.id, customImageGlobalAssetId: undefined });
      } catch { window.alert("Le motif n’a pas pu être envoyé."); }
      return;
    }
    const reader = new FileReader();
    reader.onload = () => update({ shape: "custom", customImageUrl: String(reader.result), customImageName: file.name, customImageAssetId: undefined, customImageGlobalAssetId: undefined });
    reader.readAsDataURL(file);
  };

  const updateColor = (
    index: number,
    color: string
  ) => {
    const colors = [
      ...particles.colors,
    ];

    colors[index] =
      color;

    update({
      colors,
    });
  };

  const addColor = () => {
    if (
      particles.colors.length >=
      5
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
      particles.colors.length <=
      1
    ) {
      return;
    }

    update({
      colors:
        particles.colors.filter(
          (
            _,
            colorIndex
          ) =>
            colorIndex !==
            index
        ),
    });
  };

  return (
    <div className="sidebar-view particle-panel">
      <div className="view-intro">
        <span>
          Effets
        </span>

        <h2>
          Particules
        </h2>

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
              onChange={(
                event
              ) =>
                update({
                  enabled:
                    event
                      .target
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
            (shape) => {
              const active =
                particles.shape ===
                shape.id;

              return (
                <button
                  type="button"
                  key={
                    shape.id
                  }
                  title={
                    shape.label
                  }
                  aria-label={
                    shape.label
                  }
                  className={`particle-shape-button ${
                    active
                      ? "active"
                      : ""
                  }`}
                  onClick={() =>
                    update({
                      shape:
                        shape.id,
                    })
                  }
                >
                  <span className="particle-shape-preview">
                    {
                      shape.preview
                    }
                  </span>

                  <span className="particle-shape-check">
                    {active
                      ? "✓"
                      : ""}
                  </span>
                </button>
              );
            }
          )}

          {globalParticles.map((asset) => (
            <button type="button" key={asset.id} title={asset.name} aria-label={asset.name}
              className={`particle-shape-button ${particles.customImageGlobalAssetId === asset.id ? "active" : ""}`}
              onClick={() => update({ shape: "custom", customImageUrl: asset.url, customImageName: asset.name, customImageAssetId: undefined, customImageGlobalAssetId: asset.id })}>
              <img loading="lazy" src={asset.thumbnailUrl ?? asset.url} alt="" className="particle-custom-preview" />
              <span className="particle-shape-check">{particles.customImageGlobalAssetId === asset.id ? "✓" : ""}</span>
            </button>
          ))}

          {/* Motif personnalisé */}
          <button
            type="button"
            title="Importer un motif personnalisé"
            aria-label="Importer un motif personnalisé"
            className={`particle-shape-button particle-custom-shape-button ${
              particles.shape ===
              "custom"
                ? "active"
                : ""
            }`}
            onClick={() =>
              fileRef.current?.click()
            }
          >
            {particles.customImageUrl ? (
              <img
                src={
                  particles.customImageUrl
                }
                alt=""
                className="particle-custom-preview"
              />
            ) : (
              <Upload
                size={24}
              />
            )}

            <span className="particle-shape-check">
              {particles.shape ===
              "custom"
                ? "✓"
                : ""}
            </span>
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/webp"
          hidden
          onChange={(
            event
          ) => {
            void handleCustomParticleUpload(
              event.target
                .files?.[0]
            );

            event.currentTarget.value =
              "";
          }}
        />

        {particles.customImageUrl && (
          <div className="custom-particle-info">
            <img
              src={
                particles.customImageUrl
              }
              alt=""
            />

            <div>
              <strong>
                Motif personnalisé
              </strong>

              <small>
                {
                  particles.customImageName ??
                  "Image importée"
                }
              </small>
            </div>

            {!particles.customImageGlobalAssetId && <PublishGlobalAssetButton compact input={particles.customImageAssetId ? { sourceAssetId: particles.customImageAssetId, type: "particle", name: particles.customImageName ?? "Particule" } : undefined} />}

            <button
              type="button"
              title="Supprimer le motif personnalisé"
              onClick={() =>
                update({
                  shape:
                    "heart",
                  customImageUrl:
                    undefined,
                  customImageName:
                    undefined,
                  customImageAssetId:
                    undefined,
                  customImageGlobalAssetId:
                    undefined,
                })
              }
            >
              <Trash2
                size={14}
              />
            </button>
          </div>
        )}

        <p className="particle-help">
          PNG ou WebP · 2 Mo maximum · fond transparent conseillé.
        </p>
      </section>

      {/* Direction */}
      <section className="particle-section">
        <div className="panel-title">
          Direction
        </div>

        <div className="particle-direction-wheel">
          {directions.map(
            (
              direction
            ) => {
              const active =
                particles.direction ===
                direction.id;

              return (
                <button
                  type="button"
                  key={
                    direction.id
                  }
                  title={
                    direction.label
                  }
                  aria-label={
                    direction.label
                  }
                  className={`particle-direction-button direction-${direction.id} ${
                    active
                      ? "active"
                      : ""
                  }`}
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
              );
            }
          )}

          <div className="particle-direction-center">
            •
          </div>
        </div>
      </section>

      {/* Vitesse */}
      <section className="particle-section">
        <div className="particle-control-header">
          <span>
            Vitesse
          </span>

          <strong>
            {particles.speed ===
            0
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
          onChange={(
            event
          ) =>
            update({
              speed:
                Number(
                  event.target
                    .value
                ),
            })
          }
        />

        {particles.speed ===
          0 && (
          <p className="particle-help">
            Les particules restent dans
            l'écran et flottent doucement.
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
            {
              particles.quantity
            }
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
          onChange={(
            event
          ) =>
            update({
              quantity:
                Number(
                  event.target
                    .value
                ),
            })
          }
        />
      </section>

      {/* Couleurs */}
      {particles.shape === "custom" ? <p className="particle-custom-color-note">Les couleurs et la transparence de votre image sont conservées. La palette de couleurs s’applique uniquement aux motifs proposés.</p> :
      <section className="particle-section">
        <div className="particle-control-header">
          <span>
            Couleurs
          </span>

          <small>
            {
              particles
                .colors
                .length
            }
            /5
          </small>
        </div>

        <div className="particle-colors">
          {particles.colors.map(
            (
              color,
              index
            ) => (
              <div
                className="particle-color-row"
                key={index}
              >
                <StableColorInput
                  value={
                    color
                  }
                  onChange={(
                    value
                  ) =>
                    updateColor(
                      index,
                      value
                    )
                  }
                />

                <input
                  type="text"
                  value={
                    color
                  }
                  onChange={(
                    event
                  ) =>
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
                    particles
                      .colors
                      .length <=
                    1
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

        {particles.colors
          .length < 5 && (
          <button
            type="button"
            className="particle-add-color"
            onClick={
              addColor
            }
          >
            <Plus
              size={15}
            />

            Ajouter une couleur
          </button>
        )}
      </section>

      }

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

            <small>
              px
            </small>
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

            <small>
              px
            </small>
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
          onChange={(
            event
          ) =>
            update({
              opacity:
                Number(
                  event.target
                    .value
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
                layer:
                  "behind",
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
                layer:
                  "front",
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
