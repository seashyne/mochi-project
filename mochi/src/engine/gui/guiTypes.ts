// What a GUI node is, and what each class starts as.
//
// Twelve classes in three groups:
//   draw      ScreenGui, Frame, TextLabel, TextButton, ImageLabel, ImageButton
//   decorate  UICorner, UIPadding, UIScale
//   arrange   UIListLayout, UIGridLayout, UIAspectRatioConstraint
//
// The last two groups are nodes too, so `Instance.new("UICorner", frame)` is an
// ordinary parent assignment rather than a property bag bolted onto the frame.
//
// A node positions against its parent's box exactly as `UDim2` says. A list or grid
// layout on the parent replaces that: children flow in order and their Position is
// ignored, which is the rule the source API uses.
//
// `PlayerGui` is a node too. It is the root the renderer hangs ScreenGuis from, which
// means `gui.Parent = player.PlayerGui` is an ordinary reparent rather than a special
// case in the assignment path.

import type {
  AspectAxisName,
  FillDirectionName,
  FontName,
  ImageScaleTypeName,
  ScrollingDirectionName,
  SortOrderName,
  XAlignName,
  YAlignName
} from './guiEnums';
import { FULL_UDIM2, type UDim, type UDim2, type Vector2, ZERO_UDIM, ZERO_UDIM2 } from './guiValues';

export const GUI_CLASSES = [
  'ScreenGui',
  'Frame',
  'TextLabel',
  'TextButton',
  'ImageLabel',
  'ImageButton',
  'ScrollingFrame',
  'UICorner',
  'UIPadding',
  'UIScale',
  'UIListLayout',
  'UIGridLayout',
  'UIAspectRatioConstraint'
] as const;
export type GuiClass = (typeof GUI_CLASSES)[number] | 'PlayerGui';

/** Classes that draw nothing themselves; they change how their parent draws. */
export const DECORATION_CLASSES = [
  'UICorner',
  'UIPadding',
  'UIScale',
  'UIListLayout',
  'UIGridLayout',
  'UIAspectRatioConstraint'
] as const;

export function isDecorationClass(className: GuiClass): boolean {
  return (DECORATION_CLASSES as readonly string[]).includes(className);
}

/** True for the classes `Instance.new` can build. `PlayerGui` is host-created only. */
export function isGuiClass(name: string): name is (typeof GUI_CLASSES)[number] {
  return (GUI_CLASSES as readonly string[]).includes(name);
}

export function isButtonClass(className: GuiClass): boolean {
  return className === 'TextButton' || className === 'ImageButton';
}

export function isTextClass(className: GuiClass): boolean {
  return className === 'TextLabel' || className === 'TextButton';
}

export function isImageClass(className: GuiClass): boolean {
  return className === 'ImageLabel' || className === 'ImageButton';
}

export function isScrollingClass(className: GuiClass): boolean {
  return className === 'ScrollingFrame';
}

export interface GuiNode {
  id: string;
  className: GuiClass;
  name: string;
  parentId: string | null;

  // Box
  position: UDim2;
  size: UDim2;
  anchor: Vector2;
  background: string;
  backgroundTransparency: number;
  borderSize: number;
  visible: boolean;
  zIndex: number;
  /** `UIScale.Scale` on a child, applied as a visual scale of this subtree. */
  scale: number;
  /** `UIAspectRatioConstraint.AspectRatio`; 0 means no constraint. */
  aspectRatio: number;
  aspectAxis: AspectAxisName;
  /** Turning this off lets a label spill out of its panel on purpose. */
  clipsDescendants: boolean;
  /** `UIListLayout` / `UIGridLayout` ordering. */
  layoutOrder: number;

  // Text
  text: string;
  textColor: string;
  textSize: number;
  textScaled: boolean;
  textWrapped: boolean;
  /** The enum name, so a script can compare it against `Enum.Font.*`. */
  font: FontName;
  xAlign: XAlignName;
  yAlign: YAlignName;

