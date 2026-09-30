import { H5P } from 'h5p-utils';
import { H5PLibraryText } from '../types/H5PLibraryText';
import { Params } from '../types/Params';
import { createTimelineDefinition } from '../utils/timeline.utils';
import { TimelineDescriptionRuntimeAdapter } from './TimelineDescriptionRuntimeAdapter';
import {
  DescriptionTooltipRuntimeConstructor,
  TimelineDescriptionTooltipController,
} from './TimelineDescriptionTooltipController';

jest.mock('h5p-utils', () => ({ H5P: {} }));

type SlideEvent = { unique_id?: string };
const createEvents = () => {
  const listeners = new Map<string, Set<(event: SlideEvent) => void>>();
  return {
    current_id: 'slide-1',
    on: jest.fn((type: string, callback: (event: SlideEvent) => void) => {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)?.add(callback);
    }),
    off: jest.fn((type: string, callback: (event: SlideEvent) => void) => {
      listeners.get(type)?.delete(callback);
    }),
    emit: (type: string, event: SlideEvent = {}) => {
      listeners.get(type)?.forEach((callback) => callback(event));
    },
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
};

const text = '<p><span class="papijo-tooltip" data-papijo-tooltip="Help">Term</span></p>';
const makeDescription = (params: H5PLibraryText['params'] = { text }): H5PLibraryText => ({
  library: 'H5P.AdvancedTextPapiJo 1.2',
  params,
  subContentId: 'child-id-is-not-parent-id',
});
const images = [{
  id: 'image-1',
  image: { path: 'images/help.png', width: 480, height: 320, mime: 'image/png' },
  alt: 'A diagram',
  extraMetadata: { retained: true },
}];
const optionalH5P = H5P as typeof H5P & {
  AdvancedTextPapiJoTooltipRuntime?: DescriptionTooltipRuntimeConstructor;
};

