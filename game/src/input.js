// Keyboard and mouse state, with edge detection (pressed this frame).
export function createInput(canvas) {
  const keys = new Set();
  const pressed = new Set();
  const mouse = { x: 0, y: 0, down: false, clicked: false };
  const prevent = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '];

  function keyName(event) {
    const k = event.key;
    if (k === ' ') return 'Space';
    return k.length === 1 ? k.toLowerCase() : k;
  }

  window.addEventListener('keydown', (event) => {
    if (prevent.includes(event.key)) event.preventDefault();
    const k = keyName(event);
    if (!keys.has(k)) pressed.add(k);
    keys.add(k);
  });
  window.addEventListener('keyup', (event) => keys.delete(keyName(event)));
  window.addEventListener('blur', () => keys.clear());
  canvas.addEventListener('mousemove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (event.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (event.clientY - rect.top) * (canvas.height / rect.height);
  });
  canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) {
      mouse.down = true;
      mouse.clicked = true;
    }
  });
  window.addEventListener('mouseup', () => { mouse.down = false; });

  return {
    keys,
    mouse,
    down(...names) {
      return names.some((n) => keys.has(n));
    },
    /** True once, on the frame the key went down. */
    wasPressed(name) {
      return pressed.has(name);
    },
    /** Clear per-frame edge state; call once per frame after the update. */
    endFrame() {
      pressed.clear();
      mouse.clicked = false;
    },
  };
}
