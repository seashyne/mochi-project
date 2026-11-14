// The Lua `Enum` members for the GUI classes, generated from guiEnums.ts.
//
// Generated rather than hand-written so the table and the TypeScript readers cannot
// drift: a name added there appears here, and a member the prelude is missing would be
// a value a script could not write. The values are the names themselves - an object
// would lose its identity crossing the host boundary, and then
// `label.Font == Enum.Font.Code` would be false.

import {
  ASPECT_AXES,
  FILL_DIRECTIONS,
  FONT_NAMES,
  HORIZONTAL_ALIGNMENTS,
  IMAGE_SCALE_TYPES,
  SCROLLING_DIRECTIONS,
  SORT_ORDERS,
  VERTICAL_ALIGNMENTS
} from './guiEnums';

function fontMembers(): string {
  return FONT_NAMES.map((name) => `  ${name} = "${name}",`).join('\n');
}

function simpleMembers(names: readonly string[]): string {
  return names.map((name) => `${name} = "${name}"`).join(', ');
}

export const GUI_ENUM_LUA = `
-- GUI enums, generated from guiEnums.ts.
Enum.Font = {
${fontMembers()}
}
Enum.TextXAlignment = { ${simpleMembers(HORIZONTAL_ALIGNMENTS)} }
Enum.TextYAlignment = { ${simpleMembers(VERTICAL_ALIGNMENTS)} }
Enum.HorizontalAlignment = { ${simpleMembers(HORIZONTAL_ALIGNMENTS)} }
Enum.VerticalAlignment = { ${simpleMembers(VERTICAL_ALIGNMENTS)} }
Enum.FillDirection = { ${simpleMembers(FILL_DIRECTIONS)} }
Enum.SortOrder = { ${simpleMembers(SORT_ORDERS)} }
Enum.DominantAxis = { ${simpleMembers(ASPECT_AXES)} }
Enum.ScaleType = { ${simpleMembers(IMAGE_SCALE_TYPES)} }
Enum.ScrollingDirection = { ${simpleMembers(SCROLLING_DIRECTIONS)} }
`;