describe('Timeline description tooltip lifecycle', () => {
  let adapter: TimelineDescriptionRuntimeAdapter;
  let container: HTMLDivElement;
  let timeline: ReturnType<typeof createEvents>;
  let resizeEvents: ReturnType<typeof createEvents>;
  let controller: TimelineDescriptionTooltipController;
  let requestResize: jest.Mock;
  let Runtime: jest.Mock;
  let instances: Array<{
    initialize: jest.Mock;
    close: jest.Mock;
    reposition: jest.Mock;
    destroy: jest.Mock;
  }>;
  let callbacks: Array<() => void>;

  const register = (slideId = 'slide-1', description = makeDescription()) => {
    const host = document.createElement('div');
    host.id = `${slideId}_description`;
    host.innerHTML = description.params.text ?? '';
    container.appendChild(host);
    adapter.register(slideId, host.id, description);
    return host;
  };

  beforeEach(() => {
    adapter = new TimelineDescriptionRuntimeAdapter();
    container = document.createElement('div');
    document.body.appendChild(container);
    timeline = createEvents();
    resizeEvents = createEvents();
    requestResize = jest.fn();
    instances = [];
    callbacks = [];
    Runtime = jest.fn((_host, _contentId, _images, onResize) => {
      callbacks.push(onResize);
      const instance = {
        initialize: jest.fn(() => 1),
        close: jest.fn(),
        reposition: jest.fn(),
        destroy: jest.fn(),
      };
      instances.push(instance);
      return instance;
    });
    optionalH5P.AdvancedTextPapiJoTooltipRuntime = Runtime;
    H5P.getPath = jest.fn();
    controller = new TimelineDescriptionTooltipController({
      adapter, container, timeline, resizeEvents, contentId: 'parent-42',
      onResize: requestResize,
    });
  });

  afterEach(() => {
    controller.destroy();
    container.remove();
    delete optionalH5P.AdvancedTextPapiJoTooltipRuntime;
  });

  it('initializes text tooltips only after loaded, with the rendered host and original data', () => {
    const description = makeDescription();
    const host = register('slide-1', description);
    timeline.emit('change', { unique_id: 'slide-1' });
    resizeEvents.emit('resize');
    expect(Runtime).not.toHaveBeenCalled();
    timeline.emit('loaded');
    expect(Runtime).toHaveBeenCalledTimes(1);
    expect(Runtime).toHaveBeenCalledWith(host, 'parent-42', undefined, expect.any(Function));
    expect(instances[0].initialize).toHaveBeenCalledTimes(1);
    expect(adapter.get('slide-1')?.description).toBe(description);
    expect(host.innerHTML).toBe(text);
    expect(host.querySelector('span')?.getAttribute('data-papijo-tooltip')).toBe('Help');
  });

  it.each([
    ['image', '<span class="papijo-tooltip" data-papijo-tooltip-id="image-1">Image</span>'],
    ['combined text and image', '<span class="papijo-tooltip" data-papijo-tooltip="Help" data-papijo-tooltip-id="image-1">Both</span>'],
  ])('passes %s data intact and leaves path resolution to the runtime', (_kind, html) => {
    const description = makeDescription({ text: html, tooltipImages: images });
    const host = register('slide-1', description);
    timeline.emit('loaded');
    expect(Runtime.mock.calls[0][0]).toBe(host);
    expect(Runtime.mock.calls[0][1]).toBe('parent-42');
    expect(Runtime.mock.calls[0][2]).toBe(images);
    expect(images[0].image.path).toBe('images/help.png');
    expect(H5P.getPath).not.toHaveBeenCalled();
    expect(host.innerHTML).toBe(html);
  });

  it.each(['H5P.AdvancedText 1.1', 'H5P.OtherLibrary 1.0'])('leaves %s unchanged', (library) => {
    const host = register('slide-1', { ...makeDescription(), library });
    const html = host.innerHTML;
    timeline.emit('loaded');
    timeline.emit('change', { unique_id: 'slide-1' });
    resizeEvents.emit('resize');
    expect(Runtime).not.toHaveBeenCalled();
    expect(host.innerHTML).toBe(html);
  });

  it.each([undefined, {}, 'not callable'])('degrades to ordinary HTML for runtime %p', (runtime) => {
    Object.assign(optionalH5P, { AdvancedTextPapiJoTooltipRuntime: runtime });
    const host = register();
    expect(() => {
      timeline.emit('loaded');
      timeline.emit('change');
      resizeEvents.emit('resize');
    }).not.toThrow();
    expect(host.innerHTML).toBe(text);
    expect(Runtime).not.toHaveBeenCalled();
  });

  it('does not duplicate initialization or subscriptions on repeated loaded/change/resize', async () => {
    const host = register();
    for (let index = 0; index < 3; index += 1) {
      timeline.emit('loaded');
      timeline.emit('change', { unique_id: 'slide-1' });
      resizeEvents.emit('resize');
    }
    host.appendChild(document.createElement('div'));
    await Promise.resolve();
    expect(Runtime).toHaveBeenCalledTimes(1);
    expect(instances[0].initialize).toHaveBeenCalledTimes(1);
    expect(timeline.count('loaded')).toBe(1);
    expect(timeline.count('change')).toBe(1);
    expect(resizeEvents.count('resize')).toBe(1);
  });

  it('closes inactive slides and reuses/repositions the active runtime, including an ordinary destination', () => {
    register();
    register('slide-2');
    register('slide-3', { ...makeDescription(), library: 'H5P.AdvancedText 1.1' });
    timeline.emit('loaded');
    instances.forEach((instance) => instance.close.mockClear());
    instances.forEach((instance) => instance.reposition.mockClear());
    timeline.emit('change', { unique_id: 'slide-2' });
    expect(instances[0].close).toHaveBeenCalledTimes(1);
    expect(instances[1].close).not.toHaveBeenCalled();
    expect(instances[1].reposition).toHaveBeenCalledTimes(1);
    timeline.emit('change', { unique_id: 'slide-3' });
    expect(instances[1].close).toHaveBeenCalledTimes(1);
    timeline.emit('change', { unique_id: 'slide-1' });
    expect(Runtime).toHaveBeenCalledTimes(2);
    expect(instances[0].reposition).toHaveBeenCalledTimes(1);
  });

  it('uses the initial current slide and the current-id fallback on change', () => {
    register();
    register('slide-2');
    timeline.current_id = 'slide-2';
    timeline.emit('loaded');
    instances.forEach((instance) => instance.close.mockClear());
    timeline.current_id = 'slide-1';
    timeline.emit('change');
    expect(instances[1].close).toHaveBeenCalledTimes(1);
    expect(instances[0].close).not.toHaveBeenCalled();
  });

  it('propagates runtime resize and prevents recursive emission during parent repositioning', () => {
    register();
    timeline.emit('loaded');
    callbacks[0]();
    expect(requestResize).toHaveBeenCalledTimes(1);
    instances[0].reposition.mockImplementation(callbacks[0]);
    resizeEvents.emit('resize');
    expect(requestResize).toHaveBeenCalledTimes(1);
    instances[0].close.mockImplementation(callbacks[0]);
    timeline.emit('change', { unique_id: 'ordinary-slide' });
    expect(requestResize).toHaveBeenCalledTimes(2);
  });

  it('destroys instances once, removes subscriptions and ignores mutations/events/callbacks after cleanup', async () => {
    register();
    register('slide-2');
    timeline.emit('loaded');
    controller.destroy();
    controller.destroy();
    timeline.emit('loaded');
    timeline.emit('change');
    resizeEvents.emit('resize');
    callbacks[0]();
    container.innerHTML = '<div id="slide-1_description">replacement</div>';
    await Promise.resolve();
    instances.forEach((instance) => expect(instance.destroy).toHaveBeenCalledTimes(1));
    expect(timeline.count('loaded')).toBe(0);
    expect(timeline.count('change')).toBe(0);
    expect(resizeEvents.count('resize')).toBe(0);
    expect(Runtime).toHaveBeenCalledTimes(2);
    expect(requestResize).not.toHaveBeenCalled();
  });

  it('destroys a replaced host and initializes its replacement once without another Timeline event', async () => {
    const host = register();
    timeline.emit('loaded');
    const replacement = host.cloneNode(true) as HTMLElement;
    host.replaceWith(replacement);
    await Promise.resolve();
    expect(instances[0].destroy).toHaveBeenCalledTimes(1);
    expect(Runtime).toHaveBeenCalledTimes(2);
    expect(Runtime.mock.calls[1][0]).toBe(replacement);
    timeline.emit('loaded');
    timeline.emit('change');
    expect(Runtime).toHaveBeenCalledTimes(2);
    controller.destroy();
    instances.forEach((instance) => expect(instance.destroy).toHaveBeenCalledTimes(1));
  });

  it('destroys a removed host and enhances a later reattached host once', async () => {
    const host = register();
    timeline.emit('loaded');
    host.remove();
    await Promise.resolve();
    expect(instances[0].destroy).toHaveBeenCalledTimes(1);
    container.appendChild(host);
    await Promise.resolve();
    expect(Runtime).toHaveBeenCalledTimes(2);
  });

  it('initializes a host rendered later and ignores matching IDs outside this Timeline', async () => {
    adapter.register('slide-1', 'late-host', makeDescription());
    const host = document.createElement('div');
    host.id = 'late-host';
    host.innerHTML = text;
    document.body.appendChild(host);
    timeline.emit('loaded');
    expect(Runtime).not.toHaveBeenCalled();
    container.appendChild(host);
    await Promise.resolve();
    expect(Runtime).toHaveBeenCalledTimes(1);
    expect(Runtime.mock.calls[0][0]).toBe(host);
  });

  it('initializes unique title, right-layout and left-layout hosts', () => {
    let uuid = 0;
    (window as any).H5P = { createUUID: () => `layout-${++uuid}` };
    const base = {
      mediaType: 'none' as const,
      appearance: { backgroundType: 'none' as const },
      description: makeDescription(),
    };
    const params: Params = {
      showTitleSlide: true,
      titleSlide: { ...base, id: 'title', title: 'Title', slideType: 'title', layout: 'right' },
      timelineItems: [
        { ...base, id: 'event', title: 'Event', slideType: 'regular', startDate: '2000', layout: 'right' },
        {
          ...base, id: 'left', title: 'Left', slideType: 'regular', startDate: '2001', layout: 'left',
        },
      ],
    };
    const [definition, , layoutAdapter] = createTimelineDefinition('Title', params);
    if (typeof definition === 'string') {
      throw new Error('Expected Timeline definition');
    }
    controller.destroy();
    const slides = [definition.title, ...definition.events];
    container.innerHTML = slides.map((slide) => (slide?.text as { text: string }).text).join('');
    timeline.current_id = definition.title?.unique_id ?? '';
    controller = new TimelineDescriptionTooltipController({
      adapter: layoutAdapter, container, timeline, resizeEvents, contentId: 42,
      onResize: requestResize,
    });
    controller.handleLoaded();
    expect(Runtime).toHaveBeenCalledTimes(3);
    expect(new Set(Runtime.mock.calls.map(([host]) => host)).size).toBe(3);
    instances.forEach((instance) => expect(instance.initialize).toHaveBeenCalledTimes(1));
    layoutAdapter.getAll().forEach((entry) => {
      expect(container.querySelectorAll(`[id="${entry.hostId}"]`)).toHaveLength(1);
      expect(Runtime.mock.calls.some(([host]) => host.id === entry.hostId)).toBe(true);
    });
  });

  it('lets the runtime own ARIA, keyboard, focus and pointer behavior and remove its listeners', () => {
    Runtime.mockImplementation((host: HTMLElement) => {
      const trigger = host.querySelector('span') as HTMLElement;
      let bubble: HTMLElement | null = null;
      const close = jest.fn(() => {
        bubble?.remove();
        bubble = null;
        trigger.setAttribute('aria-expanded', 'false');
        trigger.removeAttribute('aria-controls');
        trigger.removeAttribute('aria-describedby');
      });
      const open = () => {
        if (bubble) {
          return;
        }
        bubble = document.createElement('div');
        bubble.id = 'owned-by-runtime';
        bubble.setAttribute('role', 'tooltip');
        host.appendChild(bubble);
        trigger.setAttribute('aria-expanded', 'true');
        trigger.setAttribute('aria-controls', bubble.id);
        trigger.setAttribute('aria-describedby', bubble.id);
      };
      const keydown = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          close();
        }
        else if (event.key === 'Enter' || event.key === ' ') {
          open();
        }
      };
      return {
        initialize: jest.fn(() => {
          trigger.setAttribute('role', 'button');
          trigger.setAttribute('tabindex', '0');
          trigger.setAttribute('aria-expanded', 'false');
          trigger.addEventListener('keydown', keydown);
          trigger.addEventListener('focus', open);
          trigger.addEventListener('pointerenter', open);
          return 1;
        }),
        close,
        reposition: jest.fn(),
        destroy: jest.fn(() => {
          close();
          trigger.removeEventListener('keydown', keydown);
          trigger.removeEventListener('focus', open);
          trigger.removeEventListener('pointerenter', open);
        }),
      };
    });
    const host = register();
    const trigger = host.querySelector('span') as HTMLElement;
    expect(trigger.hasAttribute('role')).toBe(false);
    timeline.emit('loaded');
    timeline.emit('loaded');
    expect(trigger.getAttribute('role')).toBe('button');
    expect(trigger.getAttribute('tabindex')).toBe('0');
    ['Enter', ' '].forEach((key) => {
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      expect(trigger.getAttribute('aria-controls')).toBe('owned-by-runtime');
      expect(trigger.getAttribute('aria-describedby')).toBe('owned-by-runtime');
      expect(host.querySelectorAll('[role="tooltip"]')).toHaveLength(1);
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(trigger.getAttribute('aria-expanded')).toBe('false');
    });
    ['focus', 'pointerenter'].forEach((type) => {
      trigger.dispatchEvent(new Event(type));
      expect(trigger.getAttribute('aria-expanded')).toBe('true');
      timeline.emit('change', { unique_id: 'ordinary-slide' });
      expect(host.querySelector('[role="tooltip"]')).toBeNull();
    });
    controller.destroy();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    expect(Runtime).toHaveBeenCalledTimes(1);
  });
});
