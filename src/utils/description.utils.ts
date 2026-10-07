import { H5PLibraryText } from '../types/H5PLibraryText';

/** Read pre-upgrade content without loading or instantiating a child library. */
export const getDescriptionText = (description?: string | H5PLibraryText): string =>
  typeof description === 'string' ? description : description?.params?.text ?? '';
