/**
 * End-to-end smoke test for the chat, driven over the Chrome DevTools Protocol.
 *
 *   node scripts/smoke-chat.cjs
 *
 * Requires the exported site being served (scripts/serve-dist.js) and Chrome
 * started with --remote-debugging-port=9223. Exits 0 when every step passes.
 */
const PORT = 9223;
const BASE = 'http://127.0.0.1:8090';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.console = [];
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') {
        const detail = `EXCEPTION ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`;
        this.console.push(detail);
        console.log(`[browser] ${detail}`);
      }
      if (message.method === 'Runtime.consoleAPICalled') {
        const detail = `CONSOLE.${message.params.type} ${message.params.args
          .map((arg) => arg.value ?? arg.description ?? '')
          .join(' ')}`;
        this.console.push(detail);
        console.log(`[browser] ${detail}`);
      }
      const waiter = message.id ? this.pending.get(message.id) : null;
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
}

async function connect() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      const page = targets.find((target) => target.type === 'page');
      if (page) return page;
    } catch {
      // Chrome not up yet.
    }
    await sleep(500);
  }
  throw new Error('Chrome DevTools endpoint never came up');
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(
      `evaluation failed: ${result.exceptionDetails.exception?.description ?? result.exceptionDetails.text}`,
    );
  }
  return result.result.value;
}

async function bodyText(cdp) {
  return evaluate(cdp, 'document.body.innerText');
}

async function waitFor(cdp, predicate, label, timeoutMs = 8000) {
  const startedAt = Date.now();
  for (;;) {
    const text = await bodyText(cdp);
    if (predicate(text)) return text;
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`timed out waiting for ${label}. Page text:\n${text.slice(0, 800)}`);
    }
    await sleep(250);
  }
}

/** Poll a DOM selector so navigation is confirmed structurally, not by copy. */
async function waitForDom(cdp, selector, label, timeoutMs = 8000) {
  const expression = `Boolean(document.querySelector(${JSON.stringify(selector)}))`;
  const startedAt = Date.now();
  for (;;) {
    if (await evaluate(cdp, expression)) return;
    if (Date.now() - startedAt > timeoutMs) {
      const where = await evaluate(cdp, 'location.pathname');
      const text = await bodyText(cdp);
      throw new Error(
        `timed out waiting for ${label} (selector ${selector}) on ${where}. Page text:\n${text.slice(0, 600)}`,
      );
    }
    await sleep(250);
  }
}

/**
 * Type into a React-controlled field: focus it, clear it through the native
 * value setter, then let CDP insert the text so React sees a real input event.
 */
async function typeInto(cdp, placeholder, value) {
  const found = await evaluate(
    cdp,
    `(() => {
      const field = [...document.querySelectorAll('input, textarea')].find(
        (el) => el.placeholder === ${JSON.stringify(placeholder)},
      );
      if (!field) return false;
      const proto =
        field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, '');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      field.focus();
      return true;
    })()`,
  );
  if (!found) {
    throw new Error(`no field with placeholder "${placeholder}"`);
  }
  // Type like a user would: one character at a time through the input domain.
  for (const character of value) {
    await cdp.send('Input.dispatchKeyEvent', {
      type: 'char',
      text: character,
      key: character,
    });
  }
  const typed = await evaluate(
    cdp,
    `(() => {
      const field = [...document.querySelectorAll('input, textarea')].find(
        (el) => el.placeholder === ${JSON.stringify(placeholder)},
      );
      // Belt and braces: make sure React was notified of the final value.
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return field.value;
    })()`,
  );
  if (typed !== value) {
    throw new Error(`typing into "${placeholder}" left value ${JSON.stringify(typed)}`);
  }
  return typed;
}

/** Set a React-controlled input value and notify React. */
const TYPE_SCRIPT = (placeholder, value) => `
  (() => {
    const field = [...document.querySelectorAll('input, textarea')].find(
      (el) => el.placeholder === ${JSON.stringify(placeholder)},
    );
    if (!field) return 'missing-field';
    const proto = field.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
    return 'typed';
  })()
`;

