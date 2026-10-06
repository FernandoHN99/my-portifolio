"use client";

import { useCallback, useEffect, useRef, type TouchEvent } from "react";

// No toque (spec 078), a indicação dos gráficos aparece enquanto o dedo está
// no gráfico e some quando ele sai. O Recharts não limpa a indicação no fim do
// toque, só quando o ponteiro deixa o gráfico; então, ao tirar o dedo, o
// gráfico recebe a saída do ponteiro. O navegador ainda emula eventos de mouse
// logo depois do toque, que reativariam a indicação: a saída repete depois
// deles.
const RELEASE_DELAYS_MS = [0, 80, 320];

export function useTouchTooltip() {
  const timers = useRef<number[]>([]);
  const lastTouch = useRef(0);

  useEffect(
    () => () => {
      timers.current.forEach((timer) => window.clearTimeout(timer));
    },
    [],
  );

  const release = useCallback((event: TouchEvent<HTMLElement>) => {
    const container = event.currentTarget;
    lastTouch.current = Date.now();
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = RELEASE_DELAYS_MS.map((delay) =>
      window.setTimeout(() => {
        for (const wrapper of container.querySelectorAll(".recharts-wrapper")) {
          wrapper.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
        }
      }, delay),
    );
  }, []);

  const hold = useCallback(() => {
    lastTouch.current = Date.now();
    timers.current.forEach((timer) => window.clearTimeout(timer));
    timers.current = [];
  }, []);

  /** O clique que acabou de chegar veio de um toque, não do mouse. */
  const isTouch = useCallback(() => Date.now() - lastTouch.current < 800, []);

  return { containerProps: { onTouchStart: hold, onTouchEnd: release, onTouchCancel: release }, isTouch };
}
