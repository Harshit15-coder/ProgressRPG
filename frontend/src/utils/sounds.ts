// utils/sounds.ts
// Programmatic sound effects using the Web Audio API.
// No audio assets required – tones are synthesised on demand.

// Singleton context — created once and kept alive so Firefox's autoplay policy
// doesn't block sounds that fire after async operations or timer callbacks.
let _ctx: AudioContext | null = null;

interface Note {
  frequency: number;
  offset: number;
  duration: number;
}

function getContext(): AudioContext | null {
  // webkitAudioContext exists on older Safari — not in the standard lib types,
  // so we access it via the window object with a type assertion.
  const AC =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!_ctx || _ctx.state === "closed") {
    _ctx = new AC();
  }
  return _ctx;
}

// Call this synchronously inside a user-gesture handler (e.g. button click)
// before any awaits. This unlocks the AudioContext in Firefox so that sounds
// triggered later (after API calls or timer callbacks) play correctly.
export function primeAudio(): void {
  try {
    const ctx = getContext();
    if (ctx && ctx.state === "suspended") ctx.resume();
  } catch {
    // ignore
  }
}

function scheduleNotes(ctx: AudioContext, noteSequence: Note[]): void {
  const nodes: (OscillatorNode | GainNode)[] = []; // hold refs so Firefox doesn't GC nodes before playback ends
  const t = ctx.currentTime;

  noteSequence.forEach(({ frequency, offset, duration }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.25, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, t + offset + duration);
    osc.start(t + offset);
    osc.stop(t + offset + duration);
    nodes.push(osc, gain);
  });

  const finalNoteEnd =
    noteSequence.reduce(
      (latestEnd, note) => Math.max(latestEnd, note.offset + note.duration),
      0,
    ) * 1000;

  setTimeout(() => { nodes.length = 0; }, finalNoteEnd + 400);
}

function playChime(noteSequence: Note[]): void {
  try {
    const ctx = getContext();
    if (!ctx) return;

    // If suspended, wait for resume to complete before scheduling notes so
    // that notes aren't silently dropped while the context is still unlocking.
    if (ctx.state === "suspended") {
      ctx.resume().then(() => scheduleNotes(ctx, noteSequence)).catch(() => {});
    } else {
      scheduleNotes(ctx, noteSequence);
    }
  } catch {
    // Silently ignore errors (e.g. browser blocks AudioContext creation).
  }
}

export function playActivityStartedSound(): void {
  playChime([
    { frequency: 523, offset: 0, duration: 0.22 }, // C5
    { frequency: 784, offset: 0.16, duration: 0.22 }, // G5
    { frequency: 659, offset: 0.32, duration: 0.34 }, // E5
  ]);
}

export function playLimitReachedSound(): void {
  playChime([
    { frequency: 523, offset: 0, duration: 0.18 }, // C5
    { frequency: 659, offset: 0.12, duration: 0.18 }, // E5
    { frequency: 784, offset: 0.24, duration: 0.18 }, // G5
    { frequency: 1047, offset: 0.36, duration: 0.28 }, // C6
  ]);
}
