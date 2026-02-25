import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

import { config } from '$lib/config';

// WhatsApp server configuration
const WHATSAPP_SERVER_URL = config.whatsapp.serverUrl;

// Helper function to make requests to WhatsApp server
async function makeWhatsAppRequest(endpoint: string, options: RequestInit = {}) {
	try {
		const url = `${WHATSAPP_SERVER_URL}${endpoint}`;
		const response = await fetch(url, {
			...options,
			headers: {
				'Content-Type': 'application/json',
				...options.headers
			}
		});

		if (!response.ok) {
			throw new Error(`WhatsApp server responded with status: ${response.status}`);
		}

		return await response.json();
	} catch (error: unknown) {
		console.error('Error communicating with WhatsApp server:', (error as Error).message);
		throw error;
	}
}

// Get WhatsApp status
export const GET: RequestHandler = async () => {
	try {
		const data = await makeWhatsAppRequest('/whatsapp-status');
		return json(data);
	} catch (error: unknown) {
		console.error('Error fetching WhatsApp status:', (error as Error).message);
		// Return 200 with "starting" status — this is expected during cold starts
		// The WhatsApp server may still be booting up inside the same container
		return json({
			success: false,
			error: 'WhatsApp server is starting up, please wait...',
			status: 'starting',
			clientInfo: {
				isConnected: false,
				isAuthenticated: false,
				phoneNumber: null
			},
			qrCode: null,
			canStart: true,
			canStop: false,
			canDeleteAuth: false,
			authExists: false,
			timestamp: new Date().toISOString()
		});
	}
};

// Reinitialize WhatsApp client
export const POST: RequestHandler = async () => {
	try {
		const data = await makeWhatsAppRequest('/reinitialize', {
			method: 'POST'
		});

		return json(data);
	} catch (error) {
		console.error('Error reinitializing WhatsApp client:', error);
		return json(
			{
				success: false,
				error: 'Failed to reinitialize WhatsApp client'
			},
			{ status: 500 }
		);
	}
};
