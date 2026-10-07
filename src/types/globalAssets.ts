export type EnvelopeGlobalAssetType = "envelope_base" | "envelope_flap" | "envelope_seal";
export type GlobalAssetType = "font" | "welcome_arch" | "welcome_background" | "music" | "particle" | "decoration" | "program_icon" | EnvelopeGlobalAssetType;

export interface GlobalAssetRecord {
  id: string;
  type: GlobalAssetType;
  name: string;
  slug: string;
  storagePath: string | null;
  url: string;
  thumbnailUrl: string | null;
  metadata: Record<string, unknown>;
  category: string | null;
  isPublished: boolean;
  deletePending?: boolean;
  isFeatured: boolean;
  sortOrder: number;
  sourceAssetId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublishGlobalAssetInput {
  sourceAssetId: string;
  type: GlobalAssetType;
  name: string;
  slug?: string;
  category?: string;
  metadata?: Record<string, unknown>;
}

