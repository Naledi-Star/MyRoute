/** Scratch: diagnose why the "Start" click does not navigate in the chat list. */
const PORT = 9223;
const BASE = 'http://127.0.0.1:8090';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.method === 'Runtime.exceptionThrown') {
        console.log(
          '[exception]',
          message.params.exceptionDetails.exception?.description ??
            message.params.exceptionDetails.text,
        );
      }
      if (message.method === 'Runtime.consoleAPICalled') {
        console.log(
          '[console]',
          message.params.type,
          message.params.args.map((a) => a.value ?? a.description ?? '').join(' '),
        );
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

async function main() {
  const targets = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
  const page = targets.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');

  const ev = async (expression) => {
    const res = await cdp.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description ?? res.exceptionDetails.text);
    }
    return res.result.value;
  };

  await cdp.send('Page.navigate', { url: `${BASE}/chat` });
  await sleep(3000);

  // A: does a plain click on a thread row navigate?
  console.log(
    'click community row:',
    await ev(`(() => {
      const el = [...document.querySelectorAll('[aria-label]')].find(a => a.getAttribute('aria-label') === 'Open chat with Neighbourhood');
      if (!el) return 'missing';
      el.click();
      return 'clicked';
    })()`),
  );
  await sleep(1500);
  console.log('pathname after row click:', await ev('location.pathname'));
  console.log(
    'message input present:',
    await ev(`Boolean(document.querySelector('input[placeholder="Message"]'))`),
  );

  // C: inside a thread, does typing + Send produce a bubble?
  await cdp.send('Page.navigate', { url: `${BASE}/thread?id=community&title=Neighbourhood` });
  await sleep(2500);
  console.log(
    'thread input present:',
    await ev(`Boolean(document.querySelector('input[placeholder="Message"]'))`),
  );
  console.log(
    'type message:',
    await ev(`(() => {
      const field = [...document.querySelectorAll('input')].find(i => i.placeholder === 'Message');
      if (!field) return 'missing';
      field.focus();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(field, 'Hello debug');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return 'set';
    })()`),
  );
  await sleep(400);
  console.log(
    'click send:',
    await ev(`(() => {
      const el = [...document.querySelectorAll('[aria-label]')].find(a => a.getAttribute('aria-label') === 'Send message');
      if (!el) return 'missing';
      el.click();
      return 'clicked';
    })()`),
  );
  await sleep(1200);
  console.log(
    'bubble present:',
    await ev(`document.body.innerText.includes('Hello debug')`),
  );
  console.log(
    'input cleared:',
    await ev(`document.querySelector('input[placeholder="Message"]').value === ''`),
  );

  // B: go back to the list and try typing + Start
  await cdp.send('Page.navigate', { url: `${BASE}/chat` });
  await sleep(2500);

  console.log(
    'type:',
    await ev(`(() => {
      const field = [...document.querySelectorAll('input')].find(i => i.placeholder === 'Who are you messaging?');
      if (!field) return 'missing';
      field.focus();
      const proto = HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, 'Test neighbour');
      field.dispatchEvent(new Event('input', { bubbles: true }));
      return 'set';
    })()`),
  );
  await sleep(500);
  console.log(
    'value after settle:',
    await ev(`document.querySelector('input[placeholder="Who are you messaging?"]').value`),
  );
  console.log(
    'click Start:',
    await ev(`(() => {
      const el = [...document.querySelectorAll('button, [role="button"], span, div')].find(e => (e.textContent||'').trim() === 'Start');
      if (!el) return 'missing';
      el.click();
      return 'clicked:' + el.tagName;
    })()`),
  );
  await sleep(2000);
  console.log('pathname after Start:', await ev('location.pathname'));
  console.log(
    'start input value now:',
    await ev(`document.querySelector('input[placeholder="Who are you messaging?"]')?.value ?? 'gone'`),
  );
  console.log(
    'message input present:',
    await ev(`Boolean(document.querySelector('input[placeholder="Message"]'))`),
  );

  ws.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
