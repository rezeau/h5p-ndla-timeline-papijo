import { H5PContentId } from 'h5p-types';
import { H5P } from 'h5p-utils';
import { H5PTooltipImage } from '../types/H5PLibraryText';
import { TimelineDescriptionRuntimeAdapter } from './TimelineDescriptionRuntimeAdapter';

export type DescriptionTooltipRuntime = {
  initialize: () => number;
  close: () => void;
  reposition: () => void;
  destroy: () => void;
};

export type DescriptionTooltipRuntimeConstructor = new (
  host: HTMLElement,
  contentId: H5PContentId,
  tooltipImages: Array<H5PTooltipImage> | undefined,
  onResize: () => void,
) => DescriptionTooltipRuntime;

type SlideEvent = { unique_id?: string };
type TimelineEvents = {
  current_id: string;
  on: (type: string, callback: (event: SlideEvent) => void) => void;
  off: (type: string, callback: (event: SlideEvent) => void) => void;
};
type ResizeEvents = {
  on: (type: string, callback: () => void) => void;
  off: (type: string, callback: () => void) => void;
};
type ControllerOptions = {
  adapter: TimelineDescriptionRuntimeAdapter;
  container: HTMLElement;
  timeline: TimelineEvents;
  resizeEvents?: ResizeEvents;
  contentId: H5PContentId;
  onResize: () => void;
};

const getRuntimeConstructor = (): DescriptionTooltipRuntimeConstructor | undefined => {
  const runtime = (H5P as typeof H5P & {
    AdvancedTextPapiJoTooltipRuntime?: DescriptionTooltipRuntimeConstructor;
  }).AdvancedTextPapiJoTooltipRuntime;
  return typeof runtime === 'function' ? runtime : undefined;
};

/** Owns only the optional tooltip runtime, never the AdvancedText child library. */
export class TimelineDescriptionTooltipController {
  private readonly runtimes = new Map<string, {
    host: HTMLElement;
    runtime: DescriptionTooltipRuntime;
  }>();

  private observer?: MutationObserver;
  private loaded = false;
  private destroyed = false;
  private repositioning = false;
  private activeSlideId?: string;

  constructor(private readonly options: ControllerOptions) {
    options.timeline.on('loaded', this.handleLoaded);
    options.timeline.on('change', this.handleChange);
    options.resizeEvents?.on('resize', this.handleResize);
  }

  // The component calls this after its existing post-loaded HTML repair.
  handleLoaded = (): void => {
    if (this.destroyed) {
      return;
    }
    this.loaded = true;
    this.activeSlideId = this.options.timeline.current_id;
    this.synchronizeHosts();
    if (!this.observer) {
      this.observer = new MutationObserver(() => this.synchronizeHosts());
      this.observer.observe(this.options.container, { childList: true, subtree: true });
    }
    this.updateActiveRuntime();
  };

  private handleChange = (event: SlideEvent = {}): void => {
    if (!this.loaded || this.destroyed) {
      return;
    }
    this.activeSlideId = event.unique_id ?? this.options.timeline.current_id;
    this.synchronizeHosts();
    this.updateActiveRuntime();
  };

  private handleResize = (): void => {
    if (!this.loaded || this.destroyed || this.repositioning) {
      return;
    }
    this.repositioning = true;
    try {
      this.synchronizeHosts();
      this.updateActiveRuntime();
    }
    finally {
      this.repositioning = false;
    }
  };

  private requestResize = (): void => {
    // Repositioning is already inside the parent resize/layout pass. Prevent
    // recursive resize emission when the runtime adjusts its reserved space.
    if (!this.destroyed && !this.repositioning) {
      this.options.onResize();
    }
  };

  private synchronizeHosts(): void {
    if (this.destroyed) {
      return;
    }
    const Runtime = getRuntimeConstructor();
    this.options.adapter.getAll().forEach((entry) => {
      if (entry.route !== 'advanced-text-papijo') {
        return;
      }
      // Scope IDs to this Timeline without interpolating them into CSS selectors.
      const candidate = this.options.container.ownerDocument.getElementById(entry.hostId);
      const host = candidate && this.options.container.contains(candidate) ? candidate : null;
      const existing = this.runtimes.get(entry.slideId);
      if (existing && existing.host !== host) {
        this.runtimes.delete(entry.slideId);
        existing.runtime.destroy();
      }
      if (!host || !Runtime || this.runtimes.has(entry.slideId)) {
        return;
      }
      const runtime = new Runtime(
        host,
        this.options.contentId,
        entry.description.params.tooltipImages,
        this.requestResize,
      );
      this.runtimes.set(entry.slideId, { host, runtime });
      runtime.initialize();
      if (entry.slideId !== this.activeSlideId) {
        runtime.close();
      }
      else {
        runtime.reposition();
      }
    });
  }

  private updateActiveRuntime(): void {
    this.runtimes.forEach(({ runtime }, slideId) => {
      if (slideId === this.activeSlideId) {
        runtime.reposition();
      }
      else {
        runtime.close();
      }
    });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.observer?.disconnect();
    this.observer = undefined;
    this.options.timeline.off('loaded', this.handleLoaded);
    this.options.timeline.off('change', this.handleChange);
    this.options.resizeEvents?.off('resize', this.handleResize);
    this.runtimes.forEach(({ runtime }) => runtime.destroy());
    this.runtimes.clear();
    this.activeSlideId = undefined;
  }
}
