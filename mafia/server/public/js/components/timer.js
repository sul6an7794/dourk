function Timer(deadlineTs) {
  const span = el('span', 'timer');
  span.dir = 'ltr';
  let lastSecond = null;

  function update() {
    if (!deadlineTs) { span.textContent = ''; return; }
    const seconds = Math.max(0, Math.ceil((deadlineTs - Date.now()) / 1000));
    span.textContent = clockLabel(seconds);
    if (seconds > 0 && seconds <= 10) span.classList.add('low');
    if (seconds !== lastSecond) {
      lastSecond = seconds;
    }
    document.body.classList.toggle('time-critical', seconds > 0 && seconds <= 10);
  }

  update();
  // الفاصل يوقف نفسه لوحده بمجرد ما ينتهي العدّاد — ما يحتاج تفكيك خارجي (renderNow يمسح
  // root.innerHTML بالكامل بكل إعادة رسم على أي حال، فما فيه "unmount" حقيقي نربط فيه دالة تفكيك).
  const interval = setInterval(() => {
    update();
    if (deadlineTs && deadlineTs - Date.now() <= 0) clearInterval(interval);
  }, 250);

  return span;
}

function isLowTime(deadlineTs) {
  if (!deadlineTs) return false;
  const seconds = Math.ceil((deadlineTs - Date.now()) / 1000);
  return seconds > 0 && seconds <= 10;
}
