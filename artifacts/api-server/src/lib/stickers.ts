// Figurinhas (item 1 do escopo WhatsApp): pra não depender de upload nem
// de arte própria nesta fase, uma figurinha é um emoji grande, sem balão
// de texto ao redor — visualmente diferente de um emoji digitado dentro
// de uma mensagem de texto. Guardamos como type "photo" com
// contentUrl="emoji:<caractere>" (ver routes/conversations.ts), então
// aqui só validamos que o emoji mandado está numa lista fechada — não dá
// pra mandar qualquer string arbitrária como "figurinha".
//
// Lista ampliada (categoria "Rostos e Emoções" — rostos, gatinhos, corações
// e símbolos de fala) a pedido do Marcelo, a partir de uma lista que ele
// mandou. Precisa continuar IDÊNTICA à cópia do frontend
// (controle-parental-pwa/src/lib/stickers.ts) — o servidor valida de
// verdade, o frontend só evita mostrar opção que o servidor recusaria.
export const ALLOWED_STICKERS = [
  "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "🙃",
  "🫠", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘", "😗", "☺️",
  "😚", "😙", "🥲", "😋", "😛", "😜", "🤪", "😝", "🤑", "🤗",
  "🤭", "🫢", "🫣", "🤫", "🤔", "🫡", "🤐", "🤨", "😐", "😑",
  "😶", "🫥", "😶‍🌫️", "😏", "😒", "🙄", "😬", "😮‍💨", "🤥", "🫨",
  "🙂‍↔️", "🙂‍↕️", "😌", "😔", "😪", "🤤", "😴", "🫩", "😷", "🤒",
  "🤕", "🤢", "🤮", "🤧", "🥵", "🥶", "🥴", "😵", "😵‍💫", "🤯",
  "🤠", "🥳", "🥸", "😎", "🤓", "🧐", "😕", "🫤", "😟", "🙁",
  "☹️", "😮", "😯", "😲", "😳", "🫪", "🥺", "🥹", "😦", "😧",
  "😨", "😰", "😥", "😢", "😭", "😱", "😖", "😣", "😞", "😓",
  "😩", "😫", "🥱", "😤", "😡", "😠", "🤬", "😈", "👿", "💀",
  "☠️", "💩", "🤡", "👹", "👺", "👻", "👽", "👾", "🤖", "😺",
  "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾", "🙈", "🙉",
  "🙊", "💌", "💘", "💝", "💖", "💗", "💓", "💞", "💕", "💟",
  "❣️", "💔", "❤️‍🔥", "❤️‍🩹", "❤️", "🩷", "🧡", "💛", "💚", "💙",
  "🩵", "💜", "🤎", "🖤", "🩶", "🤍", "💋", "💯", "💢", "🫯",
  "💥", "💫", "💦", "💨", "🕳️", "💬", "👁️‍🗨️", "🗨️", "🗯️", "💭",
  "💤",
];

export function isAllowedSticker(value: string): boolean {
  return ALLOWED_STICKERS.includes(value);
}
