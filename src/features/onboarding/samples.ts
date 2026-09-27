import type { TFunction } from 'i18next';
import manifest from './sampleManifest.json';

/**
 * The bundled sample scores, as described by the manifest scripts/gen-samples.mjs writes next to
 * the PDFs (android/app/src/main/assets/samples). Sources and licences: design/samples/SOURCES.md.
 */

/** 'pd' public-domain work, our engraving CC0 · 'pd-arr' public-domain work, our arrangement CC0 · 'cc0' original. */
export type SampleLicence = 'pd' | 'pd-arr' | 'cc0';

export type SampleInfo = {
  file: string;
  title: string;
  composer: string;
  genre: string;
  key: string | null;
  tags: string[];
  licence: SampleLicence;
  sha256: string;
};

export const SAMPLES: readonly SampleInfo[] = manifest.samples.map(s => ({ ...s, licence: s.licence as SampleLicence }));

/** The sample a library score came from (matched by its original file name), if any. */
export function sampleFor(originalName: string | null | undefined): SampleInfo | null {
  return SAMPLES.find(s => s.file === originalName) ?? null;
}

/** The in-app licence line for a sample score (score details). */
export function sampleLicenceNote(originalName: string | null | undefined, t: TFunction): string {
  switch (sampleFor(originalName)?.licence) {
    case 'pd':
      return t('onboarding.licence.pd');
    case 'pd-arr':
      return t('onboarding.licence.pdArr');
    case 'cc0':
      return t('onboarding.licence.cc0');
    default:
      return t('onboarding.licence.sample');
  }
}