  // Image
  image: string;
  imageColor: string;
  imageScaleType: ImageScaleTypeName;

  // UICorner
  cornerRadius: UDim;

  // UIPadding
  paddingTop: UDim;
  paddingBottom: UDim;
  paddingLeft: UDim;
  paddingRight: UDim;

  // UIListLayout
  listPadding: UDim;
  fillDirection: FillDirectionName;
  listHAlign: XAlignName;
  listVAlign: YAlignName;
  sortOrder: SortOrderName;

  // UIGridLayout
  cellSize: UDim2;
  cellPadding: UDim2;

  // ScrollingFrame
  canvasSize: UDim2;
  canvasPosition: Vector2;
  scrollingDirection: ScrollingDirectionName;
  scrollingEnabled: boolean;
}

export type GuiNodeInit = Omit<GuiNode, 'id' | 'parentId'>;

const SHARED: Omit<GuiNodeInit, 'className' | 'name'> = {
  position: ZERO_UDIM2,
  size: { xScale: 0, xOffset: 200, yScale: 0, yOffset: 100 },
  anchor: { x: 0, y: 0 },
  background: '#1a1c22',
  backgroundTransparency: 0,
  borderSize: 0,
  visible: true,
  zIndex: 1,
  scale: 1,
  aspectRatio: 0,
  aspectAxis: 'Width',
  // Clipping is on by default here. The source API leaves it off, but a label
  // spilling out of its panel is the far more common accident, and a rounded corner
  // that does not clip looks broken.
  clipsDescendants: true,
  layoutOrder: 0,
  text: '',
  textColor: '#ffffff',
  textSize: 14,
  textScaled: false,
  textWrapped: false,
  font: 'SourceSans',
  xAlign: 'Center',
  yAlign: 'Center',
  image: '',
  imageColor: '#ffffff',
  imageScaleType: 'Stretch',
  cornerRadius: { scale: 0, offset: 8 },
  paddingTop: ZERO_UDIM,
  paddingBottom: ZERO_UDIM,
  paddingLeft: ZERO_UDIM,
  paddingRight: ZERO_UDIM,
  listPadding: ZERO_UDIM,
  fillDirection: 'Vertical',
  listHAlign: 'Left',
  listVAlign: 'Top',
  sortOrder: 'LayoutOrder',
  cellSize: { xScale: 0, xOffset: 100, yScale: 0, yOffset: 100 },
  cellPadding: ZERO_UDIM2,
  // Two screens tall, which is what the source API defaults to and what makes an
  // empty ScrollingFrame visibly scrollable while a creator fills it in.
  canvasSize: { xScale: 0, xOffset: 0, yScale: 2, yOffset: 0 },
  canvasPosition: { x: 0, y: 0 },
  scrollingDirection: 'Y',
  scrollingEnabled: true
};

/** Defaults per class. A frame is a visible box, text starts empty and centred. */
export function guiDefaults(className: GuiClass, name: string): GuiNodeInit {
  if (className === 'ScreenGui') {
    return {
      ...SHARED,
      className,
      name,
      // A ScreenGui fills the viewport; its children are what get positioned.
      size: FULL_UDIM2,
      background: '#000000',
      backgroundTransparency: 1,
      zIndex: 1
    };
  }
  if (className === 'PlayerGui') {
    return { ...SHARED, className, name: 'PlayerGui', size: FULL_UDIM2, backgroundTransparency: 1 };
  }
  if (isDecorationClass(className)) {
    // Never drawn, so its own box and colours are meaningless; zeroing the size keeps
    // it from affecting anything that walks the tree.
    return { ...SHARED, className, name, size: ZERO_UDIM2, backgroundTransparency: 1 };
  }
  if (isImageClass(className)) {
    return { ...SHARED, className, name, background: '#000000', backgroundTransparency: 1 };
  }
  // Frame, TextLabel and TextButton share one shape; a button differs only in that it
  // accepts clicks, which the store decides from the class name.
  return { ...SHARED, className, name };
}
