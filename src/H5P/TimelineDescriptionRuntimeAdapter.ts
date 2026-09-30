import { H5PLibraryText } from '../types/H5PLibraryText';

export type TimelineDescriptionRoute =
  | 'advanced-text'
  | 'advanced-text-papijo'
  | 'unsupported';

export type TimelineDescriptionRuntimeEntry = {
  slideId: string;
  hostId: string;
  description: H5PLibraryText;
  route: TimelineDescriptionRoute;
};

const ADVANCED_TEXT_PATTERN = /^H5P\.AdvancedText 1\.1(?:\.\d+)?$/;
const ADVANCED_TEXT_PAPIJO_PATTERN =
  /^H5P\.AdvancedTextPapiJo 1\.2(?:\.\d+)?$/;

export const getTimelineDescriptionRoute = (
  description: H5PLibraryText,
): TimelineDescriptionRoute => {
  const library = description.library?.trim() ?? '';

  if (ADVANCED_TEXT_PATTERN.test(library)) {
    return 'advanced-text';
  }

  if (ADVANCED_TEXT_PAPIJO_PATTERN.test(library)) {
    return 'advanced-text-papijo';
  }

  return 'unsupported';
};

export const createTimelineDescriptionHostId = (slideId: string): string =>
  `${slideId}_description`;

/**
 * Retains description child parameters for post-render runtime integration.
 * Phase 1 deliberately does not initialize or attach any child runtime.
 */
export class TimelineDescriptionRuntimeAdapter {
  private readonly entries = new Map<string, TimelineDescriptionRuntimeEntry>();

  register(
    slideId: string,
    hostId: string,
    description: H5PLibraryText,
  ): TimelineDescriptionRuntimeEntry {
    if (this.entries.has(slideId)) {
      throw new Error(`A description is already registered for slide "${slideId}".`);
    }

    const entry: TimelineDescriptionRuntimeEntry = {
      slideId,
      hostId,
      description,
      route: getTimelineDescriptionRoute(description),
    };
    this.entries.set(slideId, entry);

    return entry;
  }

  get(slideId: string): TimelineDescriptionRuntimeEntry | undefined {
    return this.entries.get(slideId);
  }

  getAll(): Array<TimelineDescriptionRuntimeEntry> {
    return Array.from(this.entries.values());
  }
}
