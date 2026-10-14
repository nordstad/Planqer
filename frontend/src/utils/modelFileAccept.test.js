import { MODEL_ACCEPT, modelFileAccept } from './modelFileAccept';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
const MAC = IPAD_AS_MAC;
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';

it('filters the picker to model files on computers', () => {
  expect(modelFileAccept({ userAgent: WINDOWS, platform: 'Win32', maxTouchPoints: 0 })).toBe('.stl,.step,.stp');
  expect(modelFileAccept({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(MODEL_ACCEPT);
});

it('sets no filter on an iPhone, where iOS greys out every file for types it does not know', () => {
  expect(modelFileAccept({ userAgent: IPHONE, platform: 'iPhone', maxTouchPoints: 5 })).toBeUndefined();
});

it('sets no filter on an iPad that reports itself as a Mac', () => {
  expect(modelFileAccept({ userAgent: IPAD_AS_MAC, platform: 'MacIntel', maxTouchPoints: 5 })).toBeUndefined();
});
