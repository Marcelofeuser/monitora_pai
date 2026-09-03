// Como a Criança se refere ao Responsável — pedido do Marcelo: em vez do
// genérico "Responsável" sempre, ele escolhe em Configurações "Pai", "Mãe",
// "Avó", "Tio" etc. O banco guarda o valor neutro (ver
// parentRelationshipEnum em lib/db/src/schema/users.ts); este arquivo é o
// único lugar que decide o rótulo e o artigo certos em português —
// compartilhado entre a tela de Configurações (Responsável escolhendo) e
// PairingJoin.tsx (Criança vendo o resultado).

export type ParentRelationship =
  | 'pai'
  | 'mae'
  | 'avo_m'
  | 'avo_f'
  | 'tio'
  | 'tia'
  | 'responsavel';

type RelationshipInfo = {
  value: ParentRelationship;
  // Rótulo pra usar em "Conversa com [o/a] X" e nos seletores.
  label: string;
  // "o" ou "a" — pro texto "mandar mensagem para [artigo] [label]".
  article: 'o' | 'a';
};

export const RELATIONSHIP_OPTIONS: RelationshipInfo[] = [
  { value: 'pai', label: 'Pai', article: 'o' },
  { value: 'mae', label: 'Mãe', article: 'a' },
  { value: 'avo_m', label: 'Avô', article: 'o' },
  { value: 'avo_f', label: 'Avó', article: 'a' },
  { value: 'tio', label: 'Tio', article: 'o' },
  { value: 'tia', label: 'Tia', article: 'a' },
  { value: 'responsavel', label: 'Responsável', article: 'o' },
];

const BY_VALUE: Record<ParentRelationship, RelationshipInfo> = Object.fromEntries(
  RELATIONSHIP_OPTIONS.map((opt) => [opt.value, opt]),
) as Record<ParentRelationship, RelationshipInfo>;

const FALLBACK: RelationshipInfo = BY_VALUE.responsavel;

export function getRelationshipInfo(relationship: string | null | undefined): RelationshipInfo {
  if (relationship && relationship in BY_VALUE) {
    return BY_VALUE[relationship as ParentRelationship];
  }
  return FALLBACK;
}

// "Conversa com o Pai" / "Conversa com a Mãe" / "Conversa com o Responsável"
export function relationshipGreeting(relationship: string | null | undefined): string {
  const info = getRelationshipInfo(relationship);
  return `${info.article === 'o' ? 'o' : 'a'} ${info.label}`;
}
