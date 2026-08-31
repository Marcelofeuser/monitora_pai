/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#15312F',
    tint: '#F36F5F',

    // Core surfaces
    background: '#F7F5F0',
    foreground: '#15312F',

    // Cards / elevated surfaces
    card: '#FFFEFB',
    cardForeground: '#15312F',

    // Primary action color (buttons, links, active states)
    primary: '#15312F',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E8EFEA',
    secondaryForeground: '#15312F',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#EDEAE3',
    mutedForeground: '#65736F',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#FBE2DC',
    accentForeground: '#A4453C',

    // Destructive actions (delete, error states)
    destructive: '#C9534C',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#E2E4DE',
    input: '#D8DDD5',

    success: '#2F8A62',
    successSoft: '#DDF3E6',
    warning: '#B06A2A',
    warningSoft: '#F9E8CF',
    navySoft: '#E4EFED',
    inkLight: '#49615C',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 8,
};

export default colors;
