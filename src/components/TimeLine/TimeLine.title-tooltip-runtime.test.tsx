/* TimelineJS uses dangling underscore */
/* eslint-disable no-underscore-dangle */
import { Timeline } from '@knight-lab/timelinejs';
import { H5P } from 'h5p-utils';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { H5PContext } from '../../contexts/H5PContext';
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

// Exercise the installed TimelineJS lifecycle with ordinary description text.
describe('ordinary descriptions with real TimelineJS', () => {
  let container: HTMLDivElement;
  let frames: Map<number, FrameRequestCallback>;
  let Runtime: jest.Mock;
  let resizeListeners: Set<() => void>;
  const originalResizeObserver = window.ResizeObserver;
  const originalIntersectionObserver = window.IntersectionObserver;
  const optionalH5P = H5P as typeof H5P & {
    AdvancedTextPapiJoTooltipRuntime?: jest.Mock;
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
    Runtime = jest.fn();
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
    const description = '<p>Ordinary <strong>description</strong></p>';
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

  it('starts on the title, preserves descriptions across navigation, and cleans up resize', async () => {
    await renderTimeline();
    const titleSlide = container.querySelector('.tl-slide-titleslide') as HTMLElement;
    const titleHost = titleSlide.querySelector('.h5p-tl-slide-description') as HTMLElement;
    expect(titleHost.innerHTML).toContain('<p>Ordinary <strong>description</strong></p>');
    expect(titleHost.classList.contains('h5p-advanced-text')).toBe(false);
    expect(titleSlide.hasAttribute('inert')).toBe(false);
    expect(titleSlide.querySelector('.tl-text')?.getAttribute('tabindex')).toBe('0');
    expect(mockTimeline.current_id).toBe(titleSlide.id);
    expect(mockTimeline.options.start_at_slide).toBe(0);
    expect(mockLifecycle.slice(0, 2)).toEqual([
      { type: 'loaded', id: undefined },
      { type: 'change', id: titleSlide.id },
    ]);
    flushFrames();
    const listenersBeforeNavigation = resizeListeners.size;
    act(() => {
      mockTimeline.goTo(1);
    });
    expect(titleSlide.hasAttribute('inert')).toBe(true);
    const eventHost = container.querySelector('.tl-slide:not(.tl-slide-titleslide) .h5p-tl-slide-description');
    expect(eventHost?.innerHTML).toContain('<strong>description</strong>');
    act(() => {
      mockTimeline.goTo(0);
    });
    expect(titleSlide.hasAttribute('inert')).toBe(false);
    expect(container.querySelector('.tl-slide-titleslide .h5p-tl-slide-description')).toBe(titleHost);
    expect(Runtime).not.toHaveBeenCalled();
    expect(resizeListeners.size).toBe(listenersBeforeNavigation);
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    expect(resizeListeners.size).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('starts on the first event when the title is disabled', async () => {
    await renderTimeline(false);
    const slide = container.querySelector('.tl-slide') as HTMLElement;
    expect(slide.hasAttribute('inert')).toBe(false);
    expect(mockTimeline.current_id).toBe(slide.id);
    expect(slide.querySelector('.h5p-tl-slide-description')?.textContent).toContain('Ordinary description');
    flushFrames();
    expect(Runtime).not.toHaveBeenCalled();
  });
});
