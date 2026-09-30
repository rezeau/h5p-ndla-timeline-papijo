import { TimelineDescriptionRuntimeAdapter } from '../H5P/TimelineDescriptionRuntimeAdapter';
import { EventItemType } from '../types/EventItemType';
import { H5PLibraryText } from '../types/H5PLibraryText';
import { Params } from '../types/Params';
import {
  createTimelineDefinition,
  mapEventToTimelineSlide,
} from './timeline.utils';

const makeDescription = (
  library: string,
  params: H5PLibraryText['params'],
): H5PLibraryText => ({
  library,
  params,
  subContentId: `${library}-subcontent`,
  metadata: { title: `${library} description` },
});

const makeEvent = (
  id: string,
  description: H5PLibraryText,
  layout: 'right' | 'left' = 'right',
): EventItemType<'regular'> => ({
  id,
  slideType: 'regular',
  title: `Event ${id}`,
  startDate: '2000',
  layout,
  mediaType: 'none',
  appearance: { backgroundType: 'none' },
  TextOrImage: 'text',
  description,
});

const getSlideText = (slide: ReturnType<typeof mapEventToTimelineSlide>): string =>
  (slide.text as { text: string }).text;

describe('Timeline description runtime architecture', () => {
  let nextUuid: number;

  beforeEach(() => {
    nextUuid = 0;
    (window as any).H5P = {
      createUUID: jest.fn(() => `slide-${++nextUuid}`),
    };
  });

  it('keeps AdvancedText 1.1 HTML unchanged and on the ordinary route', () => {
    const html = '<p>Ordinary <strong>AdvancedText</strong></p>';
    const original = makeDescription('H5P.AdvancedText 1.1', { text: html });
    const adapter = new TimelineDescriptionRuntimeAdapter();

    const slide = mapEventToTimelineSlide(makeEvent('ordinary', original), adapter);
    const entry = adapter.get(slide.unique_id as string);

    expect(getSlideText(slide)).toContain(html);
    expect(entry?.route).toBe('advanced-text');
    expect(entry?.description).toBe(original);
  });

  it('retains a PapiJo description without tooltips and its unchanged HTML', () => {
    const html = '<p>PapiJo without tooltips</p>';
    const original = makeDescription('H5P.AdvancedTextPapiJo 1.2', { text: html });
    const adapter = new TimelineDescriptionRuntimeAdapter();

    const slide = mapEventToTimelineSlide(makeEvent('papijo', original), adapter);
    const entry = adapter.get(slide.unique_id as string);

    expect(getSlideText(slide)).toContain(html);
    expect(entry?.description).toBe(original);
    expect(entry?.route).toBe('advanced-text-papijo');
  });

  it('retains text-only tooltip markup in the complete description', () => {
    const html = '<p><span class="papijo-tooltip" data-papijo-tooltip="Help">Term</span></p>';
    const original = makeDescription('H5P.AdvancedTextPapiJo 1.2', { text: html });
    const adapter = new TimelineDescriptionRuntimeAdapter();

    const slide = mapEventToTimelineSlide(makeEvent('text-tooltip', original), adapter);
    const entry = adapter.get(slide.unique_id as string);

    expect(getSlideText(slide)).toContain(html);
    expect(entry?.description).toBe(original);
    expect(entry?.description.params.text).toBe(html);
  });

  it('retains managed tooltip image data without resolving its path', () => {
    const original = makeDescription('H5P.AdvancedTextPapiJo 1.2', {
      text: '<p><span class="papijo-tooltip" data-papijo-tooltip-id="image-1">Term</span></p>',
      tooltipImages: [{
        id: 'image-1',
        image: { path: 'images/tooltip.png' },
        alt: 'A useful diagram',
      }],
    });
    const adapter = new TimelineDescriptionRuntimeAdapter();

    const slide = mapEventToTimelineSlide(makeEvent('image-tooltip', original), adapter);
    const retained = adapter.get(slide.unique_id as string)?.description;

    expect(retained).toBe(original);
    expect(retained?.params.tooltipImages?.[0]).toEqual({
      id: 'image-1',
      image: { path: 'images/tooltip.png' },
      alt: 'A useful diagram',
    });
    expect(retained?.params.tooltipImages?.[0].image.path)
      .toBe('images/tooltip.png');
  });

  it('maps unique stable hosts for title, right-layout, and left-layout descriptions', () => {
    const titleDescription = makeDescription(
      'H5P.AdvancedText 1.1',
      { text: '<p>Title description</p>' },
    );
    const ordinaryDescription = makeDescription(
      'H5P.AdvancedTextPapiJo 1.2',
      { text: '<p>Ordinary description</p>' },
    );
    const leftDescription = makeDescription(
      'H5P.AdvancedTextPapiJo 1.2',
      { text: '<p>Left description</p>' },
    );
    const params: Params = {
      showTitleSlide: true,
      titleSlide: {
        id: 'title',
        slideType: 'title',
        title: 'Title',
        layout: 'right',
        mediaType: 'none',
        appearance: { backgroundType: 'none' },
        description: titleDescription,
      },
      timelineItems: [
        makeEvent('ordinary', ordinaryDescription),
        makeEvent('left', leftDescription, 'left'),
      ],
    };

    const [timeline, , adapter] = createTimelineDefinition('Timeline', params);
    if (typeof timeline === 'string') {
      throw new Error('Expected an object Timeline definition.');
    }
    const entries = adapter.getAll();
    const slides = [timeline.title, ...timeline.events];

    expect(entries).toHaveLength(3);
    expect(new Set(entries.map((entry) => entry.hostId)).size).toBe(3);
    entries.forEach((entry) => {
      const slide = slides.find((candidate) => candidate?.unique_id === entry.slideId);
      expect(slide).toBeDefined();
      expect((slide?.text as { text: string }).text)
        .toContain(`id="${entry.hostId}"`);
      expect(entry.hostId).toBe(`${entry.slideId}_description`);
      expect(adapter.get(entry.slideId)).toBe(entry);
    });
    expect(entries.map((entry) => entry.description)).toEqual(
      expect.arrayContaining([
        titleDescription,
        ordinaryDescription,
        leftDescription,
      ]),
    );
    expect(entries.find((entry) => entry.description === titleDescription)?.route)
      .toBe('advanced-text');
    [ordinaryDescription, leftDescription].forEach((description) => {
      expect(entries.find((entry) => entry.description === description)?.route)
        .toBe('advanced-text-papijo');
    });
  });
});
