import express from 'express';
import makeWASocket, { DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { useRedisAuthStateWithHSet, deleteHSetKeys } from 'baileys-redis-auth';
import Redis from 'ioredis';
import { Boom } from '@hapi/boom';
import path from 'path';
import { fileURLToPath } from 'url';
import qrcode from 'qrcode-terminal';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from parent directory .env file
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.WHATSAPP_SERVER_PORT || 3182;

console.log('Port:', PORT);

// CORS middleware
app.use((req, res, next) => {
	res.header('Access-Control-Allow-Origin', '*');
	res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.header(
		'Access-Control-Allow-Headers',
		'Origin, X-Requested-With, Content-Type, Accept, Authorization'
	);

	if (req.method === 'OPTIONS') {
		res.sendStatus(200);
	} else {
		next();
	}
});

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Serve index.html at root
app.get('/', (req, res) => {
	res.sendFile(path.join(__dirname, 'index.html'));
});

// Store WhatsApp client status
let whatsappStatus = 'disconnected';
let qrCode = null;
let pairingCode = null;
let clientInfo = {
	isConnected: false,
	isAuthenticated: false,
	phoneNumber: null
};
let sock = null;

// Initialize WhatsApp socket with Baileys using Redis Auth
async function initializeWhatsApp() {
	const redisOptions = {
		host: process.env.REDIS_HOST,
		port: parseInt(process.env.REDIS_PORT),
		password: process.env.REDIS_PASSWORD
	};

	console.log(`🔌 Connecting to Redis at ${redisOptions.host}:${redisOptions.port}...`);

	const {
		state,
		saveCreds,
		redis: authRedisInstance
	} = await useRedisAuthStateWithHSet(redisOptions, process.env.BAILEYS_AUTH_ID, console.log);

	console.log(`✅ Redis connected. Using session ID: ${process.env.BAILEYS_AUTH_ID}`);

	// Fetch latest Baileys version
	const { version, isLatest } = await fetchLatestBaileysVersion();
	console.log(`Using WhatsApp version: ${version.join('.')}, isLatest: ${isLatest}`);

	sock = makeWASocket({
		auth: state,
		version,
		printQRInTerminal: false
	});

	// Save credentials when they update
	sock.ev.on('creds.update', saveCreds);

	// Store redis instance on sock for later use
	sock.authRedis = authRedisInstance;

	return sock;
}

// WhatsApp socket events
function setupEventHandlers(socket) {
	socket.ev.on('connection.update', (update) => {
		const { connection, lastDisconnect, qr } = update;

		if (qr) {
			console.log('🔐 QR Code received - scan with WhatsApp to authenticate');
			qrcode.generate(qr, { small: true });
			console.log('🔍 QR Code data length:', qr.length);
			whatsappStatus = 'qr_ready';
			qrCode = qr;
			pairingCode = null;
			console.log('💾 QR Code stored in variable:', qrCode ? 'YES' : 'NO');
		}

		if (connection === 'close') {
			const statusCode =
				lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.data?.attrs?.code;
			const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

			console.log(`🔌 WhatsApp client disconnected. Status Code: ${statusCode}`);

			if (shouldReconnect) {
				console.log('🔄 Attempting to reconnect in 5 seconds...');
				whatsappStatus = 'reconnecting';
				setTimeout(async () => {
					try {
						const newSock = await initializeWhatsApp();
						setupEventHandlers(newSock);
					} catch (err) {
						console.error('❌ Failed to reconnect:', err.message);
						whatsappStatus = 'error';
					}
				}, 5000);
			} else {
				console.log('🚪 Logged out or session invalid. Please scan QR code again.');
				whatsappStatus = 'disconnected';
			}

			qrCode = null;
			pairingCode = null;
			clientInfo.isConnected = false;
			clientInfo.isAuthenticated = false;
			clientInfo.phoneNumber = null;

			// Cleanup Redis connection if it exists
			if (socket.authRedis) {
				console.log('🔌 Closing Redis connection on disconnect...');
				try {
					socket.authRedis.disconnect();
				} catch (e) {
					console.error('⚠️ Error closing Redis:', e.message);
				}
			}
		} else if (connection === 'open') {
			console.log('✅ WhatsApp client is connected and authenticated!');
			whatsappStatus = 'connected';
			qrCode = null;
			pairingCode = null;
			clientInfo.isConnected = true;
			clientInfo.isAuthenticated = true;
			clientInfo.phoneNumber = socket.user?.id?.split(':')[0] || socket.user?.id || null;
		}
	});

	socket.ev.on('creds.update', () => {
		console.log('🔑 Credentials updated');
	});
}

// WhatsApp is not started automatically - wait for user to press "Start WhatsApp" button
console.log('⏳ WhatsApp not started automatically. Use /start-whatsapp endpoint to begin.');

// Function to send WhatsApp message using Baileys
async function sendWhatsAppMessage(phoneNumber, message) {
	if (!sock || !clientInfo.isConnected) {
		return { success: false, error: 'WhatsApp socket not connected' };
	}

	try {
		// Validate phone number format
		const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
		if (cleanPhone.length < 10) {
			return { success: false, error: 'Invalid phone number format' };
		}

		// Format JID properly for Baileys (WhatsApp ID)
		const jid = cleanPhone.includes('@s.whatsapp.net')
			? cleanPhone
			: `${cleanPhone}@s.whatsapp.net`;

		// Send message using Baileys
		const result = await sock.sendMessage(jid, { text: message });

		console.log(`✅ Message sent successfully to ${phoneNumber}`);
		return {
			success: true,
			messageId: result.key.id,
			timestamp: new Date().toISOString()
		};
	} catch (error) {
		console.error(`❌ Error sending message to ${phoneNumber}:`, error.message);
		return {
			success: false,
			error: error.message || 'Failed to send message'
		};
	}
}

// API Routes - Only message sending functionality

// Get WhatsApp status
app.get('/whatsapp-status', (req, res) => {
	console.log('📡 Status endpoint called');
	console.log('🔍 Current status:', whatsappStatus);
	console.log('🔍 QR Code exists:', qrCode ? 'YES' : 'NO');
	console.log('🔍 QR Code length:', qrCode ? qrCode.length : 'null');
	console.log('🔍 Client info:', clientInfo);

	// Check if auth exists (configured in Redis)
	const authExists = !!process.env.BAILEYS_AUTH_ID;

	// Determine control states
	const canStart =
		!sock || ['disconnected', 'stopped', 'auth_deleted', 'error'].includes(whatsappStatus);
	const canStop =
		sock &&
		['connected', 'connecting', 'qr_ready', 'authenticated', 'reconnecting'].includes(
			whatsappStatus
		)
			? true
			: false;

	const responseData = {
		status: whatsappStatus,
		clientInfo,
		qrCode,
		pairingCode,
		canStart: canStart ? true : false,
		canStop: canStop === true ? true : false,
		canDeleteAuth: authExists ? true : false,
		authExists: authExists ? true : false,
		timestamp: new Date().toISOString()
	};

	console.log('📤 Sending response:', JSON.stringify(responseData, null, 2));

	res.json(responseData);
});

// Request pairing code
app.post('/request-pairing-code', async (req, res) => {
	try {
		const { phoneNumber } = req.body;

		if (!phoneNumber) {
			return res.status(400).json({
				success: false,
				error: 'Phone number is required'
			});
		}

		// Validate phone number format
		const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
		if (cleanPhone.length < 10) {
			return res.status(400).json({
				success: false,
				error: 'Invalid phone number format'
			});
		}

		if (!sock) {
			return res.status(500).json({
				success: false,
				error: 'WhatsApp socket not initialized'
			});
		}

		const code = await sock.requestPairingCode(cleanPhone);
		pairingCode = code;

		console.log(`🔢 Pairing code generated for ${phoneNumber}: ${code}`);

		res.json({
			success: true,
			pairingCode: code,
			message:
				'Pairing code generated. Enter this code in WhatsApp: Settings > Linked Devices > Link Device',
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('❌ Error requesting pairing code:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to generate pairing code'
		});
	}
});

// Send custom message
app.post('/send-message', async (req, res) => {
	try {
		const { phoneNumber, message } = req.body;

		if (!phoneNumber || !message) {
			return res.status(400).json({
				success: false,
				error: 'Phone number and message are required'
			});
		}

		const result = await sendWhatsAppMessage(phoneNumber, message);

		if (result.success) {
			res.json({
				success: true,
				message: 'Custom message sent successfully',
				messageId: result.messageId,
				timestamp: result.timestamp
			});
		} else {
			res.status(500).json({
				success: false,
				error: result.error
			});
		}
	} catch (error) {
		console.error('❌ Error in send-message endpoint:', error);
		res.status(500).json({
			success: false,
			error: 'Internal server error'
		});
	}
});

// Start WhatsApp connection
app.post('/start-whatsapp', async (req, res) => {
	try {
		// Check if WhatsApp is already started
		if (
			sock &&
			(whatsappStatus === 'connected' ||
				whatsappStatus === 'connecting' ||
				whatsappStatus === 'qr_ready')
		) {
			return res.status(400).json({
				success: false,
				error: 'WhatsApp is already started. Use /stop-whatsapp to stop it first.'
			});
		}

		console.log('🚀 Starting WhatsApp connection...');

		// Reset status before starting
		whatsappStatus = 'starting';
		qrCode = null;
		pairingCode = null;
		clientInfo = {
			isConnected: false,
			isAuthenticated: false,
			phoneNumber: null
		};

		// Initialize WhatsApp
		const newSock = await initializeWhatsApp();
		sock = newSock;
		setupEventHandlers(newSock);

		res.json({
			success: true,
			message: 'WhatsApp connection started. Check /whatsapp-status for QR code.',
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('❌ Error starting WhatsApp:', error);
		whatsappStatus = 'error';
		res.status(500).json({
			success: false,
			error: 'Failed to start WhatsApp connection'
		});
	}
});

// Stop WhatsApp connection
app.post('/stop-whatsapp', async (req, res) => {
	try {
		if (!sock) {
			return res.status(400).json({
				success: false,
				error: 'WhatsApp is not started'
			});
		}

		console.log('🛑 Stopping WhatsApp connection...');

		// Close the socket
		if (sock.ev) {
			sock.ev.removeAllListeners();
		}
		if (sock.ws) {
			sock.ws.close();
		}

		// Reset status
		whatsappStatus = 'stopped';
		qrCode = null;
		pairingCode = null;
		clientInfo = {
			isConnected: false,
			isAuthenticated: false,
			phoneNumber: null
		};
		sock = null;

		res.json({
			success: true,
			message: 'WhatsApp connection stopped successfully',
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('❌ Error stopping WhatsApp:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to stop WhatsApp connection'
		});
	}
});

// Delete auth folder (Clear Redis keys)
app.post('/delete-auth', async (req, res) => {
	try {
		console.log('🗑️ Deleting WhatsApp authentication from Redis...');

		// Stop WhatsApp if running
		if (sock) {
			console.log('🛑 Stopping WhatsApp before deleting auth...');
			try {
				if (sock.ev) {
					sock.ev.removeAllListeners();
				}
				if (sock.ws) {
					sock.ws.close();
				}

				// If we have the redis instance from the socket, use it
				if (sock.authRedis) {
					await deleteHSetKeys({
						redis: sock.authRedis,
						key: process.env.BAILEYS_AUTH_ID
					});
					console.log(
						`✅ HSet data for session '${process.env.BAILEYS_AUTH_ID}' deleted using socket redis instance.`
					);
				}
			} catch (err) {
				console.warn('⚠️ Error during socket cleanup:', err.message);
			}
			sock = null;
		} else {
			// If socket not active, create a temporary redis client to delete the keys
			const redisOptions = {
				host: process.env.REDIS_HOST,
				port: parseInt(process.env.REDIS_PORT),
				password: process.env.REDIS_PASSWORD
			};

			const tempRedis = new Redis(redisOptions);
			await deleteHSetKeys({
				redis: tempRedis,
				key: process.env.BAILEYS_AUTH_ID
			});
			tempRedis.disconnect();
			console.log(
				`✅ HSet data for session '${process.env.BAILEYS_AUTH_ID}' deleted using temporary redis client.`
			);
		}

		// Reset all status
		whatsappStatus = 'auth_deleted';
		qrCode = null;
		pairingCode = null;
		clientInfo = {
			isConnected: false,
			isAuthenticated: false,
			phoneNumber: null
		};

		res.json({
			success: true,
			message: 'Authentication data deleted from Redis successfully.',
			timestamp: new Date().toISOString()
		});
	} catch (error) {
		console.error('❌ Error deleting auth folder:', error);
		res.status(500).json({
			success: false,
			error: 'Failed to delete authentication data from Redis'
		});
	}
});

// Health check endpoint
app.get('/health', (req, res) => {
	res.json({
		status: 'healthy',
		whatsapp: whatsappStatus,
		timestamp: new Date().toISOString()
	});
});

// Start server
app.listen(PORT, () => {
	console.log(`🚀 WhatsApp server running on port ${PORT}`);
	console.log('📱 This server only handles WhatsApp message delivery');
	console.log('⚙️  All settings and templates are managed by the main Svelte app');
	console.log('🔗 Available endpoints:');
	console.log('   GET  /whatsapp-status - Check WhatsApp connection status and available actions');
	console.log('   POST /start-whatsapp - Start WhatsApp connection and get QR code');
	console.log('   POST /stop-whatsapp - Stop WhatsApp connection immediately');
	console.log('   POST /delete-auth - Delete authentication data (requires re-authentication)');
	console.log('   POST /request-pairing-code - Generate pairing code for authentication');
	console.log('   POST /send-message - Send custom messages');
	console.log('   GET  /health - Health check');
});
