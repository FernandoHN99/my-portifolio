"use client";

import { motion, useReducedMotion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, type ReactNode, type TouchEvent } from "react";

import { MAIN_TABS, type TabKey } from "@/components/product/main-tabs";

const SWIPE_THRESHOLD = 64;

export function TabViewport({ active, children }: { active: TabKey | "none"; children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const reduceMotion = useReducedMotion();
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  const goToAdjacentTab = (direction: 1 | -1) => {
    const currentIndex = MAIN_TABS.findIndex((tab) => tab.key === active);

    if (currentIndex === -1) {
      return;
    }

    const target = MAIN_TABS[currentIndex + direction];

    if (!target) {
      return;
    }

    const month = searchParams.get("mes");
    router.push(month ? `${target.href}?mes=${month}` : target.href);
  };

  const handleTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStart.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStart.current;
    touchStart.current = null;

    if (!start) {
      return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;

    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) {
      return;
    }

    goToAdjacentTab(deltaX < 0 ? 1 : -1);
  };

  return (
    <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
      <motion.div
        key={pathname}
        initial={reduceMotion ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      >
        {children}
      </motion.div>
    </div>
  );
}
