"use client";

import { Slider } from "@base-ui/react/slider";
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";

import { cn } from "@/lib/utils";

// O deslizante anda de 1 em 1 ponto; o campo numérico ao lado continua aceitando valor quebrado.
const SLIDER_STEP = 1;
// No toque, o dedo precisa andar esta distância na horizontal, em pixels, para o gesto virar arraste.
const TOUCH_DRAG_THRESHOLD = 8;
// Folga em volta do polegar, em pixels, para o toque contar como pegar o polegar e não o trilho.
const THUMB_TOUCH_SLOP = 12;

const KEY_DIRECTION: Partial<Record<string, 1 | -1>> = {
  ArrowRight: 1,
  ArrowUp: 1,
  PageUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
  PageDown: -1,
};

/**
 * Deslizante de 1 em 1 ponto. Um valor quebrado digitado no campo, como 12,5, é exibido na posição exata e
 * só muda quando o usuário arrasta o deslizante ou usa as setas; nesse caso as teclas vão para o inteiro
 * mais distante dentro do passo, em vez de arredondar e depois somar um passo.
 *
 * No toque, encostar o dedo não muda nada: o valor só muda num arraste horizontal, e um gesto vertical
 * que comece sobre o deslizante rola a página.
 */
export function StepSlider({
  value,
  max,
  largeStep = 10,
  label,
  valueText,
  onChange,
}: {
  value: number;
  max: number;
  largeStep?: number;
  label: string;
  valueText: (value: number) => string;
  onChange: (value: number) => void;
}) {
  const shown = Number.isFinite(value) ? Math.min(Math.max(value, 0), max) : 0;
  const rootRef = useRef<HTMLDivElement>(null);
  const controlRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const touchDragging = useTouchDrag({ rootRef, controlRef, thumbRef, value: shown, max, onChange });

  const stepFromFraction = (event: KeyboardEvent<HTMLInputElement>) => {
    const direction = KEY_DIRECTION[event.key];
    if (direction === undefined || Number.isInteger(shown)) {
      return;
    }
    const increment =
      event.shiftKey || event.key === "PageUp" || event.key === "PageDown" ? largeStep : SLIDER_STEP;
    event.preventDefault();
    onChange(wholeStepFrom(shown, direction * increment, max));
  };

  // O `input type="range"` oculto guarda o valor ajustado ao passo, 16 para 15,5. Ajustes que passam por
  // ele, como os gestos de leitores de tela, seguem a regra das setas a partir do valor exibido.
  const stepNativeFromFraction = (event: FormEvent<HTMLDivElement>) => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || Number.isInteger(shown)) {
      return;
    }
    event.stopPropagation();
    const direction = Math.sign(input.valueAsNumber - shown);
    if (direction === 1 || direction === -1) {
      onChange(wholeStepFrom(shown, direction * SLIDER_STEP, max));
    }
  };

  return (
    <Slider.Root
      ref={rootRef}
      value={shown}
      min={0}
      max={max}
      step={SLIDER_STEP}
      largeStep={largeStep}
      thumbAlignment="edge"
      onValueChange={(next) => {
        if (typeof next === "number") {
          onChange(next);
        }
      }}
      className="w-full"
    >
      <Slider.Control
        ref={controlRef}
        className="flex h-8 w-full cursor-pointer touch-pan-y items-center select-none"
      >
        <Slider.Track className="relative h-1.5 w-full rounded-full bg-white/[0.08]">
          <Slider.Indicator className="rounded-full bg-primary" />
          <Slider.Thumb
            ref={thumbRef}
            aria-label={label}
            getAriaValueText={(_formatted, current) => valueText(current)}
            onKeyDown={stepFromFraction}
            onChangeCapture={stepNativeFromFraction}
            className={cn(
              "size-4 rounded-full border-[3px] border-card bg-primary shadow-[0_1px_3px_rgb(0_0_0/0.45)] outline-none transition-[box-shadow,scale] duration-150 ease-out select-none hover:ring-4 hover:ring-primary/15 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-ring/45 data-dragging:scale-110 data-dragging:ring-4 data-dragging:ring-primary/20",
              touchDragging && "scale-110 ring-4 ring-primary/20",
            )}
          />
        </Slider.Track>
      </Slider.Control>
    </Slider.Root>
  );
}

