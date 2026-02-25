module.exports = {
	apps: [
		{
			name: 'svelte-template',
			script: 'node',
			args: 'build/index.js',
			env_file: '.env',
			// Cloud Run injects PORT env var (default 8080)
			// For local dev, this falls back to 8212
			env: {
				PORT: process.env.PORT || 8212
			}
		},
		{
			name: 'whatsapp-server',
			script: 'node',
			cwd: './whatsapp-server',
			args: 'whatsapp-server.js',
			env_file: './.env',
			env: {
				WHATSAPP_SERVER_PORT: process.env.WHATSAPP_SERVER_PORT || 3182
			}
		}
	]
};
