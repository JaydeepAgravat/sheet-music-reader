export type GlyphPath = { readonly d: string; readonly stroke?: boolean };
export type GlyphSet = { readonly regular: readonly GlyphPath[]; readonly fill: readonly GlyphPath[] };
