import { EventItemType } from '../types/EventItemType';
import { H5PLibraryText } from '../types/H5PLibraryText';
import { getDescriptionText } from './description.utils';
import { createTimelineDefinition, mapEventToTimelineSlide } from './timeline.utils';

const html = '<p>Ordinary <strong>description</strong> <a href="https://example.com/">link</a></p>' +
  '<figure class="table"><table><tbody><tr><td>Cell</td></tr></tbody></table></figure>';
const makeEvent = (description?: string | H5PLibraryText): EventItemType<'regular'> => ({
  id: 'event', slideType: 'regular', title: 'Event', startDate: '2000',
  layout: 'right', mediaType: 'none', appearance: { backgroundType: 'none' },
  TextOrImage: 'text', description,
});

describe('ordinary Timeline descriptions', () => {
  beforeEach(() => {
    (window as any).H5P = { createUUID: jest.fn(() => 'slide-id') };
  });

  describe.each([
    ['regular', 'right'], ['regular', 'left'], ['regular', 'custom'],
    ['title', 'right'], ['title', 'left'], ['title', 'custom'],
  ] as const)('%s slide, %s layout', (slideType, layout) => {
    it.each([
      ['direct text', html],
      ['legacy Text', { library: 'H5P.AdvancedText 1.1', params: { text: html } }],
      ['legacy PapiJo', { library: 'H5P.AdvancedTextPapiJo 1.2', params: { text: html } }],
    ])('renders %s through the same ordinary HTML path', (_label, description) => {
      const event = {
        ...makeEvent(description), layout,
        eventContent: { items: [{
          id: 'text', type: 'textContent' as const, x: 0, y: 0, width: 100, height: 100,
        }] },
      };
      const original = JSON.stringify(event);
      const [definition] = createTimelineDefinition('Timeline', {
        showTitleSlide: slideType === 'title',
        titleSlide: { ...event, slideType: 'title' },
        timelineItems: slideType === 'regular' ? [event] : [],
      });
      if (typeof definition === 'string') {
        throw new Error('Expected an object definition');
      }
      const slide = slideType === 'title' ? definition.title : definition.events[0];
      const container = document.createElement('div');
      container.innerHTML = slide?.text?.text ?? '';
      expect(container.innerHTML).toContain(html);
      expect(container.querySelector('.h5p-advanced-text')).toBeNull();
      expect(container.querySelector(layout === 'custom' ? '.textContent' : '.h5p-tl-slide-description'))
        .not.toBeNull();
      expect(JSON.stringify(event)).toBe(original);
    });

    it('renders migrated raw PapiJo text without formatting, tooltips, or object stringification', () => {
      const event = {
        ...makeEvent('Hello world. word'), layout,
        eventContent: { items: [{
          id: 'text', type: 'textContent' as const, x: 0, y: 0, width: 100, height: 100,
        }] },
      };
      const [definition] = createTimelineDefinition('Timeline', {
        showTitleSlide: slideType === 'title', titleSlide: { ...event, slideType: 'title' },
        timelineItems: slideType === 'regular' ? [event] : [],
      });
      if (typeof definition === 'string') {
        throw new Error('Expected an object definition');
      }
      const slide = slideType === 'title' ? definition.title : definition.events[0];
      const container = document.createElement('div');
      container.innerHTML = slide?.text?.text ?? '';
      const description = container.querySelector(layout === 'custom' ? '.textContent' : '.h5p-tl-slide-description');
      expect(description?.textContent?.trim()).toBe('Hello world. word');
      expect(description?.querySelector('strong, em, a, .papijo-tooltip, [data-papijo-tooltip]')).toBeNull();
      expect(container.innerHTML).not.toContain('[object Object]');
    });
  });

  it.each([undefined, '', { library: 'H5P.AdvancedText 1.1', params: {} }])(
    'accepts an empty description: %s', (description) => {
      expect(getDescriptionText(description)).toBe('');
      expect(() => mapEventToTimelineSlide(makeEvent(description))).not.toThrow();
    },
  );

  it('leaves legacy annotations and managed image data in the original object during runtime reads', () => {
    const description = {
      library: 'H5P.AdvancedTextPapiJo 1.2',
      params: {
        text: '<p><span class="papijo-tooltip" data-papijo-tooltip="Help">Term</span></p>',
        tooltipImages: [{ id: 'image-1', image: { path: 'images/tip.png' }, alt: 'Diagram' }],
      },
    };
    const original = JSON.stringify(description);
    const slide = mapEventToTimelineSlide(makeEvent(description));
    expect(slide.text?.text).toContain(description.params.text);
    expect(slide.text?.text).not.toContain('h5p-advanced-text');
    expect(JSON.stringify(description)).toBe(original);
  });

  it('keeps image description and caption rendering', () => {
    const slide = mapEventToTimelineSlide({
      ...makeEvent(html), TextOrImage: 'image',
      descriptionImage: { path: 'images/description.png' }, descriptionImageAlt: 'Caption',
    });
    expect(slide.text?.text).toContain('src="images/description.png"');
    expect(slide.text?.text).toContain('class="tl-caption">Caption');
    expect(slide.text?.text).not.toContain(html);
  });

  it('keeps None mode hidden and ordinary media intact', () => {
    const slide = mapEventToTimelineSlide({
      ...makeEvent(html), TextOrImage: 'none', mediaType: 'custom',
      customMedia: 'https://example.com/media', info: { credit: 'Credit', caption: 'Caption' },
    });
    expect(slide.text?.text).toBe('');
    expect(slide.media).toMatchObject({
      url: 'https://example.com/media', credit: 'Credit', caption: 'Caption',
    });
  });
});
