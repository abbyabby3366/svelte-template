import { config } from '$lib/config';

export async function load() {
	return {
		whatsappServerUrl: config.whatsapp.serverUrl
	};
}
