// Floating tab dock shared by every srd5e sheet.
//
// The dock belongs to a sheet window but has to live outside it: anything that escapes a window's own box loses to the
// game canvas, so the dock is re-parented next to the window and kept on its right edge. To read as part of the sheet it
// must also move, scale and fade exactly like the window does while the window opens, closes and is dragged.

const CLOSE_FALLBACK_MS = 600;

// Position of the dock in viewport pixels, from the window's LAYOUT box. The layout box ignores the window's open
// animation (transform), so the dock does not trail behind it.
function dockGeometry(win) {
  const base = win.offsetParent ? win.offsetParent.getBoundingClientRect() : { left: 0, top: 0 };
  return {
    baseLeft: base.left,
    baseTop: base.top,
    left: base.left + win.offsetLeft + win.offsetWidth - 1,
    top: base.top + win.offsetTop + 40,
  };
}

function removeDock(sheet) {
  if (sheet._sideTabsRaf) cancelAnimationFrame(sheet._sideTabsRaf);
  sheet._sideTabsRaf = null;
  sheet._sideTabsEl?.remove();
  sheet._sideTabsEl = null;
}

// Moves the dock out of `sheet.element` and keeps it glued to the window. `onClick` receives clicks made on the dock,
// because they no longer bubble through the window.
export function attachSideTabs(sheet, onClick) {
  const win = sheet.element;
  const nav = win?.querySelector('.sdrn-side-tabs');
  // A second render pass finds no fresh nav inside the window: the one from the first pass is already floating.
  if (!nav) return;
  removeDock(sheet);
  const container = win.parentElement;
  if (!container) return;
  container.appendChild(nav);
  nav.style.position = 'fixed';
  nav.style.visibility = 'hidden';
  if (onClick) nav.addEventListener('click', onClick);
  sheet._sideTabsEl = nav;

  const follow = () => {
    const el = sheet._sideTabsEl;
    if (!el?.isConnected) return;
    if (!win.isConnected) {
      removeDock(sheet);
      return;
    }
    if (win.style.display === 'none' || win.hidden) {
      el.style.display = 'none';
    } else {
      const { baseLeft, baseTop, left, top } = dockGeometry(win);
      const cs = getComputedStyle(win);
      const [ox, oy] = cs.transformOrigin.split(' ').map(parseFloat);
      el.style.display = 'flex';
      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      // Same stacking level as the window and kept right after it in the DOM, so a window opened later covers this dock.
      el.style.zIndex = String(parseInt(cs.zIndex, 10) || 100);
      if (win.nextElementSibling !== el) win.after(el);
      // Same origin, transform and opacity as the window, so the dock opens and closes together with it.
      el.style.transformOrigin = `${baseLeft + win.offsetLeft + ox - left}px ${baseTop + win.offsetTop + oy - top}px`;
      el.style.transform = cs.transform === 'none' ? '' : cs.transform;
      el.style.opacity = cs.opacity;
      el.style.visibility = 'visible';
    }
    sheet._sideTabsRaf = requestAnimationFrame(follow);
  };
  follow();
}

// Removes the dock. While the window is still on screen the dock keeps following it, so it leaves together with the
// window's closing animation; a timer guarantees it never outlives the window.
export function detachSideTabs(sheet) {
  const el = sheet._sideTabsEl;
  if (!el) return;
  const win = sheet.element;
  if (!win?.isConnected) {
    removeDock(sheet);
    return;
  }
  setTimeout(() => {
    if (sheet._sideTabsEl === el) removeDock(sheet);
  }, CLOSE_FALLBACK_MS);
}
