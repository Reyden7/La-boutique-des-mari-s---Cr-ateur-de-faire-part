import type { DecorativeHeartStyle, EditorElement } from "../../types/editor";

export interface DecorativeHeartDefinition {
  id: DecorativeHeartStyle;
  label: string;
  path: string;
  filled: boolean;
  strokeWidth: number;
}

export const DECORATIVE_HEARTS: DecorativeHeartDefinition[] = [
  {
    id: "filled",
    label: "Plein",
    path: "M50 88C44 81 12 61 12 35C12 18 33 10 50 29C67 10 88 18 88 35C88 61 56 81 50 88Z",
    filled: true,
    strokeWidth: 0,
  },
  {
    id: "outline",
    label: "Contour",
    path: "M50 87C44 80 14 60 14 36C14 20 33 13 50 31C67 13 86 20 86 36C86 60 56 80 50 87Z",
    filled: false,
    strokeWidth: 4.2,
  },
  {
    id: "double",
    label: "Double",
    path: "M45 84C39 78 12 59 12 37C12 21 30 14 45 30C60 14 78 21 78 37C78 59 51 78 45 84ZM59 75C55 71 39 59 39 46C39 36 50 31 59 41C68 31 79 36 79 46C79 59 63 71 59 75Z",
    filled: false,
    strokeWidth: 3.2,
  },
  {
    id: "script",
    label: "Calligraphié",
    path: "M18 39C18 17 44 13 50 35C56 13 82 17 82 39C82 60 58 75 50 83C42 75 18 60 18 39ZM24 70C38 82 62 86 83 72C89 68 91 62 87 58C83 54 77 57 78 62",
    filled: false,
    strokeWidth: 3,
  },
  {
    id: "thin",
    label: "Fin",
    path: "M50 91C45 83 20 62 20 36C20 18 42 16 50 34C58 16 80 18 80 36C80 62 55 83 50 91Z",
    filled: false,
    strokeWidth: 1.7,
  },
  {
    id: "wedding",
    label: "Alliance",
    path: "M38 76C33 71 15 57 15 40C15 27 30 21 40 34C50 21 65 27 65 40C65 57 45 72 38 76ZM62 76C57 71 37 57 37 40C37 27 52 21 62 34C72 21 87 27 87 40C87 57 69 71 62 76Z",
    filled: false,
    strokeWidth: 3,
  },
  {
    id: "modern",
    label: "Moderne",
    path: "M50 90L10 48L10 27L31 17L50 36L69 17L90 27L90 48Z",
    filled: true,
    strokeWidth: 0,
  },
  {
    id: "ornamental",
    label: "Ornemental",
    path: "M50 82C45 76 20 59 20 38C20 24 37 17 50 32C63 17 80 24 80 38C80 59 55 76 50 82ZM50 32C44 41 39 47 30 50M50 32C56 41 61 47 70 50M30 50C22 54 18 62 22 70M70 50C78 54 82 62 78 70M22 70C30 66 37 68 42 75M78 70C70 66 63 68 58 75M50 86L46 92L50 98L54 92Z",
    filled: false,
    strokeWidth: 2.4,
  },
];

export const getDecorativeHeart = (style: DecorativeHeartStyle) =>
  DECORATIVE_HEARTS.find((heart) => heart.id === style) ?? DECORATIVE_HEARTS[0];

export const makeDecorativeHeartElement = (style: DecorativeHeartStyle): EditorElement => ({
  id: crypto.randomUUID(),
  type: "icon",
  name: `Cœur ${getDecorativeHeart(style).label}`,
  x: 135,
  y: 300,
  width: 120,
  height: 110,
  rotation: 0,
  opacity: 1,
  zIndex: Date.now(),
  visible: true,
  locked: false,
  icon: "heart",
  heartStyle: style,
  color: "#8a5f58",
  fontSize: 54,
  animation: { type: "none", duration: 0.8, delay: 0 },
});
