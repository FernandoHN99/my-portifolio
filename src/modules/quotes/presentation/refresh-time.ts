const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const timeFormat = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const fullFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

export type RefreshTimeLabel = { long: string; short: string; absolute: string };

// Rótulo da última atualização no fuso do navegador: relativo na primeira hora,
// depois a hora do dia, "ontem" ou a data.
export function describeRefreshTime(iso: string, now: number): RefreshTimeLabel {
  const date = new Date(iso);
  const elapsed = now - date.getTime();
  const absolute = fullFormat.format(date).replace(", ", " às ");

  if (elapsed < MINUTE) {
    return { long: "Atualizado agora", short: "agora", absolute };
  }

  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return { long: `Atualizado há ${minutes} min`, short: `${minutes} min`, absolute };
  }

  const time = timeFormat.format(date);
  const today = new Date(now);
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return { long: `Atualizado às ${time}`, short: time, absolute };
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return { long: `Atualizado ontem às ${time}`, short: "ontem", absolute };
  }

  const day = dayFormat.format(date);
  return { long: `Atualizado em ${day} às ${time}`, short: day, absolute };
}
