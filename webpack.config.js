const path = require('path');

module.exports = {
	entry: './viewer-src/main.js',
	output: {
		filename: 'viewer-main.js',
		path: path.resolve(__dirname, 'out'),
	},
	mode: "development",
	performance: {
		hints: false,
	},
};
