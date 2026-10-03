import * as React from 'react';
import { FC } from 'react';
import styles from './TextContentBlock.module.scss';

type TextContentBlockProps = {
  textContent: string;
  isAdvancedTextPapiJo?: boolean;
};

export const TextContentBlock: FC<TextContentBlockProps> = ({
  textContent,
  isAdvancedTextPapiJo = false,
}) => {
  return (
    <div
      className={styles.textContent + (isAdvancedTextPapiJo ? ' h5p-advanced-text' : '')}
      dangerouslySetInnerHTML={{ __html: textContent }}
    />
  );
};
