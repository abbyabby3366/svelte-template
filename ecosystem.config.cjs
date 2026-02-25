module.exports = {
	apps: [
		{
			// WhatsApp server starts FIRST (no delay)
			name: 'whatsapp-server',
			script: 'node',
			cwd: './whatsapp-server',
			args: 'whatsapp-server.js',
			env_file: './.env',
			env: {
				WHATSAPP_SERVER_PORT: process.env.WHATSAPP_SERVER_PORT || 3182
			}
		},
		{
			// SvelteKit starts AFTER WhatsApp server with a 3s delay
			// This gives the WA server time to bind its port before
			// SvelteKit starts accepting traffic and proxying to it
			name: 'svelte-template',
			script: 'node',
			args: 'build/index.js',
			env_file: '.env',
			wait_ready: false,
			restart_delay: 3000,
			// Cloud Run injects PORT env var (default 8080)
			// For local dev, this falls back to 8212
			env: {
				PORT: process.env.PORT || 8212
			}
		}
	]
};
