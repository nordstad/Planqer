import { describe, expect, it } from 'vitest';
import { translateWallpaperMessage } from './wallpaperMessages';

const translate = (key, variables) => `${key}:${JSON.stringify(variables || {})}`;

describe('translateWallpaperMessage', () => {
  it('translates backend messages and preserves their values', () => {
    expect(translateWallpaperMessage("Strip 3 is 42 mm on wall 'Kitchen', below the 50 mm minimum", translate))
      .toBe('wallpaperUi.backendStripBelowMinimum:{"strip":"3","mm":"42","wall":"Kitchen","min":"50"}');
  });

  it('leaves unknown messages intact', () => {
    expect(translateWallpaperMessage('Unexpected error', translate)).toBe('Unexpected error');
  });
});