const CLICK_BY_LABEL = (label) => `
  (() => {
    const target = [...document.querySelectorAll('[aria-label]')].find(
      (el) => el.getAttribute('aria-label') === ${JSON.stringify(label)},
    );
    if (!target) return 'missing-target';
    target.click();
    return 'clicked';
  })()
`;

const CLICK_BY_TEXT = (text) => `
  (() => {
    const target = [...document.querySelectorAll('button, [role="button"], span, div')].find(
      (el) => (el.textContent || '').trim() === ${JSON.stringify(text)},
    );
    if (!target) return 'missing-target';
    target.click();
    return 'clicked';
  })()
`;

async function main() {
  const failures = [];
  const check = (name, ok, detail = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
    if (!ok) failures.push(name);
  };

  const page = await connect();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  const cdp = new CDP(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  // Geolocation permission has to be granted on the browser-level target.
  const version = await fetch(`http://127.0.0.1:${PORT}/json/version`).then((r) => r.json());
  const browserWs = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve) => browserWs.addEventListener('open', resolve));
  const browserCdp = new CDP(browserWs);
  await browserCdp
    .send('Browser.grantPermissions', { permissions: ['geolocation'], origin: BASE })
    .catch((error) => console.warn(`grant permissions: ${error.message}`));

  await cdp.send('Emulation.setGeolocationOverride', {
    latitude: -24.653,
    longitude: 25.915,
    accuracy: 12,
  });

  // 1 ── Messages list
  await cdp.send('Page.navigate', { url: `${BASE}/chat` });
  await waitFor(cdp, (text) => text.includes('Messages'), 'the Messages screen');
  let text = await bodyText(cdp);
  check('Messages screen renders', text.includes('Neighbourhood'), text.slice(0, 300));

  // 2 ── Start a direct thread
  await typeInto(cdp, 'Who are you messaging?', 'Test neighbour');
  const startResult = await evaluate(cdp, CLICK_BY_LABEL('Start'));
  check('Start chat button clicked', startResult === 'clicked', startResult);
  await waitForDom(cdp, 'input[placeholder="Message"]', 'the thread composer');

  // 3 ── Send a text message
  await typeInto(cdp, 'Message', 'Hello from the smoke test');
  const clicked = await evaluate(cdp, CLICK_BY_LABEL('Send message'));
  if (clicked !== 'clicked') {
    console.log(`send button ${clicked}, falling back to Enter`);
    await evaluate(
      cdp,
      `(() => {
        const field = [...document.querySelectorAll('input, textarea')].find((el) => el.placeholder === 'Message');
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        return 'enter-sent';
      })()`,
    );
  }
  const afterSend = await waitFor(
    cdp,
    (t) => t.includes('Hello from the smoke test'),
    'the sent message',
  );
  check('Text message appears in the thread', afterSend.includes('Hello from the smoke test'));

  // 4 ── Share the current location
  console.log(await evaluate(cdp, CLICK_BY_LABEL('Share my location')));
  const afterShare = await waitFor(
    cdp,
    (t) => t.includes('My current location') || t.includes('could not read your location'),
    'the location message or an error notice',
  );
  check(
    'Location share produces a map card',
    afterShare.includes('My current location') && afterShare.includes('-24.65300'),
    afterShare.slice(0, 600),
  );
  check(
    'Location card says tap to open',
    afterShare.includes('tap to open'),
    afterShare.slice(0, 600),
  );

  // 5 ── Back to the list: the thread shows its newest message
  await evaluate(cdp, CLICK_BY_LABEL('Go back'));
  await waitFor(cdp, (t) => t.includes('New chat'), 'the thread list');
  text = await bodyText(cdp);
  check(
    'Thread list previews the last message',
    text.includes('You shared a location') && text.includes('Test neighbour'),
    text.slice(0, 600),
  );
  check('Community room still listed first', text.indexOf('Neighbourhood') < text.indexOf('Test neighbour'), text.slice(0, 300));

  ws.close();
  browserWs.close();
  if (failures.length > 0) {
    console.error(`\n${failures.length} check(s) failed: ${failures.join(', ')}`);
    process.exit(1);
  }
  console.log('\nAll chat smoke checks passed.');
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});