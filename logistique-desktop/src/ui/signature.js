import SignaturePad from 'signature_pad';

/** Signature tactile du bénéficiaire (Signature Pad). */
export function createSignaturePad(canvas) {
  const pad = new SignaturePad(canvas, { penColor: '#111111', backgroundColor: 'rgb(255,255,255)' });
  const resize = () => {
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = canvas.offsetWidth * ratio;
    canvas.height = canvas.offsetHeight * ratio;
    canvas.getContext('2d').scale(ratio, ratio);
    pad.clear();
  };
  resize();
  return {
    isEmpty: () => pad.isEmpty(),
    clear: () => pad.clear(),
    toDataURL: () => pad.toDataURL('image/png'),
  };
}
