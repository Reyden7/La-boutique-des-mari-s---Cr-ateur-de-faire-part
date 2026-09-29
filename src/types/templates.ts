import type { WeddingProject } from "./editor";

export interface TemplateRecord {
  id: string;
  name: string;
  slug: string;
  description: string;
  category: string;
  tags: string[];
  theme?: string | null;
  thumbnailUrl?: string | null;
  previewImageUrl?: string | null;
  templateData: Partial<WeddingProject>;
  isPublished: boolean;
  isFeatured: boolean;
  sortOrder: number;
  version: number;
  sourceProjectId?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface TemplateMetadataInput {
  name: string;
  slug: string;
  description: string;
  category: string;
  tags: string[];
  thumbnailUrl?: string | null;
  previewImageUrl?: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  sortOrder: number;
}

export const TEMPLATE_CATEGORIES = [
  "Romantique", "Bohème", "Minimaliste", "Élégant", "Floral",
  "Champêtre", "Moderne", "Luxe", "Bord de mer", "Nature",
] as const;
