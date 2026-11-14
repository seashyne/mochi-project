// RichText: a small inline markup parser.
//
// Not `dangerouslySetInnerHTML` - the string comes from a game script, and handing it
// to the DOM would make every chat line a potential injection. This walks the markup
// and produces React elements, so an unknown tag is text rather than a hole.
//
// Supported: <b> <i> <u> <s>, <font color="...">, <br>. Anything else renders
// literally, which is what a creator sees and can fix.

import React from 'react';

type Tag = 'b' | 'i' | 'u' | 's' | 'font';

interface Frame {
  tag: Tag;
  color?: string;
}

const TAG_NAMES: Record<string, Tag> = { b: 'b', i: 'i', u: 'u', s: 's', font: 'font' };
const TOKEN = /<\/?([a-zA-Z]+)([^>]*)>/g;

function styleOf(frames: Frame[]): React.CSSProperties {
  const style: React.CSSProperties = {};
  const decorations: string[] = [];
  let color: string | undefined;

  for (const frame of frames) {
    if (frame.tag === 'b') style.fontWeight = 700;
    if (frame.tag === 'i') style.fontStyle = 'italic';
    if (frame.tag === 'u') decorations.push('underline');
    if (frame.tag === 's') decorations.push('line-through');
    if (frame.tag === 'font' && frame.color) color = frame.color;
  }
  if (decorations.length > 0) style.textDecoration = decorations.join(' ');
  if (color) style.color = color;
  return style;
}

function readColor(attributes: string): string | undefined {
  const match = /color\s*=\s*"([^"]+)"/i.exec(attributes) ?? /color\s*=\s*'([^']+)'/i.exec(attributes);
  return match ? match[1] : undefined;
}

/**
 * Splits a markup string into styled runs. Text outside any tag keeps the caller's
 * style, so a label that only bolds one word still inherits the node's colour and font.
 */
export function richTextNodes(source: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  const frames: Frame[] = [];
  let cursor = 0;
  let key = 0;

  const pushText = (text: string) => {
    if (!text) return;
    const style = styleOf(frames);
    out.push(
      Object.keys(style).length > 0 ? (
        <span key={`r${key++}`} style={style}>
          {text}
        </span>
      ) : (
        <React.Fragment key={`r${key++}`}>{text}</React.Fragment>
      )
    );
  };

  TOKEN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN.exec(source)) !== null) {
    pushText(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;

    const closing = match[0].startsWith('</');
    const name = match[1].toLowerCase();
    const tag = TAG_NAMES[name];

    if (name === 'br') {
      out.push(<br key={`r${key++}`} />);
      continue;
    }
    if (!tag) {
      // An unknown tag is not markup; the creator gets to see what they typed.
      pushText(match[0]);
      continue;
    }

    if (closing) {
      for (let index = frames.length - 1; index >= 0; index -= 1) {
        if (frames[index].tag === tag) {
          frames.splice(index, 1);
          break;
        }
      }
    } else {
      frames.push({ tag, color: tag === 'font' ? readColor(match[2]) : undefined });
    }
  }

  pushText(source.slice(cursor));
  return out;
}
