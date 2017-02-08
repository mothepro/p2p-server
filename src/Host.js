import Peer from 'peerjs'
import Client from './Client'

export default class Host extends Client {
	/**
	 * Creates the Peer.
	 * @param version {string} version of top package, to make sure host and client are in sync.
	 * @param hostID {string} ID to use as the hosting peer.
	 * @param options for the Peer constructor.
	 */
	makePeer({
		version,
		options,
		hostID = Host.randomID(),
	}) {
		/**
		 * Hashmap of all active connection.
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

		this.peer.on('open', id => this.open(id))
		this.peer.on('connection', (c) => this.connection(c, version))
		this.peer.on('close', () => this.disconnect())
		this.peer.on('error', err => this.errHandler(err))
		this.peer.on('destroy', () => this.quit())

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

	/** Remove */
	open(id) {
		this.log('ready')
	}

	/**
	 * Someone attempts to connect to us
	 * @param client {DataConnection}
	 * @param version {string=}
	 */
	connection(client, version = '0') {
		if(client.metadata.version !== version) {
			this.errHandler(Error(`Verision of client "${client.metadata.version}" doesn't match host "${version}".`))
			return
		}

		this.peers[client.id] = client
		this.clientIDs.push(client.id)

		client.on('open', () => this.clientReady(client))
		client.on('data', data => this.recieve(client, data))
		client.on('close', () => this.clientLeft(client))
		client.on('error', err => this.errHandler(err))

		this.log('Connection from', client.id)
	}

	/**
	 * Emitted when the connection is ready to use.
	 * @param {DataConnection} client
	 */
	clientReady(client) {
		this.log('listening to', client.id)
	}

	/**
	 * Receive data from a client
	 * @param client {DataConnection}
	 * @param data
	 */
	receive(client, data) {
		this.log('receiving', client.id, data)
	}

	/**
	 * Send data to someone
	 * @param {DataConnection} peer
	 * @param data
	 * @param {DataConnection=} from the client which actually sent the message
	 * @private
	 */
	send(peer, data, from = null) {
		if(from == null)
			from = peer

		peer.send({
			data,
			from: from.id,
		})
	}

	/**
	 * Send to all connections.
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
	 * A client has left the game.
	 */
	clientLeft(client) {
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
