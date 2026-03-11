import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

// WhatsApp server configuration
const WHATSAPP_SERVER_URL = process.env.WHATSAPP_SERVER_URL || 'http://localhost:3182';

export const GET: RequestHandler = async () => {
	try {
		const response = await fetch(`${WHATSAPP_SERVER_URL}/get-groups`);
		const data = await response.json();
		return json(data);
	} catch (error: any) {
		console.error('Error fetching WhatsApp groups:', error.message);
		return json(
			{
				success: false,
				error: 'Failed to connect to WhatsApp server'
			},
			{ status: 500 }
		);
	}
};
