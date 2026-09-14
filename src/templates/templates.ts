import type { EditorElement, WeddingProject } from "../types/editor";

const id = () => crypto.randomUUID();

const now = () => new Date().toISOString();

const text = (
  value: string,
  y: number,
  size: number,
  font: string,
  color: string,
  name = "Texte"
): EditorElement => ({
  id: id(),
  type: "text",
  name,
  x: 30,
  y,
  width: 330,
  height: size * 1.8,
  rotation: 0,
  opacity: 1,
  zIndex: y,
  visible: true,
  locked: false,
  text: value,
  fontFamily: font,
  fontSize: size,
  fontWeight: 400,
  color,
  textAlign: "center",
  lineHeight: 1.15,
  letterSpacing: 0,
  italic: false,
  underline: false,

  animation: {
    type: "fade",
    duration: 0.8,
    delay: Math.max(0, y / 900),
  },
});

const ornament = (
  icon: string,
  y: number,
  color: string
): EditorElement => ({
  id: id(),
  type: "icon",
  name: "Ornement",
  x: 145,
  y,
  width: 100,
  height: 80,
  rotation: 0,
  opacity: 1,
  zIndex: y,
  visible: true,
  locked: false,
  icon,
  color,
  fontSize: 54,

  animation: {
    type: "zoom",
    duration: 0.8,
    delay: 0.2,
  },
});

const create = (
  name: string,
  background: WeddingProject["pages"][number]["background"],
  elements: EditorElement[]
): WeddingProject => ({
  id: id(),

  name,

  createdAt: now(),
  updatedAt: now(),

  status: "draft",
  paymentStatus: "unpaid",

  opening: {
    type: "envelope",
    duration: 3.4,

    colors: [
      "#E7D2C3",
      "#F5E9DF",
      "#B58A62",
    ],

    variant: "classic",

    customSettings: {
      flapColor: "#DFC4B1",
      backgroundColor: "#F5EFEA",
      hintText: "Touchez pour ouvrir",
    },
  },

  audio: {
    enabled: false,
    source: null,
    volume: 0.7,
    loop: true,
    startMode: "opening-interaction",
    fadeInDuration: 2,
  },

  // Effet de particules global du faire-part.
  // Désactivé par défaut : l'utilisateur pourra ensuite
  // l'activer et personnaliser tous ces paramètres.
  particles: {
    enabled: false,

    // Motif affiché
    shape: "heart",

    // Direction lorsque speed > 0
    direction: "down",

    // 0 = particules flottantes qui restent à l'écran.
    // > 0 = déplacement continu dans la direction choisie.
    speed: 30,

    // Nombre de particules affichées simultanément.
    quantity: 25,

    // Une particule pourra choisir l'une de ces couleurs.
    colors: [
      "#FFFFFF",
      "#F0CACA",
    ],

    // Taille aléatoire entre ces deux valeurs.
    minSize: 8,
    maxSize: 18,

    opacity: 0.8,

    // Les particules passent devant le faire-part.
    layer: "front",
  },

  pages: [
    {
      id: id(),
      name: "Couverture",
      background,
      elements,
    },

    {
      id: id(),

      name: "Informations",

      background: {
        type: "color",
        color: "#fbf8f4",
      },

      elements: [
        text(
          "Nous avons la joie de vous inviter",
          170,
          24,
          "Cormorant Garamond",
          "#473e38"
        ),

        text(
          "Samedi 18 juin 2027",
          300,
          34,
          "Playfair Display",
          "#815e4b",
          "Date"
        ),

        text(
          "Domaine de la Roseraie · 16 h",
          405,
          19,
          "Montserrat",
          "#6f655f",
          "Lieu"
        ),
      ],
    },
  ],
});

export const createBlankProject = (): WeddingProject =>
  create(
    "Mon faire-part",

    {
      type: "color",
      color: "#fffdf9",
    },

    [
      text(
        "Emma & Lucas",
        280,
        48,
        "Cormorant Garamond",
        "#3e3935",
        "Prénoms"
      ),

      text(
        "Nous nous marions",
        360,
        18,
        "Montserrat",
        "#9b755d",
        "Annonce"
      ),
    ]
  );

export const templateFactories = [
  {
    id: "minimal",

    name: "Minimal",

    eyebrow: "Serein & délicat",

    colors: [
      "#f3ede4",
      "#2f332e",
    ],

    create: () =>
      create(
        "Minimal — Emma & Lucas",

        {
          type: "color",
          color: "#f3ede4",
        },

        [
          text(
            "NOUS NOUS MARIONS",
            205,
            14,
            "Montserrat",
            "#7e6b5d",
            "Annonce"
          ),

          text(
            "Emma\n& Lucas",
            275,
            56,
            "Cormorant Garamond",
            "#2f332e",
            "Prénoms"
          ),

          text(
            "18 · 06 · 2027",
            470,
            17,
            "Montserrat",
            "#7e6b5d",
            "Date"
          ),
        ]
      ),
  },

  {
    id: "botanical",

    name: "Botanique",

    eyebrow: "Naturel & poétique",

    colors: [
      "#e8eee5",
      "#52634b",
    ],

    create: () =>
      create(
        "Botanique — Emma & Lucas",

        {
          type: "gradient",

          gradient: {
            type: "linear",
            color1: "#f5f1e8",
            color2: "#e2ebdf",
            angle: 150,
          },
        },

        [
          ornament(
            "❦",
            155,
            "#6c7c61"
          ),

          text(
            "Emma & Lucas",
            285,
            50,
            "Great Vibes",
            "#52634b",
            "Prénoms"
          ),

          text(
            "se disent oui",
            370,
            19,
            "Lora",
            "#756e5f",
            "Annonce"
          ),

          text(
            "18 juin 2027",
            445,
            25,
            "Cormorant Garamond",
            "#52634b",
            "Date"
          ),

          ornament(
            "❧",
            535,
            "#8a987e"
          ),
        ]
      ),
  },

  {
    id: "elegant",

    name: "Élégant",

    eyebrow: "Intemporel & couture",

    colors: [
      "#fbfaf7",
      "#b08a50",
    ],

    create: () =>
      create(
        "Élégant — Emma & Lucas",

        {
          type: "color",
          color: "#fbfaf7",
        },

        [
          text(
            "E  ·  L",
            150,
            20,
            "Cinzel",
            "#b08a50",
            "Monogramme"
          ),

          text(
            "Emma",
            260,
            57,
            "Playfair Display",
            "#171717",
            "Prénom"
          ),

          text(
            "&",
            330,
            38,
            "Cormorant Garamond",
            "#b08a50",
            "Esperluette"
          ),

          text(
            "Lucas",
            385,
            57,
            "Playfair Display",
            "#171717",
            "Prénom"
          ),

          text(
            "PARIS · 18 JUIN 2027",
            540,
            13,
            "Montserrat",
            "#6c6257",
            "Date"
          ),
        ]
      ),
  },
] as const;
