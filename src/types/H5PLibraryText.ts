type H5PMetadataAuthor = {
  name: string,
  role: 'Author' | 'Editor' | 'Licensee' | 'Originator',
}

type H5PMetadataChange = {
  date: string,
  author: string,
  log: string
}

type H5PMetadata = {
  title?: string;
  a11yTitle?: string,
  license?: string,
  licenseVersion?: string,
  yearFrom?: string,
  yearTo?: string,
  source?: string,
  authors?: Array<H5PMetadataAuthor>,
  licenseExtras?: string,
  changes?: Array<H5PMetadataChange>,
  authorComments?: string,
  defaultLanguage?: string,
  contentType?: string
}

export type H5PLibraryTextParams = {
  text?: string;
  // Legacy fields are retained in incoming data, but have no special runtime.
  [key: string]: unknown;
}

type H5PLibraryParams = {
  library?: string,
  params: H5PLibraryTextParams,
  metadata?: H5PMetadata,
  subContentId?: string
}

export type H5PLibraryText = H5PLibraryParams;
