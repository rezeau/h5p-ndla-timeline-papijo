/* TimelineJS uses dangling underscore */
/* eslint-disable no-underscore-dangle */
import { Timeline } from '@knight-lab/timelinejs';
import { H5P } from 'h5p-utils';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { H5PContext } from '../../contexts/H5PContext';
import { DescriptionTooltipRuntimeConstructor } from '../../H5P/TimelineDescriptionTooltipController';
import { Params } from '../../types/Params';
import { TimeLine } from './TimeLine';

type LiveTimeline = Timeline & {
  goTo: (index: number) => void;
  options: { start_at_slide: number | string };
};
let mockTimeline: LiveTimeline;
let mockLifecycle: Array<{ type: string; id?: string }>;

jest.mock('./TimeLine.scss', () => ({}));
jest.mock('@knight-lab/timelinejs/src/less/TL.Timeline.less', () => ({}));
jest.mock('h5p-utils', () => ({ H5P: {} }));
jest.mock('../../contexts/H5PContext', () => ({
  H5PContext: jest.requireActual('react').createContext(undefined),
}));
jest.mock('@knight-lab/timelinejs', () => {
  const actual = jest.requireActual('@knight-lab/timelinejs');
  return {
    ...actual,
    Timeline: jest.fn((...args) => {
      mockTimeline = new actual.Timeline(...args);
      mockTimeline.on('loaded', () => {
        mockLifecycle.push({ type: 'loaded', id: mockTimeline.current_id });
      });
      mockTimeline.on('change', () => {
        mockLifecycle.push({ type: 'change', id: mockTimeline.current_id });
      });
      return mockTimeline;
    }),
  };
});

