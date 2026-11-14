// The text run inside a GUI box.
//
// `TextScaled` is the one property that cannot be expressed in CSS: the source API
// shrinks the font until the string fits both dimensions, which needs a measurement.
// The span is measured once at the box's full height and scaled by the overflow ratio,
// then re-fitted on a window resize - the overlay is viewport-sized, so that is the
// only resize that matters.
//
// `useLayoutEffect` is the right hook (it runs before paint, so there is no flash of
// the wrong size) but it warns during server rendering, hence the isomorphic alias.

import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { familyFor } from '../../engine/gui/guiEnums';
import type { GuiNode } from '../../engine/gui/guiTypes';
import { HUD_FONT_STACK } from './hudFonts';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export const GuiText: React.FC<{ node: GuiNode }> = ({ node }) => {
  const ref = useRef<HTMLSpanElement>(null);

  useIsomorphicLayoutEffect(() => {
    if (!node.textScaled) return;
    const span = ref.current;
    const box = span?.parentElement;
    if (!span || !box) return;

    const fit = () => {
      const width = box.clientWidth;
      const height = box.clientHeight;
      if (!width || !height) return;
      // Measure at the tallest a line could be, then scale by how much it overflows.
      // One pass is enough because the ratio is taken from the measured box, not
      // estimated from a character count.
      span.style.fontSize = `${height}px`;
      const scale = Math.min(width / (span.scrollWidth || 1), height / (span.scrollHeight || 1), 1);
      span.style.fontSize = `${Math.max(6, Math.floor(height * scale))}px`;
    };

    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [node.text, node.textScaled, node.textSize, node.font, node.textWrapped]);

  return (
    <span
      ref={ref}
      style={{
        color: node.textColor,
        fontSize: node.textScaled ? undefined : node.textSize,
        fontFamily: HUD_FONT_STACK[familyFor(node.font)],
        lineHeight: 1.2,
        // Scaling measures the string unwrapped; wrapping would make the ratio
        // depend on the width it is trying to fill.
        whiteSpace: node.textScaled ? 'pre' : node.textWrapped ? 'pre-wrap' : 'pre',
        wordBreak: node.textWrapped ? 'break-word' : undefined,
        overflowWrap: node.textWrapped ? 'anywhere' : undefined,
        display: node.textScaled ? 'inline-block' : undefined
      }}
    >
      {node.text}
    </span>
  );
};
