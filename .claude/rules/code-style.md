# Code style

## Project specifics
- Formatter: none. Match the surrounding code: 2 spaces, single quotes, semicolons, lines up to about 120 characters.
- Linter: none. `npm test` is the check.
- Naming: camelCase for functions and variables, UPPER_CASE for constants, kebab-case file names (`family-data.js`); CSS classes in kebab-case and unique across all CSS files (a shared name broke the markets page once)
- Imports: relative ES module imports with the `.js` ending; the Firebase SDK only through `public/js/firebase.js`

## Always
- Match the style of the surrounding code over general preferences.
- Prefer small functions, early returns and descriptive names.
- Comments explain *why*, not *what*. No commented-out code.
- Remove unused imports, variables and dead code you create.
- Handle errors explicitly; never swallow them silently.
- Don't add a dependency to save a few lines. Ask first.
