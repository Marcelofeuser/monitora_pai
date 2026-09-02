// Espelha exatamente a lista permitida no backend
// (artifacts/api-server/src/lib/stickers.ts) — o servidor é quem valida
// de verdade, mas o picker só mostra o que é aceito, pra nunca dar erro
// depois de escolher.
export const ALLOWED_STICKERS = [
  '❤️', '😂', '😍', '😢', '😮', '😡', '👍', '👎',
  '👏', '🙌', '🎉', '🔥', '⭐', '🌈', '☀️', '💤',
  '🐶', '🐱', '🐰', '🦄', '🍕', '🍦', '⚽', '🎮',
];