/**
 * Gesto de toque do deslizante. O Base UI muda o valor assim que o dedo encosta e trata qualquer movimento
 * como arraste, o que fazia a rolagem da página, ao passar por uma lista de deslizantes, mudar metas e
 * arredondar valores quebrados. Aqui o toque é interceptado antes de chegar ao Base UI: um gesto vertical
 * fica com o navegador, que rola a página graças ao `touch-action: pan-y`; um toque sem movimento não muda
 * nada; só um arraste horizontal muda o valor, de 1 em 1 ponto. O mouse continua com o Base UI.
 */
function useTouchDrag({
  rootRef,
  controlRef,
  thumbRef,
  value,
  max,
  onChange,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  controlRef: RefObject<HTMLDivElement | null>;
  thumbRef: RefObject<HTMLDivElement | null>;
  value: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const readCurrent = useEffectEvent(() => ({ value, max }));
  const emit = useEffectEvent((next: number) => onChange(next));

  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    let gesture: {
      pointerId: number;
      startX: number;
      startY: number;
      thumbOffset: number;
      dragging: boolean;
      last: number;
    } | null = null;

    const valueAt = (clientX: number) => {
      const control = controlRef.current?.getBoundingClientRect();
      const thumb = thumbRef.current?.getBoundingClientRect();
      if (!control || !thumb) {
        return null;
      }
      // Mesma geometria do `thumbAlignment="edge"`: o centro do polegar anda de meia largura a meia largura.
      const travel = control.width - thumb.width;
      if (travel <= 0) {
        return null;
      }
      const fraction = Math.min(Math.max((clientX - control.left - thumb.width / 2) / travel, 0), 1);
      return Math.round((fraction * readCurrent().max) / SLIDER_STEP) * SLIDER_STEP;
    };

    const detach = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onPointerEnd);
      document.removeEventListener("pointercancel", onPointerEnd);
    };

    const finish = () => {
      if (gesture?.dragging) {
        setDragging(false);
      }
      gesture = null;
      detach();
    };

    function onPointerMove(event: PointerEvent) {
      if (!gesture || event.pointerId !== gesture.pointerId) {
        return;
      }
      if (!gesture.dragging) {
        const dx = Math.abs(event.clientX - gesture.startX);
        const dy = Math.abs(event.clientY - gesture.startY);
        if (dy >= TOUCH_DRAG_THRESHOLD && dy >= dx) {
          // Gesto vertical: é rolagem, e o navegador já cuida dela.
          finish();
          return;
        }
        if (dx < TOUCH_DRAG_THRESHOLD || dx <= dy) {
          return;
        }
        gesture.dragging = true;
        setDragging(true);
      }
      const next = valueAt(event.clientX - gesture.thumbOffset);
      if (next !== null && next !== gesture.last) {
        gesture.last = next;
        emit(next);
      }
    }

    function onPointerEnd(event: PointerEvent) {
      if (gesture && event.pointerId === gesture.pointerId) {
        finish();
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === "mouse") {
        return;
      }
      // Sem propagar, o Base UI não vê o toque e não muda o valor ao encostar o dedo.
      event.stopPropagation();
      if (gesture || !event.isPrimary) {
        return;
      }
      const thumb = thumbRef.current?.getBoundingClientRect();
      const center = thumb ? thumb.left + thumb.width / 2 : event.clientX;
      const onThumb = thumb !== undefined && Math.abs(event.clientX - center) <= thumb.width / 2 + THUMB_TOUCH_SLOP;
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        // Pegando o polegar, ele acompanha o dedo sem saltar; fora dele, vai para onde o dedo está.
        thumbOffset: onThumb ? event.clientX - center : 0,
        dragging: false,
        last: readCurrent().value,
      };
      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerEnd);
      document.addEventListener("pointercancel", onPointerEnd);
    };

    // O Base UI também escuta `touchstart` direto no controle; o toque não deve chegar até ele.
    const onTouchStart = (event: TouchEvent) => event.stopPropagation();

    root.addEventListener("pointerdown", onPointerDown, { capture: true });
    root.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    return () => {
      root.removeEventListener("pointerdown", onPointerDown, { capture: true });
      root.removeEventListener("touchstart", onTouchStart, { capture: true });
      detach();
    };
  }, [rootRef, controlRef, thumbRef]);

  return dragging;
}

// De um valor quebrado, anda até o inteiro mais distante sem passar do passo: de 12,5, +1 leva a 13, −1 a 12,
// +10 a 22 e −10 a 3. O resultado fica entre 0 e o máximo do deslizante.
function wholeStepFrom(value: number, delta: number, max: number) {
  const next = delta > 0 ? Math.floor(value + delta) : Math.ceil(value + delta);
  return Math.min(Math.max(next, 0), max);
}
