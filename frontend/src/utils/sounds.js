// utils/sounds.js
// Programmatic sound effects using the Web Audio API.
// No audio assets required – tones are synthesised on demand.

// Singleton context — created once and kept alive so Firefox's autoplay policy
// doesn't block sounds that fire after async operations or timer callbacks.
let _ctx = null;

function getContext() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!_ctx || _ctx.state === "closed") {
    _ctx = new AC();
  }
  return _ctx;
}

// Call this synchronously inside a user-gesture handler (e.g. button click)
// before any awaits. This unlocks the AudioContext in Firefox so that sounds
// triggered later (after API calls or timer callbacks) play correctly.
export function primeAudio() {
  try {
    const ctx = getContext();
    if (ctx && ctx.state === "suspended") ctx.resume();
  } catch {
    // ignore
  }
}

function playChime(noteSequence) {
  try {
    const ctx = getContext();
    if (!ctx) return;

    if (ctx.state === "suspended") ctx.resume();

    const nodes = []; // hold refs so Firefox doesn't GC nodes before playback ends
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
  } catch {
    // Silently ignore errors (e.g. browser blocks AudioContext creation).
  }
}

export function playActivityStartedSound() {
  playChime([
    { frequency: 523, offset: 0, duration: 0.22 }, // C5
    { frequency: 784, offset: 0.16, duration: 0.22 }, // G5
    { frequency: 659, offset: 0.32, duration: 0.34 }, // E5
  ]);
}

export function playLimitReachedSound() {
  playChime([
    { frequency: 523, offset: 0, duration: 0.18 }, // C5
    { frequency: 659, offset: 0.12, duration: 0.18 }, // E5
    { frequency: 784, offset: 0.24, duration: 0.18 }, // G5
    { frequency: 1047, offset: 0.36, duration: 0.28 }, // C6
  ]);
}
