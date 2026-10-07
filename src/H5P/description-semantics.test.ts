import semantics from '../../semantics.json';
import library from '../../library.json';
import french from '../../language/fr.json';

const titleFields = semantics.find((field) => field.name === 'titleSlide')!.fields!;
const eventFields = semantics.find((field) => field.name === 'timelineItems')!.field!.fields!;

describe('ordinary description editor semantics', () => {
  it.each([['title', titleFields], ['event', eventFields]] as const)(
    'uses a required HTML text field with no library selector for %s', (_label, fields) => {
      const description: any = fields.find((field) => field.name === 'description');
      expect(description.type).toBe('text');
      expect(description.optional).not.toBe(true);
      expect(description.options).toBeUndefined();
      expect(description.widget === 'html' || description.showWhen?.widget === 'html').toBe(true);
      expect(description.enterMode).toBe('p');
      expect(description.tags).toEqual(expect.arrayContaining(['strong', 'em', 'a', 'table', 'span']));
      expect(description.font).toEqual({ size: true, color: true, background: true, family: true });
    },
  );

  it('preserves the event description mode and uses the ordinary editor inside ShowWhen', () => {
    const description: any = eventFields.find((field) => field.name === 'description');
    expect(description.label).toBe('Description text');
    expect(description.showWhen).toEqual({
      rules: [{ field: 'TextOrImage', equals: 'text' }], widget: 'html',
    });
    const mode: any = eventFields.find((field) => field.name === 'TextOrImage');
    expect(mode.options.map((option: any) => option.value)).toEqual(['text', 'image', 'none']);
    expect(mode.default).toBe('text');
    expect(eventFields.find((field) => field.name === 'descriptionImage')!.type).toBe('image');
  });

  it('keeps the active French translation aligned without introducing content choices', () => {
    const titleIndex = semantics.findIndex((field) => field.name === 'titleSlide');
    const eventIndex = semantics.findIndex((field) => field.name === 'timelineItems');
    expect(french.semantics[titleIndex].fields).toHaveLength(titleFields.length);
    expect(french.semantics[eventIndex].field!.fields).toHaveLength(eventFields.length);
    const descriptionIndex = eventFields.findIndex((field) => field.name === 'description');
    const translated: any = french.semantics[eventIndex].field!.fields![descriptionIndex];
    expect(translated.label).toBeTruthy();
    expect(translated.options).toBeUndefined();
  });

  it('has no description child-library dependencies and uses the 1.2.0 schema version', () => {
    expect(JSON.stringify(semantics)).not.toContain('H5P.AdvancedText');
    expect(library.editorDependencies.map((dependency) => dependency.machineName))
      .not.toEqual(expect.arrayContaining(['H5P.AdvancedText', 'H5P.AdvancedTextPapiJo']));
    expect(library.preloadedDependencies.map((dependency) => dependency.machineName)).toEqual(['H5P.Video']);
    expect(library.machineName).toBe('H5P.NDLATimelinePapiJo');
    expect([library.majorVersion, library.minorVersion, library.patchVersion]).toEqual([1, 2, 0]);
  });
});
