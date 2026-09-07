let vokState: string = 'nim';

export function resetVok(): void {
  vokState = 'nim';
}

export function advanceVok(): void {
  if (vokState === 'nim') {
    vokState = 'dar';
  } else if (vokState === 'dar') {
    vokState = 'dor';
  }
}

export function forceAdvanceVok(): void {
  if (vokState === 'nim') {
    vokState = 'dor';
  }
}

export function getVokState(): string {
  return vokState;
}
