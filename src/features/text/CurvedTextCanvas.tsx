import type { ComponentProps } from "react";
import { Shape } from "react-konva";
import { paintCurvedText, type CurvedTextOptions } from "./curvedTextLayout";
import { useCurvedTextLayout } from "./useCurvedTextLayout";

/** Keep the original selectable/draggable rectangular node and Transformer. */
export function CurvedTextCanvas({ options, color, ...props }: ComponentProps<typeof Shape> & { options: CurvedTextOptions; color: string }) {
  const layout = useCurvedTextLayout(options);
  return <Shape {...props} fill={color}
    sceneFunc={(context) => paintCurvedText(context._context, layout, { color, underline: options.underline })}
    hitFunc={(context, shape) => { context.beginPath(); context.rect(0, 0, options.width, options.height); context.closePath(); context.fillStrokeShape(shape); }}
  />;
}
