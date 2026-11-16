// CodeMirror 6 Theme using Mochi Studio design tokens exclusively

import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const studioTheme = EditorView.theme({
  '&': {
    color: 'rgb(var(--studio-text-rgb))',
    backgroundColor: 'rgb(var(--studio-bg-rgb))',
    fontFamily: 'var(--studio-font-mono, monospace)',
    fontSize: '12px',
    height: '100%'
  },
  '.cm-content': {
    caretColor: 'rgb(var(--studio-accent-rgb))',
    lineHeight: '24px',
    padding: '8px 0'
  },
  '&.cm-focused .cm-cursor': {
    borderLeftColor: 'rgb(var(--studio-accent-rgb))',
    borderLeftWidth: '2px'
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
    backgroundColor: 'rgb(var(--studio-accent-rgb) / 0.25) !important'
  },
  '.cm-panels': {
    backgroundColor: 'rgb(var(--studio-panel-rgb))',
    color: 'rgb(var(--studio-text-rgb))'
  },
  '.cm-panels.cm-panels-top': {
    borderBottom: '1px solid rgb(var(--studio-border-rgb))'
  },
  '.cm-panels.cm-panels-bottom': {
    borderTop: '1px solid rgb(var(--studio-border-rgb))'
  },
  '.cm-searchMatch': {
    backgroundColor: 'rgb(var(--studio-warning-rgb) / 0.3)',
    outline: '1px solid rgb(var(--studio-warning-rgb) / 0.6)'
  },
  '.cm-searchMatch.cm-searchMatch-selected': {
    backgroundColor: 'rgb(var(--studio-accent-rgb) / 0.4)'
  },
  '.cm-activeLine': {
    backgroundColor: 'rgb(var(--studio-panel-rgb) / 0.35)'
  },
  '.cm-selectionMatch': {
    backgroundColor: 'rgb(var(--studio-accent-rgb) / 0.2)'
  },
  '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: 'rgb(var(--studio-accent-rgb) / 0.2)',
    borderBottom: '1px solid rgb(var(--studio-accent-rgb))'
  },
  '.cm-gutters': {
    backgroundColor: 'rgb(var(--studio-panel-rgb) / 0.7)',
    color: 'rgb(var(--studio-muted-rgb))',
    borderRight: '1px solid rgb(var(--studio-border-rgb))',
    lineHeight: '24px'
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'rgb(var(--studio-panel-rgb))',
    color: 'rgb(var(--studio-text-rgb))'
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'rgb(var(--studio-muted-rgb))'
  },
  '.cm-tooltip': {
    border: '1px solid rgb(var(--studio-border-rgb))',
    backgroundColor: 'rgb(var(--studio-panel-rgb))',
    borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
    color: 'rgb(var(--studio-text-rgb))'
  },
  '.cm-tooltip .cm-tooltip-arrow:before': {
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent'
  },
  '.cm-tooltip .cm-tooltip-arrow:after': {
    borderTopColor: 'rgb(var(--studio-panel-rgb))',
    borderBottomColor: 'rgb(var(--studio-panel-rgb))'
  },
  '.cm-tooltip-autocomplete': {
    '& > ul': {
      fontFamily: 'var(--studio-font-mono, monospace)',
      fontSize: '11px',
      maxHeight: '180px',
      overflowY: 'auto',
      padding: '4px'
    },
    '& > ul > li': {
      padding: '4px 8px',
      borderRadius: '6px',
      color: 'rgb(var(--studio-text-rgb))'
    },
    '& > ul > li[aria-selected]': {
      backgroundColor: 'rgb(var(--studio-accent-rgb) / 0.2)',
      color: 'rgb(var(--studio-accent-rgb))'
    }
  },
  '.cm-completionLabel': {
    fontWeight: '500'
  },
  '.cm-completionMatchedText': {
    color: 'rgb(var(--studio-accent-rgb))',
    textDecoration: 'none',
    fontWeight: 'bold'
  },
  '.cm-completionDetail': {
    color: 'rgb(var(--studio-muted-rgb))',
    fontStyle: 'italic',
    marginLeft: '6px'
  },
  '.cm-completionInfo': {
    backgroundColor: 'rgb(var(--studio-card-rgb))',
    border: '1px solid rgb(var(--studio-border-rgb))',
    borderRadius: '8px',
    padding: '8px 10px',
    fontSize: '11px',
    maxWidth: '320px',
    color: 'rgb(var(--studio-text-rgb))'
  },
  '.cm-lintRange-error': {
    backgroundImage: 'none',
    borderBottom: '2px wavy rgb(var(--studio-danger-rgb))',
    backgroundColor: 'rgb(var(--studio-danger-rgb) / 0.12)'
  },
  '.cm-lint-marker-error': {
    content: 'none'
  },
  '.cm-tooltip-lint': {
    backgroundColor: 'rgb(var(--studio-panel-rgb))',
    border: '1px solid rgb(var(--studio-border-rgb))',
    padding: '6px 10px',
    borderRadius: '8px',
    fontSize: '11px'
  }
}, { dark: true });

export const studioHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'rgb(var(--studio-violet-rgb))', fontWeight: 'bold' },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: 'rgb(var(--studio-text-rgb))' },
  { tag: [t.function(t.variableName), t.labelName], color: 'rgb(var(--studio-info-rgb))' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: 'rgb(var(--studio-info-rgb))', fontWeight: 'bold' },
  { tag: [t.definition(t.name), t.separator], color: 'rgb(var(--studio-text-rgb))' },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: 'rgb(var(--studio-warning-rgb))' },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: 'rgb(var(--studio-muted-rgb))' },
  { tag: [t.meta, t.comment], color: 'rgb(var(--studio-muted-rgb))', fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'rgb(var(--studio-accent-rgb))', textDecoration: 'underline' },
  { tag: t.heading, fontWeight: 'bold', color: 'rgb(var(--studio-accent-rgb))' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: 'rgb(var(--studio-violet-rgb))' },
  { tag: [t.processingInstruction, t.string, t.inserted], color: 'rgb(var(--studio-success-rgb))' },
  { tag: t.invalid, color: 'rgb(var(--studio-danger-rgb))' }
]);

export const studioThemeExtension: Extension = [
  studioTheme,
  syntaxHighlighting(studioHighlightStyle)
];
