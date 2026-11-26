// Keyboard state: held keys for the flight controls, one-shot presses for gear, mute, start and pause.

const heldKeys = new Set();
const pressedKeys = [];
let firstInputHandler = null;

const CAPTURED_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'KeyQ', 'KeyE', 'KeyG', 'KeyB', 'KeyM', 'KeyP', 'Comma', 'Period', 'Enter',
]);

function initKeyboard(onFirstInput) {
  firstInputHandler = onFirstInput;
  window.addEventListener('keydown', (e) => {
    if (CAPTURED_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) pressedKeys.push(e.code);
    heldKeys.add(e.code);
    notifyFirstInput();
  });
  window.addEventListener('keyup', (e) => heldKeys.delete(e.code));
  window.addEventListener('blur', () => heldKeys.clear());
  window.addEventListener('pointerdown', notifyFirstInput);
}

function notifyFirstInput() {
  if (firstInputHandler) {
    const handler = firstInputHandler;
    firstInputHandler = null;
    handler();
  }
}

function isHeld(...codes) {
  return codes.some((c) => heldKeys.has(c));
}

function takeKeyPress(code) {
  const i = pressedKeys.indexOf(code);
  if (i === -1) return false;
  pressedKeys.splice(i, 1);
  return true;
}

function clearKeyPresses() {
  pressedKeys.length = 0;
}

// Arrows or WASD fly the plane (down/S pulls the nose up), Q/E is rudder,
// Shift or . adds throttle and Ctrl or , takes it off, B holds the brakes.
function readPilotControls() {
  const axis = (pos, neg) => (isHeld(...pos) ? 1 : 0) - (isHeld(...neg) ? 1 : 0);
  return {
    pitch: axis(['ArrowDown', 'KeyS'], ['ArrowUp', 'KeyW']),
    roll: axis(['ArrowRight', 'KeyD'], ['ArrowLeft', 'KeyA']),
    yaw: axis(['KeyE'], ['KeyQ']),
    throttleDelta: axis(['ShiftLeft', 'ShiftRight', 'Period'], ['ControlLeft', 'ControlRight', 'Comma']),
    brakes: isHeld('KeyB', 'Space'),
  };
}
