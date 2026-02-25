<script>
	import { onMount, onDestroy } from 'svelte';

	let status = $state('Loading...');
	let statusClass = $state('status-connecting');
	let clientInfo = $state(null);
	let qrCode = $state(null);
	let actionResponse = $state('');
	let showActionResponse = $state(false);
	let showQr = $state(false);
	let qrImageUrl = $state('');
	let qrImageLoaded = $state(false);
	let qrImageError = $state(false);
	let pairingPhone = $state('');
	let pairingResponse = $state('');
	let showPairingResponse = $state(false);
	let msgPhone = $state('');
	let msgContent = $state('');
	let messageResponse = $state('');
	let showMessageResponse = $state(false);
	let canStart = $state(true);
	let canStop = $state(false);
	let canDeleteAuth = $state(false);

	let pollInterval;

	// All API calls go through the SvelteKit proxy at /api/whatsapp/*
	async function apiCall(endpoint, method = 'GET', body = null) {
		showActionResponse = true;
		actionResponse = `Calling ${endpoint}...`;

		try {
			const options = {
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
		} catch (error) {
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
		} catch (e) {
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
		} catch (e) {
			messageResponse = 'Error: ' + e.message;
		}
	}

	onMount(() => {
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
		</div>
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
</style>
