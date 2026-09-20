# Localization

Planqer supports English, Swedish, and Norwegian Bokmal. The locale codes are
`en-GB`, `sv-SE`, and `nb-NO`.

## Decisions

- First-time visitors use a supported browser language when available, with
  English as the fallback.
- Explicit browser choices are stored in `localStorage`.
- Signed-in users also store the choice in `user_settings.preferred_language`.
- The navigation selector changes language immediately.
- The Defaults selector applies its staged choice when settings are saved.
- Language names are shown in their native form: English, Svenska, Norsk
  bokmal.
- Number and date formatting follows the selected locale. Measurements remain
  in millimetres.
- Existing saved SVG diagrams keep the language used when they were generated.
- New diagrams and print/export content use the active language.

## Translation Structure

Frontend translations live in `frontend/src/i18n/locales/`. The current
catalogs use one bundled resource per supported locale. Components should use
`useTranslation()` for UI copy, and non-React utilities should receive the
active locale or translated labels explicitly.

Frontend-owned validation should eventually return translation keys and
parameters. Backend errors and generated presentation labels should use stable
codes instead of English prose so the frontend can translate them.

## Coverage

The current implementation localizes the complete frontend UI, including the
homepage, Help, authentication, settings, all optimizer workflows, validation
and API error messages, result diagrams, print/export labels, saved projects,
project management, and admin screens. Technical values such as measurement
units, file extensions, stock codes, currency codes, paper formats, and
algorithm identifiers remain unchanged.

## Testing

- `frontend/src/i18n/languages.test.jsx` verifies locale normalization and
  browser-language detection.
- `backend/tests/test_settings.py` verifies preferred-language persistence and
  rejection of unsupported language codes.
- The frontend Jest suite covers the localized component behavior and runs with
  `npm test -- --runInBand`.
