"use client";

import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/**
 * Conteúdo da aba, com uma entrada suave a cada troca de página. As abas só
 * trocam pelo toque nelas: o arraste lateral da spec 062 saiu a pedido do
 * usuário (spec 077), porque mudava de tela sem querer no celular.
 */
export function TabViewport({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      key={pathname}
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
    >
      {children}
    </motion.div>
  );
}
