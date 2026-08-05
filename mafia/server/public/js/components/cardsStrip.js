function CardsStrip(presentCards, myCard, onZoom) {
  const shell = el('div', 'cards-drawer-shell');
  const groups = [];
  const byFile = new Map();

  presentCards.forEach((file) => {
    if (!byFile.has(file)) {
      const data = roleCardData(file);
      const group = {
        file,
        count: 0,
        label: data.nameAr || 'بطاقة',
        faction: data.faction || 'neutral',
        mine: file === myCard,
      };
      byFile.set(file, group);
      groups.push(group);
    }
    byFile.get(file).count += 1;
  });

  const uniqueRoles = groups.length;
  const totalCards = presentCards.length;

  const toggle = el('button', 'cards-drawer-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-haspopup', 'dialog');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-label', `عرض بطاقات اللعبة: ${uniqueRoles} أدوار و${totalCards} بطاقة`);
  const icon = el('span', 'cards-drawer-icon');
  icon.setAttribute('aria-hidden', 'true');
  icon.appendChild(el('span'));
  icon.appendChild(el('span'));
  toggle.appendChild(icon);
  const copy = el('span', 'cards-drawer-copy');
  copy.appendChild(el('span', 'cards-drawer-title', 'بطاقات اللعبة'));
  copy.appendChild(el('span', 'cards-drawer-count', `${uniqueRoles} أدوار · ${totalCards} بطاقة`));
  toggle.appendChild(copy);
  toggle.appendChild(el('span', 'cards-drawer-badge', String(totalCards)));
  shell.appendChild(toggle);

  const overlay = el('div', 'cards-drawer-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'cardsDrawerTitle');
  const panel = el('div', 'cards-drawer-panel');
  const head = el('div', 'cards-drawer-head');
  const title = el('span', 'cards-drawer-head-title', 'بطاقات اللعبة');
  title.id = 'cardsDrawerTitle';
  head.appendChild(title);
  const closeBtn = el('button', 'cards-drawer-close', 'إغلاق');
  closeBtn.type = 'button';
  head.appendChild(closeBtn);
  panel.appendChild(head);

  const list = el('div', 'cards-drawer-list scroll-y');
  groups.forEach((group) => {
    const row = el('button', `strip-card-row ${group.faction}${group.mine ? ' mine' : ''}`);
    row.type = 'button';
    const name = el('span', 'strip-card-name', group.label);
    row.appendChild(name);
    if (group.mine) row.appendChild(el('span', 'strip-card-mine', 'بطاقتك'));
    if (group.count > 1) row.appendChild(el('span', 'strip-card-count', `×${group.count}`));
    row.addEventListener('click', () => {
      const compact = window.matchMedia('(max-width: 560px)').matches;
      closeDrawer({ restoreFocus: false });
      onZoom(group.file, compact ? null : row.getBoundingClientRect());
    });
    list.appendChild(row);
  });
  panel.appendChild(list);
  overlay.appendChild(panel);
  shell.appendChild(overlay);

  function onKeyDown(event) {
    if (event.key === 'Escape') closeDrawer();
  }

  function focusQuietly(node) {
    try {
      node.focus({ preventScroll: true });
    } catch (_err) {
      node.focus();
    }
  }

  function openDrawer() {
    shell.classList.add('open');
    document.body.classList.add('cards-drawer-open');
    toggle.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onKeyDown);
    setTimeout(() => focusQuietly(closeBtn), 0);
  }

  function closeDrawer(opts = {}) {
    shell.classList.remove('open');
    document.body.classList.remove('cards-drawer-open');
    toggle.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKeyDown);
    if (opts.restoreFocus !== false) focusQuietly(toggle);
  }

  toggle.addEventListener('click', openDrawer);
  closeBtn.addEventListener('click', () => closeDrawer());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) closeDrawer();
  });

  shell.cleanup = () => closeDrawer({ restoreFocus: false });

  return shell;
}

function CardZoom(file, onClose, startRect) {
  const overlay = el('div', 'card-zoom-overlay');
  const card = RoleCard(file, { noFlipReveal: true });
  overlay.appendChild(card);
  overlay.addEventListener('click', onClose);

  const compact = window.matchMedia('(max-width: 560px)').matches;
  if (startRect && !compact) {
    requestAnimationFrame(() => {
      const endRect = card.getBoundingClientRect();
      const dx = (startRect.left + startRect.width / 2) - (endRect.left + endRect.width / 2);
      const dy = (startRect.top + startRect.height / 2) - (endRect.top + endRect.height / 2);
      const scaleX = startRect.width / endRect.width;
      const scaleY = startRect.height / endRect.height;
      card.style.transition = 'none';
      card.style.transform = `translate(${dx}px, ${dy}px) scale(${scaleX}, ${scaleY})`;
      card.style.opacity = '0.5';
      requestAnimationFrame(() => {
        card.style.transition = 'transform 0.35s cubic-bezier(0.2,0.8,0.3,1), opacity 0.25s ease';
        card.style.transform = 'translate(0, 0) scale(1, 1)';
        card.style.opacity = '1';
      });
    });
  }

  return overlay;
}
