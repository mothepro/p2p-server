const path = require('path')

const production = process.argv.indexOf('-p') !== -1
const filename = `p2p-server${production ? '.min' : ''}.js`

module.exports = {
	devtool: 'source-map',
	entry: './lib/index.js',
	output: {
		filename,
		path: path.join(__dirname, '/dist')
	},
}