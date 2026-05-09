export function renderSimulatorPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>RTO Call Console</title>
  <style>
    :root {
      --bg: #0b1020;
      --panel: #111a33;
      --card: #162347;
      --muted: #8da0cf;
      --text: #e8eeff;
      --accent: #27d6a4;
      --accent-2: #4aa8ff;
      --warn: #ffc857;
      --danger: #ff6b6b;
      --border: #2b3f76;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      font-family: ui-sans-serif, -apple-system, Segoe UI, Helvetica, Arial, sans-serif;
      color: var(--text);
      background: radial-gradient(circle at 20% 0%, #1b2a5a 0%, var(--bg) 55%);
      min-height: 100vh;
    }

    .wrap {
      width: min(1100px, 94vw);
      margin: 24px auto;
      display: grid;
      gap: 16px;
    }

    .panel {
      border: 1px solid var(--border);
      background: linear-gradient(180deg, rgba(255,255,255,0.03), rgba(255,255,255,0.01));
      border-radius: 14px;
      padding: 14px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 22px;
      letter-spacing: 0.3px;
    }

    .sub { color: var(--muted); margin: 0; font-size: 14px; }

    .row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    input {
      background: #0f1730;
      color: var(--text);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 10px 12px;
      min-width: 260px;
      font-size: 14px;
    }

    button {
      border: 0;
      border-radius: 10px;
      padding: 10px 12px;
      color: #04111a;
      background: var(--accent);
      font-weight: 700;
      cursor: pointer;
    }

    button.alt { background: var(--accent-2); color: #03152c; }
    button.warn { background: var(--warn); color: #3d2d00; }
    button.ghost {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
      font-weight: 600;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }

    th, td {
      border-bottom: 1px solid var(--border);
      text-align: left;
      padding: 10px 8px;
      vertical-align: top;
    }

    th { color: var(--muted); font-weight: 600; }

    .status {
      font-size: 13px;
      color: var(--muted);
      margin-top: 8px;
      white-space: pre-wrap;
    }

    .danger { color: var(--danger); }

    .result {
      display: grid;
      gap: 8px;
      font-size: 14px;
    }

    .kv {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 9px 10px;
      word-break: break-all;
    }

    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }

    .tiny {
      font-size: 12px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="panel">
      <h1>RTO Call Console</h1>
      <p class="sub">Local refinement UI to trigger LiveKit simulation calls from Shopify orders.</p>
    </section>

    <section class="panel">
      <div class="row">
        <input id="orderIdInput" placeholder="Enter order ID (e.g. 7435224252525)" />
        <button id="manualTriggerBtn">Trigger Simulation</button>
        <button class="alt" id="manualTriggerOpenBtn">Trigger + Open Meet</button>
        <button class="ghost" id="refreshBtn">Refresh Orders</button>
      </div>
      <div class="status" id="status">Ready</div>
    </section>

    <section class="panel">
      <div class="row" style="justify-content: space-between;">
        <h2 style="margin:0;font-size:16px;">Recent Orders</h2>
        <span class="tiny">Click "Sim Call" to dispatch room + token</span>
      </div>
      <div style="overflow:auto; margin-top: 8px;">
        <table>
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Phone</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="ordersBody"></tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h2 style="margin:0 0 10px;font-size:16px;">Latest Simulation Result</h2>
      <div class="result" id="result"></div>
      <div class="row" style="margin-top:10px;">
        <button class="alt" id="copyTokenBtn" disabled>Copy Token</button>
        <button class="warn" id="copyJoinBtn" disabled>Copy Join Instructions</button>
        <button class="ghost" id="openMeetBtn" disabled>Open Meet</button>
      </div>
    </section>
  </div>

  <script>
    const statusEl = document.getElementById('status');
    const ordersBody = document.getElementById('ordersBody');
    const resultEl = document.getElementById('result');
    const orderIdInput = document.getElementById('orderIdInput');
    const manualTriggerBtn = document.getElementById('manualTriggerBtn');
    const manualTriggerOpenBtn = document.getElementById('manualTriggerOpenBtn');
    const refreshBtn = document.getElementById('refreshBtn');
    const copyTokenBtn = document.getElementById('copyTokenBtn');
    const copyJoinBtn = document.getElementById('copyJoinBtn');
    const openMeetBtn = document.getElementById('openMeetBtn');

    let latest = null;
    let busy = false;

    function setStatus(text, isError) {
      statusEl.textContent = text;
      statusEl.className = isError ? 'status danger' : 'status';
    }

    function setBusyState(nextBusy) {
      busy = nextBusy;
      manualTriggerBtn.disabled = nextBusy;
      manualTriggerOpenBtn.disabled = nextBusy;
      refreshBtn.disabled = nextBusy;
    }

    async function copyText(text) {
      if (!navigator.clipboard || !navigator.clipboard.writeText) {
        throw new Error('Clipboard API unavailable in this browser context');
      }
      await navigator.clipboard.writeText(text);
    }

    function renderResult(data) {
      latest = data;
      resultEl.innerHTML = '';

      const rows = [
        ['Order ID', data.orderId],
        ['Room', data.roomName],
        ['Dispatch ID', data.dispatchId],
        ['LiveKit URL', data.livekitUrl],
        ['Meet URL', data.meetUrl],
        ['Identity', data.participantIdentity],
        ['Token', data.participantToken],
      ];

      for (const [k, v] of rows) {
        const div = document.createElement('div');
        div.className = 'kv';
        div.innerHTML = '<strong>' + k + ':</strong> <span class="mono">' + (v || '') + '</span>';
        resultEl.appendChild(div);
      }

      copyTokenBtn.disabled = false;
      copyJoinBtn.disabled = false;
      openMeetBtn.disabled = false;
    }

    async function triggerSimulation(orderId) {
      if (busy) return null;
      setBusyState(true);
      setStatus('Triggering simulation for order ' + orderId + ' ...');

      try {
        const res = await fetch('/webhooks/trigger-rto-sim?orderId=' + encodeURIComponent(orderId), {
          method: 'POST',
        });

        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error || 'Failed to trigger simulation');
        }

        renderResult(payload);
        setStatus('Simulation ready. Token copied/open actions are enabled.');
        return payload;
      } catch (err) {
        setStatus(String(err.message || err), true);
        return null;
      } finally {
        setBusyState(false);
      }
    }

    function renderOrders(orders) {
      ordersBody.innerHTML = '';

      const sortedOrders = [...orders].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

      for (const order of sortedOrders) {
        const tr = document.createElement('tr');
        tr.innerHTML =
          '<td><div><strong>' + order.orderName + '</strong></div><div class="tiny mono">' + order.orderId + '</div></td>' +
          '<td>' + (order.customerName || '-') + '</td>' +
          '<td class="mono">' + (order.customerPhone || '-') + '</td>' +
          '<td>' + new Date(order.createdAt).toLocaleString() + '</td>' +
          '<td class="row"><button data-order-id="' + order.orderId + '">Sim Call</button><button class="alt" data-open-order-id="' + order.orderId + '">Sim + Open</button></td>';

        const simBtn = tr.querySelector('button[data-order-id]');
        simBtn.addEventListener('click', () => {
          orderIdInput.value = order.orderId;
          triggerSimulation(order.orderId);
        });

        const simOpenBtn = tr.querySelector('button[data-open-order-id]');
        simOpenBtn.addEventListener('click', async () => {
          orderIdInput.value = order.orderId;
          const payload = await triggerSimulation(order.orderId);
          if (!payload) return;
          try {
            await copyText('LiveKit URL: ' + payload.livekitUrl + '\\nToken: ' + payload.participantToken);
          } catch (err) {
            setStatus('Simulation ready but copy failed: ' + String(err.message || err), true);
          }
          window.open(payload.meetUrl, '_blank', 'noopener,noreferrer');
          setStatus('Meet opened. LiveKit URL + token copied to clipboard.');
        });

        ordersBody.appendChild(tr);
      }
    }

    async function loadOrders() {
      setStatus('Loading recent orders ...');
      try {
        const res = await fetch('/webhooks/orders?limit=20');
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(payload.error || 'Failed to load orders');
        }

        renderOrders(payload.orders || []);
        setStatus('Orders loaded. Pick one and click Sim Call.');
      } catch (err) {
        setStatus(String(err.message || err), true);
      }
    }

    manualTriggerBtn.addEventListener('click', () => {
      const orderId = orderIdInput.value.trim();
      if (!orderId) {
        setStatus('Order ID is required', true);
        return;
      }
      triggerSimulation(orderId);
    });

    manualTriggerOpenBtn.addEventListener('click', async () => {
      const orderId = orderIdInput.value.trim();
      if (!orderId) {
        setStatus('Order ID is required', true);
        return;
      }

      const payload = await triggerSimulation(orderId);
      if (!payload) return;

      try {
        await copyText('LiveKit URL: ' + payload.livekitUrl + '\\nToken: ' + payload.participantToken);
      } catch (err) {
        setStatus('Simulation ready but copy failed: ' + String(err.message || err), true);
      }

      window.open(payload.meetUrl, '_blank', 'noopener,noreferrer');
      setStatus('Meet opened. LiveKit URL + token copied to clipboard.');
    });

    orderIdInput.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      manualTriggerBtn.click();
    });

    refreshBtn.addEventListener('click', loadOrders);

    copyTokenBtn.addEventListener('click', async () => {
      if (!latest) return;
      try {
        await copyText(latest.participantToken);
        setStatus('Token copied to clipboard.');
      } catch (err) {
        setStatus('Copy failed: ' + String(err.message || err), true);
      }
    });

    copyJoinBtn.addEventListener('click', async () => {
      if (!latest) return;
      const text = [
        'Meet URL: ' + latest.meetUrl,
        'LiveKit URL: ' + latest.livekitUrl,
        'Room: ' + latest.roomName,
        'Identity: ' + latest.participantIdentity,
        'Token: ' + latest.participantToken,
      ].join('\\n');
      try {
        await copyText(text);
        setStatus('Join instructions copied to clipboard.');
      } catch (err) {
        setStatus('Copy failed: ' + String(err.message || err), true);
      }
    });

    openMeetBtn.addEventListener('click', async () => {
      if (!latest) return;
      const text = [
        'LiveKit URL: ' + latest.livekitUrl,
        'Token: ' + latest.participantToken,
      ].join('\\n');
      try {
        await copyText(text);
      } catch (err) {
        setStatus('Meet opened but copy failed: ' + String(err.message || err), true);
      }
      window.open(latest.meetUrl, '_blank', 'noopener,noreferrer');
      setStatus('Meet opened in new tab and join credentials copied.');
    });

    loadOrders();
  </script>
</body>
</html>`;
}
