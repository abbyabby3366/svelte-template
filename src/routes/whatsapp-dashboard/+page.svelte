<script lang="ts">
	import { onMount, onDestroy } from 'svelte';

	interface ClientInfo {
		isConnected: boolean;
		isAuthenticated: boolean;
		phoneNumber: string | null;
	}

	let status = $state('Loading...');
	let statusClass = $state('status-connecting');
	let clientInfo = $state<ClientInfo | null>(null);
	let qrCode = $state<string | null>(null);
	let actionResponse = $state('');
	let showActionResponse = $state(false);
	let showQr = $state(false);
	let qrImageUrl = $state('');
	let qrImageLoaded = $state(false);
	let qrImageError = $state(false);
	let pairingPhone = $state('');
	let pairingResponse = $state('');
	let showPairingResponse = $state(false);
	let msgPhone = $state('60122273341');
	let msgContent = $state('');
	let messageResponse = $state('');
	let showMessageResponse = $state(false);
	let groupList = $state<any[]>([]);
	let showGroups = $state(false);
	let groupResponse = $state('');
	let baseUrl = $state('https://your-domain.com');
	let canStart = $state(true);
	let canStop = $state(false);
	let canDeleteAuth = $state(false);

	let pollInterval: ReturnType<typeof setInterval> | undefined;

	// All API calls go through the SvelteKit proxy at /api/whatsapp/*
	async function apiCall(endpoint: string, method = 'GET', body: any = null) {
		showActionResponse = true;
		actionResponse = `Calling ${endpoint}...`;

		try {
			const options: RequestInit = {
				method,
				headers: { 'Content-Type': 'application/json' }
			};
			if (body) options.body = JSON.stringify(body);

			const res = await fetch(endpoint, options);
			const data = await res.json();

			actionResponse = `${method} ${endpoint}\nStatus: ${res.status}\nResponse: ${JSON.stringify(data, null, 2)}`;

			if (method !== 'GET') {
				setTimeout(refreshStatus, 1000);
			}

			return data;
		} catch (error: any) {
			actionResponse = `Error: ${error.message}`;
			return null;
		}
	}

	async function refreshStatus() {
		try {
			const res = await fetch('/api/whatsapp/status');
			const data = await res.json();

			status = data.status || 'unknown';
			statusClass =
				data.status === 'connected'
					? 'status-connected'
					: data.status === 'disconnected' || data.status === 'stopped'
						? 'status-disconnected'
						: 'status-connecting';

			clientInfo = data.clientInfo || null;
			canStart = data.canStart ?? true;
			canStop = data.canStop ?? false;
			canDeleteAuth = data.canDeleteAuth ?? false;

			if (data.qrCode) {
				qrCode = data.qrCode;
				showQr = true;
				qrImageLoaded = false;
				qrImageError = false;
				qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(data.qrCode)}`;
			} else {
				showQr = false;
				qrCode = null;
			}
		} catch (error) {
			console.error('Failed to fetch status', error);
			status = 'Error fetching status';
		}
	}

	function startWhatsapp() {
		apiCall('/api/whatsapp/start-whatsapp', 'POST');
	}

	function stopWhatsapp() {
		apiCall('/api/whatsapp/stop-whatsapp', 'POST');
	}

	function deleteAuth() {
		if (confirm('Are you sure? This will delete the session and you will need to scan QR again.')) {
			apiCall('/api/whatsapp/delete-auth', 'POST');
		}
	}

	async function requestPairingCode() {
		if (!pairingPhone) {
			alert('Please enter phone number');
			return;
		}

		showPairingResponse = true;
		pairingResponse = 'Requesting...';

		try {
			const res = await fetch('/api/whatsapp/request-pairing-code', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phoneNumber: pairingPhone })
			});
			const data = await res.json();
			pairingResponse = JSON.stringify(data, null, 2);
		} catch (e: any) {
			pairingResponse = 'Error: ' + e.message;
		}
	}

	async function sendMessage() {
		if (!msgPhone || !msgContent) {
			alert('Please enter phone and message');
			return;
		}

		showMessageResponse = true;
		messageResponse = 'Sending...';

		try {
			const res = await fetch('/api/whatsapp/send-message', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ phoneNumber: msgPhone, message: msgContent })
			});
			const data = await res.json();
			messageResponse = JSON.stringify(data, null, 2);
		} catch (e: any) {
			messageResponse = 'Error: ' + e.message;
		}
	}

	async function fetchGroups() {
		showGroups = true;
		groupResponse = 'Fetching groups...';
		groupList = [];

		try {
			const res = await fetch('/api/whatsapp/get-groups');
			const data = await res.json();
			if (data.success) {
				groupList = data.groups || [];
				groupResponse = `Found ${groupList.length} groups.`;
			} else {
				groupResponse = 'Error: ' + data.error;
			}
		} catch (e: any) {
			groupResponse = 'Error: ' + e.message;
		}
	}

	onMount(() => {
		baseUrl = window.location.origin;
		refreshStatus();
		pollInterval = setInterval(refreshStatus, 5000);
	});

	onDestroy(() => {
		if (pollInterval) clearInterval(pollInterval);
	});
</script>

<svelte:head>
	<title>WhatsApp Server Dashboard</title>
</svelte:head>

<div class="wa-dashboard">
	<h1>WhatsApp Server Dashboard</h1>

	<div class="card">
		<h2>Status</h2>
		<div class="status-row">
			<span>Status:</span>
			<span class="status-badge {statusClass}">{status}</span>
		</div>

		{#if clientInfo}
			<div class="status-row">
				<span>Connected:</span>
				<span>{clientInfo.isConnected}</span>
			</div>
			{#if clientInfo.phoneNumber}
				<div class="status-row">
					<span>Phone:</span>
					<span>{clientInfo.phoneNumber}</span>
				</div>
			{/if}
		{/if}

		{#if showQr}
			<div class="qr-section">
				<h3>WhatsApp QR Code</h3>
				<p>Scan this QR code with your WhatsApp mobile app to authenticate:</p>
				<div class="qr-image-container">
					{#if !qrImageLoaded && !qrImageError}
						<p>Generating QR code...</p>
					{/if}
					{#if qrImageError}
						<p class="error-text">Failed to generate QR code image</p>
					{/if}
					<img
						src={qrImageUrl}
						alt="QR Code"
						class="qr-image"
						class:hidden={!qrImageLoaded}
						onload={() => (qrImageLoaded = true)}
						onerror={() => (qrImageError = true)}
					/>
				</div>
				<details>
					<summary>Show QR Code Data (for manual generation)</summary>
					<textarea rows="3" readonly value={qrCode}></textarea>
				</details>
			</div>
		{/if}

		<div class="button-row">
			<button onclick={startWhatsapp} class="btn-success" disabled={!canStart}>
				Start WhatsApp
			</button>
			<button onclick={stopWhatsapp} class="btn-danger" disabled={!canStop}> Stop WhatsApp </button>
			<button onclick={deleteAuth} class="btn-danger" disabled={!canDeleteAuth}>
				Delete Auth
			</button>
			<button onclick={refreshStatus} class="btn-primary">Refresh Status</button>
		</div>

		{#if showActionResponse}
			<div class="response-area">{actionResponse}</div>
		{/if}
	</div>

	<div class="grid">
		<div class="card">
			<h3>Pairing Code</h3>
			<p>Use this if you can't scan the QR code.</p>
			<input type="text" bind:value={pairingPhone} placeholder="Phone Number (e.g., 60123456789)" />
			<button onclick={requestPairingCode} class="btn-primary">Get Pairing Code</button>
			{#if showPairingResponse}
				<div class="response-area">{pairingResponse}</div>
			{/if}
		</div>

		<div class="card">
			<h3>Test Message</h3>
			<input type="text" bind:value={msgPhone} placeholder="Phone Number (e.g., 60123456789)" />
			<textarea bind:value={msgContent} rows="3" placeholder="Hello from server test!"></textarea>
			<button onclick={sendMessage} class="btn-primary">Send Message</button>
			{#if showMessageResponse}
				<div class="response-area">{messageResponse}</div>
			{/if}

			<div class="api-documentation">
				<hr />
				<h4>API Integration</h4>
				<p>
					You can send messages programmatically using this endpoint. It supports both raw numbers
					(e.g., 6012...) and full WhatsApp IDs (including Group JIDs).
				</p>
				<div class="endpoint">
					<span class="method">POST</span>
					<code>{baseUrl}/api/whatsapp/send-message</code>
				</div>

				<h5>Example CURL (to Phone)</h5>
				<pre class="code-block">curl -X POST {baseUrl}/api/whatsapp/send-message \
  -H "Content-Type: application/json" \
  -d '{`{`}
  "phoneNumber": "60122273341",
  "message": "Hello from API!"
{`}`}'</pre>

				<h5>Example CURL (to Group)</h5>
				<pre class="code-block">curl -X POST {baseUrl}/api/whatsapp/send-message \
  -H "Content-Type: application/json" \
  -d '{`{`}
  "phoneNumber": "123456789012345678@g.us",
  "message": "Hello Group!"
{`}`}'</pre>

				<hr />
				<h4>Get Groups</h4>
				<p>Retrieve all participating groups and their IDs:</p>
				<div class="endpoint">
					<span class="method">GET</span>
					<code>{baseUrl}/api/whatsapp/get-groups</code>
				</div>
			</div>
		</div>
	</div>

	<div class="card" style="margin-top: 20px;">
		<h3>WhatsApp Groups</h3>
		<p>List all groups your account is currently in to get their JIDs.</p>
		<button onclick={fetchGroups} class="btn-primary" disabled={!clientInfo?.isConnected}>
			Fetch My Groups
		</button>

		{#if showGroups}
			<div class="response-area" style="max-height: 400px;">
				<p style="margin-bottom: 10px; font-weight: bold;">{groupResponse}</p>
				{#if groupList.length > 0}
					<table class="groups-table">
						<thead>
							<tr>
								<th>Group Name</th>
								<th>JID (Group ID)</th>
								<th>Action</th>
							</tr>
						</thead>
						<tbody>
							{#each groupList as group}
								<tr>
									<td>{group.subject}</td>
									<td><code>{group.id}</code></td>
									<td>
										<button
											class="btn-small"
											onclick={() => {
												msgPhone = group.id;
												document.getElementById('msg-content')?.focus();
											}}
										>
											Use ID
										</button>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.wa-dashboard {
		font-family:
			-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
		max-width: 800px;
		margin: 0 auto;
		padding: 20px;
		line-height: 1.6;
		color: #333;
	}

	h1,
	h2,
	h3 {
		color: #2c3e50;
	}

	.card {
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 20px;
		margin-bottom: 20px;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
	}

	.status-row {
		margin: 4px 0;
	}

	.status-badge {
		display: inline-block;
		padding: 4px 8px;
		border-radius: 4px;
		font-weight: bold;
		text-transform: uppercase;
		font-size: 0.9em;
	}

	.status-connected {
		background-color: #d4edda;
		color: #155724;
	}
	.status-disconnected {
		background-color: #f8d7da;
		color: #721c24;
	}
	.status-connecting {
		background-color: #fff3cd;
		color: #856404;
	}

	button {
		cursor: pointer;
		padding: 8px 16px;
		border-radius: 4px;
		border: none;
		font-size: 14px;
		margin-right: 8px;
		margin-bottom: 8px;
		transition: opacity 0.2s;
	}
	button:hover {
		opacity: 0.9;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn-primary {
		background-color: #007bff;
		color: white;
	}
	.btn-success {
		background-color: #28a745;
		color: white;
	}
	.btn-danger {
		background-color: #dc3545;
		color: white;
	}

	input,
	textarea {
		width: 100%;
		padding: 8px;
		margin-bottom: 10px;
		border: 1px solid #ddd;
		border-radius: 4px;
		box-sizing: border-box;
	}

	.response-area {
		background-color: #f8f9fa;
		border: 1px solid #e9ecef;
		border-radius: 4px;
		padding: 10px;
		font-family: monospace;
		white-space: pre-wrap;
		margin-top: 10px;
		max-height: 200px;
		overflow-y: auto;
		font-size: 12px;
	}

	.grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
	}

	@media (max-width: 600px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}

	.button-row {
		margin-top: 20px;
	}

	.qr-section {
		margin-top: 15px;
	}

	.qr-image-container {
		margin: 15px 0;
		text-align: center;
	}

	.qr-image {
		max-width: 256px;
		border: 2px solid #ddd;
		border-radius: 8px;
	}

	.hidden {
		display: none;
	}

	.error-text {
		color: #dc3545;
	}

	details {
		margin-top: 10px;
	}
	summary {
		cursor: pointer;
		color: #666;
	}

	.api-documentation {
		margin-top: 20px;
		font-size: 0.9rem;
	}

	.api-documentation hr {
		border: 0;
		border-top: 1px solid #eee;
		margin: 20px 0;
	}

	.api-documentation h4 {
		margin: 0 0 10px 0;
		color: #555;
		font-size: 1rem;
	}

	.api-documentation h5 {
		margin: 15px 0 8px 0;
		color: #777;
		font-size: 0.85rem;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.endpoint {
		background: #f1f3f5;
		padding: 8px 12px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.method {
		background: #4dabf7;
		color: white;
		padding: 2px 6px;
		border-radius: 4px;
		font-weight: bold;
		font-size: 0.75rem;
	}

	.code-block {
		background: #212529;
		color: #f8f9fa;
		padding: 15px;
		border-radius: 8px;
		font-family: 'Fira Code', 'Courier New', Courier, monospace;
		font-size: 0.8rem;
		line-height: 1.4;
		overflow-x: auto;
		border: 1px solid #343a40;
		margin-bottom: 10px;
	}

	.groups-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 13px;
	}

	.groups-table th,
	.groups-table td {
		text-align: left;
		padding: 8px;
		border-bottom: 1px solid #eee;
	}

	.groups-table th {
		color: #666;
		text-transform: uppercase;
		font-size: 11px;
	}

	.btn-small {
		padding: 4px 8px;
		font-size: 12px;
		margin: 0;
		background-color: #f1f3f5;
		color: #333;
		border: 1px solid #dee2e6;
	}

	.btn-small:hover {
		background-color: #e9ecef;
	}
</style>
