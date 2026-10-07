/* TimelineJS uses dangling underscore */
/* eslint-disable no-underscore-dangle */
import { Timeline, TimelineDefinition } from '@knight-lab/timelinejs';
import { H5P } from 'h5p-utils';
import * as React from 'react';
import * as ReactDOM from 'react-dom';
import { act } from 'react-dom/test-utils';
import { H5PContext } from '../../contexts/H5PContext';
import { Params } from '../../types/Params';
import { TimeLine } from './TimeLine';

jest.mock('./TimeLine.scss', () => ({}));
jest.mock('h5p-utils', () => ({ H5P: {} }));
jest.mock('../../contexts/H5PContext', () => ({
  H5PContext: jest.requireActual('react').createContext(undefined),
}));
jest.mock('@knight-lab/timelinejs', () => ({ Timeline: jest.fn() }));

const createEvents = () => {
  const listeners = new Map<string, Set<() => void>>();
  return {
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

describe('description rendering and ordinary Timeline lifecycle', () => {
  let container: HTMLDivElement;
  let timeline: ReturnType<typeof createEvents>;
  let h5p: ReturnType<typeof createEvents>;
  let frames: Map<number, FrameRequestCallback>;
  let disconnect: jest.Mock;
  const originalResizeObserver = window.ResizeObserver;
  const html = '<p>Ordinary <strong>text</strong> ' +
    '<a class="tl-makelink" href="https://example.com/">example.com</a></p>';

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    timeline = createEvents(); h5p = createEvents(); frames = new Map();
    let nextFrame = 0;
    let nextUuid = 0;
    H5P.createUUID = jest.fn(() => `uuid-${++nextUuid}`);
    (window as any).H5P = H5P;
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextFrame, callback); return nextFrame;
    });
    jest.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    disconnect = jest.fn();
    window.ResizeObserver = jest.fn(() => ({ observe: jest.fn(), unobserve: jest.fn(), disconnect }));
    (Timeline as jest.Mock).mockImplementation((id: string, definition: TimelineDefinition) => {
      if (typeof definition === 'string') {
        throw new Error('Expected object definition');
      }
      document.getElementById(id)!.innerHTML = '<div class="tl-timeline">' +
        '<div class="tl-menubar" style="top: 0px"></div><div class="tl-storyslider">' +
        `<div class="tl-text">${definition.events[0].text?.text}</div></div></div>`;
      return { ...timeline, _storyslider: { _slides: [] } };
    });
  });

  afterEach(() => {
    act(() => {
      ReactDOM.unmountComponentAtNode(container);
    });
    container.remove();
    window.ResizeObserver = originalResizeObserver;
    jest.restoreAllMocks();
  });

  it.each([undefined, 'H5P.AdvancedText 1.1', 'H5P.AdvancedTextPapiJo 1.2'])(
    'preserves link repair, scroll accessibility, resize coalescing and cleanup for %s', (library) => {
      const params: Params = {
        showTitleSlide: false, behaviour: { scalingMode: 'human', startatslide: '1' },
        timelineItems: [{
          id: 'event', slideType: 'regular', title: 'Event', startDate: '2000',
          layout: 'right', mediaType: 'none', appearance: { backgroundType: 'none' },
          description: library ? { library, params: { text: html } } : html,
        }],
      };
      act(() => {
        ReactDOM.render(<H5PContext.Provider value={h5p as any}>
          <TimeLine data={params} timelineTitle="Timeline" contentId="42" onMediaInstanceBuilt={jest.fn()} />
        </H5PContext.Provider>, container);
      });
      act(() => {
        timeline.trigger('loaded');
      });
      expect(container.querySelector('a.tl-makelink')).toBeNull();
      expect(container.textContent).toContain('https://example.com/');
      expect(container.querySelector('.tl-text')?.getAttribute('tabindex')).toBe('0');
      expect(container.querySelector('.h5p-advanced-text')).toBeNull();
      expect(h5p.count('resize')).toBe(1);
      act(() => {
        timeline.trigger('loaded'); timeline.trigger('loaded');
      });
      expect(h5p.count('resize')).toBe(1);
      // Execute initialization frames before measuring subsequent resizes.
      // Clearing the queue alone would leave the component's frame flag set.
      for (let pass = 0; pass < 2; pass += 1) {
        act(() => {
          const pendingFrames = Array.from(frames.values());
          frames.clear();
          pendingFrames.forEach((callback) => callback(0));
        });
      }
      act(() => {
        h5p.trigger('resize'); h5p.trigger('resize'); h5p.trigger('resize');
      });
      expect(frames.size).toBe(1);
      act(() => {
        ReactDOM.unmountComponentAtNode(container);
      });
      expect(h5p.count('resize')).toBe(0);
      expect(timeline.count('loaded')).toBe(0);
      expect(timeline.count('change')).toBe(0);
      expect(frames.size).toBe(0);
      expect(disconnect).toHaveBeenCalledTimes(1);
    },
  );
});
