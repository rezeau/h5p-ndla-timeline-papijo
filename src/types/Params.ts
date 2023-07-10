import { TimelineData } from './TimelineData';
import { Translations } from './Translations';

export type Params = TimelineData & {
  behaviour?: {
    scalingMode: 'human' | 'cosmological' | 'index';
    initialZoom?: string | undefined;
    timenavPosition?: string | undefined;
    startatend?: boolean | undefined;
    startatslide?: string;
  };

  l10n?: Translations;
  language?: string;
};
