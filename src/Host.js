import Peer from 'peerjs'
import Client from './Client'

export default class Host extends Client {
	/**
	 * Creates the Peer.
	 *
	 * @param {string} version version of top package, to make sure host and client are in sync.
	 * @param {string} hostID ID to use as the hosting peer.
	 * @param options for the Peer constructor.
	 * @override
	 */
	makePeer({
		version,
		options,
		hostID = Host.randomID(),
	}) {
		/**
		 * Hashmap of all active onConnection.
		 * @type {Object.<string, DataConnection>}
		 */
		this.peers = {}

		/**
		 * IDs of the connections
		 * @type {string[]}
		 */
		this.clientIDs = []

		/** @type {Peer} */
		this.peer = new Peer(hostID, options)
		this.peer.on('onReady', id => this.onReady(id))
		this.peer.on('connection', (c) => this.onConnection(c, version))
		this.peer.on('close', this.onDisconnect.bind(this))
		this.peer.on('error', this.errorHandler.bind(this))
		this.peer.on('destroy', this.onQuit.bind(this))
		this.log('ready')
	}

	/**
	 * Generate a short random id
	 * @returns {string} length is always 7
	 */
	static randomID() {
		let ret = (new Date).getTime()
		ret += Math.random()
		ret *= 100
		ret = Math.floor(ret).toString(36) // base 36
		return ret.substr(3, 7) // remove repetition
	}

	/**
	 * ID is generated.
	 * Wait for connections from clients.
	 *
	 * @param {string} id
	 * @override
	 */
	onReady(id) {}

	/**
	 * Someone attempts to connect to us.
	 *
	 * @param {DataConnection} client
	 * @param {string=} version
	 * @override
	 */
	onConnection(client, version = '0') {
		if(client.metadata.version !== version) {
			this.errorHandler(Error(`Version of client "${client.metadata.version}" doesn't match host "${version}".`))
			return
		}

		this.peers[client.id] = client
		this.clientIDs.push(client.id)

		client.on('open', this.onClientReady.bind(this, client))
		client.on('data', data => this.onReceive(client, data))
		client.on('close', this.onClientLeft.bind(this, client))
		client.on('error', this.errorHandler.bind(this))

		this.log('Connection from', client.id)
	}

	/**
	 * Emitted when the onConnection is ready to use.
	 *
	 * @param {DataConnection} client
	 */
	onClientReady(client) {
		this.log('listening to', client.id)
	}

	/**
	 * A client has left the game.
	 *
	 * @param {DataConnection} client
	 * @returns {boolean} whether the client was actually removed.
	 */
	onClientLeft(client) {
		this.log('closing with', client.id)
		const i = this.clientIDs.indexOf(client.id)

		if(i !== -1) {
			delete this.clientIDs[i]
			delete this.peers[client.id]
			return true
		}

		return false
	}

	/**
	 * Receive data from a client.
	 *
	 * @param {DataConnection} client
	 * @param data
	 * @override
	 */
	onReceive(client, data) {
		this.log('receiving', client.id, data)
	}

	/**
	 * Send data to someone.
	 *
	 * @param {DataConnection} peer
	 * @param data
	 * @param {DataConnection=} from the client which actually sent the message
	 * @override
	 */
	send(peer, data, from = peer) {
		peer.send({
			data,
			from: from.id,
		})
	}

	/**
	 * Send to all connections.
	 *
	 * @param data
	 */
	broadcast(data) {
		if(this.clientIDs.length === 0)
			return

		for(let client of this.clients)
			this.send(client, data)

		this.log('Broadcasting', data)
	}

	/**
	 * Send to all players except for one.
	 * Useful for forwarding data from peer.
	 *
	 * @param data
	 * @param {string|DataConnection} client
	 */
	forward(data, client) {
		if (typeof client === 'string') {
			client = this.peers[client]
		}

		const skip = this.clientIDs.indexOf(client.id)

		for(const index in this.clientIDs) {
			if (index == skip) continue

			this.send(this.peers[this.clientIDs[index]], data, client)
		}

		this.log('Forwarding', data)
	}

	/**
	 * @returns {DataConnection[]} Array of all the connections.
	 */
	get clients() {
		const ret = []

		for(const id of this.clientIDs) {
			if(this.peers[id])
				ret.push(this.peers[id])
		}

		return ret
	}
}