// Exercise the installed TimelineJS lifecycle; only the optional child tooltip
// runtime is mocked. Opening requests resize as the real runtime reserves space.
describe('initial title tooltip with real TimelineJS', () => {
  let container: HTMLDivElement;
  let frames: Map<number, FrameRequestCallback>;
  let Runtime: jest.Mock;
  let runtimes: Array<{
    root: HTMLElement;
    initialize: jest.Mock;
    close: jest.Mock;
    reposition: jest.Mock;
    destroy: jest.Mock;
  }>;
  let resizeListeners: Set<() => void>;
  const originalResizeObserver = window.ResizeObserver;
  const originalIntersectionObserver = window.IntersectionObserver;
  const optionalH5P = H5P as typeof H5P & {
    AdvancedTextPapiJoTooltipRuntime?: DescriptionTooltipRuntimeConstructor;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    mockLifecycle = [];
    frames = new Map();
    let nextFrame = 0;
    let nextUuid = 0;
    H5P.createUUID = jest.fn(() => `title-test-${++nextUuid}`);
    (window as any).H5P = H5P;
    window.ResizeObserver = jest.fn(() => ({ observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn() }));
    window.IntersectionObserver = jest.fn(() => ({
      observe: jest.fn(), unobserve: jest.fn(), disconnect: jest.fn(), takeRecords: jest.fn(),
      root: null, rootMargin: '', thresholds: [],
    }));
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      nextFrame += 1;
      frames.set(nextFrame, callback);
      return nextFrame;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    resizeListeners = new Set();
    runtimes = [];
    Runtime = jest.fn((root: HTMLElement, _contentId, _images, onResize: () => void) => {
      const trigger = root.querySelector('span.papijo-tooltip') as HTMLElement;
      let bubble: HTMLElement | null = null;
      const close = jest.fn(() => {
        bubble?.remove();
        bubble = null;
        trigger.setAttribute('aria-expanded', 'false');
      });
      const click = () => {
        if (bubble) {
          close();
          return;
        }
        bubble = document.createElement('div');
        bubble.setAttribute('role', 'tooltip');
        root.appendChild(bubble);
        trigger.setAttribute('aria-expanded', 'true');
        onResize();
      };
      const runtime = {
        root,
        initialize: jest.fn(() => {
          root.classList.add('papijo-runtime-tooltips');
          trigger.classList.add('papijo-runtime-tooltip-trigger');
          trigger.setAttribute('aria-expanded', 'false');
          trigger.addEventListener('click', click);
          return 1;
        }),
        close,
        reposition: jest.fn(),
        destroy: jest.fn(() => {
          close();
          trigger.removeEventListener('click', click);
        }),
      };
      runtimes.push(runtime);
      return runtime;
    });
    optionalH5P.AdvancedTextPapiJoTooltipRuntime = Runtime;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
    delete optionalH5P.AdvancedTextPapiJoTooltipRuntime;
    window.ResizeObserver = originalResizeObserver;
    window.IntersectionObserver = originalIntersectionObserver;
    jest.restoreAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  const renderTimeline = async (showTitleSlide = true) => {
    const description = {
      library: 'H5P.AdvancedTextPapiJo 1.2',
      params: { text: '<p><span class="papijo-tooltip" data-papijo-tooltip="Help">Term</span></p>' },
    };
    const base = {
      layout: 'right' as const, mediaType: 'none' as const,
      appearance: { backgroundType: 'none' as const }, description,
    };
    const params: Params = {
      showTitleSlide, language: 'en',
      behaviour: { scalingMode: 'human', startatslide: '1', startatend: false },
      titleSlide: { ...base, id: 'title', slideType: 'title', title: 'Title' },
      timelineItems: [{ ...base, id: 'event', slideType: 'regular', title: 'Event', startDate: '2000' }],
    };
    const h5p = {
      on: (type: string, callback: () => void) => {
        if (type === 'resize') {
          resizeListeners.add(callback);
        }
      },
      off: (type: string, callback: () => void) => {
        if (type === 'resize') {
          resizeListeners.delete(callback);
        }
      },
      trigger: (type: string) => {
        if (type === 'resize') {
          resizeListeners.forEach((callback) => callback());
        }
      },
    };
    await act(async () => {
      ReactDOM.render(
        <H5PContext.Provider value={h5p as any}>
          <TimeLine data={params} timelineTitle="Timeline" contentId="parent-42" onMediaInstanceBuilt={jest.fn()} />
        </H5PContext.Provider>, container,
      );
      // TimelineJS's built-in English language resolves asynchronously. act
      // drains its initialization and React's post-loaded effects.
      await Promise.resolve();
    });
  };

  const flushFrames = () => {
    act(() => {
      const pendingFrames = Array.from(frames.values());
      frames.clear();
      pendingFrames.forEach((callback) => callback(0));
    });
  };

  it('keeps the live title tooltip open on initial load/resize and reuses it after title -> event -> title', async () => {
    await renderTimeline();
    const titleSlide = container.querySelector('.tl-slide-titleslide') as HTMLElement;
    const titleHost = titleSlide.querySelector('.h5p-tl-slide-description') as HTMLElement;
    const trigger = titleHost.querySelector('span') as HTMLElement;
    const titleRuntime = runtimes.find((runtime) => runtime.root === titleHost);
    expect(titleHost.classList.contains('h5p-advanced-text')).toBe(true);
    expect(titleHost.classList.contains('papijo-runtime-tooltips')).toBe(true);
    expect(titleSlide.hasAttribute('inert')).toBe(false);
    expect(trigger.classList.contains('papijo-runtime-tooltip-trigger')).toBe(true);
    expect(titleRuntime).toBeDefined();
    expect(titleRuntime?.initialize).toHaveBeenCalledTimes(1);
    expect(Runtime).toHaveBeenCalledTimes(2);

    trigger.click();
    expect(titleHost.querySelector('[role="tooltip"]')).not.toBeNull();
    flushFrames();
    expect(titleHost.querySelector('[role="tooltip"]')).not.toBeNull();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(mockTimeline.current_id).toBe(titleSlide.id);
    expect(mockTimeline.options.start_at_slide).toBe(0);
    expect(mockLifecycle.slice(0, 2)).toEqual([
      { type: 'loaded', id: undefined },
      { type: 'change', id: titleSlide.id },
    ]);

    const listenersBeforeNavigation = resizeListeners.size;
    act(() => {
      mockTimeline.goTo(1);
    });
    expect(titleHost.querySelector('[role="tooltip"]')).toBeNull();
    expect(titleSlide.hasAttribute('inert')).toBe(true);
    const eventHost = container.querySelector('.tl-slide:not(.tl-slide-titleslide) .h5p-tl-slide-description') as HTMLElement;
    expect(eventHost.classList.contains('h5p-advanced-text')).toBe(true);
    expect(eventHost.classList.contains('papijo-runtime-tooltips')).toBe(true);
    (eventHost.querySelector('span') as HTMLElement).click();
    flushFrames();
    expect(eventHost.querySelector('[role="tooltip"]')).not.toBeNull();

    act(() => {
      mockTimeline.goTo(0);
    });
    expect(eventHost.querySelector('[role="tooltip"]')).toBeNull();
    expect(container.querySelector('.tl-slide-titleslide .h5p-tl-slide-description')).toBe(titleHost);
    expect(titleSlide.hasAttribute('inert')).toBe(false);
    expect(titleHost.classList.contains('h5p-advanced-text')).toBe(true);
    expect(titleHost.classList.contains('papijo-runtime-tooltips')).toBe(true);
    trigger.click();
    flushFrames();
    expect(titleHost.querySelector('[role="tooltip"]')).not.toBeNull();
    expect(titleRuntime?.initialize).toHaveBeenCalledTimes(1);
    expect(Runtime).toHaveBeenCalledTimes(2);
    expect(resizeListeners.size).toBe(listenersBeforeNavigation);
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    runtimes.forEach((runtime) => expect(runtime.destroy).toHaveBeenCalledTimes(1));
    expect(resizeListeners.size).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('preserves first-event activation and tooltip resize when there is no title slide', async () => {
    await renderTimeline(false);
    const slide = container.querySelector('.tl-slide') as HTMLElement;
    const host = slide.querySelector('.h5p-tl-slide-description') as HTMLElement;
    expect(slide.hasAttribute('inert')).toBe(false);
    expect(mockTimeline.current_id).toBe(slide.id);
    (host.querySelector('span') as HTMLElement).click();
    flushFrames();
    expect(host.querySelector('[role="tooltip"]')).not.toBeNull();
    expect(Runtime).toHaveBeenCalledTimes(1);
    expect(runtimes[0].initialize).toHaveBeenCalledTimes(1);
  });
});
