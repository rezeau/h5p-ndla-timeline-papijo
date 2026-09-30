import { H5PLibraryText } from '../types/H5PLibraryText';
import {
  createTimelineDescriptionHostId,
  getTimelineDescriptionRoute,
  TimelineDescriptionRuntimeAdapter,
} from './TimelineDescriptionRuntimeAdapter';

const description = (library?: string): H5PLibraryText => ({
  library,
  params: { text: '<p>Text</p>' },
});

describe('TimelineDescriptionRuntimeAdapter', () => {
  it('routes only AdvancedText 1.1 to the ordinary AdvancedText path', () => {
    expect(getTimelineDescriptionRoute(description('H5P.AdvancedText 1.1')))
      .toBe('advanced-text');
    expect(getTimelineDescriptionRoute(description('H5P.AdvancedText 1.1.9')))
      .toBe('advanced-text');
  });

  it('routes only AdvancedTextPapiJo 1.2 to the PapiJo path', () => {
    expect(
      getTimelineDescriptionRoute(description('H5P.AdvancedTextPapiJo 1.2')),
    ).toBe('advanced-text-papijo');
    expect(
      getTimelineDescriptionRoute(description('H5P.AdvancedTextPapiJo 1.2.4')),
    ).toBe('advanced-text-papijo');
  });

  it.each([
    undefined,
    'H5P.AdvancedText 1.2',
    'H5P.AdvancedTextPapiJo 1.1',
    'H5P.AdvancedTextPapiJoExtra 1.2',
    'H5P.OtherLibrary 1.0',
  ])('fails safely for unsupported library %s', (library) => {
    expect(getTimelineDescriptionRoute(description(library))).toBe('unsupported');
  });

  it('retains the complete original description object by reference', () => {
    const adapter = new TimelineDescriptionRuntimeAdapter();
    const original: H5PLibraryText = {
      library: 'H5P.AdvancedTextPapiJo 1.2',
      params: {
        text: '<span class="papijo-tooltip">Term</span>',
        tooltipImages: [{
          id: 'image-1',
          image: { path: 'images/tooltip.png' },
          alt: 'Tooltip image',
        }],
        futureParameter: { retained: true },
      },
      subContentId: 'subcontent-1',
      metadata: { title: 'Description' },
    };

    const entry = adapter.register('slide-1', 'host-1', original);

    expect(entry.description).toBe(original);
    expect(entry.description.params.tooltipImages).toEqual([
      {
        id: 'image-1',
        image: { path: 'images/tooltip.png' },
        alt: 'Tooltip image',
      },
    ]);
    expect(entry.description.params.futureParameter).toEqual({ retained: true });
    expect(entry.route).toBe('advanced-text-papijo');
  });

  it('creates deterministic host IDs and rejects duplicate slide registrations', () => {
    const adapter = new TimelineDescriptionRuntimeAdapter();
    const hostId = createTimelineDescriptionHostId('slide-1');

    expect(hostId).toBe('slide-1_description');
    adapter.register('slide-1', hostId, description('H5P.AdvancedText 1.1'));
    expect(() => adapter.register(
      'slide-1',
      hostId,
      description('H5P.AdvancedText 1.1'),
    )).toThrow('already registered');
  });
});
