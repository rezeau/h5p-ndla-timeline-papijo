/* TimelineJS uses dangling underscore */
/* eslint-disable no-underscore-dangle */
import { Timeline, TimelineDefinition } from '@knight-lab/timelinejs';
import { H5P } from 'h5p-utils';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { H5PContext } from '../../contexts/H5PContext';
import { DescriptionTooltipRuntimeConstructor } from '../../H5P/TimelineDescriptionTooltipController';
import { Params } from '../../types/Params';
import { TimeLine } from './TimeLine';

jest.mock('./TimeLine.scss', () => ({}));
jest.mock('h5p-utils', () => ({ H5P: { createUUID: jest.fn(), getPath: jest.fn() } }));
jest.mock('../../contexts/H5PContext', () => ({
  H5PContext: jest.requireActual('react').createContext(undefined),
}));
jest.mock('@knight-lab/timelinejs', () => ({ Timeline: jest.fn() }));

const createEvents = () => {
  const listeners = new Map<string, Set<() => void>>();
  return {
    current_id: '',
    on: jest.fn((type: string, callback: () => void) => {
      if (!listeners.has(type)) {
        listeners.set(type, new Set());
      }
      listeners.get(type)?.add(callback);
    }),
    off: jest.fn((type: string, callback: () => void) => listeners.get(type)?.delete(callback)),
    trigger: jest.fn((type: string) => listeners.get(type)?.forEach((callback) => callback())),
    count: (type: string) => listeners.get(type)?.size ?? 0,
  };
};

describe('TimeLine tooltip effect integration', () => {
  let container: HTMLDivElement;
  let timeline: ReturnType<typeof createEvents>;
  let h5p: ReturnType<typeof createEvents>;
  let Runtime: jest.Mock;
  let runtime: { initialize: jest.Mock; close: jest.Mock; reposition: jest.Mock; destroy: jest.Mock };
  let resizeCallback: () => void;
  let frames: Map<number, FrameRequestCallback>;
  let disconnect: jest.Mock;
  let layoutCallback: ResizeObserverCallback;
  const originalResizeObserver = window.ResizeObserver;
  const optionalH5P = H5P as typeof H5P & {
    AdvancedTextPapiJoTooltipRuntime?: DescriptionTooltipRuntimeConstructor;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    timeline = createEvents();
    h5p = createEvents();
    frames = new Map();
    let nextFrame = 0;
    let nextUuid = 0;
    H5P.createUUID = jest.fn(() => `uuid-${++nextUuid}`);
    (window as any).H5P = H5P;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      nextFrame += 1;
      frames.set(nextFrame, callback);
      return nextFrame;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    disconnect = jest.fn();
    window.ResizeObserver = jest.fn((callback: ResizeObserverCallback) => {
      layoutCallback = callback;
      return { observe: jest.fn(), unobserve: jest.fn(), disconnect };
    });
    (Timeline as jest.Mock).mockImplementation((id: string, definition: TimelineDefinition) => {
      if (typeof definition === 'string') {
        throw new Error('Expected object definition');
      }
      const slide = definition.events[0];
      timeline.current_id = slide.unique_id ?? '';
      const root = document.getElementById(id) as HTMLElement;
      root.innerHTML = `<div class="tl-timeline"><div class="tl-menubar" style="top: 0px"></div>
        <div class="tl-storyslider"><div class="tl-text">${slide.text?.text}</div></div></div>`;
      return { ...timeline, _storyslider: { _slides: [] } };
    });
    runtime = { initialize: jest.fn(() => 1), close: jest.fn(), reposition: jest.fn(), destroy: jest.fn() };
    Runtime = jest.fn((host: HTMLElement, _id, _images, onResize: () => void) => {
      resizeCallback = onResize;
      runtime.initialize.mockImplementation(() => {
        expect(host.querySelector('a.tl-makelink')).toBeNull();
        host.querySelector('span')?.setAttribute('aria-expanded', 'false');
        return 1;
      });
      return runtime;
    });
    optionalH5P.AdvancedTextPapiJoTooltipRuntime = Runtime;
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
    delete optionalH5P.AdvancedTextPapiJoTooltipRuntime;
    window.ResizeObserver = originalResizeObserver;
    jest.restoreAllMocks();
  });

  const renderTimeline = (library = 'H5P.AdvancedTextPapiJo 1.2') => {
    const params: Params = {
      showTitleSlide: false,
      behaviour: { scalingMode: 'human', initialZoom: '0', timenavPosition: '2', startatslide: '1' },
      timelineItems: [{
        id: 'event', slideType: 'regular', title: 'Event', startDate: '2000',
        layout: 'right', mediaType: 'none', appearance: { backgroundType: 'none' },
        description: { library, params: {
          text: '<p><span class="papijo-tooltip" data-papijo-tooltip="Help">Term</span> <a class="tl-makelink" href="https://example.com/">example.com</a></p>',
        } },
      }],
    };
    act(() => {
      ReactDOM.render(
        <H5PContext.Provider value={h5p as any}>
          <TimeLine data={params} timelineTitle="Timeline" contentId="parent-42" onMediaInstanceBuilt={jest.fn()} />
        </H5PContext.Provider>,
        container,
      );
    });
  };

  it('initializes after loaded and link repair, coalesces resize, and cleans up on React unmount', () => {
    renderTimeline();
    expect(Runtime).not.toHaveBeenCalled();
    act(() => {
      timeline.trigger('loaded');
    });
    expect(Runtime).toHaveBeenCalledTimes(1);
    expect(Runtime.mock.calls[0][1]).toBe('parent-42');
    expect(container.querySelector('span')?.getAttribute('aria-expanded')).toBe('false');
    expect(container.textContent).toContain('https://example.com/');
    const listenerCount = h5p.count('resize');
    act(() => {
      timeline.trigger('loaded'); timeline.trigger('loaded');
    });
    expect(Runtime).toHaveBeenCalledTimes(1);
    expect(h5p.count('resize')).toBe(listenerCount);
    act(() => {
      const initialFrames = Array.from(frames.values());
      frames.clear();
      initialFrames.forEach((callback) => callback(0));
    });
    h5p.trigger.mockClear();
    resizeCallback();
    resizeCallback();
    resizeCallback();
    act(() => {
      const pendingFrames = Array.from(frames.values());
      frames.clear();
      pendingFrames.forEach((callback) => callback(0));
    });
    expect(h5p.trigger).toHaveBeenCalledTimes(1);
    const repositionCount = runtime.reposition.mock.calls.length;
    act(() => {
      layoutCallback([], {} as ResizeObserver);
    });
    expect(runtime.reposition.mock.calls.length).toBeGreaterThan(repositionCount);
    resizeCallback();
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    expect(runtime.destroy).toHaveBeenCalledTimes(1);
    expect(timeline.count('loaded')).toBe(0);
    expect(timeline.count('change')).toBe(0);
    expect(h5p.count('resize')).toBe(0);
    expect(frames.size).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('keeps Timeline usable when the optional runtime is absent', () => {
    delete optionalH5P.AdvancedTextPapiJoTooltipRuntime;
    renderTimeline();
    expect(() => act(() => {
      timeline.trigger('loaded');
    })).not.toThrow();
    expect(container.querySelector('span')?.textContent).toBe('Term');
    expect(container.textContent).toContain('https://example.com/');
    expect(Runtime).not.toHaveBeenCalled();
    act(() => {
      h5p.trigger('resize'); timeline.trigger('change');
    });
    expect(container.querySelector('span')?.textContent).toBe('Term');
  });
});
