# Contributing to New Tab

Thank you for your interest in contributing to the New Tab project!

## 👥 Contributing

Project is still in developing stage. Contributions are highly welcome!

## 🌐 Adding a New Language

The extension supports multiple interface languages. To add a new one:

1. **Add translation entries** in `src/core/languages.js`:
   - Add a new language object inside the `translations` object with all keys from English
   - Add a native-name key to the `en` object (e.g., `swahili: "Swahili"`)
   - Add an entry to the `SUPPORTED_LANGUAGES` array with the language code, flag emoji, native name, and name key

2. **Add Chrome i18n locale** in `_locales/<code>/messages.json`:
   - Create a new folder under `_locales/` named with the locale code
   - Add `name` and `description` fields (used by Chrome Web Store)

3. **Missing keys** fall back to English automatically — no need to translate every string

4. Run tests to verify: `npm test`

## 📄 License

This project is licensed under the [MIT License](../LICENSE).
