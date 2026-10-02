let pendingChanges = 0;

export function setPendingChanges(count: number) {
  pendingChanges = count;
}

export function hasPendingChanges() {
  return pendingChanges > 0;
}

export function confirmDiscardChanges() {
  if (pendingChanges === 0) {
    return true;
  }

  return window.confirm(
    `Há ${pendingChanges} ${pendingChanges === 1 ? "alteração não salva" : "alterações não salvas"}. Sair e descartá-las?`,
  );
}
