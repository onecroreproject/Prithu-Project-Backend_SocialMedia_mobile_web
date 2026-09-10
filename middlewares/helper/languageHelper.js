// helpers/languageHelper.js

// Define your supported languages
const LANGUAGE_MAP = {
  en: "English",
  ta: "Tamil",
  hi: "Hindi",
  te: "Telugu",
  ml: "Malayalam",
  // Add more as needed
};

// Build reverse map for quick lookup (name → code)
const NAME_TO_CODE_MAP = Object.fromEntries(
  Object.entries(LANGUAGE_MAP).map(([code, name]) => [name, code])
);

/**
 * Format input: first letter capital, rest lowercase
 * @param {string} str
 * @returns {string}
 */
function formatInput(str) {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Get language code from input
 * - Accepts either code ("en") or name ("English")
 * - Normalizes input
 * @param {string} input
 * @returns {string|null} - Language code or null if not found
 */
function getLanguageCode(input) {
  if (!input) return null;

  // If input looks like a code
  if (LANGUAGE_MAP[input.toLowerCase()]) {
    return input.toLowerCase();
  }

  // Otherwise, treat as name
  const formattedName = formatInput(input);
  return NAME_TO_CODE_MAP[formattedName] || null;
}

/**
 * Get language name from code
 * - "en" → "English"
 * @param {string} code
 * @returns {string|null}
 */
function getLanguageName(code) {
  if (!code) return null;
  return LANGUAGE_MAP[code.toLowerCase()] || null;
}

module.exports = {
  LANGUAGE_MAP,
  getLanguageCode,
  getLanguageName,
};
