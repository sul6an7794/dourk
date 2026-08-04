function arNum(value) {
  return String(value);
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function qrDataUrl(text, dark, light) {
  try {
    if (typeof qrcode !== 'function') throw new Error('QR library is not ready');
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const svg = qr.createSvgTag({ cellSize: 5, margin: 4, scalable: true, alt: 'QR' })
      .replace('fill="white"', 'fill="' + (light || '#0d1420') + '"')
      .replace('fill="black"', 'fill="' + (dark || '#f2f4f7') + '"');
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  } catch (e) {
    return '';
  }
}

function numberTicker(fromVal, toVal, className) {
  const span = document.createElement('span');
  if (className) span.className = className;
  if (fromVal === toVal) { span.textContent = arNum(toVal); return span; }
  const duration = 280;
  const start = performance.now();
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(fromVal + (toVal - fromVal) * eased);
    span.textContent = arNum(val);
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
  return span;
}

function clockLabel(seconds) {
  const s = Math.max(0, seconds);
  const mm = String(Math.floor(s / 60));
  const ss = String(s % 60).padStart(2, '0');
  return `0${mm}:${ss}`;
}
